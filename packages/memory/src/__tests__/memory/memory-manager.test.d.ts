/**
 * @osai/memory -- MemoryManager Unit Tests
 *
 * Tests TC-001 through TC-007 from ROADMAP_TASKS_F-005.md (T-006).
 * Uses mock RAGPipeline, MemoryRepository, EmbeddingProvider, VectorStorage
 * for deterministic testing.
 *
 * Test cases:
 *   TC-001: store() saves to long-term tier + generates embedding + upserts in vector storage
 *   TC-002: remember() creates MemoryEntry with tier=long-term and stores
 *   TC-003: query() calls RAG pipeline and returns relevant entries
 *   TC-004: forget(id) deletes from SQLite + vector storage
 *   TC-005: recall(chatId, query) searches chat memory + long-term via RAG
 *   TC-006: store() with tier=chat stores only in chat_memory (without vector search)
 *   TC-007: store() logs actions in audit log (trace_id)
 */
export {};
//# sourceMappingURL=memory-manager.test.d.ts.map