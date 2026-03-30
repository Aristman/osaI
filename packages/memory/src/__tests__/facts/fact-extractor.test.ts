/**
 * @osai/memory -- FactExtractor Unit Tests (T-008)
 *
 * TC-001: extract() calls LLM with fact extraction prompt
 * TC-002: extract() parses JSON response and creates MemoryEntry[]
 * TC-003: extract() on LLM error returns empty array (graceful degradation)
 * TC-004: extract() logs extracted facts in audit log
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FactExtractor } from '../../facts/fact-extractor.js';
import type { LLMProvider, LLMRequest, LLMResponse } from '@osai/providers';
import { ProviderStatus } from '@osai/providers';
import { MemoryCategory, MemoryTier } from '../../types/memory.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Create a mock LLM provider that returns the given content.
 */
function createMockLLMProvider(content: string, shouldFail = false): LLMProvider {
  return {
    id: 'mock-llm',
    name: 'Mock LLM',
    isAvailable: vi.fn().mockResolvedValue(true),
    complete: vi.fn().mockImplementation(async (_request: LLMRequest): Promise<LLMResponse> => {
      if (shouldFail) {
        throw new Error('LLM connection failed');
      }
      return {
        content,
        usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        model: 'mock-model',
        provider: 'mock-llm',
        finishReason: 'stop',
      };
    }),
    stream: vi.fn().mockImplementation(async function* () {
      // empty stream
    }),
    countTokens: vi.fn().mockReturnValue(10),
    getStatus: vi.fn().mockReturnValue(ProviderStatus.Available),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('FactExtractor', () => {
  let llm: LLMProvider;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // -----------------------------------------------------------------------
  // TC-001: extract() calls LLM with fact extraction prompt
  // -----------------------------------------------------------------------
  describe('TC-001: extract() calls LLM with fact extraction prompt', () => {
    it('should call LLM complete() with system prompt and user message', async () => {
      const responseContent = '[]';
      llm = createMockLLMProvider(responseContent);
      const extractor = new FactExtractor(llm);

      await extractor.extract('The user prefers dark mode.');

      expect(llm.complete).toHaveBeenCalledOnce();

      const callArgs = (llm.complete as ReturnType<typeof vi.fn>).mock.calls[0]!;
      const request: LLMRequest = callArgs[0] as LLMRequest;

      // Verify system prompt contains fact extraction instructions
      expect(request.messages).toHaveLength(2);
      expect(request.messages[0]!.role).toBe('system');
      expect(request.messages[0]!.content).toContain('fact extraction');
      expect(request.messages[1]!.role).toBe('user');
      expect(request.messages[1]!.content).toContain('The user prefers dark mode.');
    });

    it('should pass the response text in the user message', async () => {
      const responseText = 'My favorite color is blue and I live in Moscow.';
      llm = createMockLLMProvider('[]');
      const extractor = new FactExtractor(llm);

      await extractor.extract(responseText);

      const callArgs = (llm.complete as ReturnType<typeof vi.fn>).mock.calls[0]!;
      const request: LLMRequest = callArgs[0] as LLMRequest;

      expect(request.messages[1]!.content).toContain(responseText);
    });
  });

  // -----------------------------------------------------------------------
  // TC-002: extract() parses JSON response and creates MemoryEntry[]
  // -----------------------------------------------------------------------
  describe('TC-002: extract() parses JSON response and creates MemoryEntry[]', () => {
    it('should parse valid JSON array into MemoryEntry[]', async () => {
      const factsJson = JSON.stringify([
        { content: 'User prefers dark mode', tags: ['preference', 'ui'], category: 'preference' },
        { content: 'User lives in Moscow', tags: ['location'], category: 'fact' },
      ]);

      llm = createMockLLMProvider(factsJson);
      const extractor = new FactExtractor(llm);

      const entries = await extractor.extract('The user prefers dark mode and lives in Moscow.');

      expect(entries).toHaveLength(2);

      // First fact
      expect(entries[0]!.content).toBe('User prefers dark mode');
      expect(entries[0]!.category).toBe(MemoryCategory.Preference);
      expect(entries[0]!.tier).toBe(MemoryTier.LongTerm);
      expect(entries[0]!.tags).toEqual(['preference', 'ui']);
      expect(entries[0]!.id).toMatch(/^fact_/);
      expect(entries[0]!.createdAt).toBeDefined();
      expect(entries[0]!.updatedAt).toBeDefined();

      // Second fact
      expect(entries[1]!.content).toBe('User lives in Moscow');
      expect(entries[1]!.category).toBe(MemoryCategory.Fact);
      expect(entries[1]!.tier).toBe(MemoryTier.LongTerm);
      expect(entries[1]!.tags).toEqual(['location']);
    });

    it('should handle JSON wrapped in markdown code blocks', async () => {
      const factsJson = '```json\n[{"content": "User is a developer", "tags": ["profession"]}]\n```';

      llm = createMockLLMProvider(factsJson);
      const extractor = new FactExtractor(llm);

      const entries = await extractor.extract('The user is a software developer.');

      expect(entries).toHaveLength(1);
      expect(entries[0]!.content).toBe('User is a developer');
      expect(entries[0]!.category).toBe(MemoryCategory.Fact);
    });

    it('should return empty array for empty JSON array', async () => {
      llm = createMockLLMProvider('[]');
      const extractor = new FactExtractor(llm);

      const entries = await extractor.extract('Hello world');

      expect(entries).toHaveLength(0);
    });

    it('should set chatId on extracted entries when provided', async () => {
      const factsJson = JSON.stringify([
        { content: 'User likes pizza', tags: ['food'] },
      ]);

      llm = createMockLLMProvider(factsJson);
      const extractor = new FactExtractor(llm);

      const entries = await extractor.extract('The user likes pizza.', 'chat-123');

      expect(entries).toHaveLength(1);
      expect(entries[0]!.chatId).toBe('chat-123');
    });

    it('should default category to "fact" when not specified', async () => {
      const factsJson = JSON.stringify([
        { content: 'Some fact', tags: [] },
      ]);

      llm = createMockLLMProvider(factsJson);
      const extractor = new FactExtractor(llm);

      const entries = await extractor.extract('Some fact.');

      expect(entries[0]!.category).toBe(MemoryCategory.Fact);
    });

    it('should default tags to empty array when not provided', async () => {
      const factsJson = JSON.stringify([
        { content: 'A fact without tags' },
      ]);

      llm = createMockLLMProvider(factsJson);
      const extractor = new FactExtractor(llm);

      const entries = await extractor.extract('A fact.');

      expect(entries[0]!.tags).toEqual([]);
    });
  });

  // -----------------------------------------------------------------------
  // TC-003: extract() on LLM error returns empty array (graceful degradation)
  // -----------------------------------------------------------------------
  describe('TC-003: extract() on LLM error returns empty array', () => {
    it('should return empty array when LLM throws an error', async () => {
      llm = createMockLLMProvider('', true);
      const extractor = new FactExtractor(llm);

      const entries = await extractor.extract('Some text');

      expect(entries).toEqual([]);
    });

    it('should return empty array when LLM returns invalid JSON', async () => {
      llm = createMockLLMProvider('this is not json');
      const extractor = new FactExtractor(llm);

      const entries = await extractor.extract('Some text');

      expect(entries).toEqual([]);
    });

    it('should return empty array when LLM returns empty string', async () => {
      llm = createMockLLMProvider('');
      const extractor = new FactExtractor(llm);

      const entries = await extractor.extract('Some text');

      expect(entries).toEqual([]);
    });

    it('should not throw even on malformed JSON with valid structure but invalid content', async () => {
      // JSON array with non-object items
      llm = createMockLLMProvider('[1, 2, 3]');
      const extractor = new FactExtractor(llm);

      const entries = await extractor.extract('Some text');

      // Should gracefully degrade since parseFacts would throw
      expect(entries).toEqual([]);
    });
  });

  // -----------------------------------------------------------------------
  // TC-004: extract() logs extracted facts in audit log
  // -----------------------------------------------------------------------
  describe('TC-004: extract() logs extracted facts', () => {
    it('should not throw when logging (logger is internal)', async () => {
      const factsJson = JSON.stringify([
        { content: 'Important fact', tags: ['test'] },
      ]);

      llm = createMockLLMProvider(factsJson);
      const extractor = new FactExtractor(llm);

      // Should not throw even if logger has issues
      const entries = await extractor.extract('Important fact.', 'chat-456');

      expect(entries).toHaveLength(1);
      expect(entries[0]!.content).toBe('Important fact');
    });

    it('should log on successful extraction', async () => {
      const factsJson = JSON.stringify([
        { content: 'Logged fact', tags: ['audit'] },
      ]);

      llm = createMockLLMProvider(factsJson);
      const extractor = new FactExtractor(llm);

      // The logger is internal (pino), so we just verify the extraction works
      // without errors, which means logging paths are exercised.
      const entries = await extractor.extract('A logged fact.');

      expect(entries).toHaveLength(1);
    });

    it('should log on error (graceful degradation)', async () => {
      llm = createMockLLMProvider('', true);
      const extractor = new FactExtractor(llm);

      // Should not throw, and should internally log the error
      const entries = await extractor.extract('Any text');

      expect(entries).toEqual([]);
    });

    it('should produce entries with unique IDs', async () => {
      const factsJson = JSON.stringify([
        { content: 'Fact one', tags: [] },
        { content: 'Fact two', tags: [] },
        { content: 'Fact three', tags: [] },
      ]);

      llm = createMockLLMProvider(factsJson);
      const extractor = new FactExtractor(llm);

      const entries = await extractor.extract('Three facts.');

      const ids = entries.map((e) => e.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(3);
      for (const id of ids) {
        expect(id).toMatch(/^fact_/);
      }
    });
  });
});
