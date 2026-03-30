/**
 * @osai/skills-core -- Type Definitions (DOMAIN-003)
 *
 * Core types for the Skills System:
 * SkillDefinition, ToolDefinition, ToolResult,
 * PermissionPolicy, SkillCategory, PermissionLevel.
 */

// --- Permission Types ---

/**
 * Level of permission required to execute a tool.
 * - auto: Automatically approved (read operations, system operations)
 * - confirm: Requires user confirmation (write, exec operations)
 * - deny: Explicitly denied
 */
export type PermissionLevel = 'auto' | 'confirm' | 'deny';

/**
 * Permission policy mapping tool name to required permission level.
 */
export type PermissionPolicy = Record<string, PermissionLevel>;

// --- Skill Category ---

/**
 * Skill origin/category.
 * - bundled: Built-in skills (Filesystem, Shell)
 * - osaI: osaI-specific skills (Memory, KB, Chat, OS)
 * - workspace: User workspace skills (~/.osai/workspace/skills/)
 * - managed: Managed/installed skills (ClawHub)
 */
export type SkillCategory = 'bundled' | 'osaI' | 'workspace' | 'managed';

// --- Tool Definition ---

/**
 * JSON Schema parameters object for LLM function calling.
 * Follows OpenAI function calling format.
 */
export type ToolParameters = {
  type: 'object';
  properties: Record<string, unknown>;
  required?: string[];
  [key: string]: unknown;
};

/**
 * Tool handler function type.
 * Receives parameters from the LLM and returns execution result.
 */
export type ToolHandler = (params: Record<string, unknown>) => Promise<unknown>;

/**
 * Tool definition for LLM function calling.
 * Contains metadata and JSON Schema parameters for tool invocation.
 */
export interface ToolDefinition {
  /** Tool name (unique identifier for LLM function calling) */
  name: string;
  /** Human-readable tool description for the LLM */
  description: string;
  /** JSON Schema object describing tool parameters */
  parameters: ToolParameters;
}

/**
 * Internal tool definition with handler (not exposed to LLM).
 */
export interface ToolDefinitionWithHandler extends ToolDefinition {
  /** Handler function that executes the tool logic */
  handler: ToolHandler;
}

// --- Tool Result ---

/**
 * Result of a tool execution.
 */
export interface ToolResult {
  /** Whether the execution succeeded */
  success: boolean;
  /** Result data on success */
  data?: unknown;
  /** Error message on failure */
  error?: string;
}

// --- Skill Definition ---

/**
 * Complete skill definition.
 * Contains metadata, tools, permissions, and runtime state.
 */
export interface SkillDefinition {
  /** Skill name (unique identifier) */
  name: string;
  /** Skill version (semver) */
  version: string;
  /** Human-readable skill description */
  description: string;
  /** Skill category / origin */
  category: SkillCategory;
  /** Tools provided by this skill (with handlers) */
  tools: ToolDefinitionWithHandler[];
  /** Whether the skill is currently enabled */
  enabled: boolean;
  /** Permission policy mapping tool name to required level */
  permissions: PermissionPolicy;
}
