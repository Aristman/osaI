/**
 * @osai/security -- Audit Types
 *
 * Type definitions for the audit trail system.
 */

export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

export type AuditCategory = 'permission' | 'tool' | 'config' | 'security';

export type AuditActor = 'user' | 'agent' | 'system';

export interface AuditEntry {
  id: string;
  timestamp: string;
  sessionId: string;
  action: string;
  actor: AuditActor;
  category: AuditCategory;
  level: RiskLevel;
  details: Record<string, unknown>;
  immutable: true;
}

export interface AuditFilter {
  sessionId?: string;
  category?: AuditCategory;
  level?: RiskLevel;
  from?: string;
  to?: string;
  limit?: number;
}

export interface AuditStats {
  total: number;
  byCategory: Record<string, number>;
  byLevel: Record<string, number>;
  last24h: number;
}
