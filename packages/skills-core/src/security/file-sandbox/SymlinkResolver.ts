/**
 * @osai/skills-core -- Symlink Resolver (DOMAIN-003, T-001)
 *
 * Resolves symlinks via fs.realpath() and provides escape detection.
 * Ensures that a symlink's real target does not escape the sandbox boundaries.
 */

import fs from 'node:fs';
import path from 'node:path';

/**
 * Symlink resolver that detects escape attempts.
 *
 * Uses fs.realpath() to resolve symbolic links to their real filesystem
 * targets, then validates that the resolved path remains within the
 * specified allowed directories.
 *
 * This is critical for TOCTOU prevention: the sandbox validates the
 * real path AFTER resolution, not the original path before.
 */
export class SymlinkResolver {
  /**
   * Resolve a path to its real filesystem location, following all symlinks.
   *
   * Uses fs.realpath() (native) which resolves symbolic links, `.`, `..`,
   * and extra separators to a canonical absolute path.
   *
   * On Windows, fs.realpath() correctly handles UNC paths and drive letters.
   *
   * @param filePath - The path to resolve (absolute or relative to cwd)
   * @returns The resolved real absolute path
   * @throws {Error} If the path does not exist or cannot be resolved
   */
  resolveRealPath(filePath: string): string {
    const absolute = path.resolve(filePath);
    const normalized = path.normalize(absolute);
    return fs.realpathSync(normalized);
  }

  /**
   * Check whether a resolved real path escapes the given allowed directories.
   *
   * A path "escapes" when its resolved target is not a child of any
   * allowed directory. This prevents symlink-based sandbox escapes where
   * a symlink inside an allowed directory points outside.
   *
   * Comparison is done on normalized, absolute paths with consistent
   * trailing separator handling for both Windows and POSIX.
   *
   * @param resolvedPath - The real (resolved) path to check
   * @param allowedDirs - List of allowed directory paths
   * @returns true if the path stays within allowedDirs, false if it escapes
   */
  isWithinAllowedDirs(resolvedPath: string, allowedDirs: readonly string[]): boolean {
    if (allowedDirs.length === 0) {
      return false;
    }

    const normalizedResolved = this.normalizeForComparison(path.resolve(resolvedPath));

    for (const allowedDir of allowedDirs) {
      const normalizedAllowed = this.normalizeForComparison(path.resolve(allowedDir));

      // Path must be exactly the allowed dir or a child of it
      if (normalizedResolved === normalizedAllowed) {
        return true;
      }

      // Ensure allowed dir ends with separator for prefix check
      const prefix = normalizedAllowed + path.sep;
      if (normalizedResolved.startsWith(prefix)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Normalize a path for consistent comparison across platforms.
   *
   * - Resolves to absolute path
   * - Normalizes separators (handles both / and \)
   * - Removes trailing separators (except root paths like C:\ or /)
   * - Lowercases on Windows (case-insensitive filesystem)
   *
   * @param filePath - The path to normalize
   * @returns The normalized path string
   */
  normalizeForComparison(filePath: string): string {
    let normalized = path.resolve(filePath);
    normalized = path.normalize(normalized);

    // Remove trailing separator unless it's a root path
    if (normalized.length > 1 && normalized.endsWith(path.sep)) {
      normalized = normalized.slice(0, -1);
    }

    // On Windows, normalize to uppercase for consistent comparison
    // (Windows filesystem is case-insensitive)
    if (process.platform === 'win32') {
      normalized = normalized.toUpperCase();
    }

    return normalized;
  }
}
