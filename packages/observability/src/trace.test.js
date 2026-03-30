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
import { describe, it, expect, beforeEach } from "vitest";
import { TraceContext, createTraceContext, getTraceContext, setTraceContext, clearTraceContext, runInTraceContext, } from "./trace.js";
describe("TraceContext", () => {
    beforeEach(() => {
        // Clear any trace context before each test
        clearTraceContext();
    });
    // -------------------------------------------------------------------------
    // T-001-01: create() generates trace_id and span_id
    // -------------------------------------------------------------------------
    describe("T-001-01: create()", () => {
        it("should generate a trace context with trace_id and span_id", () => {
            const ctx = TraceContext.create();
            expect(ctx).toBeDefined();
            expect(ctx.trace_id).toBeDefined();
            expect(ctx.span_id).toBeDefined();
        });
        it("should generate a trace context via standalone createTraceContext()", () => {
            const ctx = createTraceContext();
            expect(ctx).toBeDefined();
            expect(ctx.trace_id).toBeDefined();
            expect(ctx.span_id).toBeDefined();
        });
    });
    // -------------------------------------------------------------------------
    // T-001-02: get() returns current trace context
    // -------------------------------------------------------------------------
    describe("T-001-02: get()", () => {
        it("should return undefined when no context is set", () => {
            const ctx = TraceContext.get();
            expect(ctx).toBeUndefined();
        });
        it("should return current trace context via getTraceContext()", () => {
            const ctx = getTraceContext();
            expect(ctx).toBeUndefined();
        });
    });
    // -------------------------------------------------------------------------
    // T-001-03: set() overrides trace_id/span_id
    // -------------------------------------------------------------------------
    describe("T-001-03: set()", () => {
        it("should set trace context that can be retrieved via get()", () => {
            const ctx = {
                trace_id: "550e8400-e29b-41d4-a716-446655440000",
                span_id: "a1b2c3d4e5f6a7b8",
            };
            TraceContext.set(ctx);
            const result = TraceContext.get();
            expect(result).toBeDefined();
            expect(result.trace_id).toBe("550e8400-e29b-41d4-a716-446655440000");
            expect(result.span_id).toBe("a1b2c3d4e5f6a7b8");
        });
        it("should set trace context via standalone setTraceContext()", () => {
            const ctx = {
                trace_id: "550e8400-e29b-41d4-a716-446655440001",
                span_id: "1234567890abcdef",
            };
            setTraceContext(ctx);
            const result = getTraceContext();
            expect(result).toBeDefined();
            expect(result.trace_id).toBe("550e8400-e29b-41d4-a716-446655440001");
            expect(result.span_id).toBe("1234567890abcdef");
        });
        it("should replace existing trace context", () => {
            TraceContext.set({
                trace_id: "00000000-0000-0000-0000-000000000000",
                span_id: "0000000000000000",
            });
            TraceContext.set({
                trace_id: "11111111-1111-1111-1111-111111111111",
                span_id: "1111111111111111",
            });
            const result = TraceContext.get();
            expect(result.trace_id).toBe("11111111-1111-1111-1111-111111111111");
            expect(result.span_id).toBe("1111111111111111");
        });
    });
    // -------------------------------------------------------------------------
    // T-001-04: clear() removes trace context
    // -------------------------------------------------------------------------
    describe("T-001-04: clear()", () => {
        it("should clear existing trace context", () => {
            TraceContext.set({
                trace_id: "550e8400-e29b-41d4-a716-446655440000",
                span_id: "a1b2c3d4e5f6a7b8",
            });
            expect(TraceContext.get()).toBeDefined();
            TraceContext.clear();
            expect(TraceContext.get()).toBeUndefined();
        });
        it("should work via standalone clearTraceContext()", () => {
            setTraceContext({
                trace_id: "550e8400-e29b-41d4-a716-446655440000",
                span_id: "a1b2c3d4e5f6a7b8",
            });
            clearTraceContext();
            expect(getTraceContext()).toBeUndefined();
        });
    });
    // -------------------------------------------------------------------------
    // T-001-05: runInContext() executes callback within trace context
    // -------------------------------------------------------------------------
    describe("T-001-05: runInContext()", () => {
        it("should execute callback with trace context available inside", () => {
            const ctx = {
                trace_id: "550e8400-e29b-41d4-a716-446655440000",
                span_id: "a1b2c3d4e5f6a7b8",
            };
            let capturedCtx;
            TraceContext.runInContext(ctx, () => {
                capturedCtx = TraceContext.get();
            });
            expect(capturedCtx).toBeDefined();
            expect(capturedCtx.trace_id).toBe("550e8400-e29b-41d4-a716-446655440000");
            expect(capturedCtx.span_id).toBe("a1b2c3d4e5f6a7b8");
        });
        it("should return the callback return value", () => {
            const ctx = {
                trace_id: "550e8400-e29b-41d4-a716-446655440000",
                span_id: "a1b2c3d4e5f6a7b8",
            };
            const result = TraceContext.runInContext(ctx, () => 42);
            expect(result).toBe(42);
        });
        it("should work with async callbacks", async () => {
            const ctx = {
                trace_id: "550e8400-e29b-41d4-a716-446655440000",
                span_id: "a1b2c3d4e5f6a7b8",
            };
            const result = await TraceContext.runInContext(ctx, async () => {
                await Promise.resolve();
                const current = TraceContext.get();
                return current?.trace_id;
            });
            expect(result).toBe("550e8400-e29b-41d4-a716-446655440000");
        });
        it("should work via standalone runInTraceContext()", async () => {
            const ctx = {
                trace_id: "550e8400-e29b-41d4-a716-446655440000",
                span_id: "a1b2c3d4e5f6a7b8",
            };
            const result = await runInTraceContext(ctx, async () => {
                return TraceContext.get()?.span_id;
            });
            expect(result).toBe("a1b2c3d4e5f6a7b8");
        });
    });
    // -------------------------------------------------------------------------
    // T-001-06: trace context propagates through async call chain
    // -------------------------------------------------------------------------
    describe("T-001-06: async propagation", () => {
        it("should propagate trace context through Promise chain", async () => {
            const ctx = {
                trace_id: "550e8400-e29b-41d4-a716-446655440000",
                span_id: "a1b2c3d4e5f6a7b8",
            };
            const result = await TraceContext.runInContext(ctx, async () => {
                // Simulate async operation
                const traceId = await new Promise((resolve) => {
                    setImmediate(() => {
                        const current = TraceContext.get();
                        resolve(current?.trace_id ?? "MISSING");
                    });
                });
                return traceId;
            });
            expect(result).toBe("550e8400-e29b-41d4-a716-446655440000");
        });
        it("should propagate through multiple async function calls", async () => {
            const ctx = {
                trace_id: "550e8400-e29b-41d4-a716-446655440000",
                span_id: "a1b2c3d4e5f6a7b8",
            };
            async function level1() {
                const tid = TraceContext.get()?.trace_id;
                await level2();
                return tid ?? "MISSING";
            }
            async function level2() {
                const tid = TraceContext.get()?.trace_id;
                await level3();
                return tid ?? "MISSING";
            }
            async function level3() {
                return TraceContext.get()?.trace_id ?? "MISSING";
            }
            const result = await TraceContext.runInContext(ctx, () => level1());
            expect(result).toBe("550e8400-e29b-41d4-a716-446655440000");
        });
        it("should propagate through setTimeout", async () => {
            const ctx = {
                trace_id: "550e8400-e29b-41d4-a716-446655440000",
                span_id: "a1b2c3d4e5f6a7b8",
            };
            const result = await TraceContext.runInContext(ctx, () => {
                return new Promise((resolve) => {
                    setTimeout(() => {
                        const current = TraceContext.get();
                        resolve(current?.trace_id ?? "MISSING");
                    }, 10);
                });
            });
            expect(result).toBe("550e8400-e29b-41d4-a716-446655440000");
        });
    });
    // -------------------------------------------------------------------------
    // T-001-07: trace_id format validation (UUID v4)
    // -------------------------------------------------------------------------
    describe("T-001-07: trace_id format", () => {
        const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
        it("should generate UUID v4 compliant trace_id", () => {
            const ctx = TraceContext.create();
            expect(ctx.trace_id).toMatch(UUID_V4_REGEX);
        });
        it("should generate unique trace_ids", () => {
            const ids = new Set();
            for (let i = 0; i < 100; i++) {
                const ctx = TraceContext.create();
                ids.add(ctx.trace_id);
            }
            // All 100 IDs should be unique
            expect(ids.size).toBe(100);
        });
    });
    // -------------------------------------------------------------------------
    // T-001-08: span_id format validation (16-char hex)
    // -------------------------------------------------------------------------
    describe("T-001-08: span_id format", () => {
        const SPAN_ID_REGEX = /^[0-9a-f]{16}$/;
        it("should generate 16-char hex span_id", () => {
            const ctx = TraceContext.create();
            expect(ctx.span_id).toMatch(SPAN_ID_REGEX);
            expect(ctx.span_id.length).toBe(16);
        });
        it("should generate unique span_ids", () => {
            const ids = new Set();
            for (let i = 0; i < 100; i++) {
                const ctx = TraceContext.create();
                ids.add(ctx.span_id);
            }
            expect(ids.size).toBe(100);
        });
    });
    // -------------------------------------------------------------------------
    // T-001-09: nested runInContext preserves outer context on exit
    // -------------------------------------------------------------------------
    describe("T-001-09: nested contexts", () => {
        it("should restore outer context after inner runInContext exits", () => {
            const outerCtx = {
                trace_id: "00000000-0000-4000-a000-000000000001",
                span_id: "aaaaaaaaaaaaaaaa",
            };
            const innerCtx = {
                trace_id: "00000000-0000-4000-a000-000000000002",
                span_id: "bbbbbbbbbbbbbbbb",
            };
            TraceContext.runInContext(outerCtx, () => {
                expect(TraceContext.get()?.trace_id).toBe("00000000-0000-4000-a000-000000000001");
                TraceContext.runInContext(innerCtx, () => {
                    expect(TraceContext.get()?.trace_id).toBe("00000000-0000-4000-a000-000000000002");
                });
                // After inner exits, outer should be restored
                expect(TraceContext.get()?.trace_id).toBe("00000000-0000-4000-a000-000000000001");
            });
        });
        it("should not leak context outside runInContext", () => {
            const ctx = {
                trace_id: "550e8400-e29b-41d4-a716-446655440000",
                span_id: "a1b2c3d4e5f6a7b8",
            };
            TraceContext.runInContext(ctx, () => {
                expect(TraceContext.get()).toBeDefined();
            });
            // Context should be undefined after runInContext
            expect(TraceContext.get()).toBeUndefined();
        });
    });
    // -------------------------------------------------------------------------
    // T-001-10: clear() outside context is safe
    // -------------------------------------------------------------------------
    describe("T-001-10: clear() safety", () => {
        it("should not throw when clearing with no context set", () => {
            expect(() => TraceContext.clear()).not.toThrow();
            expect(() => clearTraceContext()).not.toThrow();
        });
    });
});
//# sourceMappingURL=trace.test.js.map