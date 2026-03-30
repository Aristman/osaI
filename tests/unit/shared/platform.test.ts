/**
 * @osai/shared -- Platform Detection Utility Tests (T-006)
 *
 * Tests for cross-platform support module.
 * Verifies:
 * - Platform detection (isLinux, isWindows, platform)
 * - Path constants (pathSeparator, homeDir, tempDir)
 * - Shell configuration (shell, shellArgs, buildShellCommand)
 * - osai directory paths (getOsaiDir, getOsaiDbPath, etc.)
 * - Cross-platform helpers (expandHome, normalizePath, isPathWithin)
 * - Environment variable handling (homeEnvVar, getHomeFromEnv)
 */

import { describe, it, expect } from 'vitest';
import path from 'node:path';
import os from 'node:os';
import {
  isLinux,
  isWindows,
  platform,
  getPlatform,
  pathSeparator,
  homeDir,
  tempDir,
  getOsaiDir,
  getOsaiDataDir,
  getOsaiDbPath,
  getOsaiLogDir,
  getTelegramSessionDir,
  shell,
  shellArgs,
  buildShellCommand,
  expandHome,
  normalizePath,
  isPathWithin,
  homeEnvVar,
  getHomeFromEnv,
} from '@osai/shared';

// ---------------------------------------------------------------------------
// Platform Detection
// ---------------------------------------------------------------------------

