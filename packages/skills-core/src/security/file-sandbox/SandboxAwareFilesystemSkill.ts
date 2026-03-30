/**
 * @osai/skills-core -- SandboxAwareFilesystemSkill (DOMAIN-003, T-002)
 *
 * Wrapper for FilesystemSkill that adds FileSandbox validation
 * to all 7 tools before execution.
 *
 * Every tool handler is wrapped so that:
 * 1. Path parameters are extracted from the tool input
 * 2. FileSandbox.validate() is called for each path
 * 3. If sandbox violation detected: returns ToolResult { success: false, error: "sandbox violation: ..." }
 * 4. If sandbox allows: delegates to the original FilesystemSkill handler
 * 5. If original handler throws: catches and returns ToolResult { success: false, error: ... }
 *
 * This ensures that all file operations are sandbox-checked regardless
 * of how the skill is invoked (directly or via SkillRegistry).
 */

import type {
  SkillDefinition,
  ToolDefinitionWithHandler,
  ToolHandler,
  ToolResult,
} from '../../types.js';
import { createFilesystemSkill } from '../../skills/filesystem/FilesystemSkill.js';
import type { FileSandbox } from './FileSandbox.js';

// ---------------------------------------------------------------------------
// Path extraction
// ---------------------------------------------------------------------------

/**
 * Mapping of tool name to the parameter key(s) that contain file paths
 * to be validated against the sandbox.
 */
const TOOL_PATH_PARAMS: Readonly<Record<string, readonly string[]>> = Object.freeze({
  read_file: ['path'],
  write_file: ['path'],
  list_dir: ['path'],
  search_files: ['directory'],
  move_file: ['source', 'destination'],
  delete_file: ['path'],
  get_file_info: ['path'],
});

/**
 * Extract all path values from tool parameters for sandbox validation.
 *
 * @param toolName - Name of the tool being executed
 * @param params - Parameters passed to the tool
 * @returns Array of path strings to validate
 */
function extractPaths(toolName: string, params: Record<string, unknown>): string[] {
  const pathKeys = TOOL_PATH_PARAMS[toolName];
  if (!pathKeys) {
    return [];
  }

  const paths: string[] = [];
  for (const key of pathKeys) {
    const value = params[key];
    if (typeof value === 'string' && value.length > 0) {
      paths.push(value);
    }
  }
  return paths;
}

// ---------------------------------------------------------------------------
// Sandbox validation wrapper
// ---------------------------------------------------------------------------

/**
 * Create a sandbox-aware wrapper for a tool handler.
 *
 * Validates all path parameters against the sandbox before execution.
 * Returns ToolResult with success=false if any path violates sandbox rules.
 *
 * @param originalHandler - The original tool handler to wrap
 * @param sandbox - The FileSandbox instance for validation
 * @param toolName - Name of the tool (for path extraction and error messages)
 */
function createSandboxAwareHandler(
  originalHandler: ToolHandler,
  sandbox: FileSandbox,
  toolName: string,
): ToolHandler {
  return async (params: Record<string, unknown>): Promise<ToolResult> => {
    // Step 1: Extract paths and validate against sandbox
    const paths = extractPaths(toolName, params);

    for (const filePath of paths) {
      const result = sandbox.validate(filePath);
      if (!result.allowed) {
        return {
          success: false,
          error: `sandbox violation: ${result.error ?? 'path not allowed'}`,
        };
      }
    }

    // Step 2: Sandbox check passed -- delegate to original handler
    try {
      const data = await originalHandler(params);
      return { success: true, data };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Create a sandbox-aware FilesystemSkill.
 *
 * Returns a new SkillDefinition that wraps all 7 FilesystemSkill tool
 * handlers with FileSandbox validation. The original skill definition
 * (metadata, permissions, tool schemas) is preserved unchanged.
 *
 * Usage:
 * ```ts
 * const sandbox = new FileSandbox(FileSandbox.createConfig({
 *   allowedDirs: ['/home/user/workspace'],
 * }));
 * const skill = createSandboxAwareFilesystemSkill(sandbox);
 * // Register with SkillRegistry -- all tools are sandbox-checked
 * ```
 *
 * @param sandbox - Configured FileSandbox instance
 * @returns SkillDefinition with sandbox-aware tool handlers
 */
export function createSandboxAwareFilesystemSkill(sandbox: FileSandbox): SkillDefinition {
  const originalSkill = createFilesystemSkill();

  const wrappedTools: ToolDefinitionWithHandler[] = originalSkill.tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters,
    handler: createSandboxAwareHandler(tool.handler, sandbox, tool.name),
  }));

  return {
    name: originalSkill.name,
    version: originalSkill.version,
    description: originalSkill.description,
    category: originalSkill.category,
    tools: wrappedTools,
    enabled: originalSkill.enabled,
    permissions: originalSkill.permissions,
  };
}
