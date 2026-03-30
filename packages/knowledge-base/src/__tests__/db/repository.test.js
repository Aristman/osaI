/**
 * @osai/knowledge-base -- Repository Unit Tests (T-003)
 *
 * Test cases from ROADMAP_TASKS_F-006.md:
 *   TC-003-3: Insert and retrieve document
 *   TC-003-4: Delete document cascades chunks
 *   TC-003-5: List documents with tag filter
 *   TC-003-6: Insert chunk links to document
 *
 * Uses in-memory SQLite for isolation.
 */
import Database from 'better-sqlite3';
import { describe, it, expect, beforeEach } from 'vitest';
import { KnowledgeRepository } from '../../db/repository.js';
function createTestDb() {
    const db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    return db;
}
describe('KnowledgeRepository', () => {
    let db;
    let repo;
    beforeEach(() => {
        db = createTestDb();
        repo = new KnowledgeRepository(db);
        repo.initSchema();
    });
    // TC-003-3: Insert and retrieve document
    it('TC-003-3: Insert and retrieve document', () => {
        const doc = repo.insertDocument({
            id: 'doc_001',
            title: 'Test Document',
            path: '/docs/test.md',
            format: 'md',
            tags: ['api', 'reference'],
            totalSize: 1024,
            checksum: 'abc123',
        });
        expect(doc).toBe('doc_001');
        const retrieved = repo.getDocument('doc_001');
        expect(retrieved).not.toBeNull();
        expect(retrieved.id).toBe('doc_001');
        expect(retrieved.title).toBe('Test Document');
        expect(retrieved.path).toBe('/docs/test.md');
        expect(retrieved.format).toBe('md');
        expect(retrieved.status).toBe('pending');
        expect(retrieved.chunksCount).toBe(0);
        expect(retrieved.totalSize).toBe(1024);
        expect(retrieved.tags).toEqual(['api', 'reference']);
        expect(retrieved.checksum).toBe('abc123');
        expect(retrieved.createdAt).toBeGreaterThan(0);
        expect(retrieved.updatedAt).toBeGreaterThan(0);
    });
    // TC-003-3 extension: getDocument returns null for nonexistent id
    it('TC-003-3: getDocument returns null for nonexistent id', () => {
        const result = repo.getDocument('nonexistent');
        expect(result).toBeNull();
    });
    // TC-003-3 extension: Update document
    it('updates document fields correctly', () => {
        repo.insertDocument({
            id: 'doc_update',
            title: 'Original Title',
            path: '/docs/update.md',
            format: 'md',
        });
        repo.updateDocument('doc_update', {
            title: 'Updated Title',
            status: 'completed',
            chunksCount: 5,
            totalSize: 2048,
            tags: ['updated'],
            checksum: 'new_checksum',
        });
        const updated = repo.getDocument('doc_update');
        expect(updated).not.toBeNull();
        expect(updated.title).toBe('Updated Title');
        expect(updated.status).toBe('completed');
        expect(updated.chunksCount).toBe(5);
        expect(updated.totalSize).toBe(2048);
        expect(updated.tags).toEqual(['updated']);
        expect(updated.checksum).toBe('new_checksum');
        // updated_at should be >= createdAt
        expect(updated.updatedAt).toBeGreaterThanOrEqual(updated.createdAt);
    });
    // TC-003-4: Delete document cascades chunks
    it('TC-003-4: Delete document cascades chunks', () => {
        // Create a document with 5 chunks
        repo.insertDocument({
            id: 'doc_cascade',
            title: 'Cascade Test',
            path: '/docs/cascade.txt',
            format: 'txt',
            status: 'completed',
            chunksCount: 5,
        });
        for (let i = 0; i < 5; i++) {
            repo.insertChunk({
                id: `chunk_${i}`,
                documentId: 'doc_cascade',
                content: `Chunk content ${i}`,
                chunkIndex: i,
            });
        }
        // Verify chunks exist
        const chunksBefore = repo.getChunksByDocument('doc_cascade');
        expect(chunksBefore).toHaveLength(5);
        // Delete the document
        repo.deleteDocument('doc_cascade');
        // Verify document is gone
        const docAfter = repo.getDocument('doc_cascade');
        expect(docAfter).toBeNull();
        // Verify all chunks are gone (CASCADE DELETE)
        const chunksAfter = repo.getChunksByDocument('doc_cascade');
        expect(chunksAfter).toHaveLength(0);
    });
    // TC-003-5: List documents with tag filter
    it('TC-003-5: List documents with tag filter', () => {
        // Create 3 documents, 2 with tag 'api'
        repo.insertDocument({
            id: 'doc_api_1',
            title: 'API Reference',
            path: '/docs/api1.md',
            format: 'md',
            tags: ['api', 'reference'],
        });
        repo.insertDocument({
            id: 'doc_api_2',
            title: 'API Guide',
            path: '/docs/api2.md',
            format: 'md',
            tags: ['api', 'guide'],
        });
        repo.insertDocument({
            id: 'doc_other',
            title: 'Other Document',
            path: '/docs/other.txt',
            format: 'txt',
            tags: ['tutorial'],
        });
        // Filter by tag 'api' -- should return 2 documents
        const apiDocs = repo.listDocuments({ tag: 'api' });
        expect(apiDocs).toHaveLength(2);
        const apiIds = apiDocs.map((d) => d.id);
        expect(apiIds).toContain('doc_api_1');
        expect(apiIds).toContain('doc_api_2');
        expect(apiIds).not.toContain('doc_other');
        // Filter by tag 'tutorial' -- should return 1 document
        const tutorialDocs = repo.listDocuments({ tag: 'tutorial' });
        expect(tutorialDocs).toHaveLength(1);
        expect(tutorialDocs[0].id).toBe('doc_other');
        // No filter -- should return all 3
        const allDocs = repo.listDocuments();
        expect(allDocs).toHaveLength(3);
        // Filter by nonexistent tag -- should return 0
        const noDocs = repo.listDocuments({ tag: 'nonexistent' });
        expect(noDocs).toHaveLength(0);
    });
    // TC-003-5 extension: List with format filter
    it('lists documents filtered by format', () => {
        repo.insertDocument({
            id: 'doc_txt',
            title: 'TXT Doc',
            path: '/docs/a.txt',
            format: 'txt',
        });
        repo.insertDocument({
            id: 'doc_md_1',
            title: 'MD Doc 1',
            path: '/docs/b.md',
            format: 'md',
        });
        repo.insertDocument({
            id: 'doc_md_2',
            title: 'MD Doc 2',
            path: '/docs/c.md',
            format: 'md',
        });
        const mdDocs = repo.listDocuments({ format: 'md' });
        expect(mdDocs).toHaveLength(2);
        const txtDocs = repo.listDocuments({ format: 'txt' });
        expect(txtDocs).toHaveLength(1);
    });
    // TC-003-5 extension: List with status filter
    it('lists documents filtered by status', () => {
        repo.insertDocument({
            id: 'doc_pending',
            title: 'Pending',
            path: '/docs/pending.md',
            format: 'md',
            status: 'pending',
        });
        repo.insertDocument({
            id: 'doc_completed',
            title: 'Completed',
            path: '/docs/completed.md',
            format: 'md',
            status: 'completed',
        });
        const completedDocs = repo.listDocuments({ status: 'completed' });
        expect(completedDocs).toHaveLength(1);
        expect(completedDocs[0].id).toBe('doc_completed');
    });
    // TC-003-6: Insert chunk links to document
    it('TC-003-6: Insert chunk links to document', () => {
        // Create a document
        repo.insertDocument({
            id: 'doc_chunk_test',
            title: 'Chunk Test',
            path: '/docs/chunk.txt',
            format: 'txt',
        });
        // Insert a chunk
        const chunkId = repo.insertChunk({
            id: 'chunk_linked',
            documentId: 'doc_chunk_test',
            content: 'This is chunk content',
            chunkIndex: 0,
        });
        expect(chunkId).toBe('chunk_linked');
        // Verify chunk links to the document
        const chunks = repo.getChunksByDocument('doc_chunk_test');
        expect(chunks).toHaveLength(1);
        expect(chunks[0].id).toBe('chunk_linked');
        expect(chunks[0].documentId).toBe('doc_chunk_test');
        expect(chunks[0].content).toBe('This is chunk content');
        expect(chunks[0].chunkIndex).toBe(0);
        expect(chunks[0].createdAt).toBeGreaterThan(0);
    });
    // Extension: getChunksByDocument returns empty array for nonexistent document
    it('getChunksByDocument returns empty array for nonexistent document', () => {
        const chunks = repo.getChunksByDocument('nonexistent');
        expect(chunks).toHaveLength(0);
    });
    // Extension: deleteChunksByDocument
    it('deleteChunksByDocument removes all chunks for a document', () => {
        repo.insertDocument({
            id: 'doc_delete_chunks',
            title: 'Delete Chunks Test',
            path: '/docs/delete_chunks.txt',
            format: 'txt',
        });
        repo.insertChunk({ id: 'ch1', documentId: 'doc_delete_chunks', content: 'a', chunkIndex: 0 });
        repo.insertChunk({ id: 'ch2', documentId: 'doc_delete_chunks', content: 'b', chunkIndex: 1 });
        repo.insertChunk({ id: 'ch3', documentId: 'doc_delete_chunks', content: 'c', chunkIndex: 2 });
        expect(repo.getChunksByDocument('doc_delete_chunks')).toHaveLength(3);
        const deletedCount = repo.deleteChunksByDocument('doc_delete_chunks');
        expect(deletedCount).toBe(3);
        expect(repo.getChunksByDocument('doc_delete_chunks')).toHaveLength(0);
    });
    // Extension: deleteChunksByDocument returns 0 for nonexistent document
    it('deleteChunksByDocument returns 0 for nonexistent document', () => {
        const count = repo.deleteChunksByDocument('nonexistent');
        expect(count).toBe(0);
    });
    // Extension: Multiple chunks ordered by chunkIndex
    it('chunks are ordered by chunkIndex ASC', () => {
        repo.insertDocument({
            id: 'doc_order',
            title: 'Order Test',
            path: '/docs/order.txt',
            format: 'txt',
        });
        // Insert chunks in reverse order
        repo.insertChunk({ id: 'ch_z', documentId: 'doc_order', content: 'Z', chunkIndex: 2 });
        repo.insertChunk({ id: 'ch_a', documentId: 'doc_order', content: 'A', chunkIndex: 0 });
        repo.insertChunk({ id: 'ch_m', documentId: 'doc_order', content: 'M', chunkIndex: 1 });
        const chunks = repo.getChunksByDocument('doc_order');
        expect(chunks).toHaveLength(3);
        expect(chunks[0].chunkIndex).toBe(0);
        expect(chunks[1].chunkIndex).toBe(1);
        expect(chunks[2].chunkIndex).toBe(2);
    });
    // Extension: Default values on insert
    it('insertDocument applies default values correctly', () => {
        const id = repo.insertDocument({
            id: 'doc_defaults',
            title: 'Defaults',
            path: '/docs/defaults.md',
            format: 'md',
        });
        const doc = repo.getDocument(id);
        expect(doc.status).toBe('pending');
        expect(doc.chunksCount).toBe(0);
        expect(doc.totalSize).toBe(0);
        expect(doc.tags).toEqual([]);
        expect(doc.checksum).toBeUndefined();
    });
});
//# sourceMappingURL=repository.test.js.map