/**
 * @osai/security -- AuditTrail
 *
 * Immutable audit log backed by SQLite (or in-memory for testing).
 * Entries cannot be modified or deleted after creation.
 */

import Database from 'better-sqlite3';
import type { AuditActor, AuditCategory, AuditEntry, AuditFilter, AuditStats, RiskLevel } from './types.js';

let idCounter = 0;

function generateAuditId(): string {
  return `audit-${++idCounter}-${Date.now()}`;
}

export class AuditTrail {
  private db: Database.Database;
  private closed = false;

  constructor(dbPath?: string) {
    const useMemory = dbPath === undefined || dbPath === ':memory:';
    this.db = new Database(useMemory ? ':memory:' : dbPath);

    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS audit_log (
        id TEXT PRIMARY KEY,
        timestamp TEXT NOT NULL,
        session_id TEXT NOT NULL,
        action TEXT NOT NULL,
        actor TEXT NOT NULL,
        category TEXT NOT NULL,
        level TEXT NOT NULL,
        details TEXT NOT NULL DEFAULT '{}',
        immutable INTEGER NOT NULL DEFAULT 1
      );

      CREATE INDEX IF NOT EXISTS idx_audit_session_id ON audit_log(session_id);
      CREATE INDEX IF NOT EXISTS idx_audit_category ON audit_log(category);
      CREATE INDEX IF NOT EXISTS idx_audit_level ON audit_log(level);
      CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_log(timestamp);
    `);
  }

  /**
   * Record a new audit entry. Entries are immutable -- they cannot be
   * modified or deleted after creation.
   *
   * @returns The ID of the created entry.
   */
  record(
    entry: Omit<AuditEntry, 'id' | 'timestamp' | 'immutable'>,
  ): string {
    this.assertNotClosed();

    const id = generateAuditId();
    const timestamp = new Date().toISOString();

    const stmt = this.db.prepare(`
      INSERT INTO audit_log (id, timestamp, session_id, action, actor, category, level, details, immutable)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
    `);

    stmt.run(
      id,
      timestamp,
      entry.sessionId,
      entry.action,
      entry.actor,
      entry.category,
      entry.level,
      JSON.stringify(entry.details),
    );

    return id;
  }

  /**
   * Query audit log with optional filters.
   */
  query(filter?: AuditFilter): AuditEntry[] {
    this.assertNotClosed();

    const conditions: string[] = [];
    const params: unknown[] = [];

    if (filter?.sessionId !== undefined) {
      conditions.push('session_id = ?');
      params.push(filter.sessionId);
    }

    if (filter?.category !== undefined) {
      conditions.push('category = ?');
      params.push(filter.category);
    }

    if (filter?.level !== undefined) {
      conditions.push('level = ?');
      params.push(filter.level);
    }

    if (filter?.from !== undefined) {
      conditions.push('timestamp >= ?');
      params.push(filter.from);
    }

    if (filter?.to !== undefined) {
      conditions.push('timestamp <= ?');
      params.push(filter.to);
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limitClause =
      filter?.limit !== undefined ? `LIMIT ?` : '';

    if (filter?.limit !== undefined) {
      params.push(filter.limit);
    }

    const sql = `SELECT * FROM audit_log ${whereClause} ORDER BY timestamp DESC ${limitClause}`;
    const stmt = this.db.prepare(sql);
    const rows = stmt.all(...params) as Array<{
      id: string;
      timestamp: string;
      session_id: string;
      action: string;
      actor: string;
      category: string;
      level: string;
      details: string;
      immutable: number;
    }>;

    return rows.map(this.rowToEntry);
  }

  /**
   * Get a specific audit entry by ID.
   */
  getEntry(id: string): AuditEntry | undefined {
    this.assertNotClosed();

    const stmt = this.db.prepare('SELECT * FROM audit_log WHERE id = ?');
    const row = stmt.get(id) as
      | {
          id: string;
          timestamp: string;
          session_id: string;
          action: string;
          actor: string;
          category: string;
          level: string;
          details: string;
          immutable: number;
        }
      | undefined;

    return row ? this.rowToEntry(row) : undefined;
  }

  /**
   * Get aggregate statistics about the audit log.
   */
  getStats(): AuditStats {
    this.assertNotClosed();

    const totalStmt = this.db.prepare('SELECT COUNT(*) as count FROM audit_log');
    const total = (totalStmt.get() as { count: number }).count;

    const byCategoryStmt = this.db.prepare(
      'SELECT category, COUNT(*) as count FROM audit_log GROUP BY category',
    );
    const categoryRows = byCategoryStmt.all() as Array<{
      category: string;
      count: number;
    }>;
    const byCategory: Record<string, number> = {};
    for (const row of categoryRows) {
      byCategory[row.category] = row.count;
    }

    const byLevelStmt = this.db.prepare(
      'SELECT level, COUNT(*) as count FROM audit_log GROUP BY level',
    );
    const levelRows = byLevelStmt.all() as Array<{
      level: string;
      count: number;
    }>;
    const byLevel: Record<string, number> = {};
    for (const row of levelRows) {
      byLevel[row.level] = row.count;
    }

    const last24hStmt = this.db.prepare(
      "SELECT COUNT(*) as count FROM audit_log WHERE timestamp >= datetime('now', '-24 hours')",
    );
    const last24h = (last24hStmt.get() as { count: number }).count;

    return { total, byCategory, byLevel, last24h };
  }

  /**
   * Close the underlying database connection.
   * After calling this method, no further operations are allowed.
   */
  close(): void {
    if (!this.closed) {
      this.db.close();
      this.closed = true;
    }
  }

  /**
   * Check if the audit trail is closed.
   */
  isClosed(): boolean {
    return this.closed;
  }

  private assertNotClosed(): void {
    if (this.closed) {
      throw new Error('AuditTrail is closed');
    }
  }

  private rowToEntry(row: {
    id: string;
    timestamp: string;
    session_id: string;
    action: string;
    actor: string;
    category: string;
    level: string;
    details: string;
    immutable: number;
  }): AuditEntry {
    return {
      id: row.id,
      timestamp: row.timestamp,
      sessionId: row.session_id,
      action: row.action,
      actor: row.actor as AuditActor,
      category: row.category as AuditCategory,
      level: row.level as RiskLevel,
      details: JSON.parse(row.details) as Record<string, unknown>,
      immutable: true as const,
    };
  }
}
