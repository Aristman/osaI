/**
 * @osai/skills-core -- Shell Security (DOMAIN-003, T-003)
 *
 * Orchestrates shell command security:
 * - Validates commands through CommandValidator
 * - Enforces execution timeout via child_process
 * - Logs all command executions (command, cwd, exit_code, timestamp)
 * - Loads configuration from osai.json (security.shell.*)
 */

import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import type {
  AllowedResult,
  CommandLogEntry,
  ShellSecurityConfig,
  ShellSecurityUserConfig,
} from './types.js';
import { CommandValidator } from './CommandValidator.js';

// --- Default Configuration ---

/** Default timeout: 120 seconds */
const DEFAULT_TIMEOUT_MS = 120_000;

/** Default cwd: process.cwd() */
const DEFAULT_CWD = process.cwd();

// --- Shell Security ---

/**
 * Shell Security module (Layer 5 of the 7-layer security model).
 *
 * Responsibilities:
 * 1. Validate commands against blocked list (CommandValidator)
 * 2. Enforce timeout on command execution
 * 3. Log all executions for audit trail
 * 4. Provide configurable defaults from osai.json
 */
export class ShellSecurity {
  private readonly validator: CommandValidator;
  private readonly timeoutMs: number;
  private readonly cwd: string;
  private readonly logEntries: CommandLogEntry[];

  constructor(config?: Partial<ShellSecurityUserConfig>) {
    const resolvedConfig = resolveConfig(config);

    this.validator = new CommandValidator(resolvedConfig.userBlockedCommands ?? []);
    this.timeoutMs = resolvedConfig.timeoutMs;
    this.cwd = resolvedConfig.cwd;
    this.logEntries = [];
  }

  /**
   * Validate a command against the blocked commands list.
   * Does NOT execute the command.
   */
  validate(command: string): AllowedResult {
    return this.validator.validate(command);
  }

