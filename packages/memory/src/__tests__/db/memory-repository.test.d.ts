/**
 * @osai/memory -- MemoryRepository Unit Tests (T-005)
 *
 * Test cases from ROADMAP_TASKS_F-005.md:
 *   TC-001: store() saves MemoryEntry to memory_entries table
 *   TC-002: findById() returns entry by id or null
 *   TC-003: findByChat() returns all entries for chat_id
 *   TC-004: findBySession() returns all entries for session_id
 *   TC-005: findLongTerm() returns entries with tier='long-term'
 *   TC-006: delete() removes entry by id
 *   TC-007: searchByTags() filters entries by tags (JSON contains)
 *   TC-008: schema migration is idempotent (no error on re-init)
 *
 * Uses in-memory SQLite for isolation.
 */
export {};
//# sourceMappingURL=memory-repository.test.d.ts.map