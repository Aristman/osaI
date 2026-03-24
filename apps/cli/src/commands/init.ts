/**
 * init command -- initialize ~/.osai/ directory structure
 *
 * Usage:
 *   osai init
 */

import { initializeOsaiDirectorySync, isOsaiDirectoryInitialized, getConfigPath } from '@osai/config';

// ---------------------------------------------------------------------------
// initCommand
// ---------------------------------------------------------------------------

export async function initCommand(): Promise<void> {
  if (isOsaiDirectoryInitialized()) {
    process.stdout.write(`osaI already initialized at ${getConfigPath()}\n`);
    return;
  }

  try {
    initializeOsaiDirectorySync();
    process.stdout.write(`osaI initialized successfully.\n`);
    process.stdout.write(`Config file: ${getConfigPath()}\n`);
  } catch (err) {
    process.stderr.write(`Error: Failed to initialize osaI: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exitCode = 1;
  }
}
