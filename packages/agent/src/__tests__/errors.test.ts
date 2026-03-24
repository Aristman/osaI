/**
 * @osai/agent -- Error Handling System tests
 *
 * Covers: error classification, retry logic, exponential backoff,
 * critical error hooks, error log, and clear log.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  AgentError,
  TransientError,
  PermanentError,
  CriticalError,
  ValidationError,
  TimeoutError,
  ContextOverflowError,
  ErrorHandler,
} from '../errors/index.js';
import type { IHookManager } from '../errors/index.js';
import type { HookContext } from '../types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a mock HookManager that captures on_error calls. */
function createMockHookManager() {
  const calls: Array<{ hookPoint: string; context: HookContext }> = [];
  const mock: IHookManager = {
    executeHooks: vi.fn(async (_hookPoint, context) => {
      calls.push({ hookPoint: _hookPoint, context });
      return context;
    }),
  };
  return { mock, calls };
}

/** Create an Error mimicking a Node.js network error. */
function makeNetworkError(message = 'ECONNREFUSED: connection refused') {
  const err = new Error(message);
  (err as NodeJS.ErrnoException).code = 'ECONNREFUSED';
  return err;
}

/** Create an Error mimicking an HTTP 401 auth error. */
function makeAuthError(message = 'Request failed with status 401') {
  const err = new Error(message) as Error & { statusCode: number };
  err.statusCode = 401;
  return err;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Error Handling System', () => {
  let handler: ErrorHandler;

  beforeEach(() => {
    handler = new ErrorHandler();
  });

  // -- 1. Classify network error -> TransientError ----------------------------------

  describe('classify', () => {
    it('classifies network error as TransientError', () => {
      const result = handler.classify(makeNetworkError());
      expect(result).toBeInstanceOf(TransientError);
      expect(result.retryable).toBe(true);
      expect(result.code).toBe('TRANSIENT');
    });

    // -- 2. Classify auth error -> PermanentError -----------------------------------

    it('classifies auth error (401) as PermanentError', () => {
      const result = handler.classify(makeAuthError());
      expect(result).toBeInstanceOf(PermanentError);
      expect(result.retryable).toBe(false);
      expect(result.code).toBe('PERMANENT');
    });

    it('classifies auth error (403) as PermanentError', () => {
      const err = new Error('Forbidden') as Error & { status: number };
      err.status = 403;
      const result = handler.classify(err);
      expect(result).toBeInstanceOf(PermanentError);
    });

    // -- 9. Classify unknown Error -> TransientError -------------------------------

    it('classifies unknown Error as TransientError', () => {
      const result = handler.classify(new Error('something went wrong'));
      expect(result).toBeInstanceOf(TransientError);
      expect(result.retryable).toBe(true);
    });

    // -- 10. Classify string error -> TransientError -------------------------------

    it('classifies string error as TransientError', () => {
      const result = handler.classify('raw error string');
      expect(result).toBeInstanceOf(TransientError);
      expect(result.message).toBe('raw error string');
    });

    it('classifies non-Error/non-string as TransientError', () => {
      const result = handler.classify(42);
      expect(result).toBeInstanceOf(TransientError);
      expect(result.message).toContain('Unknown error');
    });

    // -- Pass-through for AgentError subclasses -----------------------------------

    it('passes through existing AgentError without wrapping', () => {
      const original = new ValidationError('bad field', 'email');
      const result = handler.classify(original);
      expect(result).toBe(original);
    });

    it('passes through existing TransientError without wrapping', () => {
      const original = new TransientError('temp failure');
      const result = handler.classify(original);
      expect(result).toBe(original);
    });
  });

  // -- 3. Should retry transient error -------------------------------------------

  describe('shouldRetry', () => {
    it('should retry TransientError within limit', () => {
      const error = handler.classify(makeNetworkError());
      expect(handler.shouldRetry(error, 0)).toBe(true);
      expect(handler.shouldRetry(error, 1)).toBe(true);
      expect(handler.shouldRetry(error, 2)).toBe(true);
    });

    // -- 4. Should not retry permanent error --------------------------------------

    it('should not retry PermanentError', () => {
      const error = handler.classify(makeAuthError());
      expect(handler.shouldRetry(error, 0)).toBe(false);
    });

    it('should not retry CriticalError', () => {
      const error = new CriticalError('severe');
      expect(handler.shouldRetry(error, 0)).toBe(false);
    });

    // -- 13. shouldRetry respects max retries -------------------------------------

    it('shouldRetry respects max retries', () => {
      const customHandler = new ErrorHandler(2);
      const error = new TransientError('temp');
      expect(customHandler.shouldRetry(error, 0)).toBe(true);
      expect(customHandler.shouldRetry(error, 1)).toBe(true);
      expect(customHandler.shouldRetry(error, 2)).toBe(false);
    });
  });

  // -- 5. Exponential backoff: attempt 0=1s, 1=2s, 2=4s, 3=8s --------------------

  describe('getBackoffDelay', () => {
    it('produces exponential delays with jitter', () => {
      // With baseDelay=1000, delays should be roughly:
      //   0 -> ~1000, 1 -> ~2000, 2 -> ~4000, 3 -> ~8000
      for (const attempt of [0, 1, 2, 3]) {
        const baseExpected = 1000 * Math.pow(2, attempt);
        const actual = handler.getBackoffDelay(attempt, 1000);
        // Allow jitter of up to 200ms
        expect(actual).toBeGreaterThanOrEqual(baseExpected);
        expect(actual).toBeLessThanOrEqual(baseExpected + 200);
      }
    });

    // -- 6. Backoff capped at 30s -------------------------------------------------

    it('caps backoff at 30 seconds', () => {
      // Very high attempt count would exceed 30s without cap
      const delay = handler.getBackoffDelay(100, 1000);
      expect(delay).toBeLessThanOrEqual(30_000);
      // Should actually be 30_000 since 1000 * 2^100 >> 30_000
      expect(delay).toBe(30_000);
    });

    it('caps at 30s even with large base delay', () => {
      const delay = handler.getBackoffDelay(5, 10_000);
      expect(delay).toBeLessThanOrEqual(30_000);
    });

    it('uses custom base delay', () => {
      const delay = handler.getBackoffDelay(0, 500);
      expect(delay).toBeGreaterThanOrEqual(500);
      expect(delay).toBeLessThanOrEqual(700); // 500 + max jitter
    });
  });

  // -- 7. Critical error triggers on_error hook ---------------------------------

  describe('handle', () => {
    it('triggers on_error hook for critical errors', async () => {
      const { mock, calls } = createMockHookManager();
      handler.setHookManager(mock);

      await handler.handle(new CriticalError('critical failure'), 'session-1');

      expect(mock.executeHooks).toHaveBeenCalledOnce();
      expect(calls[0]!.hookPoint).toBe('on_error');
      expect(calls[0]!.context.sessionId).toBe('session-1');
      expect(calls[0]!.context.data.severity).toBe('critical');
    });

    it('does not trigger on_error hook for non-critical errors', async () => {
      const { mock } = createMockHookManager();
      handler.setHookManager(mock);

      await handler.handle(new TransientError('temp'), 'session-1');

      expect(mock.executeHooks).not.toHaveBeenCalled();
    });

    it('does not trigger hook when no sessionId provided', async () => {
      const { mock } = createMockHookManager();
      handler.setHookManager(mock);

      await handler.handle(new CriticalError('no session'));

      expect(mock.executeHooks).not.toHaveBeenCalled();
    });

    it('does not throw when hook execution fails', async () => {
      const failingMock: IHookManager = {
        executeHooks: vi.fn(async () => {
          throw new Error('hook failed');
        }),
      };
      handler.setHookManager(failingMock);

      await expect(
        handler.handle(new CriticalError('critical'), 'session-1'),
      ).resolves.not.toThrow();
    });
  });

  // -- 8. Error severity classification -----------------------------------------

  describe('error hierarchy', () => {
    it('has correct severity levels', () => {
      expect(new AgentError('msg', 'low').severity).toBe('low');
      expect(new AgentError('msg', 'medium').severity).toBe('medium');
      expect(new AgentError('msg', 'high').severity).toBe('high');
      expect(new AgentError('msg', 'critical').severity).toBe('critical');
    });

    it('TransientError has medium severity and is retryable', () => {
      const err = new TransientError('msg');
      expect(err.severity).toBe('medium');
      expect(err.retryable).toBe(true);
      expect(err.code).toBe('TRANSIENT');
      expect(err.name).toBe('TransientError');
    });

    it('PermanentError has high severity and is not retryable', () => {
      const err = new PermanentError('msg');
      expect(err.severity).toBe('high');
      expect(err.retryable).toBe(false);
      expect(err.code).toBe('PERMANENT');
    });

    it('CriticalError has critical severity and is not retryable', () => {
      const err = new CriticalError('msg');
      expect(err.severity).toBe('critical');
      expect(err.retryable).toBe(false);
      expect(err.code).toBe('CRITICAL');
    });

    it('ValidationError has low severity', () => {
      const err = new ValidationError('bad input', 'email');
      expect(err.severity).toBe('low');
      expect(err.field).toBe('email');
      expect(err.code).toBe('VALIDATION');
    });

    it('TimeoutError is retryable with correct properties', () => {
      const err = new TimeoutError('timed out', 5000);
      expect(err.severity).toBe('medium');
      expect(err.retryable).toBe(true);
      expect(err.timeoutMs).toBe(5000);
      expect(err.code).toBe('TIMEOUT');
    });

    it('ContextOverflowError has correct token info', () => {
      const err = new ContextOverflowError('overflow', 200_000, 180_000);
      expect(err.severity).toBe('high');
      expect(err.retryable).toBe(false);
      expect(err.currentTokens).toBe(200_000);
      expect(err.maxTokens).toBe(180_000);
      expect(err.code).toBe('CONTEXT_OVERFLOW');
    });

    it('error subclasses preserve cause chain', () => {
      const cause = new Error('root cause');
      const transient = new TransientError('wrapped', cause);
      expect(transient.cause).toBe(cause);

      const permanent = new PermanentError('wrapped', cause);
      expect(permanent.cause).toBe(cause);

      const critical = new CriticalError('wrapped', cause);
      expect(critical.cause).toBe(cause);
    });
  });

  // -- 11. Error log stores errors -----------------------------------------------

  describe('error log', () => {
    it('stores errors in error log', async () => {
      await handler.handle(new TransientError('err1'), 's1');
      await handler.handle(new PermanentError('err2'), 's2');

      const log = handler.getErrorLog();
      expect(log).toHaveLength(2);
      expect(log[0]!.error.message).toBe('err1');
      expect(log[0]!.context).toBe('s1');
      expect(log[1]!.error.message).toBe('err2');
      expect(log[1]!.context).toBe('s2');
    });

    it('stores timestamp', async () => {
      const before = new Date();
      await handler.handle(new AgentError('test'), 's1');
      const after = new Date();

      const log = handler.getErrorLog();
      expect(log[0]!.timestamp.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(log[0]!.timestamp.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    // -- 12. Clear log empties errors --------------------------------------------

    it('clear log empties errors', async () => {
      await handler.handle(new TransientError('err1'));
      await handler.handle(new PermanentError('err2'));
      expect(handler.getErrorLog()).toHaveLength(2);

      handler.clearLog();
      expect(handler.getErrorLog()).toHaveLength(0);
    });

    it('getErrorLog returns a copy (not internal reference)', async () => {
      await handler.handle(new TransientError('err1'));
      const log1 = handler.getErrorLog();
      const log2 = handler.getErrorLog();
      expect(log1).not.toBe(log2);
      expect(log1).toEqual(log2);
    });
  });
});
