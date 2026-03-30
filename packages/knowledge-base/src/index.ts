/**
 * @osai/knowledge-base -- Knowledge Base (DOMAIN-005)
 *
 * Document ingestion (chunk + embed), semantic search, source management.
 */

export {
  DocumentFormat,
  type DocumentFormat as DocumentFormatType,
  DocumentStatus,
  type DocumentStatus as DocumentStatusType,
  type KnowledgeDocument,
  type ChunkMetadata,
  type KnowledgeChunk,
  KB_SEARCH_DEFAULTS,
  resolveKBSearchConfig,
  type KBSearchConfig,
  type ResolvedKBSearchConfig,
  type KBSearchQuery,
  type KBSearchResult,
  type SourceTag,
  type SourceInfo,
} from './types/index.js';

// Parsers
export type { DocumentParser, ParsedDocument, ParsedSection } from './parsers/document-parser.js';
export { ParseError, UnsupportedFormatError } from './parsers/document-parser.js';
export { ParserRegistry } from './parsers/parser-registry.js';

// DB
export { KnowledgeRepository } from './db/repository.js';

// Ingest pipeline
export {
  splitTextIntoChunks,
  estimateTokens,
  IngestPipeline,
  DocumentAlreadyExistsError,
} from './ingest/index.js';

export type {
  Chunk,
  IngestResult,
  IngestProgressEvent,
  ChunkEmbeddedEvent,
  DocumentStoredEvent,
} from './ingest/index.js';

// Source management
export {
  SourceManager,
  SourceNotFoundError,
} from './sources/index.js';

export type {
  ListSourcesFilter,
  SourceStats,
} from './sources/index.js';

// Search
export { KBSearch, EmptyQueryError } from './search/index.js';
