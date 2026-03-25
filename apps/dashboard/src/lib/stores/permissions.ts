/**
 * Permissions store for pending permission requests.
 */
import { writable, derived } from 'svelte/store';
import type { PermissionRequestMessage } from '../types';

export interface PendingPermission {
  requestId: string;
  sessionId: string;
  toolName: string;
  action: string;
  params: Record<string, unknown>;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  timestamp: string;
}

export interface ResolvedPermission extends PendingPermission {
  decision: 'approved' | 'denied';
  reason?: string;
  resolvedAt: string;
}

export interface PermissionsState {
  pendingRequests: PendingPermission[];
  history: ResolvedPermission[];
}

const initialState: PermissionsState = {
  pendingRequests: [],
  history: []
};

function createPermissionsStore() {
  const { subscribe, set, update } = writable<PermissionsState>({ ...initialState });

  return {
    subscribe,
    set,

    addPermissionRequest(msg: PermissionRequestMessage): void {
      const request: PendingPermission = {
        requestId: msg.requestId,
        sessionId: msg.sessionId,
        toolName: msg.toolName,
        action: msg.action,
        params: msg.params,
        riskLevel: msg.riskLevel,
        description: msg.description,
        timestamp: msg.timestamp
      };
      update((s) => ({
        ...s,
        pendingRequests: [...s.pendingRequests, request]
      }));
    },

    resolvePermissionRequest(requestId: string, decision: 'approved' | 'denied', reason?: string): void {
      update((s) => {
        const request = s.pendingRequests.find((r) => r.requestId === requestId);
        if (!request) return s;

        const resolved: ResolvedPermission = {
          ...request,
          decision,
          reason,
          resolvedAt: new Date().toISOString()
        };

        return {
          pendingRequests: s.pendingRequests.filter((r) => r.requestId !== requestId),
          history: [resolved, ...s.history]
        };
      });
    },

    reset(): void {
      set({ ...initialState });
    }
  };
}

export const permissionsStore = createPermissionsStore();

export const pendingPermissionCount = derived(permissionsStore, ($state) => $state.pendingRequests.length);

export const addPermissionRequest = (msg: PermissionRequestMessage) => permissionsStore.addPermissionRequest(msg);
export const resolvePermissionRequest = (requestId: string, decision: 'approved' | 'denied', reason?: string) =>
  permissionsStore.resolvePermissionRequest(requestId, decision, reason);
export const resetPermissionsStore = () => permissionsStore.reset();
