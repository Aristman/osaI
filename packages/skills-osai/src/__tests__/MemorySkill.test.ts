/**
 * MemorySkill tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createMemorySkill, createMemorySkillDefinition } from '../skills/MemorySkill.js';
import type { MemoryManager, ShortTermMemory, LongTermMemory, RagResult } from '@osai/memory';
import type { ToolContext } from '@osai/agent';

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

function createMockShortTermMemory(): ShortTermMemory {
  return {
    add: vi.fn().mockReturnValue('mem_001'),
    get: vi.fn(),
    getSessionMessages: vi.fn().mockReturnValue([]),
    search: vi.fn().mockReturnValue([]),
    clearSession: vi.fn(),
    prune: vi.fn(),
    getCount: vi.fn().mockReturnValue(0),
    close: vi.fn(),
  } as unknown as ShortTermMemory;
}

function createMockLongTermMemory(): LongTermMemory {
  return {
    addFact: vi.fn().mockReturnValue('fact_001'),
    getFact: vi.fn(),
    updateFact: vi.fn(),
    deleteFact: vi.fn(),
    search: vi.fn().mockReturnValue([]),
    semanticSearch: vi.fn().mockResolvedValue([]),
    getStats: vi.fn().mockReturnValue({ total: 0, byCategory: {} }),
    close: vi.fn(),
  } as unknown as LongTermMemory;
}

function createMockMemoryManager(): MemoryManager {
  const shortTerm = createMockShortTermMemory();
  const longTerm = createMockLongTermMemory();

  return {
    remember: vi.fn().mockResolvedValue('mem_001'),
    recall: vi.fn().mockResolvedValue({
      facts: [],
      context: '',
      totalFacts: 0,
      queryTokens: 0,
    }),
    forget: vi.fn().mockResolvedValue(true),
    getShortTerm: vi.fn().mockReturnValue(shortTerm),
    getLongTerm: vi.fn().mockReturnValue(longTerm),
    getRagPipeline: vi.fn(),
    close: vi.fn(),
  } as unknown as MemoryManager;
}

const defaultContext: ToolContext = {
  sessionId: 'test-session-001',
  toolCall: {
    id: 'tool-1',
    name: 'memory.remember',
    parameters: {},
  },
  config: {},
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('MemorySkill', () => {
  let manager: MemoryManager;
  let longTerm: LongTermMemory;
  let shortTerm: ShortTermMemory;

  beforeEach(() => {
    manager = createMockMemoryManager();
    longTerm = manager.getLongTerm();
    shortTerm = manager.getShortTerm();
    vi.clearAllMocks();
  });

  describe('SkillDefinition', () => {
    it('TC-T004-002: should return definition with 4 tools', () => {
      const definition = createMemorySkillDefinition();
      expect(definition.name).toBe('memory');
      expect(definition.version).toBe('1.0.0');
      expect(definition.tools).toHaveLength(4);
      expect(definition.category).toBe('system');
    });

    it('should have correct tool names', () => {
      const definition = createMemorySkillDefinition();
      const toolNames = definition.tools.map((t) => t.name);
      expect(toolNames).toContain('remember');
      expect(toolNames).toContain('recall');
      expect(toolNames).toContain('forget');
      expect(toolNames).toContain('summarize_session');
    });

    it('should have correct category assignments', () => {
      const definition = createMemorySkillDefinition();
      const forgetTool = definition.tools.find((t) => t.name === 'forget');
      expect(forgetTool?.category).toBe('write');

      const rememberTool = definition.tools.find((t) => t.name === 'remember');
      expect(rememberTool?.category).toBe('system');
    });
  });

  describe('remember', () => {
    it('TC-T002-001: should store memory and return fact ID', async () => {
      const { executors } = createMemorySkill(manager);
      const result = await executors['remember'](
        { content: 'User prefers dark theme', category: 'preference', tags: ['ui'] },
        defaultContext,
      );

      expect(result.success).toBe(true);
      expect(result.metadata).toHaveProperty('memory_id', 'fact_001');
      expect(longTerm.addFact).toHaveBeenCalledWith(
        expect.objectContaining({
          content: 'User prefers dark theme',
          category: 'preference',
          source: 'agent',
          sessionId: 'test-session-001',
          tags: ['ui'],
        }),
      );
    });

    it('should default category to fact when not provided', async () => {
      const { executors } = createMemorySkill(manager);
      await executors['remember'](
        { content: 'Some fact' },
        defaultContext,
      );

      expect(longTerm.addFact).toHaveBeenCalledWith(
        expect.objectContaining({
          category: 'fact',
        }),
      );
    });

    it('TC-T002-005: should reject invalid category', async () => {
      const { executors } = createMemorySkill(manager);
      const result = await executors['remember'](
        { content: 'Test', category: 'INVALID_CATEGORY' },
        defaultContext,
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('category');
    });

    it('should fail when content is missing', async () => {
      const { executors } = createMemorySkill(manager);
      const result = await executors['remember']({}, defaultContext);

      expect(result.success).toBe(false);
      expect(result.error).toContain('content');
    });

    it('should handle addFact error', async () => {
      vi.mocked(longTerm.addFact).mockImplementation(() => {
        throw new Error('Database error');
      });

      const { executors } = createMemorySkill(manager);
      const result = await executors['remember'](
        { content: 'Test' },
        defaultContext,
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Database error');
    });
  });

  describe('recall', () => {
    it('TC-T002-002: should recall memories matching query', async () => {
      const mockRagResult: RagResult = {
        facts: [
          {
            id: 'fact_001',
            content: 'User prefers dark theme',
            category: 'preference',
            source: 'agent',
            confidence: 0.9,
            createdAt: '2026-01-01T00:00:00Z',
            updatedAt: '2026-01-01T00:00:00Z',
          },
        ],
        context: 'User prefers dark theme',
        totalFacts: 1,
        queryTokens: 10,
      };
      vi.mocked(manager.recall).mockResolvedValue(mockRagResult);

      const { executors } = createMemorySkill(manager);
      const result = await executors['recall'](
        { query: 'theme preferences', top_k: 5 },
        defaultContext,
      );

      expect(result.success).toBe(true);
      expect(result.metadata).toHaveProperty('facts');
      expect(result.metadata).toHaveProperty('total_facts', 1);
      expect(manager.recall).toHaveBeenCalledWith(
        'test-session-001',
        'theme preferences',
        { maxResults: 5 },
      );
    });

    it('should fail when query is missing', async () => {
      const { executors } = createMemorySkill(manager);
      const result = await executors['recall']({}, defaultContext);

      expect(result.success).toBe(false);
      expect(result.error).toContain('query');
    });

    it('should clamp top_k to valid range', async () => {
      vi.mocked(manager.recall).mockResolvedValue({
        facts: [],
        context: '',
        totalFacts: 0,
        queryTokens: 0,
      });

      const { executors } = createMemorySkill(manager);
      await executors['recall']({ query: 'test', top_k: 100 }, defaultContext);

      expect(manager.recall).toHaveBeenCalledWith(
        'test-session-001',
        'test',
        { maxResults: 50 },
      );
    });

    it('should handle recall error', async () => {
      vi.mocked(manager.recall).mockRejectedValue(
        new Error('RAG pipeline error'),
      );

      const { executors } = createMemorySkill(manager);
      const result = await executors['recall'](
        { query: 'test' },
        defaultContext,
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('RAG pipeline error');
    });
  });

  describe('forget', () => {
    it('TC-T002-003: should forget memory by ID', async () => {
      vi.mocked(manager.forget).mockResolvedValue(true);

      const { executors } = createMemorySkill(manager);
      const result = await executors['forget'](
        { memory_id: 'mem_12345' },
        defaultContext,
      );

      expect(result.success).toBe(true);
      expect(manager.forget).toHaveBeenCalledWith('test-session-001', 'mem_12345');
    });

    it('should fail when memory not found', async () => {
      vi.mocked(manager.forget).mockResolvedValue(false);

      const { executors } = createMemorySkill(manager);
      const result = await executors['forget'](
        { memory_id: 'nonexistent' },
        defaultContext,
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });

    it('should fail when memory_id is missing', async () => {
      const { executors } = createMemorySkill(manager);
      const result = await executors['forget']({}, defaultContext);

      expect(result.success).toBe(false);
      expect(result.error).toContain('memory_id');
    });
  });

  describe('summarize_session', () => {
    it('TC-T002-004: should summarize session with messages', async () => {
      vi.mocked(shortTerm.getSessionMessages).mockReturnValue([
        {
          id: 'mem_001',
          sessionId: 'test-session-001',
          role: 'user',
          content: 'Hello',
          timestamp: '2026-01-01T00:00:00Z',
          category: 'message',
        },
        {
          id: 'mem_002',
          sessionId: 'test-session-001',
          role: 'assistant',
          content: 'Hi there!',
          timestamp: '2026-01-01T00:00:01Z',
          category: 'message',
        },
      ]);

      const { executors } = createMemorySkill(manager);
      const result = await executors['summarize_session'](
        { session_id: 'session_123' },
        defaultContext,
      );

      expect(result.success).toBe(true);
      expect(result.metadata).toHaveProperty('summary');
      expect(result.metadata).toHaveProperty('message_count', 2);
      expect(shortTerm.getSessionMessages).toHaveBeenCalledWith('session_123');
    });

    it('should use current session ID when session_id not provided', async () => {
      vi.mocked(shortTerm.getSessionMessages).mockReturnValue([]);

      const { executors } = createMemorySkill(manager);
      await executors['summarize_session']({}, defaultContext);

      expect(shortTerm.getSessionMessages).toHaveBeenCalledWith('test-session-001');
    });

    it('should handle empty session', async () => {
      vi.mocked(shortTerm.getSessionMessages).mockReturnValue([]);

      const { executors } = createMemorySkill(manager);
      const result = await executors['summarize_session']({}, defaultContext);

      expect(result.success).toBe(true);
      expect(result.metadata).toHaveProperty('message_count', 0);
    });

    it('should handle summarize error', async () => {
      vi.mocked(shortTerm.getSessionMessages).mockImplementation(() => {
        throw new Error('DB error');
      });

      const { executors } = createMemorySkill(manager);
      const result = await executors['summarize_session']({}, defaultContext);

      expect(result.success).toBe(false);
      expect(result.error).toContain('DB error');
    });
  });
});
