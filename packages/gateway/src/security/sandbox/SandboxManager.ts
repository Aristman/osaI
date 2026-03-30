/**
 * SandboxManager -- Mode detection + graceful degradation
 * Task T-005, Feature F-012, Domain DOMAIN-001
 *
 * Responsibilities:
 * - Detect Docker availability (docker info)
 * - Manage sandbox execution mode
 * - Graceful degradation to PERMISSION_ONLY when Docker is unavailable
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { SandboxMode, type SandboxExecResult, type SandboxManagerState, type DockerConfig, type DockerInfo } from './types.js';
import { DockerSandbox } from './DockerSandbox.js';

const execFileAsync = promisify(execFile);

/** Default Docker constraints */
const DEFAULT_CONSTRAINTS = {
  memory: '512m',
  cpus: '1.0',
  networkNone: true,
  autoRemove: true,
  readOnly: true,
};

/** Default Docker config */
export const DEFAULT_DOCKER_CONFIG: DockerConfig = {
  image: 'alpine:latest',
  constraints: DEFAULT_CONSTRAINTS,
  execTimeoutMs: 30000,
  workdir: '/workspace',
};

/**
 * SandboxManager orchestrates sandbox execution with automatic mode detection.
 *
 * - When Docker is available: commands execute in isolated containers
 * - When Docker is unavailable: graceful degradation to permission-only mode
 */
export class SandboxManager {
  private state: SandboxManagerState;
  private dockerSandbox: DockerSandbox;

  constructor(initialState?: Partial<SandboxManagerState>) {
    this.state = {
      mode: SandboxMode.PERMISSION_ONLY,
      dockerInfo: null,
      dockerConfig: DEFAULT_DOCKER_CONFIG,
      ...initialState,
    };
    this.dockerSandbox = new DockerSandbox(this.state.dockerConfig);
  }

  /**
   * Detect sandbox mode by checking Docker availability.
   *
   * Runs `docker info` to verify Docker daemon is reachable.
   * If successful -> DOCKER mode.
   * If failed -> PERMISSION_ONLY mode (graceful degradation).
   *
   * @returns Detected SandboxMode
   */
  async detectMode(): Promise<SandboxMode> {
    const dockerInfo = await this.checkDocker();
    this.state.dockerInfo = dockerInfo;

    if (dockerInfo.available) {
      this.state.mode = SandboxMode.DOCKER;
      this.dockerSandbox = new DockerSandbox(this.state.dockerConfig);
    } else {
      this.state.mode = SandboxMode.PERMISSION_ONLY;
    }

    return this.state.mode;
  }

  /**
   * Execute a command in the sandbox.
   *
   * In DOCKER mode: runs in an isolated Docker container.
   * In PERMISSION_ONLY mode: returns an error indicating Docker is unavailable.
   *
   * @param command - Shell command to execute
   * @returns SandboxExecResult
   */
  async execSandbox(command: string): Promise<SandboxExecResult> {
    if (this.state.mode === SandboxMode.DOCKER) {
      return this.dockerSandbox.exec(command);
    }

    // Graceful degradation: Docker not available
    return {
      success: false,
      stdout: '',
      stderr: `Docker is not available. Command "${command}" requires Docker sandbox. ` +
        `Reason: ${this.state.dockerInfo?.error ?? 'Docker daemon not detected'}. ` +
        'Falling back to permission-only mode.',
      exitCode: -1,
      durationMs: 0,
      mode: SandboxMode.PERMISSION_ONLY,
    };
  }

  /**
   * Check Docker availability by running `docker info`.
   */
  private async checkDocker(): Promise<DockerInfo> {
    try {
      const result = await this.executeCommand('docker', ['info', '--format', '{{json .}}']);

      if (result.success) {
        try {
          const info = JSON.parse(result.stdout) as { ServerVersion?: string };
          return {
            available: true,
            serverVersion: info.ServerVersion,
          };
        } catch {
          // Docker info returned non-JSON -- treat as available
          return { available: true };
        }
      }

      return {
        available: false,
        error: result.stderr || `exit code ${result.exitCode}`,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        available: false,
        error: message,
      };
    }
  }

  /**
   * Execute a system command. Extracted as protected method for testing.
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  protected async executeCommand(
    _command: string,
    _args: string[],
  ): Promise<SandboxExecResult> {
    try {
      const { stdout, stderr } = await execFileAsync(_command, _args, {
        timeout: 5000,
      });

      return {
        success: true,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        exitCode: 0,
        durationMs: 0,
        mode: SandboxMode.DOCKER,
      };
    } catch (err) {
      const execErr = err as Error & { code?: string; stderr?: string };
      return {
        success: false,
        stdout: '',
        stderr: execErr.stderr || execErr.message || String(err),
        exitCode: parseInt(execErr.code ?? '1', 10),
        durationMs: 0,
        mode: SandboxMode.DOCKER,
      };
    }
  }

  /**
   * Get current manager state.
   */
  getState(): Readonly<SandboxManagerState> {
    return { ...this.state };
  }

  /**
   * Check if Docker is currently available.
   */
  isDockerAvailable(): boolean {
    return this.state.mode === SandboxMode.DOCKER;
  }

  /**
   * Build Docker run arguments from current config.
   * Useful for debugging and logging.
   */
  buildDockerRunArgs(command: string): string[] {
    return this.dockerSandbox.buildRunArgs(command);
  }
}
