/**
 * Native Modules Verification Script
 *
 * Verifies that better-sqlite3 and sqlite-vec prebuild binaries
 * are available on the current platform. Runs in CI to detect
 * native module loading failures early.
 */

import { createRequire } from "node:module";
import { platform, arch } from "node:os";

const require = createRequire(import.meta.url);

interface ModuleCheckResult {
  module: string;
  loaded: boolean;
  version?: string;
  error?: string;
}

function checkModule(moduleName: string): ModuleCheckResult {
  try {
    const mod = require(moduleName);
    const version = mod.default?.version ?? mod.version ?? "unknown";
    return { module: moduleName, loaded: true, version: String(version) };
  } catch (err) {
    return {
      module: moduleName,
      loaded: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

function main(): void {
  const targetPlatform = `${platform()}-${arch()}`;
  const modules = ["better-sqlite3", "sqlite-vec"];

  console.log(`Platform: ${targetPlatform}`);
  console.log(`Node.js: ${process.version}`);
  console.log("---");

  const results = modules.map(checkModule);
  let allOk = true;

  for (const result of results) {
    if (result.loaded) {
      console.log(`OK  ${result.module} v${result.version}`);
    } else {
      console.log(`FAIL ${result.module}: ${result.error}`);
      allOk = false;
    }
  }

  console.log("---");

  if (allOk) {
    console.log("All native modules loaded successfully.");
    process.exit(0);
  } else {
    console.error(
      "Native module verification FAILED. Some modules could not be loaded.",
    );
    process.exit(1);
  }
}

main();
