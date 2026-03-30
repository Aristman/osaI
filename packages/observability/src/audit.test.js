/**
 * Unit tests for @osai/observability AuditService (T-003)
 *
 * Tests:
 * - TC-003-01: log() calls repository
 * - TC-003-02: log() enriches trace_id from TraceContext
 * - TC-003-03: log() logs via pino
 * - TC-003-04: Validation of required fields
 * - TC-003-05: query() delegates to repository
 * - TC-003-06: cleanup() delegates to repository
 * - TC-003-07: AuditAction enum has all 8 values
 * - Additional: params/result JSON serialization
 * - Additional: auto-generated UUID id
 * - Additional: default risk_level
 * - Additional: trace_id precedence (explicit > TraceContext)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { AuditService, AuditAction, } from "./audit.js";
import { TraceContext } from "./trace.js";
// ---------------------------------------------------------------------------
// Mock repository
// ---------------------------------------------------------------------------
function createMockRepository() {
    return {
        save: vi.fn(),
        query: vi.fn().mockReturnValue([]),
        cleanup: vi.fn().mockReturnValue(0),
    };
}
// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("AuditService", () => {
    let service;
    let repo;
    beforeEach(() => {
        repo = createMockRepository();
        service = new AuditService(repo);
    });
    // -------------------------------------------------------------------------
    // TC-003-07: AuditAction enum has all 8 values
    // -------------------------------------------------------------------------
    describe("TC-003-07: AuditAction enum", () => {
        it("should contain all 8 action values", () => {
            const actions = Object.values(AuditAction);
            expect(actions).toHaveLength(8);
            expect(actions).toContain("TOOL_CALL");
            expect(actions).toContain("PERMISSION_REQUEST");
            expect(actions).toContain("PERMISSION_RESPONSE");
            expect(actions).toContain("FILE_ACCESS");
            expect(actions).toContain("SHELL_EXEC");
            expect(actions).toContain("AGENT_START");
            expect(actions).toContain("AGENT_END");
            expect(actions).toContain("ERROR");
        });
    });
    // -------------------------------------------------------------------------
    // TC-003-01: log() calls repository
    // -------------------------------------------------------------------------
    describe("TC-003-01: log() calls repository", () => {
        it("should call repository.save once with correct record", () => {
            const entry = {
                action: AuditAction.TOOL_CALL,
                tool_name: "read_file",
            };
            service.log(entry);
            expect(repo.save).toHaveBeenCalledOnce();
            const savedRecord = repo.save.mock.calls[0][0];
            expect(savedRecord).toBeDefined();
            expect(savedRecord.action).toBe("TOOL_CALL");
            expect(savedRecord.tool_name).toBe("read_file");
        });
        it("should return the saved record", () => {
            const entry = {
                action: AuditAction.FILE_ACCESS,
                params: { path: "/tmp/test" },
            };
            const result = service.log(entry);
            expect(result).toBeDefined();
            expect(result.action).toBe("FILE_ACCESS");
            expect(result.params).toBe(JSON.stringify({ path: "/tmp/test" }));
        });
    });
    // -------------------------------------------------------------------------
    // TC-003-02: log() enriches trace_id from TraceContext
    // -------------------------------------------------------------------------
    describe("TC-003-02: log() enriches trace_id", () => {
        it("should enrich trace_id from TraceContext when not provided", () => {
            const ctx = TraceContext.create();
            TraceContext.runInContext(ctx, () => {
                const entry = {
                    action: AuditAction.TOOL_CALL,
                    tool_name: "write_file",
                };
                const result = service.log(entry);
                expect(result.trace_id).toBe(ctx.trace_id);
            });
        });
        it("should use explicit trace_id when provided", () => {
            const entry = {
                action: AuditAction.TOOL_CALL,
                trace_id: "explicit-trace-id",
            };
            const result = service.log(entry);
            expect(result.trace_id).toBe("explicit-trace-id");
        });
        it("should prefer explicit trace_id over TraceContext", () => {
            const ctx = TraceContext.create();
            TraceContext.runInContext(ctx, () => {
                const entry = {
                    action: AuditAction.TOOL_CALL,
                    trace_id: "explicit-override",
                };
                const result = service.log(entry);
                expect(result.trace_id).toBe("explicit-override");
                expect(result.trace_id).not.toBe(ctx.trace_id);
            });
        });
        it("should set trace_id to null when not available", () => {
            const entry = {
                action: AuditAction.AGENT_START,
            };
            const result = service.log(entry);
            expect(result.trace_id).toBeNull();
        });
    });
    // -------------------------------------------------------------------------
    // TC-003-03: log() logs via pino
    // -------------------------------------------------------------------------
    describe("TC-003-03: log() logs via pino", () => {
        it("should log audit entry via pino logger", () => {
            const entry = {
                action: AuditAction.SHELL_EXEC,
                tool_name: "exec",
                params: { command: "ls" },
                risk_level: "medium",
            };
            // Should not throw (pino is configured internally)
            expect(() => service.log(entry)).not.toThrow();
        });
    });
    // -------------------------------------------------------------------------
    // TC-003-04: Validation of required fields
    // -------------------------------------------------------------------------
    describe("TC-003-04: validation", () => {
        it("should throw if action is missing", () => {
            const entry = {};
            expect(() => service.log(entry)).toThrow("Audit entry validation failed: 'action' is required");
        });
        it("should throw if action is null", () => {
            const entry = { action: null };
            expect(() => service.log(entry)).toThrow("Audit entry validation failed: 'action' is required");
        });
        it("should not throw when action is provided", () => {
            const entry = {
                action: AuditAction.TOOL_CALL,
            };
            expect(() => service.log(entry)).not.toThrow();
        });
    });
    // -------------------------------------------------------------------------
    // TC-003-05: query() delegates to repository
    // -------------------------------------------------------------------------
    describe("TC-003-05: query() delegation", () => {
        it("should call repository.query with provided filter", () => {
            const filter = {
                session_id: "session-123",
                limit: 50,
            };
            service.query(filter);
            expect(repo.query).toHaveBeenCalledOnce();
            expect(repo.query).toHaveBeenCalledWith(filter);
        });
        it("should call repository.query with empty filter by default", () => {
            service.query();
            expect(repo.query).toHaveBeenCalledOnce();
            expect(repo.query).toHaveBeenCalledWith({});
        });
        it("should return repository query results", () => {
            const mockRecords = [
                {
                    id: "test-id",
                    session_id: "s1",
                    chat_id: "c1",
                    timestamp: "2026-01-01T00:00:00.000Z",
                    trace_id: "t1",
                    action: AuditAction.TOOL_CALL,
                    tool_name: "read_file",
                    skill_name: null,
                    params: "{}",
                    result: null,
                    user_decision: null,
                    risk_level: "low",
                },
            ];
            repo.query.mockReturnValue(mockRecords);
            const results = service.query({ session_id: "s1" });
            expect(results).toBe(mockRecords);
            expect(results).toHaveLength(1);
        });
    });
    // -------------------------------------------------------------------------
    // TC-003-06: cleanup() delegates to repository
    // -------------------------------------------------------------------------
    describe("TC-003-06: cleanup() delegation", () => {
        it("should call repository.cleanup with the date parameter", () => {
            service.cleanup("2026-01-01T00:00:00.000Z");
            expect(repo.cleanup).toHaveBeenCalledOnce();
            expect(repo.cleanup).toHaveBeenCalledWith("2026-01-01T00:00:00.000Z");
        });
        it("should return the number of deleted records", () => {
            repo.cleanup.mockReturnValue(5);
            const deleted = service.cleanup("2026-01-01T00:00:00.000Z");
            expect(deleted).toBe(5);
        });
    });
    // -------------------------------------------------------------------------
    // Additional: params/result JSON serialization
    // -------------------------------------------------------------------------
    describe("params/result serialization", () => {
        it("should serialize params to JSON string", () => {
            const entry = {
                action: AuditAction.TOOL_CALL,
                params: { file: "test.txt", line: 42 },
            };
            const result = service.log(entry);
            expect(result.params).toBe(JSON.stringify({ file: "test.txt", line: 42 }));
        });
        it("should serialize result to JSON string", () => {
            const entry = {
                action: AuditAction.TOOL_CALL,
                result: { success: true, data: "hello" },
            };
            const result = service.log(entry);
            expect(result.result).toBe(JSON.stringify({ success: true, data: "hello" }));
        });
        it("should set params to empty object JSON when not provided", () => {
            const entry = {
                action: AuditAction.TOOL_CALL,
            };
            const result = service.log(entry);
            expect(result.params).toBe("{}");
        });
        it("should set result to null when not provided", () => {
            const entry = {
                action: AuditAction.TOOL_CALL,
            };
            const result = service.log(entry);
            expect(result.result).toBeNull();
        });
        it("should handle circular references in params", () => {
            const circular = { name: "test" };
            circular.self = circular;
            const entry = {
                action: AuditAction.TOOL_CALL,
                params: circular,
            };
            const result = service.log(entry);
            // Should not throw; should contain [Circular] marker
            expect(result.params).toContain("[Circular]");
        });
        it("should truncate large params (> 10KB)", () => {
            const largeObj = {};
            for (let i = 0; i < 2000; i++) {
                largeObj[`key_${i}`] = "x".repeat(10);
            }
            const entry = {
                action: AuditAction.TOOL_CALL,
                params: largeObj,
            };
            const result = service.log(entry);
            expect(result.params.length).toBeLessThanOrEqual(10260); // 10240 + "...[truncated]" margin
            expect(result.params).toContain("...[truncated]");
        });
    });
    // -------------------------------------------------------------------------
    // Additional: auto-generated UUID id
    // -------------------------------------------------------------------------
    describe("auto-generated ID", () => {
        it("should generate UUID v4 id when not provided", () => {
            const entry = {
                action: AuditAction.TOOL_CALL,
            };
            const result = service.log(entry);
            // UUID v4 format
            const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
            expect(result.id).toMatch(uuidRegex);
        });
        it("should use provided id when available", () => {
            const entry = {
                action: AuditAction.TOOL_CALL,
                id: "custom-id-123",
            };
            const result = service.log(entry);
            expect(result.id).toBe("custom-id-123");
        });
        it("should generate unique ids for different calls", () => {
            const result1 = service.log({ action: AuditAction.TOOL_CALL });
            const result2 = service.log({ action: AuditAction.TOOL_CALL });
            expect(result1.id).not.toBe(result2.id);
        });
    });
    // -------------------------------------------------------------------------
    // Additional: default risk_level
    // -------------------------------------------------------------------------
    describe("default risk_level", () => {
        it("should default risk_level to 'low'", () => {
            const entry = {
                action: AuditAction.TOOL_CALL,
            };
            const result = service.log(entry);
            expect(result.risk_level).toBe("low");
        });
        it("should use provided risk_level", () => {
            const entry = {
                action: AuditAction.SHELL_EXEC,
                risk_level: "high",
            };
            const result = service.log(entry);
            expect(result.risk_level).toBe("high");
        });
    });
    // -------------------------------------------------------------------------
    // Additional: full record structure
    // -------------------------------------------------------------------------
    describe("full record structure", () => {
        it("should populate all optional fields from entry", () => {
            const entry = {
                session_id: "sess-1",
                chat_id: "chat-1",
                timestamp: "2026-03-30T12:00:00.000Z",
                trace_id: "trace-1",
                action: AuditAction.PERMISSION_RESPONSE,
                tool_name: "delete_file",
                skill_name: "filesystem",
                params: { path: "/tmp/old.txt" },
                result: { deleted: true },
                user_decision: "approved",
                risk_level: "critical",
            };
            const result = service.log(entry);
            expect(result.session_id).toBe("sess-1");
            expect(result.chat_id).toBe("chat-1");
            expect(result.timestamp).toBe("2026-03-30T12:00:00.000Z");
            expect(result.trace_id).toBe("trace-1");
            expect(result.action).toBe("PERMISSION_RESPONSE");
            expect(result.tool_name).toBe("delete_file");
            expect(result.skill_name).toBe("filesystem");
            expect(result.user_decision).toBe("approved");
            expect(result.risk_level).toBe("critical");
        });
        it("should set optional fields to null when not provided", () => {
            const entry = {
                action: AuditAction.AGENT_END,
            };
            const result = service.log(entry);
            expect(result.session_id).toBeNull();
            expect(result.chat_id).toBeNull();
            expect(result.tool_name).toBeNull();
            expect(result.skill_name).toBeNull();
            expect(result.user_decision).toBeNull();
        });
        it("should default timestamp to current time when not provided", () => {
            const before = new Date();
            const entry = {
                action: AuditAction.AGENT_START,
            };
            const result = service.log(entry);
            const after = new Date();
            const ts = new Date(result.timestamp);
            expect(ts.getTime() >= before.getTime()).toBe(true);
            expect(ts.getTime() <= after.getTime()).toBe(true);
        });
    });
});
//# sourceMappingURL=audit.test.js.map