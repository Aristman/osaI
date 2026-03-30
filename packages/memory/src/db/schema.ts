/**
 * @osai/memory -- SQLite Schema for Memory Entries (T-005)
 *
 * SQL statements for three-tier memory tables:
 *   - memory_entries  -- unified memory store (long-term primary)
 *   - chat_memory     -- chat-scoped memory (deleted with chat)
 *   - session_memory  -- session-scoped memory (deleted with session)
 *
 * All queries use parameterized placeholders (?).
 * Uses CREATE TABLE IF NOT EXISTS for idempotency.
 */

/** Migration version for memory schema */
export const MEMORY_MIGRATION_VERSION = 2;

/** Names of all memory tables */
export const MEMORY_TABLE_NAMES = [
  'memory_entries',
  'chat_memory',
  'session_memory',
] as const;

/**
 * SQL for creating memory tables and indexes.
 *
 * memory_entries: unified table for all memory tiers.
 *   - tier 'chat' entries are scoped to a chat_id
 *   - tier 'session' entries are scoped to a session_id
 *   - tier 'long-term' entries are shared across chats
 *
 * chat_memory: materialized view-like table for fast chat-scoped queries.
 * session_memory: materialized view-like table for fast session-scoped queries.
 */
export const MEMORY_SCHEMA_SQL = `
-- memory_entries: unified memory store for all tiers
CREATE TABLE IF NOT EXISTS memory_entries (
  id              TEXT PRIMARY KEY,
  content         TEXT NOT NULL,
  tier            TEXT NOT NULL CHECK(tier IN ('chat', 'session', 'long-term')),
  chat_id         TEXT DEFAULT NULL,
  session_id      TEXT DEFAULT NULL,
  tags            TEXT DEFAULT '[]',
  metadata        TEXT DEFAULT '{}',
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- chat_memory: chat-scoped memory entries (deleted with chat)
CREATE TABLE IF NOT EXISTS chat_memory (
  id              TEXT PRIMARY KEY,
  entry_id        TEXT NOT NULL,
  chat_id         TEXT NOT NULL,
  content         TEXT NOT NULL,
  tags            TEXT DEFAULT '[]',
  metadata        TEXT DEFAULT '{}',
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (entry_id) REFERENCES memory_entries(id) ON DELETE CASCADE
);

-- session_memory: session-scoped memory entries (deleted with session)
CREATE TABLE IF NOT EXISTS session_memory (
  id              TEXT PRIMARY KEY,
  entry_id        TEXT NOT NULL,
  session_id      TEXT NOT NULL,
  content         TEXT NOT NULL,
  tags            TEXT DEFAULT '[]',
  metadata        TEXT DEFAULT '{}',
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (entry_id) REFERENCES memory_entries(id) ON DELETE CASCADE
);

-- Indexes for query performance
CREATE INDEX IF NOT EXISTS idx_memory_entries_tier
  ON memory_entries(tier);

CREATE INDEX IF NOT EXISTS idx_memory_entries_chat_id
  ON memory_entries(chat_id);

CREATE INDEX IF NOT EXISTS idx_memory_entries_session_id
  ON memory_entries(session_id);

CREATE INDEX IF NOT EXISTS idx_memory_entries_created_at
  ON memory_entries(created_at);

CREATE INDEX IF NOT EXISTS idx_chat_memory_chat_id
  ON chat_memory(chat_id);

CREATE INDEX IF NOT EXISTS idx_chat_memory_entry_id
  ON chat_memory(entry_id);

CREATE INDEX IF NOT EXISTS idx_session_memory_session_id
  ON session_memory(session_id);

CREATE INDEX IF NOT EXISTS idx_session_memory_entry_id
  ON session_memory(entry_id);
`;
