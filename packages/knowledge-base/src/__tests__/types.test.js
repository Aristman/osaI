import { describe, it, expect } from 'vitest';
import { DocumentFormat, DocumentStatus, KB_SEARCH_DEFAULTS, resolveKBSearchConfig, } from '../types/index.js';
// ---------------------------------------------------------------------------
// TC-001-1: DocumentFormat enum values
// ---------------------------------------------------------------------------
describe('DocumentFormat', () => {
    it('should contain txt, md, pdf values', () => {
        expect(DocumentFormat.Txt).toBe('txt');
        expect(DocumentFormat.Md).toBe('md');
        expect(DocumentFormat.Pdf).toBe('pdf');
    });
    it('should have exactly three format values', () => {
        const values = Object.values(DocumentFormat);
        expect(values).toHaveLength(3);
        expect(values).toContain('txt');
        expect(values).toContain('md');
        expect(values).toContain('pdf');
    });
});
// ---------------------------------------------------------------------------
// TC-001-2: KnowledgeDocument fields are correctly typed
// ---------------------------------------------------------------------------
describe('KnowledgeDocument', () => {
    it('should accept all required fields', () => {
        const doc = {
            id: 'doc-001',
            title: 'Test Document',
            path: '/tmp/test.txt',
            format: DocumentFormat.Txt,
            status: DocumentStatus.Pending,
            chunksCount: 0,
            totalSize: 1024,
            tags: ['test'],
            createdAt: Date.now(),
            updatedAt: Date.now(),
        };
        expect(doc.id).toBe('doc-001');
        expect(doc.title).toBe('Test Document');
        expect(doc.path).toBe('/tmp/test.txt');
        expect(doc.format).toBe('txt');
        expect(doc.status).toBe('pending');
        expect(doc.chunksCount).toBe(0);
        expect(doc.totalSize).toBe(1024);
        expect(doc.tags).toEqual(['test']);
    });
    it('should accept optional checksum field', () => {
        const doc = {
            id: 'doc-002',
            title: 'Checksum Doc',
            path: '/tmp/checksum.txt',
            format: DocumentFormat.Txt,
            status: DocumentStatus.Completed,
            chunksCount: 5,
            totalSize: 2048,
            tags: [],
            createdAt: Date.now(),
            updatedAt: Date.now(),
            checksum: 'sha256-abc123',
        };
        expect(doc.checksum).toBe('sha256-abc123');
    });
    it('should work without optional checksum', () => {
        const doc = {
            id: 'doc-003',
            title: 'No Checksum',
            path: '/tmp/nochecksum.txt',
            format: DocumentFormat.Txt,
            status: DocumentStatus.Pending,
            chunksCount: 0,
            totalSize: 0,
            tags: [],
            createdAt: Date.now(),
            updatedAt: Date.now(),
        };
        expect(doc.checksum).toBeUndefined();
    });
});
// ---------------------------------------------------------------------------
// InsertKnowledgeDocument type
// ---------------------------------------------------------------------------
describe('InsertKnowledgeDocument', () => {
    it('should accept minimal required fields', () => {
        const insert = {
            id: 'doc-004',
            title: 'New Doc',
            path: '/tmp/new.txt',
            format: DocumentFormat.Txt,
        };
        expect(insert.id).toBe('doc-004');
        expect(insert.title).toBe('New Doc');
    });
    it('should accept optional fields', () => {
        const insert = {
            id: 'doc-005',
            title: 'Full Doc',
            path: '/tmp/full.txt',
            format: DocumentFormat.Md,
            status: DocumentStatus.Pending,
            chunksCount: 0,
            totalSize: 512,
            tags: ['guide'],
            checksum: 'sha256-xyz',
        };
        expect(insert.status).toBe('pending');
        expect(insert.tags).toEqual(['guide']);
    });
});
// ---------------------------------------------------------------------------
// UpdateKnowledgeDocument type
// ---------------------------------------------------------------------------
describe('UpdateKnowledgeDocument', () => {
    it('should accept partial updates', () => {
        const update = { title: 'Updated Title' };
        expect(update.title).toBe('Updated Title');
    });
    it('should accept multiple fields', () => {
        const update = {
            status: DocumentStatus.Completed,
            chunksCount: 10,
            tags: ['api', 'v2'],
        };
        expect(update.status).toBe('completed');
        expect(update.chunksCount).toBe(10);
        expect(update.tags).toEqual(['api', 'v2']);
    });
});
// ---------------------------------------------------------------------------
// ListDocumentsFilter type
// ---------------------------------------------------------------------------
describe('ListDocumentsFilter', () => {
    it('should accept empty filter', () => {
        const filter = {};
        expect(Object.keys(filter)).toHaveLength(0);
    });
    it('should accept format filter', () => {
        const filter = { format: DocumentFormat.Pdf };
        expect(filter.format).toBe('pdf');
    });
    it('should accept tag filter', () => {
        const filter = { tag: 'api' };
        expect(filter.tag).toBe('api');
    });
});
// ---------------------------------------------------------------------------
// DocumentStatus enum values
// ---------------------------------------------------------------------------
describe('DocumentStatus', () => {
    it('should contain pending, processing, completed, error values', () => {
        expect(DocumentStatus.Pending).toBe('pending');
        expect(DocumentStatus.Processing).toBe('processing');
        expect(DocumentStatus.Completed).toBe('completed');
        expect(DocumentStatus.Error).toBe('error');
    });
    it('should have exactly four status values', () => {
        const values = Object.values(DocumentStatus);
        expect(values).toHaveLength(4);
    });
});
// ---------------------------------------------------------------------------
// ChunkMetadata and KnowledgeChunk
// ---------------------------------------------------------------------------
describe('ChunkMetadata', () => {
    it('should accept all fields', () => {
        const metadata = {
            chunkIndex: 0,
            tokenCount: 512,
            charOffset: 0,
            charLength: 2048,
        };
        expect(metadata.chunkIndex).toBe(0);
        expect(metadata.tokenCount).toBe(512);
        expect(metadata.charOffset).toBe(0);
        expect(metadata.charLength).toBe(2048);
    });
});
describe('KnowledgeChunk', () => {
    it('should accept all required fields', () => {
        const chunk = {
            id: 'chunk-001',
            documentId: 'doc-001',
            content: 'Sample chunk content',
            chunkIndex: 0,
            createdAt: Date.now(),
        };
        expect(chunk.id).toBe('chunk-001');
        expect(chunk.documentId).toBe('doc-001');
        expect(chunk.content).toBe('Sample chunk content');
        expect(chunk.chunkIndex).toBe(0);
    });
});
describe('InsertKnowledgeChunk', () => {
    it('should accept all required fields', () => {
        const insert = {
            id: 'chunk-002',
            documentId: 'doc-001',
            content: 'Another chunk',
            chunkIndex: 1,
        };
        expect(insert.id).toBe('chunk-002');
        expect(insert.documentId).toBe('doc-001');
        expect(insert.chunkIndex).toBe(1);
    });
});
// ---------------------------------------------------------------------------
// TC-001-3: KBSearchQuery accepts topK and minSimilarity, defaults
// ---------------------------------------------------------------------------
describe('KBSearchConfig defaults', () => {
    it('should have default topK=5', () => {
        expect(KB_SEARCH_DEFAULTS.topK).toBe(5);
    });
    it('should have default minSimilarity=0.7', () => {
        expect(KB_SEARCH_DEFAULTS.minSimilarity).toBe(0.7);
    });
    it('should resolve empty config to defaults', () => {
        const resolved = resolveKBSearchConfig();
        expect(resolved.topK).toBe(5);
        expect(resolved.minSimilarity).toBe(0.7);
        expect(resolved.tags).toEqual([]);
    });
    it('should resolve partial config with defaults', () => {
        const config = { topK: 3 };
        const resolved = resolveKBSearchConfig(config);
        expect(resolved.topK).toBe(3);
        expect(resolved.minSimilarity).toBe(0.7);
        expect(resolved.tags).toEqual([]);
    });
    it('should resolve config with all fields', () => {
        const config = { topK: 10, minSimilarity: 0.5, tags: ['api'] };
        const resolved = resolveKBSearchConfig(config);
        expect(resolved.topK).toBe(10);
        expect(resolved.minSimilarity).toBe(0.5);
        expect(resolved.tags).toEqual(['api']);
    });
});
// ---------------------------------------------------------------------------
// KBSearchQuery type
// ---------------------------------------------------------------------------
describe('KBSearchQuery', () => {
    it('should accept query with config', () => {
        const query = {
            query: 'how to configure osai',
            config: { topK: 3, minSimilarity: 0.8 },
        };
        expect(query.query).toBe('how to configure osai');
    });
    it('should accept query without config', () => {
        const query = {
            query: 'simple search',
        };
        expect(query.query).toBe('simple search');
        expect(query.config).toBeUndefined();
    });
});
// ---------------------------------------------------------------------------
// KBSearchResult type
// ---------------------------------------------------------------------------
describe('KBSearchResult', () => {
    it('should accept all required fields', () => {
        const result = {
            chunk: {
                id: 'chunk-001',
                content: 'Configuration is done via osai.json',
                chunkIndex: 2,
            },
            source: {
                documentId: 'doc-001',
                title: 'Configuration Guide',
                path: '/tmp/config.md',
                tags: ['config', 'guide'],
            },
            similarity: 0.92,
        };
        expect(result.chunk.id).toBe('chunk-001');
        expect(result.chunk.content).toBe('Configuration is done via osai.json');
        expect(result.chunk.chunkIndex).toBe(2);
        expect(result.source.documentId).toBe('doc-001');
        expect(result.source.title).toBe('Configuration Guide');
        expect(result.source.path).toBe('/tmp/config.md');
        expect(result.source.tags).toEqual(['config', 'guide']);
        expect(result.similarity).toBe(0.92);
    });
});
// ---------------------------------------------------------------------------
// SourceInfo and SourceTag
// ---------------------------------------------------------------------------
describe('SourceInfo', () => {
    it('should accept all required fields', () => {
        const tag = { name: 'api', color: '#ff0000' };
        const info = {
            documentId: 'doc-001',
            title: 'API Documentation',
            path: '/tmp/api.md',
            format: 'md',
            status: 'completed',
            chunksCount: 10,
            totalSize: 4096,
            tags: [tag],
            createdAt: '2026-03-30T00:00:00.000Z',
            updatedAt: '2026-03-30T00:00:00.000Z',
        };
        expect(info.documentId).toBe('doc-001');
        expect(info.tags[0].name).toBe('api');
        expect(info.tags[0].color).toBe('#ff0000');
    });
    it('should accept tag without color', () => {
        const tag = { name: 'guide' };
        const info = {
            documentId: 'doc-002',
            title: 'Guide',
            path: '/tmp/guide.txt',
            format: 'txt',
            status: 'completed',
            chunksCount: 3,
            totalSize: 1500,
            tags: [tag],
            createdAt: '2026-03-30T00:00:00.000Z',
            updatedAt: '2026-03-30T00:00:00.000Z',
        };
        expect(info.tags[0].color).toBeUndefined();
    });
});
//# sourceMappingURL=types.test.js.map