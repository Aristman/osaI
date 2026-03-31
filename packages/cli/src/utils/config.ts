/**
 * @osai/cli -- Config Utilities (utility)
 *
 * Helpers for reading, writing, and validating osai.json configuration.
 * Config path: ~/.osai/osai.json
 *
 * Default config is imported from @osai/gateway to avoid duplication.
 */

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { DEFAULT_CONFIG as GATEWAY_DEFAULT_CONFIG, type OsaiConfig as GatewayOsaiConfig } from "@osai/gateway";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Default osai home directory */
export const OSAI_HOME = path.join(os.homedir(), ".osai");

/** Default config file path */
export const DEFAULT_CONFIG_PATH = path.join(OSAI_HOME, "osai.json");

/** Default configuration content (single source of truth from gateway) */
export const DEFAULT_CONFIG = GATEWAY_DEFAULT_CONFIG;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Re-export OsaiConfig from gateway (single source of truth) */
export type OsaiConfig = GatewayOsaiConfig;

// ---------------------------------------------------------------------------
// Config operations
// ---------------------------------------------------------------------------

/**
 * Read and parse osai.json configuration.
 *
 * @param configPath - Path to config file (default: ~/.osai/osai.json)
 * @returns Parsed configuration object
 * @throws {Error} If config file does not exist or contains invalid JSON
 */
export function readConfig(configPath?: string): OsaiConfig {
  const filePath = configPath ?? DEFAULT_CONFIG_PATH;

  try {
    const content = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(content) as OsaiConfig;
  } catch (err: unknown) {
    if (err instanceof Error && "code" in err && (err as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error(`Configuration file not found: ${filePath}`);
    }
    throw new Error(`Invalid configuration file: ${filePath}`);
  }
}

/**
 * Write configuration to osai.json.
 *
 * @param config - Configuration object
 * @param configPath - Path to config file (default: ~/.osai/osai.json)
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function writeConfig(config: any, configPath?: string): void {
  const filePath = configPath ?? DEFAULT_CONFIG_PATH;
  const dir = path.dirname(filePath);

  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(config, null, 2) + "\n", "utf-8");
}

/**
 * Check if osai configuration already exists.
 *
 * @param configPath - Path to config file (default: ~/.osai/osai.json)
 * @returns true if config file exists
 */
export function configExists(configPath?: string): boolean {
  const filePath = configPath ?? DEFAULT_CONFIG_PATH;
  return fs.existsSync(filePath);
}

/**
 * Ensure the full osai directory structure exists.
 * Creates all required directories if they do not exist.
 *
 * @param osaiDir - Path to osai home (default: ~/.osai)
 * @returns Array of created directory paths
 */
export function ensureDirectoryStructure(osaiDir?: string): string[] {
  const base = osaiDir ?? OSAI_HOME;
  const dirs = [
    base,
    path.join(base, "data"),
    path.join(base, "logs"),
    path.join(base, "channels", "telegram", "session"),
  ];

  const created: string[] = [];
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      created.push(dir);
    }
  }

  return created;
}
