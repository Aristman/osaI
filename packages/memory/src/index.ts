/**
 * @osai/memory -- Memory System (DOMAIN-004)
 *
 * Three-tier memory: Chat Memory, Session Memory, Long-term Memory.
 * RAG pipeline, embeddings, context window management, fact extraction.
 */

export {
  // Memory core types
  type MemoryEntry,
  MemoryCategory,
  MemoryTier,
  // Embedding types
  type EmbeddingProviderConfig,
  type EmbeddingResult,
  type EmbeddingProviderType,
  EMBEDDING_DEFAULTS,
  // RAG types
  type RAGQuery,
  type RAGResult,
  type RAGConfig,
  RAG_DEFAULTS,
  // Context window types
  type ContextWindowConfig,
  type PruningResult,
  type ContextResult,
  type ContextEntry,
  type Summarizer,
  PruningPriority,
  CONTEXT_DEFAULTS,
  // Vector storage types
  type VectorStorageConfig,
  type SearchResult,
  type DistanceMetric,
  VECTOR_STORAGE_DEFAULTS,
} from './types/index.js';

// Embedding providers
export type { EmbeddingProvider } from './embeddings/embedding-provider.js';
export { NoProviderAvailableError, EmbeddingProviderError } from './embeddings/embedding-provider.js';
export { OllamaEmbeddingProvider } from './embeddings/ollama-provider.js';
export type { OllamaProviderOptions } from './embeddings/ollama-provider.js';
export { EmbeddingFallbackChain } from './embeddings/fallback-chain.js';

// Vector storage
export type { VectorStorage } from './vector-storage/vector-storage.js';
export { SqliteVecStorage } from './vector-storage/sqlite-vec-storage.js';
export { InMemoryVectorStorage, cosineSimilarity } from './vector-storage/in-memory-vector-storage.js';
export { createVectorStorage } from './vector-storage/factory.js';
export type { VectorStorageResult, CreateVectorStorageOptions } from './vector-storage/factory.js';

// RAG pipeline
export { RAGPipeline, RAGError } from './rag/rag-pipeline.js';
export type { RAGQueryOptions } from './rag/rag-pipeline.js';
export { createRAGConfig } from './rag/rag-config.js';

// Memory manager
export { MemoryManager, MemoryManagerError } from './memory/memory-manager.js';

// Context window manager
export { ContextWindowManager } from './context/context-window-manager.js';
export type { ContextWindowManagerOptions } from './context/context-window-manager.js';
export { estimateTokens } from './context/token-counter.js';
export { pruneByPriority } from './context/pruning.js';

// Fact extraction
export { FactExtractor } from './facts/fact-extractor.js';

// Memory service (facade)
export { MemoryService } from './memory-service.js';
export type { MemoryServiceInitOptions, MemoryQueryOptions } from './memory-service.js';
