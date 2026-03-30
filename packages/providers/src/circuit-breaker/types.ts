/**
 * @osai/providers -- Circuit Breaker Types (DOMAIN-008)
 *
 * Types and configuration for the generic CircuitBreaker state machine.
 */

// ---------------------------------------------------------------------------
// Circuit State
// ---------------------------------------------------------------------------

/** States of the circuit breaker state machine. */
export enum CircuitState {
  /** Normal operation -- requests flow through. */
  Closed = 'closed',
  /** Provider is blocked -- requests are rejected immediately. */
  Open = 'open',
  /** Trial state -- one request is allowed to test recovery. */
  HalfOpen = 'half_open',
}

// ---------------------------------------------------------------------------
// Circuit Breaker Configuration
// ---------------------------------------------------------------------------

/** Configuration options for the CircuitBreaker. */
export interface CircuitBreakerConfig {
  /**
   * Number of consecutive failures before the circuit opens.
   * @default 5
   */
  readonly failureThreshold?: number;

  /**
   * Time in milliseconds before an open circuit transitions to half-open.
   * @default 30_000
   */
  readonly resetTimeoutMs?: number;
}

// ---------------------------------------------------------------------------
// Circuit Breaker Statistics
// ---------------------------------------------------------------------------

/** Runtime statistics for a CircuitBreaker instance. */
export interface CircuitBreakerStats {
  /** Current circuit state. */
  readonly state: CircuitState;
  /** Number of consecutive failures recorded. */
  readonly failureCount: number;
  /** Total number of successful executions. */
  readonly successCount: number;
  /** Total number of failed executions. */
  readonly totalFailures: number;
  /** Timestamp (Date.now()) when the circuit last opened, or undefined. */
  readonly openedAt?: number;
  /** Timestamp (Date.now()) when the circuit last closed, or undefined. */
  readonly closedAt?: number;
}
