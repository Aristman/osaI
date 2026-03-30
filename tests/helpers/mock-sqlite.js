/**
 * Create an in-memory SQLite database for testing.
 *
 * The database is fully isolated -- no data persists between calls.
 * Use this factory in beforeEach hooks to get a fresh DB per test.
 *
 * @param options - Configuration options
 * @returns Database instance (caller is responsible for closing)
 *
 * @example
 * ```ts
 * import { createMockDb } from "../../tests/helpers/mock-sqlite.js";
 * import Database from "better-sqlite3";
 *
 * let db: Database.Database;
 *
 * beforeEach(() => {
 *   db = createMockDb({
 *     initSql: [
 *       `CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)`,
 *     ],
 *   });
 * });
 *
 * afterEach(() => {
 *   db.close();
 * });
 * ```
 */
export function createMockDb(options = {}) {
    // Dynamic import to avoid hard dependency at module level
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const DatabaseConstructor = require("better-sqlite3");
    const db = new DatabaseConstructor(":memory:");
    const { wal = true, foreignKeys = true, initSql = [] } = options;
    if (wal) {
        db.pragma("journal_mode = WAL");
    }
    if (foreignKeys) {
        db.pragma("foreign_keys = ON");
    }
    for (const sql of initSql) {
        db.exec(sql);
    }
    return db;
}
/**
 * Apply the osaI schema to a mock database.
 * This is a convenience function that runs the core schema DDL.
 *
 * @param db - Database instance to apply schema to
 */
export function applyOmaiCoreSchema(db) {
    db.exec(`
    CREATE TABLE IF NOT EXISTS chats (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      tags TEXT DEFAULT '[]',
      icon TEXT,
      color TEXT,
      channel TEXT NOT NULL,
      channel_metadata TEXT DEFAULT '{}',
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS chat_messages (
      id TEXT PRIMARY KEY,
      chat_id TEXT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      tool_calls TEXT,
      metadata TEXT DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_chat_messages_chat_id
      ON chat_messages(chat_id);

    CREATE TABLE IF NOT EXISTS audit_log (
      id TEXT PRIMARY KEY,
      session_id TEXT,
      chat_id TEXT,
      timestamp TEXT NOT NULL DEFAULT (datetime('now')),
      trace_id TEXT,
      action TEXT NOT NULL,
      tool_name TEXT,
      skill_name TEXT,
      params TEXT,
      result TEXT,
      user_decision TEXT,
      risk_level TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_audit_log_timestamp
      ON audit_log(timestamp);
  `);
}
//# sourceMappingURL=mock-sqlite.js.map