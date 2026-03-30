/**
 * @osai/observability -- Observability (DOMAIN-010)
 *
 * pino structured JSON logging, LoggerFactory, TraceContext,
 * audit log, OpenTelemetry traces + metrics (V1), Prometheus endpoint.
 */

export {
  LoggerFactory,
  getLogger,
  createModuleLogger,
  type LoggerConfig,
  type ChildLoggerOptions,
  type LogLevel,
} from "./logger.js";

export {
  TraceContext,
  createTraceContext,
  getTraceContext,
  setTraceContext,
  clearTraceContext,
  runInTraceContext,
  type TraceData,
} from "./trace.js";

export {
  AuditService,
  AuditAction,
  type AuditEntryInput,
  type AuditRecord,
  type AuditQueryFilter,
  type RiskLevel,
  type UserDecision,
  type IAuditLogRepository,
} from "./audit.js";

export { AuditLogRepository } from "./audit-repository.js";

// Audit submodule (T-007: Audit Service Enhancement)
export {
  AuditEventType,
  AuditService as AuditServiceV2,
  AuditFilters,
  AuditLogRepository as AuditLogRepositoryV2,
  type AuditEntryInput as AuditEntryInputV2,
  type AuditRecordExtended,
  type RiskLevel as RiskLevelV2,
  type UserDecision as UserDecisionV2,
  type IAuditLogRepository as IAuditLogRepositoryV2,
} from "./audit/index.js";
