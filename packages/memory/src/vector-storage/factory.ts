/**
 * @osai/memory -- VectorStorage factory
 *
 * Creates the appropriate VectorStorage implementation.
 * Tries SqliteVecStorage first, falls back to InMemoryVectorStorage
 * if sqlite-vec extension is unavailable.
 *
 * This handles the Windows compatibility issue (R-ARCH-01)
 * where sqlite-vec may not work with better-sqlite3.
 */

import type { VectorStorage } from './vector-storage.js';
import type { VectorStorageConfig } from '../types/vector-storage.js';
import { SqliteVecStorage } from './sqlite-vec-storage.js';
import { InMemoryVectorStorage } from './in-memory-vector-storage.js';

/** Result of createVectorStorage -- includes which backend was selected. */
export interface VectorStorageResult {
  storage: VectorStorage;
  backend: 'sqlite-vec' | 'in-memory';
}

/**
 * Options for vector storage creation.
 */
export interface CreateVectorStorageOptions {
  /** SQLite database path (default: ':memory:'). */
  dbPath?: string;
  /** Name of the virtual table (default: 'memory_vectors'). */
  tableName?: string;
  /** Vector dimensions (default: 768). */
  dimensions?: number;
  /** Force a specific backend (default: auto-detect). */
  forceBackend?: 'sqlite-vec' | 'in-memory';
}

/**
 * Create a VectorStorage instance with automatic backend selection.
 *
 * Strategy:
 * 1. If forceBackend is specified, use that backend
 * 2. Try SqliteVecStorage -- if sqlite-vec extension loads, use it
 * 3. On failure, fall back to InMemoryVectorStorage
 *
 * @param options Creation options
 * @returns VectorStorageResult with storage instance and backend type
 */
export function createVectorStorage(
  options: CreateVectorStorageOptions = {},
): VectorStorageResult {
  const dimensions = options.dimensions ?? 768;

  // Force specific backend if requested
  if (options.forceBackend === 'in-memory') {
    const storage = new InMemoryVectorStorage(dimensions);
    storage.init();
    return { storage, backend: 'in-memory' };
  }

  if (options.forceBackend === 'sqlite-vec') {
    const config: VectorStorageConfig = {
      dbPath: options.dbPath ?? ':memory:',
      tableName: options.tableName ?? 'memory_vectors',
      dimensions,
      distanceMetric: 'cosine',
    };
    const storage = new SqliteVecStorage(config);
    storage.init();
    return { storage, backend: 'sqlite-vec' };
  }

  // Auto-detect: try sqlite-vec, fallback to in-memory
  try {
    const config: VectorStorageConfig = {
      dbPath: options.dbPath ?? ':memory:',
      tableName: options.tableName ?? 'memory_vectors',
      dimensions,
      distanceMetric: 'cosine',
    };
    const storage = new SqliteVecStorage(config);
    storage.init();
    return { storage, backend: 'sqlite-vec' };
  } catch {
    // sqlite-vec not available, use in-memory fallback
    const storage = new InMemoryVectorStorage(dimensions);
    storage.init();
    return { storage, backend: 'in-memory' };
  }
}
