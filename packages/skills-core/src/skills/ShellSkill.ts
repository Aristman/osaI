/**
 * @osai/skills-core -- ShellSkill
 *
 * Provides shell command execution with security validation
 * via ShellSecurity.
 */

import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import type { SkillDefinition, ToolExecutor, ToolResult } from '@osai/agent';
import { ShellSecurity } from '../security/ShellSecurity.js';
import type { ShellSecurityConfig } from '../types.js';

const execAsync = promisify(exec);

// ---------------------------------------------------------------------------
// Skill Definition
// ---------------------------------------------------------------------------

export function createShellSkillDefinition(): SkillDefinition {
  return {
    name: 'shell',
    version: '1.0.0',
    description:
      'Provides shell command execution with security validation. Commands are validated against a blocklist before execution.',
    category: 'system',
    tools: [
      {
        name: 'execute',
        description:
          'Execute a shell command with an optional timeout. The command is validated against a security blocklist before execution.',
        category: 'execute',
        parameters: {
          type: 'object',
          properties: {
            command: {
              type: 'string',
              description: 'The shell command to execute.',
            },
            timeout: {
              type: 'number',
              description:
                'Optional timeout in milliseconds. Defaults to the configured shell timeout.',
            },
          },
          required: ['command'],
        },
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Tool Executors
// ---------------------------------------------------------------------------

function createExecutors(security: ShellSecurity): Record<string, ToolExecutor> {
  return {
    execute: async (params): Promise<ToolResult> => {
      const command = String(params['command'] ?? '');
      const customTimeout = params['timeout'] as number | undefined;

      const validation = security.validateCommand(command);
      if (!validation.valid) {
        return {
          success: false,
          error: validation.error ?? 'Command validation failed',
        };
      }

      const timeout = customTimeout ?? security.getTimeout();
      const sanitizedCommand = validation.sanitized ?? command;

      try {
        const { stdout, stderr } = await execAsync(sanitizedCommand, {
          timeout,
          maxBuffer: 10 * 1024 * 1024, // 10 MB
        });

        const output = [stdout, stderr].filter(Boolean).join('\n');
        return {
          success: true,
          output: output || '(no output)',
          metadata: {
            exitCode: 0,
            timeout: false,
          },
        };
      } catch (err: unknown) {
        const error = err as {
          message?: string;
          stdout?: string;
          stderr?: string;
          killed?: boolean;
        };
        const output = [error.stdout, error.stderr]
          .filter(Boolean)
          .join('\n');

        if (error.killed) {
          return {
            success: false,
            error: `Command timed out after ${timeout}ms`,
            output: output || undefined,
            metadata: { exitCode: -1, timeout: true },
          };
        }

        return {
          success: false,
          error: error.message ?? 'Command execution failed',
          output: output || undefined,
          metadata: { exitCode: 1, timeout: false },
        };
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createShellSkill(config?: Partial<ShellSecurityConfig>): {
  definition: SkillDefinition;
  executors: Record<string, ToolExecutor>;
} {
  const security = new ShellSecurity(config);
  return {
    definition: createShellSkillDefinition(),
    executors: createExecutors(security),
  };
}
