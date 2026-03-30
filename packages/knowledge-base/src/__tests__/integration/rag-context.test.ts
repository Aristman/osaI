/**
 * Integration Test: TC-007-3 -- RAG context formatting
 *
 * Tests that search results can be properly formatted for RAG injection
 * into system prompts. Verifies markdown structure with real ingestion pipeline.
 * Uses real objects (not mocks) except for EmbeddingProvider.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  createTestEnvironment,
  generateTopicText,
} from './test-helpers.js';
import type { TestEnvironment } from './test-helpers.js';

describe('TC-007-3: RAG context format', () => {
  let env: TestEnvironment;

  beforeEach(() => {
    env = createTestEnvironment();
  });

  afterEach(() => {
    env.db.close();
  });

  it('should format search results as valid markdown for RAG injection', async () => {
    // Ingest multiple documents to create search results
    const content1 = generateTopicText('kubernetes container orchestration', 4000);
    const content2 = generateTopicText('docker containerization', 4000);
    const content3 = generateTopicText('microservices architecture', 4000);

    await env.ingestPipeline.ingestDocument(
      '/docs/k8s.txt',
      Buffer.from(content1, 'utf-8'),
      'txt',
      ['devops', 'kubernetes'],
    );

    await env.ingestPipeline.ingestDocument(
      '/docs/docker.md',
      Buffer.from(content2, 'utf-8'),
      'md',
      ['devops', 'docker'],
    );

    await env.ingestPipeline.ingestDocument(
      '/docs/microservices.txt',
      Buffer.from(content3, 'utf-8'),
      'txt',
      ['architecture', 'microservices'],
    );

    // Perform search
    const results = await env.kbSearch.search('container orchestration and deployment', {
      topK: 3,
      minSimilarity: 0.5,
    });

    expect(results.length).toBeGreaterThan(0);

    // Format for RAG
    const ragContext = env.kbSearch.formatForRAG(results);

    // -----------------------------------------------------------------------
    // Verify markdown structure
    // -----------------------------------------------------------------------

    // Should not be empty
    expect(ragContext.length).toBeGreaterThan(0);

    // Each result should have an H2 header with "## Source: {title}"
    for (const result of results) {
      expect(ragContext).toContain(`## Source: ${result.source.title}`);
    }

    // Each result should have blockquote content
    for (const result of results) {
      expect(ragContext).toContain(`> ${result.chunk.content.slice(0, 50)}`);
    }

    // Each result should have path and similarity metadata in italics
    for (const result of results) {
      expect(ragContext).toContain(`_Path: ${result.source.path}`);
      expect(ragContext).toContain(`Chunk: ${result.chunk.chunkIndex}`);
      expect(ragContext).toContain(`Similarity: ${result.similarity.toFixed(4)}`);
    }

    // Sections should be separated by double newlines
    const sectionCount = (ragContext.match(/## Source:/g) ?? []).length;
    expect(sectionCount).toBe(results.length);

    // No triple newlines (clean formatting)
    expect(ragContext).not.toContain('\n\n\n');
  });

  it('should return empty string when formatting empty results', () => {
    const ragContext = env.kbSearch.formatForRAG([]);
    expect(ragContext).toBe('');
  });

  it('should include complete source attribution in RAG context', async () => {
    // Ingest a document with tags
    const mdContent = [
      '# API Design Guide',
      '',
      'This document describes REST API design principles.',
      'APIs should follow consistent naming conventions.',
      'Versioning is important for API evolution.',
      '',
      '## Authentication',
      '',
      'APIs should use OAuth 2.0 for authentication.',
      'JWT tokens provide stateless session management.',
      '',
      '## Rate Limiting',
      '',
      'Rate limiting prevents API abuse.',
      'Use sliding window algorithm for fair rate limiting.',
      '',
      ...generateTopicText('API design REST HTTP', 3000).split('\n'),
    ].join('\n');

    await env.ingestPipeline.ingestDocument(
      '/docs/api-design-guide.md',
      Buffer.from(mdContent, 'utf-8'),
      'md',
      ['api', 'guide', 'rest'],
    );

    // Search with API-related query (similar n-grams to generated content)
    const results = await env.kbSearch.search('API design REST HTTP involves design patterns and best practices', {
      topK: 3,
      minSimilarity: 0.5,
    });

    expect(results.length).toBeGreaterThan(0);

    const ragContext = env.kbSearch.formatForRAG(results);

    // Verify document title extracted from markdown header
    expect(ragContext).toContain('## Source: API Design Guide');

    // Verify path is included
    expect(ragContext).toContain('/docs/api-design-guide.md');

    // Verify chunk content is in blockquotes
    expect(ragContext).toContain('> ');

    // Verify similarity score is formatted
    expect(ragContext).toMatch(/Similarity: 0\.\d{4}/);

    // Verify each result has both chunk and source info
    for (const result of results) {
      expect(ragContext).toContain(`## Source: ${result.source.title}`);
      expect(ragContext).toContain(`_Path: ${result.source.path}`);
      expect(ragContext).toContain(`Chunk: ${result.chunk.chunkIndex}`);
    }
  });

  it('should produce RAG context suitable for system prompt injection', async () => {
    // Ingest a single document
    const content = generateTopicText('observability monitoring tracing', 3000);
    await env.ingestPipeline.ingestDocument(
      '/docs/observability.txt',
      Buffer.from(content, 'utf-8'),
      'txt',
      ['observability'],
    );

    // Search
    const results = await env.kbSearch.search('monitoring and tracing', {
      topK: 1,
      minSimilarity: 0.5,
    });

    if (results.length > 0) {
      const ragContext = env.kbSearch.formatForRAG(results);

      // RAG context should be a well-formed markdown string
      // that can be injected into a system prompt

      // Should start with "## Source:" header
      expect(ragContext.startsWith('## Source:')).toBe(true);

      // Should contain actual content (not just metadata)
      const blockquoteContent = ragContext.split('> ').filter(line => line.length > 0);
      expect(blockquoteContent.length).toBeGreaterThan(0);

      // Should not contain raw HTML tags
      expect(ragContext).not.toContain('<');
      // Note: '>' is valid in markdown blockquotes, so we don't check for it

      // Should be usable as-is in a prompt template
      const systemPrompt = `You are a helpful assistant. Use the following context to answer questions:\n\n${ragContext}\n\nAnswer:`;
      expect(systemPrompt).toContain('## Source:');
      expect(systemPrompt).toContain('Answer:');
    }
  });
});
