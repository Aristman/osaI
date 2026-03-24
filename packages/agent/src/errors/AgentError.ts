/**
 * @osai/agent -- Error Hierarchy
 *
 * Base error classes for the Agent Runtime error handling system.
 * All errors extend AgentError which carries severity, retryability, and code.
 */

// ---------------------------------------------------------------------------
// Severity levels
// ---------------------------------------------------------------------------

export type ErrorSeverity = 'low' | 'medium' | 'high' | 'critical';

// ---------------------------------------------------------------------------
// Base AgentError
// ---------------------------------------------------------------------------

export class AgentError extends Error {
  public readonly severity: ErrorSeverity;
  public readonly retryable: boolean;
  public readonly code?: string;

  constructor(
    message: string,
    severity: ErrorSeverity = 'medium',
    retryable: boolean = false,
    code?: string,
  ) {
    super(message);
    this.name = 'AgentError';
    this.severity = severity;
    this.retryable = retryable;
    this.code = code;
  }
}

// ---------------------------------------------------------------------------
// TransientError -- temporary failures that may resolve on retry
// ---------------------------------------------------------------------------

export class TransientError extends AgentError {
  public readonly cause?: Error;

  constructor(message: string, cause?: Error) {
    super(message, 'medium', true, 'TRANSIENT');
    this.name = 'TransientError';
    this.cause = cause;
  }
}

// ---------------------------------------------------------------------------
// PermanentError -- failures that will not resolve on retry
// ---------------------------------------------------------------------------

export class PermanentError extends AgentError {
  public readonly cause?: Error;

  constructor(message: string, cause?: Error) {
    super(message, 'high', false, 'PERMANENT');
    this.name = 'PermanentError';
    this.cause = cause;
  }
}

// ---------------------------------------------------------------------------
// CriticalError -- severe failures requiring immediate attention
// ---------------------------------------------------------------------------

export class CriticalError extends AgentError {
  public readonly cause?: Error;

  constructor(message: string, cause?: Error) {
    super(message, 'critical', false, 'CRITICAL');
    this.name = 'CriticalError';
    this.cause = cause;
  }
}

// ---------------------------------------------------------------------------
// ValidationError -- input validation failures (low severity)
// ---------------------------------------------------------------------------

export class ValidationError extends AgentError {
  public readonly field?: string;

  constructor(message: string, field?: string) {
    super(message, 'low', false, 'VALIDATION');
    this.name = 'ValidationError';
    this.field = field;
  }
}

// ---------------------------------------------------------------------------
// TimeoutError -- operation exceeded allowed time
// ---------------------------------------------------------------------------

export class TimeoutError extends AgentError {
  public readonly timeoutMs: number;

  constructor(message: string, timeoutMs: number) {
    super(message, 'medium', true, 'TIMEOUT');
    this.name = 'TimeoutError';
    this.timeoutMs = timeoutMs;
  }
}

// ---------------------------------------------------------------------------
// ContextOverflowError -- context exceeds model token limit
// ---------------------------------------------------------------------------

export class ContextOverflowError extends AgentError {
  public readonly currentTokens: number;
  public readonly maxTokens: number;

  constructor(message: string, currentTokens: number, maxTokens: number) {
    super(message, 'high', false, 'CONTEXT_OVERFLOW');
    this.name = 'ContextOverflowError';
    this.currentTokens = currentTokens;
    this.maxTokens = maxTokens;
  }
}
