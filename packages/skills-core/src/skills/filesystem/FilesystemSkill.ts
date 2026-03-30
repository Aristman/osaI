/**
 * @osai/skills-core -- FilesystemSkill (DOMAIN-003)
 *
 * Bundled filesystem skill with 7 tools:
 * read_file, write_file, list_dir, search_files,
 * move_file, delete_file, get_file_info.
 *
 * Uses sync fs API (better-sqlite3 style).
 * Programmatically created SkillDefinition -- no SkillMdParser dependency.
 */

import fs from 'node:fs';
import path from 'node:path';
import type {
  SkillDefinition,
  ToolDefinitionWithHandler,
  PermissionPolicy,
} from '../../types.js';

/**
 * Create the FilesystemSkill definition.
 *
 * All handlers use synchronous fs API for consistency with
 * the project's better-sqlite3 style.
 *
 * Permission mapping:
 * - read_file, list_dir, search_files, get_file_info -> 'auto'
 * - write_file, move_file, delete_file -> 'confirm'
 */
export function createFilesystemSkill(): SkillDefinition {
  const tools: ToolDefinitionWithHandler[] = [
    {
      name: 'read_file',
      description: 'Read the full content of a text file from the local filesystem.',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Absolute path to the file to read.',
          },
        },
        required: ['path'],
      },
      handler: readFileHandler,
    },
    {
      name: 'write_file',
      description: 'Create or overwrite a file with the given content.',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Absolute path to the file to write.',
          },
          content: {
            type: 'string',
            description: 'Content to write to the file.',
          },
        },
        required: ['path', 'content'],
      },
      handler: writeFileHandler,
    },
    {
      name: 'list_dir',
      description: 'List files and directories in the specified directory.',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Absolute path to the directory to list.',
          },
        },
        required: ['path'],
      },
      handler: listDirHandler,
    },
    {
      name: 'search_files',
      description:
        'Search for files matching a glob pattern in a directory tree.',
      parameters: {
        type: 'object',
        properties: {
          pattern: {
            type: 'string',
            description:
              'Glob pattern to match files (e.g. "*.ts", "**/*.json").',
          },
          directory: {
            type: 'string',
            description: 'Root directory to search in.',
          },
        },
        required: ['pattern', 'directory'],
      },
      handler: searchFilesHandler,
    },
    {
      name: 'move_file',
      description: 'Move or rename a file or directory.',
      parameters: {
        type: 'object',
        properties: {
          source: {
            type: 'string',
            description: 'Absolute path to the source file or directory.',
          },
          destination: {
            type: 'string',
            description: 'Absolute path to the destination.',
          },
        },
        required: ['source', 'destination'],
      },
      handler: moveFileHandler,
    },
    {
      name: 'delete_file',
      description: 'Delete a file from the local filesystem.',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Absolute path to the file to delete.',
          },
        },
        required: ['path'],
      },
      handler: deleteFileHandler,
    },
    {
      name: 'get_file_info',
      description:
        'Get metadata for a file or directory (size, mtime, type).',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Absolute path to the file or directory.',
          },
        },
        required: ['path'],
      },
      handler: getFileInfoHandler,
    },
  ];

  const permissions: PermissionPolicy = {
    read_file: 'auto',
    write_file: 'confirm',
    list_dir: 'auto',
    search_files: 'auto',
    move_file: 'confirm',
    delete_file: 'confirm',
    get_file_info: 'auto',
  };

  return {
    name: 'filesystem',
    version: '1.0.0',
    description:
      'Bundled filesystem skill providing file and directory operations.',
    category: 'bundled',
    tools,
    enabled: true,
    permissions,
  };
}

// --- Handlers ---
//
// Handlers return raw data on success (registry.execute() wraps into
// { success: true, data }) or throw Error on failure (registry.execute()
// catches and returns { success: false, error }).
// Direct handler invocation still works -- callers get raw data or Error.

async function readFileHandler(params: Record<string, unknown>): Promise<string> {
  const filePath = String(params['path'] ?? '');
  if (!filePath) {
    throw new Error('Parameter "path" is required');
  }

  const resolved = path.resolve(filePath);
  return fs.readFileSync(resolved, 'utf-8');
}

async function writeFileHandler(
  params: Record<string, unknown>,
): Promise<{ path: string }> {
  const filePath = String(params['path'] ?? '');
  const content = String(params['content'] ?? '');

  if (!filePath) {
    throw new Error('Parameter "path" is required');
  }

  const resolved = path.resolve(filePath);
  const dir = path.dirname(resolved);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(resolved, content, 'utf-8');
  return { path: resolved };
}

