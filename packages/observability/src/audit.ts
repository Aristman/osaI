/**
 * @osai/observability -- AuditService (T-003)
 *
 * Business logic for audit logging. Records all agent actions
 * (tool calls, permission requests, file access, etc.) with
 * trace_id enrichment from TraceContext.
 *
 * AuditService delegates persistence to AuditLogRepository via DI.
 * Each log() call:
 *   1. Validates required fields
 *   2. Enriches trace_id from TraceContext (if not already set)
 *   3. Serializes params and result to JSON
 *   4. Delegates to repository
 *   5. Logs via pino (level: info)
 */

import { randomUUID } from "node:crypto";
import { TraceContext } from "./trace.js";
import { createModuleLogger } from "./logger.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Supported audit actions.
 *
 * Covers all operations that must be audited per NFR-O04:
 * 100% tool calls, permission requests, file access.
 */
export enum AuditAction {
  TOOL_CALL = "TOOL_CALL",
  PERMISSION_REQUEST = "PERMISSION_REQUEST",
  PERMISSION_RESPONSE = "PERMISSION_RESPONSE",
  FILE_ACCESS = "FILE_ACCESS",
  SHELL_EXEC = "SHELL_EXEC",
  AGENT_START = "AGENT_START",
  AGENT_END = "AGENT_END",
  ERROR = "ERROR",
}

/**
 * Risk level for audited actions.
 * Maps to CHECK constraint in osai_audit_log table.
 */
export type RiskLevel = "low" | "medium" | "high" | "critical";

/**
 * User decision for permission-related actions.
 */
export type UserDecision = "approved" | "denied" | "skipped";

/**
 * Raw audit entry provided by callers.
 *
 * All fields except `id` are optional at input;
 * only `action` is mandatory.
 */
export interface AuditEntryInput {
  /** Optional custom ID (auto-generated UUID v4 if omitted) */
  id?: string;
  session_id?: string;
  chat_id?: string;
  /** Optional explicit timestamp (ISO 8601). Defaults to now. */
  timestamp?: string;
  /** Optional explicit trace_id (auto-enriched from TraceContext if omitted) */
  trace_id?: string;
  /** The action being audited. Required. */
  action: AuditAction;
  tool_name?: string;
  skill_name?: string;
  /** Parameters for the action. Will be JSON.stringify'd. */
  params?: unknown;
  /** Result of the action. Will be JSON.stringify'd. */
  result?: unknown;
  user_decision?: UserDecision;
  risk_level?: RiskLevel;
}

/**
 * Audit record as stored/passed to the repository.
 * All fields are serialised strings suitable for SQLite.
 */
export interface AuditRecord {
  id: string;
  session_id: string | null;
  chat_id: string | null;
  timestamp: string;
  trace_id: string | null;
  action: string;
  tool_name: string | null;
  skill_name: string | null;
  params: string;
  result: string | null;
  user_decision: string | null;
  risk_level: string;
}

/**
 * Query filter for audit log searches.
 */
export interface AuditQueryFilter {
  session_id?: string;
  chat_id?: string;
  trace_id?: string;
  action?: string;
  tool_name?: string;
  skill_name?: string;
  risk_level?: string;
  /** ISO 8601 lower bound for timestamp (inclusive) */
  from?: string;
  /** ISO 8601 upper bound for timestamp (inclusive) */
  to?: string;
  /** Maximum number of records to return */
  limit?: number;
}

/**
 * Interface for audit log persistence.
 * Implemented by AuditLogRepository (T-004).
 */
export interface IAuditLogRepository {
  save(record: AuditRecord): void;
  query(filter: AuditQueryFilter): AuditRecord[];
  cleanup(olderThan: string): number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_RISK_LEVEL: RiskLevel = "low";

// ---------------------------------------------------------------------------
// Safe JSON serialization
// ---------------------------------------------------------------------------

/**
 * Safely serialize a value to JSON, handling circular references.
 *
 * Uses a replacer that tracks seen objects to avoid infinite recursion.
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
 * Responsibilities:
 *   - Validate audit entries
 *   - Enrich trace_id from TraceContext
 *   - Serialize params/result to JSON
 *   - Delegate persistence to IAuditLogRepository
 *   - Log via pino for observability
 *
 * Usage:
 * ```ts
 * const auditService = new AuditService(repository);
 *
 * auditService.log({
 *   action: AuditAction.TOOL_CALL,
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
