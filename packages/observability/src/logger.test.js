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
import { LoggerFactory, getLogger, createModuleLogger, } from "./logger.js";
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
            const config = {
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
            const config = {
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
        const levels = ["error", "warn", "info", "debug", "trace"];
        it.each(levels)("should support '%s' level", (level) => {
            const config = {
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
            const config = {
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
                return entry.level;
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
            const config = {
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
            const config = {
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
            const config = {
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
            const entryLevels = lines.map((l) => JSON.parse(l).level);
            expect(entryLevels).toContain("error");
            expect(entryLevels).not.toContain("info");
        });
    });
    // -------------------------------------------------------------------------
    // TT-004-04: Correlation ID (trace_id) propagation
    // -------------------------------------------------------------------------
    describe("TT-004-04: correlation ID", () => {
        it("should include trace_id in log entries", async () => {
            const config = {
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
            const config = {
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
            const config = {
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
            const config = {
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
            const config = {
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
            const config = {
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
            const modules = lines.map((l) => JSON.parse(l).module);
            expect(modules).toContain("agent");
            expect(modules).toContain("gateway");
            expect(modules).toContain("memory");
            const memoryEntry = lines.find((l) => JSON.parse(l).module === "memory");
            expect(memoryEntry).toBeDefined();
            expect(JSON.parse(memoryEntry ?? "{}").component).toBe("rag");
        });
        it("should allow multiple child loggers with same module name", async () => {
            const config = {
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
            const components = lines.map((l) => JSON.parse(l).component);
            expect(components).toContain("loop");
            expect(components).toContain("hooks");
        });
    });
    // -------------------------------------------------------------------------
    // Singleton behavior
    // -------------------------------------------------------------------------
    describe("singleton", () => {
        it("getLogger() should return the same instance", () => {
            const config = {
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
            const config = {
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
            const config1 = {
                level: "error",
                logDir: testLogDir,
                enableFileTransport: false,
                prettyPrint: false,
            };
            const config2 = {
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
            const config = {
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
});
//# sourceMappingURL=logger.test.js.map