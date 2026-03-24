/**
 * @osai/memory -- ShortTermMemory
 *
 * SQLite-backed short-term memory for session messages and tool results.
 * Uses WAL mode for reliability.
 */

import type BetterSqlite3 from 'better-sqlite3';
import type { MemoryEntry } from '../types.js';

// ---------------------------------------------------------------------------
// SQL Schema
// ---------------------------------------------------------------------------

const SCHEMA = `
CREATE TABLE IF NOT EXISTS memories (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  timestamp TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'message',
  metadata TEXT DEFAULT '{}',
  embedding BLOB
);

CREATE INDEX IF NOT EXISTS idx_memories_session ON memories(session_id, timestamp);
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

function parseEmbedding(raw: Buffer | null): number[] | undefined {
  if (raw === null || raw === undefined) return undefined;
  try {
    const str = raw.toString('utf-8');
    return JSON.parse(str) as number[];
  } catch {
    return undefined;
  }
}

function serializeEmbedding(embedding?: number[]): Buffer | null {
  if (embedding === undefined || embedding === null) return null;
  return Buffer.from(JSON.stringify(embedding), 'utf-8');
}

function generateId(): string {
  return `mem_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function currentTimestamp(): string {
  return new Date().toISOString();
}

// ---------------------------------------------------------------------------
// Row type
// ---------------------------------------------------------------------------

interface MemoryRow {
  id: string;
  session_id: string;
  role: string;
  content: string;
  timestamp: string;
  category: string;
  metadata: string;
  embedding: Buffer | null;
}

function rowToEntry(row: MemoryRow): MemoryEntry {
  return {
    id: row.id,
    sessionId: row.session_id,
    role: row.role as MemoryEntry['role'],
    content: row.content,
    timestamp: row.timestamp,
    category: row.category as MemoryEntry['category'],
    metadata: parseMetadata(row.metadata),
    embedding: parseEmbedding(row.embedding),
  };
}

// ---------------------------------------------------------------------------
// ShortTermMemory
// ---------------------------------------------------------------------------

export class ShortTermMemory {
  private readonly db: BetterSqlite3.Database;

  constructor(dbPath?: string) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const DatabaseConstructor = require('better-sqlite3') as typeof BetterSqlite3;
    this.db = new DatabaseConstructor(dbPath ?? ':memory:');

    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');

    this.db.exec(SCHEMA);
  }

  // -----------------------------------------------------------------------
  // CRUD
  // -----------------------------------------------------------------------

  add(entry: Omit<MemoryEntry, 'id' | 'timestamp'>): string {
    const id = generateId();
    const timestamp = currentTimestamp();

    this.db
      .prepare(
        `INSERT INTO memories (id, session_id, role, content, timestamp, category, metadata, embedding)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        entry.sessionId,
        entry.role,
        entry.content,
        timestamp,
        entry.category,
        serializeMetadata(entry.metadata),
        serializeEmbedding(entry.embedding),
      );

    return id;
  }

  get(id: string): MemoryEntry | undefined {
    const row = this.db
      .prepare('SELECT * FROM memories WHERE id = ?')
      .get(id) as MemoryRow | undefined;

    if (row === undefined) return undefined;

    return rowToEntry(row);
  }

  getSessionMessages(sessionId: string): MemoryEntry[] {
    const rows = this.db
      .prepare(
        'SELECT * FROM memories WHERE session_id = ? ORDER BY timestamp ASC',
      )
      .all(sessionId) as MemoryRow[];

    return rows.map(rowToEntry);
  }

  // -----------------------------------------------------------------------
  // Query
  // -----------------------------------------------------------------------

  search(
    sessionId: string,
    query: string,
    limit: number = 10,
  ): MemoryEntry[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM memories
         WHERE session_id = ? AND content LIKE ?
         ORDER BY timestamp DESC
         LIMIT ?`,
      )
      .all(sessionId, `%${query}%`, limit) as MemoryRow[];

    return rows.map(rowToEntry);
  }

  // -----------------------------------------------------------------------
  // Cleanup
  // -----------------------------------------------------------------------

  clearSession(sessionId: string): void {
    this.db
      .prepare('DELETE FROM memories WHERE session_id = ?')
      .run(sessionId);
  }

  prune(sessionId: string, keepLast: number): number {
    // Get total count for the session
    const countRow = this.db
      .prepare('SELECT COUNT(*) as cnt FROM memories WHERE session_id = ?')
      .get(sessionId) as { cnt: number } | undefined;

    const total = countRow?.cnt ?? 0;
    if (total <= keepLast) return 0;

    // Use rowid to determine the N most recent entries and delete the rest.
    // rowid is guaranteed to be monotonically increasing and unique.
    const result = this.db
      .prepare(
        `DELETE FROM memories
         WHERE session_id = ? AND rowid NOT IN (
           SELECT rowid FROM memories
           WHERE session_id = ?
           ORDER BY rowid DESC
           LIMIT ?
         )`,
      )
      .run(sessionId, sessionId, keepLast);

    return result.changes;
  }

  // -----------------------------------------------------------------------
  // Stats
  // -----------------------------------------------------------------------

  getCount(sessionId: string): number {
    const row = this.db
      .prepare(
        'SELECT COUNT(*) as cnt FROM memories WHERE session_id = ?',
      )
      .get(sessionId) as { cnt: number } | undefined;

    return row?.cnt ?? 0;
  }

  // -----------------------------------------------------------------------
  // Lifecycle
  // -----------------------------------------------------------------------

  close(): void {
    this.db.close();
  }
}
