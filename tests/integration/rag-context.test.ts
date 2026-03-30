/**
 * Integration Test: RAG Context Injection
 *
 * T-004 / F-013
 *
 * Tests the Agent + RAG integration:
 *   Message -> Memory Query -> Context Injection -> LLM Call
 *
 * Verifies that the ContextAssembler correctly:
 * - Queries the RAG function with the user message
 * - Injects retrieved context into the system prompt
 * - Passes the assembled context to the LLM provider
 * - Handles RAG failures gracefully
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import {
  createMockLLMProvider,
  createTestFixture,
  createTestChatMessage,
  TEST_IDS,
} from './setup.js';
import type { RAGResult } from '../../packages/agent/src/context/types.js';
import { DatabaseManager } from '../../packages/shared/src/database.js';
import { HookRegistry } from '../../packages/agent/src/hooks/HookRegistry.js';
import { ContextAssembler } from '../../packages/agent/src/context/ContextAssembler.js';
import { InferenceService } from '../../packages/agent/src/inference/InferenceService.js';
import { AgentLoop } from '../../packages/agent/src/loop/AgentLoop.js';
import type { LLMRequest } from '../../packages/providers/src/types.js';

describe('Integration: RAG Context Injection (Agent + RAG)', () => {
  let dbManager: DatabaseManager;
  let ragQueryCalls: string[];
  let ragQueryFn: (query: string) => Promise<readonly RAGResult[]>;

  beforeAll(() => {
    dbManager = new DatabaseManager({ dbPath: ':memory:' });
    dbManager.initialize();
  });

  afterAll(() => {
    dbManager.close();
  });

  beforeEach(() => {
    ragQueryCalls = [];
    ragQueryFn = async (query: string) => {
      ragQueryCalls.push(query);
      return [
        { content: 'User prefers dark theme', score: 0.95 },
        { content: 'User works at Acme Corp', score: 0.85 },
      ];
    };
  });

  // ---------------------------------------------------------------------------
  // T-004: Agent with RAG: message -> memory query -> context injection -> LLM
  // ---------------------------------------------------------------------------

  it('queries RAG with the user message', async () => {
    const fixture = createTestFixture(dbManager, {}, ragQueryFn);
    const provider = fixture.provider as ReturnType<typeof createMockLLMProvider>;

    await fixture.agentLoop.run({
      userMessage: 'What are my preferences?',
      messages: [],
      sessionId: TEST_IDS.sessionId,
      chatId: TEST_IDS.chatId,
    });

    // Verify RAG was queried with the user message
    expect(ragQueryCalls.length).toBe(1);
    expect(ragQueryCalls[0]).toBe('What are my preferences?');
  });

  it('injects RAG results into the system prompt sent to the LLM', async () => {
    const fixture = createTestFixture(dbManager, {}, ragQueryFn);
    const provider = fixture.provider as ReturnType<typeof createMockLLMProvider>;

    await fixture.agentLoop.run({
      userMessage: 'Tell me about myself',
      messages: [],
      sessionId: TEST_IDS.sessionId,
      chatId: TEST_IDS.chatId,
    });

    // Verify the provider received the system prompt with RAG results
    expect(provider.completeCalls.length).toBe(1);
    const systemMessage = provider.completeCalls[0]!.messages[0]!;

    expect(systemMessage.role).toBe('system');
    expect(systemMessage.content).toContain('## Relevant Memory');
    expect(systemMessage.content).toContain('User prefers dark theme');
    expect(systemMessage.content).toContain('User works at Acme Corp');
  });

  it('reports RAG result count in the agent loop output', async () => {
    const fixture = createTestFixture(dbManager, {}, ragQueryFn);

    const result = await fixture.agentLoop.run({
      userMessage: 'test',
      messages: [],
      sessionId: TEST_IDS.sessionId,
      chatId: TEST_IDS.chatId,
    });

    expect(result.ragResultCount).toBe(2);
  });

  it('works correctly when RAG returns no results', async () => {
    const emptyRagFn = async (_query: string) => {
      ragQueryCalls.push(_query);
      return [];
    };

    const fixture = createTestFixture(dbManager, {}, emptyRagFn);
    const provider = fixture.provider as ReturnType<typeof createMockLLMProvider>;

    await fixture.agentLoop.run({
      userMessage: 'What is the weather?',
      messages: [],
      sessionId: TEST_IDS.sessionId,
      chatId: TEST_IDS.chatId,
    });

    // RAG was queried but no results injected
    expect(ragQueryCalls.length).toBe(1);
    const systemMessage = provider.completeCalls[0]!.messages[0]!;
    expect(systemMessage.content).not.toContain('## Relevant Memory');
  });

  it('gracefully handles RAG query failure', async () => {
    const failingRagFn = async (_query: string) => {
      ragQueryCalls.push(_query);
      throw new Error('Vector store connection lost');
    };

    const fixture = createTestFixture(dbManager, {}, failingRagFn);
    const provider = fixture.provider as ReturnType<typeof createMockLLMProvider>;

    // Should NOT throw -- context assembly should degrade gracefully
    const result = await fixture.agentLoop.run({
      userMessage: 'test',
      messages: [],
      sessionId: TEST_IDS.sessionId,
      chatId: TEST_IDS.chatId,
    });

    // Agent loop should still succeed despite RAG failure
    expect(result.isError).toBe(false);
    expect(result.ragResultCount).toBe(0);

    // System prompt should not contain RAG section
    const systemMessage = provider.completeCalls[0]!.messages[0]!;
    expect(systemMessage.content).not.toContain('## Relevant Memory');
  });

  it('preserves existing system prompt when injecting RAG results', async () => {
    const fixture = createTestFixture(
      dbManager,
      { responseContent: 'Based on your memory...' },
      ragQueryFn,
    );
    const provider = fixture.provider as ReturnType<typeof createMockLLMProvider>;

    await fixture.agentLoop.run({
      userMessage: 'test',
      messages: [],
      sessionId: TEST_IDS.sessionId,
      chatId: TEST_IDS.chatId,
    });

    const systemMessage = provider.completeCalls[0]!.messages[0]!;
    const content = systemMessage.content;

    // Original system prompt should still be present
    expect(content).toContain('You are a helpful assistant.');

    // RAG section should be appended after the original prompt
    const promptIndex = content.indexOf('You are a helpful assistant.');
    const ragIndex = content.indexOf('## Relevant Memory');
    expect(ragIndex).toBeGreaterThan(promptIndex);
  });

  it('does not query RAG when ragQuery is not provided', async () => {
    // Create fixture without RAG
    const fixture = createTestFixture(dbManager);
    const provider = fixture.provider as ReturnType<typeof createMockLLMProvider>;

    const result = await fixture.agentLoop.run({
      userMessage: 'test',
      messages: [],
      sessionId: TEST_IDS.sessionId,
      chatId: TEST_IDS.chatId,
    });

    expect(result.ragResultCount).toBe(0);
    const systemMessage = provider.completeCalls[0]!.messages[0]!;
    expect(systemMessage.content).not.toContain('## Relevant Memory');
  });

  it('fires BEFORE_MEMORY_QUERY hook during RAG query', async () => {
    const hookCalls: string[] = [];

    const fixture = createTestFixture(dbManager, {}, ragQueryFn);

    fixture.hooks.register(
      ('before_memory_query' as unknown),
      (ctx) => {
        hookCalls.push(ctx.hookPoint);
        return ctx;
      },
    );

    await fixture.agentLoop.run({
      userMessage: 'What do you know about me?',
      messages: [],
      sessionId: TEST_IDS.sessionId,
      chatId: TEST_IDS.chatId,
    });

    expect(hookCalls.length).toBe(1);
  });
});
