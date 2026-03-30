/**
 * @osai/observability -- Logger module (DOMAIN-010)
 *
 * pino structured JSON logging with:
 * - Log levels: error, warn, info, debug, trace
 * - stdout transport (dev) + file transport (~/.osai/logs/osai.log)
 * - Child logger with module/component context
 * - Correlation ID (trace_id) propagation
 * - Logger singleton (one instance per process)
 */

import pino from "pino";
import type { Logger as PinoLogger, DestinationStream } from "pino";
import { mkdirSync, createWriteStream, type WriteStream } from "node:fs";
import { homedir, hostname } from "node:os";
import { join } from "node:path";
import { TraceContext } from "./trace.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LoggerConfig {
  /** Minimum log level (default: "info") */
  level?: "error" | "warn" | "info" | "debug" | "trace";
  /** Override log directory (default: ~/.osai/logs) */
  logDir?: string;
  /** Enable file transport (default: true) */
  enableFileTransport?: boolean;
  /** Enable pretty stdout (default: true in dev) */
  prettyPrint?: boolean;
}

export interface ChildLoggerOptions {
  /** Module name (e.g. "agent", "gateway") */
  module: string;
  /** Optional component within module (e.g. "session", "router") */
  component?: string;
  /** Optional trace_id for correlation */
  trace_id?: string;
}

export type LogLevel = "error" | "warn" | "info" | "debug" | "trace";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const OSAI_DIR = join(homedir(), ".osai");
const DEFAULT_LOG_DIR = join(OSAI_DIR, "logs");
const LOG_FILE = "osai.log";

// ---------------------------------------------------------------------------
// LoggerFactory
// ---------------------------------------------------------------------------

/**
 * Factory for creating pino loggers.
 *
 * Usage:
 * ```ts
 * const logger = LoggerFactory.create({ module: "agent", component: "loop" });
 * logger.info("Agent loop started");
 * ```
 */
export class LoggerFactory {
  private static instance: PinoLogger | null = null;
  private static fileStream: WriteStream | null = null;

  /**
   * Get or create the root logger singleton.
   * Uses default configuration unless configure() was called earlier.
   */
  static getLogger(): PinoLogger {
    if (LoggerFactory.instance === null) {
      LoggerFactory.configure({});
    }
    return LoggerFactory.instance as PinoLogger;
  }

  /**
   * Configure and create the root logger.
   * This replaces the existing singleton if called again.
   */
  static configure(config: LoggerConfig = {}): PinoLogger {
    // Close previous file stream if exists
    if (LoggerFactory.fileStream !== null) {
      LoggerFactory.fileStream.end();
      LoggerFactory.fileStream = null;
    }

    const level: LogLevel = config.level ?? "info";
    const logDir = config.logDir ?? DEFAULT_LOG_DIR;
    const enableFileTransport = config.enableFileTransport ?? true;
    const prettyPrint = config.prettyPrint ?? true;

    // Ensure log directory exists
    mkdirSync(logDir, { recursive: true });

    // Build transport targets
    const streams: DestinationStream[] = [];

    // Stdout transport
    if (prettyPrint) {
      streams.push(
        pino.destination({
          dest: 1, // stdout
          sync: false,
        }),
      );
    } else {
      streams.push(
        pino.destination({
          dest: 1,
          sync: false,
        }),
      );
    }

    // File transport
    if (enableFileTransport) {
      const logFilePath = join(logDir, LOG_FILE);
      LoggerFactory.fileStream = createWriteStream(logFilePath, {
        flags: "a",
        encoding: "utf8",
      });
      streams.push(LoggerFactory.fileStream as unknown as DestinationStream);
    }

    // Create pino instance with multi-stream
    const rootLogger = pino(
      {
        level,
        timestamp: false,
        messageKey: "message",
        formatters: {
          level(label: string) {
            return { level: label };
          },
        },
        base: {
          pid: process.pid,
          hostname: hostname(),
        },
        mixin() {
          const ctx = TraceContext.get();
          const result: Record<string, unknown> = {
            timestamp: new Date().toISOString(),
          };
          if (ctx !== undefined) {
            result.trace_id = ctx.trace_id;
            result.span_id = ctx.span_id;
          }
          return result;
        },
      },
      pino.multistream(streams),
    );

    LoggerFactory.instance = rootLogger;
    return rootLogger;
  }

  /**
   * Create a child logger with module context.
   *
   * Each child logger has `module` and optional `component` fields
   * automatically included in every log entry.
   */
  static createChild(options: ChildLoggerOptions): PinoLogger {
    const root = LoggerFactory.getLogger();
    const bindings: Record<string, string> = {
      module: options.module,
    };

    if (options.component !== undefined) {
      bindings.component = options.component;
    }

    if (options.trace_id !== undefined) {
      bindings.trace_id = options.trace_id;
    }

    return root.child(bindings);
  }

  /**
   * Convenience shorthand: create a child logger with just a module name.
   */
  static create(module: string, component?: string): PinoLogger {
    return LoggerFactory.createChild({ module, component });
  }

  /**
   * Shut down the logger, closing file streams.
   * Returns a Promise that resolves when all streams are flushed.
   */
  static shutdown(): Promise<void> {
    const flushPromise = new Promise<void>((resolve) => {
      if (LoggerFactory.fileStream !== null) {
        const stream = LoggerFactory.fileStream;
        stream.end();
        stream.on("finish", () => {
          resolve();
        });
        // Safety timeout in case finish event is not emitted
        setTimeout(resolve, 500);
      } else {
        resolve();
      }
    });

    LoggerFactory.fileStream = null;
    LoggerFactory.instance = null;

    return flushPromise;
  }
}

// ---------------------------------------------------------------------------
// Default export: singleton getter
// ---------------------------------------------------------------------------

/**
 * Get the default root logger.
 *
 * This is a convenience shortcut for LoggerFactory.getLogger().
 * The logger is configured with defaults on first call.
 */
export function getLogger(): PinoLogger {
  return LoggerFactory.getLogger();
}

/**
 * Create a module-specific child logger.
 *
 * This is a convenience shortcut for LoggerFactory.create(module, component).
 */
export function createModuleLogger(
  module: string,
  component?: string,
): PinoLogger {
  return LoggerFactory.create(module, component);
}
