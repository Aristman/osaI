/**
 * @osai/providers -- Circuit Breaker (DOMAIN-008)
 *
 * A generic, reusable circuit breaker implementing the state machine:
 *   CLOSED --[failures >= threshold]--> OPEN --[resetTimeout]--> HALF_OPEN --[success]--> CLOSED
 *                                                        HALF_OPEN --[failure]--> OPEN
 *
 * The circuit breaker protects external services (LLM providers, APIs, etc.)
 * from cascading failures by temporarily blocking requests to unhealthy services.
 *
 * Thread-safe within the Node.js event loop (single-threaded).
 */

import {
  CircuitState,
  type CircuitBreakerConfig,
  type CircuitBreakerStats,
} from './types.js';
import { CircuitBreakerOpenError } from '../errors.js';

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const DEFAULT_FAILURE_THRESHOLD = 5;
const DEFAULT_RESET_TIMEOUT_MS = 30_000;

// ---------------------------------------------------------------------------
// CircuitBreaker
// ---------------------------------------------------------------------------

/**
 * Generic circuit breaker for protecting external service calls.
 *
 * @typeParam T - Return type of the wrapped function.
 */
export class CircuitBreaker<T = unknown> {
  // -- Configuration ---------------------------------------------------------

  private readonly _failureThreshold: number;
  private readonly _resetTimeoutMs: number;
  private readonly _name: string;

  // -- State -----------------------------------------------------------------

  private _state: CircuitState = CircuitState.Closed;
  private _failureCount: number = 0;
  private _successCount: number = 0;
  private _totalFailures: number = 0;
  private _openedAt: number | undefined;
  private _closedAt: number | undefined;
  private _resetTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(name: string, config?: CircuitBreakerConfig) {
    this._name = name;
    this._failureThreshold = config?.failureThreshold ?? DEFAULT_FAILURE_THRESHOLD;
    this._resetTimeoutMs = config?.resetTimeoutMs ?? DEFAULT_RESET_TIMEOUT_MS;
  }

  // -- Public API -----------------------------------------------------------

  /**
   * Execute a function through the circuit breaker.
   *
   * If the circuit is OPEN, throws CircuitBreakerOpenError immediately.
   * If the circuit is CLOSED or HALF_OPEN, runs the function and records
   * success or failure.
   *
   * @param fn - The function to execute.
   * @returns The return value of the function.
   * @throws {CircuitBreakerOpenError} If the circuit is open.
   * @throws {Error} Any error thrown by the wrapped function.
   */
  async execute(fn: () => Promise<T>): Promise<T> {
    this._transitionIfExpired();

    if (this._state === CircuitState.Open) {
      throw new CircuitBreakerOpenError(this._name);
    }

    try {
      const result = await fn();
      this._recordSuccess();
      return result;
    } catch (error) {
      this._recordFailure();
      throw error;
    }
  }

  /**
   * Check whether the circuit breaker currently allows execution.
   */
  canExecute(): boolean {
    this._transitionIfExpired();
    return this._state !== CircuitState.Open;
  }

  /**
   * Get the current circuit state.
   */
  getState(): CircuitState {
    this._transitionIfExpired();
    return this._state;
  }

  /**
   * Manually reset the circuit breaker to CLOSED state.
   * Clears all counters and cancels any pending reset timer.
   */
  reset(): void {
    this._clearResetTimer();
    this._state = CircuitState.Closed;
    this._failureCount = 0;
    this._successCount = 0;
    this._totalFailures = 0;
    this._openedAt = undefined;
    this._closedAt = undefined;
  }

  /**
   * Get runtime statistics about the circuit breaker.
   */
  getStats(): CircuitBreakerStats {
    this._transitionIfExpired();
    return {
      state: this._state,
      failureCount: this._failureCount,
      successCount: this._successCount,
      totalFailures: this._totalFailures,
      openedAt: this._openedAt,
      closedAt: this._closedAt,
    };
  }

  /**
   * Manually record a success (for external success tracking).
   */
  recordSuccess(): void {
    this._recordSuccess();
  }

  /**
   * Manually record a failure (for external failure tracking).
   */
  recordFailure(): void {
    this._recordFailure();
  }

  // -- Lifecycle ------------------------------------------------------------

  /**
   * Clean up resources (cancel pending timers).
   * Should be called when the circuit breaker is no longer needed.
   */
  dispose(): void {
    this._clearResetTimer();
  }

  // -- Internal: State Transitions ------------------------------------------

  private _recordSuccess(): void {
    if (this._state === CircuitState.HalfOpen) {
      // Trial request succeeded -- close the circuit
      this._transitionTo(CircuitState.Closed);
    }

    // Reset consecutive failure counter on any success
    this._failureCount = 0;
    this._successCount++;
  }

  private _recordFailure(): void {
    this._failureCount++;
    this._totalFailures++;

    if (this._state === CircuitState.HalfOpen) {
      // Trial request failed -- reopen the circuit
      this._transitionTo(CircuitState.Open);
    } else if (this._failureCount >= this._failureThreshold) {
      // Threshold reached -- open the circuit
      this._transitionTo(CircuitState.Open);
    }
  }

  private _transitionTo(state: CircuitState): void {
    this._state = state;

    if (state === CircuitState.Open) {
      this._openedAt = Date.now();
      this._scheduleReset();
    } else if (state === CircuitState.Closed) {
      this._closedAt = Date.now();
      this._failureCount = 0;
      this._clearResetTimer();
    }

    // HALF_OPEN: reset failure count so trial failure starts from 1
    if (state === CircuitState.HalfOpen) {
      this._failureCount = 0;
    }
  }

  private _scheduleReset(): void {
    this._clearResetTimer();

    this._resetTimer = setTimeout(() => {
      if (this._state === CircuitState.Open) {
        this._transitionTo(CircuitState.HalfOpen);
      }
    }, this._resetTimeoutMs);
  }

  private _clearResetTimer(): void {
    if (this._resetTimer !== null) {
      clearTimeout(this._resetTimer);
      this._resetTimer = null;
    }
  }

  /**
   * Check if the reset timeout has expired and transition to HALF_OPEN if so.
   * This is called lazily on every public API call to avoid reliance on
   * timer accuracy (important for testing with fake timers).
   */
  private _transitionIfExpired(): void {
    if (
      this._state === CircuitState.Open &&
      this._openedAt !== undefined &&
      Date.now() - this._openedAt >= this._resetTimeoutMs
    ) {
      this._clearResetTimer();
      this._transitionTo(CircuitState.HalfOpen);
    }
  }
}
