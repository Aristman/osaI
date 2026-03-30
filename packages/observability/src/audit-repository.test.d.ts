/**
 * Unit tests for @osai/observability AuditLogRepository (T-004)
 *
 * Tests use mock DatabaseManager (better-sqlite3) for unit isolation.
 *
 * Tests:
 * - TC-004-01: create() inserts a record
 * - TC-004-02: query() by trace_id
 * - TC-004-03: query() by session_id
 * - TC-004-04: query() with time filter (from/to)
 * - TC-004-05: query() with limit
 * - TC-004-06: cleanup() deletes old records
 * - Additional: parameterized queries
 * - Additional: empty query result
 * - Additional: multiple filters combined
 */
export {};
//# sourceMappingURL=audit-repository.test.d.ts.map