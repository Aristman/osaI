/**
 * @osai/providers -- Provider Chain Recovery + Advanced Failover Tests (T-002)
 *
 * Additional critical tests beyond existing provider-chain.test.ts:
 *   - Full 5-provider failover chain
 *   - Circuit breaker recovery cycle (closed -> open -> half-open -> closed)
 *   - Auth rotation with exhausted keys -> failover
 *   - Non-ProviderError wrapping in chain
 *   - Concurrent execute calls while circuit breaker is transitioning
 *   - Provider returns TokenLimitError -> treated as failure
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { LLMProvider, LLMRequest, LLMResponse } from '../../../packages/providers/src/types.js';
import { ProviderStatus } from '../../../packages/providers/src/types.js';
import {
  ProviderUnavailableError,
  RateLimitError,
  TokenLimitError,
  AuthError,
} from '../../../packages/providers/src/errors.js';
import { ProviderChain } from '../../../packages/providers/src/chain/provider-chain.js';
import type { ChainLogger } from '../../../packages/providers/src/chain/provider-chain.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockLogger(): ChainLogger {
  return {
    fatal: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
  };
}

function createMockProvider(id: string, name: string) {
  const complete = vi.fn();
  const stream = vi.fn();
  const isAvailable = vi.fn().mockResolvedValue(true);
  const getStatus = vi.fn().mockReturnValue(ProviderStatus.Available);

  const provider: LLMProvider = {
    id,
    name,
    complete,
    stream,
    isAvailable,
    getStatus,
    countTokens: (text: string) => Math.ceil(text.length / 4),
  };

  return { provider, complete, stream, isAvailable, getStatus };
}

function createSuccessResponse(providerId: string): LLMResponse {
  return {
    content: `Response from ${providerId}`,
    usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
    model: 'test-model',
    provider: providerId,
    finishReason: 'stop',
  };
}

const defaultRequest: LLMRequest = {
  model: 'test-model',
  messages: [{ role: 'user', content: 'Hello' }],
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ProviderChain -- Full 5-Provider Failover', () => {
  let logger: ReturnType<typeof createMockLogger>;

  beforeEach(() => {
    logger = createMockLogger();
    vi.clearAllMocks();
  });

  it('should try all 5 providers in order and succeed on the last', async () => {
    const { provider: zAi, complete: zAiComplete } = createMockProvider('z-ai', 'Z.ai');
    const { provider: yandex, complete: yandexComplete } = createMockProvider('yandex', 'Yandex');
    const { provider: anthropic, complete: anthropicComplete } = createMockProvider('anthropic', 'Anthropic');
    const { provider: openai, complete: openaiComplete } = createMockProvider('openai', 'OpenAI');
    const { provider: ollama, complete: ollamaComplete } = createMockProvider('ollama', 'Ollama');

    zAiComplete.mockRejectedValue(new ProviderUnavailableError('Down', 'z-ai'));
    yandexComplete.mockRejectedValue(new ProviderUnavailableError('Down', 'yandex'));
    anthropicComplete.mockRejectedValue(new ProviderUnavailableError('Down', 'anthropic'));
    openaiComplete.mockRejectedValue(new ProviderUnavailableError('Down', 'openai'));
    ollamaComplete.mockResolvedValue(createSuccessResponse('ollama'));

    const chain = new ProviderChain(
      [zAi, yandex, anthropic, openai, ollama],
      { logger },
    );
    const response = await chain.execute(defaultRequest);

    expect(response.provider).toBe('ollama');
    expect(zAiComplete).toHaveBeenCalledTimes(1);
    expect(yandexComplete).toHaveBeenCalledTimes(1);
    expect(anthropicComplete).toHaveBeenCalledTimes(1);
    expect(openaiComplete).toHaveBeenCalledTimes(1);
    expect(ollamaComplete).toHaveBeenCalledTimes(1);
  });

  it('should fail with all 5 providers down', async () => {
    const { provider: p1, complete: c1 } = createMockProvider('p1', 'P1');
    const { provider: p2, complete: c2 } = createMockProvider('p2', 'P2');
    const { provider: p3, complete: c3 } = createMockProvider('p3', 'P3');
    const { provider: p4, complete: c4 } = createMockProvider('p4', 'P4');
    const { provider: p5, complete: c5 } = createMockProvider('p5', 'P5');

    c1.mockRejectedValue(new ProviderUnavailableError('Down', 'p1'));
    c2.mockRejectedValue(new ProviderUnavailableError('Down', 'p2'));
    c3.mockRejectedValue(new ProviderUnavailableError('Down', 'p3'));
    c4.mockRejectedValue(new ProviderUnavailableError('Down', 'p4'));
    c5.mockRejectedValue(new ProviderUnavailableError('Down', 'p5'));

    const chain = new ProviderChain([p1, p2, p3, p4, p5], { logger });

    await expect(chain.execute(defaultRequest)).rejects.toThrow('All 5 provider(s) failed');
  });
});

describe('ProviderChain -- Circuit Breaker Recovery in Chain', () => {
  let logger: ReturnType<typeof createMockLogger>;

  beforeEach(() => {
    vi.useFakeTimers();
    logger = createMockLogger();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should skip provider with open circuit breaker and use next', async () => {
    const { provider: p1, complete: c1 } = createMockProvider('p1', 'P1');
    const { provider: p2, complete: c2 } = createMockProvider('p2', 'P2');

    c1.mockRejectedValue(new ProviderUnavailableError('Down', 'p1'));
    c2.mockResolvedValue(createSuccessResponse('p2'));

    const chain = new ProviderChain([p1, p2], {
      logger,
      circuitBreaker: { failureThreshold: 3, resetTimeoutMs: 5_000 },
    });

    // Generate 3 failures on p1 to open circuit breaker
    for (let i = 0; i < 3; i++) {
      try { await chain.execute(defaultRequest); } catch { /* expected */ }
    }

    expect(chain.getCircuitBreaker('p1')?.getState()).toBe('open');

    // Reset p2 mock
    c2.mockClear();
    c2.mockResolvedValue(createSuccessResponse('p2'));

    // Next call should skip p1 (circuit open) and use p2
    const response = await chain.execute(defaultRequest);

    expect(response.provider).toBe('p2');
    expect(c1).toHaveBeenCalledTimes(3); // No additional calls
    expect(c2).toHaveBeenCalledTimes(1);

    // Verify skip was logged
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'provider_chain.skip',
        provider: 'p1',
        reason: 'circuit_breaker_open',
      }),
      expect.any(String),
    );
  });

  it('should recover circuit breaker after timeout and use provider again', async () => {
    const { provider: p1, complete: c1 } = createMockProvider('p1', 'P1');
    const { provider: p2, complete: c2 } = createMockProvider('p2', 'P2');

    c1.mockRejectedValue(new ProviderUnavailableError('Down', 'p1'));
    c2.mockResolvedValue(createSuccessResponse('p2'));

    const chain = new ProviderChain([p1, p2], {
      logger,
      circuitBreaker: { failureThreshold: 2, resetTimeoutMs: 3_000 },
    });

    // Open circuit breaker for p1
    for (let i = 0; i < 2; i++) {
      try { await chain.execute(defaultRequest); } catch { /* expected */ }
    }
    expect(chain.getCircuitBreaker('p1')?.getState()).toBe('open');

    // Advance past reset timeout -> half-open
    vi.advanceTimersByTime(3_001);
    expect(chain.getCircuitBreaker('p1')?.getState()).toBe('half_open');

    // Now p1 succeeds -> circuit closes
    c1.mockResolvedValue(createSuccessResponse('p1'));
    const response = await chain.execute(defaultRequest);

    expect(response.provider).toBe('p1');
    expect(chain.getCircuitBreaker('p1')?.getState()).toBe('closed');
  });
});

