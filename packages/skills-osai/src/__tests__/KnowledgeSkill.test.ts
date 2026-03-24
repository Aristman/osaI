/**
 * KnowledgeSkill tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createKnowledgeSkill, createKnowledgeSkillDefinition } from '../skills/KnowledgeSkill.js';
import type { LongTermMemory, Fact } from '@osai/memory';
import type { ToolContext } from '@osai/agent';

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

function createMockLongTermMemory(): LongTermMemory {
  return {
    addFact: vi.fn().mockReturnValue('fact_001'),
    getFact: vi.fn(),
    updateFact: vi.fn(),
    deleteFact: vi.fn().mockReturnValue(true),
    search: vi.fn().mockReturnValue([]),
    semanticSearch: vi.fn().mockResolvedValue([]),
    getStats: vi.fn().mockReturnValue({ total: 0, byCategory: {} }),
    close: vi.fn(),
  } as unknown as LongTermMemory;
}

const defaultContext: ToolContext = {
  sessionId: 'test-session-001',
  toolCall: {
    id: 'tool-1',
    name: 'knowledge-base.ingest_document',
    parameters: {},
  },
  config: {},
};

const sampleFact: Fact = {
  id: 'fact_001',
  content: 'Architecture specification document',
  category: 'knowledge',
  source: '/docs/arch.md',
  confidence: 0.9,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  tags: ['spec'],
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('KnowledgeSkill', () => {
  let longTerm: LongTermMemory;

  beforeEach(() => {
    longTerm = createMockLongTermMemory();
    vi.clearAllMocks();
  });

  describe('SkillDefinition', () => {
    it('TC-T004-003: should return definition with 4 tools', () => {
      const definition = createKnowledgeSkillDefinition();
      expect(definition.name).toBe('knowledge-base');
      expect(definition.version).toBe('1.0.0');
      expect(definition.tools).toHaveLength(4);
      expect(definition.category).toBe('system');
    });

    it('should have correct tool names', () => {
      const definition = createKnowledgeSkillDefinition();
      const toolNames = definition.tools.map((t) => t.name);
      expect(toolNames).toContain('ingest_document');
      expect(toolNames).toContain('query_knowledge');
      expect(toolNames).toContain('list_sources');
      expect(toolNames).toContain('remove_source');
    });

    it('should have correct category assignments', () => {
      const definition = createKnowledgeSkillDefinition();
      const ingestTool = definition.tools.find((t) => t.name === 'ingest_document');
      expect(ingestTool?.category).toBe('write');

      const queryTool = definition.tools.find((t) => t.name === 'query_knowledge');
      expect(queryTool?.category).toBe('system');

      const listTool = definition.tools.find((t) => t.name === 'list_sources');
      expect(listTool?.category).toBe('system');

      const removeTool = definition.tools.find((t) => t.name === 'remove_source');
      expect(removeTool?.category).toBe('write');
    });

    it('TC-T004-004: should have valid JSON Schema parameters', () => {
      const definition = createKnowledgeSkillDefinition();
      for (const tool of definition.tools) {
        expect(tool.parameters).toBeDefined();
        expect(tool.parameters).toHaveProperty('type', 'object');
        expect(tool.parameters).toHaveProperty('properties');
      }
    });
  });

  describe('ingest_document', () => {
    it('TC-T003-001: should ingest document and return ID with chunks count', async () => {
      const { executors } = createKnowledgeSkill(longTerm);
      const result = await executors['ingest_document']!(
        { content: 'Short document content.', source: '/docs/spec.md', title: 'Specification', tags: ['spec', 'osai'] },
        defaultContext,
      );

      expect(result.success).toBe(true);
      expect(result.metadata).toHaveProperty('document_id', 'fact_001');
      expect(result.metadata).toHaveProperty('chunks_count');
      expect((result.metadata as Record<string, unknown>)['chunks_count']).toBeGreaterThanOrEqual(1);
      expect(longTerm.addFact).toHaveBeenCalled();
    });

    it('should chunk large documents', async () => {
      const { executors } = createKnowledgeSkill(longTerm);
      // Create content longer than 512 chars to test chunking
      const longContent = 'A'.repeat(600) + '\n' + 'B'.repeat(600);
      vi.mocked(longTerm.addFact).mockReturnValue('fact_chunk');

      await executors['ingest_document']!(
        { content: longContent, source: '/docs/large.md' },
        defaultContext,
      );

      // Should create multiple chunks
      expect(longTerm.addFact).toHaveBeenCalledTimes(2);
    });

    it('TC-T003-005: should handle file not found error', async () => {
      vi.mocked(longTerm.addFact).mockImplementation(() => {
        const error = new Error('File not found: /nonexistent/file.md');
        throw error;
      });

      const { executors } = createKnowledgeSkill(longTerm);
      const result = await executors['ingest_document']!(
        { content: 'test content' },
        defaultContext,
      );

      expect(result.success).toBe(false);
      // Error message should mention not found
      expect(result.error).toBeDefined();
    });

    it('should fail when content is missing', async () => {
      const { executors } = createKnowledgeSkill(longTerm);
      const result = await executors['ingest_document']!({}, defaultContext);

      expect(result.success).toBe(false);
      expect(result.error).toContain('content');
    });

    it('should use default source when not provided', async () => {
      const { executors } = createKnowledgeSkill(longTerm);
      await executors['ingest_document']!(
        { content: 'test content' },
        defaultContext,
      );

      expect(longTerm.addFact).toHaveBeenCalledWith(
        expect.objectContaining({
          source: 'unknown',
        }),
      );
    });

    it('should pass tags to facts', async () => {
      const { executors } = createKnowledgeSkill(longTerm);
      await executors['ingest_document']!(
        { content: 'test', tags: ['spec', 'osai'] },
        defaultContext,
      );

      expect(longTerm.addFact).toHaveBeenCalledWith(
        expect.objectContaining({
          tags: ['spec', 'osai'],
        }),
      );
    });
  });

  describe('query_knowledge', () => {
    it('TC-T003-002: should query knowledge base and return results', async () => {
      vi.mocked(longTerm.search).mockReturnValue([sampleFact]);

      const { executors } = createKnowledgeSkill(longTerm);
      const result = await executors['query_knowledge']!(
        { query: 'architecture', top_k: 5 },
        defaultContext,
      );

      expect(result.success).toBe(true);
      expect(result.metadata).toHaveProperty('results');
      expect((result.metadata as Record<string, unknown>)['results'] as unknown[]).toHaveLength(1);
      expect(longTerm.search).toHaveBeenCalledWith(
        'architecture',
        { limit: 5, category: undefined, tags: undefined },
      );
    });

    it('should apply category filter', async () => {
      vi.mocked(longTerm.search).mockReturnValue([]);

      const { executors } = createKnowledgeSkill(longTerm);
      await executors['query_knowledge']!(
        { query: 'test', category: 'knowledge' },
        defaultContext,
      );

      expect(longTerm.search).toHaveBeenCalledWith(
        'test',
        { limit: 5, category: 'knowledge', tags: undefined },
      );
    });

    it('should clamp top_k to valid range', async () => {
      vi.mocked(longTerm.search).mockReturnValue([]);

      const { executors } = createKnowledgeSkill(longTerm);
      await executors['query_knowledge']!(
        { query: 'test', top_k: 100 },
        defaultContext,
      );

      expect(longTerm.search).toHaveBeenCalledWith(
        'test',
        { limit: 50, category: undefined, tags: undefined },
      );
    });

    it('should fail when query is missing', async () => {
      const { executors } = createKnowledgeSkill(longTerm);
      const result = await executors['query_knowledge']!({}, defaultContext);

      expect(result.success).toBe(false);
      expect(result.error).toContain('query');
    });

    it('should handle query error', async () => {
      vi.mocked(longTerm.search).mockImplementation(() => {
        throw new Error('Search failed');
      });

      const { executors } = createKnowledgeSkill(longTerm);
      const result = await executors['query_knowledge']!(
        { query: 'test' },
        defaultContext,
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Search failed');
    });
  });

  describe('list_sources', () => {
    it('TC-T003-003: should list unique sources', async () => {
      vi.mocked(longTerm.search).mockReturnValue([
        { ...sampleFact, id: 'f1' },
        { ...sampleFact, id: 'f2' },
        { ...sampleFact, id: 'f3', source: '/docs/other.md' },
      ]);

      const { executors } = createKnowledgeSkill(longTerm);
      const result = await executors['list_sources']!({}, defaultContext);

      expect(result.success).toBe(true);
      expect(result.metadata).toHaveProperty('sources');
      const sources = (result.metadata as Record<string, unknown>)['sources'] as Array<Record<string, unknown>>;
      expect(sources).toHaveLength(2);
    });

    it('should filter by tag', async () => {
      vi.mocked(longTerm.search).mockReturnValue([sampleFact]);

      const { executors } = createKnowledgeSkill(longTerm);
      await executors['list_sources']!({ tag: 'spec' }, defaultContext);

      expect(longTerm.search).toHaveBeenCalledWith(
        '',
        { limit: 1000, tags: ['spec'] },
      );
    });

    it('should return empty sources for empty KB', async () => {
      vi.mocked(longTerm.search).mockReturnValue([]);

      const { executors } = createKnowledgeSkill(longTerm);
      const result = await executors['list_sources']!({}, defaultContext);

      expect(result.success).toBe(true);
      const sources = (result.metadata as Record<string, unknown>)['sources'] as unknown[];
      expect(sources).toHaveLength(0);
    });

    it('should handle list sources error', async () => {
      vi.mocked(longTerm.search).mockImplementation(() => {
        throw new Error('List failed');
      });

      const { executors } = createKnowledgeSkill(longTerm);
      const result = await executors['list_sources']!({}, defaultContext);

      expect(result.success).toBe(false);
      expect(result.error).toContain('List failed');
    });
  });

  describe('remove_source', () => {
    it('TC-T003-004: should remove document by ID', async () => {
      vi.mocked(longTerm.getFact).mockReturnValue(sampleFact);
      vi.mocked(longTerm.deleteFact).mockReturnValue(true);

      const { executors } = createKnowledgeSkill(longTerm);
      const result = await executors['remove_source']!(
        { document_id: 'doc_12345' },
        defaultContext,
      );

      expect(result.success).toBe(true);
      expect(longTerm.deleteFact).toHaveBeenCalledWith('doc_12345');
    });

    it('should fail when document not found', async () => {
      vi.mocked(longTerm.getFact).mockReturnValue(undefined);

      const { executors } = createKnowledgeSkill(longTerm);
      const result = await executors['remove_source']!(
        { document_id: 'nonexistent' },
        defaultContext,
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });

    it('should fail when document_id is missing', async () => {
      const { executors } = createKnowledgeSkill(longTerm);
      const result = await executors['remove_source']!({}, defaultContext);

      expect(result.success).toBe(false);
      expect(result.error).toContain('document_id');
    });

    it('should handle delete failure', async () => {
      vi.mocked(longTerm.getFact).mockReturnValue(sampleFact);
      vi.mocked(longTerm.deleteFact).mockReturnValue(false);

      const { executors } = createKnowledgeSkill(longTerm);
      const result = await executors['remove_source']!(
        { document_id: 'fact_001' },
        defaultContext,
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to delete');
    });
  });
});
