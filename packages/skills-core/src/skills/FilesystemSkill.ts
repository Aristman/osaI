/**
 * @osai/skills-core -- FilesystemSkill
 *
 * Provides filesystem operations (read, write, list, search, move, delete)
 * with FileSandbox path validation for security.
 */

import {
  readFile,
  writeFile,
  readdir,
  rename,
  unlink,
  stat,
  mkdir,
} from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { glob } from 'node:fs/promises';
import type { SkillDefinition, ToolExecutor, ToolResult } from '@osai/agent';
import { FileSandbox } from '../security/FileSandbox.js';
import type { FileSandboxConfig } from '../types.js';

// ---------------------------------------------------------------------------
// Skill Definition
// ---------------------------------------------------------------------------

export function createFilesystemSkillDefinition(): SkillDefinition {
  return {
    name: 'filesystem',
    version: '1.0.0',
    description:
      'Provides filesystem operations including reading, writing, listing, searching, moving, and deleting files within a sandboxed directory.',
    category: 'system',
    tools: [
      {
        name: 'read_file',
        description: 'Read the contents of a file at the given path.',
        category: 'read',
        parameters: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'Absolute or relative path to the file to read.',
            },
          },
          required: ['path'],
        },
      },
      {
        name: 'write_file',
        description: 'Write content to a file at the given path. Creates parent directories if needed.',
        category: 'write',
        parameters: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'Absolute or relative path to the file to write.',
            },
            content: {
              type: 'string',
              description: 'The content to write to the file.',
            },
          },
          required: ['path', 'content'],
        },
      },
      {
        name: 'list_directory',
        description: 'List files and directories at the given path.',
        category: 'read',
        parameters: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'Absolute or relative path to the directory to list.',
            },
          },
          required: ['path'],
        },
      },
      {
        name: 'search_files',
        description: 'Search for files matching a glob pattern within a directory.',
        category: 'read',
        parameters: {
          type: 'object',
          properties: {
            pattern: {
              type: 'string',
              description: 'Glob pattern to search for (e.g., "**/*.ts").',
            },
            directory: {
              type: 'string',
              description: 'Directory to search in.',
            },
          },
          required: ['pattern', 'directory'],
        },
      },
      {
        name: 'move_file',
        description: 'Move or rename a file from source to target path.',
        category: 'write',
        parameters: {
          type: 'object',
          properties: {
            source: {
              type: 'string',
              description: 'Source file path.',
            },
            target: {
              type: 'string',
              description: 'Target file path.',
            },
          },
          required: ['source', 'target'],
        },
      },
      {
        name: 'delete_file',
        description: 'Delete a file at the given path.',
        category: 'write',
        parameters: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'Absolute or relative path to the file to delete.',
            },
          },
          required: ['path'],
        },
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Tool Executors
// ---------------------------------------------------------------------------

