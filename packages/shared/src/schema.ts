/**
 * @osai/shared -- SQL Schema Definitions (T-005)
 *
 * SQL statements for core tables used across osaI domains.
 * All queries use parameterized placeholders (?).
 *
 * Tables:
 *   - chats          -- chat metadata (DOMAIN-001: Gateway)
 *   - chat_messages  -- message history (DOMAIN-001: Gateway)
 *   - sessions       -- agent sessions (DOMAIN-002: Agent Runtime)
 *   - osai_audit_log -- audit trail (DOMAIN-010: Observability)
 */

/** Migration version for initial core schema */
export const MIGRATION_VERSION_001 = 1;

/** Names of all core tables created in migration 001 */
export const CORE_TABLE_NAMES = [
  'chats',
  'chat_messages',
  'sessions',
  'osai_audit_log',
] as const;

/**
 * SQL for migration 001: Create core tables and indexes.
 *
 * Uses CREATE TABLE IF NOT EXISTS for idempotency.
 * All foreign keys reference chats.id.
 * Timestamps use ISO 8601 text format (default: current_timestamp).
 */
export const MIGRATION_001_CREATE_CORE_TABLES = `
-- chats: top-level chat metadata
CREATE TABLE IF NOT EXISTS chats (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  description     TEXT DEFAULT '',
  tags            TEXT DEFAULT '[]',
  icon            TEXT DEFAULT '',
  color           TEXT DEFAULT '',
  channel         TEXT NOT NULL DEFAULT 'cli',
  channel_metadata TEXT DEFAULT '{}',
  is_active       INTEGER NOT NULL DEFAULT 1,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- chat_messages: message history per chat
CREATE TABLE IF NOT EXISTS chat_messages (
  id              TEXT PRIMARY KEY,
  chat_id         TEXT NOT NULL,
  role            TEXT NOT NULL CHECK(role IN ('system', 'user', 'assistant', 'tool')),
  content         TEXT NOT NULL DEFAULT '',
  tool_calls      TEXT DEFAULT NULL,
  metadata        TEXT DEFAULT '{}',
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE CASCADE
);

-- sessions: agent runtime sessions linked to chats
CREATE TABLE IF NOT EXISTS sessions (
  id              TEXT PRIMARY KEY,
  chat_id         TEXT NOT NULL,
  title           TEXT DEFAULT '',
  status          TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'closed', 'archived')),
  model_provider  TEXT DEFAULT '',
  model_name      TEXT DEFAULT '',
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE CASCADE
);

-- osai_audit_log: audit trail for all actions
CREATE TABLE IF NOT EXISTS osai_audit_log (
  id              TEXT PRIMARY KEY,
  session_id      TEXT DEFAULT NULL,
  chat_id         TEXT DEFAULT NULL,
  timestamp       TEXT NOT NULL DEFAULT (datetime('now')),
  trace_id        TEXT DEFAULT NULL,
  action          TEXT NOT NULL,
  tool_name       TEXT DEFAULT NULL,
  skill_name      TEXT DEFAULT NULL,
  params          TEXT DEFAULT '{}',
  result          TEXT DEFAULT NULL,
  user_decision   TEXT DEFAULT NULL,
  risk_level      TEXT DEFAULT 'low' CHECK(risk_level IN ('low', 'medium', 'high', 'critical'))
);

-- Indexes for query performance
CREATE INDEX IF NOT EXISTS idx_chat_messages_chat_id_created_at
  ON chat_messages(chat_id, created_at);

CREATE INDEX IF NOT EXISTS idx_chat_messages_chat_id
  ON chat_messages(chat_id);

CREATE INDEX IF NOT EXISTS idx_sessions_chat_id
  ON sessions(chat_id);

CREATE INDEX IF NOT EXISTS idx_sessions_status
  ON sessions(status);

CREATE INDEX IF NOT EXISTS idx_audit_log_timestamp
  ON osai_audit_log(timestamp);

CREATE INDEX IF NOT EXISTS idx_audit_log_trace_id
  ON osai_audit_log(trace_id);

CREATE INDEX IF NOT EXISTS idx_audit_log_session_id
  ON osai_audit_log(session_id);
`;
