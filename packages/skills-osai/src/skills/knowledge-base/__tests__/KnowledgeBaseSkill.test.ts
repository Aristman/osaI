/**
 * @osai/skills-osai -- Knowledge Base Skill Unit Tests
 *
 * TC-008-1: ingest_document delegates to KnowledgeBase.ingest()
 * TC-008-2: query_knowledge delegates to KnowledgeBase.search()
 * TC-008-3: list_sources delegates to KnowledgeBase.listSources()
 * TC-008-3+: remove_source delegates to KnowledgeBase.removeSource()
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock @osai/observability
// ---------------------------------------------------------------------------

vi.mock('@osai/observability', () => ({
  LoggerFactory: {
    create: vi.fn().mockReturnValue({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    }),
  },
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { KnowledgeBaseSkill } from '../KnowledgeBaseSkill.js';
import type { KnowledgeBaseService } from '../KnowledgeBaseSkill.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockKnowledgeBaseService(): KnowledgeBaseService {
  return {
    ingestDocument: vi.fn(),
    search: vi.fn(),
    listSources: vi.fn(),
    removeSource: vi.fn(),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('KnowledgeBaseSkill', () => {
  let skill: KnowledgeBaseSkill;
  let mockService: KnowledgeBaseService;

  beforeEach(() => {
    vi.clearAllMocks();
    mockService = createMockKnowledgeBaseService();
    skill = new KnowledgeBaseSkill({ knowledgeBaseService: mockService });
  });

  // -------------------------------------------------------------------------
  // getDefinition
  // -------------------------------------------------------------------------

  describe('getDefinition', () => {
    it('returns a valid SkillDefinition', () => {
      const definition = skill.getDefinition();

      expect(definition.name).toBe('knowledge-base');
      expect(definition.version).toBe('1.0.0');
      expect(definition.category).toBe('osaI');
      expect(definition.enabled).toBe(true);
      expect(definition.tools).toHaveLength(4);
    });

    it('has correct tool names', () => {
      const definition = skill.getDefinition();
      const toolNames = definition.tools.map(t => t.name);

      expect(toolNames).toContain('ingest_document');
      expect(toolNames).toContain('query_knowledge');
      expect(toolNames).toContain('list_sources');
      expect(toolNames).toContain('remove_source');
    });

    it('has correct permission mapping', () => {
      const definition = skill.getDefinition();

      expect(definition.permissions['ingest_document']).toBe('confirm');
      expect(definition.permissions['query_knowledge']).toBe('auto');
      expect(definition.permissions['list_sources']).toBe('auto');
      expect(definition.permissions['remove_source']).toBe('confirm');
    });

    it('tools have valid JSON Schema parameters', () => {
      const definition = skill.getDefinition();

      for (const tool of definition.tools) {
        expect(tool.parameters.type).toBe('object');
        expect(tool.parameters.properties).toBeDefined();
      }
    });
  });

  // -------------------------------------------------------------------------
  // TC-008-1: ingest_document
  // -------------------------------------------------------------------------

  describe('ingest_document (TC-008-1)', () => {
    it('delegates to KnowledgeBaseService.ingestDocument()', async () => {
      vi.mocked(mockService.ingestDocument).mockResolvedValue({ documentId: 'doc-001' });

      const definition = skill.getDefinition();
      const tool = definition.tools.find(t => t.name === 'ingest_document')!;

      const result = await tool.handler({ path: '/docs/readme.md' });

      expect(mockService.ingestDocument).toHaveBeenCalledOnce();
      expect(mockService.ingestDocument).toHaveBeenCalledWith('/docs/readme.md', undefined, undefined);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual({ documentId: 'doc-001' });
      }
    });

    it('passes format and tags to service', async () => {
      vi.mocked(mockService.ingestDocument).mockResolvedValue({ documentId: 'doc-002' });

      const definition = skill.getDefinition();
      const tool = definition.tools.find(t => t.name === 'ingest_document')!;

      await tool.handler({
        path: '/docs/spec.md',
        format: 'markdown',
        tags: ['api', 'reference'],
      });

      expect(mockService.ingestDocument).toHaveBeenCalledWith(
        '/docs/spec.md',
        'markdown',
        ['api', 'reference'],
      );
    });

    it('returns error when path is missing', async () => {
      const definition = skill.getDefinition();
      const tool = definition.tools.find(t => t.name === 'ingest_document')!;

      const result = await tool.handler({});

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('path');
      }
      expect(mockService.ingestDocument).not.toHaveBeenCalled();
    });

    it('returns error when service throws', async () => {
      vi.mocked(mockService.ingestDocument).mockRejectedValue(new Error('File not found'));

      const definition = skill.getDefinition();
      const tool = definition.tools.find(t => t.name === 'ingest_document')!;

      const result = await tool.handler({ path: '/missing/file.txt' });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('File not found');
      }
    });
  });

  // -------------------------------------------------------------------------
  // TC-008-2: query_knowledge
  // -------------------------------------------------------------------------

  describe('query_knowledge (TC-008-2)', () => {
    it('delegates to KnowledgeBaseService.search()', async () => {
      const searchResults = [
        {
          chunk: { id: 'chunk-001', content: 'Test content', chunkIndex: 0 },
          source: { documentId: 'doc-001', title: 'Test', path: '/test.md', tags: ['test'] },
          similarity: 0.95,
        },
      ];
      vi.mocked(mockService.search).mockResolvedValue(searchResults);

      const definition = skill.getDefinition();
      const tool = definition.tools.find(t => t.name === 'query_knowledge')!;

      const result = await tool.handler({ query: 'test query' });

      expect(mockService.search).toHaveBeenCalledOnce();
      expect(mockService.search).toHaveBeenCalledWith('test query', {});
      expect(result.success).toBe(true);
      if (result.success) {
        const data = result.data as Array<{ content: string; similarity: number }>;
        expect(data).toHaveLength(1);
        expect(data[0]!.content).toBe('Test content');
        expect(data[0]!.similarity).toBe(0.95);
      }
    });

    it('passes topK and minSimilarity to service', async () => {
      vi.mocked(mockService.search).mockResolvedValue([]);

      const definition = skill.getDefinition();
      const tool = definition.tools.find(t => t.name === 'query_knowledge')!;

      await tool.handler({ query: 'test', topK: 3, minSimilarity: 0.5 });

      expect(mockService.search).toHaveBeenCalledWith('test', { topK: 3, minSimilarity: 0.5 });
    });

    it('returns error when query is missing', async () => {
      const definition = skill.getDefinition();
      const tool = definition.tools.find(t => t.name === 'query_knowledge')!;

      const result = await tool.handler({});

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('query');
      }
      expect(mockService.search).not.toHaveBeenCalled();
    });

    it('returns empty array when no results', async () => {
      vi.mocked(mockService.search).mockResolvedValue([]);

      const definition = skill.getDefinition();
      const tool = definition.tools.find(t => t.name === 'query_knowledge')!;

      const result = await tool.handler({ query: 'nonexistent' });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual([]);
      }
    });

    it('returns error when service throws', async () => {
      vi.mocked(mockService.search).mockRejectedValue(new Error('Embedding service unavailable'));

      const definition = skill.getDefinition();
      const tool = definition.tools.find(t => t.name === 'query_knowledge')!;

      const result = await tool.handler({ query: 'test' });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('Embedding service unavailable');
      }
    });
  });

  // -------------------------------------------------------------------------
  // TC-008-3: list_sources
  // -------------------------------------------------------------------------

  describe('list_sources (TC-008-3)', () => {
    it('delegates to KnowledgeBaseService.listSources()', async () => {
      const sources = [
        { documentId: 'doc-001', title: 'Readme', path: '/readme.md', format: 'markdown', tags: ['docs'] },
        { documentId: 'doc-002', title: 'Spec', path: '/spec.md', format: 'markdown', tags: ['docs', 'api'] },
      ];
      vi.mocked(mockService.listSources).mockResolvedValue(sources);

      const definition = skill.getDefinition();
      const tool = definition.tools.find(t => t.name === 'list_sources')!;

      const result = await tool.handler({});

      expect(mockService.listSources).toHaveBeenCalledOnce();
      expect(mockService.listSources).toHaveBeenCalledWith(undefined);
      expect(result.success).toBe(true);
      if (result.success) {
        const data = result.data as Array<{ documentId: string; title: string }>;
        expect(data).toHaveLength(2);
        expect(data[0]!.documentId).toBe('doc-001');
        expect(data[1]!.documentId).toBe('doc-002');
      }
    });

    it('passes tag filter as tags array to service', async () => {
      vi.mocked(mockService.listSources).mockResolvedValue([]);

      const definition = skill.getDefinition();
      const tool = definition.tools.find(t => t.name === 'list_sources')!;

      await tool.handler({ tag: 'api' });

      expect(mockService.listSources).toHaveBeenCalledWith({ tags: ['api'] });
    });

    it('returns empty array when no sources', async () => {
      vi.mocked(mockService.listSources).mockResolvedValue([]);

      const definition = skill.getDefinition();
      const tool = definition.tools.find(t => t.name === 'list_sources')!;

      const result = await tool.handler({});

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual([]);
      }
    });

    it('returns error when service throws', async () => {
      vi.mocked(mockService.listSources).mockRejectedValue(new Error('Database locked'));

      const definition = skill.getDefinition();
      const tool = definition.tools.find(t => t.name === 'list_sources')!;

      const result = await tool.handler({});

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('Database locked');
      }
    });
  });

  // -------------------------------------------------------------------------
  // remove_source (additional test)
  // -------------------------------------------------------------------------

  describe('remove_source', () => {
    it('delegates to KnowledgeBaseService.removeSource()', async () => {
      vi.mocked(mockService.removeSource).mockResolvedValue(undefined);

      const definition = skill.getDefinition();
      const tool = definition.tools.find(t => t.name === 'remove_source')!;

      const result = await tool.handler({ documentId: 'doc-001' });

      expect(mockService.removeSource).toHaveBeenCalledOnce();
      expect(mockService.removeSource).toHaveBeenCalledWith('doc-001');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual({ removed: true, documentId: 'doc-001' });
      }
    });

    it('returns error when documentId is missing', async () => {
      const definition = skill.getDefinition();
      const tool = definition.tools.find(t => t.name === 'remove_source')!;

      const result = await tool.handler({});

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('documentId');
      }
      expect(mockService.removeSource).not.toHaveBeenCalled();
    });

    it('returns error when service throws', async () => {
      vi.mocked(mockService.removeSource).mockRejectedValue(new Error('Source not found: doc-999'));

      const definition = skill.getDefinition();
      const tool = definition.tools.find(t => t.name === 'remove_source')!;

      const result = await tool.handler({ documentId: 'doc-999' });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('Source not found: doc-999');
      }
    });
  });
});
