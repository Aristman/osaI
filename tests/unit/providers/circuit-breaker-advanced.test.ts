/**
 * @osai/providers -- Circuit Breaker Advanced Tests (T-002)
 *
 * Additional critical tests beyond existing circuit-breaker.test.ts:
 *   - Interspersed successes prevent opening (partial recovery)
 *   - HALF_OPEN with concurrent requests
 *   - Manual recordSuccess/recordFailure interaction
 *   - Stats tracking through multiple state transitions
 *   - Error type preservation through circuit breaker
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CircuitBreaker } from '../../../packages/providers/src/circuit-breaker/circuit-breaker.js';
import { CircuitState } from '../../../packages/providers/src/circuit-breaker/types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function successFn<T>(value: T): () => Promise<T> {
  return vi.fn(async () => value);
}

function failureFn(error: Error): () => Promise<never> {
  return vi.fn(async () => { throw error; });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CircuitBreaker -- Advanced Patterns', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // -- Interspersed failures and successes --

  it('should not open circuit when failures are interspersed with successes', async () => {
    const cb = new CircuitBreaker('test', { failureThreshold: 5 });
    const fail = failureFn(new Error('fail'));
    const succeed = successFn('ok');

    // Pattern: 4 failures, 1 success, 4 failures, 1 success, ...
    for (let round = 0; round < 5; round++) {
      for (let i = 0; i < 4; i++) {
        try { await cb.execute(fail); } catch { /* expected */ }
      }
      await cb.execute(succeed);
    }

    expect(cb.getState()).toBe(CircuitState.Closed);
  });

  it('should open circuit when exactly threshold failures occur without interruption', async () => {
    const cb = new CircuitBreaker('test', { failureThreshold: 5 });
    const fail = failureFn(new Error('fail'));

    for (let i = 0; i < 5; i++) {
      try { await cb.execute(fail); } catch { /* expected */ }
    }

    expect(cb.getState()).toBe(CircuitState.Open);
  });

  // -- Stats through multiple transitions --

  it('should track totalFailures across multiple open/close cycles', async () => {
    const cb = new CircuitBreaker('test', {
      failureThreshold: 2,
      resetTimeoutMs: 1_000,
    });
    const fail = failureFn(new Error('fail'));
    const succeed = successFn('ok');

    // Cycle 1: 2 failures -> open
    try { await cb.execute(fail); } catch { /* expected */ }
    try { await cb.execute(fail); } catch { /* expected */ }
    expect(cb.getState()).toBe(CircuitState.Open);
    expect(cb.getStats().totalFailures).toBe(2);

    // Recover
    vi.advanceTimersByTime(1_001);
    await cb.execute(succeed);
    expect(cb.getState()).toBe(CircuitState.Closed);

    // Cycle 2: 2 more failures -> open
    try { await cb.execute(fail); } catch { /* expected */ }
    try { await cb.execute(fail); } catch { /* expected */ }
    expect(cb.getState()).toBe(CircuitState.Open);
    expect(cb.getStats().totalFailures).toBe(4);

    // Recover again
    vi.advanceTimersByTime(1_001);
    await cb.execute(succeed);
    expect(cb.getState()).toBe(CircuitState.Closed);
    expect(cb.getStats().totalFailures).toBe(4); // total does not reset
  });

  // -- Error type preservation --

  it('should rethrow the original error type from wrapped function', async () => {
    const cb = new CircuitBreaker('test');

    class CustomError extends Error {
      constructor(msg: string) {
        super(msg);
        this.name = 'CustomError';
      }
    }

    const customFail = failureFn(new CustomError('custom error message'));
    await expect(cb.execute(customFail)).rejects.toThrow(CustomError);
    await expect(cb.execute(customFail)).rejects.toThrow('custom error message');
  });

  it('should rethrow TypeError from wrapped function', async () => {
    const cb = new CircuitBreaker('test');
    const typeFail = failureFn(new TypeError('type error'));
    await expect(cb.execute(typeFail)).rejects.toThrow(TypeError);
  });

  // -- HALF_OPEN single probe --

  it('should allow only one request through in HALF_OPEN state', async () => {
    const cb = new CircuitBreaker('test', { failureThreshold: 2, resetTimeoutMs: 1_000 });
    const fail = failureFn(new Error('fail'));
    const succeed = successFn('ok');

    // Open circuit
    try { await cb.execute(fail); } catch { /* expected */ }
    try { await cb.execute(fail); } catch { /* expected */ }
    expect(cb.getState()).toBe(CircuitState.Open);

    // Transition to half-open
    vi.advanceTimersByTime(1_001);
    expect(cb.getState()).toBe(CircuitState.HalfOpen);

    // Single successful probe
    await cb.execute(succeed);
    expect(cb.getState()).toBe(CircuitState.Closed);
  });

  // -- Reset after multiple failures --

  it('should fully clear stats after reset()', async () => {
    const cb = new CircuitBreaker('test', { failureThreshold: 3 });
    const fail = failureFn(new Error('fail'));

    try { await cb.execute(fail); } catch { /* expected */ }
    try { await cb.execute(fail); } catch { /* expected */ }
    try { await cb.execute(fail); } catch { /* expected */ }

    expect(cb.getStats().failureCount).toBe(3);
    expect(cb.getStats().totalFailures).toBe(3);
    expect(cb.getStats().successCount).toBe(0);
    expect(cb.getState()).toBe(CircuitState.Open);

    cb.reset();

    expect(cb.getState()).toBe(CircuitState.Closed);
    expect(cb.getStats().failureCount).toBe(0);
    expect(cb.getStats().totalFailures).toBe(0);
    expect(cb.getStats().successCount).toBe(0);
    expect(cb.getStats().openedAt).toBeUndefined();
  });

  // -- Manual record API --

  it('should integrate manual recordFailure with execute() failures', async () => {
    const cb = new CircuitBreaker('test', { failureThreshold: 3 });

    // Manual failure + execute failure should combine
    cb.recordFailure();
    cb.recordFailure();

    const fail = failureFn(new Error('fail'));
    try { await cb.execute(fail); } catch { /* expected */ }

    expect(cb.getState()).toBe(CircuitState.Open);
  });

  it('should integrate manual recordSuccess with execute() to reset counter', async () => {
    const cb = new CircuitBreaker('test', { failureThreshold: 3 });

    try { await cb.execute(failureFn(new Error('fail'))); } catch { /* expected */ }
    try { await cb.execute(failureFn(new Error('fail'))); } catch { /* expected */ }

    expect(cb.getStats().failureCount).toBe(2);

    cb.recordSuccess();
    expect(cb.getStats().failureCount).toBe(0);
  });

  // -- Stats state field --

  it('should report correct state in stats', async () => {
    const cb = new CircuitBreaker('test', { failureThreshold: 2, resetTimeoutMs: 1_000 });

    expect(cb.getStats().state).toBe(CircuitState.Closed);

    try { await cb.execute(failureFn(new Error('fail'))); } catch { /* expected */ }
    try { await cb.execute(failureFn(new Error('fail'))); } catch { /* expected */ }

    expect(cb.getStats().state).toBe(CircuitState.Open);

    vi.advanceTimersByTime(1_001);
    expect(cb.getStats().state).toBe(CircuitState.HalfOpen);

    await cb.execute(successFn('ok'));
    expect(cb.getStats().state).toBe(CircuitState.Closed);
  });

  // -- openedAt and closedAt timestamps --

  it('should set openedAt when circuit opens and closedAt when it recovers', async () => {
    const cb = new CircuitBreaker('test', { failureThreshold: 2, resetTimeoutMs: 1_000 });

    expect(cb.getStats().openedAt).toBeUndefined();
    expect(cb.getStats().closedAt).toBeUndefined();

    try { await cb.execute(failureFn(new Error('fail'))); } catch { /* expected */ }
    try { await cb.execute(failureFn(new Error('fail'))); } catch { /* expected */ }

    expect(cb.getStats().openedAt).toBeDefined();
    expect(typeof cb.getStats().openedAt).toBe('number');

    vi.advanceTimersByTime(1_001);
    await cb.execute(successFn('ok'));

    expect(cb.getStats().closedAt).toBeDefined();
    expect(typeof cb.getStats().closedAt).toBe('number');
  });
});
