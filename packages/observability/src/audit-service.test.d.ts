/**
 * Integration tests for AuditService + AuditLogRepository (T-004)
 *
 * Full round-trip integration tests:
 * - TC-004-07: log() -> query() round-trip
 * - TC-004-08: Index performance for trace_id queries
 * - Full AuditService -> Repository -> SQLite -> query chain
 *
 * Uses real SQLite (in-memory temp file), no mocks.
 */
export {};
//# sourceMappingURL=audit-service.test.d.ts.map