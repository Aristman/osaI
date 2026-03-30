/**
 * @osai/observability -- AuditLogRepository (T-007)
 *
 * SQLite persistence for audit log entries.
 * Uses the osai_audit_log table from @osai/shared schema.
 *
 * Implements IAuditLogRepository interface for use with AuditService.
 *
 * All queries use parameterized placeholders (?) per profile constraints.
 */

import type { Database } from "better-sqlite3";
import type {
  AuditRecord,
  AuditQueryFilter,
  IAuditLogRepository,
} from "./types.js";

// ---------------------------------------------------------------------------
// AuditLogRepository
// ---------------------------------------------------------------------------

/**
 * Repository for persisting audit records in SQLite.
 *
 * Uses the `osai_audit_log` table (created by @osai/shared migrations):
 *   - id TEXT PRIMARY KEY
 *   - session_id TEXT
 *   - chat_id TEXT
 *   - timestamp TEXT NOT NULL
 *   - trace_id TEXT
 *   - action TEXT NOT NULL
 *   - tool_name TEXT
 *   - skill_name TEXT
 *   - params TEXT (JSON)
 *   - result TEXT (JSON)
 *   - user_decision TEXT
 *   - risk_level TEXT (CHECK: low/medium/high/critical)
 *
 * Indexes (created by @osai/shared migrations):
 *   - idx_audit_log_timestamp
 *   - idx_audit_log_trace_id
 *   - idx_audit_log_session_id
 */
export class AuditLogRepository implements IAuditLogRepository {
  private readonly db: Database;

  /**
   * Create an AuditLogRepository.
   *
   * @param db - Active better-sqlite3 database connection.
   *             The osai_audit_log table must already exist.
   */
  constructor(db: Database) {
    this.db = db;
  }

  /**
   * Save an audit record to the database.
   *
   * Uses INSERT with all parameterized placeholders.
   *
   * @param record - The audit record to persist
   */
  save(record: AuditRecord): void {
    this.db
      .prepare(
        `INSERT INTO osai_audit_log
          (id, session_id, chat_id, timestamp, trace_id, action,
           tool_name, skill_name, params, result, user_decision, risk_level)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        record.id,
        record.session_id,
        record.chat_id,
        record.timestamp,
        record.trace_id,
        record.action,
        record.tool_name,
        record.skill_name,
        record.params,
        record.result,
        record.user_decision,
        record.risk_level,
      );
  }

  /**
   * Query audit records with optional filters.
   *
   * Dynamically builds WHERE clause from provided filters.
   * All values are parameterized. Results ordered by timestamp DESC.
   *
   * @param filter - Optional query filters
   * @returns Array of matching audit records
   */
  query(filter: AuditQueryFilter = {}): AuditRecord[] {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (filter.session_id !== undefined) {
      conditions.push("session_id = ?");
      params.push(filter.session_id);
    }

    if (filter.chat_id !== undefined) {
      conditions.push("chat_id = ?");
      params.push(filter.chat_id);
    }

    if (filter.trace_id !== undefined) {
      conditions.push("trace_id = ?");
      params.push(filter.trace_id);
    }

    if (filter.action !== undefined) {
      conditions.push("action = ?");
      params.push(filter.action);
    }

    if (filter.tool_name !== undefined) {
      conditions.push("tool_name = ?");
      params.push(filter.tool_name);
    }

    if (filter.skill_name !== undefined) {
      conditions.push("skill_name = ?");
      params.push(filter.skill_name);
    }

    if (filter.risk_level !== undefined) {
      conditions.push("risk_level = ?");
      params.push(filter.risk_level);
    }

    if (filter.from !== undefined) {
      conditions.push("timestamp >= ?");
      params.push(filter.from);
    }

    if (filter.to !== undefined) {
      conditions.push("timestamp <= ?");
      params.push(filter.to);
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const limitClause =
      filter.limit !== undefined ? `LIMIT ?` : "";

    if (filter.limit !== undefined) {
      params.push(filter.limit);
    }

    const sql = `SELECT * FROM osai_audit_log ${whereClause} ORDER BY timestamp DESC ${limitClause}`.trim();

    const rows = this.db.prepare(sql).all(...params) as AuditRecord[];

    return rows;
  }

  /**
   * Delete audit records older than the specified timestamp.
   *
   * @param olderThan - ISO 8601 timestamp; records with timestamp < this value are deleted
   * @returns Number of deleted records
   */
  cleanup(olderThan: string): number {
    const result = this.db
      .prepare("DELETE FROM osai_audit_log WHERE timestamp < ?")
      .run(olderThan);

    return result.changes;
  }
}
