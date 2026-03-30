/**
 * @osai/knowledge-base -- SourceManager unit tests (T-006)
 *
 * Test cases:
 *   TC-006-1: Add source ingests document
 *   TC-006-2: Remove source deletes all related data
 *   TC-006-3: Remove non-existent source throws
 *   TC-006-4: List sources returns all documents
 *   TC-006-5: List sources filters by tags
 *   TC-006-6: Get stats returns correct counts
 *   TC-006-7: Add source with duplicate path
 *
 * All dependencies (IngestPipeline, KnowledgeRepository, VectorStorage) are mocked.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SourceManager, SourceNotFoundError } from '../../sources/source-manager.js';
// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------
function createMockDocument(overrides = {}) {
    return {
        id: 'doc-001',
        title: 'Test Document',
        path: '/path/to/doc.txt',
        format: 'txt',
        status: 'completed',
        chunksCount: 5,
        totalSize: 1024,
        tags: ['api', 'reference'],
        createdAt: 1700000000,
        updatedAt: 1700000000,
        ...overrides,
    };
}
function createMockChunk(overrides = {}) {
    return {
        id: 'chunk_doc-001_0',
        documentId: 'doc-001',
        content: 'Test chunk content',
        chunkIndex: 0,
        createdAt: 1700000000,
        ...overrides,
    };
}
// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------
function createMockIngestPipeline() {
    return {
        pipeline: {
            ingestDocument: vi.fn(),
        },
        ingestDocument: vi.fn(),
    };
}
function createMockRepository(documents = [], chunks = []) {
    const getDocument = vi.fn();
    const listDocuments = vi.fn().mockReturnValue(documents);
    const getChunksByDocument = vi.fn().mockReturnValue(chunks);
    const deleteDocument = vi.fn();
    return {
        repository: {
            getDocument,
            listDocuments,
            getChunksByDocument,
            deleteDocument,
        },
        getDocument,
        listDocuments,
        getChunksByDocument,
        deleteDocument,
    };
}
function createMockVectorStorage() {
    const deleteFn = vi.fn();
    return {
        vectorStorage: {
            delete: deleteFn,
        },
        deleteFn,
    };
}
// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('SourceManager', () => {
    let manager;
    let pipeline;
    let repo;
    let vector;
    beforeEach(() => {
        pipeline = createMockIngestPipeline();
        repo = createMockRepository();
        vector = createMockVectorStorage();
        // Fix: pipeline.pipeline is the mock object, pipeline.ingestDocument is the spy
        // We need to set up the mock correctly
        const mockPipeline = {
            ingestDocument: pipeline.ingestDocument,
        };
        manager = new SourceManager(mockPipeline, repo.repository, vector.vectorStorage);
    });
    // -----------------------------------------------------------------------
    // TC-006-1: Add source ingests document
    // -----------------------------------------------------------------------
    describe('addSource', () => {
        it('TC-006-1: should ingest document and return document ID', async () => {
            pipeline.ingestDocument.mockResolvedValue({
                documentId: 'doc-new-001',
                chunksStored: 5,
                status: 'completed',
                durationMs: 100,
                totalTokens: 500,
            });
            const result = await manager.addSource('/path/to/file.txt', Buffer.from('content'));
            expect(result).toEqual({ documentId: 'doc-new-001' });
            expect(pipeline.ingestDocument).toHaveBeenCalledWith('/path/to/file.txt', expect.any(Buffer), undefined, undefined);
        });
        it('TC-006-1: should pass format and tags to pipeline', async () => {
            pipeline.ingestDocument.mockResolvedValue({
                documentId: 'doc-new-002',
                chunksStored: 3,
                status: 'completed',
                durationMs: 50,
                totalTokens: 300,
            });
            const tags = ['api', 'docs'];
            const result = await manager.addSource('/path/to/doc.md', Buffer.from('# Hello'), 'md', tags);
            expect(result.documentId).toBe('doc-new-002');
            expect(pipeline.ingestDocument).toHaveBeenCalledWith('/path/to/doc.md', expect.any(Buffer), 'md', tags);
        });
    });
    // -----------------------------------------------------------------------
    // TC-006-2: Remove source deletes all related data
    // -----------------------------------------------------------------------
    describe('removeSource', () => {
        it('TC-006-2: should delete document, chunks, and vectors', async () => {
            const doc = createMockDocument({ id: 'doc-remove-001' });
            const chunks = [
                createMockChunk({ id: 'chunk_doc-remove-001_0', documentId: 'doc-remove-001' }),
                createMockChunk({ id: 'chunk_doc-remove-001_1', documentId: 'doc-remove-001', chunkIndex: 1 }),
                createMockChunk({ id: 'chunk_doc-remove-001_2', documentId: 'doc-remove-001', chunkIndex: 2 }),
                createMockChunk({ id: 'chunk_doc-remove-001_3', documentId: 'doc-remove-001', chunkIndex: 3 }),
                createMockChunk({ id: 'chunk_doc-remove-001_4', documentId: 'doc-remove-001', chunkIndex: 4 }),
            ];
            repo.getDocument.mockReturnValue(doc);
            repo.getChunksByDocument.mockReturnValue(chunks);
            await manager.removeSource('doc-remove-001');
            // Verify vectors were deleted for each chunk
            expect(vector.deleteFn).toHaveBeenCalledTimes(5);
            expect(vector.deleteFn).toHaveBeenCalledWith('chunk_doc-remove-001_0');
            expect(vector.deleteFn).toHaveBeenCalledWith('chunk_doc-remove-001_4');
            // Verify document was deleted (chunks cascade via FK)
            expect(repo.deleteDocument).toHaveBeenCalledWith('doc-remove-001');
        });
        it('TC-006-2: should handle document with zero chunks', async () => {
            const doc = createMockDocument({ id: 'doc-empty-001', chunksCount: 0 });
            repo.getDocument.mockReturnValue(doc);
            repo.getChunksByDocument.mockReturnValue([]);
            await manager.removeSource('doc-empty-001');
            expect(vector.deleteFn).not.toHaveBeenCalled();
            expect(repo.deleteDocument).toHaveBeenCalledWith('doc-empty-001');
        });
    });
    // -----------------------------------------------------------------------
    // TC-006-3: Remove non-existent source throws
    // -----------------------------------------------------------------------
    describe('removeSource (not found)', () => {
        it('TC-006-3: should throw SourceNotFoundError for non-existent document', async () => {
            repo.getDocument.mockReturnValue(null);
            await expect(manager.removeSource('doc-nonexistent')).rejects.toThrow(SourceNotFoundError);
            await expect(manager.removeSource('doc-nonexistent')).rejects.toThrow('Source not found: doc-nonexistent');
            // Verify no cleanup was attempted
            expect(vector.deleteFn).not.toHaveBeenCalled();
            expect(repo.deleteDocument).not.toHaveBeenCalled();
        });
    });
    // -----------------------------------------------------------------------
    // TC-006-4: List sources returns all documents
    // -----------------------------------------------------------------------
    describe('listSources', () => {
        it('TC-006-4: should return all documents as SourceInfo', () => {
            const docs = [
                createMockDocument({ id: 'doc-001', title: 'Doc 1', path: '/a.txt' }),
                createMockDocument({ id: 'doc-002', title: 'Doc 2', path: '/b.md', format: 'md' }),
                createMockDocument({ id: 'doc-003', title: 'Doc 3', path: '/c.pdf', format: 'pdf' }),
            ];
            repo.listDocuments.mockReturnValue(docs);
            const result = manager.listSources();
            expect(result).toHaveLength(3);
            expect(result[0].documentId).toBe('doc-001');
            expect(result[0].title).toBe('Doc 1');
            expect(result[0].format).toBe('txt');
            expect(result[1].documentId).toBe('doc-002');
            expect(result[2].documentId).toBe('doc-003');
        });
        it('TC-006-4: should return empty array when no documents exist', () => {
            repo.listDocuments.mockReturnValue([]);
            const result = manager.listSources();
            expect(result).toEqual([]);
        });
        it('TC-006-4: should convert timestamps to ISO strings', () => {
            const docs = [
                createMockDocument({ createdAt: 1700000000, updatedAt: 1700000100 }),
            ];
            repo.listDocuments.mockReturnValue(docs);
            const result = manager.listSources();
            expect(result[0].createdAt).toBe(new Date(1700000000 * 1000).toISOString());
            expect(result[0].updatedAt).toBe(new Date(1700000100 * 1000).toISOString());
        });
        it('TC-006-4: should include tags as SourceTag array', () => {
            const docs = [
                createMockDocument({ tags: ['api', 'reference'] }),
            ];
            repo.listDocuments.mockReturnValue(docs);
            const result = manager.listSources();
            expect(result[0].tags).toEqual([
                { name: 'api' },
                { name: 'reference' },
            ]);
        });
    });
    // -----------------------------------------------------------------------
    // TC-006-5: List sources filters by tags
    // -----------------------------------------------------------------------
    describe('listSources (tag filter)', () => {
        it('TC-006-5: should filter documents containing ALL specified tags', () => {
            const docs = [
                createMockDocument({ id: 'doc-001', tags: ['api', 'reference'] }),
                createMockDocument({ id: 'doc-002', tags: ['api'] }),
                createMockDocument({ id: 'doc-003', tags: ['docs', 'reference'] }),
            ];
            repo.listDocuments.mockReturnValue(docs);
            const result = manager.listSources({ tags: ['api'] });
            expect(result).toHaveLength(2);
            expect(result.map(r => r.documentId)).toEqual(['doc-001', 'doc-002']);
        });
        it('TC-006-5: should require ALL tags to match (AND logic)', () => {
            const docs = [
                createMockDocument({ id: 'doc-001', tags: ['api', 'reference'] }),
                createMockDocument({ id: 'doc-002', tags: ['api'] }),
                createMockDocument({ id: 'doc-003', tags: ['api', 'reference', 'internal'] }),
            ];
            repo.listDocuments.mockReturnValue(docs);
            const result = manager.listSources({ tags: ['api', 'reference'] });
            expect(result).toHaveLength(2);
            expect(result.map(r => r.documentId)).toEqual(['doc-001', 'doc-003']);
        });
        it('TC-006-5: should return empty when no documents match all tags', () => {
            const docs = [
                createMockDocument({ id: 'doc-001', tags: ['api'] }),
                createMockDocument({ id: 'doc-002', tags: ['docs'] }),
            ];
            repo.listDocuments.mockReturnValue(docs);
            const result = manager.listSources({ tags: ['api', 'nonexistent'] });
            expect(result).toHaveLength(0);
        });
        it('TC-006-5: should handle empty tags array (returns all)', () => {
            const docs = [
                createMockDocument({ id: 'doc-001' }),
                createMockDocument({ id: 'doc-002' }),
            ];
            repo.listDocuments.mockReturnValue(docs);
            const result = manager.listSources({ tags: [] });
            expect(result).toHaveLength(2);
        });
    });
    // -----------------------------------------------------------------------
    // TC-006-6: Get stats returns correct counts
    // -----------------------------------------------------------------------
    describe('getSourceStats', () => {
        it('TC-006-6: should return total count and breakdown by format', () => {
            const docs = [
                createMockDocument({ id: 'doc-001', format: 'txt' }),
                createMockDocument({ id: 'doc-002', format: 'txt' }),
                createMockDocument({ id: 'doc-003', format: 'txt' }),
                createMockDocument({ id: 'doc-004', format: 'pdf' }),
                createMockDocument({ id: 'doc-005', format: 'pdf' }),
            ];
            repo.listDocuments.mockReturnValue(docs);
            const stats = manager.getSourceStats();
            expect(stats.total).toBe(5);
            expect(stats.byFormat).toEqual({ txt: 3, pdf: 2 });
        });
        it('TC-006-6: should count by tag', () => {
            const docs = [
                createMockDocument({ id: 'doc-001', tags: ['api', 'internal'] }),
                createMockDocument({ id: 'doc-002', tags: ['api', 'reference'] }),
                createMockDocument({ id: 'doc-003', tags: ['docs'] }),
            ];
            repo.listDocuments.mockReturnValue(docs);
            const stats = manager.getSourceStats();
            expect(stats.byTag).toEqual({
                api: 2,
                internal: 1,
                reference: 1,
                docs: 1,
            });
        });
        it('TC-006-6: should return zeroed stats for empty knowledge base', () => {
            repo.listDocuments.mockReturnValue([]);
            const stats = manager.getSourceStats();
            expect(stats).toEqual({
                total: 0,
                byFormat: {},
                byTag: {},
            });
        });
    });
    // -----------------------------------------------------------------------
    // TC-006-7: Add source with duplicate path
    // -----------------------------------------------------------------------
    describe('addSource (duplicate)', () => {
        it('TC-006-7: should propagate DocumentAlreadyExistsError from pipeline', async () => {
            const { DocumentAlreadyExistsError } = await import('../../ingest/ingest-pipeline.js');
            pipeline.ingestDocument.mockRejectedValue(new DocumentAlreadyExistsError('/path/to/existing.txt'));
            await expect(manager.addSource('/path/to/existing.txt', Buffer.from('content'))).rejects.toThrow(DocumentAlreadyExistsError);
            await expect(manager.addSource('/path/to/existing.txt', Buffer.from('content'))).rejects.toThrow('Document already exists: /path/to/existing.txt');
        });
    });
});
//# sourceMappingURL=source-manager.test.js.map