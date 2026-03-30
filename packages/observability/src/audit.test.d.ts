/**
 * Unit tests for @osai/observability AuditService (T-003)
 *
 * Tests:
 * - TC-003-01: log() calls repository
 * - TC-003-02: log() enriches trace_id from TraceContext
 * - TC-003-03: log() logs via pino
 * - TC-003-04: Validation of required fields
 * - TC-003-05: query() delegates to repository
 * - TC-003-06: cleanup() delegates to repository
 * - TC-003-07: AuditAction enum has all 8 values
 * - Additional: params/result JSON serialization
 * - Additional: auto-generated UUID id
 * - Additional: default risk_level
 * - Additional: trace_id precedence (explicit > TraceContext)
 */
export {};
//# sourceMappingURL=audit.test.d.ts.map