/**
 * Smoke test -- verifies that vitest configuration works correctly.
 *
 * This test validates:
 * - Vitest runs and discovers tests in root-level tests/ directory
 * - Globals (describe, it, expect) are available
 * - Setup file (tests/setup.ts) executed (env variables set)
 * - Test helpers are importable via barrel export
 */
import { describe, it, expect } from "vitest";
import {
  createTempDir,
  createTempFile,
  cleanupTempDirs,
  createMockStructure,
} from "../../helpers/index.js";

describe("vitest configuration smoke test", () => {
  it("should run this test successfully", () => {
    expect(true).toBe(true);
  });

  it("should have test environment variables set", () => {
    expect(process.env.NODE_ENV).toBe("test");
    expect(process.env.OSAI_DATA_DIR).toBe("");
    expect(process.env.OSAI_DISABLE_DAEMON).toBe("true");
  });

  it("should be able to create and cleanup temp directories", () => {
    const tempDir = createTempDir("smoke-test-");
    expect(tempDir).toBeDefined();

    const fs = require("node:fs") as typeof import("node:fs");
    expect(fs.existsSync(tempDir)).toBe(true);

    // Cleanup will be handled by afterEach in setup.ts
    cleanupTempDirs();
    expect(fs.existsSync(tempDir)).toBe(false);
  });

  it("should be able to create temp files with content", () => {
    const filePath = createTempFile("hello osai", "smoke-file-", ".txt");

    const fs = require("node:fs") as typeof import("node:fs");
    expect(fs.existsSync(filePath)).toBe(true);
    expect(fs.readFileSync(filePath, "utf-8")).toBe("hello osai");

    cleanupTempDirs();
  });

  it("should be able to create mock directory structures", () => {
    const base = createTempDir("smoke-struct-");
    createMockStructure(base, {
      "src/index.ts": "export {};\n",
      "src/utils/helpers.ts": "export const id = 1;\n",
      "data/": null,
    });

    const fs = require("node:fs") as typeof import("node:fs");
    expect(fs.existsSync(base + "/src/index.ts")).toBe(true);
    expect(fs.existsSync(base + "/src/utils/helpers.ts")).toBe(true);
    expect(fs.statSync(base + "/data/").isDirectory()).toBe(true);

    cleanupTempDirs();
  });
});
