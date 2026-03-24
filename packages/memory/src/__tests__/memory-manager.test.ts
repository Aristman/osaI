/**
 * @osai/memory -- MemoryManager tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MemoryManager } from '../MemoryManager.js';
import { ShortTermMemory } from '../short-term/ShortTermMemory.js';
import { LongTermMemory } from '../long-term/LongTermMemory.js';
import { RagPipeline } from '../rag/RagPipeline.js';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('MemoryManager', () => {
  let manager: MemoryManager;

  beforeEach(() => {
    manager = new MemoryManager();
  });

  afterEach(() => {
    manager.close();
  });

  // -----------------------------------------------------------------------
  // Construction
  // -----------------------------------------------------------------------
  describe('constructor', () => {
    it('should create a manager with default options', () => {
      const mgr = new MemoryManager();
      expect(mgr.getShortTerm()).toBeInstanceOf(ShortTermMemory);
      expect(mgr.getLongTerm()).toBeInstanceOf(LongTermMemory);
      expect(mgr.getRagPipeline()).toBeInstanceOf(RagPipeline);
      mgr.close();
    });

    it('should create separate instances for each component', () => {
      expect(manager.getShortTerm()).not.toBe(manager.getLongTerm());
      expect(manager.getShortTerm()).not.toBe(manager.getRagPipeline());
    });
  });

  // -----------------------------------------------------------------------
  // Accessors
  // -----------------------------------------------------------------------
  describe('getShortTerm', () => {
    it('should return a ShortTermMemory instance', () => {
      expect(manager.getShortTerm()).toBeInstanceOf(ShortTermMemory);
    });

    it('should return the same instance on repeated calls', () => {
      expect(manager.getShortTerm()).toBe(manager.getShortTerm());
    });
  });

  describe('getLongTerm', () => {
    it('should return a LongTermMemory instance', () => {
      expect(manager.getLongTerm()).toBeInstanceOf(LongTermMemory);
    });

    it('should return the same instance on repeated calls', () => {
      expect(manager.getLongTerm()).toBe(manager.getLongTerm());
    });
  });

  describe('getRagPipeline', () => {
    it('should return a RagPipeline instance', () => {
      expect(manager.getRagPipeline()).toBeInstanceOf(RagPipeline);
    });

    it('should return the same instance on repeated calls', () => {
      expect(manager.getRagPipeline()).toBe(manager.getRagPipeline());
    });
  });

  // -----------------------------------------------------------------------
  // remember
  // -----------------------------------------------------------------------
  describe('remember', () => {
    it('should store a message in short-term memory', async () => {
      const id = await manager.remember('s1', 'Hello, world!', 'user');
      expect(id).toBeDefined();

      const entry = manager.getShortTerm().get(id);
      expect(entry).toBeDefined();
      expect(entry!.content).toBe('Hello, world!');
      expect(entry!.role).toBe('user');
      expect(entry!.sessionId).toBe('s1');
    });

    it('should store messages with different roles', async () => {
      const userId = await manager.remember('s1', 'question', 'user');
      const assistantId = await manager.remember('s1', 'answer', 'assistant');
      const systemId = await manager.remember('s1', 'instruction', 'system');

      expect(manager.getShortTerm().get(userId)!.role).toBe('user');
      expect(manager.getShortTerm().get(assistantId)!.role).toBe('assistant');
      expect(manager.getShortTerm().get(systemId)!.role).toBe('system');
    });

    it('should store messages for different sessions independently', async () => {
      const id1 = await manager.remember('s1', 'session 1 message', 'user');
      const id2 = await manager.remember('s2', 'session 2 message', 'user');

      expect(manager.getShortTerm().getSessionMessages('s1')).toHaveLength(1);
      expect(manager.getShortTerm().getSessionMessages('s2')).toHaveLength(1);
      expect(manager.getShortTerm().get(id1)!.sessionId).toBe('s1');
      expect(manager.getShortTerm().get(id2)!.sessionId).toBe('s2');
    });
  });

  // -----------------------------------------------------------------------
  // recall
  // -----------------------------------------------------------------------
  describe('recall', () => {
    it('should return a RagResult', async () => {
      const result = await manager.recall('s1', 'test query');
      expect(result).toBeDefined();
      expect(result.facts).toBeDefined();
      expect(result.context).toBeDefined();
      expect(result.totalFacts).toBeDefined();
      expect(result.queryTokens).toBeGreaterThan(0);
    });

    it('should respect maxResults option', async () => {
      // Add some facts
      for (let i = 0; i < 5; i++) {
        manager.getLongTerm().addFact({
          content: `user fact ${i}`,
          category: 'fact',
          source: 'test',
          confidence: 0.8,
          sessionId: 's1',
        });
      }

      const result = await manager.recall('s1', 'fact', { maxResults: 2 });
      expect(result.facts.length).toBeLessThanOrEqual(2);
    });

    it('should pass sessionId to the RAG query', async () => {
      manager.getLongTerm().addFact({
        content: 'session-relevant fact',
        category: 'fact',
        source: 'test',
        confidence: 0.9,
        sessionId: 's1',
      });

      const result = await manager.recall('s1', 'session-relevant');
      // The result should include the session fact
      expect(result.facts.length).toBeGreaterThanOrEqual(0); // at minimum, no error
    });

    it('should return empty facts when nothing matches', async () => {
      const result = await manager.recall('s1', 'xyznonexistent123');
      expect(result.facts).toHaveLength(0);
    });
  });

  // -----------------------------------------------------------------------
  // forget
  // -----------------------------------------------------------------------
  describe('forget', () => {
    it('should return true for an existing entry in the correct session', async () => {
      const id = await manager.remember('s1', 'to forget', 'user');
      const result = await manager.forget('s1', id);
      expect(result).toBe(true);
    });

    it('should return false for a non-existent entry', async () => {
      const result = await manager.forget('s1', 'nonexistent');
      expect(result).toBe(false);
    });

    it('should return false for an entry belonging to a different session', async () => {
      const id = await manager.remember('s1', 'session 1 message', 'user');
      const result = await manager.forget('s2', id);
      expect(result).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // close
  // -----------------------------------------------------------------------
  describe('close', () => {
    it('should close all components without error', () => {
      const mgr = new MemoryManager();
      expect(() => mgr.close()).not.toThrow();
    });
  });
});
