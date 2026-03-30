/**
 * @osai/skills-core -- Shell Security Barrel Export (DOMAIN-003, T-003/T-004)
 *
 * Exports ShellSecurity module: CommandValidator, ShellSecurity,
 * SecureShellExecutor, and types.
 */

export { CommandValidator } from './CommandValidator.js';
export { ShellSecurity, resolveConfig } from './ShellSecurity.js';
export { SecureShellExecutor } from './SecureShellExecutor.js';

export type {
  AllowedResult,
  BlockedCommand,
  CommandLogEntry,
  ShellSecurityConfig,
  ShellSecurityUserConfig,
} from './types.js';

export type { CommandExecutionResult } from './ShellSecurity.js';
export type { SecureExecParams } from './SecureShellExecutor.js';
