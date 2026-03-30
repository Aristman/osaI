/**
 * @osai/observability -- AuditService (T-007)
 *
 * Enhanced audit service for F-012 Security + File Sandbox.
 *
 * Provides:
 *   - log(): Record an audit entry (file_access, shell_exec, permission_*, sandbox_violation, tool_call, telegram_access)
 *   - query(): Query audit records via filter
 *   - cleanup(): Retention-based deletion of old records
 *   - queryExtended(): Query with auto-parsed JSON fields (AuditRecordExtended)
 *
 * AuditService delegates persistence to IAuditLogRepository via DI.
 * Each log() call:
 *   1. Validates required fields
 *   2. Enriches trace_id from TraceContext (if not already set)
 *   3. Serializes params and result to JSON
 *   4. Delegates to repository
 *   5. Logs via pino (level: info)
 */

import { randomUUID } from "node:crypto";
import { TraceContext } from "../trace.js";
import { createModuleLogger } from "../logger.js";
import {
  type AuditEntryInput,
  type AuditRecord,
  type AuditRecordExtended,
  type AuditQueryFilter,
  type IAuditLogRepository,
} from "./types.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_RISK_LEVEL = "low" as const;

// ---------------------------------------------------------------------------
// Safe JSON serialization
// ---------------------------------------------------------------------------

/**
 * Safely serialize a value to JSON, handling circular references.
 * Truncates strings longer than 10KB to prevent unbounded storage.
 */
function safeJsonStringify(value: unknown, maxLen = 10240): string {
  try {
    const seen = new WeakSet<object>();
    const result = JSON.stringify(value, (_key: string, val: unknown) => {
      if (typeof val === "object" && val !== null) {
        if (seen.has(val as object)) {
          return "[Circular]";
        }
        seen.add(val as object);
      }
      return val;
    });

    if (result !== undefined && result.length > maxLen) {
      return result.slice(0, maxLen) + "...[truncated]";
    }

    return result ?? "{}";
  } catch {
    return "{}";
  }
}

/**
 * Safely parse a JSON string. Returns the raw string if parsing fails.
 */
function safeJsonParse(value: string | null): unknown {
  if (value === null || value === undefined) {
    return null;
  }
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/**
 * Validate that required fields are present in the audit entry.
 *
 * @throws {Error} if action is missing
 */
function validateEntry(entry: AuditEntryInput): void {
  if (entry.action === undefined || entry.action === null) {
    throw new Error("Audit entry validation failed: 'action' is required");
  }
}

// ---------------------------------------------------------------------------
// AuditService
// ---------------------------------------------------------------------------

/**
 * AuditService provides the business logic for audit logging.
 *
 * Supports all 7 event types from F-012:
 *   file_access, shell_exec, permission_request, permission_decision,
 *   sandbox_violation, tool_call, telegram_access
 *
 * Usage:
 * ```ts
 * const auditService = new AuditService(repository);
 *
 * auditService.log({
 *   action: AuditEventType.FILE_ACCESS,
 *   tool_name: "read_file",
 *   params: { path: "/tmp/test.txt" },
 *   risk_level: "low",
 * });
 * ```
 */
export class AuditService {
  private readonly repository: IAuditLogRepository;
  private readonly logger = createModuleLogger("observability", "audit");

  /**
   * Create an AuditService with the given repository.
   *
   * @param repository - Repository for audit log persistence
   */
  constructor(repository: IAuditLogRepository) {
    this.repository = repository;
  }

  /**
   * Record an audit entry.
   *
   * Flow:
   *   1. Validate required fields
   *   2. Generate ID if not provided
   *   3. Enrich trace_id from TraceContext
   *   4. Serialize params/result to JSON
   *   5. Save via repository
   *   6. Log via pino
   *
   * @param entry - The audit entry to record
   * @returns The created AuditRecord
   * @throws {Error} if validation fails
   */
  log(entry: AuditEntryInput): AuditRecord {
    // 1. Validate
    validateEntry(entry);

    // 2. Enrich trace_id from TraceContext if not provided
    const ctx = TraceContext.get();
    const traceId = entry.trace_id ?? ctx?.trace_id ?? null;

    // 3. Build AuditRecord
    const record: AuditRecord = {
      id: entry.id ?? randomUUID(),
      session_id: entry.session_id ?? null,
      chat_id: entry.chat_id ?? null,
      timestamp: entry.timestamp ?? new Date().toISOString(),
      trace_id: traceId,
      action: entry.action,
      tool_name: entry.tool_name ?? null,
      skill_name: entry.skill_name ?? null,
      params: safeJsonStringify(entry.params ?? {}),
      result: entry.result !== undefined ? safeJsonStringify(entry.result) : null,
      user_decision: entry.user_decision ?? null,
      risk_level: entry.risk_level ?? DEFAULT_RISK_LEVEL,
    };

    // 4. Persist
    this.repository.save(record);

    // 5. Log via pino
    this.logger.info(
      {
        audit_id: record.id,
        action: record.action,
        trace_id: record.trace_id,
        session_id: record.session_id,
        chat_id: record.chat_id,
        tool_name: record.tool_name,
        skill_name: record.skill_name,
        risk_level: record.risk_level,
      },
      "Audit log recorded",
    );

    return record;
  }

  /**
   * Query audit log entries.
   *
   * Delegates to the repository with the provided filter.
   *
   * @param filter - Query filters (all optional)
   * @returns Array of matching audit records
   */
  query(filter: AuditQueryFilter = {}): AuditRecord[] {
    return this.repository.query(filter);
  }

  /**
   * Query audit log entries with parsed JSON fields.
   *
   * Same as query() but returns AuditRecordExtended where
   * params and result are auto-parsed from JSON strings.
   *
   * @param filter - Query filters (all optional)
   * @returns Array of matching audit records with parsed JSON fields
   */
  queryExtended(filter: AuditQueryFilter = {}): AuditRecordExtended[] {
    const records = this.repository.query(filter);

    return records.map((record) => ({
      ...record,
      params: safeJsonParse(record.params),
      result: safeJsonParse(record.result),
    }));
  }

  /**
   * Clean up old audit log entries.
   *
   * Delegates to the repository. Removes records with timestamps
   * older than the specified ISO 8601 date string.
   *
   * @param olderThan - ISO 8601 timestamp; records with timestamp < this value are removed
   * @returns Number of deleted records
   */
  cleanup(olderThan: string): number {
    const deleted = this.repository.cleanup(olderThan);

    if (deleted > 0) {
      this.logger.info(
        { deleted, olderThan },
        "Audit cleanup completed",
      );
    }

    return deleted;
  }
}
