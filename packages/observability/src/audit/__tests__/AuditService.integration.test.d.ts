/**
 * Integration tests for AuditService + AuditFilters + AuditLogRepository (T-007)
 *
 * Full round-trip integration tests with real SQLite (in-memory temp file).
 *
 * Tests:
 * - TC-007-5: trace_id propagation through real SQLite
 * - TC-007-6: Query by trace_id via AuditFilters
 * - TC-007-7: Query by time range via AuditFilters
 * - TC-007-8: Query by risk_level via AuditFilters
 * - AuditFilters -> AuditService -> SQLite -> query chain
 *
 * Uses real SQLite (in-memory temp file), no mocks.
 */
export {};
//# sourceMappingURL=AuditService.integration.test.d.ts.map