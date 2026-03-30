/**
 * RateLimiter -- Unit Tests
 * Task T-006, Feature F-012, Domain DOMAIN-006
 *
 * Test Cases:
 * TC-006-6: Rate limiter -- within limit => allowed
 * TC-006-7: Rate limiter -- exceeds limit => blocked, retry_after in response
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RateLimiter, DEFAULT_RATE_LIMITER_CONFIG } from '../RateLimiter.js';
// ---- Helpers ----
function createLimiter(config) {
    return new RateLimiter(config);
}
// ---- Tests ----
describe('RateLimiter', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });
    afterEach(() => {
        vi.useRealTimers();
    });
    describe('constructor', () => {
        it('uses default config when no config provided', () => {
            const limiter = createLimiter();
            const config = limiter.getConfig();
            expect(config.maxRequests).toBe(DEFAULT_RATE_LIMITER_CONFIG.maxRequests);
            expect(config.windowMs).toBe(DEFAULT_RATE_LIMITER_CONFIG.windowMs);
        });
        it('accepts custom config', () => {
            const limiter = createLimiter({
                maxRequests: 10,
                windowMs: 30_000,
            });
            const config = limiter.getConfig();
            expect(config.maxRequests).toBe(10);
            expect(config.windowMs).toBe(30_000);
        });
        it('accepts partial config', () => {
            const limiter = createLimiter({ maxRequests: 50 });
            const config = limiter.getConfig();
            expect(config.maxRequests).toBe(50);
            expect(config.windowMs).toBe(DEFAULT_RATE_LIMITER_CONFIG.windowMs);
        });
    });
    describe('check', () => {
        it('TC-006-6: allows requests within the limit', () => {
            const limiter = createLimiter({
                maxRequests: 3,
                windowMs: 60_000,
            });
            const r1 = limiter.check('user_1');
            expect(r1.allowed).toBe(true);
            expect(r1.remaining).toBe(2);
            expect(r1.totalRequests).toBe(1);
            const r2 = limiter.check('user_1');
            expect(r2.allowed).toBe(true);
            expect(r2.remaining).toBe(1);
            expect(r2.totalRequests).toBe(2);
            const r3 = limiter.check('user_1');
            expect(r3.allowed).toBe(true);
            expect(r3.remaining).toBe(0);
            expect(r3.totalRequests).toBe(3);
        });
        it('TC-006-7: blocks requests that exceed the limit', () => {
            const limiter = createLimiter({
                maxRequests: 2,
                windowMs: 60_000,
            });
            limiter.check('user_1');
            limiter.check('user_1');
            const result = limiter.check('user_1');
            expect(result.allowed).toBe(false);
            expect(result.remaining).toBe(0);
            expect(result.totalRequests).toBe(2);
            expect(result.retryAfterMs).toBeDefined();
            expect(result.retryAfterMs).toBeGreaterThan(0);
        });
        it('TC-006-7b: retryAfterMs is approximately the remaining window time', () => {
            const limiter = createLimiter({
                maxRequests: 1,
                windowMs: 60_000,
            });
            limiter.check('user_1');
            // Advance time by 30 seconds
            vi.advanceTimersByTime(30_000);
            const result = limiter.check('user_1');
            expect(result.allowed).toBe(false);
            // Should be approximately 30 seconds remaining
            expect(result.retryAfterMs).toBeLessThanOrEqual(30_000);
            expect(result.retryAfterMs).toBeGreaterThan(29_000);
        });
        it('resets count after window expires', () => {
            const limiter = createLimiter({
                maxRequests: 2,
                windowMs: 60_000,
            });
            // Use up all requests
            limiter.check('user_1');
            limiter.check('user_1');
            // Confirm blocked
            const blocked = limiter.check('user_1');
            expect(blocked.allowed).toBe(false);
            // Advance past the window
            vi.advanceTimersByTime(61_000);
            // Should be allowed again
            const result = limiter.check('user_1');
            expect(result.allowed).toBe(true);
            expect(result.remaining).toBe(1);
            expect(result.totalRequests).toBe(1);
        });
        it('tracks different keys independently', () => {
            const limiter = createLimiter({
                maxRequests: 1,
                windowMs: 60_000,
            });
            const r1 = limiter.check('user_a');
            expect(r1.allowed).toBe(true);
            const r2 = limiter.check('user_a');
            expect(r2.allowed).toBe(false);
            // Different user should still be allowed
            const r3 = limiter.check('user_b');
            expect(r3.allowed).toBe(true);
        });
        it('works with default config (30 req/min)', () => {
            const limiter = createLimiter();
            // All 30 requests should succeed
            for (let i = 0; i < 30; i++) {
                const result = limiter.check('test_user');
                expect(result.allowed).toBe(true);
            }
            // 31st request should be blocked
            const blocked = limiter.check('test_user');
            expect(blocked.allowed).toBe(false);
            expect(blocked.totalRequests).toBe(30);
        });
    });
    describe('reset', () => {
        it('resets rate limit for a specific key', () => {
            const limiter = createLimiter({
                maxRequests: 1,
                windowMs: 60_000,
            });
            limiter.check('user_1');
            expect(limiter.check('user_1').allowed).toBe(false);
            limiter.reset('user_1');
            const result = limiter.check('user_1');
            expect(result.allowed).toBe(true);
        });
        it('does not affect other keys', () => {
            const limiter = createLimiter({
                maxRequests: 1,
                windowMs: 60_000,
            });
            limiter.check('user_a');
            limiter.check('user_b');
            limiter.reset('user_a');
            // user_a should be allowed again
            expect(limiter.check('user_a').allowed).toBe(true);
            // user_b should still be blocked
            expect(limiter.check('user_b').allowed).toBe(false);
        });
    });
    describe('resetAll', () => {
        it('resets all buckets', () => {
            const limiter = createLimiter({
                maxRequests: 1,
                windowMs: 60_000,
            });
            limiter.check('a');
            limiter.check('b');
            limiter.check('c');
            expect(limiter.getBucketCount()).toBe(3);
            limiter.resetAll();
            expect(limiter.getBucketCount()).toBe(0);
            expect(limiter.check('a').allowed).toBe(true);
        });
    });
    describe('getBucketCount', () => {
        it('returns 0 for empty limiter', () => {
            expect(createLimiter().getBucketCount()).toBe(0);
        });
        it('returns correct count of tracked keys', () => {
            const limiter = createLimiter();
            limiter.check('k1');
            limiter.check('k2');
            limiter.check('k1'); // same key, count stays same
            expect(limiter.getBucketCount()).toBe(2);
        });
    });
});
//# sourceMappingURL=RateLimiter.test.js.map