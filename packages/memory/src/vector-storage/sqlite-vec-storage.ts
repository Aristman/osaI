/**
 * @osai/memory -- SqliteVecStorage
 *
 * Vector storage implementation backed by sqlite-vec extension for SQLite.
 * Uses sqlite3_vec virtual tables for vector similarity search.
 *
 * Notes:
 *   - sqlite-vec uses its own distance function (vec_distance_cosine)
 *   - Stores vectors as blob in F32 format (little-endian)
 *   - Metadata stored as JSON text column
 *   - Graceful degradation: init() throws descriptive error if extension unavailable
 */

import type { VectorStorage } from './vector-storage.js';
import type {
  VectorStorageConfig,
  SearchResult,
} from '../types/vector-storage.js';

/** Float32 vector serialization helpers. */
const VECTOR_CODEC = {
  /** Encode number[] to Float32Array buffer for sqlite-vec. */
  encode(vector: number[]): Buffer {
    const f32 = new Float32Array(vector);
    return Buffer.from(f32.buffer, f32.byteOffset, f32.byteLength);
  },

  /** Decode sqlite-vec blob buffer to number[]. */
  decode(buffer: Buffer): number[] {
    const f32 = new Float32Array(
      buffer.buffer,
      buffer.byteOffset,
      buffer.byteLength / Float32Array.BYTES_PER_ELEMENT,
    );
    return Array.from(f32);
  },
} as const;

/**
 * SqliteVecStorage -- sqlite-vec backed vector storage.
 *
 * Requires better-sqlite3 and sqlite-vec extension loaded.
 * Use createVectorStorage() factory for automatic fallback to InMemoryVectorStorage.
 */
export class SqliteVecStorage implements VectorStorage {
  private db: import('better-sqlite3').Database | null = null;
  private readonly config: VectorStorageConfig;
  private initialized = false;

  constructor(config: Partial<VectorStorageConfig> = {}) {
    this.config = {
      ...{
        dbPath: ':memory:',
        tableName: 'memory_vectors',
        dimensions: 768,
        distanceMetric: 'cosine',
      },
      ...config,
    };
  }

