/**
 * Permission action utilities and helpers.
 *
 * Provides:
 * - Risk level mapping (label, color, background, border classes)
 * - Action category mapping
 * - Parameter formatting
 * - Permission actions factory (approve, deny, batch)
 */

import type { PendingPermission } from '../../stores/permissions';
import type { PermissionResponseMessage } from '../../types';

// --- Risk level types ---

export type RiskLevel = PendingPermission['riskLevel'];

// --- Risk label mapping ---

const RISK_LABELS: Record<RiskLevel, string> = {
  low: 'Auto',
  medium: 'Confirm',
  high: 'Danger',
  critical: 'Critical'
};

// --- Risk color mapping (TailwindCSS classes) ---

const RISK_COLOR_CLASSES: Record<RiskLevel, string> = {
  low: 'text-osai-success',
  medium: 'text-osai-warning',
  high: 'text-osai-error',
  critical: 'text-osai-error'
};

const RISK_BG_CLASSES: Record<RiskLevel, string> = {
  low: 'bg-green-500/10',
  medium: 'bg-yellow-500/10',
  high: 'bg-red-500/10',
  critical: 'bg-red-500/15'
};

const RISK_BORDER_CLASSES: Record<RiskLevel, string> = {
  low: 'border-green-500/30',
  medium: 'border-yellow-500/30',
  high: 'border-red-500/30',
  critical: 'border-red-500/50'
};

// --- Action category mapping ---

type ActionCategory = 'read' | 'write' | 'exec' | 'system' | 'unknown';

const ACTION_CATEGORIES: Record<string, ActionCategory> = {
  read: 'read',
  write: 'write',
  execute: 'exec',
  system: 'system'
};

// --- Exported helper functions ---

export function getRiskLabel(level: RiskLevel): string {
  return RISK_LABELS[level];
}

export function getRiskColorClass(level: RiskLevel): string {
  return RISK_COLOR_CLASSES[level];
}

export function getRiskBgClass(level: RiskLevel): string {
  return RISK_BG_CLASSES[level];
}

export function getRiskBorderClass(level: RiskLevel): string {
  return RISK_BORDER_CLASSES[level];
}

export function getActionCategory(action: string): ActionCategory {
  return ACTION_CATEGORIES[action] ?? 'unknown';
}

/**
 * Format params as pretty-printed JSON string.
 */
export function formatParams(params: Record<string, unknown>): string {
  return JSON.stringify(params, null, 2);
}

/**
 * Truncate a long params string with ellipsis.
 */
export function truncateParams(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength) + '...';
}

/**
 * Build a summary object from a PendingPermission for rendering.
 */
export function getPermissionSummary(request: PendingPermission) {
  return {
    requestId: request.requestId,
    sessionId: request.sessionId,
    toolName: request.toolName,
    action: request.action,
    actionCategory: getActionCategory(request.action),
    description: request.description,
    riskLevel: request.riskLevel,
    riskLabel: getRiskLabel(request.riskLevel),
    riskColorClass: getRiskColorClass(request.riskLevel),
    riskBgClass: getRiskBgClass(request.riskLevel),
    riskBorderClass: getRiskBorderClass(request.riskLevel),
    params: formatParams(request.params),
    timestamp: request.timestamp
  };
}

// --- Store interface for actions ---

interface PermissionsStoreLike {
  subscribe: (listener: (state: { pendingRequests: PendingPermission[] }) => void) => () => void;
  resolvePermissionRequest: (requestId: string, decision: 'approved' | 'denied', reason?: string) => void;
}

interface WsClientLike {
  send: (msg: PermissionResponseMessage) => void;
}

// --- Permission actions factory ---

export function createPermissionActions(wsClient: WsClientLike, store: PermissionsStoreLike) {
  let currentState: { pendingRequests: PendingPermission[] } = { pendingRequests: [] };

  // Subscribe to store to keep current state in sync
  store.subscribe((state) => {
    currentState = state;
  });

  return {
    approve(requestId: string): void {
      const request = currentState.pendingRequests.find((r) => r.requestId === requestId);
      if (!request) return;

      wsClient.send({
        type: 'permission_response',
        requestId,
        decision: 'approved'
      });

      store.resolvePermissionRequest(requestId, 'approved');
    },

    deny(requestId: string, reason?: string): void {
      const request = currentState.pendingRequests.find((r) => r.requestId === requestId);
      if (!request) return;

      wsClient.send({
        type: 'permission_response',
        requestId,
        decision: 'denied',
        reason
      });

      store.resolvePermissionRequest(requestId, 'denied', reason);
    },

    approveAll(): void {
      const requestIds = [...currentState.pendingRequests].map((r) => r.requestId);
      for (const requestId of requestIds) {
        wsClient.send({
          type: 'permission_response',
          requestId,
          decision: 'approved'
        });
        store.resolvePermissionRequest(requestId, 'approved');
      }
    },

    denyAll(reason?: string): void {
      const requestIds = [...currentState.pendingRequests].map((r) => r.requestId);
      for (const requestId of requestIds) {
        wsClient.send({
          type: 'permission_response',
          requestId,
          decision: 'denied',
          reason
        });
        store.resolvePermissionRequest(requestId, 'denied', reason);
      }
    }
  };
}

export type PermissionActions = ReturnType<typeof createPermissionActions>;
