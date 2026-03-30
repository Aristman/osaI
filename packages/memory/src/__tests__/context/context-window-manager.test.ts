/**
 * T-007: Context Window Manager -- Auto-Pruning + Summarization
 *
 * Test cases from ROADMAP_TASKS_F-005.md:
 *   TC-001: buildContext() оставляет system prompt без изменений
 *   TC-002: buildContext() при превышении 80% threshold запускает summarization (trigger)
 *   TC-003: pruneByPriority() сначала удаляет LT RAG results, потом KB chunks
 *   TC-004: pruneByPriority() оставляет последние N tool calls
 *   TC-005: reservedForResponse=1024 резервирует токены для ответа
 *   TC-006: buildContext() с историей < maxTokens не обрезает
 *   TC-007: estimateTokens() корректно оценивает количество токенов
 *   TC-008: pruneByPriority() с minMessages=4 оставляет минимум 4 сообщения
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ContextWindowManager } from '../../context/context-window-manager.js';
import {
  PruningPriority,
  type ContextEntry,
  type ContextResult,
  type Summarizer,
} from '../../types/context.js';
import { estimateTokens } from '../../context/token-counter.js';
import { pruneByPriority } from '../../context/pruning.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a ContextEntry with estimated token count. */
function makeEntry(
  role: string,
  content: string,
  priority: PruningPriority,
): ContextEntry {
  return {
    role,
    content,
    priority,
    tokenCount: estimateTokens(content),
  };
}

/** Create a system prompt entry (never pruned). */
function makeSystemPrompt(content: string): ContextEntry {
  return makeEntry('system', content, PruningPriority.SystemPrompt);
}

/** Create an early-history user message. */
function makeHistoryMessage(content: string): ContextEntry {
  return makeEntry('user', content, PruningPriority.EarlyHistory);
}

/** Create an early-history assistant message. */
function makeAssistantMessage(content: string): ContextEntry {
  return makeEntry('assistant', content, PruningPriority.EarlyHistory);
}

/** Create a long-term RAG result entry. */
function makeRAGEntry(content: string): ContextEntry {
  return makeEntry('rag', content, PruningPriority.LongTermRAG);
}

/** Create a knowledge base chunk entry. */
function makeKBEntry(content: string): ContextEntry {
  return makeEntry('rag', content, PruningPriority.KnowledgeBase);
}

/** Create a tool call result entry. */
function makeToolCallEntry(content: string): ContextEntry {
  return makeEntry('tool', content, PruningPriority.ToolCalls);
}

/** Stub summarizer that returns a fixed string. */
function createStubSummarizer(
  summary: string = 'Summary of previous conversation.',
): Summarizer {
  return {
    summarize: vi.fn().mockResolvedValue(summary),
  };
}

// ---------------------------------------------------------------------------
// TC-007: estimateTokens() -- pure function tests
// ---------------------------------------------------------------------------

describe('estimateTokens', () => {
  it('TC-007a: empty string returns 0', () => {
    expect(estimateTokens('')).toBe(0);
  });

  it('TC-007b: ASCII text uses ~4 chars per token', () => {
    // 400 ASCII characters -> ~100 tokens
    const text = 'a'.repeat(400);
    const tokens = estimateTokens(text);
    // Conservative estimation: 1 token = 4 chars
    expect(tokens).toBe(100);
  });

  it('TC-007c: Cyrillic text uses ~2 chars per token (multibyte UTF-8)', () => {
    // Each Cyrillic character is 2 bytes in UTF-8
    // 200 Cyrillic characters -> ~400 bytes -> ~200 tokens (1 token = 2 bytes)
    const text = '\u0430'.repeat(200); // 'a' repeated 200 times
    const tokens = estimateTokens(text);
    expect(tokens).toBe(200);
  });

  it('TC-007d: mixed ASCII + Cyrillic counts correctly', () => {
    // 200 ASCII chars + 100 Cyrillic chars
    // 200 / 4 = 50 (ASCII tokens)
    // 100 * 2 bytes / 2 = 100 (Cyrillic tokens, 1 token = 2 bytes)
    const text = 'a'.repeat(200) + '\u0430'.repeat(100);
    const tokens = estimateTokens(text);
    expect(tokens).toBe(150);
  });

  it('TC-007e: handles emoji (4-byte UTF-8 sequences)', () => {
    // Emoji is 4 bytes, treated as multibyte -> ~2 bytes per token
    const text = '\u{1F600}'.repeat(50); // 50 emoji, each 4 bytes = 200 bytes
    const tokens = estimateTokens(text);
    // 200 bytes / 2 = 100 tokens
    expect(tokens).toBe(100);
  });
});

