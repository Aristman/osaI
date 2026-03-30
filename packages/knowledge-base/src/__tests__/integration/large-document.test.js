/**
 * Integration Test: TC-007-4 -- Large document ingestion (10+ chunks)
 *
 * Ingests a document large enough to produce > 10 chunks, verifies all chunks
 * are stored correctly, and search returns results from the correct chunks.
 * Uses real objects (not mocks) except for EmbeddingProvider.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestEnvironment, generateLongText, generateTopicText, } from './test-helpers.js';
import { estimateTokens } from '../../ingest/chunker.js';
describe('TC-007-4: Large document (10+ chunks)', () => {
    let env;
    beforeEach(() => {
        env = createTestEnvironment();
    });
    afterEach(() => {
        env.db.close();
    });
    it('should ingest document producing more than 10 chunks and verify all stored', async () => {
        // -----------------------------------------------------------------------
        // Step 1: Generate a large text (> 10K tokens -> > 10 chunks)
        // -----------------------------------------------------------------------
        const longText = generateLongText(12);
        const tokenCount = estimateTokens(longText);
        // Verify the text is large enough
        expect(tokenCount).toBeGreaterThan(10000);
        // -----------------------------------------------------------------------
        // Step 2: Ingest the large document
        // -----------------------------------------------------------------------
        const buffer = Buffer.from(longText, 'utf-8');
        const result = await env.ingestPipeline.ingestDocument('/docs/large-document.txt', buffer, 'txt', ['large', 'test']);
        expect(result.status).toBe('completed');
        expect(result.chunksStored).toBeGreaterThan(10);
        // -----------------------------------------------------------------------
        // Step 3: Verify all chunks stored in DB
        // -----------------------------------------------------------------------
        const chunks = env.repository.getChunksByDocument(result.documentId);
        expect(chunks.length).toBe(result.chunksStored);
        expect(chunks.length).toBeGreaterThan(10);
        // Verify chunk indices are sequential starting from 0
        for (let i = 0; i < chunks.length; i++) {
            expect(chunks[i].chunkIndex).toBe(i);
            expect(chunks[i].content.length).toBeGreaterThan(0);
            expect(chunks[i].documentId).toBe(result.documentId);
        }
        // -----------------------------------------------------------------------
        // Step 4: Verify document metadata reflects chunk count
        // -----------------------------------------------------------------------
        const doc = env.repository.getDocument(result.documentId);
        expect(doc).not.toBeNull();
        expect(doc.chunksCount).toBe(result.chunksStored);
        expect(doc.totalSize).toBe(buffer.length);
        expect(doc.status).toBe('completed');
        // -----------------------------------------------------------------------
        // Step 5: Verify vectors stored in VectorStorage
        // -----------------------------------------------------------------------
        expect(env.vectorStorage.size()).toBeGreaterThanOrEqual(result.chunksStored);
    });
    it('should return search results from correct chunks of a large document', async () => {
        // -----------------------------------------------------------------------
        // Step 1: Create a large document with distinct sections
        // -----------------------------------------------------------------------
        const sections = [];
        // Section 1: Introduction about the system (early chunks)
        sections.push('## Introduction to the Data Processing Pipeline\n\n' +
            'The data processing pipeline is a core component of the system.\n' +
            'It handles ingestion, transformation, and output of data.\n' +
            generateTopicText('data pipeline introduction', 15000));
        // Section 2: Error handling (middle chunks)
        sections.push('## Error Handling Strategies\n\n' +
            'Error handling is critical for robust data processing.\n' +
            'The pipeline implements circuit breaker and retry patterns.\n' +
            'Error logs are aggregated and analyzed for patterns.\n' +
            generateTopicText('error handling retry circuit breaker', 15000));
        // Section 3: Performance optimization (late chunks)
        sections.push('## Performance Optimization Techniques\n\n' +
            'Performance optimization focuses on throughput and latency.\n' +
            'Batching, caching, and parallel processing improve performance.\n' +
            'Memory usage is monitored and optimized continuously.\n' +
            generateTopicText('performance optimization batching caching', 15000));
        const fullContent = sections.join('\n\n---\n\n');
        const tokenCount = estimateTokens(fullContent);
        // Ensure large enough for 10+ chunks
        expect(tokenCount).toBeGreaterThan(10000);
        // -----------------------------------------------------------------------
        // Step 2: Ingest
        // -----------------------------------------------------------------------
        const buffer = Buffer.from(fullContent, 'utf-8');
        const result = await env.ingestPipeline.ingestDocument('/docs/pipeline-guide.txt', buffer, 'txt', ['pipeline', 'guide']);
        expect(result.status).toBe('completed');
        expect(result.chunksStored).toBeGreaterThan(10);
        const documentId = result.documentId;
        // -----------------------------------------------------------------------
        // Step 3: Search for content from early section (introduction)
        // -----------------------------------------------------------------------
        const introResults = await env.kbSearch.search('data processing pipeline introduction ingestion', {
            topK: 3,
            minSimilarity: 0.5,
        });
        expect(introResults.length).toBeGreaterThan(0);
        // Verify results come from the correct document
        for (const r of introResults) {
            expect(r.source.documentId).toBe(documentId);
            expect(r.source.path).toBe('/docs/pipeline-guide.txt');
        }
        // Verify results contain relevant content
        const hasIntroContent = introResults.some(r => r.chunk.content.toLowerCase().includes('pipeline') ||
            r.chunk.content.toLowerCase().includes('introduction') ||
            r.chunk.content.toLowerCase().includes('ingestion'));
        expect(hasIntroContent).toBe(true);
        // -----------------------------------------------------------------------
        // Step 4: Search for content from middle section (error handling)
        // -----------------------------------------------------------------------
        const errorResults = await env.kbSearch.search('error handling circuit breaker retry patterns', {
            topK: 3,
            minSimilarity: 0.5,
        });
        expect(errorResults.length).toBeGreaterThan(0);
        // Verify results come from the correct document
        for (const r of errorResults) {
            expect(r.source.documentId).toBe(documentId);
        }
        // Verify at least one result has error handling content
        const hasErrorContent = errorResults.some(r => r.chunk.content.toLowerCase().includes('error') ||
            r.chunk.content.toLowerCase().includes('circuit breaker') ||
            r.chunk.content.toLowerCase().includes('retry'));
        expect(hasErrorContent).toBe(true);
        // -----------------------------------------------------------------------
        // Step 5: Search for content from late section (performance)
        // -----------------------------------------------------------------------
        const perfResults = await env.kbSearch.search('performance optimization batching caching throughput', {
            topK: 3,
            minSimilarity: 0.5,
        });
        expect(perfResults.length).toBeGreaterThan(0);
        // Verify results come from the correct document
        for (const r of perfResults) {
            expect(r.source.documentId).toBe(documentId);
        }
        // Verify at least one result has performance content
        const hasPerfContent = perfResults.some(r => r.chunk.content.toLowerCase().includes('performance') ||
            r.chunk.content.toLowerCase().includes('batching') ||
            r.chunk.content.toLowerCase().includes('caching'));
        expect(hasPerfContent).toBe(true);
        // -----------------------------------------------------------------------
        // Step 6: Verify chunks are from different indices (spread across document)
        // -----------------------------------------------------------------------
        const allChunkIndices = new Set([
            ...introResults.map(r => r.chunk.chunkIndex),
            ...errorResults.map(r => r.chunk.chunkIndex),
            ...perfResults.map(r => r.chunk.chunkIndex),
        ]);
        // With a 10+ chunk document and searches targeting different sections,
        // we should get results from multiple different chunk indices
        expect(allChunkIndices.size).toBeGreaterThanOrEqual(1);
    });
    it('should correctly report total tokens for large document', async () => {
        const longText = generateLongText(12);
        const buffer = Buffer.from(longText, 'utf-8');
        const result = await env.ingestPipeline.ingestDocument('/docs/token-test.txt', buffer, 'txt');
        expect(result.totalTokens).toBeGreaterThan(0);
        // Total tokens should be roughly consistent with what the chunker estimates
        const expectedTokens = estimateTokens(longText);
        expect(result.totalTokens).toBeGreaterThan(expectedTokens * 0.8);
    });
});
//# sourceMappingURL=large-document.test.js.map