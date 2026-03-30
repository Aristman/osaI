/**
 * @osai/skills-core -- Secure Shell Executor (DOMAIN-003, T-004)
 *
 * Wrapper around ShellSkill exec that integrates ShellSecurity:
 * - Every command passes through CommandValidator before execution
 * - Blocked commands return ToolResult with success=false (no execution)
 * - Timeout enforcement via ShellSecurity (process group kill)
 * - Audit log entry created for every exec call
 *
 * This is the security integration layer (Layer 5 of the 7-layer model)
 * that bridges ShellSkill with the ShellSecurity module from T-003.
 */

import type { ToolResult } from '../../types.js';
import type { ShellSecurity } from './ShellSecurity.js';

// --- Exec Parameters ---

/**
 * Parameters accepted by SecureShellExecutor.exec().
 */
export interface SecureExecParams {
  /** The shell command to execute */
  readonly command: string;
  /** Optional execution timeout in milliseconds (overrides ShellSecurity default) */
  readonly timeout?: number;
  /** Optional working directory for the command */
  readonly cwd?: string;
}

// --- SecureShellExecutor ---

/**
 * Secure wrapper around shell command execution.
 *
 * Integrates with ShellSecurity (T-003) to provide:
 * 1. Command validation against blocked patterns (CommandValidator)
 * 2. Timeout enforcement via child_process with process group kill
 * 3. Audit logging for every execution attempt
 *
 * Usage:
 * ```typescript
 * const security = new ShellSecurity({ timeoutMs: 30000 });
 * const executor = new SecureShellExecutor(security);
 * const result = await executor.exec({ command: 'ls -la' });
 * // result: ToolResult { success: true, data: { stdout, stderr, exitCode } }
 * ```
 */
export class SecureShellExecutor {
  private readonly security: ShellSecurity;

  constructor(security: ShellSecurity) {
    this.security = security;
  }

  /**
   * Execute a shell command with security validation.
   *
   * Flow:
   * 1. Validate command against blocked patterns (CommandValidator)
   * 2. If blocked: return ToolResult { success: false, error: "blocked command" }
   * 3. If allowed: execute via ShellSecurity.execute() with timeout
   * 4. Audit log entry is recorded for every call (blocked or not)
   *
   * @param params - Command and optional execution options
   * @returns ToolResult with execution data or error
   */
  async exec(params: SecureExecParams): Promise<ToolResult> {
    const { command, timeout, cwd } = params;

    // ShellSecurity.execute() handles validation internally:
    // - Blocked commands: returns { success: false, error: "Blocked command: ..." }
    // - Timeout: returns { success: false, error: "Command timed out after ..." }
    // - Normal execution: returns { success: true, stdout, stderr, exitCode }
    const result = await this.security.execute(command, {
      timeoutMs: timeout,
      cwd,
    });

    if (!result.success) {
      // Build data payload from execution result (may include stdout, stderr, etc.)
      const data: Record<string, unknown> = {};
      if (result.stdout !== undefined) data['stdout'] = result.stdout;
      if (result.stderr !== undefined) data['stderr'] = result.stderr;
      data['exitCode'] = result.exitCode;
      if (result.logEntry.timedOut) {
        data['timedOut'] = true;
      }

      return {
        success: false,
        error: result.error,
        data,
      };
    }

    return {
      success: true,
      data: {
        stdout: result.stdout,
        stderr: result.stderr,
        exitCode: result.exitCode,
      },
    };
  }

  /**
   * Get the underlying ShellSecurity instance.
   * Useful for inspecting audit log entries or configuration.
   */
  getSecurity(): ShellSecurity {
    return this.security;
  }
}
