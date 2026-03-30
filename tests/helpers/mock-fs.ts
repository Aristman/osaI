/**
 * Mock filesystem utilities for test isolation.
 *
 * Provides temporary directory creation and cleanup,
 * ensuring each test suite gets an isolated filesystem workspace.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const activeTempDirs = new Set<string>();

/**
 * Create a temporary directory for a test.
 * The directory is automatically tracked for cleanup.
 *
 * @param prefix - Directory name prefix (default: "osai-test-")
 * @returns Absolute path to the created temporary directory
 */
export function createTempDir(prefix = "osai-test-"): string {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  activeTempDirs.add(tempDir);
  return tempDir;
}

/**
 * Create a temporary file with the given content.
 *
 * @param content - File content to write
 * @param prefix - File name prefix (default: "osai-test-")
 * @param extension - File extension (default: ".tmp")
 * @returns Absolute path to the created temporary file
 */
export function createTempFile(
  content: string,
  prefix = "osai-test-",
  extension = ".tmp",
): string {
  const tempDir = createTempDir(prefix);
  const filePath = path.join(tempDir, `${prefix}${Date.now()}${extension}`);
  fs.writeFileSync(filePath, content, "utf-8");
  return filePath;
}

/**
 * Remove a specific temporary directory and all its contents.
 *
 * @param dirPath - Absolute path to the directory to remove
 */
export function removeTempDir(dirPath: string): void {
  activeTempDirs.delete(dirPath);
  if (fs.existsSync(dirPath)) {
    fs.rmSync(dirPath, { recursive: true, force: true });
  }
}

/**
 * Cleanup all tracked temporary directories.
 * Called automatically in afterEach/afterAll via tests/setup.ts.
 */
export function cleanupTempDirs(): void {
  for (const dirPath of activeTempDirs) {
    try {
      if (fs.existsSync(dirPath)) {
        fs.rmSync(dirPath, { recursive: true, force: true });
      }
    } catch {
      // Ignore cleanup errors -- temp dirs are ephemeral
    }
  }
  activeTempDirs.clear();
}

/**
 * Create a mock directory structure within a given base path.
 *
 * @param basePath - Root directory for the structure
 * @param structure - Object describing the file tree:
 *   - string value: file with that content
 *   - null value: empty directory
 */
export function createMockStructure(
  basePath: string,
  structure: Record<string, string | null>,
): void {
  for (const [relativePath, content] of Object.entries(structure)) {
    const fullPath = path.join(basePath, relativePath);
    const parentDir = path.dirname(fullPath);

    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }

    if (content === null) {
      fs.mkdirSync(fullPath, { recursive: true });
    } else {
      fs.writeFileSync(fullPath, content, "utf-8");
    }
  }
}
