/**
 * @osai/cli -- osai config (DOMAIN-011, T-005)
 *
 * Displays the current osai configuration.
 *
 * Usage:
 *   osai config [--path]
 *
 * Exit codes:
 *   0 - Success
 *   1 - Error
 */

import { readConfig, DEFAULT_CONFIG_PATH } from "../utils/config.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ConfigOptions {
  /** Show only config file path */
  path?: boolean;
}

// ---------------------------------------------------------------------------
// Command handler
// ---------------------------------------------------------------------------

/**
 * Execute the `osai config` command.
 *
 * Outputs the current configuration as JSON to STDOUT.
 *
 * @param options - Config options
 */
export async function runConfig(options: ConfigOptions = {}): Promise<void> {
  try {
    if (options.path) {
      process.stdout.write(`${DEFAULT_CONFIG_PATH}\n`);
      process.exit(0);
    }

    const config = readConfig();
    process.stdout.write(JSON.stringify(config, null, 2) + "\n");
    process.exit(0);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(`Error: ${message}\n`);
    process.exit(1);
  }
}
