/**
 * @osai/memory -- InMemoryVectorStorage
 *
 * Fallback vector storage implementation using in-process brute-force
 * cosine similarity search. Stores vectors in a Map.
 *
 * Suitable for:
 *   - Unit testing
 *   - Environments where sqlite-vec is unavailable (e.g., Windows)
 *   - Small datasets (< 10K vectors)
 *
 * Cosine similarity formula: dot(a, b) / (norm(a) * norm(b))
 */

import type { VectorStorage } from './vector-storage.js';
import type { SearchResult } from '../types/vector-storage.js';

/** Stored vector entry. */
interface VectorEntry {
  vector: number[];
  metadata: Record<string, string | number | boolean>;
}

/**
 * InMemoryVectorStorage -- brute-force cosine similarity vector search.
 *
 * All operations are synchronous. No persistence -- data is lost on process exit.
 */
export class InMemoryVectorStorage implements VectorStorage {
  private readonly store = new Map<string, VectorEntry>();
  private readonly dimensions: number;
  private initialized = false;

  constructor(dimensions: number = 768) {
    this.dimensions = dimensions;
  }

  /**
   * Initialize storage. No-op for in-memory implementation (idempotent).
   */
  init(): void {
    this.initialized = true;
  }

  /**
   * Insert or update a vector entry.
   */
  upsert(
    id: string,
    vector: number[],
    metadata: Record<string, string | number | boolean>,
  ): void {
    this.ensureInitialized();

    if (vector.length !== this.dimensions) {
      throw new Error(
        `Vector dimension mismatch: expected ${this.dimensions}, got ${vector.length}`,
      );
    }

    this.store.set(id, { vector, metadata });
  }

  /**
   * Delete a vector entry by ID.
   */
  delete(id: string): void {
    this.ensureInitialized();
    this.store.delete(id);
  }

  /**
   * Search for similar vectors using brute-force cosine similarity.
   *
   * Time complexity: O(n * d) where n = number of vectors, d = dimensions.
   *
   * @param queryVector  Query embedding vector
   * @param topK         Maximum results
   * @param minSimilarity Minimum similarity threshold (0-1)
   * @returns Results sorted by similarity descending
   */
  search(
    queryVector: number[],
    topK: number,
    minSimilarity: number,
  ): SearchResult[] {
    this.ensureInitialized();

    if (queryVector.length !== this.dimensions) {
      throw new Error(
        `Query vector dimension mismatch: expected ${this.dimensions}, got ${queryVector.length}`,
      );
    }

    const results: SearchResult[] = [];

    for (const [id, entry] of this.store) {
      const similarity = cosineSimilarity(queryVector, entry.vector);

      if (similarity >= minSimilarity) {
        results.push({
          id,
          score: similarity,
          metadata: { ...entry.metadata },
        });
      }
    }

    // Sort by similarity descending
    results.sort((a, b) => b.score - a.score);

    // Return top K results
    return results.slice(0, topK);
  }

  /**
   * Clear all stored vectors. Useful for testing.
   */
  clear(): void {
    this.store.clear();
  }

  /**
   * Get the number of stored vectors.
   */
  size(): number {
    return this.store.size;
  }

  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error('InMemoryVectorStorage not initialized. Call init() first.');
    }
  }
}

/**
 * Compute cosine similarity between two vectors.
 *
 * Formula: dot(a, b) / (norm(a) * norm(b))
 *
 * Returns value in range [-1, 1] where:
 *   1.0  = identical direction
 *   0.0  = orthogonal
 *   -1.0 = opposite direction
 *
 * Handles edge cases:
 *   - Zero vectors return 0.0 (not NaN)
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(
      `Vector length mismatch: ${a.length} vs ${b.length}`,
    );
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i]! * b[i]!;
    normA += a[i]! * a[i]!;
    normB += b[i]! * b[i]!;
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);

  // Avoid division by zero for zero vectors
  if (denominator === 0) {
    return 0;
  }

  return dotProduct / denominator;
}
