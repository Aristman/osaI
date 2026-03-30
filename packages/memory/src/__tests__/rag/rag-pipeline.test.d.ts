/**
 * @osai/memory -- RAG Pipeline Unit Tests
 *
 * Tests TC-001 through TC-007 from ROADMAP_TASKS_F-005.md (T-004).
 * Uses mock EmbeddingProvider and mock VectorStorage for deterministic testing.
 *
 * Test cases:
 *   TC-001: query calls embed provider with query text
 *   TC-002: query calls vector search with the obtained vector
 *   TC-003: query returns results with similarity > minSimilarity
 *   TC-004: query with topK=3 returns at most 3 results
 *   TC-005: query on embedding error throws RAGError
 *   TC-006: query on vector search error throws RAGError
 *   TC-007: query formats result with content, similarity, metadata
 */
export {};
//# sourceMappingURL=rag-pipeline.test.d.ts.map