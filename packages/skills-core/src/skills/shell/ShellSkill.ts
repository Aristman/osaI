/**
 * @osai/skills-core -- Shell Skill (DOMAIN-003, T-005)
 *
 * Bundled skill providing shell command execution with timeout support
 * and a placeholder for Docker sandbox execution (F-012).
 *
 * Tools:
 * - exec: Execute a shell command via child_process.spawnSync
 * - exec_sandbox: Placeholder for Docker sandbox (implementation in F-012)
 */

import { spawnSync } from 'node:child_process';
import type { SkillDefinition, ToolHandler, ToolResult } from '../../types.js';

// --- Platform detection ---

const IS_WINDOWS = process.platform === 'win32';

/** Shell executable and arguments for the current platform. */
const SHELL_CONFIG: Readonly<{ command: string; args: string[] }> = IS_WINDOWS
  ? { command: 'cmd.exe', args: ['/c'] }
  : { command: '/bin/sh', args: ['-c'] };

/** Default execution timeout in milliseconds. */
const DEFAULT_TIMEOUT_MS = 30000;

// --- Helper: Platform-specific sleep command for timeout tests ---

/**
 * Returns a platform-specific command that sleeps for the given duration.
 * On Windows: `timeout /t <seconds> /nobreak`
 * On Linux/macOS: `sleep <seconds>`
 */
export function getSleepCommand(seconds: number): string {
  if (IS_WINDOWS) {
    return `timeout /t ${seconds} /nobreak`;
  }
  return `sleep ${seconds}`;
}

// --- exec handler ---

/**
 * Execute a shell command on the host system.
 *
 * Uses `child_process.spawnSync` for deterministic, synchronous execution.
 * The command is routed through the platform shell (cmd.exe or /bin/sh).
 *
 * Parameters:
 * - command (string, required): The shell command to execute.
 * - timeout (number, optional): Maximum execution time in ms (default: 30000).
 *
 * Returns ToolResult with { stdout, stderr, exitCode } on success,
 * or error details on failure (non-zero exit, timeout, etc.).
 */
const execHandler: ToolHandler = async (
  params: Record<string, unknown>,
): Promise<ToolResult> => {
  const command = params['command'];
  if (typeof command !== 'string' || command.length === 0) {
    return {
      success: false,
      error: "Parameter 'command' is required and must be a non-empty string.",
    };
  }

  const timeout =
    typeof params['timeout'] === 'number' && params['timeout'] > 0
      ? params['timeout']
      : DEFAULT_TIMEOUT_MS;

  const result = spawnSync(SHELL_CONFIG.command, [...SHELL_CONFIG.args, command], {
    timeout,
    encoding: 'utf-8',
    killSignal: 'SIGKILL',
    windowsHide: true,
  });

  const stdout = (result.stdout ?? '').trimEnd();
  const stderr = (result.stderr ?? '').trimEnd();
  const exitCode = result.status ?? -1;

  if (result.error) {
    const message = result.error.message ?? String(result.error);
    const isTimeout = message.toLowerCase().includes('timeout') || result.signal === 'SIGKILL';

    if (isTimeout) {
      return {
        success: false,
        error: `Command timed out after ${timeout}ms`,
        data: { stdout, stderr, exitCode: -1, timedOut: true },
      };
    }

    return {
      success: false,
      error: message,
      data: { stdout, stderr, exitCode },
    };
  }

  if (exitCode !== 0) {
    return {
      success: false,
      data: { stdout, stderr, exitCode },
      error: stderr || `Command exited with code ${exitCode}`,
    };
  }

  return {
    success: true,
    data: { stdout, stderr, exitCode },
  };
};

// --- exec_sandbox handler (placeholder) ---

/**
 * Placeholder handler for Docker sandbox execution.
 * Will be implemented in F-012.
 *
 * Parameters:
 * - command (string, required): The command to execute inside Docker.
 * - image (string, optional): Docker image to use.
 */
const execSandboxHandler: ToolHandler = async (
  _params: Record<string, unknown>,
): Promise<ToolResult> => {
  return {
    success: false,
    error: 'Docker sandbox not implemented yet',
  };
};

// --- Skill Definition ---

/**
 * Create the Shell Skill definition programmatically.
 *
 * This is a bundled skill (not loaded from SKILL.md via parser).
 * It defines 2 tools: exec and exec_sandbox, both with 'confirm' permission.
 */
export function createShellSkill(): SkillDefinition {
  return {
    name: 'shell',
    version: '0.0.1',
    description:
      'Execute shell commands and sandboxed operations. Provides direct command execution with timeout support and Docker sandbox (placeholder).',
    category: 'bundled',
    enabled: true,
    permissions: {
      exec: 'confirm',
      exec_sandbox: 'confirm',
    },
    tools: [
      {
        name: 'exec',
        description:
          'Execute a shell command directly on the host system. Returns stdout, stderr, and exit code. Supports configurable timeout (default 30000ms).',
        parameters: {
          type: 'object',
          properties: {
            command: {
              type: 'string',
              description: 'The shell command to execute.',
            },
            timeout: {
              type: 'number',
              description: 'Maximum execution time in milliseconds (default: 30000).',
            },
          },
          required: ['command'],
        },
        handler: execHandler,
      },
      {
        name: 'exec_sandbox',
        description:
          'Execute a command in an isolated Docker container. (Not yet implemented -- placeholder for F-012.)',
        parameters: {
          type: 'object',
          properties: {
            command: {
              type: 'string',
              description: 'The shell command to execute inside the Docker container.',
            },
            image: {
              type: 'string',
              description: 'Docker image to use for the sandbox container (default: ubuntu:latest).',
            },
          },
          required: ['command'],
        },
        handler: execSandboxHandler,
      },
    ],
  };
}
