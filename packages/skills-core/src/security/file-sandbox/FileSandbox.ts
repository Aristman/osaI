/**
 * @osai/skills-core -- File Sandbox (DOMAIN-003, T-001)
 *
 * Validates file paths against a whitelist of allowed directories
 * and a list of blocked patterns. Integrates with SymlinkResolver
 * to prevent symlink-based sandbox escapes.
 */

import path from 'node:path';
import os from 'node:os';
import { SymlinkResolver } from './SymlinkResolver.js';
import type { FileSandboxConfig, SandboxResult } from './types.js';

/**
 * Default blocked patterns that are always enforced.
 * These protect sensitive system and user directories regardless
 * of the allowedDirs configuration.
 */
export const DEFAULT_BLOCKED_PATTERNS: ReadonlyArray<string> = Object.freeze([
  '~/.ssh/**',
  '~/.gnupg/**',
  '/etc/**',
  '/boot/**',
]);

/**
 * Expand leading ~ to the user's home directory.
 * Handles both ~/... and ~ forms.
 *
 * @param pattern - Pattern that may start with ~
 * @returns Pattern with ~ expanded to the home directory
 */
function expandHomeDir(pattern: string): string {
  if (pattern === '~') {
    return os.homedir();
  }
  if (pattern.startsWith('~/')) {
    return path.join(os.homedir(), pattern.slice(2));
  }
  return pattern;
}

/**
 * Convert a minimatch-style pattern to a function that tests
 * whether a given path matches the pattern.
 *
 * Supports:
 * - ** as recursive wildcard (matches any depth)
 * - * as single-level wildcard (matches within a path segment)
 * - Exact matches when no wildcard present
 *
 * This is a minimal implementation that avoids an external dependency
 * (no minimatch). For full glob support, integrate minimatch later.
 *
 * @param pattern - The pattern string (may contain ~, **, *)
 * @returns A matcher function that returns true if the path matches
 */
function createPatternMatcher(pattern: string): (testPath: string) => boolean {
  const expanded = expandHomeDir(pattern);
  // Use path.resolve to ensure absolute path on all platforms (e.g. /etc -> C:\etc on Windows)
  const normalizedPattern = path.normalize(path.resolve(expanded));

  // Escape regex special characters, then convert wildcards
  const escaped = normalizedPattern.replace(/[.+^${}()|[\]\\]/g, '\\$&');

  // Replace ** with regex for "any path segments"
  // Replace remaining * with "any characters within segment"
  const regexStr = escaped
    .replace(/\*\*/g, '{{DOUBLESTAR}}')
    .replace(/\*/g, '[^/\\\\]*')  // * matches within a segment
    .replace(/\{\{DOUBLESTAR\}\}/g, '.*'); // ** matches across segments

  const regex = new RegExp(`^${regexStr}$`);
  return (testPath: string) => regex.test(testPath);
}

/**
 * File sandbox that validates paths against allowed directories
 * and blocked patterns.
 *
 * Validation pipeline:
 * 1. Normalize the input path (path.resolve + path.normalize)
 * 2. Check against blocked_patterns (exact and glob matching)
 * 3. Resolve symlinks via SymlinkResolver
 * 4. Check resolved path against allowed_dirs
 * 5. Return SandboxResult with allowed/disallowed decision
 *
 * The symlink resolution happens AFTER the blocked pattern check
 * and BEFORE the allowed_dirs check to ensure the real path is
 * what gets validated (TOCTOU prevention).
 */
export class FileSandbox {
  private readonly config: FileSandboxConfig;
  private readonly symlinkResolver: SymlinkResolver;
  private readonly blockedMatchers: ReadonlyArray<(p: string) => boolean>;

  /**
   * Create a new FileSandbox instance.
   *
   * @param config - Sandbox configuration with allowed dirs and blocked patterns
   */
  constructor(config: FileSandboxConfig) {
    this.config = config;
    this.symlinkResolver = new SymlinkResolver();
    this.blockedMatchers = config.blockedPatterns.map(createPatternMatcher);
  }

  /**
   * Validate a file path against the sandbox rules.
   *
   * Pipeline:
   * 1. Normalize path via path.resolve() + path.normalize()
   * 2. Check blocked_patterns (early exit on match)
   * 3. Resolve symlinks via fs.realpath() (with fallback on non-existent paths)
   * 4. Check resolved path is within allowed_dirs
   *
   * @param filePath - The file path to validate
   * @returns SandboxResult with validation outcome
   */
  validate(filePath: string): SandboxResult {
    const normalizedPath = path.normalize(path.resolve(filePath));

    // Step 1: Check blocked patterns
    const blockedMatch = this.checkBlockedPatterns(normalizedPath);
    if (blockedMatch) {
      return {
        allowed: false,
        path: filePath,
        resolvedPath: null,
        error: `Path matches blocked pattern: '${blockedMatch}'`,
        violationType: 'blocked_pattern',
      };
    }

    // Step 2: Resolve symlinks (gracefully handle non-existent paths)
    let resolvedPath: string | null = null;
    try {
      resolvedPath = this.symlinkResolver.resolveRealPath(normalizedPath);
    } catch {
      // Path does not exist on disk -- use the normalized path for allowed_dirs check.
      // This allows creating new files within allowed dirs.
      resolvedPath = normalizedPath;
    }

    // Step 3: Check allowed_dirs
    if (!this.symlinkResolver.isWithinAllowedDirs(resolvedPath, this.config.allowedDirs)) {
      return {
        allowed: false,
        path: filePath,
        resolvedPath,
        error: `Path '${filePath}' is not within any allowed directory`,
        violationType: 'not_in_allowed_dirs',
      };
    }

    // Step 4: Detect symlink escape (resolved path left allowed dirs)
    // This case is caught by isWithinAllowedDirs above, but we add
    // a specific violationType for clarity when symlink escape is detected.
    // The check above already covers this, so this is just for completeness.
    // If the original normalized path would be allowed but resolved is not,
    // it's a symlink escape.

    return {
      allowed: true,
      path: filePath,
      resolvedPath,
    };
  }

  /**
   * Check if a normalized path matches any blocked pattern.
   *
   * @param normalizedPath - The normalized path to check
   * @returns The matching pattern string, or undefined if no match
   */
  private checkBlockedPatterns(normalizedPath: string): string | undefined {
    for (let i = 0; i < this.blockedMatchers.length; i++) {
      if (this.blockedMatchers[i]!(normalizedPath)) {
        return this.config.blockedPatterns[i]!;
      }
    }
    return undefined;
  }

  /**
   * Create a FileSandboxConfig by merging user configuration with defaults.
   *
   * User config (from osai.json security.sandbox) provides allowedDirs.
   * Blocked patterns always include DEFAULT_BLOCKED_PATTERNS, with
   * additional user patterns merged in.
   *
   * @param userConfig - Partial config from osai.json
   * @returns Complete FileSandboxConfig with defaults merged
   */
  static createConfig(userConfig?: {
    allowedDirs?: readonly string[];
    blockedPatterns?: readonly string[];
  }): FileSandboxConfig {
    const allowedDirs = userConfig?.allowedDirs ?? [];

    const blockedPatterns = [
      ...DEFAULT_BLOCKED_PATTERNS,
      ...(userConfig?.blockedPatterns ?? []),
    ];

    return {
      allowedDirs: allowedDirs.map((d) => path.resolve(d)),
      blockedPatterns,
    };
  }
}
