/**
 * @osai/providers -- Circuit Breaker Unit Tests (DOMAIN-008)
 *
 * Tests cover:
 * - TT-002-60: Initial state is CLOSED
 * - TT-002-61: N sequential failures -> OPEN
 * - TT-002-62: OPEN rejects calls immediately (CircuitBreakerOpenError)
 * - TT-002-63: After reset timeout -> HALF_OPEN
 * - TT-002-64: HALF_OPEN success -> CLOSED
 * - TT-002-65: HALF_OPEN failure -> OPEN
 * - TT-002-66: CLOSED success resets failure counter
 * - Additional: configurable params, stats, reset(), canExecute(), dispose()
 */
export {};
//# sourceMappingURL=circuit-breaker.test.d.ts.map