/**
 * @osai/agent -- ContextAssembler Additional Tests (T-002)
 *
 * Additional critical tests for the ContextAssembler module:
 *   - RAG query injection into system prompt
 *   - BEFORE/AFTER_CONTEXT_ASSEMBLY hook modification of system prompt
 *   - BEFORE_MEMORY_QUERY hook override of query string
 *   - Graceful degradation when RAG query fails
 *   - Correct message ordering: [system, ...history, user]
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ContextAssembler } from '../../../packages/agent/src/context/ContextAssembler.js';
import { HookRegistry } from '../../../packages/agent/src/hooks/HookRegistry.js';
import { HookPoint } from '../../../packages/agent/src/hooks/types.js';
import type { ContextAssemblyInput, RAGResult } from '../../../packages/agent/src/context/types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createTestInput(overrides?: Partial<ContextAssemblyInput>): ContextAssemblyInput {
  return {
    userMessage: 'What is TypeScript?',
    systemPrompt: 'You are a helpful assistant.',
    messages: [
      { role: 'user', content: 'Previous question' },
      { role: 'assistant', content: 'Previous answer' },
    ],
    sessionId: 'session-001',
    chatId: 'chat-001',
    traceId: 'trace-001',
    ...overrides,
  };
}

function createRAGResults(count: number): RAGResult[] {
  return Array.from({ length: count }, (_, i) => ({
    content: `Memory fact ${i + 1}: relevant information`,
    score: 0.9 - i * 0.1,
  }));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ContextAssembler -- RAG Integration', () => {
  let hooks: HookRegistry;

  beforeEach(() => {
    hooks = new HookRegistry();
  });

  it('should inject RAG results into system prompt', async () => {
    const ragResults = createRAGResults(3);
    const ragQuery = vi.fn().mockResolvedValue(ragResults);
    const assembler = new ContextAssembler(hooks, ragQuery);

    const result = await assembler.assemble(createTestInput());

    expect(result.ragQueried).toBe(true);
    expect(result.ragResultCount).toBe(3);
    expect(ragQuery).toHaveBeenCalledWith('What is TypeScript?');

    // System prompt should contain RAG section
    const systemMsg = result.messages[0]!;
    expect(systemMsg.role).toBe('system');
    expect(systemMsg.content).toContain('## Relevant Memory');
    expect(systemMsg.content).toContain('Memory fact 1');
    expect(systemMsg.content).toContain('Memory fact 2');
    expect(systemMsg.content).toContain('Memory fact 3');
  });

  it('should not inject RAG section when results are empty', async () => {
    const ragQuery = vi.fn().mockResolvedValue([]);
    const assembler = new ContextAssembler(hooks, ragQuery);

    const result = await assembler.assemble(createTestInput());

    expect(result.ragQueried).toBe(true);
    expect(result.ragResultCount).toBe(0);

    const systemMsg = result.messages[0]!;
    expect(systemMsg.content).not.toContain('## Relevant Memory');
    expect(systemMsg.content).toBe('You are a helpful assistant.');
  });

  it('should degrade gracefully when RAG query throws', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const ragQuery = vi.fn().mockRejectedValue(new Error('Vector DB unavailable'));
    const assembler = new ContextAssembler(hooks, ragQuery);

    const result = await assembler.assemble(createTestInput());

    // Should not throw -- pipeline continues without RAG
    expect(result.ragQueried).toBe(true);
    expect(result.ragResultCount).toBe(0);
    expect(result.messages[0]!.content).toBe('You are a helpful assistant.');

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('[ContextAssembler]'),
      expect.stringContaining('Vector DB unavailable'),
    );

    consoleSpy.mockRestore();
  });

  it('should not query RAG when no ragQuery function is provided', async () => {
    const assembler = new ContextAssembler(hooks); // no ragQuery

    const result = await assembler.assemble(createTestInput());

    expect(result.ragQueried).toBe(false);
    expect(result.ragResultCount).toBe(0);
  });
});

describe('ContextAssembler -- Hook Integration', () => {
  let hooks: HookRegistry;

  beforeEach(() => {
    hooks = new HookRegistry();
  });

  it('should allow BEFORE_CONTEXT_ASSEMBLY hook to override system prompt', async () => {
    hooks.register(HookPoint.BEFORE_CONTEXT_ASSEMBLY, (ctx) => ({
      ...ctx,
      data: { ...ctx.data, systemPrompt: 'Custom system prompt from hook' },
    }));

    const assembler = new ContextAssembler(hooks);
    const result = await assembler.assemble(createTestInput());

    expect(result.messages[0]!.content).toBe('Custom system prompt from hook');
  });

  it('should allow AFTER_CONTEXT_ASSEMBLY hook to override system prompt', async () => {
    hooks.register(HookPoint.AFTER_CONTEXT_ASSEMBLY, (ctx) => ({
      ...ctx,
      data: { ...ctx.data, systemPrompt: 'Final prompt override' },
    }));

    const assembler = new ContextAssembler(hooks);
    const result = await assembler.assemble(createTestInput());

    expect(result.messages[0]!.content).toBe('Final prompt override');
  });

  it('should apply hooks in order: before_context -> rag -> after_context', async () => {
    const callOrder: string[] = [];

    hooks.register(HookPoint.BEFORE_CONTEXT_ASSEMBLY, (ctx) => {
      callOrder.push('before_context');
      return ctx;
    });

    hooks.register(HookPoint.BEFORE_MEMORY_QUERY, (ctx) => {
      callOrder.push('before_memory');
      return ctx;
    });

    hooks.register(HookPoint.AFTER_CONTEXT_ASSEMBLY, (ctx) => {
      callOrder.push('after_context');
      return ctx;
    });

    const ragQuery = vi.fn().mockResolvedValue(createRAGResults(1));
    const assembler = new ContextAssembler(hooks, ragQuery);

    await assembler.assemble(createTestInput());

    expect(callOrder).toEqual(['before_context', 'before_memory', 'after_context']);
  });

  it('should allow BEFORE_MEMORY_QUERY hook to override query string', async () => {
    hooks.register(HookPoint.BEFORE_MEMORY_QUERY, (ctx) => ({
      ...ctx,
      data: { ...ctx.data, query: 'overridden query' },
    }));

    const ragQuery = vi.fn().mockResolvedValue(createRAGResults(1));
    const assembler = new ContextAssembler(hooks, ragQuery);

    await assembler.assemble(createTestInput());

    expect(ragQuery).toHaveBeenCalledWith('overridden query');
  });
});

describe('ContextAssembler -- Message Ordering', () => {
  let hooks: HookRegistry;

  beforeEach(() => {
    hooks = new HookRegistry();
  });

  it('should produce messages in correct order: [system, ...history, user]', async () => {
    const assembler = new ContextAssembler(hooks);
    const input = createTestInput({
      messages: [
        { role: 'user', content: 'First question' },
        { role: 'assistant', content: 'First answer' },
        { role: 'user', content: 'Second question' },
        { role: 'assistant', content: 'Second answer' },
      ],
      userMessage: 'Third question',
    });

    const result = await assembler.assemble(input);

    expect(result.messages).toHaveLength(6); // system + 4 history + 1 user
    expect(result.messages[0]!.role).toBe('system');
    expect(result.messages[1]!.content).toBe('First question');
    expect(result.messages[2]!.content).toBe('First answer');
    expect(result.messages[3]!.content).toBe('Second question');
    expect(result.messages[4]!.content).toBe('Second answer');
    expect(result.messages[5]!.role).toBe('user');
    expect(result.messages[5]!.content).toBe('Third question');
  });

  it('should work with empty chat history', async () => {
    const assembler = new ContextAssembler(hooks);
    const input = createTestInput({
      messages: [],
      userMessage: 'Hello',
    });

    const result = await assembler.assemble(input);

    expect(result.messages).toHaveLength(2); // system + user
    expect(result.messages[0]!.role).toBe('system');
    expect(result.messages[1]!.role).toBe('user');
    expect(result.messages[1]!.content).toBe('Hello');
  });

  it('should preserve system prompt base content after RAG injection', async () => {
    const ragQuery = vi.fn().mockResolvedValue(createRAGResults(2));
    const assembler = new ContextAssembler(hooks, ragQuery);

    const result = await assembler.assemble(createTestInput({
      systemPrompt: 'You are a TypeScript expert.',
    }));

    const systemContent = result.messages[0]!.content;
    expect(systemContent).toContain('You are a TypeScript expert.');
    expect(systemContent).toContain('## Relevant Memory');
  });
});
