/**
 * @osai/knowledge-base -- SQLite Schema for Knowledge Base (T-003)
 *
 * SQL statements for knowledge base tables:
 *   - knowledge_documents  -- document metadata and status tracking
 *   - knowledge_chunks     -- document chunks for embedding and search
 *
 * All queries use parameterized placeholders (?).
 * Uses CREATE TABLE IF NOT EXISTS for idempotency.
 * Uses FOREIGN KEY ON DELETE CASCADE for automatic chunk cleanup.
 */

/** Migration version for knowledge base schema */
export const KB_SCHEMA_VERSION = 1;

/** Names of all knowledge base tables */
export const KB_TABLE_NAMES = [
  'knowledge_documents',
  'knowledge_chunks',
] as const;

/**
 * SQL for creating knowledge base tables and indexes.
 *
 * knowledge_documents: stores document metadata, format, status, and tags.
 *   - path is UNIQUE to prevent duplicate ingestion of same file.
 *   - tags stored as JSON array TEXT.
 *   - created_at/updated_at as INTEGER (Unix timestamp).
 *
 * knowledge_chunks: stores document chunks for embedding and search.
 *   - document_id FK references knowledge_documents(id).
 *   - ON DELETE CASCADE ensures chunks are removed when document is deleted.
 */
export const KB_SCHEMA_SQL = `
-- knowledge_documents: document metadata and status tracking
CREATE TABLE IF NOT EXISTS knowledge_documents (
  id              TEXT PRIMARY KEY,
  title           TEXT NOT NULL,
  path            TEXT UNIQUE NOT NULL,
  format          TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pending',
  chunks_count    INTEGER NOT NULL DEFAULT 0,
  total_size      INTEGER NOT NULL DEFAULT 0,
  tags            TEXT DEFAULT '[]',
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL,
  checksum        TEXT
);

-- knowledge_chunks: document chunks for embedding and search
CREATE TABLE IF NOT EXISTS knowledge_chunks (
  id              TEXT PRIMARY KEY,
  document_id     TEXT NOT NULL,
  content         TEXT NOT NULL,
  chunk_index     INTEGER NOT NULL,
  created_at      INTEGER NOT NULL,
  FOREIGN KEY (document_id) REFERENCES knowledge_documents(id) ON DELETE CASCADE
);

-- Indexes for query performance
CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_document_id
  ON knowledge_chunks(document_id);

CREATE INDEX IF NOT EXISTS idx_knowledge_documents_format
  ON knowledge_documents(format);

CREATE INDEX IF NOT EXISTS idx_knowledge_documents_status
  ON knowledge_documents(status);
`;
