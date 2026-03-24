/**
 * Directory Structure Initialization for osaI
 *
 * Creates ~/.osai/ directory with proper layout and permissions.
 * F-003 T-003: Directory Structure Initialization
 */

import fs from 'node:fs';
import path from 'node:path';

import { DEFAULT_CONFIG } from './schema.js';
import { getOsaiDirectory } from './loader.js';

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

export interface InitOptions {
  /** Custom osai directory (overrides default) */
  osaiDir?: string;
  /** Create directories only (no config file) */
  directoriesOnly?: boolean;
}

// ---------------------------------------------------------------------------
// Directory Layout
// ---------------------------------------------------------------------------

const DIRECTORY_MODE = 0o700;
const FILE_MODE = 0o600;

const OSAI_LAYOUT: Array<{ type: 'dir' | 'file'; relativePath: string; content?: string }> = [
  { type: 'dir', relativePath: 'logs' },
  { type: 'dir', relativePath: 'sessions' },
  { type: 'dir', relativePath: 'memory' },
  { type: 'dir', relativePath: 'workspace' },
  { type: 'dir', relativePath: 'workspace/skills' },
];

// ---------------------------------------------------------------------------
// Directory Helpers
// ---------------------------------------------------------------------------

/**
 * Ensures a directory exists with the specified permissions.
 */
export function ensureDirectory(dirPath: string, mode: number = DIRECTORY_MODE): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true, mode });
  }

  // Fix permissions if they differ
  try {
    const stat = fs.statSync(dirPath);
    const currentMode = stat.mode & 0o777;
    if (currentMode !== mode) {
      fs.chmodSync(dirPath, mode);
    }
  } catch {
    // Ignore permission errors on chmod (some filesystems)
  }
}

/**
 * Ensures a file exists with the specified content and permissions.
 * Does NOT overwrite if the file already exists.
 */
export function ensureFile(
  filePath: string,
  content: string,
  mode: number = FILE_MODE,
): void {
  if (fs.existsSync(filePath)) {
    return;
  }

  fs.writeFileSync(filePath, content, { mode, encoding: 'utf-8' });
}

// ---------------------------------------------------------------------------
// Init Function
// ---------------------------------------------------------------------------

/**
 * Initializes the osaI directory structure.
 * Idempotent: safe to call multiple times, existing files are not overwritten.
 */
export async function initializeOsaiDirectory(options: InitOptions = {}): Promise<void> {
  const osaiDir = options.osaiDir ?? getOsaiDirectory();

  // Ensure base directory
  ensureDirectory(osaiDir);

  // Create layout directories
  for (const entry of OSAI_LAYOUT) {
    const fullPath = path.join(osaiDir, entry.relativePath);
    if (entry.type === 'dir') {
      ensureDirectory(fullPath);
    }
  }

  // Create openclaw.json if not exists and not directoriesOnly
  if (!options.directoriesOnly) {
    const configPath = path.join(osaiDir, 'openclaw.json');
    const defaultContent = JSON.stringify(DEFAULT_CONFIG, null, 2) + '\n';
    ensureFile(configPath, defaultContent);
  }
}

/**
 * Synchronous version of initializeOsaiDirectory.
 */
export function initializeOsaiDirectorySync(options: InitOptions = {}): void {
  const osaiDir = options.osaiDir ?? getOsaiDirectory();

  // Ensure base directory
  ensureDirectory(osaiDir);

  // Create layout directories
  for (const entry of OSAI_LAYOUT) {
    const fullPath = path.join(osaiDir, entry.relativePath);
    if (entry.type === 'dir') {
      ensureDirectory(fullPath);
    }
  }

  // Create openclaw.json if not exists and not directoriesOnly
  if (!options.directoriesOnly) {
    const configPath = path.join(osaiDir, 'openclaw.json');
    const defaultContent = JSON.stringify(DEFAULT_CONFIG, null, 2) + '\n';
    ensureFile(configPath, defaultContent);
  }
}

// ---------------------------------------------------------------------------
// Query Functions
// ---------------------------------------------------------------------------

/**
 * Checks if the osaI directory has been initialized.
 */
export function isOsaiDirectoryInitialized(osaiDir?: string): boolean {
  const dir = osaiDir ?? getOsaiDirectory();
  return fs.existsSync(path.join(dir, 'openclaw.json'));
}

/**
 * Lists all expected paths in the osaI directory.
 */
export function getExpectedPaths(osaiDir?: string): string[] {
  const dir = osaiDir ?? getOsaiDirectory();
  return [
    dir,
    path.join(dir, 'openclaw.json'),
    path.join(dir, 'logs'),
    path.join(dir, 'sessions'),
    path.join(dir, 'memory'),
    path.join(dir, 'workspace'),
    path.join(dir, 'workspace', 'skills'),
  ];
}
