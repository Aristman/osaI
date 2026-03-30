/**
 * @osai/skills-core -- Security Module barrel export (DOMAIN-003, T-001..T-004)
 *
 * Exports all security-related modules from skills-core:
 *   - File Sandbox (T-001/T-002): FileSandbox, SymlinkResolver, SandboxAwareFilesystemSkill
 *   - Shell Security (T-003/T-004): CommandValidator, ShellSecurity, SecureShellExecutor
 *   - Permissions: PermissionChecker
 */

// File Sandbox (Layer 4)
export {
  FileSandbox,
  SymlinkResolver,
  createSandboxAwareFilesystemSkill,
  DEFAULT_BLOCKED_PATTERNS,
} from './file-sandbox/index.js';

export type {
  FileSandboxConfig,
  SandboxResult,
} from './file-sandbox/types.js';

// Shell Security (Layer 5)
export {
  CommandValidator,
  ShellSecurity,
  SecureShellExecutor,
  resolveConfig,
} from './shell/index.js';

export type {
  AllowedResult,
  BlockedCommand,
  CommandLogEntry,
  ShellSecurityConfig,
  ShellSecurityUserConfig,
} from './shell/types.js';

export type { CommandExecutionResult } from './shell/ShellSecurity.js';
export type { SecureExecParams } from './shell/SecureShellExecutor.js';
