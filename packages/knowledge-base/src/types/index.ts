/**
 * @osai/knowledge-base -- Types barrel export
 */

// Document types
export {
  DocumentFormat,
  type DocumentFormat as DocumentFormatType,
  DocumentStatus,
  type DocumentStatus as DocumentStatusType,
  type KnowledgeDocument,
  type InsertKnowledgeDocument,
  type UpdateKnowledgeDocument,
  type ListDocumentsFilter,
} from './document.js';

// Chunk types
export {
  type ChunkMetadata,
  type KnowledgeChunk,
  type InsertKnowledgeChunk,
} from './chunk.js';

// Search types
export {
  KB_SEARCH_DEFAULTS_EXPORT as KB_SEARCH_DEFAULTS,
  resolveKBSearchConfig,
  type KBSearchConfig,
  type ResolvedKBSearchConfig,
  type KBSearchQuery,
  type KBSearchResult,
} from './search.js';

// Source types
export {
  type SourceTag,
  type SourceInfo,
} from './source.js';
