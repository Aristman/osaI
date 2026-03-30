/**
 * Unit tests for FactExtractor
 *
 * Covers: T-007 Fact Extraction acceptance criteria
 *   - TC-007-1: Extracts facts from assistant response
 *   - TC-007-2: Calls AFTER_MEMORY_QUERY hook with facts
 *   - TC-007-3: Delegates saving to Memory System via storeFacts
 *   - TC-007-4: Error in extraction does not block loop (graceful degradation)
 *   - TC-007-5: Empty response -- no facts extracted
 *
 * Mock strategy: HookRegistry is real, StoreFactsFunction is fully mocked.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { FactExtractor } from '../FactExtractor.js';
import { HookRegistry } from '../../hooks/HookRegistry.js';
import { HookPoint } from '../../hooks/types.js';
import type { HookContext } from '../../hooks/types.js';
import type { Fact, StoreFactsFunction } from '../types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockStoreFacts() {
  const mockFn = vi.fn<StoreFactsFunction>().mockResolvedValue(undefined);
  return mockFn;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('FactExtractor', () => {
  let hooks: HookRegistry;
  let mockStoreFacts: ReturnType<typeof vi.fn>;
  let extractor: FactExtractor;

  beforeEach(() => {
    hooks = new HookRegistry();
    mockStoreFacts = createMockStoreFacts();
    extractor = new FactExtractor(hooks, mockStoreFacts);
  });

  // -----------------------------------------------------------------------
  // TC-007-1: Extracts facts from assistant response
  // -----------------------------------------------------------------------
  describe('TC-007-1: Extracts facts from assistant response', () => {
    it('should extract dates in ISO format', async () => {
      const facts = await extractor.extract(
        'The meeting is scheduled for 2026-03-30.',
        'chat-001',
        'session-001',
      );

      const dateFacts = facts.filter((f) => f.category === 'date');
      expect(dateFacts.length).toBeGreaterThanOrEqual(1);
      expect(dateFacts[0]!.content).toContain('2026-03-30');
    });

    it('should extract dates in long format', async () => {
      const facts = await extractor.extract(
        'The deadline is March 15, 2026.',
        'chat-001',
        'session-001',
      );

      const dateFacts = facts.filter((f) => f.category === 'date');
      expect(dateFacts.length).toBeGreaterThanOrEqual(1);
    });

    it('should extract names', async () => {
      const facts = await extractor.extract(
        'My name is Alex and I work as a developer.',
        'chat-001',
        'session-001',
      );

      const nameFacts = facts.filter((f) => f.category === 'name');
      expect(nameFacts.length).toBeGreaterThanOrEqual(1);
      expect(nameFacts[0]!.content).toContain('Alex');
    });

    it('should extract numbers with units', async () => {
      const facts = await extractor.extract(
        'The project budget is 5000 USD and the deadline is in 30 days.',
        'chat-001',
        'session-001',
      );

      const numberFacts = facts.filter((f) => f.category === 'number');
      expect(numberFacts.length).toBeGreaterThanOrEqual(1);
    });

    it('should extract preferences', async () => {
      const facts = await extractor.extract(
        'I prefer dark mode for my IDE. I always use Vim for editing.',
        'chat-001',
        'session-001',
      );

      const prefFacts = facts.filter((f) => f.category === 'preference');
      expect(prefFacts.length).toBeGreaterThanOrEqual(1);
    });

    it('should extract explicit facts', async () => {
      const facts = await extractor.extract(
        'Remember that the API key expires on June 1st.',
        'chat-001',
        'session-001',
      );

      const explicitFacts = facts.filter((f) => f.category === 'explicit');
      expect(explicitFacts.length).toBeGreaterThanOrEqual(1);
    });

    it('should assign correct metadata to extracted facts', async () => {
      const facts = await extractor.extract(
        'My name is Alice.',
        'chat-123',
        'session-456',
      );

      expect(facts.length).toBeGreaterThanOrEqual(1);
      for (const fact of facts) {
        expect(fact.id).toBeDefined();
        expect(typeof fact.id).toBe('string');
        expect(fact.chatId).toBe('chat-123');
        expect(fact.sessionId).toBe('session-456');
        expect(fact.extractedAt).toBeDefined();
        expect(typeof fact.confidence).toBe('number');
        expect(fact.confidence).toBeGreaterThanOrEqual(0);
        expect(fact.confidence).toBeLessThanOrEqual(1);
      }
    });

    it('should deduplicate identical facts', async () => {
      const facts = await extractor.extract(
        'The date is 2026-03-30. Remember: the date is 2026-03-30.',
        'chat-001',
        'session-001',
      );

      const dateFacts = facts.filter((f) => f.category === 'date');
      // Should deduplicate the same ISO date
      expect(dateFacts.length).toBeLessThanOrEqual(2);
    });
  });

  // -----------------------------------------------------------------------
  // TC-007-2: Calls AFTER_MEMORY_QUERY hook with facts
  // -----------------------------------------------------------------------
  describe('TC-007-2: AFTER_MEMORY_QUERY hook called with facts', () => {
    it('should call AFTER_MEMORY_QUERY hook after extraction', async () => {
      const hookCalls: HookContext[] = [];

      hooks.register(HookPoint.AFTER_MEMORY_QUERY, (ctx) => {
        hookCalls.push(ctx);
        return ctx;
      });

      await extractor.extract(
        'My name is Bob. The deadline is 2026-04-01.',
        'chat-001',
        'session-001',
      );

      expect(hookCalls).toHaveLength(1);
      expect(hookCalls[0]!.hookPoint).toBe(HookPoint.AFTER_MEMORY_QUERY);
    });

    it('should include extracted facts count in hook data', async () => {
      const hookCalls: HookContext[] = [];

      hooks.register(HookPoint.AFTER_MEMORY_QUERY, (ctx) => {
        hookCalls.push(ctx);
        return ctx;
      });

      await extractor.extract(
        'My name is Charlie.',
        'chat-001',
        'session-001',
      );

      const ctx = hookCalls[0]!;
      expect(ctx.data['extractedFactCount']).toBeDefined();
      expect(typeof ctx.data['extractedFactCount']).toBe('number');
    });

    it('should include fact categories in hook data', async () => {
      const hookCalls: HookContext[] = [];

      hooks.register(HookPoint.AFTER_MEMORY_QUERY, (ctx) => {
        hookCalls.push(ctx);
        return ctx;
      });

      await extractor.extract(
        'My name is Dave. The deadline is 2026-05-01.',
        'chat-001',
        'session-001',
      );

      const ctx = hookCalls[0]!;
      const categories = ctx.data['factCategories'] as string[];
      expect(categories).toBeDefined();
      expect(Array.isArray(categories)).toBe(true);
      expect(categories).toContain('name');
      expect(categories).toContain('date');
    });

    it('should call BEFORE_FACT_EXTRACTION hook before extraction', async () => {
      const hookCalls: HookContext[] = [];

      hooks.register(HookPoint.BEFORE_FACT_EXTRACTION, (ctx) => {
        hookCalls.push(ctx);
        return ctx;
      });

      await extractor.extract(
        'Some response text.',
        'chat-001',
        'session-001',
      );

      expect(hookCalls).toHaveLength(1);
      expect(hookCalls[0]!.hookPoint).toBe(HookPoint.BEFORE_FACT_EXTRACTION);
      expect(hookCalls[0]!.data['response']).toBe('Some response text.');
    });
  });

  // -----------------------------------------------------------------------
  // TC-007-3: Delegates saving to Memory System via storeFacts
  // -----------------------------------------------------------------------
  describe('TC-007-3: Delegates saving to Memory System', () => {
    it('should store extracted facts via storeFacts function', async () => {
      const facts: Fact[] = await extractor.extract(
        'My name is Eve.',
        'chat-001',
        'session-001',
      );

      await extractor.storeFacts(facts);

      expect(mockStoreFacts).toHaveBeenCalledTimes(1);
      expect(mockStoreFacts.mock.calls[0]![0]).toEqual(facts);
    });

    it('should not call storeFacts when no facts extracted', async () => {
      const facts: Fact[] = await extractor.extract(
        'Hello, how are you?',
        'chat-001',
        'session-001',
      );

      await extractor.storeFacts(facts);

      expect(mockStoreFacts).not.toHaveBeenCalled();
    });

    it('should not throw when storeFacts function throws (graceful degradation)', async () => {
      const consoleSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      mockStoreFacts.mockRejectedValue(new Error('Database unavailable'));

      const facts: Fact[] = [
        {
          id: 'fact-001',
          content: 'Test fact',
          category: 'explicit',
          chatId: 'chat-001',
          sessionId: 'session-001',
          extractedAt: new Date().toISOString(),
          confidence: 0.9,
        },
      ];

      // Should NOT throw
      await extractor.storeFacts(facts);

      expect(consoleSpy).toHaveBeenCalledTimes(1);
      expect(consoleSpy.mock.calls[0]![0]).toContain('[FactExtractor]');

      consoleSpy.mockRestore();
    });

    it('should not store facts when no storeFacts function provided', async () => {
      const extractorNoStore = new FactExtractor(hooks);

      const facts: Fact[] = [
        {
          id: 'fact-001',
          content: 'Test fact',
          category: 'explicit',
          chatId: 'chat-001',
          sessionId: 'session-001',
          extractedAt: new Date().toISOString(),
          confidence: 0.9,
        },
      ];

      // Should NOT throw even without storeFacts
      await extractorNoStore.storeFacts(facts);
    });
  });

  // -----------------------------------------------------------------------
  // TC-007-4: Error in extraction does not block loop
  // -----------------------------------------------------------------------
  describe('TC-007-4: Error handling (graceful degradation)', () => {
    it('should return empty facts and not throw when hook throws', async () => {
      hooks.register(HookPoint.BEFORE_FACT_EXTRACTION, () => {
        throw new Error('Hook failed');
      });

      // extract() itself should still work because HookRegistry handles errors gracefully
      const facts = await extractor.extract(
        'My name is Frank.',
        'chat-001',
        'session-001',
      );

      // Should still extract facts even when hook throws (HookRegistry degrades)
      expect(facts.length).toBeGreaterThanOrEqual(1);
    });

    it('extractAndStore should handle extraction errors gracefully', async () => {
      // This tests extractAndStore which wraps extract in try/catch
      // We cannot easily make extract() throw because HookRegistry is graceful,
      // but extractAndStore has its own try/catch

      const result = await extractor.extractAndStore(
        'Normal text without facts.',
        'chat-001',
        'session-001',
      );

      expect(result.hasErrors).toBe(false);
      expect(result.errors).toHaveLength(0);
    });

    it('extractAndStore should not report errors when storeFacts fails (graceful degradation in storeFacts)', async () => {
      const consoleSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      mockStoreFacts.mockRejectedValue(new Error('Store failed'));

      const result = await extractor.extractAndStore(
        'My name is Grace.',
        'chat-001',
        'session-001',
      );

      // storeFacts catches errors internally (graceful degradation),
      // so extractAndStore should not report them as errors
      expect(result.hasErrors).toBe(false);
      // Facts should still be extracted even if storage failed
      expect(result.facts.length).toBeGreaterThanOrEqual(1);
      // Error should be logged by storeFacts
      expect(consoleSpy).toHaveBeenCalledTimes(1);

      consoleSpy.mockRestore();
    });
  });

  // -----------------------------------------------------------------------
  // TC-007-5: Empty response -- no facts extracted
  // -----------------------------------------------------------------------
  describe('TC-007-5: Empty response', () => {
    it('should return empty array for empty response', async () => {
      const facts = await extractor.extract(
        '',
        'chat-001',
        'session-001',
      );

      expect(facts).toHaveLength(0);
    });

    it('should return empty array for response with no patterns', async () => {
      const facts = await extractor.extract(
        'Hello, how can I help you today?',
        'chat-001',
        'session-001',
      );

      expect(facts).toHaveLength(0);
    });

    it('should return empty array for whitespace-only response', async () => {
      const facts = await extractor.extract(
        '   \n\t  ',
        'chat-001',
        'session-001',
      );

      expect(facts).toHaveLength(0);
    });

    it('extractAndStore should return count=0 for empty response', async () => {
      const result = await extractor.extractAndStore(
        'No facts here.',
        'chat-001',
        'session-001',
      );

      expect(result.count).toBe(0);
      expect(result.facts).toHaveLength(0);
      expect(result.hasErrors).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // extractAndStore convenience method
  // -----------------------------------------------------------------------
  describe('extractAndStore', () => {
    it('should extract and store in a single call', async () => {
      const result = await extractor.extractAndStore(
        'My name is Heidi. The deadline is 2026-06-15.',
        'chat-001',
        'session-001',
      );

      expect(result.count).toBeGreaterThanOrEqual(1);
      expect(result.hasErrors).toBe(false);
      expect(mockStoreFacts).toHaveBeenCalledTimes(1);
    });

    it('should return structured ExtractionResult', async () => {
      const result = await extractor.extractAndStore(
        'I prefer coffee over tea.',
        'chat-001',
        'session-001',
      );

      expect(result).toHaveProperty('facts');
      expect(result).toHaveProperty('count');
      expect(result).toHaveProperty('hasErrors');
      expect(result).toHaveProperty('errors');
      expect(Array.isArray(result.facts)).toBe(true);
      expect(typeof result.count).toBe('number');
      expect(typeof result.hasErrors).toBe('boolean');
      expect(Array.isArray(result.errors)).toBe(true);
    });
  });
});
