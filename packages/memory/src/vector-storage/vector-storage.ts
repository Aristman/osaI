/**
 * @osai/memory -- VectorStorage interface
 *
 * Abstraction for vector storage backends.
 * Implementations: SqliteVecStorage, InMemoryVectorStorage.
 */

import type { SearchResult } from '../types/vector-storage.js';

/**
 * VectorStorage -- abstraction for vector similarity search.
 *
 * All implementations must support:
 *   - Upsert vectors with associated metadata
 *   - Delete vectors by ID
 *   - Search for similar vectors using cosine similarity
 *   - Idempotent initialization
 */
export interface VectorStorage {
  /**
   * Initialize the storage (create tables, load extensions, etc.).
   * Must be idempotent -- safe to call multiple times.
   */
  init(): void;

  /**
   * Insert or update a vector entry.
   *
   * @param id      Unique identifier for the vector entry
   * @param vector  Embedding vector (float array)
   * @param metadata Associated key-value metadata
   */
  upsert(
    id: string,
    vector: number[],
    metadata: Record<string, string | number | boolean>,
  ): void;

  /**
   * Delete a vector entry by ID.
   *
   * @param id Unique identifier to delete
   */
  delete(id: string): void;

  /**
   * Search for similar vectors.
   *
   * @param queryVector  The query embedding vector
   * @param topK         Maximum number of results to return
   * @param minSimilarity Minimum similarity score (0-1) to include in results
   * @returns Array of search results sorted by similarity descending
   */
  search(
    queryVector: number[],
    topK: number,
    minSimilarity: number,
  ): SearchResult[];
}
