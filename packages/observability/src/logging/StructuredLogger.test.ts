import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StructuredLogger } from './StructuredLogger.js';

describe('StructuredLogger', () => {
  let logger: StructuredLogger;

  beforeEach(() => {
    logger = new StructuredLogger({ level: 'debug', jsonFormat: true });
  });

  describe('log levels', () => {
    it('should create log entries with correct levels', () => {
      const written: Array<{ entry: Record<string, unknown>; level: string }> = [];
      vi.spyOn(logger as any, 'write').mockImplementation(
        (...args: unknown[]) => {
          const entry = args[0] as Record<string, unknown>;
          const level = args[1] as string;
          written.push({ entry, level });
        },
      );

      logger.debug('debug message');
      logger.info('info message');
      logger.warn('warn message');
      logger.error('error message');
      logger.fatal('fatal message');

      expect(written).toHaveLength(5);
      expect(written[0]?.entry).toMatchObject({ level: 'debug', message: 'debug message' });
      expect(written[1]?.entry).toMatchObject({ level: 'info', message: 'info message' });
      expect(written[2]?.entry).toMatchObject({ level: 'warn', message: 'warn message' });
      expect(written[3]?.entry).toMatchObject({ level: 'error', message: 'error message' });
      expect(written[4]?.entry).toMatchObject({ level: 'fatal', message: 'fatal message' });
    });
  });

  describe('JSON format', () => {
    it('should output structured JSON entries', () => {
      const output: string[] = [];
      const consoleSpy = vi.spyOn(process.stdout, 'write').mockImplementation((data: any) => {
        output.push(data);
        return true;
      });

      logger.info('test message', { key: 'value' });

      consoleSpy.mockRestore();

      const entry = JSON.parse(output[0]!);
      expect(entry.level).toBe('info');
      expect(entry.message).toBe('test message');
      expect(entry.data).toEqual({ key: 'value' });
      expect(entry.timestamp).toBeDefined();
    });

    it('should output text format when jsonFormat is false', () => {
      const textLogger = new StructuredLogger({ level: 'info', jsonFormat: false });
      const output: string[] = [];
      const consoleSpy = vi.spyOn(process.stdout, 'write').mockImplementation((data: any) => {
        output.push(data);
        return true;
      });

      textLogger.info('hello world');

      consoleSpy.mockRestore();

      expect(output[0]).toContain('INFO');
      expect(output[0]).toContain('hello world');
    });
  });

  describe('log level filtering', () => {
    it('should respect minimum log level', () => {
      const warnLogger = new StructuredLogger({ level: 'warn', jsonFormat: true });
      const output: string[] = [];
      const consoleSpy = vi.spyOn(process.stdout, 'write').mockImplementation((data: any) => {
        output.push(data);
        return true;
      });

      warnLogger.debug('should not appear');
      warnLogger.info('should not appear');
      warnLogger.warn('should appear');
      warnLogger.error('should appear');

      consoleSpy.mockRestore();

      expect(output.length).toBe(2);
      const entries = output.map((o) => JSON.parse(o));
      expect(entries[0]?.level).toBe('warn');
      expect(entries[1]?.level).toBe('error');
    });
  });

  describe('data payload', () => {
    it('should include data in log entries', () => {
      const output: string[] = [];
      const consoleSpy = vi.spyOn(process.stdout, 'write').mockImplementation((data: any) => {
        output.push(data);
        return true;
      });

      logger.info('operation completed', { duration: 150, result: 'success' });

      consoleSpy.mockRestore();

      const entry = JSON.parse(output[0]!);
      expect(entry.data).toEqual({ duration: 150, result: 'success' });
    });
  });

  describe('correlation ID', () => {
    it('should set and get correlation ID', () => {
      expect(logger.getCorrelationId()).toBeUndefined();

      logger.setCorrelationId('corr-123');
      expect(logger.getCorrelationId()).toBe('corr-123');
    });

    it('should include correlation ID in log entries when set', () => {
      const output: string[] = [];
      const consoleSpy = vi.spyOn(process.stdout, 'write').mockImplementation((data: any) => {
        output.push(data);
        return true;
      });

      logger.setCorrelationId('corr-abc');
      logger.info('traced message');

      consoleSpy.mockRestore();

      const entry = JSON.parse(output[0]!);
      expect(entry.correlationId).toBe('corr-abc');
    });

    it('should not include correlation ID when not set and correlationIds disabled', () => {
      const noCorrLogger = new StructuredLogger({
        level: 'info',
        jsonFormat: true,
        correlationIds: false,
      });
      const output: string[] = [];
      const consoleSpy = vi.spyOn(process.stdout, 'write').mockImplementation((data: any) => {
        output.push(data);
        return true;
      });

      noCorrLogger.info('message');

      consoleSpy.mockRestore();

      const entry = JSON.parse(output[0]!);
      expect(entry.correlationId).toBeUndefined();
    });
  });

  describe('session logger', () => {
    it('should create session-scoped logger', () => {
      const sessionLogger = logger.createSessionLogger('session-42');
      expect(sessionLogger).toBeDefined();
      expect(typeof sessionLogger.info).toBe('function');
    });

    it('should include sessionId in session log entries', () => {
      const output: string[] = [];
      const consoleSpy = vi.spyOn(process.stdout, 'write').mockImplementation((data: any) => {
        output.push(data);
        return true;
      });

      const sessionLogger = logger.createSessionLogger('session-99');
      sessionLogger.info('session message');

      consoleSpy.mockRestore();

      const entry = JSON.parse(output[0]!);
      expect(entry.sessionId).toBe('session-99');
      expect(entry.level).toBe('info');
      expect(entry.message).toBe('session message');
    });

    it('should propagate correlation ID to session logger', () => {
      const output: string[] = [];
      const consoleSpy = vi.spyOn(process.stdout, 'write').mockImplementation((data: any) => {
        output.push(data);
        return true;
      });

      logger.setCorrelationId('corr-xyz');
      const sessionLogger = logger.createSessionLogger('session-1');
      sessionLogger.warn('session warning');

      consoleSpy.mockRestore();

      const entry = JSON.parse(output[0]!);
      expect(entry.correlationId).toBe('corr-xyz');
      expect(entry.sessionId).toBe('session-1');
    });

    it('should support all log levels on session logger', () => {
      const output: string[] = [];
      const consoleSpy = vi.spyOn(process.stdout, 'write').mockImplementation((data: any) => {
        output.push(data);
        return true;
      });

      const sl = logger.createSessionLogger('s1');
      sl.debug('d');
      sl.info('i');
      sl.warn('w');
      sl.error('e');

      consoleSpy.mockRestore();

      expect(output.length).toBe(4);
      const entries = output.map((o) => JSON.parse(o));
      expect(entries[0]?.level).toBe('debug');
      expect(entries[1]?.level).toBe('info');
      expect(entries[2]?.level).toBe('warn');
      expect(entries[3]?.level).toBe('error');
    });
  });
});
