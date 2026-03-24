/**
 * @osai/agent -- Skill-related error classes
 */

export class SkillParseError extends Error {
  constructor(message: string, public line?: number) {
    super(message);
    this.name = 'SkillParseError';
  }
}

export class SkillNotFoundError extends Error {
  constructor(skillName: string) {
    super(`Skill '${skillName}' not found`);
    this.name = 'SkillNotFoundError';
  }
}

export class ToolNotFoundError extends Error {
  constructor(toolName: string) {
    super(`Tool '${toolName}' not found in any registered skill`);
    this.name = 'ToolNotFoundError';
  }
}
