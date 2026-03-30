import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { createDefaultConfig, getOsaiDir } from "./config.js";

// Re-export config module for convenience
export { DEFAULT_CONFIG, getConfigPath, createDefaultConfig, getOsaiDir } from "./config.js";

/**
 * Subdirectories of ~/.osai/ that must exist after initialization.
 */
export const OSAI_SUBDIRS = [
  "data",
  "logs",
  "channels/telegram/session",
  "workspace/skills",
] as const;

/**
 * Ensures the ~/.osai/ directory structure exists.
 * Creates all required subdirectories if they do not exist.
 * Idempotent -- safe to call multiple times.
 *
 * @param baseDir - Optional override for the osai directory path (used in tests).
 * @returns The base directory path that was created/verified.
 */
export function ensureOsaiDir(baseDir?: string): string {
  const osaiDir = baseDir ?? getOsaiDir();

  if (!existsSync(osaiDir)) {
    mkdirSync(osaiDir, { recursive: true });
  }

  for (const sub of OSAI_SUBDIRS) {
    const dirPath = join(osaiDir, sub);
    if (!existsSync(dirPath)) {
      mkdirSync(dirPath, { recursive: true });
    }
  }

  return osaiDir;
}

/**
 * Full initialization routine: creates directory structure + default config.
 * Idempotent -- safe to call on every application start.
 *
 * @param baseDir - Optional override for the osai directory path (used in tests).
 */
export function initOsai(baseDir?: string): void {
  const dir = baseDir ?? getOsaiDir();
  ensureOsaiDir(dir);
  createDefaultConfig(dir);
}
