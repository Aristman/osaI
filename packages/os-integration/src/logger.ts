/**
 * @osai/os-integration -- Module logger
 *
 * Provides a child pino logger for this package.
 * Falls back to console-based logger if observability is unavailable.
 */

import type { Logger as PinoLogger } from "pino";

let _logger: PinoLogger | null = null;

/**
 * Set the logger instance. Called by the application bootstrap.
 */
export function setLogger(logger: PinoLogger): void {
  _logger = logger;
}

/**
 * Get the module child logger.
 * Returns a child logger with module="os-integration" and optional component.
 *
 * If no logger has been set via setLogger(), returns a basic console-based
 * logger shim that satisfies the PinoLogger interface.
 */
export function getLogger(component?: string): PinoLogger {
  if (_logger !== null) {
    if (component !== undefined) {
      return _logger.child({ component });
    }
    return _logger;
  }

  // Fallback: basic console logger shim for environments where
  // observability is not yet initialized (tests, standalone usage)
  return createConsoleLoggerShim(component);
}

function createConsoleLoggerShim(component?: string): PinoLogger {
  const prefix = component
    ? `[os-integration:${component}]`
    : "[os-integration]";

  return {
    level: "info",
    silent: false,
    info: (msg: string, ...args: unknown[]) =>
      console.info(prefix, msg, ...args),
    warn: (msg: string, ...args: unknown[]) =>
      console.warn(prefix, msg, ...args),
    error: (msg: string, ...args: unknown[]) =>
      console.error(prefix, msg, ...args),
    debug: (msg: string, ...args: unknown[]) =>
      console.debug(prefix, msg, ...args),
    trace: (msg: string, ...args: unknown[]) =>
      console.debug(prefix, msg, ...args),
    fatal: (msg: string, ...args: unknown[]) =>
      console.error(prefix, msg, ...args),
    child: () => createConsoleLoggerShim(component),
    // Minimal pino API surface
  } as unknown as PinoLogger;
}
