/**
 * Error Types for osaI
 *
 * Hierarchical error types with severity classification.
 * Base OsaIError is extended by domain-specific error types.
 */

// ---------------------------------------------------------------------------
// Severity Levels
// ---------------------------------------------------------------------------

export type Severity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

// ---------------------------------------------------------------------------
// Base Error
// ---------------------------------------------------------------------------

export interface OsaIError {
  code: string;
  message: string;
  severity: Severity;
}

// ---------------------------------------------------------------------------
// Domain-Specific Errors
// ---------------------------------------------------------------------------

export interface ModelError extends OsaIError {
  provider: string;
  statusCode: number;
  retryable: boolean;
}

export interface SandboxError extends OsaIError {
  operation: string;
  path?: string;
}

export interface SkillError extends OsaIError {
  skillName: string;
  toolName?: string;
}
