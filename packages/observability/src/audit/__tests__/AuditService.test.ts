/**
 * Unit tests for AuditService (T-007: Audit Service Enhancement)
 *
 * Tests:
 * - TC-007-1: Audit record for file access
 * - TC-007-2: Audit record for shell exec
 * - TC-007-3: Audit record for permission decision
 * - TC-007-4: Audit record for sandbox violation
 * - TC-007-5: trace_id propagation
 * - TC-007-6: Query by trace_id
 * - TC-007-7: Query by time range
 * - TC-007-8: Query by risk_level
 *
 * Uses mock repository for unit isolation.
 * Integration tests are in AuditService.integration.test.ts.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  AuditService,
  AuditEventType,
  type AuditRecord,
  type AuditEntryInput,
  type IAuditLogRepository,
  type AuditQueryFilter,
  type AuditRecordExtended,
} from "../types.js";
import { AuditService as AuditServiceImpl } from "../AuditService.js";
import { TraceContext } from "../../trace.js";

// ---------------------------------------------------------------------------
// Mock repository
// ---------------------------------------------------------------------------

function createMockRepository(): IAuditLogRepository & {
  save: ReturnType<typeof vi.fn>;
  query: ReturnType<typeof vi.fn>;
  cleanup: ReturnType<typeof vi.fn>;
} {
  return {
    save: vi.fn(),
    query: vi.fn().mockReturnValue([]),
    cleanup: vi.fn().mockReturnValue(0),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("AuditService (T-007)", () => {
  let service: AuditServiceImpl;
  let repo: ReturnType<typeof createMockRepository>;

  beforeEach(() => {
    repo = createMockRepository();
    service = new AuditServiceImpl(repo);
  });

  // -------------------------------------------------------------------------
  // AuditEventType enum coverage
  // -------------------------------------------------------------------------
  describe("AuditEventType enum", () => {
    it("should contain all 7 event types", () => {
      const types = Object.values(AuditEventType);
      expect(types).toHaveLength(7);
      expect(types).toContain("file_access");
      expect(types).toContain("shell_exec");
      expect(types).toContain("permission_request");
      expect(types).toContain("permission_decision");
      expect(types).toContain("sandbox_violation");
      expect(types).toContain("tool_call");
      expect(types).toContain("telegram_access");
    });
  });

  // -------------------------------------------------------------------------
  // TC-007-1: Audit record for file access
  // -------------------------------------------------------------------------
  describe("TC-007-1: file access audit record", () => {
    it("should log file access with correct action, tool_name, and path", () => {
      const entry: AuditEntryInput = {
        action: AuditEventType.FILE_ACCESS,
        tool_name: "read_file",
        params: { path: "/home/user/documents/report.pdf" },
        risk_level: "low",
      };

      const record = service.log(entry);

      expect(repo.save).toHaveBeenCalledOnce();
      expect(record.action).toBe("file_access");
      expect(record.tool_name).toBe("read_file");
      expect(JSON.parse(record.params)).toEqual({ path: "/home/user/documents/report.pdf" });
      expect(record.risk_level).toBe("low");
    });

    it("should log file write with medium risk", () => {
      const entry: AuditEntryInput = {
        action: AuditEventType.FILE_ACCESS,
        tool_name: "write_file",
        params: { path: "/home/user/output.txt" },
        risk_level: "medium",
      };

      const record = service.log(entry);

      expect(record.action).toBe("file_access");
      expect(record.tool_name).toBe("write_file");
      expect(record.risk_level).toBe("medium");
    });
  });

  // -------------------------------------------------------------------------
  // TC-007-2: Audit record for shell exec
  // -------------------------------------------------------------------------
  describe("TC-007-2: shell exec audit record", () => {
    it("should log shell exec with command and exit_code", () => {
      const entry: AuditEntryInput = {
        action: AuditEventType.SHELL_EXEC,
        tool_name: "exec",
        params: { command: "ls -la /home/user" },
        result: { exit_code: 0, stdout: "total 4" },
        risk_level: "medium",
      };

      const record = service.log(entry);

      expect(repo.save).toHaveBeenCalledOnce();
      expect(record.action).toBe("shell_exec");
      expect(record.tool_name).toBe("exec");
      const parsedParams = JSON.parse(record.params);
      expect(parsedParams.command).toBe("ls -la /home/user");
      const parsedResult = JSON.parse(record.result!);
      expect(parsedResult.exit_code).toBe(0);
    });

    it("should log shell exec with non-zero exit code", () => {
      const entry: AuditEntryInput = {
        action: AuditEventType.SHELL_EXEC,
        tool_name: "exec",
        params: { command: "rm nonexistent" },
        result: { exit_code: 1, stderr: "No such file" },
        risk_level: "medium",
      };

      const record = service.log(entry);

      const parsedResult = JSON.parse(record.result!);
      expect(parsedResult.exit_code).toBe(1);
      expect(parsedResult.stderr).toBe("No such file");
    });
  });

  // -------------------------------------------------------------------------
  // TC-007-3: Audit record for permission decision
  // -------------------------------------------------------------------------
  describe("TC-007-3: permission decision audit record", () => {
    it("should log approved permission decision", () => {
      const entry: AuditEntryInput = {
        action: AuditEventType.PERMISSION_DECISION,
        tool_name: "delete_file",
        params: { path: "/home/user/old.txt" },
        result: { decision: "approved" },
        user_decision: "approved",
        risk_level: "high",
      };

      const record = service.log(entry);

      expect(record.action).toBe("permission_decision");
      expect(record.user_decision).toBe("approved");
      expect(record.risk_level).toBe("high");
    });

    it("should log denied permission decision", () => {
      const entry: AuditEntryInput = {
        action: AuditEventType.PERMISSION_DECISION,
        tool_name: "exec",
        params: { command: "rm -rf /" },
        user_decision: "denied",
        risk_level: "critical",
      };

      const record = service.log(entry);

      expect(record.action).toBe("permission_decision");
      expect(record.user_decision).toBe("denied");
      expect(record.risk_level).toBe("critical");
    });
  });

  // -------------------------------------------------------------------------
  // TC-007-4: Audit record for sandbox violation
  // -------------------------------------------------------------------------
  describe("TC-007-4: sandbox violation audit record", () => {
    it("should log sandbox violation with details", () => {
      const entry: AuditEntryInput = {
        action: AuditEventType.SANDBOX_VIOLATION,
        tool_name: "read_file",
        params: { path: "/etc/passwd" },
        result: { reason: "Path outside allowed_dirs", blocked: true },
        risk_level: "high",
      };

      const record = service.log(entry);

      expect(repo.save).toHaveBeenCalledOnce();
      expect(record.action).toBe("sandbox_violation");
      expect(record.risk_level).toBe("high");
      const parsedResult = JSON.parse(record.result!);
      expect(parsedResult.reason).toBe("Path outside allowed_dirs");
      expect(parsedResult.blocked).toBe(true);
    });

    it("should log sandbox violation for blocked pattern", () => {
      const entry: AuditEntryInput = {
        action: AuditEventType.SANDBOX_VIOLATION,
        tool_name: "read_file",
        params: { path: "/home/user/.ssh/id_rsa" },
        result: { reason: "Path matches blocked_pattern: ~/.ssh/**" },
        risk_level: "critical",
      };

      const record = service.log(entry);

      expect(record.action).toBe("sandbox_violation");
      expect(record.risk_level).toBe("critical");
    });
  });

  // -------------------------------------------------------------------------
  // TC-007-5: trace_id propagation
  // -------------------------------------------------------------------------
  describe("TC-007-5: trace_id propagation", () => {
    it("should propagate trace_id across multiple records in same request", () => {
      const ctx = TraceContext.create();

      TraceContext.runInContext(ctx, () => {
        const r1 = service.log({
          action: AuditEventType.TOOL_CALL,
          tool_name: "read_file",
        });
        const r2 = service.log({
          action: AuditEventType.FILE_ACCESS,
          params: { path: "/tmp/test.txt" },
        });
        const r3 = service.log({
          action: AuditEventType.SHELL_EXEC,
          params: { command: "cat /tmp/test.txt" },
        });

        // All records should share the same trace_id
        expect(r1.trace_id).toBe(ctx.trace_id);
        expect(r2.trace_id).toBe(ctx.trace_id);
        expect(r3.trace_id).toBe(ctx.trace_id);

        // All should have the same trace_id value
        expect(r1.trace_id).toBe(r2.trace_id);
        expect(r2.trace_id).toBe(r3.trace_id);
      });
    });

    it("should use explicit trace_id over TraceContext", () => {
      const ctx = TraceContext.create();

      TraceContext.runInContext(ctx, () => {
        const record = service.log({
          action: AuditEventType.TOOL_CALL,
          trace_id: "explicit-override",
        });

        expect(record.trace_id).toBe("explicit-override");
        expect(record.trace_id).not.toBe(ctx.trace_id);
      });
    });

    it("should set trace_id to null when no context and no explicit value", () => {
      const record = service.log({
        action: AuditEventType.TOOL_CALL,
      });

      expect(record.trace_id).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // TC-007-6: Query by trace_id
  // -------------------------------------------------------------------------
  describe("TC-007-6: query by trace_id", () => {
    it("should return all records for given trace_id", () => {
      const mockRecords: AuditRecord[] = [
        {
          id: "r1",
          session_id: "s1",
          chat_id: null,
          timestamp: "2026-03-30T10:00:00.000Z",
          trace_id: "trace-123",
          action: "tool_call",
          tool_name: "read_file",
          skill_name: null,
          params: "{}",
          result: null,
          user_decision: null,
          risk_level: "low",
        },
        {
          id: "r2",
          session_id: "s1",
          chat_id: null,
          timestamp: "2026-03-30T10:01:00.000Z",
          trace_id: "trace-123",
          action: "file_access",
          tool_name: null,
          skill_name: null,
          params: "{}",
          result: null,
          user_decision: null,
          risk_level: "low",
        },
      ];
      repo.query.mockReturnValue(mockRecords);

      const results = service.query({ trace_id: "trace-123" });

      expect(repo.query).toHaveBeenCalledWith({ trace_id: "trace-123" });
      expect(results).toHaveLength(2);
      expect(results[0]!.id).toBe("r1");
      expect(results[1]!.id).toBe("r2");
    });
  });

  // -------------------------------------------------------------------------
  // TC-007-7: Query by time range
  // -------------------------------------------------------------------------
  describe("TC-007-7: query by time range", () => {
    it("should delegate time range filter to repository", () => {
      const mockRecords: AuditRecord[] = [
        {
          id: "tr1",
          session_id: null,
          chat_id: null,
          timestamp: "2026-03-15T12:00:00.000Z",
          trace_id: null,
          action: "tool_call",
          tool_name: null,
          skill_name: null,
          params: "{}",
          result: null,
          user_decision: null,
          risk_level: "low",
        },
      ];
      repo.query.mockReturnValue(mockRecords);

      const results = service.query({
        from: "2026-03-01T00:00:00.000Z",
        to: "2026-03-31T23:59:59.000Z",
      });

      expect(repo.query).toHaveBeenCalledWith({
        from: "2026-03-01T00:00:00.000Z",
        to: "2026-03-31T23:59:59.000Z",
      });
      expect(results).toHaveLength(1);
    });
  });

  // -------------------------------------------------------------------------
  // TC-007-8: Query by risk_level
  // -------------------------------------------------------------------------
  describe("TC-007-8: query by risk_level", () => {
    it("should filter correctly by low risk_level", () => {
      const mockRecords: AuditRecord[] = [
        {
          id: "low-1",
          session_id: null,
          chat_id: null,
          timestamp: "2026-03-30T10:00:00.000Z",
          trace_id: null,
          action: "tool_call",
          tool_name: "read_file",
          skill_name: null,
          params: "{}",
          result: null,
          user_decision: null,
          risk_level: "low",
        },
      ];
      repo.query.mockReturnValue(mockRecords);

      const results = service.query({ risk_level: "low" });

      expect(repo.query).toHaveBeenCalledWith({ risk_level: "low" });
      expect(results).toHaveLength(1);
      expect(results[0]!.risk_level).toBe("low");
    });

    it("should filter correctly by high risk_level", () => {
      const mockRecords: AuditRecord[] = [
        {
          id: "high-1",
          session_id: null,
          chat_id: null,
          timestamp: "2026-03-30T10:00:00.000Z",
          trace_id: null,
          action: "sandbox_violation",
          tool_name: "read_file",
          skill_name: null,
          params: "{}",
          result: null,
          user_decision: null,
          risk_level: "high",
        },
        {
          id: "high-2",
          session_id: null,
          chat_id: null,
          timestamp: "2026-03-30T10:01:00.000Z",
          trace_id: null,
          action: "shell_exec",
          tool_name: "exec",
          skill_name: null,
          params: "{}",
          result: null,
          user_decision: null,
          risk_level: "high",
        },
      ];
      repo.query.mockReturnValue(mockRecords);

      const results = service.query({ risk_level: "high" });

      expect(results).toHaveLength(2);
      for (const r of results) {
        expect(r.risk_level).toBe("high");
      }
    });

    it("should filter correctly by critical risk_level", () => {
      const mockRecords: AuditRecord[] = [
        {
          id: "crit-1",
          session_id: null,
          chat_id: null,
          timestamp: "2026-03-30T10:00:00.000Z",
          trace_id: null,
          action: "sandbox_violation",
          tool_name: "read_file",
          skill_name: null,
          params: "{}",
          result: null,
          user_decision: null,
          risk_level: "critical",
        },
      ];
      repo.query.mockReturnValue(mockRecords);

      const results = service.query({ risk_level: "critical" });

      expect(results).toHaveLength(1);
      expect(results[0]!.risk_level).toBe("critical");
    });
  });

  // -------------------------------------------------------------------------
  // Additional: queryExtended
  // -------------------------------------------------------------------------
  describe("queryExtended", () => {
    it("should return AuditRecordExtended with parsed JSON params", () => {
      const mockRecords: AuditRecord[] = [
        {
          id: "ext-1",
          session_id: null,
          chat_id: null,
          timestamp: "2026-03-30T10:00:00.000Z",
          trace_id: null,
          action: "tool_call",
          tool_name: "read_file",
          skill_name: null,
          params: '{"path": "/tmp/test.txt"}',
          result: '{"content": "hello"}',
          user_decision: null,
          risk_level: "low",
        },
      ];
      repo.query.mockReturnValue(mockRecords);

      const results = service.queryExtended({});

      expect(results).toHaveLength(1);
      expect(results[0]!.params).toEqual({ path: "/tmp/test.txt" });
      expect(results[0]!.result).toEqual({ content: "hello" });
    });

    it("should handle non-JSON params gracefully", () => {
      const mockRecords: AuditRecord[] = [
        {
          id: "ext-2",
          session_id: null,
          chat_id: null,
          timestamp: "2026-03-30T10:00:00.000Z",
          trace_id: null,
          action: "tool_call",
          tool_name: "exec",
          skill_name: null,
          params: "not-valid-json",
          result: null,
          user_decision: null,
          risk_level: "low",
        },
      ];
      repo.query.mockReturnValue(mockRecords);

      const results = service.queryExtended({});

      expect(results).toHaveLength(1);
      expect(results[0]!.params).toBe("not-valid-json");
      expect(results[0]!.result).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // Additional: validation
  // -------------------------------------------------------------------------
  describe("validation", () => {
    it("should throw if action is missing", () => {
      expect(() => service.log({} as AuditEntryInput)).toThrow(
        "Audit entry validation failed: 'action' is required",
      );
    });

    it("should throw if action is null", () => {
      expect(() =>
        service.log({ action: null } as unknown as AuditEntryInput),
      ).toThrow("Audit entry validation failed: 'action' is required");
    });
  });

  // -------------------------------------------------------------------------
  // Additional: cleanup
  // -------------------------------------------------------------------------
  describe("cleanup", () => {
    it("should delegate cleanup to repository with ISO timestamp", () => {
      repo.cleanup.mockReturnValue(10);

      const deleted = service.cleanup("2026-01-01T00:00:00.000Z");

      expect(repo.cleanup).toHaveBeenCalledWith("2026-01-01T00:00:00.000Z");
      expect(deleted).toBe(10);
    });

    it("should return 0 when nothing to delete", () => {
      repo.cleanup.mockReturnValue(0);

      const deleted = service.cleanup("2020-01-01T00:00:00.000Z");

      expect(deleted).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // Additional: telegram_access event type
  // -------------------------------------------------------------------------
  describe("telegram_access event type", () => {
    it("should log telegram access event", () => {
      const entry: AuditEntryInput = {
        action: AuditEventType.TELEGRAM_ACCESS,
        params: { user_id: "12345", channel: "bot" },
        session_id: "tg-session-1",
        risk_level: "medium",
      };

      const record = service.log(entry);

      expect(record.action).toBe("telegram_access");
      expect(record.session_id).toBe("tg-session-1");
    });
  });

  // -------------------------------------------------------------------------
  // Additional: auto-generated UUID id
  // -------------------------------------------------------------------------
  describe("auto-generated ID", () => {
    it("should generate UUID v4 id when not provided", () => {
      const entry: AuditEntryInput = {
        action: AuditEventType.TOOL_CALL,
      };

      const result = service.log(entry);

      const uuidRegex =
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      expect(result.id).toMatch(uuidRegex);
    });

    it("should use provided id when available", () => {
      const entry: AuditEntryInput = {
        action: AuditEventType.TOOL_CALL,
        id: "custom-id-123",
      };

      const result = service.log(entry);

      expect(result.id).toBe("custom-id-123");
    });

    it("should generate unique ids for different calls", () => {
      const result1 = service.log({ action: AuditEventType.TOOL_CALL });
      const result2 = service.log({ action: AuditEventType.TOOL_CALL });

      expect(result1.id).not.toBe(result2.id);
    });
  });

  // -------------------------------------------------------------------------
  // Additional: default risk_level
  // -------------------------------------------------------------------------
  describe("default risk_level", () => {
    it("should default risk_level to 'low'", () => {
      const entry: AuditEntryInput = {
        action: AuditEventType.TOOL_CALL,
      };

      const result = service.log(entry);

      expect(result.risk_level).toBe("low");
    });
  });

  // -------------------------------------------------------------------------
  // Additional: circular reference handling
  // -------------------------------------------------------------------------
  describe("circular reference handling", () => {
    it("should handle circular references in params", () => {
      const circular: Record<string, unknown> = { name: "test" };
      circular.self = circular;

      const entry: AuditEntryInput = {
        action: AuditEventType.TOOL_CALL,
        params: circular,
      };

      const result = service.log(entry);

      expect(result.params).toContain("[Circular]");
    });

    it("should truncate large params", () => {
      const largeObj: Record<string, string> = {};
      for (let i = 0; i < 2000; i++) {
        largeObj[`key_${i}`] = "x".repeat(10);
      }

      const entry: AuditEntryInput = {
        action: AuditEventType.TOOL_CALL,
        params: largeObj,
      };

      const result = service.log(entry);

      expect(result.params.length).toBeLessThanOrEqual(10260);
      expect(result.params).toContain("...[truncated]");
    });
  });
});
