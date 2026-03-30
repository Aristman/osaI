/**
 * @osai/skills-core -- Bundled Skills (DOMAIN-003)
 *
 * Built-in skills: Filesystem, Shell, Browser, HTTP.
 * Skill registry, SKILL.md parser, permission model.
 * Security modules: FileSandbox, ShellSecurity, CommandValidator.
 */

export { SkillRegistry } from './registry/SkillRegistry.js';
export { SkillMdParser, SkillMdValidator } from './parser/index.js';
export { PermissionChecker, CATEGORY_DEFAULTS } from './permissions/index.js';
export { createFilesystemSkill } from './skills/filesystem/FilesystemSkill.js';
export { createShellSkill, getSleepCommand } from './skills/shell/index.js';

export type {
  SkillDefinition,
  ToolDefinition,
  ToolDefinitionWithHandler,
  ToolParameters,
  ToolHandler,
  ToolResult,
  PermissionLevel,
  PermissionPolicy,
  SkillCategory,
} from './types.js';

export type {
  PermissionDecision,
  DecisionType,
  RiskLevel,
  ToolCategory,
} from './permissions/types.js';

export type { ParsedSkillMd } from './parser/SkillMdValidator.js';

// Security modules (T-008 barrel export)
export {
  FileSandbox,
  SymlinkResolver,
  createSandboxAwareFilesystemSkill,
  DEFAULT_BLOCKED_PATTERNS,
} from './security/file-sandbox/index.js';

export type {
  FileSandboxConfig,
  SandboxResult,
} from './security/file-sandbox/types.js';

export {
  CommandValidator,
  ShellSecurity,
  SecureShellExecutor,
  resolveConfig,
} from './security/shell/index.js';

export type {
  AllowedResult,
  BlockedCommand,
  CommandLogEntry,
  ShellSecurityConfig,
  ShellSecurityUserConfig,
} from './security/shell/types.js';

export type { CommandExecutionResult } from './security/shell/ShellSecurity.js';
export type { SecureExecParams } from './security/shell/SecureShellExecutor.js';
