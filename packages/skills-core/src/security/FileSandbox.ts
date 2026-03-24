/**
 * @osai/skills-core -- FileSandbox
 *
 * Provides path validation and sandboxing for filesystem operations.
 * Ensures all file operations stay within allowed directories and
 * do not match blocked patterns.
 */

import { realpathSync } from 'node:fs';
import { join, resolve, relative } from 'node:path';
import type { FileOperation, PathValidationResult, FileSandboxConfig } from '../types.js';

export class FileSandbox {
  private readonly allowedDirs: string[];
  private readonly blockedPatterns: RegExp[];

  constructor(config: FileSandboxConfig) {
    // Resolve all allowed dirs to absolute paths
    this.allowedDirs = config.allowedDirs.map((dir) =>
      resolve(dir),
    );
    this.blockedPatterns = config.blockedPatterns.map(
      (pattern) => new RegExp(pattern),
    );
  }

  /**
   * Validate that a path is within allowed directories and not blocked.
   *
   * @param path - The path to validate
   * @param operation - The file operation being performed
   * @returns PathValidationResult with validity info
   */
  validatePath(path: string, _operation: FileOperation): PathValidationResult {
    try {
      const resolvedPath = this.resolvePath(path);

      // Check blocked patterns first
      const blockedError = this.checkBlockedPatterns(resolvedPath);
      if (blockedError) {
        return { valid: false, error: blockedError };
      }

      // Check if path is within allowed directories
      if (!this.isPathWithinAllowed(resolvedPath)) {
        return {
          valid: false,
          error: `Path '${path}' is outside allowed directories`,
        };
      }

      return { valid: true, resolvedPath };
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Unknown error resolving path';
      return { valid: false, error: message };
    }
  }

  /**
   * Check if a path is within any of the allowed directories.
   *
   * @param path - The path to check
   * @returns true if the path is within an allowed directory
   */
  isAllowed(path: string): boolean {
    try {
      const resolvedPath = this.resolvePath(path);
      if (!this.isPathWithinAllowed(resolvedPath)) return false;
      if (this.checkBlockedPatterns(resolvedPath)) return false;
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Resolve symlinks and return the real path.
   *
   * @param path - The path to resolve
   * @returns The resolved real path
   */
  resolveSymlinks(path: string): string {
    try {
      return realpathSync(path);
    } catch {
      // If the file doesn't exist yet (e.g., for write operations),
      // resolve the parent directory and join with basename
      return this.resolvePath(path);
    }
  }

  /**
   * Check if a path matches any blocked patterns.
   *
   * @param path - The path to check
   * @returns true if the path matches a blocked pattern
   */
  isBlockedPattern(path: string): boolean {
    const resolvedPath = this.resolvePath(path);
    return this.blockedPatterns.some((pattern) => pattern.test(resolvedPath));
  }

  /**
   * Get the list of allowed directories.
   *
   * @returns Copy of allowed directories array
   */
  getAllowedDirs(): string[] {
    return [...this.allowedDirs];
  }

  /**
   * Get the list of blocked patterns.
   *
   * @returns Copy of blocked patterns as strings
   */
  getBlockedPatterns(): string[] {
    return this.blockedPatterns.map((pattern) => pattern.source);
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private resolvePath(path: string): string {
    const absolute = resolve(path);
    try {
      return realpathSync(absolute);
    } catch {
      // File may not exist; resolve parent and join
      const parentDir = resolve(absolute, '..');
      try {
        const resolvedParent = realpathSync(parentDir);
        return join(resolvedParent, absolute.split('/').pop() ?? '');
      } catch {
        return absolute;
      }
    }
  }

  private isPathWithinAllowed(resolvedPath: string): boolean {
    return this.allowedDirs.some((allowedDir) => {
      const rel = relative(allowedDir, resolvedPath);
      // Must not start with '..' and must not be absolute path
      return !rel.startsWith('..') && !rel.startsWith('/');
    });
  }

  private checkBlockedPatterns(resolvedPath: string): string | undefined {
    for (const pattern of this.blockedPatterns) {
      if (pattern.test(resolvedPath)) {
        return `Path matches blocked pattern '${pattern.source}'`;
      }
    }
    return undefined;
  }
}
