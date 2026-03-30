/**
 * @osai/observability -- Audit Types (T-007)
 *
 * Type definitions for the enhanced audit service.
 * All event types and record types required by F-012 Security + File Sandbox.
 *
 * Event types cover the full 7-layer security model:
 *   - file_access: File system operations (Layer 4)
 *   - shell_exec: Shell command execution (Layer 5)
 *   - permission_request: Permission prompt sent to user (Layer 3)
 *   - permission_decision: User responded to permission prompt (Layer 3)
 *   - sandbox_violation: File sandbox rule broken (Layer 4)
 *   - tool_call: Any tool invocation (cross-cutting)
 *   - telegram_access: Telegram Bot/Userbot access attempt (Layer 6)
 */

// ---------------------------------------------------------------------------
// AuditEventType
// ---------------------------------------------------------------------------

/**
 * All auditable event types in the osaI system.
 *
 * Covers 100% of security-relevant actions per NFR-O04.
 * Values are snake_case strings for consistency with log format
 * and SQLite storage.
 */
export enum AuditEventType {
  FILE_ACCESS = "file_access",
  SHELL_EXEC = "shell_exec",
  PERMISSION_REQUEST = "permission_request",
  PERMISSION_DECISION = "permission_decision",
  SANDBOX_VIOLATION = "sandbox_violation",
  TOOL_CALL = "tool_call",
  TELEGRAM_ACCESS = "telegram_access",
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

// ---------------------------------------------------------------------------
// AuditRecord
// ---------------------------------------------------------------------------

/**
 * Raw audit entry provided by callers.
 *
 * All fields except `action` are optional at input.
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
  /** The event type being audited. Required. */
  action: AuditEventType;
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
 * Extended audit record with parsed JSON fields.
 *
 * Provides convenient access to params and result as parsed objects
 * (when they are valid JSON) instead of raw strings.
 */
export interface AuditRecordExtended extends Omit<AuditRecord, "params" | "result"> {
  /** Parsed params object (or the original string if not valid JSON) */
  params: unknown;
  /** Parsed result object (or null if not available / not valid JSON) */
  result: unknown;
}

// ---------------------------------------------------------------------------
// Query Filters
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Repository Interface
// ---------------------------------------------------------------------------

/**
 * Interface for audit log persistence.
 * Implemented by AuditLogRepository.
 */
export interface IAuditLogRepository {
  save(record: AuditRecord): void;
  query(filter: AuditQueryFilter): AuditRecord[];
  cleanup(olderThan: string): number;
}