function createExecutors(sandbox: FileSandbox): Record<string, ToolExecutor> {
  return {
    read_file: async (params): Promise<ToolResult> => {
      const path = String(params['path'] ?? '');
      const validation = sandbox.validatePath(path, 'read');
      if (!validation.valid) {
        return {
          success: false,
          error: validation.error ?? 'Path validation failed',
        };
      }

      try {
        const content = await readFile(
          validation.resolvedPath!,
          'utf-8',
        );
        return { success: true, output: content };
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Failed to read file';
        return { success: false, error: message };
      }
    },

    write_file: async (params): Promise<ToolResult> => {
      const path = String(params['path'] ?? '');
      const content = String(params['content'] ?? '');

      // For write, validate the directory first
      const dirToCheck = dirname(path);
      const dirValidation = sandbox.validatePath(dirToCheck, 'write');
      if (!dirValidation.valid) {
        return {
          success: false,
          error: dirValidation.error ?? 'Directory validation failed',
        };
      }

      // Also validate the target path itself
      const pathValidation = sandbox.validatePath(path, 'write');
      if (!pathValidation.valid) {
        return {
          success: false,
          error: pathValidation.error ?? 'Path validation failed',
        };
      }

      try {
        // Ensure parent directory exists
        await mkdir(dirname(pathValidation.resolvedPath!), {
          recursive: true,
        });
        await writeFile(pathValidation.resolvedPath!, content, 'utf-8');
        return {
          success: true,
          output: `File written successfully to ${path}`,
        };
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Failed to write file';
        return { success: false, error: message };
      }
    },

    list_directory: async (params): Promise<ToolResult> => {
      const path = String(params['path'] ?? '');
      const validation = sandbox.validatePath(path, 'list');
      if (!validation.valid) {
        return {
          success: false,
          error: validation.error ?? 'Path validation failed',
        };
      }

      try {
        const entries = await readdir(validation.resolvedPath!, {
          withFileTypes: true,
        });
        const listing = entries
          .map((entry) => {
            const type = entry.isDirectory() ? 'DIR' : 'FILE';
            return `${type}  ${entry.name}`;
          })
          .join('\n');
        return {
          success: true,
          output: listing,
          metadata: { count: entries.length },
        };
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Failed to list directory';
        return { success: false, error: message };
      }
    },

    search_files: async (params): Promise<ToolResult> => {
      const pattern = String(params['pattern'] ?? '');
      const directory = String(params['directory'] ?? '');

      const validation = sandbox.validatePath(directory, 'search');
      if (!validation.valid) {
        return {
          success: false,
          error: validation.error ?? 'Directory validation failed',
        };
      }

      try {
        const searchPath = join(validation.resolvedPath!, pattern);
        const matches: string[] = [];
        for await (const file of glob(searchPath)) {
          // Filter results through sandbox
          if (sandbox.isAllowed(file)) {
            matches.push(file);
          }
        }
        return {
          success: true,
          output: matches.join('\n'),
          metadata: { count: matches.length },
        };
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Failed to search files';
        return { success: false, error: message };
      }
    },

    move_file: async (params): Promise<ToolResult> => {
      const source = String(params['source'] ?? '');
      const target = String(params['target'] ?? '');

      const sourceValidation = sandbox.validatePath(source, 'read');
      if (!sourceValidation.valid) {
        return {
          success: false,
          error: `Source: ${sourceValidation.error ?? 'Path validation failed'}`,
        };
      }

      const targetValidation = sandbox.validatePath(target, 'write');
      if (!targetValidation.valid) {
        return {
          success: false,
          error: `Target: ${targetValidation.error ?? 'Path validation failed'}`,
        };
      }

      try {
        await rename(sourceValidation.resolvedPath!, targetValidation.resolvedPath!);
        return {
          success: true,
          output: `File moved from ${source} to ${target}`,
        };
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Failed to move file';
        return { success: false, error: message };
      }
    },

    delete_file: async (params): Promise<ToolResult> => {
      const path = String(params['path'] ?? '');
      const validation = sandbox.validatePath(path, 'delete');
      if (!validation.valid) {
        return {
          success: false,
          error: validation.error ?? 'Path validation failed',
        };
      }

      try {
        // Prevent deletion of directories
        const fileStat = await stat(validation.resolvedPath!);
        if (fileStat.isDirectory()) {
          return {
            success: false,
            error: 'delete_file can only delete files, not directories',
          };
        }

        await unlink(validation.resolvedPath!);
        return {
          success: true,
          output: `File deleted successfully: ${path}`,
        };
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Failed to delete file';
        return { success: false, error: message };
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createFilesystemSkill(config: FileSandboxConfig): {
  definition: SkillDefinition;
  executors: Record<string, ToolExecutor>;
} {
  const sandbox = new FileSandbox(config);
  return {
    definition: createFilesystemSkillDefinition(),
    executors: createExecutors(sandbox),
  };
}
