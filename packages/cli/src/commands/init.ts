/**
 * @osai/cli -- osai init (DOMAIN-011, T-005)
 *
 * Initializes the osai configuration directory (~/.osai/) with defaults.
 *
 * Usage:
 *   osai init [--force]
 *
 * Behavior:
 *   - Creates ~/.osai/ directory structure
 *   - Writes default osai.json configuration
 *   - If config already exists: prints warning and exits (unless --force)
 *
 * Exit codes:
 *   0 - Success (or already initialized)
 *   1 - Error
 */

import {
  OSAI_HOME,
  DEFAULT_CONFIG_PATH,
  DEFAULT_CONFIG,
  configExists,
  ensureDirectoryStructure,
  writeConfig,
} from "../utils/config.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface InitOptions {
  /** Force overwrite existing configuration */
  force?: boolean;
}

// ---------------------------------------------------------------------------
// Command handler
// ---------------------------------------------------------------------------

/**
 * Execute the `osai init` command.
 *
 * Creates the ~/.osai/ directory structure with default configuration.
 *
 * @param options - Init options (force)
 * @throws Never -- errors are printed and process exits
 */
export async function runInit(options: InitOptions = {}): Promise<void> {
  const { force = false } = options;

  try {
    // Check if already initialized
    if (configExists() && !force) {
      process.stderr.write(`osaI is already initialized at ${OSAI_HOME}\n`);
      process.stderr.write("Use --force to overwrite existing configuration.\n");
      process.exit(0);
    }

    // Create directory structure
    const createdDirs = ensureDirectoryStructure();

    // Write default config
    writeConfig(DEFAULT_CONFIG);

    // Output results
    process.stdout.write(`osaI initialized at ${OSAI_HOME}\n`);
    process.stdout.write("\n");

    if (createdDirs.length > 0) {
      process.stdout.write("Created directories:\n");
      for (const dir of createdDirs) {
        process.stdout.write(`  ${dir}\n`);
      }
      process.stdout.write("\n");
    }

    process.stdout.write(`Config: ${DEFAULT_CONFIG_PATH}\n`);
    process.stdout.write("Next steps:\n");
    process.stdout.write("  osai status          Check system status\n");
    process.stdout.write("  osai channel add     Add a communication channel\n");
    process.stdout.write("\n");
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(`Error: Failed to initialize osaI: ${message}\n`);
    process.exit(1);
  }
}
