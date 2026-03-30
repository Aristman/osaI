/**
 * Unit tests for @osai/observability trace module.
 *
 * TraceContext -- AsyncLocalStorage-based trace_id/span_id propagation.
 *
 * Tests:
 * - T-001-01: create() generates trace_id (UUID v4) and span_id (16-char hex)
 * - T-001-02: get() returns current trace context
 * - T-001-03: set() overrides trace_id/span_id in current context
 * - T-001-04: clear() removes trace context
 * - T-001-05: runInContext() executes callback within trace context
 * - T-001-06: trace context propagates through async call chain
 * - T-001-07: trace_id format validation (UUID v4)
 * - T-001-08: span_id format validation (16-char hex)
 * - T-001-09: nested runInContext preserves outer context on exit
 * - T-001-10: clear() outside context returns empty result
 */
export {};
//# sourceMappingURL=trace.test.d.ts.map