// ---------------------------------------------------------------------------
// TC-003, TC-004, TC-005, TC-008: pruneByPriority() tests
// ---------------------------------------------------------------------------

describe('pruneByPriority', () => {
  it('TC-003: сначала удаляет LT RAG results, потом KB chunks', () => {
    const systemPrompt = makeSystemPrompt('You are a helpful assistant.');
    const ragEntry = makeRAGEntry(
      'Long-term memory context: ' + 'x'.repeat(100),
    );
    const kbEntry = makeKBEntry(
      'Knowledge base chunk: ' + 'x'.repeat(100),
    );
    const historyMsg = makeHistoryMessage('Hello, how are you?');
    const assistantMsg = makeAssistantMessage('I am fine, thank you!');

    const messages: ContextEntry[] = [
      systemPrompt,
      ragEntry,
      kbEntry,
      historyMsg,
      assistantMsg,
    ];

    // Set maxTokens so that only system + history + assistant fit (no RAG + no KB)
    // Budget must be tight enough that RAG (priority 1) doesn't fit
    const maxTokens =
      systemPrompt.tokenCount +
      historyMsg.tokenCount +
      assistantMsg.tokenCount +
      2; // minimal buffer -- RAG and KB won't fit

    const result = pruneByPriority(
      messages,
      maxTokens,
      /* reservedForResponse */ 0,
      /* minMessages */ 2,
    );

    // RAG (priority 1) should be removed first, then KB (priority 2)
    expect(result.prunedLevels).toContain(PruningPriority.LongTermRAG);
    expect(result.prunedLevels).toContain(PruningPriority.KnowledgeBase);

    // System prompt and history messages should remain
    const remainingRoles = result.context.map((e) => e.role);
    expect(remainingRoles).toContain('system');
    expect(remainingRoles).toContain('user');
    expect(remainingRoles).toContain('assistant');
    expect(remainingRoles).not.toContain('rag');
  });

  it('TC-004: оставляет последние N tool calls, обрезая ранние', () => {
    const systemPrompt = makeSystemPrompt('System');

    // Create 5 tool call entries + some history
    const toolCalls: ContextEntry[] = [];
    for (let i = 0; i < 5; i++) {
      toolCalls.push(makeToolCallEntry(`Tool result ${i}: ${'x'.repeat(100)}`));
    }

    const historyMsg = makeHistoryMessage('Final user message');
    const assistantMsg = makeAssistantMessage('Final assistant response');

    const messages: ContextEntry[] = [
      systemPrompt,
      toolCalls[0]!,
      toolCalls[1]!,
      toolCalls[2]!,
      toolCalls[3]!,
      toolCalls[4]!,
      historyMsg,
      assistantMsg,
    ];

    // Allow enough tokens for system + last 2 tool calls + history + assistant
    const maxTokens =
      systemPrompt.tokenCount +
      toolCalls[3]!.tokenCount +
      toolCalls[4]!.tokenCount +
      historyMsg.tokenCount +
      assistantMsg.tokenCount +
      20;

    const result = pruneByPriority(
      messages,
      maxTokens,
      /* reservedForResponse */ 0,
      /* minMessages */ 2,
    );

    // Tool calls (priority 3) should be pruned
    expect(result.prunedLevels).toContain(PruningPriority.ToolCalls);
    expect(result.wasPruned).toBe(true);

    // System prompt should survive
    expect(result.context.some((e) => e.role === 'system')).toBe(true);
  });

  it('TC-005: reservedForResponse=1024 резервирует токены для ответа', () => {
    const systemPrompt = makeSystemPrompt('System prompt');
    const historyMsg = makeHistoryMessage('User message');

    const messages: ContextEntry[] = [systemPrompt, historyMsg];

    // Total tokens exactly fit without reserved, but with 1024 reserved should prune
    const totalTokens = messages.reduce((sum, m) => sum + m.tokenCount, 0);
    const maxTokens = totalTokens + 10; // Just barely enough without reservation

    const result = pruneByPriority(
      messages,
      maxTokens,
      /* reservedForResponse */ 1024,
      /* minMessages */ 2,
    );

    // Since reserved tokens reduce available budget, pruning should be triggered
    // but minMessages=2 forces keeping the single history message
    expect(result.wasPruned).toBe(true);
  });

  it('TC-008: с minMessages=4 оставляет минимум 4 сообщения', () => {
    const systemPrompt = makeSystemPrompt('You are helpful.');

    // Create 5 history messages
    const history: ContextEntry[] = [];
    for (let i = 0; i < 5; i++) {
      history.push(
        i % 2 === 0
          ? makeHistoryMessage(`User message ${i}: ${'x'.repeat(50)}`)
          : makeAssistantMessage(`Assistant message ${i}: ${'x'.repeat(50)}`),
      );
    }

    const messages: ContextEntry[] = [systemPrompt, ...history];

    // Very tight budget: only system prompt + 2 messages fit
    const maxTokens =
      systemPrompt.tokenCount +
      history[3]!.tokenCount +
      history[4]!.tokenCount +
      10;

    const result = pruneByPriority(
      messages,
      maxTokens,
      /* reservedForResponse */ 0,
      /* minMessages */ 4,
    );

    // Should keep system prompt + at least 4 messages (last ones)
    const nonSystem = result.context.filter((e) => e.role !== 'system');
    expect(nonSystem.length).toBeGreaterThanOrEqual(4);
  });
});

