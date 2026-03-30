import { describe, it, expect, vi, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { KBSearch, EmptyQueryError } from '../../search/kb-search.js';
import { KnowledgeRepository } from '../../db/repository.js';
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
/** Create a mock EmbeddingProvider that returns deterministic vectors. */
function createMockEmbeddingProvider() {
    const embedFn = vi.fn(async (text) => {
        // Return a deterministic vector based on text length for reproducibility
        const input = Array.isArray(text) ? text : [text];
        const results = input.map(t => ({
            vector: Array.from({ length: 768 }, (_, i) => (t.charCodeAt(0) % 10 + i) / 1000),
            dimensions: 768,
            provider: 'ollama',
            durationMs: 5,
        }));
        return Array.isArray(text) ? results : results[0];
    });
    return {
        name: 'mock-embedding',
        embed: embedFn,
        isAvailable: vi.fn(async () => true),
        getDimensions: vi.fn(() => 768),
    };
}
/** Create a mock VectorStorage with configurable search results. */
function createMockVectorStorage(results = []) {
    return {
        init: vi.fn(),
        upsert: vi.fn(),
        delete: vi.fn(),
        search: vi.fn((_queryVector, _topK, _minSimilarity) => results),
    };
}
/** Create an in-memory SQLite database with KnowledgeRepository initialized. */
function createTestDb() {
    const db = new Database(':memory:');
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    return db;
}
/** Insert a test document and return its ID. */
function insertTestDocument(repository, doc) {
    repository.insertDocument({
        id: doc.id,
        title: doc.title,
        path: doc.path,
        format: doc.format,
        status: 'completed',
        chunksCount: doc.chunks?.length ?? 0,
        totalSize: 100,
        tags: doc.tags ?? [],
    });
    for (const chunk of doc.chunks ?? []) {
        repository.insertChunk({
            id: chunk.id,
            documentId: doc.id,
            content: chunk.content,
            chunkIndex: chunk.chunkIndex,
        });
    }
}
// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('KBSearch', () => {
    let db;
    let repository;
    let embeddingProvider;
    let search;
    beforeEach(() => {
        db = createTestDb();
        repository = new KnowledgeRepository(db);
        repository.initSchema();
        embeddingProvider = createMockEmbeddingProvider();
        search = new KBSearch(embeddingProvider, createMockVectorStorage(), repository);
    });
    // -----------------------------------------------------------------------
    // TC-005-1: Search returns top-k relevant chunks
    // -----------------------------------------------------------------------
    describe('TC-005-1: Search returns top-k relevant chunks', () => {
        it('should return at most topK results with all similarity > minSimilarity', async () => {
            // Insert 3 documents with chunks
            insertTestDocument(repository, {
                id: 'doc-1',
                title: 'Document One',
                path: '/docs/one.txt',
                format: 'txt',
                tags: ['api'],
                chunks: [{ id: 'chunk-1-0', content: 'Content about API endpoints', chunkIndex: 0 }],
            });
            insertTestDocument(repository, {
                id: 'doc-2',
                title: 'Document Two',
                path: '/docs/two.txt',
                format: 'txt',
                tags: ['guide'],
                chunks: [{ id: 'chunk-2-0', content: 'Content about user guide', chunkIndex: 0 }],
            });
            insertTestDocument(repository, {
                id: 'doc-3',
                title: 'Document Three',
                path: '/docs/three.txt',
                format: 'txt',
                tags: ['api'],
                chunks: [{ id: 'chunk-3-0', content: 'Content about API authentication', chunkIndex: 0 }],
            });
            // Create mock VectorStorage that returns 3 results, all above 0.7
            const vectorStorage = createMockVectorStorage([
                { id: 'chunk-1-0', score: 0.95, metadata: { documentId: 'doc-1', chunkIndex: 0 } },
                { id: 'chunk-2-0', score: 0.85, metadata: { documentId: 'doc-2', chunkIndex: 0 } },
                { id: 'chunk-3-0', score: 0.78, metadata: { documentId: 'doc-3', chunkIndex: 0 } },
            ]);
            const kbSearch = new KBSearch(embeddingProvider, vectorStorage, repository);
            const results = await kbSearch.search('API endpoints');
            // Default topK = 5, so all 3 results should be returned
            expect(results.length).toBeLessThanOrEqual(5);
            expect(results.length).toBe(3);
            // All similarities should be > 0.7 (minSimilarity default)
            for (const result of results) {
                expect(result.similarity).toBeGreaterThan(0.7);
            }
            // Results should be sorted by similarity descending
            expect(results[0].similarity).toBeGreaterThanOrEqual(results[1].similarity);
            expect(results[1].similarity).toBeGreaterThanOrEqual(results[2].similarity);
        });
        it('should respect default topK of 5 when more results are available', async () => {
            // Insert 10 documents
            for (let i = 0; i < 10; i++) {
                insertTestDocument(repository, {
                    id: `doc-${i}`,
                    title: `Document ${i}`,
                    path: `/docs/${i}.txt`,
                    format: 'txt',
                    chunks: [{ id: `chunk-${i}-0`, content: `Content ${i}`, chunkIndex: 0 }],
                });
            }
            // VectorStorage returns 10 results
            const vectorResults = Array.from({ length: 10 }, (_, i) => ({
                id: `chunk-${i}-0`,
                score: 0.99 - i * 0.02, // 0.99, 0.97, ..., 0.81
                metadata: { documentId: `doc-${i}`, chunkIndex: 0 },
            }));
            const vectorStorage = createMockVectorStorage(vectorResults);
            const kbSearch = new KBSearch(embeddingProvider, vectorStorage, repository);
            const results = await kbSearch.search('test query');
            expect(results.length).toBeLessThanOrEqual(5);
        });
    });
    // -----------------------------------------------------------------------
    // TC-005-2: Search filters by min_similarity
    // -----------------------------------------------------------------------
    describe('TC-005-2: Search filters by min_similarity', () => {
        it('should only return results with similarity >= minSimilarity', async () => {
            insertTestDocument(repository, {
                id: 'doc-1',
                title: 'Document One',
                path: '/docs/one.txt',
                format: 'txt',
                chunks: [{ id: 'chunk-1-0', content: 'Low similarity content', chunkIndex: 0 }],
            });
            insertTestDocument(repository, {
                id: 'doc-2',
                title: 'Document Two',
                path: '/docs/two.txt',
                format: 'txt',
                chunks: [{ id: 'chunk-2-0', content: 'Medium similarity content', chunkIndex: 0 }],
            });
            insertTestDocument(repository, {
                id: 'doc-3',
                title: 'Document Three',
                path: '/docs/three.txt',
                format: 'txt',
                chunks: [{ id: 'chunk-3-0', content: 'High similarity content', chunkIndex: 0 }],
            });
            // VectorStorage returns results with varying similarity
            // Note: VectorStorage does its own minSimilarity filtering, but
            // we pass 0 as minSimilarity to let KBSearch handle filtering.
            // Actually, KBSearch passes minSimilarity to VectorStorage.search(),
            // so VectorStorage would already filter. But we test the integration.
            const vectorStorage = createMockVectorStorage([
                { id: 'chunk-1-0', score: 0.5, metadata: { documentId: 'doc-1', chunkIndex: 0 } },
                { id: 'chunk-2-0', score: 0.8, metadata: { documentId: 'doc-2', chunkIndex: 0 } },
                { id: 'chunk-3-0', score: 0.9, metadata: { documentId: 'doc-3', chunkIndex: 0 } },
            ]);
            const kbSearch = new KBSearch(embeddingProvider, vectorStorage, repository);
            // Use minSimilarity = 0.7 (default) -- VectorStorage receives this and filters
            const results = await kbSearch.search('test query', { minSimilarity: 0.7 });
            // Verify that VectorStorage.search was called with correct minSimilarity
            expect(vectorStorage.search).toHaveBeenCalledWith(expect.any(Array), expect.any(Number), 0.7);
            // Only results with similarity >= 0.7 should be returned
            expect(results.length).toBe(2);
            expect(results[0].similarity).toBe(0.8);
            expect(results[1].similarity).toBe(0.9);
        });
    });
    // -----------------------------------------------------------------------
    // TC-005-3: Search includes source attribution
    // -----------------------------------------------------------------------
    describe('TC-005-3: Search includes source attribution', () => {
        it('should include document title, path, chunk_index, and tags in results', async () => {
            insertTestDocument(repository, {
                id: 'doc-1',
                title: 'API Reference Guide',
                path: '/docs/api-reference.md',
                format: 'md',
                tags: ['api', 'reference', 'v2'],
                chunks: [
                    { id: 'chunk-1-0', content: 'This chapter describes REST endpoints.', chunkIndex: 0 },
                    { id: 'chunk-1-1', content: 'This chapter describes WebSocket endpoints.', chunkIndex: 1 },
                ],
            });
            const vectorStorage = createMockVectorStorage([
                { id: 'chunk-1-1', score: 0.92, metadata: { documentId: 'doc-1', chunkIndex: 1 } },
            ]);
            const kbSearch = new KBSearch(embeddingProvider, vectorStorage, repository);
            const results = await kbSearch.search('WebSocket endpoints');
            expect(results.length).toBe(1);
            const result = results[0];
            // Source attribution
            expect(result.source.documentId).toBe('doc-1');
            expect(result.source.title).toBe('API Reference Guide');
            expect(result.source.path).toBe('/docs/api-reference.md');
            expect(result.source.tags).toEqual(['api', 'reference', 'v2']);
            // Chunk info
            expect(result.chunk.id).toBe('chunk-1-1');
            expect(result.chunk.content).toBe('This chapter describes WebSocket endpoints.');
            expect(result.chunk.chunkIndex).toBe(1);
            // Similarity
            expect(result.similarity).toBe(0.92);
        });
    });
    // -----------------------------------------------------------------------
    // TC-005-4: Search returns empty for no match
    // -----------------------------------------------------------------------
    describe('TC-005-4: Search returns empty for no match', () => {
        it('should return empty array when query matches no documents', async () => {
            insertTestDocument(repository, {
                id: 'doc-1',
                title: 'Unrelated Document',
                path: '/docs/unrelated.txt',
                format: 'txt',
                chunks: [{ id: 'chunk-1-0', content: 'Completely unrelated content', chunkIndex: 0 }],
            });
            // VectorStorage returns no results for this query
            const vectorStorage = createMockVectorStorage([]);
            const kbSearch = new KBSearch(embeddingProvider, vectorStorage, repository);
            const results = await kbSearch.search('quantum physics deep learning');
            expect(results).toEqual([]);
            expect(results.length).toBe(0);
        });
        it('should skip results when source document no longer exists', async () => {
            // No documents in the repository, but VectorStorage returns stale results
            const vectorStorage = createMockVectorStorage([
                { id: 'chunk-deleted-0', score: 0.95, metadata: { documentId: 'deleted-doc', chunkIndex: 0 } },
            ]);
            const kbSearch = new KBSearch(embeddingProvider, vectorStorage, repository);
            const results = await kbSearch.search('test query');
            expect(results).toEqual([]);
        });
    });
    // -----------------------------------------------------------------------
    // TC-005-5: Search handles empty query
    // -----------------------------------------------------------------------
    describe('TC-005-5: Search handles empty query', () => {
        it('should throw EmptyQueryError for empty string', async () => {
            await expect(search.search('')).rejects.toThrow(EmptyQueryError);
        });
        it('should throw EmptyQueryError for whitespace-only string', async () => {
            await expect(search.search('   ')).rejects.toThrow(EmptyQueryError);
        });
        it('should not throw for non-empty query', async () => {
            const vectorStorage = createMockVectorStorage([]);
            const kbSearch = new KBSearch(embeddingProvider, vectorStorage, repository);
            // Should not throw -- returns empty results because VectorStorage has no data
            await expect(kbSearch.search('valid query')).resolves.toEqual([]);
        });
    });
    // -----------------------------------------------------------------------
    // TC-005-6: RAG formatting produces valid markdown
    // -----------------------------------------------------------------------
    describe('TC-005-6: RAG formatting produces valid markdown', () => {
        it('should format results as markdown with sources and content', () => {
            const results = [
                {
                    chunk: {
                        id: 'chunk-1-0',
                        content: 'Content about REST API endpoints.',
                        chunkIndex: 0,
                    },
                    source: {
                        documentId: 'doc-1',
                        title: 'API Reference',
                        path: '/docs/api.md',
                        tags: ['api'],
                    },
                    similarity: 0.92,
                },
                {
                    chunk: {
                        id: 'chunk-2-0',
                        content: 'Content about authentication flow.',
                        chunkIndex: 0,
                    },
                    source: {
                        documentId: 'doc-2',
                        title: 'Auth Guide',
                        path: '/docs/auth.md',
                        tags: ['auth', 'guide'],
                    },
                    similarity: 0.85,
                },
                {
                    chunk: {
                        id: 'chunk-3-1',
                        content: 'Content about WebSocket connections.',
                        chunkIndex: 1,
                    },
                    source: {
                        documentId: 'doc-3',
                        title: 'WebSocket Docs',
                        path: '/docs/ws.md',
                        tags: ['ws'],
                    },
                    similarity: 0.78,
                },
            ];
            const formatted = search.formatForRAG(results);
            // Verify markdown structure
            expect(formatted).toContain('## Source: API Reference');
            expect(formatted).toContain('> Content about REST API endpoints.');
            expect(formatted).toContain('> _Path: /docs/api.md, Chunk: 0, Similarity: 0.9200_');
            expect(formatted).toContain('## Source: Auth Guide');
            expect(formatted).toContain('> Content about authentication flow.');
            expect(formatted).toContain('> _Path: /docs/auth.md, Chunk: 0, Similarity: 0.8500_');
            expect(formatted).toContain('## Source: WebSocket Docs');
            expect(formatted).toContain('> Content about WebSocket connections.');
            expect(formatted).toContain('> _Path: /docs/ws.md, Chunk: 1, Similarity: 0.7800_');
        });
        it('should return empty string for empty results', () => {
            const formatted = search.formatForRAG([]);
            expect(formatted).toBe('');
        });
        it('should format single result correctly', () => {
            const results = [
                {
                    chunk: {
                        id: 'chunk-1-0',
                        content: 'Single result content.',
                        chunkIndex: 0,
                    },
                    source: {
                        documentId: 'doc-1',
                        title: 'Single Doc',
                        path: '/docs/single.txt',
                        tags: [],
                    },
                    similarity: 0.88,
                },
            ];
            const formatted = search.formatForRAG(results);
            expect(formatted).toContain('## Source: Single Doc');
            expect(formatted).toContain('> Single result content.');
            expect(formatted).toContain('> _Path: /docs/single.txt, Chunk: 0, Similarity: 0.8800_');
            // Should not have double newlines between sections for single result
            expect(formatted).not.toContain('\n\n\n');
        });
    });
    // -----------------------------------------------------------------------
    // TC-005-7: Search respects top_k=1
    // -----------------------------------------------------------------------
    describe('TC-005-7: Search respects top_k=1', () => {
        it('should return at most 1 result when topK=1', async () => {
            insertTestDocument(repository, {
                id: 'doc-1',
                title: 'Document One',
                path: '/docs/one.txt',
                format: 'txt',
                chunks: [{ id: 'chunk-1-0', content: 'First content', chunkIndex: 0 }],
            });
            insertTestDocument(repository, {
                id: 'doc-2',
                title: 'Document Two',
                path: '/docs/two.txt',
                format: 'txt',
                chunks: [{ id: 'chunk-2-0', content: 'Second content', chunkIndex: 0 }],
            });
            insertTestDocument(repository, {
                id: 'doc-3',
                title: 'Document Three',
                path: '/docs/three.txt',
                format: 'txt',
                chunks: [{ id: 'chunk-3-0', content: 'Third content', chunkIndex: 0 }],
            });
            // VectorStorage returns 3 results, but KBSearch passes topK=1
            const vectorStorage = createMockVectorStorage([
                { id: 'chunk-1-0', score: 0.95, metadata: { documentId: 'doc-1', chunkIndex: 0 } },
                { id: 'chunk-2-0', score: 0.85, metadata: { documentId: 'doc-2', chunkIndex: 0 } },
                { id: 'chunk-3-0', score: 0.75, metadata: { documentId: 'doc-3', chunkIndex: 0 } },
            ]);
            const kbSearch = new KBSearch(embeddingProvider, vectorStorage, repository);
            const results = await kbSearch.search('test query', { topK: 1 });
            // VectorStorage should have been called with topK=1
            expect(vectorStorage.search).toHaveBeenCalledWith(expect.any(Array), 1, expect.any(Number));
            // Should return at most 1 result (the highest similarity)
            expect(results.length).toBeLessThanOrEqual(1);
        });
    });
    // -----------------------------------------------------------------------
    // Additional tests: tag filtering, constructor defaults
    // -----------------------------------------------------------------------
    describe('Tag filtering', () => {
        it('should filter results by tags from config', async () => {
            insertTestDocument(repository, {
                id: 'doc-api',
                title: 'API Doc',
                path: '/docs/api.txt',
                format: 'txt',
                tags: ['api'],
                chunks: [{ id: 'chunk-api-0', content: 'API content', chunkIndex: 0 }],
            });
            insertTestDocument(repository, {
                id: 'doc-guide',
                title: 'Guide Doc',
                path: '/docs/guide.txt',
                format: 'txt',
                tags: ['guide'],
                chunks: [{ id: 'chunk-guide-0', content: 'Guide content', chunkIndex: 0 }],
            });
            insertTestDocument(repository, {
                id: 'doc-api-v2',
                title: 'API V2 Doc',
                path: '/docs/api-v2.txt',
                format: 'txt',
                tags: ['api', 'v2'],
                chunks: [{ id: 'chunk-api-v2-0', content: 'API V2 content', chunkIndex: 0 }],
            });
            const vectorStorage = createMockVectorStorage([
                { id: 'chunk-api-0', score: 0.9, metadata: { documentId: 'doc-api', chunkIndex: 0 } },
                { id: 'chunk-guide-0', score: 0.85, metadata: { documentId: 'doc-guide', chunkIndex: 0 } },
                { id: 'chunk-api-v2-0', score: 0.8, metadata: { documentId: 'doc-api-v2', chunkIndex: 0 } },
            ]);
            const kbSearch = new KBSearch(embeddingProvider, vectorStorage, repository);
            const results = await kbSearch.search('test query', { tags: ['api'] });
            // Only documents with 'api' tag should be included
            expect(results.length).toBe(2);
            const titles = results.map(r => r.source.title);
            expect(titles).toContain('API Doc');
            expect(titles).toContain('API V2 Doc');
            expect(titles).not.toContain('Guide Doc');
        });
    });
    describe('Constructor default config', () => {
        it('should use constructor defaults when no config provided', async () => {
            const vectorStorage = createMockVectorStorage([]);
            const kbSearch = new KBSearch(embeddingProvider, vectorStorage, repository, { topK: 3, minSimilarity: 0.5 });
            await kbSearch.search('test query');
            // Verify VectorStorage was called with constructor defaults
            expect(vectorStorage.search).toHaveBeenCalledWith(expect.any(Array), 3, 0.5);
        });
        it('should allow caller config to override constructor defaults', async () => {
            const vectorStorage = createMockVectorStorage([]);
            const kbSearch = new KBSearch(embeddingProvider, vectorStorage, repository, { topK: 3, minSimilarity: 0.5 });
            await kbSearch.search('test query', { topK: 1, minSimilarity: 0.9 });
            // Caller overrides should take precedence
            expect(vectorStorage.search).toHaveBeenCalledWith(expect.any(Array), 1, 0.9);
        });
    });
    describe('Embedding integration', () => {
        it('should call embed with the query string', async () => {
            const vectorStorage = createMockVectorStorage([]);
            const kbSearch = new KBSearch(embeddingProvider, vectorStorage, repository);
            await kbSearch.search('search query text');
            expect(embeddingProvider.embed).toHaveBeenCalledWith('search query text');
        });
    });
});
//# sourceMappingURL=kb-search.test.js.map