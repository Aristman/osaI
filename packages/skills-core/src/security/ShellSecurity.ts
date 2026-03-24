/**
 * @osai/skills-core -- ShellSecurity
 *
 * Provides command validation and security for shell operations.
 * Blocks dangerous commands and applies timeout limits.
 */

import type { CommandValidationResult, ShellSecurityConfig } from '../types.js';

const DEFAULT_BLOCKED_COMMANDS: string[] = [
  'rm -rf /',
  'rm -rf /*',
  'mkfs',
  'dd if=',
  '> /dev/sd',
  'chmod -R 777 /',
  'chown -R',
  ':(){ :|:& };:',
  'fork bomb',
  'shutdown',
  'reboot',
  'halt',
  'poweroff',
  'init 0',
  'init 6',
];

const DEFAULT_TIMEOUT = 30_000; // 30 seconds

export class ShellSecurity {
  private readonly blockedCommands: string[];
  private readonly timeout: number;

  constructor(config?: Partial<ShellSecurityConfig>) {
    this.blockedCommands = [
      ...(config?.blockedCommands ?? DEFAULT_BLOCKED_COMMANDS),
    ];
    this.timeout = config?.timeout ?? DEFAULT_TIMEOUT;
  }

  /**
   * Validate a shell command against security rules.
   *
   * @param command - The shell command to validate
   * @returns CommandValidationResult with validity info
   */
  validateCommand(command: string): CommandValidationResult {
    const trimmed = command.trim();

    if (trimmed === '') {
      return { valid: false, error: 'Command is empty' };
    }

    if (this.isBlocked(trimmed)) {
      return {
        valid: false,
        error: `Command is blocked for security reasons`,
      };
    }

    const sanitized = this.sanitizeCommand(trimmed);
    return { valid: true, sanitized };
  }

  /**
   * Check if a command matches any blocked patterns.
   *
   * @param command - The command to check
   * @returns true if the command is blocked
   */
  isBlocked(command: string): boolean {
    const lower = command.toLowerCase().trim();

    return this.blockedCommands.some((blocked) => {
      const blockedLower = blocked.toLowerCase().trim();
      return lower.includes(blockedLower);
    });
  }

  /**
   * Apply basic sanitization to a command.
   * Removes trailing/leading whitespace and normalizes multiple spaces.
   *
   * @param command - The command to sanitize
   * @returns Sanitized command string
   */
  sanitizeCommand(command: string): string {
    return command
      .trim()
      .replace(/\s+/g, ' ')
      .replace(/;\s*$/g, '') // Remove trailing semicolons
      .trim();
  }

  /**
   * Get the configured timeout for shell commands.
   *
   * @returns Timeout in milliseconds
   */
  getTimeout(): number {
    return this.timeout;
  }

  /**
   * Get the list of blocked commands.
   *
   * @returns Copy of blocked commands array
   */
  getBlockedCommands(): string[] {
    return [...this.blockedCommands];
  }
}