// ---------------------------------------------------------------------------
// TC-001, TC-002, TC-006: ContextWindowManager.buildContext() tests
// ---------------------------------------------------------------------------

describe('ContextWindowManager', () => {
  let manager: ContextWindowManager;
  let stubSummarizer: Summarizer;

  beforeEach(() => {
    stubSummarizer = createStubSummarizer(
      'Previous conversation summary.',
    );
    manager = new ContextWindowManager({
      summarizer: stubSummarizer,
    });
  });

  it('TC-001: buildContext() оставляет system prompt без изменений', () => {
    const systemPrompt =
      'You are a helpful assistant. Follow all instructions carefully.';
    const messages: ContextEntry[] = [
      makeHistoryMessage('Hello'),
      makeAssistantMessage('Hi there!'),
    ];

    const result: ContextResult = manager.buildContext(
      messages,
      systemPrompt,
      8192,
    );

    // System prompt entry must be present and unchanged
    const systemEntry = result.context.find(
      (e) => e.priority === PruningPriority.SystemPrompt,
    );
    expect(systemEntry).toBeDefined();
    expect(systemEntry!.content).toBe(systemPrompt);
  });

  it('TC-002: buildContext() при превышении 80% threshold запускает summarization', async () => {
    // Fill enough messages to exceed 80% of maxTokens
    const maxTokens = 2048;
    const reservedForResponse = 1024; // overrides default to make threshold lower
    const systemPrompt = 'You are helpful.';

    // Create a manager with small reserved to make 80% threshold reachable
    const customManager = new ContextWindowManager({
      summarizer: stubSummarizer,
      config: { reservedForResponse },
    });

    // Create enough content to exceed 80% of (maxTokens - reserved)
    // available = 2048 - 1024 = 1024, threshold = 80% = 819 tokens
    const bigMessage = 'User question: ' + 'x'.repeat(800); // ~200 tokens
    const messages: ContextEntry[] = [
      makeHistoryMessage(bigMessage),
      makeHistoryMessage(bigMessage),
      makeHistoryMessage(bigMessage),
      makeAssistantMessage('A'.repeat(800)), // ~200 tokens
    ];

    // Total: ~800 tokens input (system ~7 + 4 messages ~800 = ~807) > 819? No.
    // Need more content. Let's use larger messages.
    const veryBigMessage = 'x'.repeat(3200); // ~800 tokens each
    const bigMessages: ContextEntry[] = [
      makeHistoryMessage(veryBigMessage),
      makeAssistantMessage(veryBigMessage),
    ];
    // Total: system ~7 + 800 + 800 = ~1607 > 819 => triggers summarization

    const result: ContextResult = customManager.buildContext(
      bigMessages,
      systemPrompt,
      maxTokens,
    );

    expect(result.summarizationTriggered).toBe(true);
  });

  it('TC-006: buildContext() с историей < maxTokens не обрезает', () => {
    const systemPrompt = 'You are helpful.';
    const messages: ContextEntry[] = [
      makeHistoryMessage('Hello'),
      makeAssistantMessage('Hi there!'),
    ];

    const result: ContextResult = manager.buildContext(
      messages,
      systemPrompt,
      8192,
    );

    expect(result.pruningResult).toBeUndefined();
    expect(result.summarizationTriggered).toBe(false);
    // buildContext adds system prompt to the messages
    expect(result.context.length).toBe(3);
    expect(stubSummarizer.summarize).not.toHaveBeenCalled();
  });
});
