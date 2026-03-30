/**
 * Types for embedding providers and embedding results.
 *
 * Embeddings are numeric vectors representing text semantics,
 * used for similarity search in the RAG pipeline.
 */

/** Supported embedding provider identifiers. */
export type EmbeddingProviderType = 'ollama' | 'yandex' | 'onnx';

/** Configuration for an embedding provider instance. */
export interface EmbeddingProviderConfig {
  /** Provider type identifier. */
  provider: EmbeddingProviderType;
  /** URL endpoint for the embedding API (Ollama, Yandex, etc.). */
  endpoint?: string;
  /** Model name to use for embedding generation. */
  model: string;
  /** Expected embedding vector dimensions. */
  dimensions: number;
  /** Request timeout in milliseconds. */
  timeoutMs: number;
}

/** Result of an embedding generation operation. */
export interface EmbeddingResult {
  /** The generated embedding vector. */
  vector: number[];
  /** Number of dimensions in the vector. */
  dimensions: number;
  /** Provider that generated this embedding. */
  provider: EmbeddingProviderType;
  /** Time taken to generate the embedding in milliseconds. */
  durationMs: number;
}

/** Default configuration values for embedding providers. */
export const EMBEDDING_DEFAULTS = {
  /** Default Ollama endpoint. */
  ollamaEndpoint: 'http://127.0.0.1:11434',
  /** Default Ollama embedding model. */
  ollamaModel: 'nomic-embed-text',
  /** Default embedding dimensions for nomic-embed-text. */
  ollamaDimensions: 768,
  /** Default timeout for embedding requests. */
  timeoutMs: 30_000,
} as const;
