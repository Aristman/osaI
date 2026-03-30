/**
 * @osai/knowledge-base -- Ingest module (T-004)
 *
 * Exports for the document ingestion pipeline:
 *   - Chunker: token-aware text splitting
 *   - IngestPipeline: parse -> chunk -> embed -> store
 */

export {
  splitTextIntoChunks,
  estimateTokens,
} from './chunker.js';

export type { Chunk } from './chunker.js';

export {
  IngestPipeline,
  DocumentAlreadyExistsError,
} from './ingest-pipeline.js';

export type {
  IngestResult,
  IngestProgressEvent,
  ChunkEmbeddedEvent,
  DocumentStoredEvent,
} from './ingest-pipeline.js';
