/**
 * Barrel export for all memory system types.
 */

// Memory core types
export {
  type MemoryEntry,
  MemoryCategory,
  MemoryTier,
} from './memory.js';

// Embedding types
export {
  type EmbeddingProviderConfig,
  type EmbeddingResult,
  type EmbeddingProviderType,
  EMBEDDING_DEFAULTS,
} from './embeddings.js';

// RAG types
export {
  type RAGQuery,
  type RAGResult,
  type RAGConfig,
  RAG_DEFAULTS,
} from './rag.js';

// Context window types
export {
  type ContextWindowConfig,
  type PruningResult,
  type ContextResult,
  type ContextEntry,
  type Summarizer,
  PruningPriority,
  CONTEXT_DEFAULTS,
} from './context.js';

// Vector storage types
export {
  type VectorStorageConfig,
  type SearchResult,
  type DistanceMetric,
  VECTOR_STORAGE_DEFAULTS,
} from './vector-storage.js';
