/**
 * @osai/skills-core -- Bundled Skills (DOMAIN-003)
 *
 * Built-in skills: Filesystem, Shell, Browser, HTTP.
 * Skill registry, SKILL.md parser, permission model.
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
