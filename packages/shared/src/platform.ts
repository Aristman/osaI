/**
 * @osai/shared -- Platform Detection Utility (T-006)
 *
 * Single source of truth for platform detection and cross-platform helpers.
 * All packages MUST use this module instead of directly checking process.platform
 * or hardcoding path separators, shell executables, or platform-specific values.
 *
 * Supported platforms: Linux (primary), Windows 10/11 (native).
 * macOS is explicitly NOT supported in osaI v3.
 *
 * Exports:
 * - Platform info (isLinux, isWindows, platform)
 * - Path helpers (pathSeparator, homeDir, tempDir, osaiDir)
 * - Shell config (shell, shellArgs, shellFlag)
 * - Cross-platform path resolution
 */

import os from 'node:os';
import path from 'node:path';

// ---------------------------------------------------------------------------
// Platform Detection
// ---------------------------------------------------------------------------

/** Supported platform identifiers */
export type OsaiPlatform = 'linux' | 'windows';

/**
 * The current platform, narrowed to osaI-supported values.
 *
 * Throws in development if an unsupported platform is detected,
 * but returns 'linux' as a safe fallback in production.
 */
export function getPlatform(): OsaiPlatform {
  const p = process.platform;

  if (p === 'linux') {
    return 'linux';
  }

  if (p === 'win32') {
    return 'windows';
  }

  // Unsupported platform (e.g., darwin, aix, freebsd)
  // In production, fall back to linux-like behavior.
  // In tests, this may be mocked.
  if (process.env['NODE_ENV'] === 'development') {
    throw new Error(
      `Unsupported platform: "${p}". osaI v3 supports Linux and Windows only.`,
    );
  }

  return 'linux';
}

/** Whether the current platform is Linux */
export const isLinux: boolean = process.platform === 'linux';

/** Whether the current platform is Windows */
export const isWindows: boolean = process.platform === 'win32';

/** Resolved platform constant */
export const platform: OsaiPlatform = getPlatform();

// ---------------------------------------------------------------------------
// Path Constants
// ---------------------------------------------------------------------------

/** OS-specific path separator: '/' on Linux, '\\' on Windows */
export const pathSeparator: string = path.sep;

/** User home directory (os.homedir()) */
export const homeDir: string = os.homedir();

/** OS temp directory (os.tmpdir()) */
export const tempDir: string = os.tmpdir();

// ---------------------------------------------------------------------------
// osai Directory Paths
// ---------------------------------------------------------------------------

/**
 * Root osai configuration directory: ~/.osai
 *
 * Uses path.join() for cross-platform compatibility.
 */
export function getOsaiDir(): string {
  return path.join(homeDir, '.osai');
}

/**
 * Default osai data directory: ~/.osai/data
 */
export function getOsaiDataDir(): string {
  return path.join(getOsaiDir(), 'data');
}

/**
 * Default database path: ~/.osai/data/osai.db
 */
export function getOsaiDbPath(): string {
  return path.join(getOsaiDataDir(), 'osai.db');
}

/**
 * Default logs directory: ~/.osai/logs
 */
export function getOsaiLogDir(): string {
  return path.join(getOsaiDir(), 'logs');
}

/**
 * Default Telegram session directory: ~/.osai/channels/telegram/session
 */
export function getTelegramSessionDir(): string {
  return path.join(
    getOsaiDir(),
    'channels',
    'telegram',
    'session',
  );
}

// ---------------------------------------------------------------------------
// Shell Configuration
// ---------------------------------------------------------------------------

/**
 * Shell executable for the current platform.
 *
 * - Linux: /bin/sh
 * - Windows: cmd.exe
 */
export const shell: string = isWindows ? 'cmd.exe' : '/bin/sh';

/**
 * Shell arguments for executing a command string.
 *
 * - Linux: ['-c', command]
 * - Windows: ['/c', command]
 */
export const shellArgs: readonly string[] = Object.freeze(
  isWindows ? ['/c'] : ['-c'],
);

/**
 * Execute a shell command by prepending the correct shell flag.
 *
 * On Linux: /bin/sh -c <command>
 * On Windows: cmd.exe /c <command>
 *
 * @param command - The shell command to wrap
 * @returns Array: [shell, flag, command]
 */
export function buildShellCommand(command: string): string[] {
  return [shell, ...shellArgs, command];
}

// ---------------------------------------------------------------------------
// Cross-Platform Helpers
// ---------------------------------------------------------------------------

/**
 * Resolve a path that may contain ~ to an absolute path.
 *
 * On both Linux and Windows, expands ~ to the user home directory.
 *
 * @param filePath - Path potentially starting with ~
 * @returns Absolute path with ~ expanded
 */
export function expandHome(filePath: string): string {
  if (filePath === '~' || filePath.startsWith('~/')) {
    return path.join(homeDir, filePath.slice(1));
  }
  return filePath;
}

/**
 * Normalize a path for the current platform.
 *
 * Resolves . and .. segments and converts to platform-native separators.
 *
 * @param filePath - Path to normalize
 * @returns Normalized absolute path
 */
export function normalizePath(filePath: string): string {
  return path.normalize(expandHome(filePath));
}

/**
 * Check if a path is within a parent directory (sandbox check helper).
 *
 * Resolves both paths to absolute form before comparison.
 *
 * @param childPath - Path to check
 * @param parentPath - Parent directory path
 * @returns true if childPath is within or equal to parentPath
 */
export function isPathWithin(childPath: string, parentPath: string): boolean {
  const resolvedChild = path.resolve(expandHome(childPath));
  const resolvedParent = path.resolve(expandHome(parentPath));
  return resolvedChild === resolvedParent || resolvedChild.startsWith(resolvedParent + path.sep);
}

/**
 * Platform-specific environment variable name for HOME directory.
 *
 * - Linux: HOME
 * - Windows: USERPROFILE
 */
export const homeEnvVar: string = isWindows ? 'USERPROFILE' : 'HOME';

/**
 * Get the home directory from environment variables.
 *
 * Cross-platform fallback chain: HOME -> USERPROFILE -> os.homedir()
 */
export function getHomeFromEnv(): string {
  return (
    process.env['HOME'] ??
    process.env['USERPROFILE'] ??
    homeDir
  );
}
