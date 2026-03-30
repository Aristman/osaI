/**
 * Unit tests for @osai/observability AuditLogRepository (T-004)
 *
 * Tests use mock DatabaseManager (better-sqlite3) for unit isolation.
 *
 * Tests:
 * - TC-004-01: create() inserts a record
 * - TC-004-02: query() by trace_id
 * - TC-004-03: query() by session_id
 * - TC-004-04: query() with time filter (from/to)
 * - TC-004-05: query() with limit
 * - TC-004-06: cleanup() deletes old records
 * - Additional: parameterized queries
 * - Additional: empty query result
 * - Additional: multiple filters combined
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { DatabaseManager } from "@osai/shared";
import { runMigrations } from "@osai/shared";
import { AuditLogRepository } from "./audit-repository.js";
import type { AuditRecord } from "./audit.js";
import { AuditAction } from "./audit.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createTestRecord(overrides: Partial<AuditRecord> = {}): AuditRecord {
  return {
    id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    session_id: null,
    chat_id: null,
    timestamp: new Date().toISOString(),
    trace_id: null,
    action: AuditAction.TOOL_CALL,
    tool_name: null,
    skill_name: null,
    params: "{}",
    result: null,
    user_decision: null,
    risk_level: "low",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("AuditLogRepository", () => {
  let manager: DatabaseManager;
  let repository: AuditLogRepository;
  let testDir: string;

  beforeEach(() => {
    testDir = path.join(os.tmpdir(), `osai-audit-repo-test-${process.pid}-${Date.now()}`);
    fs.mkdirSync(testDir, { recursive: true });

    const dbPath = path.join(testDir, "osai.db");
    manager = new DatabaseManager({ dbPath });
    manager.initialize();
    runMigrations(manager.getDb());

    repository = new AuditLogRepository(manager.getDb());
  });

  afterEach(() => {
    manager.close();
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  // -------------------------------------------------------------------------
  // TC-004-01: save() inserts a record
  // -------------------------------------------------------------------------
  describe("TC-004-01: save() inserts a record", () => {
    it("should persist a record and make it queryable by id", () => {
      const record = createTestRecord({
        id: "test-001",
        action: AuditAction.TOOL_CALL,
        tool_name: "read_file",
        params: JSON.stringify({ path: "/tmp/test.txt" }),
      });

      repository.save(record);

      const results = repository.query({ trace_id: "_nonexistent_" });

      // Verify it was inserted (no exception)
      expect(results).toBeDefined();

      // Query directly via SQL to confirm
      const row = manager
        .getDb()
        .prepare("SELECT * FROM osai_audit_log WHERE id = ?")
        .get("test-001") as AuditRecord | undefined;

      expect(row).toBeDefined();
      expect(row!.id).toBe("test-001");
      expect(row!.action).toBe("TOOL_CALL");
      expect(row!.tool_name).toBe("read_file");
      expect(row!.params).toBe(JSON.stringify({ path: "/tmp/test.txt" }));
    });

    it("should persist all record fields correctly", () => {
      const record = createTestRecord({
        id: "test-all-fields",
        session_id: "sess-123",
        chat_id: "chat-456",
        timestamp: "2026-03-30T12:00:00.000Z",
        trace_id: "trace-789",
        action: AuditAction.PERMISSION_RESPONSE,
        tool_name: "delete_file",
        skill_name: "filesystem",
        params: JSON.stringify({ path: "/tmp/old" }),
        result: JSON.stringify({ deleted: true }),
        user_decision: "approved",
        risk_level: "critical",
      });

      repository.save(record);

      const row = manager
        .getDb()
        .prepare("SELECT * FROM osai_audit_log WHERE id = ?")
        .get("test-all-fields") as AuditRecord | undefined;

      expect(row).toBeDefined();
      expect(row!.session_id).toBe("sess-123");
      expect(row!.chat_id).toBe("chat-456");
      expect(row!.timestamp).toBe("2026-03-30T12:00:00.000Z");
      expect(row!.trace_id).toBe("trace-789");
      expect(row!.action).toBe("PERMISSION_RESPONSE");
      expect(row!.tool_name).toBe("delete_file");
      expect(row!.skill_name).toBe("filesystem");
      expect(row!.result).toBe(JSON.stringify({ deleted: true }));
      expect(row!.user_decision).toBe("approved");
      expect(row!.risk_level).toBe("critical");
    });
  });

  // -------------------------------------------------------------------------
  // TC-004-02: query() by trace_id
  // -------------------------------------------------------------------------
  describe("TC-004-02: query() by trace_id", () => {
    it("should filter records by trace_id", () => {
      repository.save(createTestRecord({ id: "r1", trace_id: "trace-A", action: AuditAction.TOOL_CALL }));
      repository.save(createTestRecord({ id: "r2", trace_id: "trace-B", action: AuditAction.FILE_ACCESS }));
      repository.save(createTestRecord({ id: "r3", trace_id: "trace-A", action: AuditAction.SHELL_EXEC }));

      const results = repository.query({ trace_id: "trace-A" });

      expect(results).toHaveLength(2);
      const ids = results.map((r) => r.id);
      expect(ids).toContain("r1");
      expect(ids).toContain("r3");
      expect(ids).not.toContain("r2");
    });
  });

  // -------------------------------------------------------------------------
  // TC-004-03: query() by session_id
  // -------------------------------------------------------------------------
  describe("TC-004-03: query() by session_id", () => {
    it("should filter records by session_id", () => {
      repository.save(createTestRecord({ id: "s1", session_id: "session-1", action: AuditAction.TOOL_CALL }));
      repository.save(createTestRecord({ id: "s2", session_id: "session-2", action: AuditAction.TOOL_CALL }));
      repository.save(createTestRecord({ id: "s3", session_id: "session-1", action: AuditAction.AGENT_START }));

      const results = repository.query({ session_id: "session-1" });

      expect(results).toHaveLength(2);
      const ids = results.map((r) => r.id);
      expect(ids).toContain("s1");
      expect(ids).toContain("s3");
    });
  });

  // -------------------------------------------------------------------------
  // TC-004-04: query() with time filter
  // -------------------------------------------------------------------------
  describe("TC-004-04: query() with time filter", () => {
    it("should filter records by from timestamp", () => {
      repository.save(createTestRecord({
        id: "t1",
        timestamp: "2026-01-01T00:00:00.000Z",
        action: AuditAction.TOOL_CALL,
      }));
      repository.save(createTestRecord({
        id: "t2",
        timestamp: "2026-06-15T12:00:00.000Z",
        action: AuditAction.TOOL_CALL,
      }));
      repository.save(createTestRecord({
        id: "t3",
        timestamp: "2026-12-31T23:59:59.000Z",
        action: AuditAction.TOOL_CALL,
      }));

      const results = repository.query({ from: "2026-06-01T00:00:00.000Z" });

      expect(results).toHaveLength(2);
      const ids = results.map((r) => r.id);
      expect(ids).toContain("t2");
      expect(ids).toContain("t3");
    });

    it("should filter records by to timestamp", () => {
      repository.save(createTestRecord({
        id: "t1",
        timestamp: "2026-01-01T00:00:00.000Z",
        action: AuditAction.TOOL_CALL,
      }));
      repository.save(createTestRecord({
        id: "t2",
        timestamp: "2026-06-15T12:00:00.000Z",
        action: AuditAction.TOOL_CALL,
      }));
      repository.save(createTestRecord({
        id: "t3",
        timestamp: "2026-12-31T23:59:59.000Z",
        action: AuditAction.TOOL_CALL,
      }));

      const results = repository.query({ to: "2026-06-30T23:59:59.000Z" });

      expect(results).toHaveLength(2);
      const ids = results.map((r) => r.id);
      expect(ids).toContain("t1");
      expect(ids).toContain("t2");
    });

    it("should filter records by from and to (range)", () => {
      repository.save(createTestRecord({
        id: "t1",
        timestamp: "2026-01-01T00:00:00.000Z",
        action: AuditAction.TOOL_CALL,
      }));
      repository.save(createTestRecord({
        id: "t2",
        timestamp: "2026-06-15T12:00:00.000Z",
        action: AuditAction.TOOL_CALL,
      }));
      repository.save(createTestRecord({
        id: "t3",
        timestamp: "2026-12-31T23:59:59.000Z",
        action: AuditAction.TOOL_CALL,
      }));

      const results = repository.query({
        from: "2026-03-01T00:00:00.000Z",
        to: "2026-09-30T23:59:59.000Z",
      });

      expect(results).toHaveLength(1);
      expect(results[0]!.id).toBe("t2");
    });
  });

  // -------------------------------------------------------------------------
  // TC-004-05: query() with limit
  // -------------------------------------------------------------------------
  describe("TC-004-05: query() with limit", () => {
    it("should return at most limit records", () => {
      for (let i = 0; i < 10; i++) {
        repository.save(createTestRecord({
          id: `limit-${i}`,
          action: AuditAction.TOOL_CALL,
          timestamp: `2026-01-${String(i + 1).padStart(2, "0")}T12:00:00.000Z`,
        }));
      }

      const results = repository.query({ limit: 5 });

      expect(results).toHaveLength(5);
    });

    it("should order by timestamp DESC", () => {
      repository.save(createTestRecord({
        id: "early",
        timestamp: "2026-01-01T00:00:00.000Z",
        action: AuditAction.TOOL_CALL,
      }));
      repository.save(createTestRecord({
        id: "late",
        timestamp: "2026-12-31T23:59:59.000Z",
        action: AuditAction.TOOL_CALL,
      }));

      const results = repository.query({ limit: 2 });

      expect(results[0]!.id).toBe("late");
      expect(results[1]!.id).toBe("early");
    });
  });

  // -------------------------------------------------------------------------
  // TC-004-06: cleanup() deletes old records
  // -------------------------------------------------------------------------
  describe("TC-004-06: cleanup() deletes old records", () => {
    it("should delete records older than the specified timestamp", () => {
      repository.save(createTestRecord({
        id: "old-1",
        timestamp: "2025-01-01T00:00:00.000Z",
        action: AuditAction.TOOL_CALL,
      }));
      repository.save(createTestRecord({
        id: "old-2",
        timestamp: "2025-06-15T00:00:00.000Z",
        action: AuditAction.TOOL_CALL,
      }));
      repository.save(createTestRecord({
        id: "new-1",
        timestamp: "2026-06-15T00:00:00.000Z",
        action: AuditAction.TOOL_CALL,
      }));
      repository.save(createTestRecord({
        id: "new-2",
        timestamp: "2026-12-31T00:00:00.000Z",
        action: AuditAction.TOOL_CALL,
      }));

      const deleted = repository.cleanup("2026-01-01T00:00:00.000Z");

      expect(deleted).toBe(2);

      // Verify only new records remain
      const remaining = repository.query({});
      expect(remaining).toHaveLength(2);
      const ids = remaining.map((r) => r.id);
      expect(ids).toContain("new-1");
      expect(ids).toContain("new-2");
    });

    it("should return 0 when no records are old enough", () => {
      repository.save(createTestRecord({
        id: "recent",
        timestamp: "2026-06-15T00:00:00.000Z",
        action: AuditAction.TOOL_CALL,
      }));

      const deleted = repository.cleanup("2026-01-01T00:00:00.000Z");

      expect(deleted).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // Additional: empty query result
  // -------------------------------------------------------------------------
  describe("empty results", () => {
    it("should return empty array when no records match", () => {
      const results = repository.query({ session_id: "nonexistent" });

      expect(results).toEqual([]);
    });

    it("should return empty array when table is empty", () => {
      const results = repository.query({});

      expect(results).toEqual([]);
    });
  });

  // -------------------------------------------------------------------------
  // Additional: multiple filters combined
  // -------------------------------------------------------------------------
  describe("multiple filters", () => {
    it("should combine session_id and action filters", () => {
      repository.save(createTestRecord({
        id: "m1",
        session_id: "sess-1",
        action: AuditAction.TOOL_CALL,
      }));
      repository.save(createTestRecord({
        id: "m2",
        session_id: "sess-1",
        action: AuditAction.FILE_ACCESS,
      }));
      repository.save(createTestRecord({
        id: "m3",
        session_id: "sess-2",
        action: AuditAction.TOOL_CALL,
      }));

      const results = repository.query({
        session_id: "sess-1",
        action: "TOOL_CALL",
      });

      expect(results).toHaveLength(1);
      expect(results[0]!.id).toBe("m1");
    });

    it("should filter by chat_id", () => {
      repository.save(createTestRecord({
        id: "c1",
        chat_id: "chat-A",
        action: AuditAction.TOOL_CALL,
      }));
      repository.save(createTestRecord({
        id: "c2",
        chat_id: "chat-B",
        action: AuditAction.TOOL_CALL,
      }));

      const results = repository.query({ chat_id: "chat-A" });

      expect(results).toHaveLength(1);
      expect(results[0]!.id).toBe("c1");
    });

    it("should filter by tool_name", () => {
      repository.save(createTestRecord({
        id: "tn1",
        tool_name: "read_file",
        action: AuditAction.TOOL_CALL,
      }));
      repository.save(createTestRecord({
        id: "tn2",
        tool_name: "write_file",
        action: AuditAction.TOOL_CALL,
      }));

      const results = repository.query({ tool_name: "read_file" });

      expect(results).toHaveLength(1);
      expect(results[0]!.id).toBe("tn1");
    });

    it("should filter by skill_name", () => {
      repository.save(createTestRecord({
        id: "sk1",
        skill_name: "filesystem",
        action: AuditAction.TOOL_CALL,
      }));
      repository.save(createTestRecord({
        id: "sk2",
        skill_name: "shell",
        action: AuditAction.SHELL_EXEC,
      }));

      const results = repository.query({ skill_name: "filesystem" });

      expect(results).toHaveLength(1);
      expect(results[0]!.id).toBe("sk1");
    });

    it("should filter by risk_level", () => {
      repository.save(createTestRecord({
        id: "rl1",
        risk_level: "low",
        action: AuditAction.TOOL_CALL,
      }));
      repository.save(createTestRecord({
        id: "rl2",
        risk_level: "critical",
        action: AuditAction.SHELL_EXEC,
      }));

      const results = repository.query({ risk_level: "critical" });

      expect(results).toHaveLength(1);
      expect(results[0]!.id).toBe("rl2");
    });

    it("should combine three filters", () => {
      repository.save(createTestRecord({
        id: "tf1",
        session_id: "s1",
        action: AuditAction.TOOL_CALL,
        risk_level: "low",
      }));
      repository.save(createTestRecord({
        id: "tf2",
        session_id: "s1",
        action: AuditAction.TOOL_CALL,
        risk_level: "high",
      }));
      repository.save(createTestRecord({
        id: "tf3",
        session_id: "s1",
        action: AuditAction.FILE_ACCESS,
        risk_level: "low",
      }));

      const results = repository.query({
        session_id: "s1",
        action: "TOOL_CALL",
        risk_level: "low",
      });

      expect(results).toHaveLength(1);
      expect(results[0]!.id).toBe("tf1");
    });
  });
});
