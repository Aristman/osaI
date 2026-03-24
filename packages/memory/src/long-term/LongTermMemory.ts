/**
 * @osai/memory -- LongTermMemory
 *
 * SQLite-backed long-term memory for facts, preferences, and knowledge.
 * Uses WAL mode. Semantic search is a stub for future Qdrant integration.
 */

import type BetterSqlite3 from 'better-sqlite3';
import type { Fact } from '../types.js';

// ---------------------------------------------------------------------------
// SQL Schema
// ---------------------------------------------------------------------------

const SCHEMA = `
CREATE TABLE IF NOT EXISTS facts (
  id TEXT PRIMARY KEY,
  content TEXT NOT NULL,
  category TEXT NOT NULL,
  source TEXT NOT NULL,
  confidence REAL NOT NULL DEFAULT 0.5,
  session_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  embedding BLOB,
  tags TEXT DEFAULT '[]'
);

CREATE INDEX IF NOT EXISTS idx_facts_category ON facts(category);
CREATE INDEX IF NOT EXISTS idx_facts_confidence ON facts(confidence);
`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function serializeTags(tags?: string[]): string {
  return JSON.stringify(tags ?? []);
}

function parseTags(raw: string | null): string[] {
  if (raw === null || raw === undefined) return [];
  try {
    return JSON.parse(raw) as string[];
  } catch {
    return [];
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
  return `fact_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function currentTimestamp(): string {
  return new Date().toISOString();
}

// ---------------------------------------------------------------------------
// Row type
// ---------------------------------------------------------------------------

interface FactRow {
  id: string;
  content: string;
  category: string;
  source: string;
  confidence: number;
  session_id: string | null;
  created_at: string;
  updated_at: string;
  embedding: Buffer | null;
  tags: string;
}

function rowToFact(row: FactRow): Fact {
  return {
    id: row.id,
    content: row.content,
    category: row.category as Fact['category'],
    source: row.source,
    confidence: row.confidence,
    sessionId: row.session_id ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    embedding: parseEmbedding(row.embedding),
    tags: parseTags(row.tags),
  };
}

// ---------------------------------------------------------------------------
// LongTermMemory
// ---------------------------------------------------------------------------

export class LongTermMemory {
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

  addFact(
    fact: Omit<Fact, 'id' | 'createdAt' | 'updatedAt'>,
  ): string {
    const id = generateId();
    const now = currentTimestamp();

    this.db
      .prepare(
        `INSERT INTO facts (id, content, category, source, confidence, session_id, created_at, updated_at, embedding, tags)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        fact.content,
        fact.category,
        fact.source,
        fact.confidence,
        fact.sessionId ?? null,
        now,
        now,
        serializeEmbedding(fact.embedding),
        serializeTags(fact.tags),
      );

    return id;
  }

  getFact(id: string): Fact | undefined {
    const row = this.db
      .prepare('SELECT * FROM facts WHERE id = ?')
      .get(id) as FactRow | undefined;

    if (row === undefined) return undefined;

    return rowToFact(row);
  }

  updateFact(
    id: string,
    updates: Partial<Pick<Fact, 'content' | 'confidence' | 'tags'>>,
  ): boolean {
    const existing = this.db
      .prepare('SELECT 1 FROM facts WHERE id = ?')
      .get(id);

    if (existing === undefined) return false;

    const setClauses: string[] = ["updated_at = ?"];
    const params: unknown[] = [currentTimestamp()];

    if (updates.content !== undefined) {
      setClauses.push('content = ?');
      params.push(updates.content);
    }
    if (updates.confidence !== undefined) {
      setClauses.push('confidence = ?');
      params.push(updates.confidence);
    }
    if (updates.tags !== undefined) {
      setClauses.push('tags = ?');
      params.push(serializeTags(updates.tags));
    }

    params.push(id);

    this.db
      .prepare(`UPDATE facts SET ${setClauses.join(', ')} WHERE id = ?`)
      .run(...params);

    return true;
  }

  deleteFact(id: string): boolean {
    const result = this.db
      .prepare('DELETE FROM facts WHERE id = ?')
      .run(id);

    return result.changes > 0;
  }

  // -----------------------------------------------------------------------
  // Search
  // -----------------------------------------------------------------------

  search(
    query: string,
    options?: {
      category?: string;
      limit?: number;
      tags?: string[];
    },
  ): Fact[] {
    const limit = options?.limit ?? 20;
    const conditions: string[] = ['content LIKE ?'];
    const params: unknown[] = [`%${query}%`];

    if (options?.category !== undefined) {
      conditions.push('category = ?');
      params.push(options.category);
    }

    if (options?.tags !== undefined && options.tags.length > 0) {
      for (const tag of options.tags) {
        conditions.push('tags LIKE ?');
        params.push(`%"${tag}"%`);
      }
    }

    const sql = `SELECT * FROM facts WHERE ${conditions.join(' AND ')} ORDER BY confidence DESC LIMIT ?`;

    const rows = this.db
      .prepare(sql)
      .all(...params, limit) as FactRow[];

    return rows.map(rowToFact);
  }

  /**
   * Semantic search stub.
   * Returns empty results; will be implemented with Qdrant in V2.
   */
  async semanticSearch(
    _query: string,
    _options?: { limit?: number },
  ): Promise<Fact[]> {
    // Stub: in V2 this will query Qdrant for vector similarity
    return [];
  }

  // -----------------------------------------------------------------------
  // Stats
  // -----------------------------------------------------------------------

  getStats(): { total: number; byCategory: Record<string, number> } {
    const totalRow = this.db
      .prepare('SELECT COUNT(*) as cnt FROM facts')
      .get() as { cnt: number } | undefined;

    const categoryRows = this.db
      .prepare(
        'SELECT category, COUNT(*) as cnt FROM facts GROUP BY category',
      )
      .all() as Array<{ category: string; cnt: number }>;

    const byCategory: Record<string, number> = {};
    for (const row of categoryRows) {
      byCategory[row.category] = row.cnt;
    }

    return {
      total: totalRow?.cnt ?? 0,
      byCategory,
    };
  }

  // -----------------------------------------------------------------------
  // Lifecycle
  // -----------------------------------------------------------------------

  close(): void {
    this.db.close();
  }
}
