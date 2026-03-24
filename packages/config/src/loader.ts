/**
 * Configuration Loader for osaI
 *
 * Loads, validates, and caches openclaw.json configuration.
 * F-003 T-002: Config Loader Implementation
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import type { OsaIConfig } from '@osai/types';

import {
  validateConfig,
  applyDefaults,
} from './schema.js';
import {
  ConfigNotFoundError,
  ConfigParseError,
  ConfigValidationError,
  ConfigPermissionWarning,
} from './errors.js';

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

/**
 * Returns the default osaI configuration directory.
 */
export function getOsaiDirectory(): string {
  const home = os.homedir();
  return path.join(home, '.osai');
}

/**
 * Returns the default configuration file path.
 */
export function getConfigPath(): string {
  return path.join(getOsaiDirectory(), 'openclaw.json');
}

// ---------------------------------------------------------------------------
// File Reading
// ---------------------------------------------------------------------------

/**
 * Reads and parses a JSON file from disk.
 */
export function readConfigFile(configPath: string): string {
  try {
    const content = fs.readFileSync(configPath, 'utf-8');
    return content;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new ConfigNotFoundError(configPath);
    }
    if ((error as NodeJS.ErrnoException).code === 'EACCES') {
      throw new ConfigNotFoundError(
        `Permission denied reading: ${configPath}`,
      );
    }
    throw error;
  }
}

/**
 * Parses JSON string into unknown.
 */
export function parseConfig(content: string, configPath: string): unknown {
  try {
    return JSON.parse(content);
  } catch (error) {
    throw new ConfigParseError(configPath, error as Error);
  }
}

// ---------------------------------------------------------------------------
// Permission Check
// ---------------------------------------------------------------------------

/**
 * Checks file permissions and warns if too open.
 * Returns the current mode or undefined if stat failed.
 */
export function checkPermissions(
  configPath: string,
  _logger?: { warn: (msg: string) => void },
): number | undefined {
  try {
    const stat = fs.statSync(configPath);
    const mode = stat.mode & 0o777;
    // Warn if file is readable by group or others
    if (mode & 0o077) {
      const warning = new ConfigPermissionWarning(configPath, mode);
      if (_logger) {
        _logger.warn(warning.message);
      }
      // eslint-disable-next-line no-console
      console.warn(`[config] ${warning.message}`);
    }
    return mode;
  } catch {
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/**
 * Validates parsed config data and returns OsaIConfig.
 */
export function validateAndNormalize(data: unknown): OsaIConfig {
  const result = validateConfig(data);
  if (!result.valid) {
    throw new ConfigValidationError(result.errors);
  }
  return applyDefaults(data as Partial<OsaIConfig>);
}

// ---------------------------------------------------------------------------
// Config Loader (Singleton)
// ---------------------------------------------------------------------------

/**
 * Options for loadConfig.
 */
export interface LoadConfigOptions {
  /** Custom config path (overrides default) */
  configPath?: string;
  /** Force reload even if cached */
  forceReload?: boolean;
}

let cachedConfig: OsaIConfig | null = null;
let cachedPath: string | null = null;

/**
 * Loads the configuration file, validates it, applies defaults, and returns
 * the full configuration. Supports caching.
 */
export function loadConfigSync(options: LoadConfigOptions = {}): OsaIConfig {
  const configPath = options.configPath ?? getConfigPath();

  // Return cached config if available and not forced
  if (!options.forceReload && cachedConfig !== null && cachedPath === configPath) {
    return cachedConfig;
  }

  const content = readConfigFile(configPath);
  const data = parseConfig(content, configPath);
  checkPermissions(configPath);
  const config = validateAndNormalize(data);

  cachedConfig = config;
  cachedPath = configPath;

  return config;
}

/**
 * Async version of loadConfigSync.
 */
export async function loadConfig(options: LoadConfigOptions = {}): Promise<OsaIConfig> {
  return loadConfigSync(options);
}

/**
 * Returns the currently cached config without loading from disk.
 * Returns null if no config has been loaded yet.
 */
export function getCachedConfig(): OsaIConfig | null {
  return cachedConfig;
}

/**
 * Invalidates the cached config, forcing reload on next access.
 */
export function invalidateCache(): void {
  cachedConfig = null;
  cachedPath = null;
}

/**
 * Get the current config (singleton pattern).
 * Loads from default path on first call.
 */
export function getConfig(): OsaIConfig {
  return loadConfigSync();
}

/**
 * Reset singleton state (useful for testing).
 */
export function resetLoaderState(): void {
  invalidateCache();
}
