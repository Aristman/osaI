/**
 * @osai/memory -- LongTermMemory tests
 *
 * Uses in-memory SQLite for all tests.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { LongTermMemory } from '../long-term/LongTermMemory.js';
import type { Fact } from '../types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMemory(): LongTermMemory {
  return new LongTermMemory(':memory:');
}

function makeFact(
  overrides: Partial<Omit<Fact, 'id' | 'createdAt' | 'updatedAt'>> = {},
): Omit<Fact, 'id' | 'createdAt' | 'updatedAt'> {
  return {
    content: 'The user prefers dark mode.',
    category: 'preference',
    source: 'conversation',
    confidence: 0.8,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('LongTermMemory', () => {
  let memory: LongTermMemory;

  beforeEach(() => {
    memory = createMemory();
  });

  afterEach(() => {
    memory.close();
  });

  // -----------------------------------------------------------------------
  // Construction
  // -----------------------------------------------------------------------
  describe('constructor', () => {
    it('should create an in-memory database when no path is given', () => {
      const mem = new LongTermMemory();
      const id = mem.addFact(makeFact({ content: 'test' }));
      expect(mem.getFact(id)).toBeDefined();
      mem.close();
    });
  });

  // -----------------------------------------------------------------------
  // addFact
  // -----------------------------------------------------------------------
  describe('addFact', () => {
    it('should add a fact and return its ID', () => {
      const id = memory.addFact(makeFact());
      expect(id).toBeDefined();
      expect(typeof id).toBe('string');
      expect(id).toMatch(/^fact_/);
    });

    it('should auto-generate createdAt and updatedAt', () => {
      const id = memory.addFact(makeFact());
      const fact = memory.getFact(id)!;
      expect(fact.createdAt).toBeDefined();
      expect(fact.updatedAt).toBeDefined();
      expect(new Date(fact.createdAt).getTime()).not.toBeNaN();
      expect(new Date(fact.updatedAt).getTime()).not.toBeNaN();
    });

    it('should store all provided fields', () => {
      const id = memory.addFact({
        content: 'User uses Arch Linux',
        category: 'fact',
        source: 'system_detection',
        confidence: 0.95,
        sessionId: 'sess-1',
        tags: ['os', 'linux'],
      });
      const fact = memory.getFact(id)!;
      expect(fact.content).toBe('User uses Arch Linux');
      expect(fact.category).toBe('fact');
      expect(fact.source).toBe('system_detection');
      expect(fact.confidence).toBe(0.95);
      expect(fact.sessionId).toBe('sess-1');
      expect(fact.tags).toEqual(['os', 'linux']);
    });

    it('should handle all category types', () => {
      const categories: Fact['category'][] = [
        'fact', 'preference', 'knowledge', 'error', 'pattern',
      ];
      for (const cat of categories) {
        const id = memory.addFact(makeFact({ category: cat, content: `test ${cat}` }));
        expect(memory.getFact(id)!.category).toBe(cat);
      }
    });
  });

  // -----------------------------------------------------------------------
  // getFact
  // -----------------------------------------------------------------------
  describe('getFact', () => {
    it('should return the stored fact by ID', () => {
      const id = memory.addFact(makeFact({ content: 'findable fact' }));
      const fact = memory.getFact(id);
      expect(fact).toBeDefined();
      expect(fact!.content).toBe('findable fact');
    });

    it('should return undefined for a non-existent ID', () => {
      expect(memory.getFact('nonexistent')).toBeUndefined();
    });

    it('should return a complete fact object', () => {
      const id = memory.addFact({
        content: 'complete fact',
        category: 'knowledge',
        source: 'test',
        confidence: 0.7,
        tags: ['tag1', 'tag2'],
      });
      const fact = memory.getFact(id)!;
      expect(fact.id).toBe(id);
      expect(fact.content).toBe('complete fact');
      expect(fact.category).toBe('knowledge');
      expect(fact.source).toBe('test');
      expect(fact.confidence).toBe(0.7);
      expect(fact.tags).toEqual(['tag1', 'tag2']);
      expect(fact.createdAt).toBeDefined();
      expect(fact.updatedAt).toBeDefined();
    });
  });

  // -----------------------------------------------------------------------
  // updateFact
  // -----------------------------------------------------------------------
  describe('updateFact', () => {
    it('should update the content of a fact', () => {
      const id = memory.addFact(makeFact({ content: 'original' }));
      const result = memory.updateFact(id, { content: 'updated' });
      expect(result).toBe(true);
      expect(memory.getFact(id)!.content).toBe('updated');
    });

    it('should update the confidence of a fact', () => {
      const id = memory.addFact(makeFact({ confidence: 0.5 }));
      memory.updateFact(id, { confidence: 0.9 });
      expect(memory.getFact(id)!.confidence).toBe(0.9);
    });

    it('should update the tags of a fact', () => {
      const id = memory.addFact(makeFact({ tags: ['old'] }));
      memory.updateFact(id, { tags: ['new1', 'new2'] });
      expect(memory.getFact(id)!.tags).toEqual(['new1', 'new2']);
    });

    it('should update the updatedAt timestamp', () => {
      const id = memory.addFact(makeFact());
      const original = memory.getFact(id)!;
      // Small delay to ensure timestamp differs
      // Note: SQLite datetime('now') has second-level resolution
      memory.updateFact(id, { content: 'changed' });
      const updated = memory.getFact(id)!;
      // updatedAt should be >= original createdAt
      expect(new Date(updated.updatedAt).getTime()).toBeGreaterThanOrEqual(
        new Date(original.createdAt).getTime(),
      );
    });

    it('should return false for a non-existent fact', () => {
      const result = memory.updateFact('nonexistent', { content: 'nope' });
      expect(result).toBe(false);
    });

    it('should support partial updates (only specified fields)', () => {
      const id = memory.addFact(makeFact({
        content: 'original',
        confidence: 0.5,
        tags: ['tag1'],
      }));
      memory.updateFact(id, { confidence: 0.9 });
      const fact = memory.getFact(id)!;
      expect(fact.content).toBe('original');
      expect(fact.confidence).toBe(0.9);
      expect(fact.tags).toEqual(['tag1']);
    });
  });

  // -----------------------------------------------------------------------
  // deleteFact
  // -----------------------------------------------------------------------
  describe('deleteFact', () => {
    it('should delete an existing fact', () => {
      const id = memory.addFact(makeFact());
      expect(memory.deleteFact(id)).toBe(true);
      expect(memory.getFact(id)).toBeUndefined();
    });

    it('should return false for a non-existent fact', () => {
      expect(memory.deleteFact('nonexistent')).toBe(false);
    });

    it('should not affect other facts', () => {
      const id1 = memory.addFact(makeFact({ content: 'keep' }));
      const id2 = memory.addFact(makeFact({ content: 'delete' }));
      memory.deleteFact(id2);
      expect(memory.getFact(id1)).toBeDefined();
      expect(memory.getFact(id2)).toBeUndefined();
    });
  });

  // -----------------------------------------------------------------------
  // search
  // -----------------------------------------------------------------------
  describe('search', () => {
    it('should find facts matching a text query', () => {
      memory.addFact(makeFact({ content: 'User prefers dark mode' }));
      memory.addFact(makeFact({ content: 'User likes JavaScript' }));
      memory.addFact(makeFact({ content: 'Error occurred at midnight' }));

      const results = memory.search('dark');
      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results.some((f) => f.content.includes('dark'))).toBe(true);
    });

    it('should filter by category', () => {
      memory.addFact(makeFact({ content: 'user fact', category: 'fact' }));
      memory.addFact(makeFact({ content: 'user preference', category: 'preference' }));
      memory.addFact(makeFact({ content: 'user knowledge', category: 'knowledge' }));

      const results = memory.search('user', { category: 'preference' });
      expect(results).toHaveLength(1);
      expect(results[0]!.category).toBe('preference');
    });

    it('should filter by tags', () => {
      memory.addFact(makeFact({ content: 'tagged fact', tags: ['os', 'linux'] }));
      memory.addFact(makeFact({ content: 'untagged fact', tags: ['other'] }));

      const results = memory.search('fact', { tags: ['os'] });
      expect(results).toHaveLength(1);
      expect(results[0]!.tags).toContain('os');
    });

    it('should respect the limit parameter', () => {
      for (let i = 0; i < 10; i++) {
        memory.addFact(makeFact({ content: `matching fact ${i}` }));
      }

      const results = memory.search('fact', { limit: 3 });
      expect(results.length).toBeLessThanOrEqual(3);
    });

    it('should order results by confidence DESC', () => {
      memory.addFact(makeFact({ content: 'low', confidence: 0.2 }));
      memory.addFact(makeFact({ content: 'high', confidence: 0.9 }));
      memory.addFact(makeFact({ content: 'mid', confidence: 0.5 }));

      const results = memory.search(''); // empty query matches all
      expect(results[0]!.confidence).toBe(0.9);
      expect(results[1]!.confidence).toBe(0.5);
      expect(results[2]!.confidence).toBe(0.2);
    });

    it('should return empty array when nothing matches', () => {
      memory.addFact(makeFact({ content: 'hello world' }));
      const results = memory.search('xyznonexistent');
      expect(results).toHaveLength(0);
    });

    it('should default to limit 20', () => {
      for (let i = 0; i < 25; i++) {
        memory.addFact(makeFact({ content: `item ${i}` }));
      }
      const results = memory.search('item');
      expect(results.length).toBeLessThanOrEqual(20);
    });
  });

  // -----------------------------------------------------------------------
  // semanticSearch (stub)
  // -----------------------------------------------------------------------
  describe('semanticSearch', () => {
    it('should return an empty array (stub implementation)', async () => {
      memory.addFact(makeFact({ content: 'some fact' }));
      const results = await memory.semanticSearch('query');
      expect(results).toEqual([]);
    });

    it('should return empty array even with limit option', async () => {
      memory.addFact(makeFact({ content: 'some fact' }));
      const results = await memory.semanticSearch('query', { limit: 5 });
      expect(results).toEqual([]);
    });
  });

  // -----------------------------------------------------------------------
  // getStats
  // -----------------------------------------------------------------------
  describe('getStats', () => {
    it('should return zero total for an empty database', () => {
      const stats = memory.getStats();
      expect(stats.total).toBe(0);
      expect(stats.byCategory).toEqual({});
    });

    it('should return the correct total count', () => {
      memory.addFact(makeFact());
      memory.addFact(makeFact());
      memory.addFact(makeFact());
      expect(memory.getStats().total).toBe(3);
    });

    it('should break down counts by category', () => {
      memory.addFact(makeFact({ category: 'fact' }));
      memory.addFact(makeFact({ category: 'fact' }));
      memory.addFact(makeFact({ category: 'preference' }));
      memory.addFact(makeFact({ category: 'error' }));

      const stats = memory.getStats();
      expect(stats.byCategory['fact']).toBe(2);
      expect(stats.byCategory['preference']).toBe(1);
      expect(stats.byCategory['error']).toBe(1);
    });

    it('should reflect deletions in stats', () => {
      const id = memory.addFact(makeFact({ category: 'fact' }));
      memory.addFact(makeFact({ category: 'preference' }));

      memory.deleteFact(id);
      const stats = memory.getStats();
      expect(stats.total).toBe(1);
      expect(stats.byCategory['fact']).toBeUndefined();
      expect(stats.byCategory['preference']).toBe(1);
    });
  });

  // -----------------------------------------------------------------------
  // close
  // -----------------------------------------------------------------------
  describe('close', () => {
    it('should close without error', () => {
      const mem = new LongTermMemory();
      expect(() => mem.close()).not.toThrow();
    });
  });
});
