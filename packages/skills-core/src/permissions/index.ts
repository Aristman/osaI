/**
 * @osai/skills-core -- Permission Module (DOMAIN-003)
 *
 * Category-based permission model.
 */

export { PermissionChecker } from './PermissionChecker.js';
export { CATEGORY_DEFAULTS } from './types.js';

export type {
  PermissionDecision,
  DecisionType,
  RiskLevel,
  ToolCategory,
} from './types.js';
