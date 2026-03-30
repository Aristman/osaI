/**
 * @osai/skills-core -- Shell Security Types (DOMAIN-003, T-003)
 *
 * Type definitions for shell command validation, security configuration,
 * and command execution logging.
 */

// --- Blocked Command ---

/**
 * A blocked command pattern definition.
 * Supports exact string matching and glob-style wildcard patterns.
 */
export interface BlockedCommand {
  /** Human-readable description of why this command is blocked */
  readonly reason: string;
  /**
   * The pattern to match against the stripped command.
   * If contains '*', it is treated as a wildcard pattern.
   * Otherwise, exact match is performed.
   */
  readonly pattern: string;
}

// --- Validation Result ---

/**
 * Result of command validation.
 */
export interface AllowedResult {
  /** Whether the command is allowed */
  readonly allowed: boolean;
  /** Reason for blocking (undefined when allowed=true) */
  readonly reason?: string;
}

// --- Execution Log Entry ---

/**
 * Log entry for a shell command execution.
 * Recorded for every command that passes validation.
 */
export interface CommandLogEntry {
  /** The shell command that was executed */
  readonly command: string;
  /** Working directory at time of execution */
  readonly cwd: string;
  /** Exit code of the process (-1 for timeout/kill) */
  readonly exitCode: number;
  /** ISO 8601 timestamp of execution */
  readonly timestamp: string;
  /** Execution duration in milliseconds */
  readonly durationMs: number;
  /** Whether the command was killed due to timeout */
  readonly timedOut: boolean;
}

// --- Shell Security Config ---

/**
 * Configuration for Shell Security module.
 * Loaded from osai.json (security.shell.*) with defaults applied.
 */
export interface ShellSecurityConfig {
  /**
   * Default timeout for command execution in milliseconds.
   * Default: 120000 (120 seconds).
   */
  readonly timeoutMs: number;

  /**
   * Hardcoded blocked command patterns.
   * These are always active and cannot be removed by user config.
   */
  readonly blockedCommands: readonly BlockedCommand[];

  /**
   * User-configurable additional blocked command patterns.
   * Merged with hardcoded list (user patterns cannot override hardcoded).
   */
  readonly userBlockedCommands: readonly BlockedCommand[];

  /**
   * Working directory for command execution.
   */
  readonly cwd: string;
}

/**
 * Partial config from osai.json (security.shell section).
 */
export interface ShellSecurityUserConfig {
  readonly timeoutMs?: number;
  readonly blockedCommands?: readonly string[];
  readonly cwd?: string;
}
