/**
 * @osai/memory -- Vector Storage Unit Tests
 *
 * Tests TC-001 through TC-007 from ROADMAP_TASKS_F-005.md (T-003).
 * Uses InMemoryVectorStorage for deterministic, cross-platform testing.
 * SqliteVecStorage is tested indirectly via the VectorStorage interface.
 *
 * Test cases:
 *   TC-001: init() creates storage (no-op for InMemory, virtual table for SqliteVec)
 *   TC-002: upsert inserts vector with metadata
 *   TC-003: upsert updates existing vector by id
 *   TC-004: search returns top_k results sorted by cosine similarity descending
 *   TC-005: search filters by min_similarity (results with score < threshold excluded)
 *   TC-006: delete removes vector by id
 *   TC-007: search on empty storage returns empty array
 */
export {};
//# sourceMappingURL=sqlite-vec-storage.test.d.ts.map