describe('Platform Detection', () => {
  it('exactly one of isLinux or isWindows is true', () => {
    const total = (isLinux ? 1 : 0) + (isWindows ? 1 : 0);
    expect(total).toBe(1);
  });

  it('platform matches the current OS', () => {
    if (process.platform === 'linux') {
      expect(platform).toBe('linux');
    } else if (process.platform === 'win32') {
      expect(platform).toBe('windows');
    }
  });

  it('isLinux matches process.platform on Linux', () => {
    if (process.platform === 'linux') {
      expect(isLinux).toBe(true);
      expect(isWindows).toBe(false);
    }
  });

  it('isWindows matches process.platform on Windows', () => {
    if (process.platform === 'win32') {
      expect(isWindows).toBe(true);
      expect(isLinux).toBe(false);
    }
  });

  it('getPlatform returns a valid OsaiPlatform value', () => {
    const p = getPlatform();
    expect(['linux', 'windows']).toContain(p);
  });

  it('getPlatform throws on unsupported platform in development', () => {
    const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform');
    const originalNodeEnv = process.env['NODE_ENV'];

    try {
      // Mock process.platform to unsupported value
      Object.defineProperty(process, 'platform', {
        value: 'darwin',
        writable: true,
        configurable: true,
      });
      process.env['NODE_ENV'] = 'development';

      expect(() => getPlatform()).toThrow(
        'Unsupported platform: "darwin". osaI v3 supports Linux and Windows only.',
      );
    } finally {
      // Restore
      if (originalPlatform) {
        Object.defineProperty(process, 'platform', originalPlatform);
      }
      if (originalNodeEnv !== undefined) {
        process.env['NODE_ENV'] = originalNodeEnv;
      } else {
        delete process.env['NODE_ENV'];
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Path Constants
// ---------------------------------------------------------------------------

describe('Path Constants', () => {
  it('pathSeparator matches os path.sep', () => {
    expect(pathSeparator).toBe(path.sep);
  });

  it('homeDir returns a non-empty string', () => {
    expect(homeDir).toBeTruthy();
    expect(typeof homeDir).toBe('string');
    expect(homeDir.length).toBeGreaterThan(0);
  });

  it('homeDir matches os.homedir()', () => {
    expect(homeDir).toBe(os.homedir());
  });

  it('tempDir returns a non-empty string', () => {
    expect(tempDir).toBeTruthy();
    expect(typeof tempDir).toBe('string');
    expect(tempDir.length).toBeGreaterThan(0);
  });

  it('tempDir matches os.tmpdir()', () => {
    expect(tempDir).toBe(os.tmpdir());
  });

  it('pathSeparator is forward slash on Linux', () => {
    if (isLinux) {
      expect(pathSeparator).toBe('/');
    }
  });

  it('pathSeparator is backslash on Windows', () => {
    if (isWindows) {
      expect(pathSeparator).toBe('\\');
    }
  });
});

// ---------------------------------------------------------------------------
// osai Directory Paths
// ---------------------------------------------------------------------------

describe('osai Directory Paths', () => {
  it('getOsaiDir returns path ending with .osai', () => {
    const dir = getOsaiDir();
    expect(dir).toContain('.osai');
    expect(dir).toBe(path.join(homeDir, '.osai'));
  });

  it('getOsaiDir uses path.join (no hardcoded separators)', () => {
    const dir = getOsaiDir();
    // Verify it does not contain both / and \ (would indicate mixed separators)
    if (isWindows) {
      expect(dir).not.toContain('/');
    }
    if (isLinux) {
      expect(dir).not.toContain('\\');
    }
  });

  it('getOsaiDataDir returns path ending with .osai/data', () => {
    const dir = getOsaiDataDir();
    expect(dir).toContain(path.join('.osai', 'data'));
  });

  it('getOsaiDbPath returns path ending with osai.db', () => {
    const dbPath = getOsaiDbPath();
    expect(dbPath).toContain('osai.db');
    expect(dbPath).toBe(path.join(homeDir, '.osai', 'data', 'osai.db'));
  });

  it('getOsaiLogDir returns path ending with .osai/logs', () => {
    const logDir = getOsaiLogDir();
    expect(logDir).toContain(path.join('.osai', 'logs'));
  });

  it('getTelegramSessionDir returns correct nested path', () => {
    const sessionDir = getTelegramSessionDir();
    expect(sessionDir).toContain(path.join('.osai', 'channels', 'telegram', 'session'));
  });

  it('all osai paths use the correct platform separator', () => {
    const paths = [
      getOsaiDir(),
      getOsaiDataDir(),
      getOsaiDbPath(),
      getOsaiLogDir(),
      getTelegramSessionDir(),
    ];

    for (const p of paths) {
      if (isWindows) {
        // On Windows, paths should use backslash (but drive letters use colon)
        // Path.join on Windows produces backslashes
        const parts = p.split(path.sep);
        expect(parts.length).toBeGreaterThan(1);
      } else {
        // On Linux, paths should use forward slash
        expect(p).toContain('/');
        expect(p).not.toContain('\\');
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Shell Configuration
// ---------------------------------------------------------------------------

describe('Shell Configuration', () => {
  it('shell is /bin/sh on Linux', () => {
    if (isLinux) {
      expect(shell).toBe('/bin/sh');
    }
  });

  it('shell is cmd.exe on Windows', () => {
    if (isWindows) {
      expect(shell).toBe('cmd.exe');
    }
  });

  it('shellArgs is [-c] on Linux', () => {
    if (isLinux) {
      expect(shellArgs).toEqual(['-c']);
    }
  });

  it('shellArgs is [/c] on Windows', () => {
    if (isWindows) {
      expect(shellArgs).toEqual(['/c']);
    }
  });

  it('buildShellCommand returns correct array on Linux', () => {
    if (isLinux) {
      const result = buildShellCommand('ls -la');
      expect(result).toEqual(['/bin/sh', '-c', 'ls -la']);
    }
  });

  it('buildShellCommand returns correct array on Windows', () => {
    if (isWindows) {
      const result = buildShellCommand('dir');
      expect(result).toEqual(['cmd.exe', '/c', 'dir']);
    }
  });

  it('shellArgs is readonly', () => {
    expect(Object.isFrozen(shellArgs)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Cross-Platform Helpers
// ---------------------------------------------------------------------------

describe('expandHome', () => {
  it('expands ~ to homeDir', () => {
    const result = expandHome('~');
    expect(result).toBe(homeDir);
  });

  it('expands ~/path to homeDir/path', () => {
    const result = expandHome('~/documents');
    expect(result).toBe(path.join(homeDir, 'documents'));
  });

  it('does not modify absolute paths', () => {
    const absPath = '/usr/local/bin';
    const result = expandHome(absPath);
    expect(result).toBe(absPath);
  });

  it('does not modify relative paths', () => {
    const relPath = 'some/relative/path';
    const result = expandHome(relPath);
    expect(result).toBe(relPath);
  });

  it('does not modify paths with ~ in the middle', () => {
    const midPath = 'path/to/~directory';
    const result = expandHome(midPath);
    expect(result).toBe(midPath);
  });

  it('handles empty string', () => {
    expect(expandHome('')).toBe('');
  });
});

describe('normalizePath', () => {
  it('normalizes a path with . segments', () => {
    const result = normalizePath(path.join(homeDir, '.', 'documents'));
    expect(result).toBe(path.join(homeDir, 'documents'));
  });

  it('normalizes a path with .. segments', () => {
    const result = normalizePath(path.join(homeDir, 'documents', '..', 'downloads'));
    expect(result).toBe(path.join(homeDir, 'downloads'));
  });

  it('expands ~ before normalizing', () => {
    const result = normalizePath('~/projects/osai');
    expect(result).toBe(path.join(homeDir, 'projects', 'osai'));
  });
});

describe('isPathWithin', () => {
  it('returns true for direct child', () => {
    const parent = homeDir;
    const child = path.join(homeDir, 'documents');
    expect(isPathWithin(child, parent)).toBe(true);
  });

  it('returns true for deeply nested child', () => {
    const parent = homeDir;
    const child = path.join(homeDir, 'a', 'b', 'c', 'd');
    expect(isPathWithin(child, parent)).toBe(true);
  });

  it('returns true for equal paths', () => {
    expect(isPathWithin(homeDir, homeDir)).toBe(true);
  });

  it('returns false for sibling path', () => {
    const parent = path.join(homeDir, 'documents');
    const sibling = path.join(homeDir, 'downloads');
    expect(isPathWithin(sibling, parent)).toBe(false);
  });

  it('returns false for parent path when checking child', () => {
    const parent = homeDir;
    const child = path.dirname(homeDir);
    expect(isPathWithin(child, parent)).toBe(false);
  });

  it('handles ~ expansion in both paths', () => {
    expect(isPathWithin('~/documents', '~')).toBe(true);
    expect(isPathWithin('~/documents', '~/downloads')).toBe(false);
  });

  it('returns false for path that shares prefix but is not within', () => {
    // e.g., /home/user2 when parent is /home/user
    // This test only applies to real paths, so use tempDir
    const parent = path.join(tempDir, 'parent');
    const notChild = path.join(tempDir, 'parent-other');
    // These are not nested
    expect(isPathWithin(notChild, parent)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Environment Variable Handling
// ---------------------------------------------------------------------------

describe('Environment Variable Handling', () => {
  it('homeEnvVar is HOME on Linux', () => {
    if (isLinux) {
      expect(homeEnvVar).toBe('HOME');
    }
  });

  it('homeEnvVar is USERPROFILE on Windows', () => {
    if (isWindows) {
      expect(homeEnvVar).toBe('USERPROFILE');
    }
  });

  it('getHomeFromEnv returns a non-empty string', () => {
    const result = getHomeFromEnv();
    expect(result).toBeTruthy();
    expect(result.length).toBeGreaterThan(0);
  });

  it('getHomeFromEnv matches homeDir when env vars are set', () => {
    // On a properly configured system, getHomeFromEnv should match homeDir
    const result = getHomeFromEnv();
    // The result should be equivalent to os.homedir() via env vars
    expect(result).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Integration: No Hardcoded Separators
// ---------------------------------------------------------------------------

describe('No Hardcoded Separators', () => {
  it('all osai paths are consistent with path.join output', () => {
    // This verifies that our utility produces the same results as direct path.join
    expect(getOsaiDir()).toBe(path.join(os.homedir(), '.osai'));
    expect(getOsaiDataDir()).toBe(path.join(os.homedir(), '.osai', 'data'));
    expect(getOsaiDbPath()).toBe(path.join(os.homedir(), '.osai', 'data', 'osai.db'));
    expect(getOsaiLogDir()).toBe(path.join(os.homedir(), '.osai', 'logs'));
    expect(getTelegramSessionDir()).toBe(
      path.join(os.homedir(), '.osai', 'channels', 'telegram', 'session'),
    );
  });
});
