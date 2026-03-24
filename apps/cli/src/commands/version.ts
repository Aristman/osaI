/**
 * version command -- display CLI version
 *
 * Usage:
 *   osai version
 */

// Read version from package.json
const PKG_VERSION = '0.0.1';

// ---------------------------------------------------------------------------
// versionCommand
// ---------------------------------------------------------------------------

export async function versionCommand(): Promise<void> {
  process.stdout.write(`osai CLI v${PKG_VERSION}\n`);
}
