/**
 * Integration Test: Full Request Flow
 *
 * T-004 / F-013
 *
 * Tests the complete request pipeline:
 *   WS Client -> Gateway -> Agent -> Provider (mock) -> Response -> WS Delivery
 *
 * Mocks the WebSocket transport and focuses on verifying that the
 * AgentLoop correctly processes a user message through all pipeline stages
 * and produces a response from the mock LLM provider.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { createMockLLMProvider, createTestFixture, createTestChatMessage, TEST_IDS } from './setup.js';
import type { LLMProvider } from '../../packages/providers/src/types.js';
import { DatabaseManager } from '../../packages/shared/src/database.js';

describe('Integration: Full Request Flow (WS -> Gateway -> Agent -> Provider -> Response)', () => {
  let fixture: ReturnType<typeof createTestFixture>;
  let dbManager: DatabaseManager;
  let provider: LLMProvider & { completeCalls: import('../../packages/providers/src/types.js').LLMRequest[] };

  beforeAll(() => {
    dbManager = new DatabaseManager({ dbPath: ':memory:' });
    dbManager.initialize();
  });

  afterAll(() => {
    dbManager.close();
  });

  beforeEach(() => {
    fixture = createTestFixture(dbManager, {
      defaultModel: 'mock-glm-5',
      responseContent: 'Hello! How can I help you today?',
    });
    provider = fixture.provider as LLMProvider & { completeCalls: import('../../packages/providers/src/types.js').LLMRequest[] };
  });

  // ---------------------------------------------------------------------------
  // T-004: WS message -> Gateway -> Agent -> Provider (mock) -> response
  // ---------------------------------------------------------------------------

  it('processes a simple user message through the full agent pipeline', async () => {
    const userMessage = 'Hello, what can you do?';
    const chatId = fixture.chatService.createChat({ name: 'Test Chat', channel: 'cli' });

    fixture.chatService.addMessage(chatId, { role: 'user', content: userMessage });

    const messages = fixture.chatService.getMessages(chatId);

    const result = await fixture.agentLoop.run({
      userMessage,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      sessionId: TEST_IDS.sessionId,
      chatId,
      traceId: TEST_IDS.traceId,
    });

    // Verify the agent loop produced a response
    expect(result.isError).toBe(false);
    expect(result.content).toBe('Hello! How can I help you today?');
    expect(result.model).toBe('mock-glm-5');
    expect(result.provider).toBe('mock-provider');
    expect(result.traceId).toBe(TEST_IDS.traceId);
  });

  it('includes system prompt in the assembled context sent to the LLM', async () => {
    const result = await fixture.agentLoop.run({
      userMessage: 'test',
      messages: [],
      sessionId: TEST_IDS.sessionId,
      chatId: TEST_IDS.chatId,
    });

    // Verify that the provider received the request
    expect(provider.completeCalls.length).toBe(1);
    const sentMessages = provider.completeCalls[0]!.messages;

    // First message should be the system prompt
    expect(sentMessages[0]!.role).toBe('system');
    expect(sentMessages[0]!.content).toContain('You are a helpful assistant.');
  });

  it('passes chat history to the LLM', async () => {
    const history = [
      createTestChatMessage('user', 'First message'),
      createTestChatMessage('assistant', 'First response'),
      createTestChatMessage('user', 'Second message'),
    ];

    await fixture.agentLoop.run({
      userMessage: 'Third message',
      messages: history,
      sessionId: TEST_IDS.sessionId,
      chatId: TEST_IDS.chatId,
    });

    expect(provider.completeCalls.length).toBe(1);
    const sentMessages = provider.completeCalls[0]!.messages;

    // Should have system + history + user message
    expect(sentMessages.length).toBe(5); // system + 3 history + current user
    expect(sentMessages[1]!.content).toBe('First message');
    expect(sentMessages[2]!.content).toBe('First response');
    expect(sentMessages[3]!.content).toBe('Second message');
    expect(sentMessages[4]!.content).toBe('Third message');
  });

  it('returns token usage statistics', async () => {
    const result = await fixture.agentLoop.run({
      userMessage: 'test',
      messages: [],
      sessionId: TEST_IDS.sessionId,
      chatId: TEST_IDS.chatId,
    });

    expect(result.usage).toBeDefined();
    expect(result.usage.totalTokens).toBeGreaterThan(0);
    expect(result.usage.promptTokens).toBeGreaterThan(0);
    expect(result.usage.completionTokens).toBeGreaterThan(0);
  });

  it('fires BEFORE_INTAKE hook during agent loop execution', async () => {
    const hookCalls: string[] = [];

    fixture.hooks.register(
      // HookPoint enum value
      ('before_intake' as unknown),
      (ctx) => {
        hookCalls.push(ctx.hookPoint);
        return ctx;
      },
    );

    await fixture.agentLoop.run({
      userMessage: 'test',
      messages: [],
      sessionId: TEST_IDS.sessionId,
      chatId: TEST_IDS.chatId,
    });

    expect(hookCalls.length).toBeGreaterThan(0);
  });

  it('generates a trace ID when not provided', async () => {
    const result = await fixture.agentLoop.run({
      userMessage: 'test',
      messages: [],
      sessionId: TEST_IDS.sessionId,
      chatId: TEST_IDS.chatId,
      // traceId intentionally omitted
    });

    expect(result.traceId).toBeDefined();
    expect(result.traceId.length).toBeGreaterThan(0);
    // Should be a valid UUID format
    expect(result.traceId).toMatch(/^[0-9a-f-]+$/);
  });

  it('returns error response when provider fails', async () => {
    // Re-create fixture with failing provider
    const failingFixture = createTestFixture(dbManager, {
      defaultModel: 'failing-model',
      shouldFail: true,
      failError: new Error('Provider connection refused'),
    });

    const result = await failingFixture.agentLoop.run({
      userMessage: 'test',
      messages: [],
      sessionId: TEST_IDS.sessionId,
      chatId: TEST_IDS.chatId,
    });

    expect(result.isError).toBe(true);
    expect(result.errorMessage).toContain('Provider connection refused');
    expect(result.content).toBe('');
  });
});
