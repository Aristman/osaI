/**
 * Integration tests for AuditService + AuditFilters + AuditLogRepository (T-007)
 *
 * Full round-trip integration tests with real SQLite (in-memory temp file).
 *
 * Tests:
 * - TC-007-5: trace_id propagation through real SQLite
 * - TC-007-6: Query by trace_id via AuditFilters
 * - TC-007-7: Query by time range via AuditFilters
 * - TC-007-8: Query by risk_level via AuditFilters
 * - AuditFilters -> AuditService -> SQLite -> query chain
 *
 * Uses real SQLite (in-memory temp file), no mocks.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { DatabaseManager, runMigrations } from "@osai/shared";
import { AuditService } from "../AuditService.js";
import { AuditLogRepository } from "../AuditRepository.js";
import { AuditFilters } from "../AuditFilters.js";
import { AuditEventType } from "../types.js";
import { TraceContext } from "../../trace.js";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("AuditService + AuditFilters Integration (T-007)", () => {
  let manager: DatabaseManager;
  let service: AuditService;
  let testDir: string;

  beforeEach(() => {
    testDir = path.join(
      os.tmpdir(),
      `osai-audit-t007-integ-${process.pid}-${Date.now()}`,
    );
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
  // TC-007-5: trace_id propagation
  // -------------------------------------------------------------------------
  describe("TC-007-5: trace_id propagation", () => {
    it("all records of one request share the same trace_id", () => {
      const ctx = TraceContext.create();

      TraceContext.runInContext(ctx, () => {
        service.log({
          action: AuditEventType.FILE_ACCESS,
          tool_name: "read_file",
          params: { path: "/tmp/test.txt" },
          session_id: "sess-1",
        });

        service.log({
          action: AuditEventType.SHELL_EXEC,
          tool_name: "exec",
          params: { command: "cat /tmp/test.txt" },
          session_id: "sess-1",
        });

        service.log({
          action: AuditEventType.TOOL_CALL,
          tool_name: "write_file",
          params: { path: "/tmp/output.txt" },
          session_id: "sess-1",
        });
      });

      const filter = new AuditFilters().byTraceId(ctx.trace_id).build();
      const results = service.query(filter);

      expect(results).toHaveLength(3);

      // Verify all share the same trace_id
      for (const record of results) {
        expect(record.trace_id).toBe(ctx.trace_id);
        expect(record.session_id).toBe("sess-1");
      }
    });
  });

  // -------------------------------------------------------------------------
  // TC-007-6: Query by trace_id
  // -------------------------------------------------------------------------
  describe("TC-007-6: query by trace_id", () => {
    it("returns all records for given trace_id", () => {
      const ctx = TraceContext.create();

      TraceContext.runInContext(ctx, () => {
        service.log({
          action: AuditEventType.TOOL_CALL,
          tool_name: "read_file",
          params: { path: "/tmp/a.txt" },
        });
        service.log({
          action: AuditEventType.FILE_ACCESS,
          params: { path: "/tmp/b.txt" },
        });
      });

      // Add a record with different trace_id
      service.log({
        action: AuditEventType.TOOL_CALL,
        trace_id: "other-trace",
      });

      const filter = new AuditFilters().byTraceId(ctx.trace_id).build();
      const results = service.query(filter);

      expect(results).toHaveLength(2);
      expect(results.every((r) => r.trace_id === ctx.trace_id)).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // TC-007-7: Query by time range
  // -------------------------------------------------------------------------
  describe("TC-007-7: query by time range", () => {
    it("returns records within range", () => {
      service.log({
        action: AuditEventType.TOOL_CALL,
        timestamp: "2026-01-15T12:00:00.000Z",
      });
      service.log({
        action: AuditEventType.TOOL_CALL,
        timestamp: "2026-03-15T12:00:00.000Z",
      });
      service.log({
        action: AuditEventType.TOOL_CALL,
        timestamp: "2026-06-15T12:00:00.000Z",
      });

      const filter = new AuditFilters()
        .fromTime("2026-02-01T00:00:00.000Z")
        .toTime("2026-04-30T23:59:59.000Z")
        .build();

      const results = service.query(filter);

      expect(results).toHaveLength(1);
      expect(results[0]!.timestamp).toBe("2026-03-15T12:00:00.000Z");
    });

    it("returns all records when range covers all", () => {
      service.log({
        action: AuditEventType.TOOL_CALL,
        timestamp: "2026-01-15T12:00:00.000Z",
      });
      service.log({
        action: AuditEventType.TOOL_CALL,
        timestamp: "2026-06-15T12:00:00.000Z",
      });

      const filter = new AuditFilters()
        .fromTime("2020-01-01T00:00:00.000Z")
        .toTime("2030-12-31T23:59:59.000Z")
        .build();

      const results = service.query(filter);

      expect(results).toHaveLength(2);
    });
  });

  // -------------------------------------------------------------------------
  // TC-007-8: Query by risk_level
  // -------------------------------------------------------------------------
  describe("TC-007-8: query by risk_level", () => {
    it("filters correctly by low risk_level", () => {
      service.log({
        action: AuditEventType.FILE_ACCESS,
        tool_name: "read_file",
        risk_level: "low",
      });
      service.log({
        action: AuditEventType.SHELL_EXEC,
        tool_name: "exec",
        risk_level: "medium",
      });
      service.log({
        action: AuditEventType.SANDBOX_VIOLATION,
        tool_name: "read_file",
        risk_level: "high",
      });

      const filter = new AuditFilters().byRiskLevel("low").build();
      const results = service.query(filter);

      expect(results).toHaveLength(1);
      expect(results[0]!.risk_level).toBe("low");
    });

    it("filters correctly by medium risk_level", () => {
      service.log({
        action: AuditEventType.FILE_ACCESS,
        risk_level: "low",
      });
      service.log({
        action: AuditEventType.SHELL_EXEC,
        risk_level: "medium",
      });
      service.log({
        action: AuditEventType.SANDBOX_VIOLATION,
        risk_level: "high",
      });

      const filter = new AuditFilters().byRiskLevel("medium").build();
      const results = service.query(filter);

      expect(results).toHaveLength(1);
      expect(results[0]!.risk_level).toBe("medium");
    });

    it("filters correctly by high risk_level", () => {
      service.log({
        action: AuditEventType.TOOL_CALL,
        risk_level: "low",
      });
      service.log({
        action: AuditEventType.SANDBOX_VIOLATION,
        risk_level: "high",
      });

      const filter = new AuditFilters().byRiskLevel("high").build();
      const results = service.query(filter);

      expect(results).toHaveLength(1);
      expect(results[0]!.action).toBe("sandbox_violation");
    });
  });

  // -------------------------------------------------------------------------
  // AuditFilters + combined filters
  // -------------------------------------------------------------------------
  describe("combined filters", () => {
    it("should filter by trace_id and risk_level", () => {
      const ctx = TraceContext.create();

      TraceContext.runInContext(ctx, () => {
        service.log({
          action: AuditEventType.TOOL_CALL,
          risk_level: "low",
        });
        service.log({
          action: AuditEventType.SANDBOX_VIOLATION,
          risk_level: "high",
        });
      });

      const filter = new AuditFilters()
        .byTraceId(ctx.trace_id)
        .byRiskLevel("high")
        .build();

      const results = service.query(filter);

      expect(results).toHaveLength(1);
      expect(results[0]!.action).toBe("sandbox_violation");
    });

    it("should filter by session_id, action, and time range", () => {
      service.log({
        action: AuditEventType.TOOL_CALL,
        session_id: "s1",
        timestamp: "2026-03-10T00:00:00.000Z",
      });
      service.log({
        action: AuditEventType.FILE_ACCESS,
        session_id: "s1",
        timestamp: "2026-03-20T00:00:00.000Z",
      });
      service.log({
        action: AuditEventType.TOOL_CALL,
        session_id: "s1",
        timestamp: "2026-04-10T00:00:00.000Z",
      });

      const filter = new AuditFilters()
        .bySessionId("s1")
        .byAction(AuditEventType.TOOL_CALL)
        .fromTime("2026-03-01T00:00:00.000Z")
        .toTime("2026-03-31T23:59:59.000Z")
        .build();

      const results = service.query(filter);

      expect(results).toHaveLength(1);
      expect(results[0]!.timestamp).toBe("2026-03-10T00:00:00.000Z");
    });
  });

  // -------------------------------------------------------------------------
  // queryExtended integration
  // -------------------------------------------------------------------------
  describe("queryExtended integration", () => {
    it("returns records with parsed JSON params and result", () => {
      service.log({
        action: AuditEventType.SHELL_EXEC,
        tool_name: "exec",
        params: { command: "ls", cwd: "/tmp" },
        result: { exit_code: 0, stdout: "file.txt" },
      });

      const filter = new AuditFilters()
        .byAction(AuditEventType.SHELL_EXEC)
        .build();

      const results = service.queryExtended(filter);

      expect(results).toHaveLength(1);
      expect(results[0]!.params).toEqual({ command: "ls", cwd: "/tmp" });
      expect(results[0]!.result).toEqual({ exit_code: 0, stdout: "file.txt" });
    });
  });

  // -------------------------------------------------------------------------
  // Cleanup integration
  // -------------------------------------------------------------------------
  describe("cleanup integration", () => {
    it("should remove old records and keep recent ones", () => {
      service.log({
        action: AuditEventType.TOOL_CALL,
        timestamp: "2025-01-01T00:00:00.000Z",
      });
      service.log({
        action: AuditEventType.TOOL_CALL,
        timestamp: "2025-06-01T00:00:00.000Z",
      });
      service.log({
        action: AuditEventType.TOOL_CALL,
        timestamp: "2026-06-01T00:00:00.000Z",
      });

      const deleted = service.cleanup("2026-01-01T00:00:00.000Z");

      expect(deleted).toBe(2);

      const remaining = service.query({});
      expect(remaining).toHaveLength(1);
      expect(remaining[0]!.timestamp).toBe("2026-06-01T00:00:00.000Z");
    });

    it("should return 0 when no records are old enough", () => {
      service.log({
        action: AuditEventType.TOOL_CALL,
        timestamp: "2026-06-15T00:00:00.000Z",
      });

      const deleted = service.cleanup("2026-01-01T00:00:00.000Z");

      expect(deleted).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // AuditFilters.from() integration
  // -------------------------------------------------------------------------
  describe("AuditFilters.from() integration", () => {
    it("should extend existing filter and query", () => {
      service.log({
        action: AuditEventType.TOOL_CALL,
        session_id: "s1",
        risk_level: "low",
      });
      service.log({
        action: AuditEventType.TOOL_CALL,
        session_id: "s1",
        risk_level: "high",
      });

      const existingFilter = { session_id: "s1", action: "tool_call" };
      const extendedFilter = AuditFilters.from(existingFilter)
        .byRiskLevel("high")
        .build();

      const results = service.query(extendedFilter);

      expect(results).toHaveLength(1);
      expect(results[0]!.risk_level).toBe("high");
    });
  });
});
