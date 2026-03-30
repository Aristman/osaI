/**
 * @osai/skills-core -- SkillMdValidator (DOMAIN-003, T-002)
 *
 * Validates parsed SKILL.md data:
 * - Required fields (name, version, description)
 * - Valid JSON Schema for tool parameters
 * - Correct permission levels
 * - Valid skill category
 */

import type {
  SkillDefinition,
  ToolParameters,
  PermissionLevel,
  SkillCategory,
  ToolHandler,
} from '../types.js';

/** Valid permission levels */
const VALID_PERMISSION_LEVELS: ReadonlySet<string> = new Set<string>([
  'auto',
  'confirm',
]);

/** Valid skill categories */
const VALID_CATEGORIES: ReadonlySet<string> = new Set<string>([
  'bundled',
  'osaI',
  'workspace',
  'managed',
]);

/**
 * Parsed but not yet validated SKILL.md data.
 * Raw representation before conversion to SkillDefinition.
 */
export interface ParsedSkillMd {
  name?: string;
  version?: string;
  description?: string;
  category?: string;
  permissions?: Record<string, string>;
  tools: Array<{
    name: string;
    description: string;
    parameters: unknown;
  }>;
}

/**
 * SkillMdValidator validates raw parsed SKILL.md data
 * and converts it to a properly typed SkillDefinition.
 */
export class SkillMdValidator {
  /**
   * Validate and convert parsed SKILL.md data to SkillDefinition.
   * @param parsed - Raw parsed SKILL.md data
   * @param source - Optional source file path for error messages
   * @throws Error on validation failure with descriptive message
   */
  validate(parsed: ParsedSkillMd, source?: string): SkillDefinition {
    const ctx = source ? ` in ${source}` : '';

    // --- Validate required fields ---

    if (!parsed.name || parsed.name.trim().length === 0) {
      throw new Error(`Field 'name' is required${ctx}`);
    }

    if (!parsed.description || parsed.description.trim().length === 0) {
      throw new Error(`Field 'description' is required${ctx}`);
    }

    // --- Validate version (default to 0.0.0) ---

    const version = parsed.version?.trim() ?? '0.0.0';
    if (!isValidSemver(version)) {
      throw new Error(
        `Field 'version' must be a valid semver string (e.g. 1.0.0), got '${version}'${ctx}`,
      );
    }

    // --- Validate category ---

    const rawCategory = parsed.category?.trim() ?? 'workspace';
    if (!VALID_CATEGORIES.has(rawCategory)) {
      throw new Error(
        `Invalid category '${rawCategory}'. Must be one of: ${[...VALID_CATEGORIES].join(', ')}${ctx}`,
      );
    }
    const category = rawCategory as SkillCategory;

    // --- Validate permissions ---

    const permissions: Record<string, PermissionLevel> = {};
    if (parsed.permissions) {
      for (const [toolName, level] of Object.entries(parsed.permissions)) {
        if (!VALID_PERMISSION_LEVELS.has(level)) {
          throw new Error(
            `Invalid permission level '${level}' for tool '${toolName}'. Must be 'auto' or 'confirm'${ctx}`,
          );
        }
        permissions[toolName] = level as PermissionLevel;
      }
    }

    // --- Validate tools ---

    const tools: SkillDefinition['tools'] = [];

    for (const tool of parsed.tools) {
      this.validateToolParameters(tool.parameters, tool.name, ctx);
      tools.push({
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters as ToolParameters,
        handler: createPlaceholderHandler(tool.name),
      });
    }

    // --- Build SkillDefinition ---

    return {
      name: parsed.name.trim(),
      version,
      description: parsed.description.trim(),
      category,
      tools,
      enabled: true,
      permissions,
    };
  }

  /**
   * Validate tool parameters JSON Schema.
   * @throws Error if parameters are not a valid JSON Schema object.
   */
  private validateToolParameters(
    params: unknown,
    toolName: string,
    context: string,
  ): void {
    if (params === undefined || params === null) {
      throw new Error(
        `Tool '${toolName}' is missing parameters definition${context}`,
      );
    }

    if (typeof params !== 'object' || Array.isArray(params)) {
      throw new Error(
        `Tool '${toolName}' parameters must be a JSON object${context}`,
      );
    }

    const paramsObj = params as Record<string, unknown>;

    if (paramsObj.type !== 'object') {
      throw new Error(
        `Tool '${toolName}' parameters.type must be 'object', got '${String(paramsObj.type)}'${context}`,
      );
    }

    // Validate that properties is an object if present
    if ('properties' in paramsObj && paramsObj.properties !== undefined) {
      if (
        typeof paramsObj.properties !== 'object' ||
        paramsObj.properties === null ||
        Array.isArray(paramsObj.properties)
      ) {
        throw new Error(
          `Tool '${toolName}' parameters.properties must be an object${context}`,
        );
      }
    }

    // Validate that required is an array if present
    if ('required' in paramsObj && paramsObj.required !== undefined) {
      if (!Array.isArray(paramsObj.required)) {
        throw new Error(
          `Tool '${toolName}' parameters.required must be an array${context}`,
        );
      }

      for (const req of paramsObj.required) {
        if (typeof req !== 'string') {
          throw new Error(
            `Tool '${toolName}' parameters.required must contain only strings${context}`,
          );
        }
      }
    }
  }
}

/**
 * Simple semver validation.
 * Accepts format: MAJOR.MINOR.PATCH (optionally with pre-release or build metadata).
 */
function isValidSemver(version: string): boolean {
  // Basic semver regex: X.Y.Z with optional pre-release and build metadata
  const semverRegex = /^\d+\.\d+\.\d+(-[\w.]+)?(\+[\w.]+)?$/;
  return semverRegex.test(version);
}

/**
 * Create a placeholder handler that throws "not implemented".
 * Parsed skills have handlers set later during registration.
 */
function createPlaceholderHandler(toolName: string): ToolHandler {
  return async () => {
    throw new Error(`Tool '${toolName}' handler not implemented (parsed from SKILL.md)`);
  };
}
