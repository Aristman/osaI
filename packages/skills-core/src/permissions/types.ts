/**
 * @osai/skills-core -- Permission Types (DOMAIN-003)
 *
 * PermissionDecision: result of a permission check.
 * RiskLevel: risk classification for tool operations.
 * ToolCategory: operation category for default permission mapping.
 */

/** Risk level classification for tool operations. */
export type RiskLevel = 'low' | 'medium' | 'high';

/** Permission decision type. */
export type DecisionType = 'auto' | 'confirm' | 'deny';

/**
 * Result of a permission check.
 * Contains the decision, associated metadata, and optional reason.
 */
export interface PermissionDecision {
  /** Tool name that was checked */
  toolName: string;
  /** Tool category (read, write, exec, system) */
  category: string;
  /** Permission decision */
  decision: DecisionType;
  /** Risk level assessment */
  riskLevel: RiskLevel;
  /** Optional human-readable reason for the decision */
  reason?: string;
}

/**
 * Operation category for default permission mapping.
 */
export type ToolCategory = 'read' | 'write' | 'exec' | 'system';

/**
 * Default category-based permission mapping.
 * - read -> auto (low risk)
 * - write -> confirm (medium risk)
 * - exec -> confirm (high risk)
 * - system -> auto (low risk)
 */
export const CATEGORY_DEFAULTS: Readonly<Record<ToolCategory, { decision: DecisionType; riskLevel: RiskLevel }>> = {
  read: { decision: 'auto', riskLevel: 'low' },
  write: { decision: 'confirm', riskLevel: 'medium' },
  exec: { decision: 'confirm', riskLevel: 'high' },
  system: { decision: 'auto', riskLevel: 'low' },
} as const;
