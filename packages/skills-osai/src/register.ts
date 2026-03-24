/**
 * @osai/skills-osai -- registerOsaiSkills
 *
 * Convenience function to register all osaI-specific skills
 * (OS Integration, Memory, Knowledge Base) with a SkillRegistry.
 */

import type { SkillRegistry } from '@osai/agent';
import type { OsIntegrationManager } from '@osai/os-integration';
import type { MemoryManager } from '@osai/memory';
import { createOsIntegrationSkill } from './skills/OsIntegrationSkill.js';
import { createMemorySkill } from './skills/MemorySkill.js';
import { createKnowledgeSkill } from './skills/KnowledgeSkill.js';

// ---------------------------------------------------------------------------
// Registration Config
// ---------------------------------------------------------------------------

export interface OsaiSkillsConfig {
  osIntegration?: OsIntegrationManager;
  memoryManager?: MemoryManager;
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

/**
 * Register all osaI-specific skills with the given SkillRegistry.
 *
 * Skills registered:
 * - os-integration (if osIntegrationManager provided)
 * - memory (if memoryManager provided)
 * - knowledge-base (if memoryManager provided, uses LongTermMemory)
 *
 * @param registry - The SkillRegistry instance to register skills with
 * @param config - Configuration with optional manager instances
 */
export function registerOsaiSkills(
  registry: SkillRegistry,
  config?: OsaiSkillsConfig,
): void {
  // OS Integration skill
  if (config?.osIntegration) {
    const { definition, executors } = createOsIntegrationSkill(
      config.osIntegration,
    );
    registry.register(definition, executors);
  }

  // Memory skill
  if (config?.memoryManager) {
    const { definition, executors } = createMemorySkill(
      config.memoryManager,
    );
    registry.register(definition, executors);

    // Knowledge Base skill (uses LongTermMemory from the same MemoryManager)
    const longTerm = config.memoryManager.getLongTerm();
    const { definition: kbDef, executors: kbExec } = createKnowledgeSkill(
      longTerm,
    );
    registry.register(kbDef, kbExec);
  }
}
