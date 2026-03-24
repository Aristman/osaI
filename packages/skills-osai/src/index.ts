/**
 * @osai/skills-osai -- Barrel export
 *
 * osaI-specific skills for OS integration, memory management,
 * and knowledge base operations.
 */

// Skill Definitions & Factories
export {
  createOsIntegrationSkill,
  createOsIntegrationSkillDefinition,
} from './skills/OsIntegrationSkill.js';

export {
  createMemorySkill,
  createMemorySkillDefinition,
} from './skills/MemorySkill.js';

export {
  createKnowledgeSkill,
  createKnowledgeSkillDefinition,
} from './skills/KnowledgeSkill.js';

// Registration
export {
  registerOsaiSkills,
} from './register.js';
export type { OsaiSkillsConfig } from './register.js';

// Hooks
export {
  createBeforeMemoryQueryHook,
  createAfterMemoryExtractHook,
  createOnFileAccessHook,
  createOnDesktopNotificationHook,
  registerOsaiHooks,
} from './hooks/index.js';
export type { OsaiHookRegistration } from './hooks/index.js';
