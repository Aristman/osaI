/**
 * @osai/security -- Security Foundation
 *
 * Provides permission management and immutable audit trail
 * for the OSAI agent runtime.
 */

// Permissions
export { PermissionManager } from './permissions/PermissionManager.js';
export { generateId } from './permissions/PermissionManager.js';
export type {
  PermissionCategory,
  PermissionDecision,
  PermissionRequest,
  PermissionResponse,
  PermissionManagerConfig,
} from './permissions/types.js';

// Audit Trail
export { AuditTrail } from './audit/AuditTrail.js';
export type {
  RiskLevel as AuditRiskLevel,
  AuditCategory,
  AuditActor,
  AuditEntry,
  AuditFilter,
  AuditStats,
} from './audit/types.js';

// Security Hooks
export {
  createPermissionHook,
  createAuditHook,
  createErrorAuditHook,
} from './hooks/SecurityHooks.js';
