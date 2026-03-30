/**
 * Unit tests for @osai/observability logger module.
 *
 * Tests:
 * - TT-004-01: Logger creates structured JSON output
 * - TT-004-02: Logger supports all levels
 * - TT-004-03: Child logger inherits settings + module field
 * - TT-004-04: Correlation ID (trace_id) propagation
 * - TT-004-05: File transport writes to log directory
 * - TT-004-06: LoggerFactory creates unique child loggers
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, rmSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  LoggerFactory,
  getLogger,
  createModuleLogger,
  type LoggerConfig,
} from "./logger.js";
import { TraceContext } from "./trace.js";

describe("Logger", () => {
  const testLogDir = join(tmpdir(), `osai-logger-test-${process.pid}`);

  beforeEach(async () => {
    // Clean up any previous singleton
    await LoggerFactory.shutdown();
    // Ensure test log dir is clean
    if (existsSync(testLogDir)) {
      rmSync(testLogDir, { recursive: true, force: true });
    }
    mkdirSync(testLogDir, { recursive: true });
  });

  afterEach(async () => {
    await LoggerFactory.shutdown();
    // Clean up test log dir
    if (existsSync(testLogDir)) {
      rmSync(testLogDir, { recursive: true, force: true });
    }
  });

  // -------------------------------------------------------------------------
  // TT-004-01: Logger creates structured JSON output
  // -------------------------------------------------------------------------
  describe("TT-004-01: structured JSON output", () => {
    it("should produce log entries via all level methods", () => {
      const config: LoggerConfig = {
        level: "info",
        logDir: testLogDir,
        enableFileTransport: false,
        prettyPrint: false,
      };

      LoggerFactory.configure(config);
      const logger = LoggerFactory.getLogger();

      // Verify all level methods exist and are callable
      expect(logger).toBeDefined();
      expect(typeof logger.info).toBe("function");
      expect(typeof logger.error).toBe("function");
      expect(typeof logger.warn).toBe("function");
      expect(typeof logger.debug).toBe("function");
      expect(typeof logger.trace).toBe("function");

      // Should not throw
      expect(() => logger.info("test message")).not.toThrow();
    });

    it("should write structured JSON to file with timestamp, level, message", async () => {
      const config: LoggerConfig = {
        level: "info",
        logDir: testLogDir,
        enableFileTransport: true,
        prettyPrint: false,
      };

      LoggerFactory.configure(config);
      const logger = LoggerFactory.getLogger();
      logger.info("structured test message");

      // Flush and shutdown to ensure file is written
      await LoggerFactory.shutdown();

      const logFilePath = join(testLogDir, "osai.log");
      expect(existsSync(logFilePath)).toBe(true);

      const content = readFileSync(logFilePath, "utf8");
      const lines = content.trim().split("\n");
      expect(lines.length).toBeGreaterThanOrEqual(1);

      const entry = JSON.parse(lines[0] ?? "{}");
      expect(entry).toHaveProperty("timestamp");
      expect(entry).toHaveProperty("level");
      expect(entry).toHaveProperty("message");
      expect(entry.level).toBe("info");
      expect(entry.message).toBe("structured test message");
    });
  });

  // -------------------------------------------------------------------------
  // TT-004-02: Logger supports all levels
  // -------------------------------------------------------------------------
  describe("TT-004-02: log levels", () => {
    const levels = ["error", "warn", "info", "debug", "trace"] as const;

    it.each(levels)("should support '%s' level", (level) => {
      const config: LoggerConfig = {
        level,
        logDir: testLogDir,
        enableFileTransport: false,
        prettyPrint: false,
      };

      LoggerFactory.configure(config);
      const logger = LoggerFactory.getLogger();

      // Should not throw for any level
      expect(() => {
        logger[level](`test ${level} message`);
      }).not.toThrow();
    });

    it("should respect minimum log level", async () => {
      const config: LoggerConfig = {
        level: "warn",
        logDir: testLogDir,
        enableFileTransport: true,
        prettyPrint: false,
      };

      LoggerFactory.configure(config);
      const logger = LoggerFactory.getLogger();

      logger.error("error message");
      logger.warn("warn message");
      logger.info("info message -- should be silent");
      logger.debug("debug message -- should be silent");
      logger.trace("trace message -- should be silent");

      await LoggerFactory.shutdown();

      const logFilePath = join(testLogDir, "osai.log");
      const content = readFileSync(logFilePath, "utf8");
      const lines = content
        .trim()
        .split("\n")
        .filter((l) => l.length > 0);

      const entryLevels = lines.map((l) => {
        const entry = JSON.parse(l);
        return entry.level as string;
      });

      expect(entryLevels).toContain("error");
      expect(entryLevels).toContain("warn");
      expect(entryLevels).not.toContain("info");
      expect(entryLevels).not.toContain("debug");
      expect(entryLevels).not.toContain("trace");
    });
  });

  // -------------------------------------------------------------------------
  // TT-004-03: Child logger inherits settings + module field
  // -------------------------------------------------------------------------
  describe("TT-004-03: child logger", () => {
    it("should create child logger with module field", async () => {
      const config: LoggerConfig = {
        level: "info",
        logDir: testLogDir,
        enableFileTransport: true,
        prettyPrint: false,
      };

      LoggerFactory.configure(config);
      const childLogger = LoggerFactory.create("agent");
      childLogger.info("child test message");

      await LoggerFactory.shutdown();

      const logFilePath = join(testLogDir, "osai.log");
      const content = readFileSync(logFilePath, "utf8");
      const entry = JSON.parse(content.trim().split("\n")[0] ?? "{}");

      expect(entry.module).toBe("agent");
      expect(entry.message).toBe("child test message");
    });

    it("should include component field when provided", async () => {
      const config: LoggerConfig = {
        level: "info",
        logDir: testLogDir,
        enableFileTransport: true,
        prettyPrint: false,
      };

      LoggerFactory.configure(config);
      const childLogger = LoggerFactory.create("agent", "loop");
      childLogger.info("component test");

      await LoggerFactory.shutdown();

      const logFilePath = join(testLogDir, "osai.log");
      const content = readFileSync(logFilePath, "utf8");
      const entry = JSON.parse(content.trim().split("\n")[0] ?? "{}");

      expect(entry.module).toBe("agent");
      expect(entry.component).toBe("loop");
    });

    it("should inherit log level from parent", async () => {
      const config: LoggerConfig = {
        level: "error",
        logDir: testLogDir,
        enableFileTransport: true,
        prettyPrint: false,
      };

      LoggerFactory.configure(config);
      const childLogger = LoggerFactory.create("gateway");

      childLogger.error("should appear");
      childLogger.info("should be silent");

      await LoggerFactory.shutdown();

      const logFilePath = join(testLogDir, "osai.log");
      const content = readFileSync(logFilePath, "utf8");
      const lines = content
        .trim()
        .split("\n")
        .filter((l) => l.length > 0);
      const entryLevels = lines.map((l) => JSON.parse(l).level as string);

      expect(entryLevels).toContain("error");
      expect(entryLevels).not.toContain("info");
    });
  });

  // -------------------------------------------------------------------------
  // TT-004-04: Correlation ID (trace_id) propagation
  // -------------------------------------------------------------------------
  describe("TT-004-04: correlation ID", () => {
    it("should include trace_id in log entries", async () => {
      const config: LoggerConfig = {
        level: "info",
        logDir: testLogDir,
        enableFileTransport: true,
        prettyPrint: false,
      };

      LoggerFactory.configure(config);
      const childLogger = LoggerFactory.createChild({
        module: "agent",
        trace_id: "trace-abc-123",
      });
      childLogger.info("correlation test");

      await LoggerFactory.shutdown();

      const logFilePath = join(testLogDir, "osai.log");
      const content = readFileSync(logFilePath, "utf8");
      const entry = JSON.parse(content.trim().split("\n")[0] ?? "{}");

      expect(entry.trace_id).toBe("trace-abc-123");
      expect(entry.module).toBe("agent");
    });

    it("should not include trace_id when not provided", async () => {
      const config: LoggerConfig = {
        level: "info",
        logDir: testLogDir,
        enableFileTransport: true,
        prettyPrint: false,
      };

      LoggerFactory.configure(config);
      const childLogger = LoggerFactory.createChild({
        module: "gateway",
      });
      childLogger.info("no trace_id test");

      await LoggerFactory.shutdown();

      const logFilePath = join(testLogDir, "osai.log");
      const content = readFileSync(logFilePath, "utf8");
      const entry = JSON.parse(content.trim().split("\n")[0] ?? "{}");

      expect(entry.trace_id).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // TT-004-05: File transport writes to log directory
  // -------------------------------------------------------------------------
  describe("TT-004-05: file transport", () => {
    it("should create osai.log file in log directory", async () => {
      const config: LoggerConfig = {
        level: "info",
        logDir: testLogDir,
        enableFileTransport: true,
        prettyPrint: false,
      };

      LoggerFactory.configure(config);
      const logger = LoggerFactory.getLogger();
      logger.info("file transport test");
      await LoggerFactory.shutdown();

      const logFilePath = join(testLogDir, "osai.log");
      expect(existsSync(logFilePath)).toBe(true);

      const content = readFileSync(logFilePath, "utf8");
      expect(content.length).toBeGreaterThan(0);

      const entry = JSON.parse(content.trim().split("\n")[0] ?? "{}");
      expect(entry.message).toBe("file transport test");
    });

    it("should not create log file when file transport is disabled", async () => {
      const config: LoggerConfig = {
        level: "info",
        logDir: testLogDir,
        enableFileTransport: false,
        prettyPrint: false,
      };

      LoggerFactory.configure(config);
      const logger = LoggerFactory.getLogger();
      logger.info("no file transport");
      await LoggerFactory.shutdown();

      const logFilePath = join(testLogDir, "osai.log");
      expect(existsSync(logFilePath)).toBe(false);
    });

    it("should append to existing log file", async () => {
      const config: LoggerConfig = {
        level: "info",
        logDir: testLogDir,
        enableFileTransport: true,
        prettyPrint: false,
      };

      // First write
      LoggerFactory.configure(config);
      const logger1 = LoggerFactory.getLogger();
      logger1.info("first message");
      await LoggerFactory.shutdown();

      // Second write (should append)
      LoggerFactory.configure(config);
      const logger2 = LoggerFactory.getLogger();
      logger2.info("second message");
      await LoggerFactory.shutdown();

      const logFilePath = join(testLogDir, "osai.log");
      const content = readFileSync(logFilePath, "utf8");
      const lines = content
        .trim()
        .split("\n")
        .filter((l) => l.length > 0);

      expect(lines.length).toBe(2);

      const entry1 = JSON.parse(lines[0] ?? "{}");
      const entry2 = JSON.parse(lines[1] ?? "{}");
      expect(entry1.message).toBe("first message");
      expect(entry2.message).toBe("second message");
    });
  });

  // -------------------------------------------------------------------------
  // TT-004-06: LoggerFactory creates unique child loggers
  // -------------------------------------------------------------------------
  describe("TT-004-06: unique child loggers", () => {
    it("should create child loggers with different module fields", async () => {
      const config: LoggerConfig = {
        level: "info",
        logDir: testLogDir,
        enableFileTransport: true,
        prettyPrint: false,
      };

      LoggerFactory.configure(config);

      const agentLogger = LoggerFactory.create("agent");
      const gatewayLogger = LoggerFactory.create("gateway");
      const memoryLogger = LoggerFactory.create("memory", "rag");

      agentLogger.info("agent message");
      gatewayLogger.info("gateway message");
      memoryLogger.info("memory message");

      await LoggerFactory.shutdown();

      const logFilePath = join(testLogDir, "osai.log");
      const content = readFileSync(logFilePath, "utf8");
      const lines = content
        .trim()
        .split("\n")
        .filter((l) => l.length > 0);

      expect(lines.length).toBe(3);

      const modules = lines.map((l) => JSON.parse(l).module as string);
      expect(modules).toContain("agent");
      expect(modules).toContain("gateway");
      expect(modules).toContain("memory");

      const memoryEntry = lines.find(
        (l) => JSON.parse(l).module === "memory",
      );
      expect(memoryEntry).toBeDefined();
      expect(JSON.parse(memoryEntry ?? "{}").component).toBe("rag");
    });

    it("should allow multiple child loggers with same module name", async () => {
      const config: LoggerConfig = {
        level: "info",
        logDir: testLogDir,
        enableFileTransport: true,
        prettyPrint: false,
      };

      LoggerFactory.configure(config);

      const logger1 = LoggerFactory.create("agent", "loop");
      const logger2 = LoggerFactory.create("agent", "hooks");

      logger1.info("loop message");
      logger2.info("hooks message");

      await LoggerFactory.shutdown();

      const logFilePath = join(testLogDir, "osai.log");
      const content = readFileSync(logFilePath, "utf8");
      const lines = content
        .trim()
        .split("\n")
        .filter((l) => l.length > 0);

      const components = lines.map(
        (l) => JSON.parse(l).component as string,
      );
      expect(components).toContain("loop");
      expect(components).toContain("hooks");
    });
  });

  // -------------------------------------------------------------------------
  // Singleton behavior
  // -------------------------------------------------------------------------
  describe("singleton", () => {
    it("getLogger() should return the same instance", () => {
      const config: LoggerConfig = {
        level: "info",
        logDir: testLogDir,
        enableFileTransport: false,
        prettyPrint: false,
      };

      LoggerFactory.configure(config);
      const logger1 = LoggerFactory.getLogger();
      const logger2 = LoggerFactory.getLogger();

      expect(logger1).toBe(logger2);
    });

    it("shutdown() should clear singleton", async () => {
      const config: LoggerConfig = {
        level: "info",
        logDir: testLogDir,
        enableFileTransport: false,
        prettyPrint: false,
      };

      LoggerFactory.configure(config);
      const logger1 = LoggerFactory.getLogger();
      await LoggerFactory.shutdown();

      // After shutdown, next getLogger() should create a new instance
      const logger2 = LoggerFactory.getLogger();
      expect(logger1).not.toBe(logger2);
    });

    it("configure() should replace existing singleton", () => {
      const config1: LoggerConfig = {
        level: "error",
        logDir: testLogDir,
        enableFileTransport: false,
        prettyPrint: false,
      };

      const config2: LoggerConfig = {
        level: "debug",
        logDir: testLogDir,
        enableFileTransport: false,
        prettyPrint: false,
      };

      LoggerFactory.configure(config1);
      const logger1 = LoggerFactory.getLogger();

      LoggerFactory.configure(config2);
      const logger2 = LoggerFactory.getLogger();

      // configure() replaces the singleton
      expect(logger1).not.toBe(logger2);
    });
  });

  // -------------------------------------------------------------------------
  // Convenience functions
  // -------------------------------------------------------------------------
  describe("convenience functions", () => {
    it("getLogger() should return a pino logger", () => {
      LoggerFactory.configure({
        level: "info",
        logDir: testLogDir,
        enableFileTransport: false,
        prettyPrint: false,
      });

      const logger = getLogger();
      expect(logger).toBeDefined();
      expect(typeof logger.info).toBe("function");
    });

    it("createModuleLogger() should return child logger with module", async () => {
      const config: LoggerConfig = {
        level: "info",
        logDir: testLogDir,
        enableFileTransport: true,
        prettyPrint: false,
      };

      LoggerFactory.configure(config);
      const logger = createModuleLogger("providers", "failover");
      logger.info("module logger test");

      await LoggerFactory.shutdown();

      const logFilePath = join(testLogDir, "osai.log");
      const content = readFileSync(logFilePath, "utf8");
      const entry = JSON.parse(content.trim().split("\n")[0] ?? "{}");

      expect(entry.module).toBe("providers");
      expect(entry.component).toBe("failover");
    });
  });

  // =========================================================================
  // T-002: TraceContext correlation IDs mixin
  // =========================================================================

  // -------------------------------------------------------------------------
  // T-002-01: mixin injects trace_id/span_id from TraceContext
  // -------------------------------------------------------------------------
  describe("T-002-01: TraceContext mixin", () => {
    it("should inject trace_id and span_id from AsyncLocalStorage into log entries", async () => {
      const config: LoggerConfig = {
        level: "info",
        logDir: testLogDir,
        enableFileTransport: true,
        prettyPrint: false,
      };

      LoggerFactory.configure(config);
      const logger = LoggerFactory.create("agent", "loop");

      const ctx = TraceContext.create();
      await TraceContext.runInContext(ctx, async () => {
        logger.info("message with auto trace");
      });

      await LoggerFactory.shutdown();

      const logFilePath = join(testLogDir, "osai.log");
      const content = readFileSync(logFilePath, "utf8");
      const entry = JSON.parse(content.trim().split("\n")[0] ?? "{}");

      expect(entry.trace_id).toBe(ctx.trace_id);
      expect(entry.span_id).toBe(ctx.span_id);
      expect(entry.message).toBe("message with auto trace");
    });

    it("should include both trace_id and span_id in each log entry", async () => {
      const config: LoggerConfig = {
        level: "info",
        logDir: testLogDir,
        enableFileTransport: true,
        prettyPrint: false,
      };

      LoggerFactory.configure(config);
      const logger = LoggerFactory.create("gateway");

      const ctx: { trace_id: string; span_id: string } = {
        trace_id: "aaaaaaaa-bbbb-4ccc-dddd-eeeeeeeeeeee",
        span_id: "1111222233334444",
      };

      await TraceContext.runInContext(ctx, async () => {
        logger.info("first");
        logger.warn("second");
        logger.error("third");
      });

      await LoggerFactory.shutdown();

      const logFilePath = join(testLogDir, "osai.log");
      const content = readFileSync(logFilePath, "utf8");
      const lines = content
        .trim()
        .split("\n")
        .filter((l) => l.length > 0);

      expect(lines.length).toBe(3);

      for (const line of lines) {
        const entry = JSON.parse(line);
        expect(entry.trace_id).toBe("aaaaaaaa-bbbb-4ccc-dddd-eeeeeeeeeeee");
        expect(entry.span_id).toBe("1111222233334444");
      }
    });
  });

  // -------------------------------------------------------------------------
  // T-002-02: no trace context -- entries without trace_id/span_id
  // -------------------------------------------------------------------------
  describe("T-002-02: no trace context", () => {
    it("should not include trace_id/span_id when no TraceContext is set", async () => {
      const config: LoggerConfig = {
        level: "info",
        logDir: testLogDir,
        enableFileTransport: true,
        prettyPrint: false,
      };

      LoggerFactory.configure(config);
      const logger = LoggerFactory.create("agent");
      logger.info("no trace context message");

      await LoggerFactory.shutdown();

      const logFilePath = join(testLogDir, "osai.log");
      const content = readFileSync(logFilePath, "utf8");
      const entry = JSON.parse(content.trim().split("\n")[0] ?? "{}");

      expect(entry.message).toBe("no trace context message");
      expect(entry.module).toBe("agent");
      // trace_id and span_id should not be present or should be undefined
      // When no context, mixin returns empty object, so no trace fields
      expect(entry.trace_id).toBeUndefined();
      expect(entry.span_id).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // T-002-03: TraceContext mixin takes precedence over manual trace_id
  // -------------------------------------------------------------------------
  describe("T-002-03: TraceContext mixin precedence", () => {
    it("should override manual trace_id from ChildLoggerOptions with TraceContext", async () => {
      const config: LoggerConfig = {
        level: "info",
        logDir: testLogDir,
        enableFileTransport: true,
        prettyPrint: false,
      };

      LoggerFactory.configure(config);
      const logger = LoggerFactory.createChild({
        module: "agent",
        trace_id: "manual-trace-123",
      });

      const asyncCtx: { trace_id: string; span_id: string } = {
        trace_id: "async-trace-456",
        span_id: "1234567890abcdef",
      };

      await TraceContext.runInContext(asyncCtx, async () => {
        logger.info("precedence test");
      });

      await LoggerFactory.shutdown();

      const logFilePath = join(testLogDir, "osai.log");
      const content = readFileSync(logFilePath, "utf8");
      const entry = JSON.parse(content.trim().split("\n")[0] ?? "{}");

      // TraceContext mixin takes precedence over manual binding
      expect(entry.trace_id).toBe("async-trace-456");
      expect(entry.span_id).toBe("1234567890abcdef");
      expect(entry.module).toBe("agent");
    });

    it("should use manual trace_id when no TraceContext is set", async () => {
      const config: LoggerConfig = {
        level: "info",
        logDir: testLogDir,
        enableFileTransport: true,
        prettyPrint: false,
      };

      LoggerFactory.configure(config);
      const logger = LoggerFactory.createChild({
        module: "agent",
        trace_id: "manual-trace-123",
      });
      logger.info("fallback test");

      await LoggerFactory.shutdown();

      const logFilePath = join(testLogDir, "osai.log");
      const content = readFileSync(logFilePath, "utf8");
      const entry = JSON.parse(content.trim().split("\n")[0] ?? "{}");

      // When no TraceContext, manual trace_id from binding is present
      expect(entry.trace_id).toBe("manual-trace-123");
      expect(entry.module).toBe("agent");
    });
  });

  // -------------------------------------------------------------------------
  // T-002-04: context changes are reflected in subsequent log entries
  // -------------------------------------------------------------------------
  describe("T-002-04: dynamic context changes", () => {
    it("should reflect TraceContext changes within same runInContext", async () => {
      const config: LoggerConfig = {
        level: "info",
        logDir: testLogDir,
        enableFileTransport: true,
        prettyPrint: false,
      };

      LoggerFactory.configure(config);
      const logger = LoggerFactory.create("agent");

      const ctx1: { trace_id: string; span_id: string } = {
        trace_id: "trace-context-one",
        span_id: "aaaa1111aaaa1111",
      };

      const ctx2: { trace_id: string; span_id: string } = {
        trace_id: "trace-context-two",
        span_id: "bbbb2222bbbb2222",
      };

      await TraceContext.runInContext(ctx1, async () => {
        logger.info("in ctx1");
        // set() overrides within the same store
        TraceContext.set(ctx2);
        logger.info("in ctx2");
      });

      await LoggerFactory.shutdown();

      const logFilePath = join(testLogDir, "osai.log");
      const content = readFileSync(logFilePath, "utf8");
      const lines = content
        .trim()
        .split("\n")
        .filter((l) => l.length > 0);

      expect(lines.length).toBe(2);

      const entry1 = JSON.parse(lines[0] ?? "{}");
      const entry2 = JSON.parse(lines[1] ?? "{}");

      expect(entry1.trace_id).toBe("trace-context-one");
      expect(entry1.span_id).toBe("aaaa1111aaaa1111");
      expect(entry2.trace_id).toBe("trace-context-two");
      expect(entry2.span_id).toBe("bbbb2222bbbb2222");
    });
  });

  // -------------------------------------------------------------------------
  // T-002-05: root logger also gets trace context via mixin
  // -------------------------------------------------------------------------
  describe("T-002-05: root logger trace context", () => {
    it("should inject trace_id/span_id into root logger entries", async () => {
      const config: LoggerConfig = {
        level: "info",
        logDir: testLogDir,
        enableFileTransport: true,
        prettyPrint: false,
      };

      LoggerFactory.configure(config);
      const logger = LoggerFactory.getLogger();

      const ctx = TraceContext.create();
      await TraceContext.runInContext(ctx, async () => {
        logger.info("root logger with trace");
      });

      await LoggerFactory.shutdown();

      const logFilePath = join(testLogDir, "osai.log");
      const content = readFileSync(logFilePath, "utf8");
      const entry = JSON.parse(content.trim().split("\n")[0] ?? "{}");

      expect(entry.trace_id).toBe(ctx.trace_id);
      expect(entry.span_id).toBe(ctx.span_id);
    });
  });
});
