/**
 * Types for vector storage abstraction.
 *
 * Vector storage provides similarity search over embedding vectors,
 * backed by sqlite-vec or other implementations.
 */

/** Configuration for the vector storage. */
export interface VectorStorageConfig {
  /** SQLite database path (for sqlite-vec implementation). */
  dbPath: string;
  /** Name of the virtual table for vectors. */
  tableName: string;
  /** Expected vector dimensions (must match embedding provider). */
  dimensions: number;
  /** Distance metric for similarity search. */
  distanceMetric: DistanceMetric;
}

/** Supported distance metrics for vector similarity. */
export type DistanceMetric = 'cosine' | 'l2' | 'dot';

/** A single search result from vector similarity search. */
export interface SearchResult {
  /** Unique identifier of the matching vector entry. */
  id: string;
  /** Similarity score (0 to 1 for cosine, varies for other metrics). */
  score: number;
  /** Associated metadata for the matched entry. */
  metadata: Record<string, string | number | boolean>;
}

/** Default vector storage configuration values. */
export const VECTOR_STORAGE_DEFAULTS: VectorStorageConfig = {
  dbPath: ':memory:',
  tableName: 'memory_vectors',
  dimensions: 768,
  distanceMetric: 'cosine',
} as const;
