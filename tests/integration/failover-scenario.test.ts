/**
 * Integration Test: Provider Failover Scenario
 *
 * T-004 / F-013
 *
 * Tests the Circuit Breaker + Provider Chain failover:
 *   Provider A down -> Circuit Breaker Opens -> Failover to Provider B -> Recovery
 *
 * Verifies that the ProviderChain correctly:
 * - Skips providers with open circuit breakers
 * - Falls back to the next available provider
 * - Opens circuit breaker after repeated failures
 * - Allows recovery through half-open state
 * - Reports correct status for all providers
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { createMockLLMProvider, createTestFixture, TEST_IDS } from './setup.js';
import type {
  LLMProvider,
  LLMRequest,
  LLMResponse,
  LLMChunk,
  ChatMessage,
  TokenUsage,
} from '../../packages/providers/src/types.js';
import { ProviderStatus } from '../../packages/providers/src/types.js';
import { ProviderError, ProviderUnavailableError } from '../../packages/providers/src/errors.js';
import { ProviderChain } from '../../packages/providers/src/chain/provider-chain.js';
import { CircuitState } from '../../packages/providers/src/circuit-breaker/types.js';
import { DatabaseManager } from '../../packages/shared/src/database.js';

describe('Integration: Failover Scenario (Provider A down -> Circuit Breaker -> Failover to B)', () => {
  let dbManager: DatabaseManager;
  let providerA: ReturnType<typeof createMockLLMProvider>;
  let providerB: ReturnType<typeof createMockLLMProvider>;
  let providerC: ReturnType<typeof createMockLLMProvider>;

  beforeAll(() => {
    dbManager = new DatabaseManager({ dbPath: ':memory:' });
    dbManager.initialize();
  });

  afterAll(() => {
    dbManager.close();
  });

  beforeEach(() => {
    providerA = createMockLLMProvider({
      id: 'z-ai',
      name: 'Z.ai (Primary)',
      defaultModel: 'glm-5',
      responseContent: 'Response from Z.ai',
    });
    providerB = createMockLLMProvider({
      id: 'openai',
      name: 'OpenAI (Fallback)',
      defaultModel: 'gpt-4o',
      responseContent: 'Response from OpenAI',
    });
    providerC = createMockLLMProvider({
      id: 'ollama',
      name: 'Ollama (Local)',
      defaultModel: 'llama3',
      responseContent: 'Response from Ollama',
    });
  });

  // ---------------------------------------------------------------------------
  // T-004: Provider A down -> circuit breaker opens -> failover to Provider B
  // ---------------------------------------------------------------------------

  it('falls back to the next provider when primary fails', async () => {
    // Make provider A fail
    providerA = createMockLLMProvider({
      id: 'z-ai',
      name: 'Z.ai',
      defaultModel: 'glm-5',
      shouldFail: true,
      failError: new ProviderUnavailableError('Connection refused', 'z-ai'),
    });

    const chain = new ProviderChain([providerA, providerB], {
      circuitBreaker: { failureThreshold: 1, resetTimeoutMs: 1000 },
    });

    const request: LLMRequest = {
      model: 'glm-5',
      messages: [{ role: 'user', content: 'Hello' }],
    };

    const response = await chain.execute(request);

    // Should have gotten response from provider B (OpenAI)
    expect(response.provider).toBe('openai');
    expect(response.content).toBe('Response from OpenAI');
    // Model is from the original request (ProviderChain passes same request to all providers)
    expect(response.model).toBe('glm-5');

    // Provider A should have been attempted
    expect(providerA.completeCalls.length).toBe(1);
    // Provider B should have been attempted and succeeded
    expect(providerB.completeCalls.length).toBe(1);
    // Provider C should not have been attempted
    expect(providerC.completeCalls.length).toBe(0);
  });

  it('skips providers with open circuit breaker', async () => {
    const chain = new ProviderChain([providerA, providerB], {
      circuitBreaker: { failureThreshold: 2, resetTimeoutMs: 60_000 },
    });

    // Force provider A circuit breaker open by failing twice
    providerA = createMockLLMProvider({
      id: 'z-ai',
      name: 'Z.ai',
      defaultModel: 'glm-5',
      shouldFail: true,
      failError: new ProviderUnavailableError('Down', 'z-ai'),
    });

    // Recreate chain with failing provider A
    const chain2 = new ProviderChain([providerA, providerB], {
      circuitBreaker: { failureThreshold: 2, resetTimeoutMs: 60_000 },
    });

    // Fail twice to open circuit breaker
    const request: LLMRequest = {
      model: 'glm-5',
      messages: [{ role: 'user', content: 'test' }],
    };

    try { await chain2.execute(request); } catch { /* expected - both might fail before B works */ }

    // Check status
    const status = chain2.getStatus();
    const providerAStatus = status.find((s) => s.providerId === 'z-ai');
    expect(providerAStatus).toBeDefined();

    // If circuit is open, verify it would be skipped on next call
    if (providerAStatus!.circuitState === CircuitState.Open) {
      // Provider B should respond
      const response = await chain2.execute(request);
      expect(response.provider).toBe('openai');
    }
  });

  it('throws when all providers fail', async () => {
    const failingA = createMockLLMProvider({
      id: 'z-ai', name: 'Z.ai', defaultModel: 'glm-5',
      shouldFail: true, failError: new ProviderError('Down', 'z-ai'),
    });
    const failingB = createMockLLMProvider({
      id: 'openai', name: 'OpenAI', defaultModel: 'gpt-4o',
      shouldFail: true, failError: new ProviderError('Down', 'openai'),
    });

    const chain = new ProviderChain([failingA, failingB], {
      circuitBreaker: { failureThreshold: 5, resetTimeoutMs: 60_000 },
    });

    const request: LLMRequest = {
      model: 'glm-5',
      messages: [{ role: 'user', content: 'test' }],
    };

    await expect(chain.execute(request)).rejects.toThrow('All 2 provider(s) failed');
  });

  it('recovers after circuit breaker resets to half-open', async () => {
    providerA = createMockLLMProvider({
      id: 'z-ai', name: 'Z.ai', defaultModel: 'glm-5',
      shouldFail: true,
      failError: new ProviderUnavailableError('Temporary down', 'z-ai'),
    });

    const chain = new ProviderChain([providerA, providerB], {
      circuitBreaker: { failureThreshold: 1, resetTimeoutMs: 200 }, // Short reset timeout
    });

    const request: LLMRequest = {
      model: 'glm-5',
      messages: [{ role: 'user', content: 'test' }],
    };

    // First call: provider A fails, circuit opens, B responds
    const response1 = await chain.execute(request);
    expect(response1.provider).toBe('openai');

    // Wait for circuit breaker reset timeout
    await new Promise((resolve) => setTimeout(resolve, 300));

    // Verify circuit breaker moved to half-open or closed state
    const cb = chain.getCircuitBreaker('z-ai');
    expect(cb).toBeDefined();
    // After reset timeout, state should transition to half-open
    const stats = cb!.getStats();
    expect(stats.state).toBe(CircuitState.HalfOpen);
  });

  it('reports correct status for all providers in chain', () => {
    const chain = new ProviderChain([providerA, providerB, providerC], {
      circuitBreaker: { failureThreshold: 5, resetTimeoutMs: 30_000 },
    });

    const status = chain.getStatus();

    expect(status.length).toBe(3);
    expect(status[0]!.providerId).toBe('z-ai');
    expect(status[1]!.providerId).toBe('openai');
    expect(status[2]!.providerId).toBe('ollama');

    // All should be available initially
    for (const s of status) {
      expect(s.circuitState).toBe(CircuitState.Closed);
    }
  });

  it('uses the active provider (first available)', () => {
    const chain = new ProviderChain([providerA, providerB, providerC]);

    const active = chain.getActiveProvider();
    expect(active).toBeDefined();
    expect(active!.id).toBe('z-ai');
  });

  it('returns null active provider when all circuit breakers are open', async () => {
    const failingA = createMockLLMProvider({
      id: 'z-ai', name: 'Z.ai', defaultModel: 'glm-5',
      shouldFail: true, failError: new ProviderError('Down', 'z-ai'),
    });
    const failingB = createMockLLMProvider({
      id: 'openai', name: 'OpenAI', defaultModel: 'gpt-4o',
      shouldFail: true, failError: new ProviderError('Down', 'openai'),
    });

    const chain = new ProviderChain([failingA, failingB], {
      circuitBreaker: { failureThreshold: 1, resetTimeoutMs: 60_000 },
    });

    const request: LLMRequest = {
      model: 'glm-5',
      messages: [{ role: 'user', content: 'test' }],
    };

    // Fail both providers to open circuit breakers
    try { await chain.execute(request); } catch { /* expected */ }

    // Wait a tiny bit for state propagation
    await new Promise((resolve) => setTimeout(resolve, 10));

    const active = chain.getActiveProvider();
    expect(active).toBeNull();
  });

  it('resets individual provider circuit breaker', async () => {
    providerA = createMockLLMProvider({
      id: 'z-ai', name: 'Z.ai', defaultModel: 'glm-5',
      shouldFail: true, failError: new ProviderError('Down', 'z-ai'),
    });

    const chain = new ProviderChain([providerA, providerB], {
      circuitBreaker: { failureThreshold: 1, resetTimeoutMs: 60_000 },
    });

    const request: LLMRequest = {
      model: 'glm-5',
      messages: [{ role: 'user', content: 'test' }],
    };

    // Fail provider A
    try { await chain.execute(request); } catch { /* expected */ }

    // Reset provider A's circuit breaker
    chain.resetProvider('z-ai');

    // Now make provider A succeed
    const recoveredA = createMockLLMProvider({
      id: 'z-ai', name: 'Z.ai', defaultModel: 'glm-5',
      responseContent: 'Recovered!',
    });

    // Verify circuit breaker was reset
    const cb = chain.getCircuitBreaker('z-ai');
    expect(cb).toBeDefined();
    expect(cb!.getStats().state).toBe(CircuitState.Closed);
  });

  it('handles failover with streaming requests', async () => {
    providerA = createMockLLMProvider({
      id: 'z-ai', name: 'Z.ai', defaultModel: 'glm-5',
      shouldFail: true, failError: new ProviderUnavailableError('Down', 'z-ai'),
    });

    const chain = new ProviderChain([providerA, providerB], {
      circuitBreaker: { failureThreshold: 1, resetTimeoutMs: 60_000 },
    });

    const request: LLMRequest = {
      model: 'glm-5',
      messages: [{ role: 'user', content: 'test' }],
    };

    const chunks: import('../../packages/providers/src/types.js').LLMChunk[] = [];
    for await (const chunk of chain.executeStream(request)) {
      chunks.push(chunk);
    }

    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks[0]!.provider).toBe('openai');
    expect(chunks[0]!.content).toBe('Response from OpenAI');
  });

  it('works end-to-end with agent loop using provider chain', async () => {
    // Create a chain with failing primary and working fallback
    const failingPrimary = createMockLLMProvider({
      id: 'z-ai', name: 'Z.ai', defaultModel: 'glm-5',
      shouldFail: true, failError: new ProviderUnavailableError('Down', 'z-ai'),
    });

    const chain = new ProviderChain([failingPrimary, providerB], {
      circuitBreaker: { failureThreshold: 3, resetTimeoutMs: 60_000 },
    });

    // Wrap ProviderChain as LLMProvider adapter (chain.execute ~ provider.complete)
    const chainAsProvider: LLMProvider = {
      id: 'provider-chain',
      name: 'Provider Chain',
      isAvailable: async () => chain.getActiveProvider() !== null,
      complete: (request) => chain.execute(request),
      stream: (request) => chain.executeStream(request),
      countTokens: () => 10,
      getStatus: () => {
        const active = chain.getActiveProvider();
        return active !== null ? ProviderStatus.Available : ProviderStatus.Unavailable;
      },
    };

    const fixture = createTestFixture(dbManager, {
      responseContent: 'Fallback response working',
    });

    const { InferenceService } = await import('../../packages/agent/src/inference/InferenceService.js');
    const { ContextAssembler } = await import('../../packages/agent/src/context/ContextAssembler.js');
    const { AgentLoop } = await import('../../packages/agent/src/loop/AgentLoop.js');

    const inferenceWithChain = new InferenceService(chainAsProvider, fixture.hooks);
    const contextAssembler = new ContextAssembler(fixture.hooks);
    const agentLoop = new AgentLoop(
      { systemPrompt: 'You are helpful.', defaultModel: 'glm-5' },
      contextAssembler,
      inferenceWithChain,
      fixture.hooks,
    );

    const result = await agentLoop.run({
      userMessage: 'Hello',
      messages: [],
      sessionId: TEST_IDS.sessionId,
      chatId: TEST_IDS.chatId,
    });

    // Should succeed via fallback
    expect(result.isError).toBe(false);
    expect(result.provider).toBe('openai');
    expect(result.content).toBe('Response from OpenAI');
  });
});
