/**
 * @osai/agent -- SessionRepository
 *
 * SQLite-backed session and message persistence using better-sqlite3.
 * WAL mode is enabled for reliability. Foreign keys are enforced.
 */

import type BetterSqlite3 from 'better-sqlite3';
import type { AgentMessage, SessionState } from '../types.js';
import { SessionNotFoundError } from './errors.js';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface SessionRecord {
  id: string;
  state: SessionState;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  metadata: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// SQL schema
// ---------------------------------------------------------------------------

const SCHEMA = `
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  state TEXT NOT NULL DEFAULT 'idle',
  metadata TEXT DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  timestamp TEXT NOT NULL,
  metadata TEXT DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id);
`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function serializeMetadata(metadata?: Record<string, unknown>): string {
  return JSON.stringify(metadata ?? {});
}

function parseMetadata(raw: string | null): Record<string, unknown> {
  if (raw === null || raw === undefined) return {};
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function toIsoString(date: Date): string {
  return date.toISOString();
}

function fromDateIso(raw: string): Date {
  return new Date(raw);
}

// ---------------------------------------------------------------------------
// SessionRepository
// ---------------------------------------------------------------------------

export class SessionRepository {
  private readonly db: BetterSqlite3.Database;

  /**
   * @param dbPath  SQLite file path. When omitted an in-memory database is used.
   */
  constructor(dbPath?: string) {
    // Dynamic import is required because better-sqlite3 is a native C++ addon
    // that may not resolve at the top level in all bundler scenarios.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const DatabaseConstructor = require('better-sqlite3') as typeof BetterSqlite3;
    this.db = new DatabaseConstructor(dbPath ?? ':memory:');

    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');

    this.db.exec(SCHEMA);
  }

  // -----------------------------------------------------------------------
  // Lifecycle
  // -----------------------------------------------------------------------

  /** Close the underlying database connection. */
  public close(): void {
    this.db.close();
  }

  // -----------------------------------------------------------------------
  // Sessions
  // -----------------------------------------------------------------------

  public saveSession(
    id: string,
    state: SessionState,
    metadata?: Record<string, unknown>,
  ): void {
    const stmt = this.db.prepare(`
      INSERT INTO sessions (id, state, metadata, created_at, updated_at)
      VALUES (?, ?, ?, datetime('now'), datetime('now'))
      ON CONFLICT(id) DO UPDATE SET
        state   = excluded.state,
        metadata = excluded.metadata,
        updated_at = datetime('now')
    `);

    stmt.run(id, state, serializeMetadata(metadata));
  }

  public loadSession(id: string): SessionRecord | undefined {
    const row = this.db
      .prepare('SELECT * FROM sessions WHERE id = ?')
      .get(id) as
      | { id: string; state: string; metadata: string; created_at: string; updated_at: string }
      | undefined;

    if (row === undefined) return undefined;

    const messageCount = this.getMessageCount(id);

    return {
      id: row.id,
      state: row.state as SessionState,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      messageCount,
      metadata: parseMetadata(row.metadata),
    };
  }

  public listSessions(): SessionRecord[] {
    const rows = this.db
      .prepare('SELECT * FROM sessions ORDER BY updated_at DESC')
      .all() as Array<{
      id: string;
      state: string;
      metadata: string;
      created_at: string;
      updated_at: string;
    }>;

    return rows.map((row) => ({
      id: row.id,
      state: row.state as SessionState,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      messageCount: this.getMessageCount(row.id),
      metadata: parseMetadata(row.metadata),
    }));
  }

  public deleteSession(id: string): boolean {
    const result = this.db.prepare('DELETE FROM sessions WHERE id = ?').run(id);
    return result.changes > 0;
  }

  public updateSessionState(id: string, state: SessionState): boolean {
    const existing = this.db
      .prepare('SELECT 1 FROM sessions WHERE id = ?')
      .get(id);

    if (existing === undefined) return false;

    this.db
      .prepare('UPDATE sessions SET state = ?, updated_at = datetime(\'now\') WHERE id = ?')
      .run(state, id);

    return true;
  }

  // -----------------------------------------------------------------------
  // Messages
  // -----------------------------------------------------------------------

  public saveMessage(sessionId: string, message: AgentMessage): void {
    const checkSession = this.db
      .prepare('SELECT 1 FROM sessions WHERE id = ?')
      .get(sessionId);

    if (checkSession === undefined) {
      throw new SessionNotFoundError(sessionId);
    }

    this.db
      .prepare(
        'INSERT INTO messages (id, session_id, role, content, timestamp, metadata) VALUES (?, ?, ?, ?, ?, ?)',
      )
      .run(
        message.id,
        sessionId,
        message.role,
        message.content,
        toIsoString(message.timestamp),
        serializeMetadata(message.metadata),
      );
  }

  public getMessages(
    sessionId: string,
    limit?: number,
    offset?: number,
  ): AgentMessage[] {
    // Validate session exists
    const session = this.db
      .prepare('SELECT 1 FROM sessions WHERE id = ?')
      .get(sessionId);

    if (session === undefined) {
      throw new SessionNotFoundError(sessionId);
    }

    let sql = 'SELECT * FROM messages WHERE session_id = ? ORDER BY timestamp ASC';
    const params: unknown[] = [sessionId];

    if (limit !== undefined) {
      sql += ' LIMIT ?';
      params.push(limit);
    } else if (offset !== undefined) {
      // SQLite requires LIMIT when using OFFSET
      sql += ' LIMIT -1';
    }
    if (offset !== undefined) {
      sql += ' OFFSET ?';
      params.push(offset);
    }

    const rows = this.db.prepare(sql).all(...params) as Array<{
      id: string;
      session_id: string;
      role: string;
      content: string;
      timestamp: string;
      metadata: string;
    }>;

    return rows.map((row) => ({
      id: row.id,
      role: row.role as AgentMessage['role'],
      content: row.content,
      timestamp: fromDateIso(row.timestamp),
      metadata: parseMetadata(row.metadata),
    }));
  }

  public deleteMessages(sessionId: string): boolean {
    // Validate session exists
    const session = this.db
      .prepare('SELECT 1 FROM sessions WHERE id = ?')
      .get(sessionId);

    if (session === undefined) {
      throw new SessionNotFoundError(sessionId);
    }

    const result = this.db
      .prepare('DELETE FROM messages WHERE session_id = ?')
      .run(sessionId);

    return result.changes > 0;
  }

  public getMessageCount(sessionId: string): number {
    const row = this.db
      .prepare('SELECT COUNT(*) as cnt FROM messages WHERE session_id = ?')
      .get(sessionId) as { cnt: number } | undefined;

    return row?.cnt ?? 0;
  }

  // -----------------------------------------------------------------------
  // Utility
  // -----------------------------------------------------------------------

  public sessionExists(id: string): boolean {
    const row = this.db
      .prepare('SELECT 1 FROM sessions WHERE id = ?')
      .get(id);

    return row !== undefined;
  }
}
