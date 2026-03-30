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
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RAGPipeline } from '../../rag/rag-pipeline.js';
import { RAGError } from '../../rag/rag-pipeline.js';
import { RAG_DEFAULTS } from '../../types/rag.js';
import { MemoryCategory, MemoryTier } from '../../types/memory.js';
// =================================================================
// Helpers
// =================================================================
/** Create a mock EmbeddingProvider. */
function createMockEmbeddingProvider(options) {
    const result = options?.embedResult ?? {
        vector: [0.1, 0.2, 0.3, 0.4],
        dimensions: 4,
        provider: 'ollama',
        durationMs: 10,
    };
    return {
        name: 'mock-embedder',
        embed: vi.fn().mockResolvedValue(result),
        isAvailable: vi.fn().mockResolvedValue(true),
        getDimensions: vi.fn().mockReturnValue(4),
    };
}
/** Create a mock VectorStorage. */
function createMockVectorStorage(options) {
    const results = options?.searchResults ?? [];
    return {
        init: vi.fn(),
        upsert: vi.fn(),
        delete: vi.fn(),
        search: vi.fn().mockReturnValue(results),
    };
}
/** Default RAG config for tests. */
const testConfig = { ...RAG_DEFAULTS };
// =================================================================
// Tests
// =================================================================
describe('RAGPipeline (T-004)', () => {
    let embedder;
    let storage;
    let pipeline;
    beforeEach(() => {
        vi.clearAllMocks();
        embedder = createMockEmbeddingProvider();
        storage = createMockVectorStorage();
        pipeline = new RAGPipeline(embedder, storage, testConfig);
    });
    // ---------------------------------------------------------------
    // TC-001: query calls embed provider with query text
    // ---------------------------------------------------------------
    describe('TC-001: query calls embed provider', () => {
        it('should call embed() with the query text', async () => {
            await pipeline.query('What is the meaning of life?');
            expect(embedder.embed).toHaveBeenCalledOnce();
            expect(embedder.embed).toHaveBeenCalledWith('What is the meaning of life?');
        });
        it('should call embed before vector search', async () => {
            const callOrder = [];
            vi.mocked(embedder.embed).mockImplementation(async () => {
                callOrder.push('embed');
                return {
                    vector: [0.1, 0.2, 0.3, 0.4],
                    dimensions: 4,
                    provider: 'ollama',
                    durationMs: 10,
                };
            });
            vi.mocked(storage.search).mockImplementation(() => {
                callOrder.push('search');
                return [];
            });
            await pipeline.query('test query');
            expect(callOrder).toEqual(['embed', 'search']);
        });
    });
    // ---------------------------------------------------------------
    // TC-002: query calls vector search with the obtained vector
    // ---------------------------------------------------------------
    describe('TC-002: query calls vector search with obtained vector', () => {
        it('should call search() with the embedding vector, topK, and minSimilarity', async () => {
            const expectedVector = [0.1, 0.2, 0.3, 0.4];
            await pipeline.query('test query');
            expect(storage.search).toHaveBeenCalledOnce();
            expect(storage.search).toHaveBeenCalledWith(expectedVector, testConfig.defaultTopK, testConfig.defaultMinSimilarity);
        });
        it('should use options.topK when provided', async () => {
            await pipeline.query('test query', { topK: 3 });
            expect(storage.search).toHaveBeenCalledWith(expect.any(Array), 3, testConfig.defaultMinSimilarity);
        });
        it('should use options.minSimilarity when provided', async () => {
            await pipeline.query('test query', { minSimilarity: 0.5 });
            expect(storage.search).toHaveBeenCalledWith(expect.any(Array), testConfig.defaultTopK, 0.5);
        });
    });
    // ---------------------------------------------------------------
    // TC-003: query returns results with similarity > minSimilarity
    // ---------------------------------------------------------------
    describe('TC-003: query returns results above minSimilarity', () => {
        it('should return results from vector search with similarity above threshold', async () => {
            vi.mocked(storage.search).mockReturnValue([
                { id: 'mem-1', score: 0.95, metadata: { content: 'Result 1', tier: 'long-term', category: 'fact', tags: JSON.stringify([]), createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' } },
                { id: 'mem-2', score: 0.85, metadata: { content: 'Result 2', tier: 'long-term', category: 'context', tags: JSON.stringify([]), createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' } },
                { id: 'mem-3', score: 0.75, metadata: { content: 'Result 3', tier: 'chat', category: 'general', tags: JSON.stringify([]), createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' } },
            ]);
            const results = await pipeline.query('test query');
            expect(results).toHaveLength(3);
            expect(results[0].similarity).toBe(0.95);
            expect(results[1].similarity).toBe(0.85);
            expect(results[2].similarity).toBe(0.75);
            // All above default minSimilarity (0.7)
            for (const r of results) {
                expect(r.similarity).toBeGreaterThanOrEqual(testConfig.defaultMinSimilarity);
            }
        });
        it('should not return results below minSimilarity', async () => {
            vi.mocked(storage.search).mockReturnValue([
                { id: 'mem-1', score: 0.95, metadata: { content: 'High', tier: 'long-term', category: 'fact', tags: JSON.stringify([]), createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' } },
                { id: 'mem-2', score: 0.60, metadata: { content: 'Low', tier: 'long-term', category: 'fact', tags: JSON.stringify([]), createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' } },
            ]);
            const results = await pipeline.query('test query');
            // minSimilarity default = 0.7, so 0.60 should be filtered out
            expect(results).toHaveLength(1);
            expect(results[0].entry.content).toBe('High');
        });
    });
    // ---------------------------------------------------------------
    // TC-004: query with topK=3 returns at most 3 results
    // ---------------------------------------------------------------
    describe('TC-004: query with topK=3 returns at most 3 results', () => {
        it('should limit results to topK', async () => {
            vi.mocked(storage.search).mockReturnValue([
                { id: 'mem-1', score: 0.99, metadata: { content: 'R1', tier: 'long-term', category: 'fact', tags: JSON.stringify([]), createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' } },
                { id: 'mem-2', score: 0.95, metadata: { content: 'R2', tier: 'long-term', category: 'fact', tags: JSON.stringify([]), createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' } },
                { id: 'mem-3', score: 0.90, metadata: { content: 'R3', tier: 'long-term', category: 'fact', tags: JSON.stringify([]), createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' } },
                { id: 'mem-4', score: 0.85, metadata: { content: 'R4', tier: 'long-term', category: 'fact', tags: JSON.stringify([]), createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' } },
                { id: 'mem-5', score: 0.80, metadata: { content: 'R5', tier: 'long-term', category: 'fact', tags: JSON.stringify([]), createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' } },
            ]);
            const results = await pipeline.query('test query', { topK: 3 });
            expect(results).toHaveLength(3);
            expect(results[0].rank).toBe(0);
            expect(results[1].rank).toBe(1);
            expect(results[2].rank).toBe(2);
        });
        it('should return fewer than topK when not enough results match', async () => {
            vi.mocked(storage.search).mockReturnValue([
                { id: 'mem-1', score: 0.95, metadata: { content: 'R1', tier: 'long-term', category: 'fact', tags: JSON.stringify([]), createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' } },
            ]);
            const results = await pipeline.query('test query', { topK: 3 });
            expect(results).toHaveLength(1);
        });
        it('should return empty array when no results match', async () => {
            vi.mocked(storage.search).mockReturnValue([]);
            const results = await pipeline.query('test query', { topK: 3 });
            expect(results).toEqual([]);
        });
    });
    // ---------------------------------------------------------------
    // TC-005: query on embedding error throws RAGError
    // ---------------------------------------------------------------
    describe('TC-005: query on embedding error throws RAGError', () => {
        it('should throw RAGError when embed() fails', async () => {
            const embedError = new Error('Ollama not reachable');
            vi.mocked(embedder.embed).mockRejectedValue(embedError);
            await expect(pipeline.query('test query')).rejects.toThrow(RAGError);
        });
        it('should include error context in RAGError message', async () => {
            const embedError = new Error('Ollama not reachable');
            vi.mocked(embedder.embed).mockRejectedValue(embedError);
            try {
                await pipeline.query('test query');
                expect.fail('Expected RAGError to be thrown');
            }
            catch (error) {
                expect(error).toBeInstanceOf(RAGError);
                const ragError = error;
                expect(ragError.message).toContain('embedding');
                expect(ragError.cause).toBe(embedError);
            }
        });
        it('should NOT call vector search when embedding fails', async () => {
            vi.mocked(embedder.embed).mockRejectedValue(new Error('fail'));
            try {
                await pipeline.query('test query');
            }
            catch {
                // Expected
            }
            expect(storage.search).not.toHaveBeenCalled();
        });
    });
    // ---------------------------------------------------------------
    // TC-006: query on vector search error throws RAGError
    // ---------------------------------------------------------------
    describe('TC-006: query on vector search error throws RAGError', () => {
        it('should throw RAGError when search() fails', async () => {
            const searchError = new Error('Database locked');
            vi.mocked(storage.search).mockImplementation(() => {
                throw searchError;
            });
            await expect(pipeline.query('test query')).rejects.toThrow(RAGError);
        });
        it('should include error context in RAGError message', async () => {
            const searchError = new Error('Database locked');
            vi.mocked(storage.search).mockImplementation(() => {
                throw searchError;
            });
            try {
                await pipeline.query('test query');
                expect.fail('Expected RAGError to be thrown');
            }
            catch (error) {
                expect(error).toBeInstanceOf(RAGError);
                const ragError = error;
                expect(ragError.message).toContain('vector search');
                expect(ragError.cause).toBe(searchError);
            }
        });
    });
    // ---------------------------------------------------------------
    // TC-007: query formats result with content, similarity, metadata
    // ---------------------------------------------------------------
    describe('TC-007: query formats result correctly', () => {
        it('should format each result with entry, similarity, and rank', async () => {
            vi.mocked(storage.search).mockReturnValue([
                {
                    id: 'mem-42',
                    score: 0.92,
                    metadata: {
                        content: 'User prefers dark mode',
                        tier: 'long-term',
                        category: 'preference',
                        tags: JSON.stringify(['ui', 'settings']),
                        createdAt: '2026-03-15T10:30:00Z',
                        updatedAt: '2026-03-15T10:30:00Z',
                    },
                },
            ]);
            const results = await pipeline.query('user preferences');
            expect(results).toHaveLength(1);
            const r = results[0];
            // Check entry fields
            expect(r.entry.id).toBe('mem-42');
            expect(r.entry.content).toBe('User prefers dark mode');
            expect(r.entry.tier).toBe(MemoryTier.LongTerm);
            expect(r.entry.category).toBe(MemoryCategory.Preference);
            expect(r.entry.tags).toEqual(['ui', 'settings']);
            expect(r.entry.createdAt).toBe('2026-03-15T10:30:00Z');
            expect(r.entry.updatedAt).toBe('2026-03-15T10:30:00Z');
            // Check similarity and rank
            expect(r.similarity).toBe(0.92);
            expect(r.rank).toBe(0);
        });
        it('should assign correct rank to multiple results', async () => {
            vi.mocked(storage.search).mockReturnValue([
                { id: 'mem-1', score: 0.95, metadata: { content: 'A', tier: 'long-term', category: 'fact', tags: JSON.stringify([]), createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' } },
                { id: 'mem-2', score: 0.88, metadata: { content: 'B', tier: 'chat', category: 'context', tags: JSON.stringify([]), createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' } },
                { id: 'mem-3', score: 0.72, metadata: { content: 'C', tier: 'session', category: 'general', tags: JSON.stringify(['tag1']), createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' } },
            ]);
            const results = await pipeline.query('test');
            expect(results).toHaveLength(3);
            expect(results[0].rank).toBe(0);
            expect(results[1].rank).toBe(1);
            expect(results[2].rank).toBe(2);
        });
        it('should parse tags from JSON string in metadata', async () => {
            vi.mocked(storage.search).mockReturnValue([
                {
                    id: 'mem-1',
                    score: 0.90,
                    metadata: {
                        content: 'Memory with tags',
                        tier: 'long-term',
                        category: 'fact',
                        tags: JSON.stringify(['python', 'development', 'testing']),
                        createdAt: '2026-01-01T00:00:00Z',
                        updatedAt: '2026-01-01T00:00:00Z',
                    },
                },
            ]);
            const results = await pipeline.query('test');
            expect(results).toHaveLength(1);
            expect(results[0].entry.tags).toEqual(['python', 'development', 'testing']);
        });
        it('should handle missing optional metadata fields gracefully', async () => {
            vi.mocked(storage.search).mockReturnValue([
                {
                    id: 'mem-1',
                    score: 0.80,
                    metadata: {
                        content: 'Minimal memory',
                        tier: 'long-term',
                        category: 'general',
                        tags: JSON.stringify([]),
                        createdAt: '2026-01-01T00:00:00Z',
                        updatedAt: '2026-01-01T00:00:00Z',
                    },
                },
            ]);
            const results = await pipeline.query('test');
            expect(results).toHaveLength(1);
            expect(results[0].entry.chatId).toBeUndefined();
            expect(results[0].entry.sessionId).toBeUndefined();
            expect(results[0].entry.summary).toBeUndefined();
            expect(results[0].entry.embedding).toBeUndefined();
        });
    });
});
//# sourceMappingURL=rag-pipeline.test.js.map