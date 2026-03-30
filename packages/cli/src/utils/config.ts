/**
 * @osai/cli -- Config Utilities (utility)
 *
 * Helpers for reading, writing, and validating osai.json configuration.
 * Config path: ~/.osai/osai.json
 */

import fs from "node:fs";
import path from "node:path";
import os from "node:os";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Default osai home directory */
export const OSAI_HOME = path.join(os.homedir(), ".osai");

/** Default config file path */
export const DEFAULT_CONFIG_PATH = path.join(OSAI_HOME, "osai.json");

/** Default configuration content */
export const DEFAULT_CONFIG: OsaiConfig = {
  version: "3.0.0",
  gateway: {
    host: "127.0.0.1",
    port: 18789,
    wsUrl: "ws://127.0.0.1:18789",
  },
  channels: {
    telegram: {
      enabled: false,
    },
  },
  memory: {
    tier2_provider: "sqlite-vec",
  },
  providers: {
    primary: "z-ai",
    failover: ["yandex", "anthropic", "openai", "ollama"],
  },
  logging: {
    level: "info",
  },
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface OsaiConfig {
  version: string;
  gateway: {
    host: string;
    port: number;
    wsUrl: string;
  };
  channels: Record<string, unknown>;
  memory: Record<string, unknown>;
  providers: Record<string, unknown>;
  logging: Record<string, unknown>;
}

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
export function writeConfig(config: OsaiConfig, configPath?: string): void {
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
