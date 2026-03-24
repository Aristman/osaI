/**
 * @osai/memory -- RagPipeline tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { LongTermMemory } from '../long-term/LongTermMemory.js';
import { RagPipeline } from '../rag/RagPipeline.js';
import type { Fact } from '../types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createPipeline(): { pipeline: RagPipeline; memory: LongTermMemory } {
  const memory = new LongTermMemory(':memory:');
  const pipeline = new RagPipeline(memory);
  return { pipeline, memory };
}

function addFact(
  memory: LongTermMemory,
  overrides: Partial<Omit<Fact, 'id' | 'createdAt' | 'updatedAt'>> = {},
): string {
  return memory.addFact({
    content: 'Test fact content',
    category: 'fact',
    source: 'test',
    confidence: 0.8,
    ...overrides,
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('RagPipeline', () => {
  let pipeline: RagPipeline;
  let memory: LongTermMemory;

  beforeEach(() => {
    const setup = createPipeline();
    pipeline = setup.pipeline;
    memory = setup.memory;
  });

  afterEach(() => {
    memory.close();
  });

  // -----------------------------------------------------------------------
  // query
  // -----------------------------------------------------------------------
  describe('query', () => {
    it('should return relevant facts for a query', async () => {
      addFact(memory, { content: 'The user prefers dark mode', category: 'preference' });
      addFact(memory, { content: 'The user works at a tech company' });

      const result = await pipeline.query({ query: 'prefers' });
      expect(result.facts.length).toBeGreaterThanOrEqual(1);
    });

    it('should respect maxResults', async () => {
      for (let i = 0; i < 5; i++) {
        addFact(memory, { content: `fact about user preference ${i}` });
      }

      const result = await pipeline.query({
        query: 'user',
        maxResults: 2,
      });
      expect(result.facts.length).toBeLessThanOrEqual(2);
    });

    it('should filter by minConfidence', async () => {
      addFact(memory, { content: 'high confidence fact', confidence: 0.9 });
      addFact(memory, { content: 'low confidence fact', confidence: 0.1 });

      const result = await pipeline.query({
        query: 'fact',
        minConfidence: 0.5,
      });
      expect(result.facts.every((f) => f.confidence >= 0.5)).toBe(true);
      expect(result.facts).toHaveLength(1);
    });

    it('should return empty when no facts match', async () => {
      addFact(memory, { content: 'unrelated fact' });

      const result = await pipeline.query({ query: 'xyznonexistent123' });
      expect(result.facts).toHaveLength(0);
      expect(result.context).toBeDefined();
    });

    it('should include queryTokens estimate', async () => {
      const result = await pipeline.query({ query: 'hello world' });
      expect(result.queryTokens).toBeGreaterThan(0);
    });

    it('should set totalFacts to match facts array length', async () => {
      addFact(memory, { content: 'fact one' });
      addFact(memory, { content: 'fact two' });

      const result = await pipeline.query({ query: 'fact' });
      expect(result.totalFacts).toBe(result.facts.length);
    });

    it('should prioritize session facts when sessionId is provided', async () => {
      addFact(memory, { content: 'session fact', sessionId: 's1' });
      addFact(memory, { content: 'other fact', sessionId: 's2' });

      const result = await pipeline.query({
        query: 'fact',
        sessionId: 's1',
      });
      // Session facts should appear first
      if (result.facts.length >= 2) {
        expect(result.facts[0]!.sessionId).toBe('s1');
      }
    });

    it('should return context string', async () => {
      addFact(memory, { content: 'context test fact' });

      const result = await pipeline.query({ query: 'context' });
      expect(typeof result.context).toBe('string');
      expect(result.context.length).toBeGreaterThan(0);
    });
  });

  // -----------------------------------------------------------------------
  // formatContext
  // -----------------------------------------------------------------------
  describe('formatContext', () => {
    it('should return "No relevant context found" for empty facts', () => {
      const context = pipeline.formatContext([], 'test query');
      expect(context).toBe('No relevant context found.');
    });

    it('should format facts with category headers', () => {
      const facts: Fact[] = [
        {
          id: 'f1',
          content: 'User prefers dark mode',
          category: 'preference',
          source: 'test',
          confidence: 0.8,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ];
      const context = pipeline.formatContext(facts, 'user preferences');
      expect(context).toContain('Preferences');
      expect(context).toContain('User prefers dark mode');
      expect(context).toContain('80%');
    });

    it('should group facts by category', () => {
      const facts: Fact[] = [
        {
          id: 'f1',
          content: 'fact 1',
          category: 'fact',
          source: 'test',
          confidence: 0.8,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: 'f2',
          content: 'pref 1',
          category: 'preference',
          source: 'test',
          confidence: 0.7,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ];
      const context = pipeline.formatContext(facts, 'test');
      expect(context).toContain('Facts');
      expect(context).toContain('Preferences');
      expect(context).toContain('fact 1');
      expect(context).toContain('pref 1');
    });

    it('should include tags in formatted output', () => {
      const facts: Fact[] = [
        {
          id: 'f1',
          content: 'tagged content',
          category: 'fact',
          source: 'test',
          confidence: 0.8,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          tags: ['os', 'linux'],
        },
      ];
      const context = pipeline.formatContext(facts, 'test');
      expect(context).toContain('[os, linux]');
    });

    it('should include source information', () => {
      const facts: Fact[] = [
        {
          id: 'f1',
          content: 'sourced fact',
          category: 'fact',
          source: 'conversation',
          confidence: 0.8,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ];
      const context = pipeline.formatContext(facts, 'test');
      expect(context).toContain('Source: conversation');
    });

    it('should number the facts', () => {
      const facts: Fact[] = [
        {
          id: 'f1',
          content: 'first',
          category: 'fact',
          source: 'test',
          confidence: 0.8,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: 'f2',
          content: 'second',
          category: 'fact',
          source: 'test',
          confidence: 0.7,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ];
      const context = pipeline.formatContext(facts, 'test');
      expect(context).toContain('1.');
      expect(context).toContain('2.');
    });
  });

  // -----------------------------------------------------------------------
  // extractFacts (stub)
  // -----------------------------------------------------------------------
  describe('extractFacts', () => {
    it('should extract facts from an agent response', async () => {
      const response =
        'The user is running Ubuntu 22.04 on their machine. They prefer using zsh over bash. The project uses TypeScript for the backend.';

      const ids = await pipeline.extractFacts(response, 's1');
      expect(ids.length).toBeGreaterThan(0);
      for (const id of ids) {
        const fact = memory.getFact(id);
        expect(fact).toBeDefined();
        expect(fact!.sessionId).toBe('s1');
        expect(fact!.source).toBe('agent_response');
        expect(fact!.confidence).toBe(0.3);
      }
    });

    it('should return empty array for short responses', async () => {
      const ids = await pipeline.extractFacts('Too short.', 's1');
      expect(ids).toHaveLength(0);
    });

    it('should not extract more than 3 facts', async () => {
      const longResponse =
        'First fact about the user system configuration. Second fact about the project. Third fact about preferences. Fourth fact about something else entirely.';

      const ids = await pipeline.extractFacts(longResponse, 's1');
      expect(ids.length).toBeLessThanOrEqual(3);
    });

    it('should store extracted facts as fact category', async () => {
      const response = 'This is a reasonably long sentence that could be a fact about the user.';

      const ids = await pipeline.extractFacts(response, 's1');
      for (const id of ids) {
        const fact = memory.getFact(id)!;
        expect(fact.category).toBe('fact');
      }
    });
  });
});
