/**
 * @osai/agent -- Error Handler
 *
 * Central error handling: classification, retry decisions,
 * exponential backoff, error logging, and on_error hook integration.
 */

import type { HookPoint, HookContext } from '../types.js';
import {
  AgentError,
  TransientError,
  PermanentError,
} from './AgentError.js';

// ---------------------------------------------------------------------------
// Minimal interface for HookManager integration
// (Full HookManager implemented in T-002; here we only depend on the shape.)
// ---------------------------------------------------------------------------

export interface IHookManager {
  executeHooks(hookPoint: HookPoint, context: HookContext): Promise<HookContext | null>;
}

// ---------------------------------------------------------------------------
// Error log entry
// ---------------------------------------------------------------------------

export interface ErrorLogEntry {
  error: AgentError;
  timestamp: Date;
  context?: string;
}

// ---------------------------------------------------------------------------
// Network error detection helpers
// ---------------------------------------------------------------------------

function isNetworkError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const msg = error.message.toLowerCase();
  const code = (error as NodeJS.ErrnoException).code ?? '';

  const networkCodes = new Set([
    'ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND',
    'ENETUNREACH', 'EPIPE', 'EAI_AGAIN', 'UND_ERR_CONNECT_TIMEOUT',
  ]);

  if (networkCodes.has(code)) return true;

  const networkKeywords = [
    'network', 'econnrefused', 'econnreset', 'socket hang up',
    'fetch failed', 'timeout', 'abort', 'connection refused',
  ];

  return networkKeywords.some((kw) => msg.includes(kw));
}

function isAuthError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const msg = error.message.toLowerCase();
  const code = (error as { statusCode?: number }).statusCode
    ?? (error as { status?: number }).status
    ?? 0;

  if (code === 401 || code === 403) return true;

  const authKeywords = ['unauthorized', 'forbidden', 'authentication', 'invalid api key'];
  return authKeywords.some((kw) => msg.includes(kw));
}

// ---------------------------------------------------------------------------
// ErrorHandler
// ---------------------------------------------------------------------------

const DEFAULT_MAX_RETRIES = 3;
const MAX_BACKOFF_MS = 30_000;
const JITTER_MAX_MS = 200;

export class ErrorHandler {
  private hookManager: IHookManager | null = null;
  private errorLog: ErrorLogEntry[] = [];
  private maxRetries: number;

  constructor(maxRetries: number = DEFAULT_MAX_RETRIES) {
    this.maxRetries = maxRetries;
  }

  // ---- HookManager integration ------------------------------------------------

  setHookManager(hookManager: IHookManager): void {
    this.hookManager = hookManager;
  }

  // ---- Error classification ---------------------------------------------------

  classify(error: unknown): AgentError {
    // Already an AgentError -- pass through
    if (error instanceof AgentError) {
      return error;
    }

    // Standard Error subtypes -- classify by content
    if (error instanceof Error) {
      if (isAuthError(error)) {
        return new PermanentError(error.message, error);
      }
      if (isNetworkError(error)) {
        return new TransientError(error.message, error);
      }
      // Unknown Error -- treat as transient (may resolve on retry)
      return new TransientError(error.message, error);
    }

    // Non-Error values (string, number, etc.) -- wrap in TransientError
    const message = typeof error === 'string'
      ? error
      : `Unknown error: ${String(error)}`;
    return new TransientError(message);
  }

  // ---- Retry logic -----------------------------------------------------------

  shouldRetry(error: AgentError, attemptCount: number): boolean {
    return error.retryable && attemptCount < this.maxRetries;
  }

  // ---- Exponential backoff ---------------------------------------------------

  getBackoffDelay(attemptCount: number, baseDelay: number = 1000): number {
    const exponentialDelay = baseDelay * Math.pow(2, attemptCount);
    const jitter = Math.random() * JITTER_MAX_MS;
    return Math.min(exponentialDelay + jitter, MAX_BACKOFF_MS);
  }

  // ---- Error handling pipeline -----------------------------------------------

  async handle(error: unknown, sessionId?: string): Promise<void> {
    const agentError = this.classify(error);

    // Log the error
    const entry: ErrorLogEntry = {
      error: agentError,
      timestamp: new Date(),
      context: sessionId,
    };
    this.errorLog.push(entry);

    // Trigger on_error hook for critical errors
    if (
      agentError.severity === 'critical' &&
      this.hookManager !== null &&
      sessionId !== undefined
    ) {
      try {
        await this.hookManager.executeHooks('on_error', {
          hookPoint: 'on_error',
          sessionId,
          data: {
            error: agentError,
            message: agentError.message,
            severity: agentError.severity,
            code: agentError.code,
          },
          abort: false,
        });
      } catch {
        // Silently ignore hook execution failures to prevent recursive errors
      }
    }
  }

  // ---- Error log access ------------------------------------------------------

  getErrorLog(): ErrorLogEntry[] {
    return [...this.errorLog];
  }

  clearLog(): void {
    this.errorLog = [];
  }
}
