/**
 * T005-UNIT-002 / T005-UNIT-003: Permission response actions
 * Tests for approve/deny actions integration with WS client and permission store.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PendingPermission, ResolvedPermission } from '../stores/permissions';
import type { PermissionResponseMessage } from '../types';
import { createPermissionActions, getRiskLabel, getActionCategory } from '../components/permissions/permission-actions';

// --- Mock types ---

interface MockWsClient {
  send: ReturnType<typeof vi.fn>;
}

function createMockWsClient(): MockWsClient {
  return { send: vi.fn() };
}

// --- Test fixtures ---

const mockLowRiskRequest: PendingPermission = {
  requestId: 'req-low-1',
  sessionId: 's1',
  toolName: 'filesystem',
  action: 'read',
  params: { path: '/tmp/data.json' },
  riskLevel: 'low',
  description: 'Read file /tmp/data.json',
  timestamp: '2026-01-01T00:00:00Z'
};

const mockMediumRiskRequest: PendingPermission = {
  requestId: 'req-med-1',
  sessionId: 's1',
  toolName: 'filesystem',
  action: 'write',
  params: { path: '/tmp/output.txt', content: 'hello' },
  riskLevel: 'medium',
  description: 'Write file /tmp/output.txt',
  timestamp: '2026-01-01T00:01:00Z'
};

// --- Mock store factory ---

function createMockPermissionsStore(
  initialPending: PendingPermission[] = [],
  initialHistory: ResolvedPermission[] = []
) {
  let state = {
    pendingRequests: [...initialPending],
    history: [...initialHistory]
  };
  const listeners = new Set<(s: typeof state) => void>();

  return {
    subscribe: (listener: (s: typeof state) => void) => {
      listeners.add(listener);
      listener(state);
      return () => { listeners.delete(listener); };
    },
    getState: () => state,
    resolvePermissionRequest(requestId: string, decision: 'approved' | 'denied', reason?: string) {
      const request = state.pendingRequests.find((r) => r.requestId === requestId);
      if (!request) return;
      const resolved: ResolvedPermission = {
        ...request,
        decision,
        reason,
        resolvedAt: new Date().toISOString()
      };
      state = {
        pendingRequests: state.pendingRequests.filter((r) => r.requestId !== requestId),
        history: [resolved, ...state.history]
      };
      listeners.forEach((l) => l(state));
    }
  };
}

// --- Tests ---

describe('createPermissionActions', () => {
  let wsClient: MockWsClient;
  let store: ReturnType<typeof createMockPermissionsStore>;
  let actions: ReturnType<typeof createPermissionActions>;

  beforeEach(() => {
    vi.clearAllMocks();
    wsClient = createMockWsClient();
    store = createMockPermissionsStore([mockLowRiskRequest, mockMediumRiskRequest]);
    actions = createPermissionActions(wsClient as unknown as { send: (msg: PermissionResponseMessage) => void }, store);
  });

  it('T005-UNIT-002: approve sends permission_response with decision="approved"', () => {
    actions.approve('req-low-1');

    expect(wsClient.send).toHaveBeenCalledOnce();
    const sentMsg = wsClient.send.mock.calls[0]![0] as PermissionResponseMessage;
    expect(sentMsg.type).toBe('permission_response');
    expect(sentMsg.requestId).toBe('req-low-1');
    expect(sentMsg.decision).toBe('approved');
  });

  it('T005-UNIT-002: approve resolves permission in store', () => {
    actions.approve('req-low-1');

    expect(store.getState().pendingRequests).toHaveLength(1);
    expect(store.getState().history).toHaveLength(1);
    expect(store.getState().history[0]!.requestId).toBe('req-low-1');
    expect(store.getState().history[0]!.decision).toBe('approved');
  });

  it('T005-UNIT-003: deny sends permission_response with decision="denied"', () => {
    actions.deny('req-med-1', 'User rejected');

    expect(wsClient.send).toHaveBeenCalledOnce();
    const sentMsg = wsClient.send.mock.calls[0]![0] as PermissionResponseMessage;
    expect(sentMsg.type).toBe('permission_response');
    expect(sentMsg.requestId).toBe('req-med-1');
    expect(sentMsg.decision).toBe('denied');
    expect(sentMsg.reason).toBe('User rejected');
  });

  it('T005-UNIT-003: deny resolves permission in store', () => {
    actions.deny('req-med-1', 'User rejected');

    expect(store.getState().pendingRequests).toHaveLength(1);
    expect(store.getState().history).toHaveLength(1);
    expect(store.getState().history[0]!.decision).toBe('denied');
    expect(store.getState().history[0]!.reason).toBe('User rejected');
  });

  it('approveAll sends permission_response for all pending requests', () => {
    actions.approveAll();

    expect(wsClient.send).toHaveBeenCalledTimes(2);
    const calls = wsClient.send.mock.calls as [PermissionResponseMessage][];
    expect(calls[0]![0].decision).toBe('approved');
    expect(calls[1]![0].decision).toBe('approved');
    expect(store.getState().pendingRequests).toHaveLength(0);
    expect(store.getState().history).toHaveLength(2);
  });

  it('denyAll sends permission_response for all pending requests', () => {
    actions.denyAll('Batch denied');

    expect(wsClient.send).toHaveBeenCalledTimes(2);
    const calls = wsClient.send.mock.calls as [PermissionResponseMessage][];
    expect(calls[0]![0].decision).toBe('denied');
    expect(calls[1]![0].decision).toBe('denied');
    expect(store.getState().pendingRequests).toHaveLength(0);
    expect(store.getState().history).toHaveLength(2);
  });

  it('does nothing when approving non-existent request', () => {
    actions.approve('non-existent');
    expect(wsClient.send).not.toHaveBeenCalled();
    expect(store.getState().pendingRequests).toHaveLength(2);
  });

  it('does nothing when denying non-existent request', () => {
    actions.deny('non-existent');
    expect(wsClient.send).not.toHaveBeenCalled();
    expect(store.getState().pendingRequests).toHaveLength(2);
  });

  it('handles empty pending list for approveAll', () => {
    const emptyStore = createMockPermissionsStore();
    const emptyActions = createPermissionActions(wsClient as unknown as { send: (msg: PermissionResponseMessage) => void }, emptyStore);
    emptyActions.approveAll();
    expect(wsClient.send).not.toHaveBeenCalled();
  });

  it('handles empty pending list for denyAll', () => {
    const emptyStore = createMockPermissionsStore();
    const emptyActions = createPermissionActions(wsClient as unknown as { send: (msg: PermissionResponseMessage) => void }, emptyStore);
    emptyActions.denyAll();
    expect(wsClient.send).not.toHaveBeenCalled();
  });
});

describe('risk level helpers', () => {
  it('maps risk levels to correct label', () => {
    expect(getRiskLabel('low')).toBe('Auto');
    expect(getRiskLabel('medium')).toBe('Confirm');
    expect(getRiskLabel('high')).toBe('Danger');
    expect(getRiskLabel('critical')).toBe('Critical');
  });

  it('maps risk levels to correct action category', () => {
    expect(getActionCategory('read')).toBe('read');
    expect(getActionCategory('write')).toBe('write');
    expect(getActionCategory('execute')).toBe('exec');
    expect(getActionCategory('system')).toBe('system');
  });
});
