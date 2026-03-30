/**
 * @osai/providers -- Provider Chain Unit Tests (DOMAIN-008)
 *
 * Tests: TT-002-70 through TT-002-78 from the T-008 roadmap.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ProviderStatus } from '../types.js';
import { ProviderError, ProviderUnavailableError, RateLimitError, CircuitBreakerOpenError, } from '../errors.js';
import { ProviderChain } from './provider-chain.js';
// ---------------------------------------------------------------------------
// Mock Logger
// ---------------------------------------------------------------------------
function createMockLogger() {
    return {
        fatal: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
        info: vi.fn(),
        debug: vi.fn(),
        trace: vi.fn(),
        child: vi.fn().mockReturnThis(),
        level: 'info',
        silent: false,
    };
}
// ---------------------------------------------------------------------------
// Mock Providers
// ---------------------------------------------------------------------------
function createMockProvider(id, name) {
    const complete = vi.fn();
    const stream = vi.fn();
    const isAvailable = vi.fn().mockResolvedValue(true);
    const getStatus = vi.fn().mockReturnValue(ProviderStatus.Available);
    const provider = {
        id,
        name,
        complete,
        stream,
        isAvailable,
        getStatus,
        countTokens: (text) => Math.ceil(text.length / 4),
    };
    return { provider, complete, stream, isAvailable, getStatus };
}
function createSuccessResponse(providerId, model = 'test-model') {
    return {
        content: `Response from ${providerId}`,
        usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
        model,
        provider: providerId,
        finishReason: 'stop',
    };
}
function createMockChunk(providerId, content, model = 'test-model') {
    return {
        content,
        model,
        provider: providerId,
        finishReason: content === '[DONE]' ? 'stop' : undefined,
    };
}
function createAsyncIterable(chunks) {
    return {
        [Symbol.asyncIterator]() {
            let index = 0;
            return {
                async next() {
                    if (index < chunks.length) {
                        return { value: chunks[index++], done: false };
                    }
                    return { value: undefined, done: true };
                },
            };
        },
    };
}
const defaultRequest = {
    model: 'test-model',
    messages: [{ role: 'user', content: 'Hello' }],
};
// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('ProviderChain', () => {
    let logger;
    beforeEach(() => {
        logger = createMockLogger();
        vi.clearAllMocks();
    });
    // -- TT-002-70: Z.ai available -> uses Z.ai ------------------------------
    describe('TT-002-70: first provider available', () => {
        it('should use the first provider when it is available', async () => {
            const { provider: zAi, complete } = createMockProvider('z-ai', 'Z.ai');
            const { provider: yandex } = createMockProvider('yandex', 'Yandex');
            complete.mockResolvedValue(createSuccessResponse('z-ai'));
            const chain = new ProviderChain([zAi, yandex], { logger });
            const response = await chain.execute(defaultRequest);
            expect(response.provider).toBe('z-ai');
            expect(complete).toHaveBeenCalledTimes(1);
            expect(logger.info).toHaveBeenCalledWith(expect.objectContaining({
                event: 'provider_chain.success',
                provider: 'z-ai',
            }), expect.any(String));
        });
    });
    // -- TT-002-71: Z.ai down -> Yandex available -> Yandex ------------------
    describe('TT-002-71: failover to second provider', () => {
        it('should fall back to Yandex when Z.ai is down', async () => {
            const { provider: zAi, complete: zAiComplete } = createMockProvider('z-ai', 'Z.ai');
            const { provider: yandex, complete: yandexComplete } = createMockProvider('yandex', 'Yandex');
            zAiComplete.mockRejectedValue(new ProviderUnavailableError('Connection refused', 'z-ai'));
            yandexComplete.mockResolvedValue(createSuccessResponse('yandex'));
            const chain = new ProviderChain([zAi, yandex], { logger });
            const response = await chain.execute(defaultRequest);
            expect(response.provider).toBe('yandex');
            expect(zAiComplete).toHaveBeenCalledTimes(1);
            expect(yandexComplete).toHaveBeenCalledTimes(1);
            // Verify failover was logged
            expect(logger.warn).toHaveBeenCalledWith(expect.objectContaining({
                event: 'provider_chain.failover',
                provider: 'z-ai',
                errorType: 'ProviderUnavailableError',
            }), expect.any(String));
        });
    });
    // -- TT-002-72: All cloud down -> Ollama ---------------------------------
    describe('TT-002-72: failover to last provider', () => {
        it('should fall back to Ollama when all cloud providers are down', async () => {
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
            const chain = new ProviderChain([zAi, yandex, anthropic, openai, ollama], { logger });
            const response = await chain.execute(defaultRequest);
            expect(response.provider).toBe('ollama');
            expect(ollamaComplete).toHaveBeenCalledTimes(1);
        });
    });
    // -- TT-002-73: All providers down -> ProviderError -----------------------
    describe('TT-002-73: all providers failed', () => {
        it('should throw ProviderError with diagnostic info when all providers fail', async () => {
            const { provider: zAi, complete: zAiComplete } = createMockProvider('z-ai', 'Z.ai');
            const { provider: yandex, complete: yandexComplete } = createMockProvider('yandex', 'Yandex');
            zAiComplete.mockRejectedValue(new ProviderUnavailableError('Down', 'z-ai'));
            yandexComplete.mockRejectedValue(new ProviderUnavailableError('Down', 'yandex'));
            const chain = new ProviderChain([zAi, yandex], { logger });
            await expect(chain.execute(defaultRequest)).rejects.toThrow('All 2 provider(s) failed');
        });
        it('should include individual error details in the error', async () => {
            const { provider: p1, complete: c1 } = createMockProvider('p1', 'P1');
            const { provider: p2, complete: c2 } = createMockProvider('p2', 'P2');
            c1.mockRejectedValue(new RateLimitError('429', 'p1'));
            c2.mockRejectedValue(new ProviderUnavailableError('503', 'p2'));
            const chain = new ProviderChain([p1, p2], { logger });
            try {
                await chain.execute(defaultRequest);
                expect.fail('Should have thrown');
            }
            catch (error) {
                const providerError = error;
                expect(providerError.message).toContain('p1');
                expect(providerError.message).toContain('p2');
                expect(providerError.message).toContain('RateLimitError');
                expect(providerError.message).toContain('ProviderUnavailableError');
            }
        });
    });
    // -- TT-002-74: 429 -> auth rotation --------------------------------------
    describe('TT-002-74: rate limit auth rotation', () => {
        it('should handle rate limit with auth rotation via authKeys config', async () => {
            const { provider: zAi, complete } = createMockProvider('z-ai', 'Z.ai');
            const { provider: yandex } = createMockProvider('yandex', 'Yandex');
            // First call fails with 429, but we expect the chain to fall back
            // to the next provider since auth rotation is handled at the provider level
            complete.mockRejectedValue(new RateLimitError('Rate limit', 'z-ai', { retryAfterMs: 1000 }));
            const { provider: yandex2, complete: yandexComplete } = createMockProvider('yandex', 'Yandex');
            yandexComplete.mockResolvedValue(createSuccessResponse('yandex'));
            const chain = new ProviderChain([zAi, yandex2], { logger, authKeys: { 'z-ai': ['key1', 'key2'] } });
            const response = await chain.execute(defaultRequest);
            // Since auth rotation is in the AuthRotator, and the provider itself
            // doesn't use it internally (the provider wraps its own key), the chain
            // will catch RateLimitError and move to next provider
            expect(response.provider).toBe('yandex');
        });
    });
    // -- TT-002-75: 429 on all keys -> next provider --------------------------
    describe('TT-002-75: exhausted auth keys -> next provider', () => {
        it('should fall back to next provider when current provider returns rate limit', async () => {
            const { provider: zAi, complete: zAiComplete } = createMockProvider('z-ai', 'Z.ai');
            const { provider: yandex, complete: yandexComplete } = createMockProvider('yandex', 'Yandex');
            zAiComplete.mockRejectedValue(new RateLimitError('Rate limit exceeded', 'z-ai', { retryAfterMs: 2000 }));
            yandexComplete.mockResolvedValue(createSuccessResponse('yandex'));
            const chain = new ProviderChain([zAi, yandex], { logger });
            const response = await chain.execute(defaultRequest);
            expect(response.provider).toBe('yandex');
            expect(zAiComplete).toHaveBeenCalledTimes(1);
            expect(yandexComplete).toHaveBeenCalledTimes(1);
        });
    });
    // -- TT-002-76: Circuit breaker OPEN -> skip ------------------------------
    describe('TT-002-76: circuit breaker skip', () => {
        it('should skip provider with open circuit breaker', async () => {
            const { provider: zAi, complete: zAiComplete } = createMockProvider('z-ai', 'Z.ai');
            const { provider: yandex, complete: yandexComplete } = createMockProvider('yandex', 'Yandex');
            yandexComplete.mockResolvedValue(createSuccessResponse('yandex'));
            const chain = new ProviderChain([zAi, yandex], { logger });
            // Open the circuit breaker for Z.ai by causing 5 failures
            zAiComplete.mockRejectedValue(new ProviderUnavailableError('Down', 'z-ai'));
            // Generate 5 failures to open the circuit breaker
            for (let i = 0; i < 5; i++) {
                try {
                    await chain.execute(defaultRequest);
                }
                catch {
                    // expected
                }
            }
            // Now the circuit breaker should be open
            expect(chain.getCircuitBreaker('z-ai')?.getState()).toBe('open');
            // Reset Yandex mock for the next call
            yandexComplete.mockClear();
            yandexComplete.mockResolvedValue(createSuccessResponse('yandex'));
            // Next call should skip Z.ai and go directly to Yandex
            const response = await chain.execute(defaultRequest);
            expect(response.provider).toBe('yandex');
            expect(zAiComplete).toHaveBeenCalledTimes(5); // No additional calls
            expect(yandexComplete).toHaveBeenCalledTimes(1);
            // Verify skip was logged
            expect(logger.info).toHaveBeenCalledWith(expect.objectContaining({
                event: 'provider_chain.skip',
                provider: 'z-ai',
                reason: 'circuit_breaker_open',
            }), expect.any(String));
        });
    });
    // -- TT-002-77: getStatus() -----------------------------------------------
    describe('TT-002-77: getStatus()', () => {
        it('should return status of all providers', () => {
            const { provider: zAi } = createMockProvider('z-ai', 'Z.ai');
            const { provider: yandex } = createMockProvider('yandex', 'Yandex');
            const { provider: anthropic } = createMockProvider('anthropic', 'Anthropic');
            const { provider: openai } = createMockProvider('openai', 'OpenAI');
            const { provider: ollama } = createMockProvider('ollama', 'Ollama');
            const chain = new ProviderChain([zAi, yandex, anthropic, openai, ollama], { logger });
            const statuses = chain.getStatus();
            expect(statuses).toHaveLength(5);
            expect(statuses[0]).toEqual({
                providerId: 'z-ai',
                providerName: 'Z.ai',
                status: ProviderStatus.Available,
                circuitState: 'closed',
                failureCount: 0,
            });
            expect(statuses[1]).toEqual({
                providerId: 'yandex',
                providerName: 'Yandex',
                status: ProviderStatus.Available,
                circuitState: 'closed',
                failureCount: 0,
            });
            expect(statuses[4]).toEqual({
                providerId: 'ollama',
                providerName: 'Ollama',
                status: ProviderStatus.Available,
                circuitState: 'closed',
                failureCount: 0,
            });
        });
        it('should reflect circuit breaker state in status', async () => {
            const { provider: p1, complete: c1 } = createMockProvider('p1', 'P1');
            const { provider: p2 } = createMockProvider('p2', 'P2');
            c1.mockRejectedValue(new ProviderUnavailableError('Down', 'p1'));
            const chain = new ProviderChain([p1, p2], { logger });
            // Generate enough failures to open the circuit breaker
            for (let i = 0; i < 5; i++) {
                try {
                    await chain.execute(defaultRequest);
                }
                catch {
                    // expected
                }
            }
            const statuses = chain.getStatus();
            expect(statuses[0].status).toBe(ProviderStatus.Unavailable);
            expect(statuses[0].circuitState).toBe('open');
        });
    });
    // -- TT-002-78: Failover event logging ------------------------------------
    describe('TT-002-78: failover event logging', () => {
        it('should log failover events via pino', async () => {
            const { provider: zAi, complete: zAiComplete } = createMockProvider('z-ai', 'Z.ai');
            const { provider: yandex, complete: yandexComplete } = createMockProvider('yandex', 'Yandex');
            zAiComplete.mockRejectedValue(new ProviderUnavailableError('Down', 'z-ai'));
            yandexComplete.mockResolvedValue(createSuccessResponse('yandex'));
            const chain = new ProviderChain([zAi, yandex], { logger });
            await chain.execute(defaultRequest);
            // Verify attempt was logged
            expect(logger.debug).toHaveBeenCalledWith(expect.objectContaining({
                event: 'provider_chain.attempt',
                provider: 'z-ai',
            }), expect.any(String));
            // Verify failover was logged
            expect(logger.warn).toHaveBeenCalledWith(expect.objectContaining({
                event: 'provider_chain.failover',
                provider: 'z-ai',
            }), expect.any(String));
            // Verify success was logged
            expect(logger.info).toHaveBeenCalledWith(expect.objectContaining({
                event: 'provider_chain.success',
                provider: 'yandex',
            }), expect.any(String));
        });
    });
    // -- Streaming Tests ------------------------------------------------------
    describe('executeStream()', () => {
        it('should stream from the first available provider', async () => {
            const { provider: zAi, stream: zAiStream } = createMockProvider('z-ai', 'Z.ai');
            const { provider: yandex } = createMockProvider('yandex', 'Yandex');
            const chunks = [
                createMockChunk('z-ai', 'Hello '),
                createMockChunk('z-ai', 'World'),
                createMockChunk('z-ai', '[DONE]'),
            ];
            zAiStream.mockReturnValue(createAsyncIterable(chunks));
            const chain = new ProviderChain([zAi, yandex], { logger });
            const collected = [];
            for await (const chunk of chain.executeStream(defaultRequest)) {
                collected.push(chunk);
            }
            expect(collected).toHaveLength(3);
            expect(collected[0].content).toBe('Hello ');
            expect(collected[1].content).toBe('World');
        });
        it('should fall back on stream error', async () => {
            const { provider: zAi, stream: zAiStream } = createMockProvider('z-ai', 'Z.ai');
            const { provider: yandex, stream: yandexStream } = createMockProvider('yandex', 'Yandex');
            zAiStream.mockImplementation(() => {
                throw new ProviderUnavailableError('Down', 'z-ai');
            });
            const chunks = [
                createMockChunk('yandex', 'Fallback'),
            ];
            yandexStream.mockReturnValue(createAsyncIterable(chunks));
            const chain = new ProviderChain([zAi, yandex], { logger });
            const collected = [];
            for await (const chunk of chain.executeStream(defaultRequest)) {
                collected.push(chunk);
            }
            expect(collected).toHaveLength(1);
            expect(collected[0].provider).toBe('yandex');
        });
        it('should throw when all providers fail for streaming', async () => {
            const { provider: zAi, stream: zAiStream } = createMockProvider('z-ai', 'Z.ai');
            const { provider: yandex, stream: yandexStream } = createMockProvider('yandex', 'Yandex');
            zAiStream.mockImplementation(() => {
                throw new ProviderUnavailableError('Down', 'z-ai');
            });
            yandexStream.mockImplementation(() => {
                throw new ProviderUnavailableError('Down', 'yandex');
            });
            const chain = new ProviderChain([zAi, yandex], { logger });
            const collected = [];
            try {
                for await (const chunk of chain.executeStream(defaultRequest)) {
                    collected.push(chunk);
                }
                expect.fail('Should have thrown');
            }
            catch (error) {
                expect(error.message).toContain('All 2 provider(s) failed');
            }
            expect(collected).toHaveLength(0);
        });
    });
    // -- getActiveProvider() --------------------------------------------------
    describe('getActiveProvider()', () => {
        it('should return the first provider when all are available', () => {
            const { provider: zAi } = createMockProvider('z-ai', 'Z.ai');
            const { provider: yandex } = createMockProvider('yandex', 'Yandex');
            const chain = new ProviderChain([zAi, yandex], { logger });
            expect(chain.getActiveProvider()?.id).toBe('z-ai');
        });
        it('should return null when all circuit breakers are open', async () => {
            const { provider: p1, complete: c1 } = createMockProvider('p1', 'P1');
            const { provider: p2, complete: c2 } = createMockProvider('p2', 'P2');
            c1.mockRejectedValue(new ProviderUnavailableError('Down', 'p1'));
            c2.mockRejectedValue(new ProviderUnavailableError('Down', 'p2'));
            const chain = new ProviderChain([p1, p2], { logger });
            // Generate failures for both providers
            for (let i = 0; i < 5; i++) {
                try {
                    await chain.execute(defaultRequest);
                }
                catch { /* expected */ }
            }
            expect(chain.getActiveProvider()).toBeNull();
        });
    });
    // -- Circuit Breaker Integration ------------------------------------------
    describe('circuit breaker integration', () => {
        it('should record failures in circuit breaker on provider error', async () => {
            const { provider: p1, complete: c1 } = createMockProvider('p1', 'P1');
            const { provider: p2, complete: c2 } = createMockProvider('p2', 'P2');
            c1.mockRejectedValue(new ProviderUnavailableError('Down', 'p1'));
            c2.mockResolvedValue(createSuccessResponse('p2'));
            const chain = new ProviderChain([p1, p2], { logger });
            await chain.execute(defaultRequest);
            const cb = chain.getCircuitBreaker('p1');
            expect(cb).toBeDefined();
            expect(cb?.getStats().failureCount).toBe(1);
        });
        it('should reset failure count on success', async () => {
            const { provider: p1, complete: c1 } = createMockProvider('p1', 'P1');
            const chain = new ProviderChain([p1], { logger });
            // 2 failures
            c1.mockRejectedValue(new ProviderUnavailableError('Down', 'p1'));
            try {
                await chain.execute(defaultRequest);
            }
            catch { /* expected */ }
            try {
                await chain.execute(defaultRequest);
            }
            catch { /* expected */ }
            // 1 success -- resets counter
            c1.mockResolvedValue(createSuccessResponse('p1'));
            await chain.execute(defaultRequest);
            const cb = chain.getCircuitBreaker('p1');
            expect(cb?.getStats().failureCount).toBe(0);
            expect(cb?.getStats().successCount).toBe(1);
        });
        it('should open circuit after threshold failures', async () => {
            const { provider: p1, complete: c1 } = createMockProvider('p1', 'P1');
            c1.mockRejectedValue(new ProviderUnavailableError('Down', 'p1'));
            const chain = new ProviderChain([p1], { logger });
            // Generate 5 failures
            for (let i = 0; i < 5; i++) {
                try {
                    await chain.execute(defaultRequest);
                }
                catch { /* expected */ }
            }
            expect(chain.getCircuitBreaker('p1')?.getState()).toBe('open');
        });
    });
    // -- Reset ----------------------------------------------------------------
    describe('resetAll()', () => {
        it('should reset all circuit breakers', async () => {
            const { provider: p1, complete: c1 } = createMockProvider('p1', 'P1');
            const { provider: p2, complete: c2 } = createMockProvider('p2', 'P2');
            c1.mockRejectedValue(new ProviderUnavailableError('Down', 'p1'));
            c2.mockRejectedValue(new ProviderUnavailableError('Down', 'p2'));
            const chain = new ProviderChain([p1, p2], { logger });
            // Open both circuit breakers
            for (let i = 0; i < 5; i++) {
                try {
                    await chain.execute(defaultRequest);
                }
                catch { /* expected */ }
            }
            expect(chain.getCircuitBreaker('p1')?.getState()).toBe('open');
            expect(chain.getCircuitBreaker('p2')?.getState()).toBe('open');
            // Reset
            chain.resetAll();
            expect(chain.getCircuitBreaker('p1')?.getState()).toBe('closed');
            expect(chain.getCircuitBreaker('p2')?.getState()).toBe('closed');
        });
    });
    describe('resetProvider()', () => {
        it('should reset a specific provider circuit breaker', async () => {
            const { provider: p1, complete: c1 } = createMockProvider('p1', 'P1');
            const { provider: p2 } = createMockProvider('p2', 'P2');
            c1.mockRejectedValue(new ProviderUnavailableError('Down', 'p1'));
            const chain = new ProviderChain([p1, p2], { logger });
            for (let i = 0; i < 5; i++) {
                try {
                    await chain.execute(defaultRequest);
                }
                catch { /* expected */ }
            }
            chain.resetProvider('p1');
            expect(chain.getCircuitBreaker('p1')?.getState()).toBe('closed');
        });
    });
    // -- Properties -----------------------------------------------------------
    describe('properties', () => {
        it('should expose providers array', () => {
            const { provider: p1 } = createMockProvider('p1', 'P1');
            const { provider: p2 } = createMockProvider('p2', 'P2');
            const chain = new ProviderChain([p1, p2], { logger });
            expect(chain.providers).toHaveLength(2);
            expect(chain.providers[0].id).toBe('p1');
            expect(chain.providers[1].id).toBe('p2');
        });
        it('should expose length', () => {
            const { provider: p1 } = createMockProvider('p1', 'P1');
            const { provider: p2 } = createMockProvider('p2', 'P2');
            const { provider: p3 } = createMockProvider('p3', 'P3');
            const chain = new ProviderChain([p1, p2, p3], { logger });
            expect(chain.length).toBe(3);
        });
        it('should handle empty provider list', async () => {
            const chain = new ProviderChain([], { logger });
            expect(chain.length).toBe(0);
            expect(chain.getActiveProvider()).toBeNull();
            await expect(chain.execute(defaultRequest)).rejects.toThrow('All 0 provider(s) failed');
        });
    });
    // -- Timeout ---------------------------------------------------------------
    describe('timeout', () => {
        it('should timeout slow provider calls', async () => {
            const { provider: p1, complete: c1 } = createMockProvider('p1', 'P1');
            const { provider: p2, complete: c2 } = createMockProvider('p2', 'P2');
            c1.mockImplementation(() => new Promise((resolve) => setTimeout(resolve, 5000)));
            c2.mockResolvedValue(createSuccessResponse('p2'));
            const chain = new ProviderChain([p1, p2], {
                logger,
                callTimeoutMs: 100,
            });
            const response = await chain.execute(defaultRequest);
            expect(response.provider).toBe('p2');
        }, 15000);
    });
    // -- Config options --------------------------------------------------------
    describe('config options', () => {
        it('should accept custom circuit breaker config', async () => {
            const { provider: p1, complete: c1 } = createMockProvider('p1', 'P1');
            const { provider: p2 } = createMockProvider('p2', 'P2');
            c1.mockRejectedValue(new ProviderUnavailableError('Down', 'p1'));
            const chain = new ProviderChain([p1, p2], {
                logger,
                circuitBreaker: { failureThreshold: 2, resetTimeoutMs: 1000 },
            });
            // Only 2 failures needed to open circuit
            try {
                await chain.execute(defaultRequest);
            }
            catch { /* expected */ }
            try {
                await chain.execute(defaultRequest);
            }
            catch { /* expected */ }
            expect(chain.getCircuitBreaker('p1')?.getState()).toBe('open');
        });
        it('should work without a logger (noop)', async () => {
            const { provider: p1, complete: c1 } = createMockProvider('p1', 'P1');
            c1.mockResolvedValue(createSuccessResponse('p1'));
            const chain = new ProviderChain([p1]); // No logger
            const response = await chain.execute(defaultRequest);
            expect(response.provider).toBe('p1');
        });
    });
    // -- dispose ---------------------------------------------------------------
    describe('dispose()', () => {
        it('should not throw on dispose', () => {
            const { provider: p1 } = createMockProvider('p1', 'P1');
            const chain = new ProviderChain([p1], { logger });
            expect(() => chain.dispose()).not.toThrow();
        });
    });
    // -- Non-ProviderError wrapping -------------------------------------------
    describe('error wrapping', () => {
        it('should wrap non-ProviderError errors in ProviderError', async () => {
            const { provider: p1, complete: c1 } = createMockProvider('p1', 'P1');
            c1.mockRejectedValue(new TypeError('Unexpected type error'));
            const chain = new ProviderChain([p1], { logger });
            await expect(chain.execute(defaultRequest)).rejects.toThrow('All 1 provider(s) failed');
        });
    });
});
//# sourceMappingURL=provider-chain.test.js.map