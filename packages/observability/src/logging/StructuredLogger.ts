/**
 * StructuredLogger -- structured logging with JSON (pino-style) and text format.
 *
 * Supports log levels, correlation IDs for request tracing,
 * and session-scoped child loggers. No external dependencies.
 */

export interface LogEntry {
  timestamp: string;
  level: 'debug' | 'info' | 'warn' | 'error' | 'fatal';
  message: string;
  sessionId?: string;
  correlationId?: string;
  module?: string;
  data?: Record<string, unknown>;
}

const LEVEL_PRIORITY: Record<string, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  fatal: 50,
};

export class StructuredLogger {
  private readonly minPriority: number;
  private readonly jsonFormat: boolean;
  private readonly enableCorrelationIds: boolean;
  private correlationId?: string;

  constructor(options?: { level?: string; jsonFormat?: boolean; correlationIds?: boolean }) {
    const level = options?.level ?? 'info';
    this.minPriority = LEVEL_PRIORITY[level] ?? LEVEL_PRIORITY['info']!;
    this.jsonFormat = options?.jsonFormat ?? true;
    this.enableCorrelationIds = options?.correlationIds ?? true;
  }

  debug(message: string, data?: Record<string, unknown>): void {
    this.log('debug', message, data);
  }

  info(message: string, data?: Record<string, unknown>): void {
    this.log('info', message, data);
  }

  warn(message: string, data?: Record<string, unknown>): void {
    this.log('warn', message, data);
  }

  error(message: string, data?: Record<string, unknown>): void {
    this.log('error', message, data);
  }

  fatal(message: string, data?: Record<string, unknown>): void {
    this.log('fatal', message, data);
  }

  createSessionLogger(sessionId: string): SessionLogger {
    return new SessionLogger(this, sessionId);
  }

  getCorrelationId(): string | undefined {
    return this.correlationId;
  }

  setCorrelationId(id: string): void {
    this.correlationId = id;
  }

  /** @internal -- called by SessionLogger */
  logWithSession(
    level: LogEntry['level'],
    message: string,
    sessionId: string,
    data?: Record<string, unknown>,
  ): void {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      sessionId,
    };
    if (this.enableCorrelationIds && this.correlationId) {
      entry.correlationId = this.correlationId;
    }
    if (data) {
      entry.data = data;
    }
    this.write(entry, level);
  }

  private log(level: LogEntry['level'], message: string, data?: Record<string, unknown>): void {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
    };
    if (this.enableCorrelationIds && this.correlationId) {
      entry.correlationId = this.correlationId;
    }
    if (data) {
      entry.data = data;
    }
    this.write(entry, level);
  }

  /** @internal */
  write(entry: LogEntry, level: string): void {
    if ((LEVEL_PRIORITY[level] ?? 0) < this.minPriority) {
      return;
    }
    const line = this.jsonFormat ? JSON.stringify(entry) : this.formatText(entry);
    process.stdout.write(line + '\n');
  }

  private formatText(entry: LogEntry): string {
    const ts = entry.timestamp;
    const lvl = entry.level.toUpperCase().padEnd(5);
    const corr = entry.correlationId ? ` [${entry.correlationId}]` : '';
    const session = entry.sessionId ? ` session=${entry.sessionId}` : '';
    const extra = entry.data ? ` ${JSON.stringify(entry.data)}` : '';
    return `${ts} ${lvl}${corr}${session} ${entry.message}${extra}`;
  }
}

export class SessionLogger {
  constructor(
    private readonly logger: StructuredLogger,
    private readonly sessionId: string,
  ) {}

  debug(message: string, data?: Record<string, unknown>): void {
    this.logger.logWithSession('debug', message, this.sessionId, data);
  }

  info(message: string, data?: Record<string, unknown>): void {
    this.logger.logWithSession('info', message, this.sessionId, data);
  }

  warn(message: string, data?: Record<string, unknown>): void {
    this.logger.logWithSession('warn', message, this.sessionId, data);
  }

  error(message: string, data?: Record<string, unknown>): void {
    this.logger.logWithSession('error', message, this.sessionId, data);
  }
}
