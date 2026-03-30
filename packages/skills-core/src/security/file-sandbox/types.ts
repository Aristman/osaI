/**
 * @osai/skills-core -- File Sandbox Types (DOMAIN-003, T-001)
 *
 * FileSandboxConfig: configuration for path validation.
 * SandboxResult: result of a sandbox validation check.
 */

/**
 * Configuration for the FileSandbox.
 *
 * @property allowedDirs - Whitelist of directories that are permitted for file operations.
 *   Paths are resolved via path.resolve() and must be absolute.
 * @property blockedPatterns - Glob-like patterns that are always blocked, regardless of allowedDirs.
 *   Patterns use minimatch-style matching against the normalized path.
 */
export interface FileSandboxConfig {
  readonly allowedDirs: readonly string[];
  readonly blockedPatterns: readonly string[];
}

/**
 * Result of a file sandbox validation check.
 *
 * @property allowed - Whether the path is permitted for the requested operation.
 * @property path - The original (unresolved) path that was checked.
 * @property resolvedPath - The resolved real path after symlink resolution (if available).
 * @property error - Human-readable error message when allowed is false.
 * @property violationType - Category of the sandbox violation, if any.
 */
export interface SandboxResult {
  readonly allowed: boolean;
  readonly path: string;
  readonly resolvedPath: string | null;
  readonly error?: string;
  readonly violationType?: 'not_in_allowed_dirs' | 'blocked_pattern' | 'symlink_escape';
}
