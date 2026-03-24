/**
 * Tests for SessionPruner — T-008: Session Pruning
 */

import { describe, it, expect } from 'vitest';
import { SessionPruner } from '../pruning/SessionPruner.js';
import type { ModelMessage } from '../types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMsg(role: ModelMessage['role'], content: string): ModelMessage {
  return { role, content };
}

/** Create N messages, each of `charsPerMsg` characters. */
function makeBatch(n: number, charsPerMsg: number, role: 'user' | 'assistant' = 'user'): ModelMessage[] {
  const msgs: ModelMessage[] = [];
  for (let i = 0; i < n; i++) {
    msgs.push(makeMsg(role, 'x'.repeat(charsPerMsg)));
  }
  return msgs;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SessionPruner', () => {
  // -----------------------------------------------------------------------
  // 1. No pruning under threshold
  // -----------------------------------------------------------------------
  it('should NOT prune when session is under threshold', () => {
    const pruner = new SessionPruner(1000, 4, 4);
    // 1 system (50 chars) + 2 user (50 chars each) = 150 chars => ~37 tokens < 1000
    const messages: ModelMessage[] = [
      makeMsg('system', 'You are a helpful assistant.'),
      makeMsg('user', 'Hello'),
      makeMsg('assistant', 'Hi there!'),
    ];

    const result = pruner.prune(messages);
    expect(result).toHaveLength(3);
  });

  // -----------------------------------------------------------------------
  // 2. Pruning on overflow
  // -----------------------------------------------------------------------
  it('should prune messages when session overflows threshold', () => {
    // maxTokens=200, preserveRecentCount=2, charsPerToken=4
    // threshold = 200 * 0.8 = 160 tokens => 640 chars
    const pruner = new SessionPruner(200, 2, 4);
    const messages: ModelMessage[] = [
      makeMsg('system', 'You are a helpful assistant.'),          // ~30 chars
      makeMsg('user', 'x'.repeat(400)),                           // 400 chars
      makeMsg('assistant', 'y'.repeat(400)),                      // 400 chars
      makeMsg('user', 'z'.repeat(10)),                            // 10 chars -- recent
      makeMsg('assistant', 'w'.repeat(10)),                       // 10 chars -- recent
    ];
    // Total chars ~850 => ~212 tokens > 200 => needs pruning
    const result = pruner.prune(messages);
    // System preserved + last 2 preserved => at least 3 messages
    expect(result.length).toBeLessThan(5);
    // System always kept
    expect(result[0]).toBe(messages[0]);
    // Last 2 always kept
    expect(result).toContain(messages[3]);
    expect(result).toContain(messages[4]);
  });

  // -----------------------------------------------------------------------
  // 3. System messages always preserved
  // -----------------------------------------------------------------------
  it('should preserve ALL system messages during pruning', () => {
    const pruner = new SessionPruner(100, 2, 4);
    const messages: ModelMessage[] = [
      makeMsg('system', 'System instruction 1.'),
      makeMsg('system', 'System instruction 2.'),
      makeMsg('user', 'x'.repeat(500)),
      makeMsg('assistant', 'y'.repeat(500)),
      makeMsg('user', 'z'.repeat(10)),
      makeMsg('assistant', 'w'.repeat(10)),
    ];

    const result = pruner.prune(messages);
    // Both system messages must survive
    const systemMsgs = result.filter((m) => m.role === 'system');
    expect(systemMsgs).toHaveLength(2);
    expect(systemMsgs[0]).toBe(messages[0]);
    expect(systemMsgs[1]).toBe(messages[1]);
  });

  // -----------------------------------------------------------------------
  // 4. Recent context preserved (last N messages)
  // -----------------------------------------------------------------------
  it('should preserve the last N recent messages', () => {
    const pruner = new SessionPruner(200, 3, 4);
    const messages: ModelMessage[] = [
      makeMsg('system', 'sys'),
      makeMsg('user', 'x'.repeat(500)),
      makeMsg('assistant', 'y'.repeat(500)),
      makeMsg('user', 'a'.repeat(10)),       // recent-2
      makeMsg('assistant', 'b'.repeat(10)),   // recent-1
      makeMsg('user', 'c'.repeat(10)),        // recent-0 (last)
    ];

    const result = pruner.prune(messages);
    // Last 3 must be in result
    expect(result).toContain(messages[3]);
    expect(result).toContain(messages[4]);
    expect(result).toContain(messages[5]);
  });

  // -----------------------------------------------------------------------
  // 5. Token estimation accuracy
  // -----------------------------------------------------------------------
  it('should estimate tokens correctly', () => {
    const pruner = new SessionPruner(128000, 4, 4);
    const text = 'a'.repeat(100);
    // 100 chars / 4 charsPerToken = 25 tokens
    expect(pruner.estimateTextTokens(text)).toBe(25);
  });

  it('should estimate tokens for array of messages', () => {
    const pruner = new SessionPruner(128000, 4, 4);
    const messages: ModelMessage[] = [
      makeMsg('user', 'a'.repeat(100)),    // 25 tokens
      makeMsg('assistant', 'b'.repeat(200)), // 50 tokens
    ];
    expect(pruner.estimateTokens(messages)).toBe(75);
  });

  // -----------------------------------------------------------------------
  // 6. Pruning reduces tokens below threshold
  // -----------------------------------------------------------------------
  it('should reduce tokens below 80% of maxTokens after pruning', () => {
    // maxTokens=200, threshold = 160 tokens = 640 chars
    const pruner = new SessionPruner(200, 2, 4);
    const messages: ModelMessage[] = [
      makeMsg('system', 'sys'),
      ...makeBatch(10, 200, 'user'),       // 2000 chars
      makeMsg('user', 'a'),
      makeMsg('assistant', 'b'),
    ];
    // Total: ~3 + 2000 + 2 = ~2005 chars => ~501 tokens >> 200

    const result = pruner.prune(messages);
    const resultTokens = pruner.estimateTokens(result);
    expect(resultTokens).toBeLessThanOrEqual(Math.floor(200 * 0.8));
  });

  // -----------------------------------------------------------------------
  // 7. Empty messages array handled
  // -----------------------------------------------------------------------
  it('should handle empty messages array without errors', () => {
    const pruner = new SessionPruner(128000, 4, 4);

    expect(pruner.needsPruning([])).toBe(false);
    expect(pruner.prune([])).toEqual([]);
    expect(pruner.estimateTokens([])).toBe(0);
    expect(pruner.selectMessagesToRemove([], 100)).toEqual(new Set());
  });

  // -----------------------------------------------------------------------
  // 8. All system messages + overflow — system preserved, truncate
  // -----------------------------------------------------------------------
  it('should keep system messages even when all non-system exceed threshold', () => {
    const pruner = new SessionPruner(50, 2, 4);
    // threshold = 50 * 0.8 = 40 tokens => 160 chars
    const messages: ModelMessage[] = [
      makeMsg('system', 'Instruction A.'),
      makeMsg('system', 'Instruction B.'),
      makeMsg('user', 'x'.repeat(1000)),
      makeMsg('assistant', 'y'.repeat(1000)),
      makeMsg('user', 'a'),
      makeMsg('assistant', 'b'),
    ];

    const result = pruner.prune(messages);
    const systemMsgs = result.filter((m) => m.role === 'system');
    expect(systemMsgs.length).toBeGreaterThanOrEqual(2);
    // Large messages should be removed
    const largeMsgs = result.filter((m) => m.content.length > 500);
    expect(largeMsgs).toHaveLength(0);
  });

  // -----------------------------------------------------------------------
  // 9. needsPruning returns correct boolean
  // -----------------------------------------------------------------------
  it('should return true from needsPruning when over threshold', () => {
    // threshold = 100 * 0.8 = 80 tokens = 320 chars
    const pruner = new SessionPruner(100, 2, 4);
    const messages: ModelMessage[] = [
      makeMsg('system', 'sys'),
      makeMsg('user', 'x'.repeat(500)),
    ];
    expect(pruner.needsPruning(messages)).toBe(true);
  });

  it('should return false from needsPruning when under threshold', () => {
    const pruner = new SessionPruner(1000, 2, 4);
    const messages: ModelMessage[] = [
      makeMsg('user', 'hello'),
    ];
    expect(pruner.needsPruning(messages)).toBe(false);
  });

  // -----------------------------------------------------------------------
  // 10. selectMessagesToRemove returns correct indices
  // -----------------------------------------------------------------------
  it('should select correct message indices to remove', () => {
    const pruner = new SessionPruner(100, 2, 4);
    // threshold = 80 tokens = 320 chars
    const messages: ModelMessage[] = [
      makeMsg('system', 'sys'),             // index 0, system => protected
      makeMsg('user', 'x'.repeat(300)),     // index 1, candidate for removal
      makeMsg('assistant', 'y'.repeat(300)), // index 2, candidate for removal
      makeMsg('user', 'a'),                 // index 3, recent => protected
      makeMsg('assistant', 'b'),            // index 4, recent => protected
    ];

    const totalTokens = pruner.estimateTokens(messages);
    const toRemove = pruner.selectMessagesToRemove(messages, totalTokens - Math.floor(100 * 0.8));
    // System (0) must NOT be in set
    expect(toRemove.has(0)).toBe(false);
    // Recent (3, 4) must NOT be in set
    expect(toRemove.has(3)).toBe(false);
    expect(toRemove.has(4)).toBe(false);
    // Old messages (1, 2) should be candidates
    expect(toRemove.has(1) || toRemove.has(2)).toBe(true);
  });

  // -----------------------------------------------------------------------
  // 11. prune with only system + recent — no removal
  // -----------------------------------------------------------------------
  it('should not remove messages when only system and recent remain', () => {
    const pruner = new SessionPruner(1000, 4, 4);
    const messages: ModelMessage[] = [
      makeMsg('system', 'You are a helpful assistant.'),
      makeMsg('user', 'a'),
      makeMsg('assistant', 'b'),
      makeMsg('user', 'c'),
      makeMsg('assistant', 'd'),
    ];
    // All messages are either system or within preserveRecentCount=4
    const result = pruner.prune(messages);
    expect(result).toHaveLength(5);
  });

  // -----------------------------------------------------------------------
  // 12. Single message below threshold — no pruning
  // -----------------------------------------------------------------------
  it('should not prune a single message below threshold', () => {
    const pruner = new SessionPruner(128000, 4, 4);
    const messages: ModelMessage[] = [
      makeMsg('user', 'Hello, how are you?'),
    ];

    expect(pruner.needsPruning(messages)).toBe(false);
    const result = pruner.prune(messages);
    expect(result).toHaveLength(1);
  });

  // -----------------------------------------------------------------------
  // isSystemMessage
  // -----------------------------------------------------------------------
  it('should identify system messages correctly', () => {
    const pruner = new SessionPruner();
    expect(pruner.isSystemMessage(makeMsg('system', 'sys'))).toBe(true);
    expect(pruner.isSystemMessage(makeMsg('user', 'hi'))).toBe(false);
    expect(pruner.isSystemMessage(makeMsg('assistant', 'ok'))).toBe(false);
    expect(pruner.isSystemMessage(makeMsg('tool', 'result'))).toBe(false);
  });

  // -----------------------------------------------------------------------
  // Tool messages are lower priority (removed first)
  // -----------------------------------------------------------------------
  it('should prefer removing tool results over user/assistant messages', () => {
    const pruner = new SessionPruner(100, 2, 4);
    // threshold = 80 tokens = 320 chars
    const messages: ModelMessage[] = [
      makeMsg('system', 'sys'),
      makeMsg('user', 'x'.repeat(100)),
      makeMsg('tool', 't'.repeat(150)),           // tool result
      makeMsg('assistant', 'y'.repeat(100)),
      makeMsg('tool', 't'.repeat(150)),            // tool result
      makeMsg('user', 'a'),
      makeMsg('assistant', 'b'),
    ];

    const totalTokens = pruner.estimateTokens(messages);
    const toRemove = pruner.selectMessagesToRemove(messages, totalTokens - Math.floor(100 * 0.8));
    // Tool messages (indices 2 and 4) should be preferred for removal
    const toolRemoved = [2, 4].some((i) => toRemove.has(i));
    expect(toolRemoved).toBe(true);
  });

  // -----------------------------------------------------------------------
  // Minimum: at least 1 system + 1 last message
  // -----------------------------------------------------------------------
  it('should always keep at least 1 system and 1 last message', () => {
    const pruner = new SessionPruner(10, 1, 4);
    // Very small threshold
    const messages: ModelMessage[] = [
      makeMsg('system', 'sys'.repeat(100)),
      makeMsg('user', 'x'.repeat(1000)),
      makeMsg('assistant', 'y'.repeat(1000)),
    ];

    const result = pruner.prune(messages);
    // At least system + last message
    expect(result.length).toBeGreaterThanOrEqual(2);
    expect(result[0]!.role).toBe('system');
    expect(result[result.length - 1]!).toBe(messages[messages.length - 1]!);
  });

  // -----------------------------------------------------------------------
  // estimateTextTokens edge cases
  // -----------------------------------------------------------------------
  it('should return 0 for empty string token estimation', () => {
    const pruner = new SessionPruner();
    expect(pruner.estimateTextTokens('')).toBe(0);
  });

  it('should ceil token estimate for non-divisible lengths', () => {
    const pruner = new SessionPruner(128000, 4, 3);
    // 10 chars / 3 = 3.33 => Math.ceil = 4
    expect(pruner.estimateTextTokens('abcdefghij')).toBe(4);
  });
});
