/**
 * Integration tests for AuditService + AuditLogRepository (T-004)
 *
 * Full round-trip integration tests:
 * - TC-004-07: log() -> query() round-trip
 * - TC-004-08: Index performance for trace_id queries
 * - Full AuditService -> Repository -> SQLite -> query chain
 *
 * Uses real SQLite (in-memory temp file), no mocks.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { DatabaseManager, runMigrations } from "@osai/shared";
import { AuditService, AuditAction } from "./audit.js";
import { AuditLogRepository } from "./audit-repository.js";
import { TraceContext } from "./trace.js";
// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("AuditService + AuditLogRepository Integration", () => {
    let manager;
    let service;
    let testDir;
    beforeEach(() => {
        testDir = path.join(os.tmpdir(), `osai-audit-integration-test-${process.pid}-${Date.now()}`);
        fs.mkdirSync(testDir, { recursive: true });
        const dbPath = path.join(testDir, "osai.db");
        manager = new DatabaseManager({ dbPath });
        manager.initialize();
        runMigrations(manager.getDb());
        const repository = new AuditLogRepository(manager.getDb());
        service = new AuditService(repository);
    });
    afterEach(() => {
        manager.close();
        if (fs.existsSync(testDir)) {
            fs.rmSync(testDir, { recursive: true, force: true });
        }
    });
    // -------------------------------------------------------------------------
    // TC-004-07: Integration round-trip: log() -> query()
    // -------------------------------------------------------------------------
    describe("TC-004-07: round-trip log -> query", () => {
        it("should find logged record via query by trace_id", () => {
            const ctx = TraceContext.create();
            TraceContext.runInContext(ctx, () => {
                service.log({
                    action: AuditAction.TOOL_CALL,
                    tool_name: "read_file",
                    params: { path: "/tmp/test.txt" },
                    session_id: "sess-1",
                });
            });
            const results = service.query({ trace_id: ctx.trace_id });
            expect(results).toHaveLength(1);
            expect(results[0].action).toBe("TOOL_CALL");
            expect(results[0].tool_name).toBe("read_file");
            expect(results[0].session_id).toBe("sess-1");
            expect(results[0].trace_id).toBe(ctx.trace_id);
        });
        it("should find logged record via query by session_id", () => {
            service.log({
                action: AuditAction.FILE_ACCESS,
                tool_name: "write_file",
                params: { path: "/tmp/output.txt" },
                session_id: "session-xyz",
                chat_id: "chat-abc",
            });
            const results = service.query({ session_id: "session-xyz" });
            expect(results).toHaveLength(1);
            expect(results[0].action).toBe("FILE_ACCESS");
            expect(results[0].chat_id).toBe("chat-abc");
        });
        it("should find logged record via query by action", () => {
            service.log({
                action: AuditAction.SHELL_EXEC,
                tool_name: "exec",
                params: { command: "ls -la" },
                risk_level: "medium",
            });
            const results = service.query({ action: "SHELL_EXEC" });
            expect(results).toHaveLength(1);
            expect(results[0].risk_level).toBe("medium");
        });
        it("should support multiple log entries and filter correctly", () => {
            service.log({
                action: AuditAction.TOOL_CALL,
                tool_name: "read_file",
                session_id: "s1",
            });
            service.log({
                action: AuditAction.FILE_ACCESS,
                session_id: "s1",
            });
            service.log({
                action: AuditAction.TOOL_CALL,
                tool_name: "write_file",
                session_id: "s2",
            });
            const s1Results = service.query({ session_id: "s1" });
            expect(s1Results).toHaveLength(2);
            const s2Results = service.query({ session_id: "s2" });
            expect(s2Results).toHaveLength(1);
            expect(s2Results[0].action).toBe("TOOL_CALL");
        });
        it("should preserve params and result through round-trip", () => {
            const params = { file: "test.txt", encoding: "utf-8" };
            const result = { content: "hello world", size: 11 };
            service.log({
                action: AuditAction.TOOL_CALL,
                tool_name: "read_file",
                params,
                result,
            });
            const results = service.query({ action: "TOOL_CALL" });
            expect(results).toHaveLength(1);
            expect(results[0].params).toBe(JSON.stringify(params));
            expect(results[0].result).toBe(JSON.stringify(result));
        });
    });
    // -------------------------------------------------------------------------
    // TC-004-08: Index performance
    // -------------------------------------------------------------------------
    describe("TC-004-08: index performance", () => {
        it("should query by trace_id in under 50ms with 1000+ records", () => {
            // Insert 1000 records with various trace_ids
            for (let i = 0; i < 1000; i++) {
                service.log({
                    action: AuditAction.TOOL_CALL,
                    trace_id: i % 100 === 0 ? "target-trace" : `other-trace-${i}`,
                    session_id: `session-${i % 50}`,
                });
            }
            const start = performance.now();
            const results = service.query({ trace_id: "target-trace" });
            const elapsed = performance.now() - start;
            // Should find 10 records (i=0, 100, 200, ..., 900)
            expect(results).toHaveLength(10);
            expect(elapsed).toBeLessThan(50);
        });
        it("should query by session_id in under 50ms with 1000+ records", () => {
            for (let i = 0; i < 1000; i++) {
                service.log({
                    action: AuditAction.TOOL_CALL,
                    session_id: `session-${i % 200}`,
                });
            }
            const start = performance.now();
            const results = service.query({ session_id: "session-42" });
            const elapsed = performance.now() - start;
            // Should find 5 records (i=42, 242, 442, 642, 842)
            expect(results).toHaveLength(5);
            expect(elapsed).toBeLessThan(50);
        });
    });
    // -------------------------------------------------------------------------
    // Cleanup integration
    // -------------------------------------------------------------------------
    describe("cleanup integration", () => {
        it("should remove old records and keep recent ones", () => {
            service.log({
                action: AuditAction.TOOL_CALL,
                timestamp: "2025-01-01T00:00:00.000Z",
            });
            service.log({
                action: AuditAction.TOOL_CALL,
                timestamp: "2025-06-01T00:00:00.000Z",
            });
            service.log({
                action: AuditAction.TOOL_CALL,
                timestamp: "2026-06-01T00:00:00.000Z",
            });
            const deleted = service.cleanup("2026-01-01T00:00:00.000Z");
            expect(deleted).toBe(2);
            const remaining = service.query({});
            expect(remaining).toHaveLength(1);
        });
    });
    // -------------------------------------------------------------------------
    // TraceContext enrichment integration
    // -------------------------------------------------------------------------
    describe("TraceContext enrichment", () => {
        it("should auto-enrich trace_id in full round-trip", () => {
            const ctx = TraceContext.create();
            let loggedId;
            TraceContext.runInContext(ctx, () => {
                const record = service.log({
                    action: AuditAction.PERMISSION_REQUEST,
                    tool_name: "delete_file",
                    params: { path: "/tmp/important" },
                    risk_level: "high",
                });
                loggedId = record.id;
            });
            expect(loggedId).toBeDefined();
            // Query by the trace_id that was auto-enriched
            const results = service.query({ trace_id: ctx.trace_id });
            expect(results).toHaveLength(1);
            expect(results[0].id).toBe(loggedId);
            expect(results[0].action).toBe("PERMISSION_REQUEST");
            expect(results[0].risk_level).toBe("high");
        });
        it("should handle nested trace contexts correctly", () => {
            const ctx1 = TraceContext.create();
            const ctx2 = TraceContext.create();
            TraceContext.runInContext(ctx1, () => {
                service.log({
                    action: AuditAction.AGENT_START,
                    session_id: "outer-session",
                });
                TraceContext.runInContext(ctx2, () => {
                    service.log({
                        action: AuditAction.TOOL_CALL,
                        session_id: "inner-session",
                    });
                });
            });
            const results1 = service.query({ trace_id: ctx1.trace_id });
            const results2 = service.query({ trace_id: ctx2.trace_id });
            expect(results1).toHaveLength(1);
            expect(results1[0].session_id).toBe("outer-session");
            expect(results2).toHaveLength(1);
            expect(results2[0].session_id).toBe("inner-session");
        });
    });
});
//# sourceMappingURL=audit-service.test.js.map