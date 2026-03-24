/**
 * @osai/skills-core -- Types specific to skills-core
 *
 * Defines security, sandbox, and operation types used by bundled skill implementations.
 */

// ---------------------------------------------------------------------------
// File Operation Types
// ---------------------------------------------------------------------------

export type FileOperation = 'read' | 'write' | 'delete' | 'move' | 'list' | 'search';

export interface PathValidationResult {
  valid: boolean;
  resolvedPath?: string;
  error?: string;
}

export interface FileSandboxConfig {
  allowedDirs: string[];
  blockedPatterns: string[];
}

// ---------------------------------------------------------------------------
// Shell Security Types
// ---------------------------------------------------------------------------

export interface CommandValidationResult {
  valid: boolean;
  sanitized?: string;
  error?: string;
}

export interface ShellSecurityConfig {
  blockedCommands: string[];
  timeout: number;
}

// ---------------------------------------------------------------------------
// Skills Core Configuration
// ---------------------------------------------------------------------------

export interface SkillsCoreConfig {
  filesystem?: {
    allowedDirs: string[];
    blockedPatterns?: string[];
  };
  shell?: {
    blockedCommands?: string[];
    timeout?: number;
  };
  http?: {
    maxTimeout?: number;
    blockedHosts?: string[];
  };
  browser?: {
    enabled?: boolean;
  };
}