  /**
   * Initialize storage: create database connection, load sqlite-vec extension,
   * create virtual table.
   *
   * @throws Error if sqlite-vec extension cannot be loaded
   */
  init(): void {
    if (this.initialized) {
      return;
    }

    // Dynamic require for better-sqlite3 (ESM compatible)
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const DatabaseConstructor = require('better-sqlite3') as typeof import('better-sqlite3');
    this.db = new DatabaseConstructor(this.config.dbPath);

    try {
      // Try to load sqlite-vec extension
      this.db.loadExtension('sqlite3_vec');
    } catch (loadError) {
      this.db.close();
      this.db = null;
      throw new Error(
        `Failed to load sqlite-vec extension: ${loadError instanceof Error ? loadError.message : String(loadError)}. ` +
        `Use InMemoryVectorStorage as fallback.`,
      );
    }

    // Create virtual table using sqlite-vec syntax
    // vec0 virtual table with cosine distance metric
    this.db!.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS ${escapeIdentifier(this.config.tableName)}
      USING vec0(
        id TEXT PRIMARY KEY,
        embedding float[${this.config.dimensions}] distance_metric=cosine
      );
    `);

    // Auxiliary table for metadata
    const metaTable = `${this.config.tableName}_meta`;
    this.db!.exec(`
      CREATE TABLE IF NOT EXISTS ${escapeIdentifier(metaTable)} (
        id TEXT PRIMARY KEY,
        metadata TEXT NOT NULL DEFAULT '{}',
        FOREIGN KEY (id) REFERENCES ${escapeIdentifier(this.config.tableName)}(id) ON DELETE CASCADE
      );
    `);

    this.initialized = true;
  }

  /**
   * Insert or update a vector with metadata.
   * sqlite-vec uses INSERT OR REPLACE for upsert semantics.
   */
  upsert(
    id: string,
    vector: number[],
    metadata: Record<string, string | number | boolean>,
  ): void {
    this.ensureInitialized();

    // Validate dimensions
    if (vector.length !== this.config.dimensions) {
      throw new Error(
        `Vector dimension mismatch: expected ${this.config.dimensions}, got ${vector.length}`,
      );
    }

    const blob = VECTOR_CODEC.encode(vector);
    const metaTable = `${this.config.tableName}_meta`;
    const metadataJson = JSON.stringify(metadata);

    // Upsert into vec0 virtual table
    this.db!.prepare(
      `INSERT OR REPLACE INTO ${escapeIdentifier(this.config.tableName)}(id, embedding) VALUES (?, ?)`,
    ).run(id, blob);

    // Upsert metadata
    this.db!.prepare(
      `INSERT OR REPLACE INTO ${escapeIdentifier(metaTable)}(id, metadata) VALUES (?, ?)`,
    ).run(id, metadataJson);
  }

  /**
   * Delete a vector entry by ID.
   */
  delete(id: string): void {
    this.ensureInitialized();

    const metaTable = `${this.config.tableName}_meta`;
    this.db!.prepare(
      `DELETE FROM ${escapeIdentifier(this.config.tableName)} WHERE id = ?`,
    ).run(id);
    this.db!.prepare(
      `DELETE FROM ${escapeIdentifier(metaTable)} WHERE id = ?`,
    ).run(id);
  }

  /**
   * Search for similar vectors using cosine similarity.
   *
   * sqlite-vec vec_distance_cosine returns cosine distance (0 = identical, 2 = opposite).
   * We convert to similarity: similarity = 1 - distance.
   */
  search(
    queryVector: number[],
    topK: number,
    minSimilarity: number,
  ): SearchResult[] {
    this.ensureInitialized();

    if (queryVector.length !== this.config.dimensions) {
      throw new Error(
        `Query vector dimension mismatch: expected ${this.config.dimensions}, got ${queryVector.length}`,
      );
    }

    const blob = VECTOR_CODEC.encode(queryVector);
    const metaTable = `${this.config.tableName}_meta`;

    // sqlite-vec query: KNN search with vec_distance_cosine
    // Returns rows ordered by distance ascending (most similar first)
    const rows = this.db!.prepare(
      `SELECT
        v.id,
        vec_distance_cosine(v.embedding, ?) as distance
      FROM ${escapeIdentifier(this.config.tableName)} v
      ORDER BY distance
      LIMIT ?`,
    ).all(blob, topK) as Array<{ id: string; distance: number }>;

    const results: SearchResult[] = [];

    for (const row of rows) {
      // Convert cosine distance to similarity: similarity = 1 - distance
      const similarity = 1 - row.distance;

      if (similarity < minSimilarity) {
        continue;
      }

      // Fetch metadata
      const metaRow = this.db!.prepare(
        `SELECT metadata FROM ${escapeIdentifier(metaTable)} WHERE id = ?`,
      ).get(row.id) as { metadata: string } | undefined;

      results.push({
        id: row.id,
        score: similarity,
        metadata: metaRow ? JSON.parse(metaRow.metadata) : {},
      });
    }

    return results;
  }

  /**
   * Close the database connection and release resources.
   */
  close(): void {
    if (this.db !== null) {
      this.db.close();
      this.db = null;
      this.initialized = false;
    }
  }

  private ensureInitialized(): void {
    if (!this.initialized || this.db === null) {
      throw new Error('SqliteVecStorage not initialized. Call init() first.');
    }
  }
}

/**
 * Escape a SQL identifier to prevent injection.
 * Only allows alphanumeric characters and underscores.
 */
function escapeIdentifier(name: string): string {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
    throw new Error(`Invalid table identifier: ${name}`);
  }
  return name;
}
