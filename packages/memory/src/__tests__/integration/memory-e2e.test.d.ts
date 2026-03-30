/**
 * @osai/memory -- Memory System E2E Tests (T-008)
 *
 * TC-005: E2E: store -> embed -> vector upsert -> query -> search -> results
 * TC-006: E2E: remember -> recall through RAG pipeline
 * TC-007: E2E: buildContext with pruning on overflow
 * TC-008: E2E: forget deletes from SQLite + vector storage
 *
 * Uses:
 *   - InMemoryVectorStorage (deterministic cosine similarity)
 *   - In-memory SQLite (DatabaseManager with ":memory:")
 *   - Mock EmbeddingProvider (deterministic vectors)
 *   - Mock LLMProvider for FactExtractor (predictable JSON with facts)
 */
export {};
//# sourceMappingURL=memory-e2e.test.d.ts.map