  /**
   * Validate and execute a shell command with timeout enforcement.
   *
   * Returns the execution result (stdout, stderr, exitCode) or an error
   * if the command is blocked or times out.
   */
  async execute(command: string, options?: {
    timeoutMs?: number;
    cwd?: string;
  }): Promise<CommandExecutionResult> {
    // Step 1: Validate
    const validation = this.validate(command);
    if (!validation.allowed) {
      const logEntry: CommandLogEntry = {
        command,
        cwd: options?.cwd ?? this.cwd,
        exitCode: -1,
        timestamp: new Date().toISOString(),
        durationMs: 0,
        timedOut: false,
      };
      this.logEntries.push(logEntry);

      return {
        success: false,
        error: `Blocked command: ${validation.reason}`,
        exitCode: -1,
        logEntry,
      };
    }

    // Step 2: Execute with timeout
    const effectiveCwd = options?.cwd ?? this.cwd;
    const effectiveTimeout = options?.timeoutMs ?? this.timeoutMs;
    const startTime = Date.now();

    return new Promise<CommandExecutionResult>((resolve) => {
      const isWindows = process.platform === 'win32';
      const shellCommand = isWindows ? 'cmd.exe' : '/bin/sh';
      const shellArgs = isWindows ? ['/c', command] : ['-c', command];

      const child: ChildProcess = spawn(shellCommand, shellArgs, {
        cwd: effectiveCwd,
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
        // detached enables process group kill on Unix, and is harmless on Windows
        detached: !isWindows,
      });

      let stdout = '';
      let stderr = '';
      let timedOut = false;

      child.stdout?.on('data', (data: Buffer) => {
        stdout += data.toString('utf-8');
      });

      child.stderr?.on('data', (data: Buffer) => {
        stderr += data.toString('utf-8');
      });

      // Timeout enforcement
      const timer = setTimeout(() => {
        timedOut = true;
        if (child.pid !== undefined) {
          if (!isWindows) {
            // On Unix: kill the entire process group
            try {
              process.kill(-child.pid, 'SIGKILL');
            } catch {
              // Process group kill failed, try direct kill
              try { child.kill('SIGKILL'); } catch { /* already exited */ }
            }
          } else {
            // On Windows: use taskkill to terminate the process tree
            // cmd.exe spawns child processes (e.g., ping.exe) that won't be
            // killed by child.kill() alone. taskkill /T /F kills the tree.
            try {
              spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], {
                windowsHide: true,
                stdio: ['ignore', 'ignore', 'ignore'],
              });
            } catch {
              // taskkill failed, try direct kill
              try { child.kill('SIGKILL'); } catch { /* already exited */ }
            }
          }
        }
      }, effectiveTimeout);

      child.on('error', (err) => {
        clearTimeout(timer);
        const durationMs = Date.now() - startTime;
        const exitCode = -1;

        const logEntry: CommandLogEntry = {
          command,
          cwd: effectiveCwd,
          exitCode,
          timestamp: new Date().toISOString(),
          durationMs,
          timedOut: false,
        };
        this.logEntries.push(logEntry);

        resolve({
          success: false,
          error: err.message,
          stdout: stdout.trimEnd(),
          stderr: stderr.trimEnd(),
          exitCode,
          logEntry,
        });
      });

      child.on('close', (code) => {
        clearTimeout(timer);
        const durationMs = Date.now() - startTime;
        const exitCode = code ?? -1;

        const logEntry: CommandLogEntry = {
          command,
          cwd: effectiveCwd,
          exitCode: timedOut ? -1 : exitCode,
          timestamp: new Date().toISOString(),
          durationMs,
          timedOut,
        };
        this.logEntries.push(logEntry);

        if (timedOut) {
          resolve({
            success: false,
            error: `Command timed out after ${effectiveTimeout}ms`,
            stdout: stdout.trimEnd(),
            stderr: stderr.trimEnd(),
            exitCode: -1,
            logEntry,
          });
          return;
        }

        if (exitCode !== 0) {
          resolve({
            success: false,
            stdout: stdout.trimEnd(),
            stderr: stderr.trimEnd(),
            exitCode,
            logEntry,
          });
          return;
        }

        resolve({
          success: true,
          stdout: stdout.trimEnd(),
          stderr: stderr.trimEnd(),
          exitCode,
          logEntry,
        });
      });
    });
  }

  /**
   * Get the execution timeout in milliseconds.
   */
  getTimeoutMs(): number {
    return this.timeoutMs;
  }

  /**
   * Get the configured working directory.
   */
  getCwd(): string {
    return this.cwd;
  }

  /**
   * Get all log entries recorded during this session.
   */
  getLogEntries(): readonly CommandLogEntry[] {
    return this.logEntries;
  }

  /**
   * Get the underlying CommandValidator instance.
   * Useful for inspection of blocked patterns.
   */
  getValidator(): CommandValidator {
    return this.validator;
  }
}

// --- Result Type ---

/**
 * Result of a shell command execution via ShellSecurity.
 */
export interface CommandExecutionResult {
  /** Whether the command executed successfully */
  readonly success: boolean;
  /** stdout content (trimmed) */
  readonly stdout?: string;
  /** stderr content (trimmed) */
  readonly stderr?: string;
  /** Exit code of the process */
  readonly exitCode: number;
  /** Error message on failure */
  readonly error?: string;
  /** Audit log entry for this execution */
  readonly logEntry: CommandLogEntry;
}

// --- Config Resolution ---

/**
 * Merge user config with defaults to produce a full ShellSecurityConfig.
 */
export function resolveConfig(
  userConfig?: Partial<ShellSecurityUserConfig>,
): ShellSecurityConfig {
  return {
    timeoutMs: userConfig?.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    blockedCommands: [], // Hardcoded in CommandValidator
    userBlockedCommands: (userConfig?.blockedCommands ?? []).map(
      (pattern) => ({
        pattern,
        reason: `User-configured blocked command: ${pattern}`,
      }),
    ),
    cwd: userConfig?.cwd ?? DEFAULT_CWD,
  };
}
