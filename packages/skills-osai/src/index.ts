/**
 * @osai/skills-osai -- osaI-specific Skills (DOMAIN-003)
 *
 * osaI skills: Memory, Knowledge Base, Chat Management, OS Integration.
 */

// Memory Skill
export { MemorySkill } from './skills/memory/MemorySkill.js';
export type { MemorySkillOptions } from './skills/memory/MemorySkill.js';

// Knowledge Base Skill
export { KnowledgeBaseSkill } from './skills/knowledge-base/KnowledgeBaseSkill.js';
export type { KnowledgeBaseSkillOptions, KnowledgeBaseService } from './skills/knowledge-base/KnowledgeBaseSkill.js';

// Chat Management Skill
export { ChatManagementSkill } from './skills/chat-management/ChatManagementSkill.js';
export type { ChatManagementSkillOptions, ChatGatewayService } from './skills/chat-management/ChatManagementSkill.js';

// OS Integration Skill
export { OsIntegrationSkill } from './skills/os-integration/OsIntegrationSkill.js';
export type { OsIntegrationSkillOptions, OsIntegrationService } from './skills/os-integration/OsIntegrationSkill.js';