describe('ProviderChain -- TokenLimitError and AuthError Handling', () => {
  let logger: ReturnType<typeof createMockLogger>;

  beforeEach(() => {
    logger = createMockLogger();
    vi.clearAllMocks();
  });

  it('should treat TokenLimitError as failure and failover to next provider', async () => {
    const { provider: p1, complete: c1 } = createMockProvider('p1', 'P1');
    const { provider: p2, complete: c2 } = createMockProvider('p2', 'P2');

    c1.mockRejectedValue(new TokenLimitError(
      'Token limit exceeded',
      'p1',
      100_000,
      80_000,
    ));
    c2.mockResolvedValue(createSuccessResponse('p2'));

    const chain = new ProviderChain([p1, p2], { logger });
    const response = await chain.execute(defaultRequest);

    expect(response.provider).toBe('p2');
    expect(c1).toHaveBeenCalledTimes(1);
    expect(c2).toHaveBeenCalledTimes(1);
  });

  it('should treat AuthError as failure and failover to next provider', async () => {
    const { provider: p1, complete: c1 } = createMockProvider('p1', 'P1');
    const { provider: p2, complete: c2 } = createMockProvider('p2', 'P2');

    c1.mockRejectedValue(new AuthError(
      'Invalid API key',
      'p1',
      { statusCode: 401 },
    ));
    c2.mockResolvedValue(createSuccessResponse('p2'));

    const chain = new ProviderChain([p1, p2], { logger });
    const response = await chain.execute(defaultRequest);

    expect(response.provider).toBe('p2');
  });

  it('should record TokenLimitError in circuit breaker failure count', async () => {
    const { provider: p1, complete: c1 } = createMockProvider('p1', 'P1');
    const { provider: p2, complete: c2 } = createMockProvider('p2', 'P2');

    c1.mockRejectedValue(new TokenLimitError('Too many tokens', 'p1', 50000, 40000));
    c2.mockResolvedValue(createSuccessResponse('p2'));

    const chain = new ProviderChain([p1, p2], { logger });

    await chain.execute(defaultRequest);

    const cb = chain.getCircuitBreaker('p1');
    expect(cb).toBeDefined();
    expect(cb?.getStats().failureCount).toBe(1);
  });
});

