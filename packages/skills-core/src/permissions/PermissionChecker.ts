/**
 * @osai/skills-core -- Permission Checker (DOMAIN-003)
 *
 * Category-based permission checker.
 * Determines permission decisions based on tool category defaults
 * and custom overrides from PermissionPolicy.
 */

import type { PermissionPolicy, PermissionLevel } from '../types.js';
import type { PermissionDecision, DecisionType, RiskLevel, ToolCategory } from './types.js';
import { CATEGORY_DEFAULTS } from './types.js';

/**
 * Resolves a ToolCategory from a tool name based on naming conventions.
 *
 * Convention:
 * - read_* -> read
 * - list_* -> read
 * - get_* -> read
 * - search_* -> read
 * - write_* -> write
 * - create_* -> write
 * - delete_* -> write
 * - move_* -> write
 * - exec_* -> exec
 * - shell_* -> exec
 * - system_* -> system
 *
 * @param toolName - The tool name to categorize
 * @returns The resolved ToolCategory
 */
function resolveCategory(toolName: string): ToolCategory {
  const name = toolName.toLowerCase();

  if (name.startsWith('read_') || name.startsWith('list_') || name.startsWith('get_') || name.startsWith('search_')) {
    return 'read';
  }
  if (name.startsWith('write_') || name.startsWith('create_') || name.startsWith('delete_') || name.startsWith('move_')) {
    return 'write';
  }
  if (name === 'exec' || name.startsWith('exec_') || name.startsWith('exec_sandbox') || name.startsWith('shell_')) {
    return 'exec';
  }
  if (name.startsWith('system_')) {
    return 'system';
  }

  // Default to 'read' for unrecognized tools (safest default)
  return 'read';
}

/**
 * Maps PermissionLevel to RiskLevel.
 */
function levelToRisk(level: PermissionLevel, category: ToolCategory): RiskLevel {
  switch (level) {
    case 'deny':
      return category === 'exec' ? 'high' : 'medium';
    case 'confirm':
      return category === 'exec' ? 'high' : 'medium';
    case 'auto':
      return 'low';
  }
}

/**
 * Generates a human-readable reason for the permission decision.
 */
function buildReason(
  toolName: string,
  category: ToolCategory,
  decision: DecisionType,
  overridden: boolean,
): string {
  if (overridden) {
    return `Permission for '${toolName}' overridden by policy to '${decision}'`;
  }
  return `Category '${category}' defaults to '${decision}' for '${toolName}'`;
}

/**
 * Permission checker that evaluates tool permissions based on
 * category defaults and custom policy overrides.
 *
 * Category-based logic:
 * - read -> auto (riskLevel: low)
 * - write -> confirm (riskLevel: medium)
 * - exec -> confirm (riskLevel: high)
 * - system -> auto (riskLevel: low)
 *
 * Custom overrides: If a specific tool name exists in the policy,
 * it overrides the category default.
 */
export class PermissionChecker {
  /**
   * Check permission for a tool against a policy.
   *
   * @param toolName - The tool name to check
   * @param policy - Permission policy mapping (tool name -> level)
   * @returns PermissionDecision with decision, risk level, and reason
   */
  check(toolName: string, policy: PermissionPolicy): PermissionDecision {
    const category = resolveCategory(toolName);
    const policyLevel = policy[toolName];
    const overridden = policyLevel !== undefined;

    const decision: DecisionType = overridden
      ? policyLevel
      : CATEGORY_DEFAULTS[category].decision;

    const riskLevel: RiskLevel = overridden
      ? levelToRisk(policyLevel, category)
      : CATEGORY_DEFAULTS[category].riskLevel;

    return {
      toolName,
      category,
      decision,
      riskLevel,
      reason: buildReason(toolName, category, decision, overridden),
    };
  }
}
