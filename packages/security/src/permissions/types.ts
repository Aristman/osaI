/**
 * @osai/security -- Permission Types
 *
 * Type definitions for the permission management system.
 */

export type PermissionCategory = 'read' | 'write' | 'execute' | 'system';
export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';
export type PermissionDecision = 'approved' | 'denied' | 'pending';

export interface PermissionRequest {
  id: string;
  sessionId: string;
  toolName: string;
  action: string;
  params: Record<string, unknown>;
  category: PermissionCategory;
  riskLevel: RiskLevel;
  timestamp: Date;
}

export interface PermissionResponse {
  requestId: string;
  decision: PermissionDecision;
  reason?: string;
}

export interface PermissionManagerConfig {
  autoApprove?: PermissionCategory[];
  requireConfirm?: PermissionCategory[];
}
