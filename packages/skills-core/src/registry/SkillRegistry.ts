/**
 * @osai/skills-core -- SkillRegistry (DOMAIN-003)
 *
 * Central registry for managing skills, their tools,
 * and tool execution dispatch.
 */

import type {
  SkillDefinition,
  ToolDefinition,
  ToolDefinitionWithHandler,
  ToolResult,
} from '../types.js';

// Minimal logger interface for internal use (avoids hard pino dependency)
interface MinimalLogger {
  info(obj: Record<string, unknown>, msg: string): void;
  debug(obj: Record<string, unknown>, msg: string): void;
  warn(obj: Record<string, unknown>, msg: string): void;
  error(obj: Record<string, unknown>, msg: string): void;
}

/**
 * SkillRegistry manages skill registration, tool aggregation,
 * and tool execution dispatch.
 *
 * Responsibilities:
 * - Register/unregister skills
 * - Aggregate tool definitions for LLM function calling
 * - Dispatch tool execution to registered handlers
 * - Enable/disable skill availability
 */
export class SkillRegistry {
  private readonly skills = new Map<string, SkillDefinition>();
  private readonly logger: MinimalLogger;

  constructor(logger?: MinimalLogger) {
    this.logger = logger ?? this.createDefaultLogger();
  }

  /**
   * Register a skill in the registry.
   * @throws Error if a skill with the same name is already registered.
   */
  register(skill: SkillDefinition): void {
    if (this.skills.has(skill.name)) {
      throw new Error(`Skill '${skill.name}' is already registered`);
    }

    this.skills.set(skill.name, skill);
    this.logger.info(
      { skill: skill.name, version: skill.version, tools: skill.tools.length },
      'Skill registered',
    );
  }

  /**
   * Unregister a skill from the registry.
   * Silently ignores if the skill does not exist.
   */
  unregister(skillName: string): void {
    const skill = this.skills.get(skillName);
    if (!skill) {
      this.logger.warn({ skill: skillName }, 'Attempted to unregister non-existent skill');
      return;
    }

    this.skills.delete(skillName);
    this.logger.info({ skill: skillName }, 'Skill unregistered');
  }

  /**
   * Get all tool definitions from enabled skills.
   * Returns tools in LLM function calling format (without handlers).
   */
  getTools(): ToolDefinition[] {
    const tools: ToolDefinition[] = [];

    for (const skill of this.skills.values()) {
      if (!skill.enabled) continue;

      for (const tool of skill.tools) {
        tools.push({
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters,
        });
      }
    }

    return tools;
  }

  /**
   * Get a specific tool definition by name (from enabled skills only).
   * Returns undefined if not found.
   */
  getTool(name: string): ToolDefinition | undefined {
    for (const skill of this.skills.values()) {
      if (!skill.enabled) continue;

      const tool = skill.tools.find((t) => t.name === name);
      if (tool) {
        return {
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters,
        };
      }
    }

    return undefined;
  }

  /**
   * Execute a tool by name with the given parameters.
   * Dispatches to the first matching enabled tool's handler.
   *
   * @throws Error if the tool is not found.
   */
  async execute(toolName: string, params: Record<string, unknown>): Promise<ToolResult> {
    const toolWithHandler = this.findToolWithHandler(toolName);

    if (!toolWithHandler) {
      throw new Error(`Tool '${toolName}' is not registered or not enabled`);
    }

    const { tool, skill } = toolWithHandler;

    this.logger.debug(
      { tool: toolName, skill: skill.name },
      'Executing tool',
    );

    try {
      const data = await tool.handler(params);
      return { success: true, data };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(
        { tool: toolName, skill: skill.name, error: message },
        'Tool execution failed',
      );
      return { success: false, error: message };
    }
  }

  /**
   * Enable a skill, making its tools available.
   */
  enable(skillName: string): void {
    const skill = this.skills.get(skillName);
    if (!skill) {
      this.logger.warn({ skill: skillName }, 'Attempted to enable non-existent skill');
      return;
    }

    skill.enabled = true;
    this.logger.info({ skill: skillName }, 'Skill enabled');
  }

  /**
   * Disable a skill, hiding its tools from getTools().
   */
  disable(skillName: string): void {
    const skill = this.skills.get(skillName);
    if (!skill) {
      this.logger.warn({ skill: skillName }, 'Attempted to disable non-existent skill');
      return;
    }

    skill.enabled = false;
    this.logger.info({ skill: skillName }, 'Skill disabled');
  }

  /**
   * Check whether a skill is currently enabled.
   */
  isEnabled(skillName: string): boolean {
    const skill = this.skills.get(skillName);
    return skill?.enabled ?? false;
  }

  /**
   * Get a skill definition by name.
   * Returns undefined if not found.
   */
  getSkill(name: string): SkillDefinition | undefined {
    return this.skills.get(name);
  }

  /**
   * List all registered skills.
   */
  listSkills(): SkillDefinition[] {
    return Array.from(this.skills.values());
  }

  /**
   * Find a tool with its handler by name (from enabled skills).
   * Returns the first match.
   */
  private findToolWithHandler(
    toolName: string,
  ): { tool: ToolDefinitionWithHandler; skill: SkillDefinition } | undefined {
    for (const skill of this.skills.values()) {
      if (!skill.enabled) continue;

      const tool = skill.tools.find((t) => t.name === toolName);
      if (tool) {
        return { tool, skill };
      }
    }

    return undefined;
  }

  /**
   * Create a minimal no-op logger.
   * In production, a real pino logger should be injected.
   */
  private createDefaultLogger(): MinimalLogger {
    return {
      info: () => {},
      debug: () => {},
      warn: () => {},
      error: () => {},
    };
  }
}
