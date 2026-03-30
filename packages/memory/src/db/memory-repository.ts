/**
 * @osai/memory -- MemoryRepository (T-005)
 *
 * Data access layer for three-tier memory system.
 * Provides CRUD operations over memory_entries, chat_memory, session_memory.
 *
 * Uses synchronous better-sqlite3 API (intentional per architecture).
 * All queries are parameterized for security.
 */

import type Database from 'better-sqlite3';
import { MEMORY_SCHEMA_SQL } from './schema.js';

/** Memory tier classification */
export type MemoryTier = 'chat' | 'session' | 'long-term';

/** Memory entry as stored/retrieved from database */
export interface MemoryEntry {
  id: string;
  content: string;
  tier: MemoryTier;
  chatId?: string;
  sessionId?: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

/** Options for storing a memory entry */
export interface StoreMemoryEntry {
  id: string;
  content: string;
  tier: MemoryTier;
  chatId?: string;
  sessionId?: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

/** Row shape from memory_entries SELECT */
interface MemoryEntryRow {
  id: string;
  content: string;
  tier: string;
  chat_id: string | null;
  session_id: string | null;
  tags: string;
  metadata: string;
  created_at: string;
  updated_at: string;
}

/**
 * Parse a database row into a MemoryEntry.
 */
function parseRow(row: MemoryEntryRow): MemoryEntry {
  let tags: string[] | undefined;
  try {
    const parsed = JSON.parse(row.tags) as unknown;
    if (Array.isArray(parsed)) {
      tags = parsed as string[];
    }
  } catch {
    tags = undefined;
  }

  let metadata: Record<string, unknown> | undefined;
  try {
    const parsed = JSON.parse(row.metadata) as unknown;
    if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
      metadata = parsed as Record<string, unknown>;
    }
  } catch {
    metadata = undefined;
  }

  return {
    id: row.id,
    content: row.content,
    tier: row.tier as MemoryTier,
    chatId: row.chat_id ?? undefined,
    sessionId: row.session_id ?? undefined,
    tags,
    metadata,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * MemoryRepository -- data access for the three-tier memory system.
 *
 * Accepts a raw better-sqlite3 Database connection.
 * Callers are responsible for database lifecycle (open/close).
 */
export class MemoryRepository {
  private readonly db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  /**
   * Initialize the memory schema.
   * Idempotent: safe to call multiple times.
   */
  initSchema(): void {
    this.db.exec(MEMORY_SCHEMA_SQL);
  }

  /**
   * Store a new memory entry.
   * Also creates corresponding chat_memory or session_memory row if applicable.
   */
  store(entry: StoreMemoryEntry): MemoryEntry {
    const now = new Date().toISOString();
    const tagsJson = JSON.stringify(entry.tags ?? []);
    const metadataJson = JSON.stringify(entry.metadata ?? {});

    const insertEntry = this.db.prepare(`
      INSERT INTO memory_entries (id, content, tier, chat_id, session_id, tags, metadata, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    this.db.transaction(() => {
      insertEntry.run(
        entry.id,
        entry.content,
        entry.tier,
        entry.chatId ?? null,
        entry.sessionId ?? null,
        tagsJson,
        metadataJson,
        now,
        now
      );

      if (entry.tier === 'chat' && entry.chatId) {
        const chatId = `chat_${entry.id}`;
        this.db.prepare(`
          INSERT INTO chat_memory (id, entry_id, chat_id, content, tags, metadata, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(chatId, entry.id, entry.chatId, entry.content, tagsJson, metadataJson, now, now);
      }

      if (entry.tier === 'session' && entry.sessionId) {
        const sessionId = `session_${entry.id}`;
        this.db.prepare(`
          INSERT INTO session_memory (id, entry_id, session_id, content, tags, metadata, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(sessionId, entry.id, entry.sessionId, entry.content, tagsJson, metadataJson, now, now);
      }
    })();

    return {
      id: entry.id,
      content: entry.content,
      tier: entry.tier,
      chatId: entry.chatId,
      sessionId: entry.sessionId,
      tags: entry.tags,
      metadata: entry.metadata,
      createdAt: now,
      updatedAt: now,
    };
  }

  /**
   * Find a memory entry by id.
   * Returns null if not found.
   */
  findById(id: string): MemoryEntry | null {
    const row = this.db
      .prepare('SELECT * FROM memory_entries WHERE id = ?')
      .get(id) as MemoryEntryRow | undefined;

    return row ? parseRow(row) : null;
  }

  /**
   * Find all memory entries for a specific chat_id.
   */
  findByChat(chatId: string): MemoryEntry[] {
    const rows = this.db
      .prepare('SELECT * FROM memory_entries WHERE chat_id = ? ORDER BY created_at DESC')
      .all(chatId) as MemoryEntryRow[];

    return rows.map(parseRow);
  }

  /**
   * Find all memory entries for a specific session_id.
   */
  findBySession(sessionId: string): MemoryEntry[] {
    const rows = this.db
      .prepare('SELECT * FROM memory_entries WHERE session_id = ? ORDER BY created_at DESC')
      .all(sessionId) as MemoryEntryRow[];

    return rows.map(parseRow);
  }

  /**
   * Find all long-term memory entries (shared across chats).
   */
  findLongTerm(): MemoryEntry[] {
    const rows = this.db
      .prepare("SELECT * FROM memory_entries WHERE tier = 'long-term' ORDER BY created_at DESC")
      .all() as MemoryEntryRow[];

    return rows.map(parseRow);
  }

  /**
   * Delete a memory entry by id.
   * Also removes corresponding chat_memory/session_memory rows via CASCADE.
   * Returns true if a row was deleted, false otherwise.
   */
  delete(id: string): boolean {
    const result = this.db
      .prepare('DELETE FROM memory_entries WHERE id = ?')
      .run(id);

    return result.changes > 0;
  }

  /**
   * Search memory entries by tags (JSON contains).
   * Returns entries where the tags JSON array contains at least one of the specified tags.
   */
  searchByTags(tags: string[]): MemoryEntry[] {
    if (tags.length === 0) {
      return [];
    }

    // Build OR conditions for each tag using JSON containment check
    // SQLite json_each approach: check if any tag in the array matches
    const conditions = tags.map(() => "EXISTS (SELECT 1 FROM json_each(memory_entries.tags) WHERE json_each.value = ?)").join(' OR ');
    const sql = `SELECT * FROM memory_entries WHERE (${conditions}) ORDER BY created_at DESC`;

    const rows = this.db
      .prepare(sql)
      .all(...tags) as MemoryEntryRow[];

    return rows.map(parseRow);
  }
}
