/**
 * @osai/memory -- ShortTermMemory tests
 *
 * Uses in-memory SQLite for all tests.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ShortTermMemory } from '../short-term/ShortTermMemory.js';
import type { MemoryEntry } from '../types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMemory(): ShortTermMemory {
  return new ShortTermMemory(':memory:');
}

function makeEntry(
  overrides: Partial<Omit<MemoryEntry, 'id' | 'timestamp'>> & { sessionId: string },
): Omit<MemoryEntry, 'id' | 'timestamp'> {
  return {
    role: 'user',
    content: 'test message',
    category: 'message',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ShortTermMemory', () => {
  let memory: ShortTermMemory;

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
      const mem = new ShortTermMemory();
      const id = mem.add(makeEntry({ sessionId: 's1', content: 'hello' }));
      expect(mem.get(id)).toBeDefined();
      mem.close();
    });
  });

  // -----------------------------------------------------------------------
  // add
  // -----------------------------------------------------------------------
  describe('add', () => {
    it('should add an entry and return its ID', () => {
      const id = memory.add(makeEntry({ sessionId: 's1', content: 'hello' }));
      expect(id).toBeDefined();
      expect(typeof id).toBe('string');
      expect(id).toMatch(/^mem_/);
    });

    it('should auto-generate a timestamp', () => {
      const id = memory.add(makeEntry({ sessionId: 's1' }));
      const entry = memory.get(id);
      expect(entry).toBeDefined();
      expect(entry!.timestamp).toBeDefined();
      expect(new Date(entry!.timestamp).getTime()).not.toBeNaN();
    });

    it('should store the role', () => {
      const id = memory.add(makeEntry({ sessionId: 's1', role: 'assistant' }));
      expect(memory.get(id)!.role).toBe('assistant');
    });

    it('should store metadata', () => {
      const id = memory.add(
        makeEntry({
          sessionId: 's1',
          metadata: { key: 'value', num: 42 },
        }),
      );
      expect(memory.get(id)!.metadata).toEqual({ key: 'value', num: 42 });
    });

    it('should store the category', () => {
      const id = memory.add(
        makeEntry({ sessionId: 's1', category: 'tool_result' }),
      );
      expect(memory.get(id)!.category).toBe('tool_result');
    });
  });

  // -----------------------------------------------------------------------
  // get
  // -----------------------------------------------------------------------
  describe('get', () => {
    it('should return the stored entry by ID', () => {
      const id = memory.add(makeEntry({ sessionId: 's1', content: 'retrievable' }));
      const entry = memory.get(id);
      expect(entry).toBeDefined();
      expect(entry!.content).toBe('retrievable');
    });

    it('should return undefined for a non-existent ID', () => {
      expect(memory.get('nonexistent')).toBeUndefined();
    });

    it('should return the full entry with all fields', () => {
      const id = memory.add(
        makeEntry({
          sessionId: 's1',
          role: 'system',
          content: 'sys msg',
          category: 'system',
          metadata: { foo: 'bar' },
        }),
      );
      const entry = memory.get(id)!;
      expect(entry.id).toBe(id);
      expect(entry.sessionId).toBe('s1');
      expect(entry.role).toBe('system');
      expect(entry.content).toBe('sys msg');
      expect(entry.category).toBe('system');
      expect(entry.metadata).toEqual({ foo: 'bar' });
    });
  });

  // -----------------------------------------------------------------------
  // getSessionMessages
  // -----------------------------------------------------------------------
  describe('getSessionMessages', () => {
    it('should return all messages for a session ordered by timestamp', () => {
      memory.add(makeEntry({ sessionId: 's1', content: 'first' }));
      memory.add(makeEntry({ sessionId: 's1', content: 'second' }));
      memory.add(makeEntry({ sessionId: 's2', content: 'other' }));

      const msgs = memory.getSessionMessages('s1');
      expect(msgs).toHaveLength(2);
      expect(msgs[0]!.content).toBe('first');
      expect(msgs[1]!.content).toBe('second');
    });

    it('should return an empty array for a session with no messages', () => {
      expect(memory.getSessionMessages('empty')).toEqual([]);
    });

    it('should not mix messages from different sessions', () => {
      memory.add(makeEntry({ sessionId: 's1', content: 's1-msg' }));
      memory.add(makeEntry({ sessionId: 's2', content: 's2-msg' }));
      memory.add(makeEntry({ sessionId: 's3', content: 's3-msg' }));

      expect(memory.getSessionMessages('s2')).toHaveLength(1);
      expect(memory.getSessionMessages('s2')[0]!.content).toBe('s2-msg');
    });
  });

  // -----------------------------------------------------------------------
  // search
  // -----------------------------------------------------------------------
  describe('search', () => {
    it('should find messages matching a text query', () => {
      memory.add(makeEntry({ sessionId: 's1', content: 'the quick brown fox' }));
      memory.add(makeEntry({ sessionId: 's1', content: 'hello world' }));
      memory.add(makeEntry({ sessionId: 's1', content: 'jumped over the lazy dog' }));

      const results = memory.search('s1', 'quick');
      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results.some((r) => r.content.includes('quick'))).toBe(true);
    });

    it('should only search within the specified session', () => {
      memory.add(makeEntry({ sessionId: 's1', content: 'unique s1 content' }));
      memory.add(makeEntry({ sessionId: 's2', content: 'unique s1 content' }));

      const results = memory.search('s1', 'unique');
      expect(results).toHaveLength(1);
      expect(results[0]!.sessionId).toBe('s1');
    });

    it('should respect the limit parameter', () => {
      memory.add(makeEntry({ sessionId: 's1', content: 'match alpha' }));
      memory.add(makeEntry({ sessionId: 's1', content: 'match beta' }));
      memory.add(makeEntry({ sessionId: 's1', content: 'match gamma' }));

      const results = memory.search('s1', 'match', 2);
      expect(results.length).toBeLessThanOrEqual(2);
    });

    it('should return an empty array when nothing matches', () => {
      memory.add(makeEntry({ sessionId: 's1', content: 'hello' }));
      const results = memory.search('s1', 'xyznonexistent');
      expect(results).toHaveLength(0);
    });

    it('should default to a limit of 10', () => {
      for (let i = 0; i < 15; i++) {
        memory.add(makeEntry({ sessionId: 's1', content: `result item ${i}` }));
      }

      const results = memory.search('s1', 'result');
      expect(results.length).toBeLessThanOrEqual(10);
    });
  });

  // -----------------------------------------------------------------------
  // clearSession
  // -----------------------------------------------------------------------
  describe('clearSession', () => {
    it('should remove all messages for a session', () => {
      memory.add(makeEntry({ sessionId: 's1', content: 'msg1' }));
      memory.add(makeEntry({ sessionId: 's1', content: 'msg2' }));

      memory.clearSession('s1');
      expect(memory.getCount('s1')).toBe(0);
    });

    it('should not affect other sessions', () => {
      memory.add(makeEntry({ sessionId: 's1', content: 'msg1' }));
      memory.add(makeEntry({ sessionId: 's2', content: 'msg2' }));

      memory.clearSession('s1');
      expect(memory.getCount('s1')).toBe(0);
      expect(memory.getCount('s2')).toBe(1);
    });

    it('should be safe to call on an empty session', () => {
      expect(() => memory.clearSession('nonexistent')).not.toThrow();
      expect(memory.getCount('nonexistent')).toBe(0);
    });
  });

  // -----------------------------------------------------------------------
  // prune
  // -----------------------------------------------------------------------
  describe('prune', () => {
    it('should keep the last N entries and remove older ones', () => {
      for (let i = 0; i < 10; i++) {
        memory.add(makeEntry({ sessionId: 's1', content: `msg-${i}` }));
      }

      const removed = memory.prune('s1', 5);
      expect(removed).toBe(5);
      expect(memory.getCount('s1')).toBe(5);
    });

    it('should return 0 when nothing needs to be pruned', () => {
      for (let i = 0; i < 3; i++) {
        memory.add(makeEntry({ sessionId: 's1', content: `msg-${i}` }));
      }

      const removed = memory.prune('s1', 10);
      expect(removed).toBe(0);
      expect(memory.getCount('s1')).toBe(3);
    });

    it('should keep the most recent entries', () => {
      for (let i = 0; i < 5; i++) {
        memory.add(makeEntry({ sessionId: 's1', content: `msg-${i}` }));
      }

      memory.prune('s1', 2);
      const remaining = memory.getSessionMessages('s1');
      expect(remaining).toHaveLength(2);
      // The last two messages should be kept (msg-3 and msg-4)
      expect(remaining[0]!.content).toBe('msg-3');
      expect(remaining[1]!.content).toBe('msg-4');
    });

    it('should not affect other sessions', () => {
      for (let i = 0; i < 5; i++) {
        memory.add(makeEntry({ sessionId: 's1', content: `s1-${i}` }));
        memory.add(makeEntry({ sessionId: 's2', content: `s2-${i}` }));
      }

      memory.prune('s1', 2);
      expect(memory.getCount('s1')).toBe(2);
      expect(memory.getCount('s2')).toBe(5);
    });

    it('should handle keepLast of 0', () => {
      memory.add(makeEntry({ sessionId: 's1', content: 'msg' }));

      const removed = memory.prune('s1', 0);
      expect(removed).toBe(1);
      expect(memory.getCount('s1')).toBe(0);
    });
  });

  // -----------------------------------------------------------------------
  // getCount
  // -----------------------------------------------------------------------
  describe('getCount', () => {
    it('should return 0 for an empty session', () => {
      expect(memory.getCount('empty')).toBe(0);
    });

    it('should return the correct count after adding entries', () => {
      memory.add(makeEntry({ sessionId: 's1', content: 'a' }));
      memory.add(makeEntry({ sessionId: 's1', content: 'b' }));
      memory.add(makeEntry({ sessionId: 's1', content: 'c' }));
      expect(memory.getCount('s1')).toBe(3);
    });
  });

  // -----------------------------------------------------------------------
  // close
  // -----------------------------------------------------------------------
  describe('close', () => {
    it('should close without error', () => {
      const mem = new ShortTermMemory();
      expect(() => mem.close()).not.toThrow();
    });
  });
});