async function listDirHandler(
  params: Record<string, unknown>,
): Promise<Array<{ name: string; type: 'file' | 'dir' }>> {
  const dirPath = String(params['path'] ?? '');
  if (!dirPath) {
    throw new Error('Parameter "path" is required');
  }

  const resolved = path.resolve(dirPath);
  const entries = fs.readdirSync(resolved, { withFileTypes: true });
  return entries.map((entry) => ({
    name: entry.name,
    type: entry.isDirectory() ? 'dir' as const : 'file' as const,
  }));
}

async function searchFilesHandler(
  params: Record<string, unknown>,
): Promise<string[]> {
  const pattern = String(params['pattern'] ?? '');
  const directory = String(params['directory'] ?? '');

  if (!pattern || !directory) {
    throw new Error('Parameters "pattern" and "directory" are required');
  }

  const resolvedDir = path.resolve(directory);
  return globSearch(resolvedDir, pattern);
}

async function moveFileHandler(
  params: Record<string, unknown>,
): Promise<{ from: string; to: string }> {
  const source = String(params['source'] ?? '');
  const destination = String(params['destination'] ?? '');

  if (!source || !destination) {
    throw new Error('Parameters "source" and "destination" are required');
  }

  const resolvedSource = path.resolve(source);
  const resolvedDestination = path.resolve(destination);
  fs.renameSync(resolvedSource, resolvedDestination);
  return { from: resolvedSource, to: resolvedDestination };
}

async function deleteFileHandler(
  params: Record<string, unknown>,
): Promise<{ path: string }> {
  const filePath = String(params['path'] ?? '');
  if (!filePath) {
    throw new Error('Parameter "path" is required');
  }

  const resolved = path.resolve(filePath);
  fs.unlinkSync(resolved);
  return { path: resolved };
}

async function getFileInfoHandler(
  params: Record<string, unknown>,
): Promise<{ size: number; mtime: string; type: 'file' | 'dir' }> {
  const filePath = String(params['path'] ?? '');
  if (!filePath) {
    throw new Error('Parameter "path" is required');
  }

  const resolved = path.resolve(filePath);
  const stat = fs.statSync(resolved);
  return {
    size: stat.size,
    mtime: stat.mtime.toISOString(),
    type: stat.isDirectory() ? 'dir' : 'file',
  };
}

// --- Glob pattern matching ---

/**
 * Minimal glob-to-regexp converter for file searching.
 * Supports: * (any chars except /), ** (any depth including zero), ? (single char).
 * Does NOT support character classes [abc] or negation.
 *
 * Examples:
 *   *.ts        - matches a.ts but not dir/a.ts
 *   star-star/*.ts  - matches a.ts, dir/a.ts, dir/sub/a.ts
 *   star-star/*.json - matches any .json file at any depth
 */
function globToRegExp(globPattern: string): RegExp {
  // Step 1: Replace **/ (globstar with trailing slash) first
  // This matches zero or more path segments. **/a.ts matches a.ts and dir/a.ts
  // Also handle trailing ** (match everything)
  let pattern = globPattern;

  // Replace **/ at start or middle -> (optional any-prefix/)
  pattern = pattern.replace(/\*\*\//g, 'GLOBSTAR_SLASH');
  // Replace trailing ** -> match anything
  pattern = pattern.replace(/\/\*\*$/, 'GLOBSTAR_TRAIL');
  // Replace standalone ** -> match any depth
  pattern = pattern.replace(/\*\*/, 'GLOBSTAR_ANY');

  // Step 2: Escape regex special chars (but not our placeholders)
  pattern = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\?/g, '[^/]');

  // Step 3: Replace placeholders with regex
  // GLOBSTAR_SLASH: any prefix ending with /, or nothing (for **/ at start)
  pattern = pattern.replace(/GLOBSTAR_SLASH/g, '(?:.+/)?');
  // GLOBSTAR_TRAIL: anything after the last /
  pattern = pattern.replace(/GLOBSTAR_TRAIL/g, '.*');
  // GLOBSTAR_ANY: any prefix (zero or more path segments)
  pattern = pattern.replace(/GLOBSTAR_ANY/g, '.*');

  // Step 4: Replace remaining * (single-level: any chars except /)
  pattern = pattern.replace(/\*/g, '[^/]*');

  return new RegExp(`^${pattern}$`);
}

/**
 * Recursively search a directory tree for files matching a glob pattern.
 */
function globSearch(rootDir: string, globPattern: string): string[] {
  const regex = globToRegExp(globPattern);
  const results: string[] = [];

  function walk(currentDir: string): void {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(currentDir, { withFileTypes: true });
    } catch {
      return; // skip unreadable directories
    }

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);

      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile()) {
        // Test relative path from rootDir against the pattern
        const relativePath = path.relative(rootDir, fullPath);
        // Normalize to forward slashes for glob matching
        const normalized = relativePath.replace(/\\/g, '/');
        if (regex.test(normalized)) {
          results.push(fullPath);
        }
      }
    }
  }

  walk(rootDir);
  return results.sort();
}
