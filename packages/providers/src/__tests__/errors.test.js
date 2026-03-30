/**
 * Unit tests for Provider Error Hierarchy.
 * T-001: LLMProvider Interface + Types
 */
import { describe, it, expect } from 'vitest';
import { ProviderError, ProviderUnavailableError, RateLimitError, TokenLimitError, AuthError, CircuitBreakerOpenError, } from '../errors.js';
// ---------------------------------------------------------------------------
// ProviderError (base)
// ---------------------------------------------------------------------------
describe('ProviderError', () => {
    it('TT-002-02: should be an instance of Error', () => {
        const error = new ProviderError('test error', 'test-provider');
        expect(error).toBeInstanceOf(Error);
        expect(error).toBeInstanceOf(ProviderError);
    });
    it('should store providerId', () => {
        const error = new ProviderError('fail', 'z-ai');
        expect(error.providerId).toBe('z-ai');
    });
    it('should default statusCode to undefined', () => {
        const error = new ProviderError('fail', 'openai');
        expect(error.statusCode).toBeUndefined();
    });
    it('should accept optional statusCode', () => {
        const error = new ProviderError('server error', 'z-ai', { statusCode: 500 });
        expect(error.statusCode).toBe(500);
    });
    it('should accept optional cause', () => {
        const cause = new Error('network failure');
        const error = new ProviderError('wrapped', 'openai', { cause });
        expect(error.cause).toBe(cause);
    });
    it('should have correct name property', () => {
        const error = new ProviderError('test', 'p');
        expect(error.name).toBe('ProviderError');
    });
    it('should preserve message', () => {
        const error = new ProviderError('something went wrong', 'p');
        expect(error.message).toBe('something went wrong');
    });
});
// ---------------------------------------------------------------------------
// ProviderUnavailableError
// ---------------------------------------------------------------------------
describe('ProviderUnavailableError', () => {
    it('should extend ProviderError', () => {
        const error = new ProviderUnavailableError('down', 'z-ai');
        expect(error).toBeInstanceOf(ProviderError);
        expect(error).toBeInstanceOf(Error);
    });
    it('should have correct name', () => {
        const error = new ProviderUnavailableError('down', 'z-ai');
        expect(error.name).toBe('ProviderUnavailableError');
    });
    it('should carry statusCode from options', () => {
        const error = new ProviderUnavailableError('server error', 'z-ai', {
            statusCode: 503,
        });
        expect(error.statusCode).toBe(503);
    });
    it('should carry cause from options', () => {
        const cause = new Error('connection refused');
        const error = new ProviderUnavailableError('unreachable', 'ollama', {
            cause,
            statusCode: 0,
        });
        expect(error.cause).toBe(cause);
        expect(error.providerId).toBe('ollama');
    });
});
// ---------------------------------------------------------------------------
// RateLimitError
// ---------------------------------------------------------------------------
describe('RateLimitError', () => {
    it('TT-002-03: should extend ProviderError', () => {
        const error = new RateLimitError('too many requests', 'z-ai');
        expect(error).toBeInstanceOf(ProviderError);
        expect(error).toBeInstanceOf(Error);
        expect(error).toBeInstanceOf(RateLimitError);
    });
    it('should have correct name', () => {
        const error = new RateLimitError('rate limited', 'z-ai');
        expect(error.name).toBe('RateLimitError');
    });
    it('should always have statusCode 429', () => {
        const error = new RateLimitError('rate limited', 'z-ai');
        expect(error.statusCode).toBe(429);
    });
    it('should accept retryAfterMs', () => {
        const error = new RateLimitError('rate limited', 'z-ai', {
            retryAfterMs: 30000,
        });
        expect(error.retryAfterMs).toBe(30000);
    });
    it('should default retryAfterMs to undefined', () => {
        const error = new RateLimitError('rate limited', 'z-ai');
        expect(error.retryAfterMs).toBeUndefined();
    });
    it('should carry cause', () => {
        const cause = new Error('HTTP 429');
        const error = new RateLimitError('rate limited', 'z-ai', { cause });
        expect(error.cause).toBe(cause);
    });
});
// ---------------------------------------------------------------------------
// TokenLimitError
// ---------------------------------------------------------------------------
describe('TokenLimitError', () => {
    it('TT-002-04: should contain tokenCount', () => {
        const error = new TokenLimitError('token limit exceeded', 'z-ai', 8000, 4096);
        expect(error.tokenCount).toBe(8000);
        expect(error.maxTokens).toBe(4096);
    });
    it('should extend ProviderError', () => {
        const error = new TokenLimitError('limit', 'z-ai', 100, 50);
        expect(error).toBeInstanceOf(ProviderError);
        expect(error).toBeInstanceOf(Error);
    });
    it('should have correct name', () => {
        const error = new TokenLimitError('limit', 'z-ai', 100, 50);
        expect(error.name).toBe('TokenLimitError');
    });
    it('should have statusCode 400', () => {
        const error = new TokenLimitError('limit', 'z-ai', 100, 50);
        expect(error.statusCode).toBe(400);
    });
    it('should store providerId', () => {
        const error = new TokenLimitError('limit', 'anthropic', 100, 50);
        expect(error.providerId).toBe('anthropic');
    });
});
// ---------------------------------------------------------------------------
// AuthError
// ---------------------------------------------------------------------------
describe('AuthError', () => {
    it('should extend ProviderError', () => {
        const error = new AuthError('invalid api key', 'z-ai');
        expect(error).toBeInstanceOf(ProviderError);
        expect(error).toBeInstanceOf(Error);
    });
    it('should have correct name', () => {
        const error = new AuthError('invalid key', 'z-ai');
        expect(error.name).toBe('AuthError');
    });
    it('should default statusCode to 401', () => {
        const error = new AuthError('unauthorized', 'z-ai');
        expect(error.statusCode).toBe(401);
    });
    it('should accept statusCode 403', () => {
        const error = new AuthError('forbidden', 'z-ai', { statusCode: 403 });
        expect(error.statusCode).toBe(403);
    });
    it('should carry cause', () => {
        const cause = new Error('HTTP 401');
        const error = new AuthError('auth failed', 'openai', { cause });
        expect(error.cause).toBe(cause);
    });
});
// ---------------------------------------------------------------------------
// CircuitBreakerOpenError
// ---------------------------------------------------------------------------
describe('CircuitBreakerOpenError', () => {
    it('should extend ProviderError', () => {
        const error = new CircuitBreakerOpenError('z-ai');
        expect(error).toBeInstanceOf(ProviderError);
        expect(error).toBeInstanceOf(Error);
    });
    it('should have correct name', () => {
        const error = new CircuitBreakerOpenError('z-ai');
        expect(error.name).toBe('CircuitBreakerOpenError');
    });
    it('should contain providerId', () => {
        const error = new CircuitBreakerOpenError('yandex');
        expect(error.providerId).toBe('yandex');
    });
    it('should have a descriptive message', () => {
        const error = new CircuitBreakerOpenError('anthropic');
        expect(error.message).toContain('anthropic');
        expect(error.message.toLowerCase()).toContain('circuit breaker');
        expect(error.message).toContain('open');
    });
});
// ---------------------------------------------------------------------------
// Error hierarchy -- instanceof chain verification
// ---------------------------------------------------------------------------
describe('Error hierarchy chain', () => {
    it('all errors should be instanceof ProviderError and Error', () => {
        const errors = [
            new ProviderError('base', 'p'),
            new ProviderUnavailableError('unavail', 'p'),
            new RateLimitError('rate', 'p'),
            new TokenLimitError('token', 'p', 1, 1),
            new AuthError('auth', 'p'),
            new CircuitBreakerOpenError('p'),
        ];
        for (const error of errors) {
            expect(error).toBeInstanceOf(ProviderError);
            expect(error).toBeInstanceOf(Error);
            expect(error.providerId).toBe('p');
        }
    });
});
//# sourceMappingURL=errors.test.js.map