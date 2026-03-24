/**
 * @osai/agent -- SkillRegistry
 *
 * Manages registration, lookup, and namespacing of skills and their tools.
 */

import type { SkillDefinition, ToolSchema, ToolExecutor } from '../types.js';

export class SkillRegistry {
  private readonly skills = new Map<string, SkillDefinition>();
  private readonly executors = new Map<string, Record<string, ToolExecutor>>();

  /**
   * Register a skill definition with optional tool executors.
   *
   * @param definition - The skill definition to register
   * @param executor - Map of tool name to ToolExecutor
   */
  register(
    definition: SkillDefinition,
    executor?: Record<string, ToolExecutor>,
  ): void {
    this.skills.set(definition.name, definition);
    if (executor) {
      this.executors.set(definition.name, executor);
    }
  }

  /**
   * Unregister a skill by name.
   *
   * @param name - The skill name to unregister
   * @returns true if the skill was found and removed, false otherwise
   */
  unregister(name: string): boolean {
    const removed = this.skills.delete(name);
    if (removed) {
      this.executors.delete(name);
    }
    return removed;
  }

  /**
   * Get a registered skill definition by name.
   *
   * @param name - The skill name
   * @returns The SkillDefinition or undefined if not found
   */
  getSkill(name: string): SkillDefinition | undefined {
    return this.skills.get(name);
  }

  /**
   * Get all tool schemas from all registered skills.
   * Tool names are namespaced as "skill_name.tool_name".
   *
   * @returns Array of ToolSchema from all registered skills
   */
  getToolSchemas(): ToolSchema[] {
    const schemas: ToolSchema[] = [];

    for (const definition of this.skills.values()) {
      for (const tool of definition.tools) {
        schemas.push({
          name: `${definition.name}.${tool.name}`,
          description: tool.description,
          category: tool.category,
          parameters: tool.parameters,
        });
      }
    }

    return schemas;
  }

  /**
   * Get the ToolExecutor for a specific namespaced tool.
   *
   * @param toolName - Namespaced tool name (e.g., "filesystem.read_file")
   * @returns The ToolExecutor or undefined if not registered
   */
  getToolExecutor(toolName: string): ToolExecutor | undefined {
    const dotIndex = toolName.indexOf('.');
    if (dotIndex === -1) return undefined;

    const skillName = toolName.slice(0, dotIndex);
    const localToolName = toolName.slice(dotIndex + 1);

    const skillExecutors = this.executors.get(skillName);
    if (!skillExecutors) return undefined;

    return skillExecutors[localToolName];
  }

  /**
   * List all registered skill definitions.
   *
   * @returns Array of all registered SkillDefinition objects
   */
  listSkills(): SkillDefinition[] {
    return Array.from(this.skills.values());
  }
}
