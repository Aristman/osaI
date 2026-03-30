/**
 * @osai/agent -- Hook System barrel export
 */

export { HookPoint } from './types.js';
export type {
  HookContext,
  HookHandler,
  HookResult,
} from './types.js';
export { HookRegistry } from './HookRegistry.js';

// Security hooks (T-008)
export {
  createBeforeToolCallSecurity,
  createOnFileAccessAudit,
  createAfterToolCallAudit,
} from './security/index.js';

export type {
  BeforeToolCallSecurityConfig,
  OnFileAccessAuditConfig,
  AfterToolCallAuditConfig,
} from './security/index.js';
