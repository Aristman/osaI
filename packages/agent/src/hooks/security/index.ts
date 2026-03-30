/**
 * @osai/agent -- Security Hooks barrel export (T-008)
 *
 * Exports all security-related hooks for the Agent Runtime:
 *   - BeforeToolCallSecurity: sandbox + permission check (Layer 3/4/5)
 *   - OnFileAccessAudit: file access audit (Layer 7)
 *   - AfterToolCallAudit: shell execution audit (Layer 7)
 */

export { createBeforeToolCallSecurity } from './BeforeToolCallSecurity.js';
export type { BeforeToolCallSecurityConfig, AuditServicePort } from './BeforeToolCallSecurity.js';

export { createOnFileAccessAudit } from './OnFileAccessAudit.js';
export type { OnFileAccessAuditConfig } from './OnFileAccessAudit.js';

export { createAfterToolCallAudit } from './AfterToolCallAudit.js';
export type { AfterToolCallAuditConfig } from './AfterToolCallAudit.js';
