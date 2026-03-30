/**
 * Integration Test: TC-007-1 -- Full cycle: ingest -> search -> remove -> verify deleted
 *
 * Uses real objects (not mocks):
 * - InMemoryVectorStorage from @osai/memory
 * - In-memory SQLite via better-sqlite3
 * - Deterministic mock EmbeddingProvider
 * - Real ParserRegistry, KnowledgeRepository, IngestPipeline, KBSearch, SourceManager
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestEnvironment, generateTopicText, } from './test-helpers.js';
import { SourceNotFoundError } from '../../sources/source-manager.js';
describe('TC-007-1: Full cycle ingest -> search -> remove', () => {
    let env;
    beforeEach(() => {
        env = createTestEnvironment();
    });
    afterEach(() => {
        env.db.close();
    });
    it('should complete full lifecycle: ingest -> search with attribution -> remove -> verify deleted', async () => {
        // -----------------------------------------------------------------------
        // Step 1: Ingest a txt document
        // -----------------------------------------------------------------------
        const txtContent = generateTopicText('REST API design', 5000);
        const buffer = Buffer.from(txtContent, 'utf-8');
        const ingestResult = await env.ingestPipeline.ingestDocument('/docs/rest-api-guide.txt', buffer, 'txt', ['api', 'guide']);
        expect(ingestResult.status).toBe('completed');
        expect(ingestResult.documentId).toBeDefined();
        expect(ingestResult.chunksStored).toBeGreaterThan(0);
        const documentId = ingestResult.documentId;
        // Verify document stored in DB
        const document = env.repository.getDocument(documentId);
        expect(document).not.toBeNull();
        expect(document.path).toBe('/docs/rest-api-guide.txt');
        expect(document.format).toBe('txt');
        expect(document.status).toBe('completed');
        expect(document.tags).toEqual(['api', 'guide']);
        // Verify chunks stored in DB
        const chunks = env.repository.getChunksByDocument(documentId);
        expect(chunks.length).toBe(ingestResult.chunksStored);
        // -----------------------------------------------------------------------
        // Step 2: Search and verify attribution
        // -----------------------------------------------------------------------
        // Use a query that is semantically similar to the document content
        const searchResults = await env.kbSearch.search('REST API design patterns', {
            topK: 5,
            minSimilarity: 0.5,
        });
        // Should find results since query is similar to document content
        expect(searchResults.length).toBeGreaterThan(0);
        // Verify source attribution on first result
        const topResult = searchResults[0];
        expect(topResult.source.documentId).toBe(documentId);
        expect(topResult.source.title).toBe('rest-api-guide.txt');
        expect(topResult.source.path).toBe('/docs/rest-api-guide.txt');
        expect(topResult.source.tags).toContain('api');
        expect(topResult.source.tags).toContain('guide');
        expect(topResult.chunk.id).toBeDefined();
        expect(topResult.chunk.content).toBeTruthy();
        expect(topResult.similarity).toBeGreaterThan(0);
        // -----------------------------------------------------------------------
        // Step 3: Remove the document
        // -----------------------------------------------------------------------
        await env.sourceManager.removeSource(documentId);
        // -----------------------------------------------------------------------
        // Step 4: Verify deleted from all stores
        // -----------------------------------------------------------------------
        // Verify document deleted from DB
        const deletedDoc = env.repository.getDocument(documentId);
        expect(deletedDoc).toBeNull();
        // Verify chunks deleted from DB (cascade)
        const deletedChunks = env.repository.getChunksByDocument(documentId);
        expect(deletedChunks).toHaveLength(0);
        // Verify vectors deleted from VectorStorage
        // The InMemoryVectorStorage should have no vectors for this document
        const allResults = env.vectorStorage.search(Array.from({ length: 768 }, () => Math.random()), 100, 0.0);
        const documentVectors = allResults.filter(r => r.id.startsWith(`chunk_${documentId}`));
        expect(documentVectors).toHaveLength(0);
        // Verify search returns no results for the deleted document
        const searchAfterDelete = await env.kbSearch.search('REST API design patterns', {
            topK: 5,
            minSimilarity: 0.5,
        });
        expect(searchAfterDelete.length).toBe(0);
    });
    it('should support ingesting multiple documents and searching across them', async () => {
        // Ingest two documents with different topics
        const content1 = generateTopicText('database optimization', 3000);
        const content2 = generateTopicText('user authentication', 3000);
        const result1 = await env.ingestPipeline.ingestDocument('/docs/database.txt', Buffer.from(content1, 'utf-8'), 'txt', ['database']);
        const result2 = await env.ingestPipeline.ingestDocument('/docs/auth.txt', Buffer.from(content2, 'utf-8'), 'txt', ['auth']);
        expect(result1.status).toBe('completed');
        expect(result2.status).toBe('completed');
        // Verify both documents in list
        const allDocs = env.repository.listDocuments();
        expect(allDocs).toHaveLength(2);
        // Search should return results from both documents
        const results = await env.kbSearch.search('database optimization', {
            topK: 5,
            minSimilarity: 0.5,
        });
        expect(results.length).toBeGreaterThan(0);
        const foundDocIds = new Set(results.map(r => r.source.documentId));
        expect(foundDocIds.has(result1.documentId)).toBe(true);
    });
    it('should throw SourceNotFoundError when removing non-existent document', async () => {
        await expect(env.sourceManager.removeSource('non-existent-id')).rejects.toThrow(SourceNotFoundError);
    });
});
//# sourceMappingURL=ingest-search-remove.test.js.map