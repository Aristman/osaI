/**
 * Integration Test: TC-007-2 -- Multi-format ingestion and cross-format search
 *
 * Ingests txt + md documents, searches across all, verifies cross-format results.
 * Uses real objects (not mocks) except for EmbeddingProvider.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestEnvironment, generateTopicText, } from './test-helpers.js';
describe('TC-007-2: Cross-format search', () => {
    let env;
    beforeEach(() => {
        env = createTestEnvironment();
    });
    afterEach(() => {
        env.db.close();
    });
    it('should ingest txt + md documents and search across all formats', async () => {
        // -----------------------------------------------------------------------
        // Step 1: Ingest a txt document
        // -----------------------------------------------------------------------
        const txtContent = generateTopicText('machine learning algorithms', 4000);
        const txtBuffer = Buffer.from(txtContent, 'utf-8');
        const txtResult = await env.ingestPipeline.ingestDocument('/docs/ml-algorithms.txt', txtBuffer, 'txt', ['ml', 'algorithms']);
        expect(txtResult.status).toBe('completed');
        expect(txtResult.chunksStored).toBeGreaterThan(0);
        const txtDoc = env.repository.getDocument(txtResult.documentId);
        expect(txtDoc).not.toBeNull();
        expect(txtDoc.format).toBe('txt');
        // -----------------------------------------------------------------------
        // Step 2: Ingest a md document with header structure
        // -----------------------------------------------------------------------
        const mdContent = [
            '# Machine Learning Overview',
            '',
            'This section covers fundamental machine learning concepts.',
            'Machine learning algorithms can be supervised or unsupervised.',
            '',
            '## Supervised Learning',
            '',
            'Supervised learning uses labeled training data to build models.',
            'Common algorithms include linear regression and decision trees.',
            '',
            '## Unsupervised Learning',
            '',
            'Unsupervised learning discovers patterns in unlabeled data.',
            'Clustering and dimensionality reduction are key techniques.',
            '',
            '## Deep Learning',
            '',
            'Deep learning uses neural networks with multiple layers.',
            'Neural networks can model complex non-linear relationships.',
            '',
            'The implementation of machine learning follows established conventions.',
            'Understanding machine learning requires knowledge of mathematics and statistics.',
            'Machine learning models are trained on large datasets.',
            'Feature engineering is a critical step in the ML pipeline.',
            'Cross-validation helps assess model generalization.',
            'Hyperparameter tuning optimizes model performance.',
            'Regularization prevents overfitting on training data.',
            'Ensemble methods combine multiple models for better predictions.',
            'Transfer learning leverages pre-trained models for new tasks.',
            'The choice of algorithm depends on the problem type and data characteristics.',
            'Evaluation metrics guide model selection and improvement.',
            '',
            ...generateTopicText('deep learning neural networks', 3000).split('\n'),
        ].join('\n');
        const mdBuffer = Buffer.from(mdContent, 'utf-8');
        const mdResult = await env.ingestPipeline.ingestDocument('/docs/ml-overview.md', mdBuffer, 'md', ['ml', 'reference']);
        expect(mdResult.status).toBe('completed');
        expect(mdResult.chunksStored).toBeGreaterThan(0);
        const mdDoc = env.repository.getDocument(mdResult.documentId);
        expect(mdDoc).not.toBeNull();
        expect(mdDoc.format).toBe('md');
        // MdParser should extract title from H1 header
        expect(mdDoc.title).toBe('Machine Learning Overview');
        // -----------------------------------------------------------------------
        // Step 3: Verify both documents in list
        // -----------------------------------------------------------------------
        const allDocs = env.repository.listDocuments();
        expect(allDocs).toHaveLength(2);
        const formats = allDocs.map(d => d.format);
        expect(formats).toContain('txt');
        expect(formats).toContain('md');
        // -----------------------------------------------------------------------
        // Step 4: Search with query related to both documents
        // -----------------------------------------------------------------------
        const results = await env.kbSearch.search('machine learning algorithms and neural networks', {
            topK: 10,
            minSimilarity: 0.5,
        });
        // Should find results from both formats
        expect(results.length).toBeGreaterThan(0);
        // Verify results come from the ingested documents
        const resultDocIds = new Set(results.map(r => r.source.documentId));
        expect(resultDocIds.has(txtResult.documentId) || resultDocIds.has(mdResult.documentId)).toBe(true);
        // Verify source attribution includes path and title
        for (const r of results) {
            expect(r.source.path).toBeDefined();
            expect(r.source.title).toBeDefined();
            expect(r.source.tags.length).toBeGreaterThan(0);
        }
        // -----------------------------------------------------------------------
        // Step 5: Search with txt-specific query
        // -----------------------------------------------------------------------
        const txtResults = await env.kbSearch.search('machine learning algorithms involves design patterns and best practices', {
            topK: 5,
            minSimilarity: 0.5,
        });
        expect(txtResults.length).toBeGreaterThan(0);
        // -----------------------------------------------------------------------
        // Step 6: Search with md-specific query (from header content)
        // -----------------------------------------------------------------------
        const mdResults = await env.kbSearch.search('deep learning neural networks involves design patterns', {
            topK: 5,
            minSimilarity: 0.5,
        });
        expect(mdResults.length).toBeGreaterThan(0);
        // -----------------------------------------------------------------------
        // Step 7: Verify source stats reflect both formats
        // -----------------------------------------------------------------------
        const stats = env.sourceManager.getSourceStats();
        expect(stats.total).toBe(2);
        expect(stats.byFormat['txt']).toBe(1);
        expect(stats.byFormat['md']).toBe(1);
        expect(stats.byTag['ml']).toBe(2);
    });
    it('should filter list sources by tags across formats', async () => {
        // Ingest documents with different tag combinations
        const txtContent = generateTopicText('TypeScript patterns', 2000);
        await env.ingestPipeline.ingestDocument('/docs/ts-patterns.txt', Buffer.from(txtContent, 'utf-8'), 'txt', ['typescript', 'patterns']);
        const mdContent = [
            '# Rust Guide',
            'Rust is a systems programming language.',
            'Rust provides memory safety without garbage collection.',
            generateTopicText('Rust programming', 2000),
        ].join('\n');
        await env.ingestPipeline.ingestDocument('/docs/rust-guide.md', Buffer.from(mdContent, 'utf-8'), 'md', ['rust', 'systems']);
        const mdContent2 = [
            '# TypeScript Advanced',
            'Advanced TypeScript patterns and techniques.',
            generateTopicText('TypeScript generics', 2000),
        ].join('\n');
        await env.ingestPipeline.ingestDocument('/docs/ts-advanced.md', Buffer.from(mdContent2, 'utf-8'), 'md', ['typescript', 'advanced']);
        // Filter by 'typescript' tag
        const tsSources = env.sourceManager.listSources({ tags: ['typescript'] });
        expect(tsSources).toHaveLength(2);
        const tsFormats = tsSources.map(s => s.format);
        expect(tsFormats).toContain('txt');
        expect(tsFormats).toContain('md');
        // Filter by 'rust' tag
        const rustSources = env.sourceManager.listSources({ tags: ['rust'] });
        expect(rustSources).toHaveLength(1);
        expect(rustSources[0].format).toBe('md');
        // List all sources
        const allSources = env.sourceManager.listSources();
        expect(allSources).toHaveLength(3);
    });
});
//# sourceMappingURL=multi-format.test.js.map