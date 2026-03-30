/**
 * Unit tests for AuditFilters (T-007: Audit Service Enhancement)
 *
 * Tests:
 * - Building filters with individual criteria
 * - Chaining multiple filters
 * - from() static factory
 * - Empty filter build
 * - All filter fields covered
 */
import { describe, it, expect } from "vitest";
import { AuditFilters } from "../AuditFilters.js";
import { AuditEventType } from "../types.js";
// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("AuditFilters", () => {
    // -------------------------------------------------------------------------
    // Empty filter
    // -------------------------------------------------------------------------
    describe("empty filter", () => {
        it("should build empty filter when no methods called", () => {
            const filter = new AuditFilters().build();
            expect(filter).toEqual({});
            expect(Object.keys(filter)).toHaveLength(0);
        });
    });
    // -------------------------------------------------------------------------
    // Individual filter methods
    // -------------------------------------------------------------------------
    describe("bySessionId", () => {
        it("should set session_id filter", () => {
            const filter = new AuditFilters().bySessionId("sess-123").build();
            expect(filter.session_id).toBe("sess-123");
        });
    });
    describe("byChatId", () => {
        it("should set chat_id filter", () => {
            const filter = new AuditFilters().byChatId("chat-456").build();
            expect(filter.chat_id).toBe("chat-456");
        });
    });
    describe("byTraceId", () => {
        it("should set trace_id filter", () => {
            const filter = new AuditFilters().byTraceId("trace-789").build();
            expect(filter.trace_id).toBe("trace-789");
        });
    });
    describe("byAction", () => {
        it("should set action filter with string", () => {
            const filter = new AuditFilters().byAction("shell_exec").build();
            expect(filter.action).toBe("shell_exec");
        });
        it("should set action filter with AuditEventType enum", () => {
            const filter = new AuditFilters()
                .byAction(AuditEventType.SANDBOX_VIOLATION)
                .build();
            expect(filter.action).toBe("sandbox_violation");
        });
    });
    describe("byToolName", () => {
        it("should set tool_name filter", () => {
            const filter = new AuditFilters().byToolName("read_file").build();
            expect(filter.tool_name).toBe("read_file");
        });
    });
    describe("bySkillName", () => {
        it("should set skill_name filter", () => {
            const filter = new AuditFilters().bySkillName("filesystem").build();
            expect(filter.skill_name).toBe("filesystem");
        });
    });
    describe("byRiskLevel", () => {
        it("should set risk_level filter", () => {
            const filter = new AuditFilters().byRiskLevel("high").build();
            expect(filter.risk_level).toBe("high");
        });
        it("should accept all valid risk levels", () => {
            for (const level of ["low", "medium", "high", "critical"]) {
                const filter = new AuditFilters().byRiskLevel(level).build();
                expect(filter.risk_level).toBe(level);
            }
        });
    });
    describe("fromTime / toTime", () => {
        it("should set from time filter", () => {
            const filter = new AuditFilters()
                .fromTime("2026-01-01T00:00:00.000Z")
                .build();
            expect(filter.from).toBe("2026-01-01T00:00:00.000Z");
        });
        it("should set to time filter", () => {
            const filter = new AuditFilters()
                .toTime("2026-12-31T23:59:59.000Z")
                .build();
            expect(filter.to).toBe("2026-12-31T23:59:59.000Z");
        });
        it("should support both from and to for time range", () => {
            const filter = new AuditFilters()
                .fromTime("2026-03-01T00:00:00.000Z")
                .toTime("2026-03-31T23:59:59.000Z")
                .build();
            expect(filter.from).toBe("2026-03-01T00:00:00.000Z");
            expect(filter.to).toBe("2026-03-31T23:59:59.000Z");
        });
    });
    describe("withLimit", () => {
        it("should set limit filter", () => {
            const filter = new AuditFilters().withLimit(50).build();
            expect(filter.limit).toBe(50);
        });
    });
    // -------------------------------------------------------------------------
    // Chaining multiple filters
    // -------------------------------------------------------------------------
    describe("chained filters", () => {
        it("should combine multiple filters in one chain", () => {
            const filter = new AuditFilters()
                .byTraceId("trace-abc")
                .byAction(AuditEventType.TOOL_CALL)
                .byRiskLevel("high")
                .build();
            expect(filter.trace_id).toBe("trace-abc");
            expect(filter.action).toBe("tool_call");
            expect(filter.risk_level).toBe("high");
            expect(Object.keys(filter)).toHaveLength(3);
        });
        it("should combine all filter types in a chain", () => {
            const filter = new AuditFilters()
                .bySessionId("sess-1")
                .byChatId("chat-1")
                .byTraceId("trace-1")
                .byAction("shell_exec")
                .byToolName("exec")
                .bySkillName("shell")
                .byRiskLevel("medium")
                .fromTime("2026-01-01T00:00:00.000Z")
                .toTime("2026-12-31T23:59:59.000Z")
                .withLimit(100)
                .build();
            expect(filter.session_id).toBe("sess-1");
            expect(filter.chat_id).toBe("chat-1");
            expect(filter.trace_id).toBe("trace-1");
            expect(filter.action).toBe("shell_exec");
            expect(filter.tool_name).toBe("exec");
            expect(filter.skill_name).toBe("shell");
            expect(filter.risk_level).toBe("medium");
            expect(filter.from).toBe("2026-01-01T00:00:00.000Z");
            expect(filter.to).toBe("2026-12-31T23:59:59.000Z");
            expect(filter.limit).toBe(100);
            expect(Object.keys(filter)).toHaveLength(10);
        });
    });
    // -------------------------------------------------------------------------
    // from() static factory
    // -------------------------------------------------------------------------
    describe("from() static factory", () => {
        it("should create filters from existing AuditQueryFilter", () => {
            const existing = {
                trace_id: "existing-trace",
                risk_level: "high",
                limit: 25,
            };
            const filters = AuditFilters.from(existing);
            const result = filters.build();
            expect(result.trace_id).toBe("existing-trace");
            expect(result.risk_level).toBe("high");
            expect(result.limit).toBe(25);
        });
        it("should allow extending an existing filter", () => {
            const existing = {
                trace_id: "existing-trace",
                action: "tool_call",
            };
            const extendedFilter = AuditFilters.from(existing)
                .byRiskLevel("critical")
                .withLimit(10)
                .build();
            expect(extendedFilter.trace_id).toBe("existing-trace");
            expect(extendedFilter.action).toBe("tool_call");
            expect(extendedFilter.risk_level).toBe("critical");
            expect(extendedFilter.limit).toBe(10);
        });
        it("should handle empty existing filter", () => {
            const filters = AuditFilters.from({});
            const result = filters.build();
            expect(result).toEqual({});
        });
    });
    // -------------------------------------------------------------------------
    // Immutability
    // -------------------------------------------------------------------------
    describe("immutability", () => {
        it("should not modify the internal state of build() result", () => {
            const filter = new AuditFilters()
                .byTraceId("trace-1")
                .build();
            // Mutating the returned object should not affect subsequent builds
            filter.trace_id = "modified";
            const filter2 = new AuditFilters()
                .byTraceId("trace-1")
                .build();
            expect(filter2.trace_id).toBe("trace-1");
        });
    });
});
//# sourceMappingURL=AuditFilters.test.js.map