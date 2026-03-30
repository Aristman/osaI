/**
 * DockerSandbox -- Docker container lifecycle management
 * Task T-005, Feature F-012, Domain DOMAIN-001
 *
 * Responsibilities:
 * - Execute commands in isolated Docker containers
 * - Apply resource constraints (memory, CPU, network)
 * - Clean up containers after execution
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { DockerConfig, SandboxExecResult } from './types.js';
import { SandboxMode } from './types.js';

const execFileAsync = promisify(execFile);

/** Internal error type for timeout detection */
interface DockerExecError extends Error {
  code?: string;
  killed?: boolean;
}

function isDockerExecError(err: unknown): err is DockerExecError {
  return err instanceof Error;
}

/**
 * DockerSandbox manages isolated Docker container execution.
 *
 * Containers are created with:
 * - `--network=none` -- no network access
 * - `--memory=<limit>` -- memory constraint
 * - `--cpus=<limit>` -- CPU constraint
 * - `--rm` -- auto-cleanup after execution
 * - `--read-only` -- read-only root filesystem
 */
export class DockerSandbox {
  private readonly config: DockerConfig;

  constructor(config: DockerConfig) {
    this.config = config;
  }

  /** Get current configuration */
  getConfig(): DockerConfig {
    return this.config;
  }

  /**
   * Execute a command inside an isolated Docker container.
   *
   * @param command - Shell command to execute
   * @returns SandboxExecResult with stdout/stderr/exitCode
   */
  async exec(command: string): Promise<SandboxExecResult> {
    const startTime = Date.now();

    try {
      const args = this.buildRunArgs(command);

      const { stdout, stderr } = await this.execFileAsync('docker', args);

      const durationMs = Date.now() - startTime;

      return {
        success: true,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        exitCode: 0,
        durationMs,
        mode: SandboxMode.DOCKER,
      };
    } catch (err) {
      const durationMs = Date.now() - startTime;

      if (isDockerExecError(err) && err.killed) {
        return {
          success: false,
          stdout: '',
          stderr: `timeout: command exceeded ${this.config.execTimeoutMs}ms`,
          exitCode: -1,
          durationMs,
          mode: SandboxMode.DOCKER,
        };
      }

      const stderr = isDockerExecError(err) ? err.message : String(err);
      const exitCode = isDockerExecError(err) && err.code ? parseInt(err.code, 10) : 1;

      return {
        success: false,
        stdout: '',
        stderr,
        exitCode: isNaN(exitCode) ? 1 : exitCode,
        durationMs,
        mode: SandboxMode.DOCKER,
      };
    }
  }

  /**
   * Build the `docker run` arguments array from config + command.
   */
  buildRunArgs(command: string): string[] {
    const { constraints, image, workdir } = this.config;
    const args: string[] = [];

    args.push('run');

    // Resource constraints
    args.push(`--memory=${constraints.memory}`);
    args.push(`--cpus=${constraints.cpus}`);

    // Network isolation
    if (constraints.networkNone) {
      args.push('--network=none');
    }

    // Auto-remove container after execution
    if (constraints.autoRemove) {
      args.push('--rm');
    }

    // Read-only filesystem
    if (constraints.readOnly) {
      args.push('--read-only');
    }

    // Working directory
    if (workdir) {
      args.push('-w', workdir);
    }

    // Image
    args.push(image);

    // Command + arguments
    args.push(...command.split(' ').filter(part => part.length > 0));

    return args;
  }

  /**
   * Execute docker command with timeout.
   * Exposed as a method for testing/mocking purposes.
   */
  async execFileAsync(cmd: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
    return execFileAsync(cmd, args, { timeout: this.config.execTimeoutMs });
  }
}
