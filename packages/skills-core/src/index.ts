/**
 * @osai/skills-core -- Barrel export
 *
 * Core skill implementations for the OSAI agent runtime.
 */

// Types
export type {
  FileOperation,
  PathValidationResult,
  CommandValidationResult,
  FileSandboxConfig,
  ShellSecurityConfig,
  SkillsCoreConfig,
} from './types.js';

// Security
export { FileSandbox } from './security/FileSandbox.js';
export { ShellSecurity } from './security/ShellSecurity.js';

// Skills
export {
  createFilesystemSkill,
  createFilesystemSkillDefinition,
} from './skills/FilesystemSkill.js';

export {
  createShellSkill,
  createShellSkillDefinition,
} from './skills/ShellSkill.js';

export {
  createHttpSkill,
  createHttpSkillDefinition,
} from './skills/HttpSkill.js';

export {
  createBrowserSkill,
  createBrowserSkillDefinition,
} from './skills/BrowserSkill.js';

// Registration
export {
  registerBundledSkills,
  registerBundledSkillsWithDefaults,
} from './register.js';
