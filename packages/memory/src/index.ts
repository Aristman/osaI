/**
 * @osai/memory -- Memory System
 *
 * Short-term memory, long-term memory, RAG pipeline, and embedding provider.
 */

// Types
export type {
  MemoryEntry,
  Fact,
  RagQuery,
  RagResult,
  EmbeddingProvider,
} from './types.js';

// Short-term Memory
export { ShortTermMemory } from './short-term/index.js';

// Long-term Memory
export { LongTermMemory } from './long-term/index.js';

// RAG Pipeline
export { RagPipeline } from './rag/index.js';

// Embedding Provider
export { StubEmbeddingProvider } from './embedding/index.js';

// Memory Manager (Facade)
export { MemoryManager } from './MemoryManager.js';
