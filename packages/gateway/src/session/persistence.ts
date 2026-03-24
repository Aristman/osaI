/**
 * SessionPersistence -- SQLite-based session persistence for osaI Gateway
 *
 * Stores sessions and their messages in a SQLite database using better-sqlite3.
 * Uses WAL mode for better concurrency support.
 */

import type { Database as DatabaseType } from 'better-sqlite3';
import type { SessionType, ActivationMode } from '@osai/types';
import type { Session, SessionData, SessionMessage } from './router.js';

// ---------------------------------------------------------------------------
// Persisted Session Row
// ---------------------------------------------------------------------------

/** Row stored in the sessions table */
export interface SessionRow {
  id: string;
  type: SessionType;
  activation_mode: ActivationMode;
  queue_mode: string;
  state: string;
  wake_word: string | null;
  max_history: number;
  created_at: number;
  updated_at: number;
}

/** Row stored in the session_messages table */
export interface SessionMessageRow {
  id: number;
  session_id: string;
  role: string;
  content: string;
  timestamp: number;
  metadata: string | null;
}

// ---------------------------------------------------------------------------
// SessionPersistence
// ---------------------------------------------------------------------------

/**
 * SessionPersistence provides SQLite-backed storage for sessions and messages.
 *
 * Schema:
 * - sessions: id, type, activation_mode, queue_mode, state, wake_word,
 *             max_history, created_at, updated_at
 * - session_messages: id, session_id, role, content, timestamp, metadata
 */
export class SessionPersistence {
  private db: DatabaseType;

  constructor(db: DatabaseType) {
    this.db = db;
    this.initialize();
  }

  /**
   * Initialize database schema and enable WAL mode.
   */
  private initialize(): void {
    // Enable WAL mode for better concurrency
    this.db.pragma('journal_mode = WAL');

    // Create sessions table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL CHECK(type IN ('main', 'group', 'isolated')),
        activation_mode TEXT NOT NULL DEFAULT 'always'
          CHECK(activation_mode IN ('always', 'mention', 'wake_word', 'passive')),
        queue_mode TEXT NOT NULL DEFAULT 'sequential'
          CHECK(queue_mode IN ('sequential', 'parallel')),
        state TEXT NOT NULL DEFAULT 'idle'
          CHECK(state IN ('idle', 'processing', 'waiting_permission', 'error')),
        wake_word TEXT,
        max_history INTEGER NOT NULL DEFAULT 1000,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `);

    // Create session_messages table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS session_messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system', 'tool')),
        content TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        metadata TEXT,
        FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
      )
    `);

    // Create index for faster message queries by session
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_session_messages_session_id
      ON session_messages(session_id)
    `);
  }

  /**
   * Save a session to the database.
   * Inserts or updates (upsert) the session row and its messages.
   * Uses a transaction to ensure atomicity.
   */
  saveSession(session: Session): void {
    const data = session.toJSON();

    const save = this.db.transaction(() => {
      // Upsert the session row
      this.db.prepare(`
        INSERT INTO sessions (id, type, activation_mode, queue_mode, state, wake_word, max_history, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          type = excluded.type,
          activation_mode = excluded.activation_mode,
          queue_mode = excluded.queue_mode,
          state = excluded.state,
          wake_word = excluded.wake_word,
          max_history = excluded.max_history,
          updated_at = excluded.updated_at
      `).run(
        data.id,
        data.type,
        data.activationMode,
        data.queueMode,
        data.state,
        data.wakeWord ?? null,
        data.maxHistory,
        data.createdAt,
        data.updatedAt,
      );

      // Delete existing messages and re-insert (simple approach for MVP)
      this.db.prepare('DELETE FROM session_messages WHERE session_id = ?').run(data.id);

      const insertMsg = this.db.prepare(`
        INSERT INTO session_messages (session_id, role, content, timestamp, metadata)
        VALUES (?, ?, ?, ?, ?)
      `);

      for (const msg of data.history) {
        const metadata = msg.metadata ? JSON.stringify(msg.metadata) : null;
        insertMsg.run(data.id, msg.role, msg.content, msg.timestamp, metadata);
      }
    });

    save();
  }

  /**
   * Load a session from the database by id.
   * Returns SessionData or undefined if not found.
   */
  loadSession(id: string): SessionData | undefined {
    const row = this.db.prepare('SELECT * FROM sessions WHERE id = ?').get(id) as
      | SessionRow
      | undefined;

    if (!row) return undefined;

    const messages = this.loadMessages(id);
    return rowToSessionData(row, messages);
  }

  /**
   * Load all sessions from the database.
   * Returns an array of SessionData objects.
   */
  loadAllSessions(): SessionData[] {
    const rows = this.db.prepare('SELECT * FROM sessions ORDER BY created_at ASC').all() as
      SessionRow[];

    return rows.map((row) => {
      const messages = this.loadMessages(row.id);
      return rowToSessionData(row, messages);
    });
  }

  /**
   * Delete a session and all its messages from the database.
   * Returns true if the session was found and deleted.
   */
  deleteSession(id: string): boolean {
    // Delete messages first (in case CASCADE is not enforced)
    this.db.prepare('DELETE FROM session_messages WHERE session_id = ?').run(id);

    const result = this.db.prepare('DELETE FROM sessions WHERE id = ?').run(id);
    return result.changes > 0;
  }

  /**
   * Save a single message for a session.
   */
  saveMessage(sessionId: string, message: SessionMessage): void {
    const metadata = message.metadata ? JSON.stringify(message.metadata) : null;

    this.db.prepare(`
      INSERT INTO session_messages (session_id, role, content, timestamp, metadata)
      VALUES (?, ?, ?, ?, ?)
    `).run(sessionId, message.role, message.content, message.timestamp, metadata);
  }

  /**
   * Load all messages for a session.
   * Returns messages ordered by timestamp ascending.
   */
  loadMessages(sessionId: string): SessionMessage[] {
    const rows = this.db
      .prepare('SELECT * FROM session_messages WHERE session_id = ? ORDER BY timestamp ASC')
      .all(sessionId) as SessionMessageRow[];

    return rows.map(rowToSessionMessage);
  }

  /**
   * Get the database instance (for testing or advanced operations).
   */
  getDatabase(): DatabaseType {
    return this.db;
  }

  /**
   * Close the database connection.
   */
  close(): void {
    this.db.close();
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function rowToSessionData(row: SessionRow, messages: SessionMessage[]): SessionData {
  return {
    id: row.id,
    type: row.type,
    activationMode: row.activation_mode,
    queueMode: row.queue_mode as SessionData['queueMode'],
    state: row.state as SessionData['state'],
    wakeWord: row.wake_word ?? undefined,
    maxHistory: row.max_history,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    history: messages,
  };
}

function rowToSessionMessage(row: SessionMessageRow): SessionMessage {
  return {
    role: row.role as SessionMessage['role'],
    content: row.content,
    timestamp: row.timestamp,
    metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
  };
}
