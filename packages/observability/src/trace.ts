/**
 * @osai/observability -- TraceContext module (DOMAIN-010)
 *
 * AsyncLocalStorage-based trace context propagation through async call chains.
 *
 * Provides:
 * - trace_id: UUID v4 for distributed tracing correlation
 * - span_id: random 16-char hex for span identification
 *
 * Usage:
 * ```ts
 * import { TraceContext } from "@osai/observability";
 *
 * // Create a new trace
 * const ctx = TraceContext.create();
 * // => { trace_id: "550e8400-e29b-41d4-a716-446655440000", span_id: "a1b2c3d4e5f6a7b8" }
 *
 * // Run code in trace context
 * await TraceContext.runInContext(ctx, async () => {
 *   const current = TraceContext.get();
 *   // Propagates through async/await, setTimeout, Promise chains
 * });
 * ```
 */

import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID, randomBytes } from "node:crypto";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Trace data carried through the async call chain.
 */
export interface TraceData {
  /** UUID v4 trace identifier for distributed tracing */
  trace_id: string;
  /** 16-char hex span identifier */
  span_id: string;
}

// ---------------------------------------------------------------------------
// AsyncLocalStorage instance
// ---------------------------------------------------------------------------

const traceStorage = new AsyncLocalStorage<TraceData>();

// ---------------------------------------------------------------------------
// UUID v4 generation (crypto.randomUUID)
// ---------------------------------------------------------------------------

/**
 * Generate a UUID v4 compliant trace_id.
 * Uses crypto.randomUUID() which produces proper UUID v4 format.
 */
function generateTraceId(): string {
  return randomUUID();
}

/**
 * Generate a random 16-char hex span_id.
 * Uses crypto.randomBytes(8) -> 16 hex chars.
 */
function generateSpanId(): string {
  return randomBytes(8).toString("hex");
}

// ---------------------------------------------------------------------------
// TraceContext
// ---------------------------------------------------------------------------

/**
 * TraceContext provides trace_id/span_id propagation via AsyncLocalStorage.
 *
 * This is the primary API for trace context management.
 * All methods are static -- there is no instance state.
 */
export class TraceContext {
  /**
   * Create a new trace context with generated trace_id (UUID v4) and span_id (16-char hex).
   */
  static create(): TraceData {
    return {
      trace_id: generateTraceId(),
      span_id: generateSpanId(),
    };
  }

  /**
   * Get the current trace context from AsyncLocalStorage.
   * Returns undefined if no context is set.
   */
  static get(): TraceData | undefined {
    return traceStorage.getStore();
  }

  /**
   * Set trace context in the current AsyncLocalStorage scope.
   *
   * Note: This sets the store for the current execution context.
   * For proper scope management, prefer runInContext().
   */
  static set(ctx: TraceData): void {
    traceStorage.enterWith(ctx);
  }

  /**
   * Clear trace context.
   *
   * This disables the current AsyncLocalStorage store.
   * After calling, TraceContext.get() returns undefined.
   */
  static clear(): void {
    traceStorage.disable();
  }

  /**
   * Execute a callback within a trace context.
   *
   * The context is automatically available inside the callback
   * and propagates through async/await, setTimeout, Promise chains.
   * After the callback returns, the previous context (if any) is restored.
   *
   * @param ctx - Trace context to run within
   * @param fn - Synchronous or async callback
   * @returns The return value of the callback
   */
  static runInContext<T>(
    ctx: TraceData,
    fn: () => T,
  ): T {
    return traceStorage.run(ctx, fn);
  }
}

// ---------------------------------------------------------------------------
// Standalone functions (convenience API)
// ---------------------------------------------------------------------------

/**
 * Create a new trace context.
 * Convenience function for TraceContext.create().
 */
export function createTraceContext(): TraceData {
  return TraceContext.create();
}

/**
 * Get current trace context.
 * Convenience function for TraceContext.get().
 */
export function getTraceContext(): TraceData | undefined {
  return TraceContext.get();
}

/**
 * Set trace context in current scope.
 * Convenience function for TraceContext.set().
 */
export function setTraceContext(ctx: TraceData): void {
  TraceContext.set(ctx);
}

/**
 * Clear trace context.
 * Convenience function for TraceContext.clear().
 */
export function clearTraceContext(): void {
  TraceContext.clear();
}

/**
 * Execute a callback within a trace context.
 * Convenience function for TraceContext.runInContext().
 */
export function runInTraceContext<T>(
  ctx: TraceData,
  fn: () => T,
): T {
  return TraceContext.runInContext(ctx, fn);
}
