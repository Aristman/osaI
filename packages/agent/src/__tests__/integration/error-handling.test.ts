/**
 * Integration Test -- Error Handling (T-008)
 *
 * TC-008-5: Graceful degradation at Memory System error -> loop completes without RAG
 * TC-008-6: Graceful degradation at ProviderChain error -> error returned to user
 * Tool error -> partial result
 *
 * Uses real AgentLoop, ContextAssembler, InferenceService, HookRegistry
 * with mocks at external boundaries.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AgentLoop } from '../../loop/AgentLoop.js';
import { ContextAssembler } from '../../context/ContextAssembler.js';
import { InferenceService } from '../../inference/InferenceService.js';
import { HookRegistry } from '../../hooks/HookRegistry.js';
import type { AgentLoopConfig, AgentLoopInput } from '../../loop/types.js';
import type { LLMProvider } from '@osai/providers';
import type { RAGQueryFn } from '../../context/types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createWorkingProvider(): LLMProvider {
  return {
    id: 'test',
    name: 'Test Provider',
    isAvailable: vi.fn().mockResolvedValue(true),
    complete: vi.fn().mockResolvedValue({
      content: 'Response without RAG',
      toolCalls: undefined,
      usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
      model: 'glm-5',
      provider: 'z-ai',
      finishReason: 'stop',
    }),
    stream: vi.fn().mockImplementation(function* () {}),
    countTokens: vi.fn().mockReturnValue(10),
    getStatus: vi.fn().mockReturnValue('available' as const),
  };
}

function createFailingProvider(): LLMProvider {
  return {
    id: 'failing',
    name: 'Failing Provider',
    isAvailable: vi.fn().mockResolvedValue(false),
    complete: vi.fn().mockRejectedValue(new Error('Provider connection failed')),
    stream: vi.fn().mockImplementation(function* () {}),
    countTokens: vi.fn().mockReturnValue(0),
    getStatus: vi.fn().mockReturnValue('unavailable' as const),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Integration: Error Handling (TC-008-5, TC-008-6)', () => {
  let hooks: HookRegistry;
  let config: AgentLoopConfig;
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    hooks = new HookRegistry();
    config = {
      systemPrompt: 'You are a helpful assistant.',
      defaultModel: 'glm-5',
    };
    consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  it('TC-008-5: loop completes without RAG when RAG query fails', async () => {
    const consoleWarnSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const failingRAG: RAGQueryFn = vi.fn().mockRejectedValue(
      new Error('Memory system unavailable'),
    );

    const assembler = new ContextAssembler(hooks, failingRAG);
    const provider = createWorkingProvider();
    const inferenceService = new InferenceService(provider, hooks);
    const loop = new AgentLoop(config, assembler, inferenceService, hooks);

    const input: AgentLoopInput = {
      userMessage: 'Hello',
      messages: [],
      sessionId: 'session-err-001',
      chatId: 'chat-err-001',
    };

    const result = await loop.run(input);

    // Loop should complete successfully despite RAG failure
    expect(result.isError).toBe(false);
    expect(result.content).toBe('Response without RAG');
    expect(result.ragResultCount).toBe(0);

    consoleWarnSpy.mockRestore();
  });

  it('TC-008-6: returns error response when provider fails', async () => {
    const assembler = new ContextAssembler(hooks);
    const failingProvider = createFailingProvider();
    const inferenceService = new InferenceService(failingProvider, hooks);
    const loop = new AgentLoop(config, assembler, inferenceService, hooks);

    const input: AgentLoopInput = {
      userMessage: 'Hello',
      messages: [],
      sessionId: 'session-err-002',
      chatId: 'chat-err-002',
      traceId: 'trace-err-002',
    };

    const result = await loop.run(input);

    // Should return error response, not throw
    expect(result.isError).toBe(true);
    expect(result.errorMessage).toBe('Provider connection failed');
    expect(result.content).toBe('');
    expect(result.hasToolCalls).toBe(false);
    expect(result.traceId).toBe('trace-err-002');
  });

  it('should handle provider returning empty content', async () => {
    const emptyProvider: LLMProvider = {
      id: 'empty',
      name: 'Empty Provider',
      isAvailable: vi.fn().mockResolvedValue(true),
      complete: vi.fn().mockResolvedValue({
        content: '',
        toolCalls: undefined,
        usage: { promptTokens: 10, completionTokens: 0, totalTokens: 10 },
        model: 'glm-5',
        provider: 'z-ai',
        finishReason: 'stop',
      }),
      stream: vi.fn().mockImplementation(function* () {}),
      countTokens: vi.fn().mockReturnValue(10),
      getStatus: vi.fn().mockReturnValue('available' as const),
    };

    const assembler = new ContextAssembler(hooks);
    const inferenceService = new InferenceService(emptyProvider, hooks);
    const loop = new AgentLoop(config, assembler, inferenceService, hooks);

    const input: AgentLoopInput = {
      userMessage: 'Hello',
      messages: [],
      sessionId: 'session-err-003',
      chatId: 'chat-err-003',
    };

    const result = await loop.run(input);

    expect(result.isError).toBe(false);
    expect(result.content).toBe('');
  });
});
