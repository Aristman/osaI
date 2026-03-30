import { describe, it, expect, vi, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { IngestPipeline, DocumentAlreadyExistsError } from '../../ingest/ingest-pipeline.js';
import { KnowledgeRepository } from '../../db/repository.js';
import { ParserRegistry } from '../../parsers/parser-registry.js';
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function createMockEmbeddingProvider(failOnIndex) {
    const embedFn = vi.fn(async (texts) => {
        const input = Array.isArray(texts) ? texts : [texts];
        const results = [];
        for (let i = 0; i < input.length; i++) {
            if (failOnIndex !== undefined && i === failOnIndex) {
                throw new Error('Embedding failed');
            }
            results.push({
                vector: Array.from({ length: 768 }, () => Math.random()),
                dimensions: 768,
                provider: 'ollama',
                durationMs: 10,
            });
        }
        return Array.isArray(texts) ? results : results[0];
    });
    return {
        name: 'mock-embedding',
        embed: embedFn,
        isAvailable: vi.fn(async () => true),
        getDimensions: vi.fn(() => 768),
    };
}
function createMockVectorStorage() {
    const entries = new Map();
    return {
        init: vi.fn(),
        upsert: vi.fn((id, vector, metadata) => {
            entries.set(id, { vector, metadata });
        }),
        delete: vi.fn((id) => {
            entries.delete(id);
        }),
        search: vi.fn((_queryVector, _topK, _minSimilarity) => []),
        _entries: entries,
    };
}
function createTestDb() {
    const db = new Database(':memory:');
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    return db;
}
// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('IngestPipeline', () => {
    let db;
    let repository;
    let parserRegistry;
    let embeddingProvider;
    let vectorStorage;
    let pipeline;
    beforeEach(() => {
        db = createTestDb();
        repository = new KnowledgeRepository(db);
        repository.initSchema();
        parserRegistry = new ParserRegistry();
        embeddingProvider = createMockEmbeddingProvider();
        vectorStorage = createMockVectorStorage();
        pipeline = new IngestPipeline(repository, parserRegistry, embeddingProvider, vectorStorage, db);
    });
    describe('TC-004-5: Pipeline completes end-to-end', () => {
        it('should ingest a txt document and store document + chunks + vectors', async () => {
            const content = 'This is a test document. '.repeat(100); // ~500 tokens
            const buffer = Buffer.from(content, 'utf-8');
            const result = await pipeline.ingestDocument('/test/doc.txt', buffer, 'txt', ['test']);
            expect(result.documentId).toBeDefined();
            expect(result.chunksStored).toBeGreaterThan(0);
            expect(result.status).toBe('completed');
            // Verify document stored in DB
            const doc = repository.getDocument(result.documentId);
            expect(doc).not.toBeNull();
            expect(doc.path).toBe('/test/doc.txt');
            expect(doc.status).toBe('completed');
            expect(doc.chunksCount).toBe(result.chunksStored);
            // Verify chunks stored in DB
            const chunks = repository.getChunksByDocument(result.documentId);
            expect(chunks.length).toBe(result.chunksStored);
            // Verify vectors stored in VectorStorage
            expect(vectorStorage.upsert).toHaveBeenCalledTimes(result.chunksStored);
        });
    });
    describe('TC-004-6: Pipeline rolls back on embed failure', () => {
        it('should roll back all data when embedding fails', async () => {
            const content = 'Embedding will fail. '.repeat(200); // ~1000 tokens -> 2+ chunks
            const buffer = Buffer.from(content, 'utf-8');
            // Create provider that fails on index 1
            const failingProvider = createMockEmbeddingProvider(1);
            const failingStorage = createMockVectorStorage();
            const failingPipeline = new IngestPipeline(repository, parserRegistry, failingProvider, failingStorage, db);
            await expect(failingPipeline.ingestDocument('/test/fail.txt', buffer, 'txt', ['test'])).rejects.toThrow('Embedding failed');
            // Verify document was rolled back (no partial data)
            const docs = repository.listDocuments();
            expect(docs).toHaveLength(0);
            // Verify chunks were rolled back
            expect(failingStorage.upsert).not.toHaveBeenCalled();
        });
    });
    describe('TC-004-7: Pipeline emits progress events', () => {
        it('should emit chunk:embedded for each chunk and document:stored at the end', async () => {
            const content = 'Progress tracking test. '.repeat(200); // multiple chunks
            const buffer = Buffer.from(content, 'utf-8');
            const events = [];
            pipeline.on('progress', (data) => events.push({ event: 'progress', data }));
            pipeline.on('chunk:embedded', (data) => events.push({ event: 'chunk:embedded', data }));
            pipeline.on('document:stored', (data) => events.push({ event: 'document:stored', data }));
            const result = await pipeline.ingestDocument('/test/progress.txt', buffer, 'txt');
            expect(result.chunksStored).toBeGreaterThan(0);
            // Verify chunk:embedded events
            const embeddedEvents = events.filter(e => e.event === 'chunk:embedded');
            expect(embeddedEvents.length).toBe(result.chunksStored);
            // Verify document:stored event
            const storedEvents = events.filter(e => e.event === 'document:stored');
            expect(storedEvents.length).toBe(1);
        });
    });
    describe('TC-004-8: Pipeline handles duplicate document', () => {
        it('should throw DocumentAlreadyExistsError for duplicate path', async () => {
            const content = 'First document.';
            const buffer = Buffer.from(content, 'utf-8');
            // Ingest first document
            await pipeline.ingestDocument('/test/dup.txt', buffer, 'txt');
            // Attempt to ingest duplicate
            await expect(pipeline.ingestDocument('/test/dup.txt', buffer, 'txt')).rejects.toThrow(DocumentAlreadyExistsError);
        });
    });
    describe('Checksum dedup', () => {
        it('should store checksum for the ingested document', async () => {
            const content = 'Checksum test content.';
            const buffer = Buffer.from(content, 'utf-8');
            const result = await pipeline.ingestDocument('/test/checksum.txt', buffer, 'txt');
            const doc = repository.getDocument(result.documentId);
            expect(doc).not.toBeNull();
            expect(doc.checksum).toBeDefined();
            expect(doc.checksum).not.toBe('');
        });
        it('should store different checksums for different content', async () => {
            const buffer1 = Buffer.from('Content A', 'utf-8');
            const buffer2 = Buffer.from('Content B', 'utf-8');
            const result1 = await pipeline.ingestDocument('/test/a.txt', buffer1, 'txt');
            const result2 = await pipeline.ingestDocument('/test/b.txt', buffer2, 'txt');
            const doc1 = repository.getDocument(result1.documentId);
            const doc2 = repository.getDocument(result2.documentId);
            expect(doc1.checksum).not.toBe(doc2.checksum);
        });
    });
    describe('Pipeline with tags', () => {
        it('should store tags correctly', async () => {
            const content = 'Tagged document.';
            const buffer = Buffer.from(content, 'utf-8');
            const tags = ['api', 'reference', 'v2'];
            const result = await pipeline.ingestDocument('/test/tagged.txt', buffer, 'txt', tags);
            const doc = repository.getDocument(result.documentId);
            expect(doc).not.toBeNull();
            expect(doc.tags).toEqual(tags);
        });
    });
    describe('Pipeline with format auto-detection', () => {
        it('should auto-detect format from file extension when not provided', async () => {
            const content = 'Auto format detection.';
            const buffer = Buffer.from(content, 'utf-8');
            const result = await pipeline.ingestDocument('/test/auto.md', buffer);
            const doc = repository.getDocument(result.documentId);
            expect(doc).not.toBeNull();
            expect(doc.format).toBe('md');
        });
    });
    describe('Document title extraction', () => {
        it('should extract title from parsed document', async () => {
            const content = '# My Document Title\n\nSome content here.';
            const buffer = Buffer.from(content, 'utf-8');
            const result = await pipeline.ingestDocument('/test/title.md', buffer, 'md');
            const doc = repository.getDocument(result.documentId);
            expect(doc).not.toBeNull();
            expect(doc.title).toBe('My Document Title');
        });
        it('should use filename as title when no title in document', async () => {
            const content = 'Plain text without headers.';
            const buffer = Buffer.from(content, 'utf-8');
            const result = await pipeline.ingestDocument('/test/plain.txt', buffer, 'txt');
            const doc = repository.getDocument(result.documentId);
            expect(doc).not.toBeNull();
            expect(doc.title).toBe('plain.txt');
        });
    });
});
//# sourceMappingURL=ingest-pipeline.test.js.map