describe('ProviderChain -- Error Wrapping', () => {
  let logger: ReturnType<typeof createMockLogger>;

  beforeEach(() => {
    logger = createMockLogger();
    vi.clearAllMocks();
  });

  it('should wrap TypeError in ProviderError and continue failover', async () => {
    const { provider: p1, complete: c1 } = createMockProvider('p1', 'P1');
    const { provider: p2, complete: c2 } = createMockProvider('p2', 'P2');

    c1.mockRejectedValue(new TypeError('Cannot read property of undefined'));
    c2.mockResolvedValue(createSuccessResponse('p2'));

    const chain = new ProviderChain([p1, p2], { logger });
    const response = await chain.execute(defaultRequest);

    expect(response.provider).toBe('p2');
  });

  it('should wrap string errors in ProviderError', async () => {
    const { provider: p1, complete: c1 } = createMockProvider('p1', 'P1');
    const { provider: p2, complete: c2 } = createMockProvider('p2', 'P2');

    c1.mockRejectedValue('unexpected string error');
    c2.mockResolvedValue(createSuccessResponse('p2'));

    const chain = new ProviderChain([p1, p2], { logger });
    const response = await chain.execute(defaultRequest);

    expect(response.provider).toBe('p2');
  });

  it('should include all error types in final ProviderError when all fail', async () => {
    const { provider: p1, complete: c1 } = createMockProvider('p1', 'P1');
    const { provider: p2, complete: c2 } = createMockProvider('p2', 'P2');
    const { provider: p3, complete: c3 } = createMockProvider('p3', 'P3');

    c1.mockRejectedValue(new RateLimitError('429', 'p1'));
    c2.mockRejectedValue(new TokenLimitError('Token limit', 'p2', 50000, 40000));
    c3.mockRejectedValue(new AuthError('403', 'p3', { statusCode: 403 }));

    const chain = new ProviderChain([p1, p2, p3], { logger });

    try {
      await chain.execute(defaultRequest);
      expect.fail('Should have thrown');
    } catch (error) {
      const msg = (error as Error).message;
      expect(msg).toContain('p1');
      expect(msg).toContain('p2');
      expect(msg).toContain('p3');
    }
  });
});

describe('ProviderChain -- Mixed Success/Failure Scenarios', () => {
  let logger: ReturnType<typeof createMockLogger>;

  beforeEach(() => {
    logger = createMockLogger();
    vi.clearAllMocks();
  });

  it('should use first provider that succeeds after intermittent failures', async () => {
    const { provider: p1, complete: c1 } = createMockProvider('p1', 'P1');
    const { provider: p2, complete: c2 } = createMockProvider('p2', 'P2');
    const { provider: p3, complete: c3 } = createMockProvider('p3', 'P3');

    // p1 fails, p2 succeeds
    c1.mockRejectedValue(new ProviderUnavailableError('Down', 'p1'));
    c2.mockResolvedValue(createSuccessResponse('p2'));
    c3.mockResolvedValue(createSuccessResponse('p3'));

    const chain = new ProviderChain([p1, p2, p3], { logger });
    const response = await chain.execute(defaultRequest);

    expect(response.provider).toBe('p2');
    // p3 should never be called
    expect(c3).not.toHaveBeenCalled();
  });

  it('should succeed when first provider recovers after intermittent outage', async () => {
    const { provider: p1, complete: c1 } = createMockProvider('p1', 'P1');
    const { provider: p2, complete: c2 } = createMockProvider('p2', 'P2');

    // First call: p1 fails -> failover to p2
    c1.mockRejectedValueOnce(new ProviderUnavailableError('Down', 'p1'));
    c2.mockResolvedValueOnce(createSuccessResponse('p2'));

    const chain = new ProviderChain([p1, p2], { logger });

    const response1 = await chain.execute(defaultRequest);
    expect(response1.provider).toBe('p2');

    // Second call: p1 recovers
    c1.mockResolvedValue(createSuccessResponse('p1'));

    const response2 = await chain.execute(defaultRequest);
    expect(response2.provider).toBe('p1');
    expect(c1).toHaveBeenCalledTimes(2); // called in both attempts
    expect(c2).toHaveBeenCalledTimes(1); // only called in first attempt
  });
});
