/**
 * T002-UNIT-004: Permission store updates on permission_request
 * Tests for permissions store.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import type { PermissionRequestMessage } from '../types';

const mockPermissionRequest: PermissionRequestMessage = {
  type: 'permission_request',
  requestId: 'req-1',
  sessionId: 's1',
  toolName: 'shell',
  action: 'execute',
  params: { command: 'rm -rf /' },
  riskLevel: 'critical',
  description: 'Remove all files',
  timestamp: '2026-01-01T00:00:00Z'
};

describe('permissionsStore', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('initial state has empty pending requests', async () => {
    const { permissionsStore } = await import('../stores/permissions');
    expect(get(permissionsStore).pendingRequests).toEqual([]);
    expect(get(permissionsStore).history).toEqual([]);
  });

  it('T002-UNIT-004: adds permission request to pending list', async () => {
    const { permissionsStore, addPermissionRequest } = await import('../stores/permissions');
    addPermissionRequest(mockPermissionRequest);
    const pending = get(permissionsStore).pendingRequests;
    expect(pending).toHaveLength(1);
    expect(pending[0]!.requestId).toBe('req-1');
    expect(pending[0]!.toolName).toBe('shell');
    expect(pending[0]!.riskLevel).toBe('critical');
  });

  it('removes request from pending on response', async () => {
    const { permissionsStore, addPermissionRequest, resolvePermissionRequest } = await import('../stores/permissions');
    addPermissionRequest(mockPermissionRequest);
    resolvePermissionRequest('req-1', 'approved');
    expect(get(permissionsStore).pendingRequests).toHaveLength(0);
  });

  it('adds resolved request to history', async () => {
    const { permissionsStore, addPermissionRequest, resolvePermissionRequest } = await import('../stores/permissions');
    addPermissionRequest(mockPermissionRequest);
    resolvePermissionRequest('req-1', 'denied', 'Too dangerous');
    const history = get(permissionsStore).history;
    expect(history).toHaveLength(1);
    expect(history[0]!.decision).toBe('denied');
    expect(history[0]!.reason).toBe('Too dangerous');
  });

  it('returns pending count from derived store', async () => {
    const { pendingPermissionCount, addPermissionRequest } = await import('../stores/permissions');
    expect(get(pendingPermissionCount)).toBe(0);
    addPermissionRequest(mockPermissionRequest);
    expect(get(pendingPermissionCount)).toBe(1);
  });

  it('can reset store', async () => {
    const { permissionsStore, addPermissionRequest, resetPermissionsStore } = await import('../stores/permissions');
    addPermissionRequest(mockPermissionRequest);
    resetPermissionsStore();
    const state = get(permissionsStore);
    expect(state.pendingRequests).toEqual([]);
    expect(state.history).toEqual([]);
  });
});
