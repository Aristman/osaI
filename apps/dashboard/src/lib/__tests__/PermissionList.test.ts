/**
 * T005 Integration test: Permission list actions with WS client mock.
 * Tests the full approve/deny flow: UI action -> store update -> WS send.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PendingPermission, ResolvedPermission } from '../stores/permissions';
import type { PermissionResponseMessage } from '../types';
import { createPermissionActions } from '../components/permissions/permission-actions';

// --- Mock types ---

interface MockWsClient {
  send: ReturnType<typeof vi.fn>;
}

function createMockWsClient(): MockWsClient {
  return { send: vi.fn() };
}

// --- Test fixtures ---

const sampleRequests: PendingPermission[] = [
  {
    requestId: 'req-1',
    sessionId: 's1',
    toolName: 'filesystem',
    action: 'read',
    params: { path: '/tmp/data.json' },
    riskLevel: 'low',
    description: 'Read file /tmp/data.json',
    timestamp: '2026-01-01T00:00:00Z'
  },
  {
    requestId: 'req-2',
    sessionId: 's1',
    toolName: 'shell',
    action: 'execute',
    params: { command: 'npm install lodash' },
    riskLevel: 'medium',
    description: 'Install lodash package',
    timestamp: '2026-01-01T00:01:00Z'
  },
  {
    requestId: 'req-3',
    sessionId: 's1',
    toolName: 'shell',
    action: 'execute',
    params: { command: 'rm -rf /tmp/old' },
    riskLevel: 'high',
    description: 'Remove old temp directory',
    timestamp: '2026-01-01T00:02:00Z'
  }
];

// --- Mock store factory ---

function createMockPermissionsStore(initialPending: PendingPermission[] = []) {
  let state = {
    pendingRequests: [...initialPending],
    history: [] as ResolvedPermission[]
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

describe('Permission List Integration', () => {
  let wsClient: MockWsClient;
  let store: ReturnType<typeof createMockPermissionsStore>;
  let actions: ReturnType<typeof createPermissionActions>;

  beforeEach(() => {
    vi.clearAllMocks();
    wsClient = createMockWsClient();
    store = createMockPermissionsStore([...sampleRequests]);
    actions = createPermissionActions(wsClient as unknown as { send: (msg: PermissionResponseMessage) => void }, store);
  });

  describe('T005 Integration: WS response mock', () => {
    it('approving a request sends correct WS message and updates store', () => {
      actions.approve('req-1');

      // Verify WS message
      expect(wsClient.send).toHaveBeenCalledOnce();
      const sentMsg = wsClient.send.mock.calls[0]![0] as PermissionResponseMessage;
      expect(sentMsg).toEqual({
        type: 'permission_response',
        requestId: 'req-1',
        decision: 'approved'
      });

      // Verify store updated
      expect(store.getState().pendingRequests).toHaveLength(2);
      expect(store.getState().history).toHaveLength(1);
      expect(store.getState().history[0]!.decision).toBe('approved');
    });

    it('denying a request sends correct WS message with reason', () => {
      actions.deny('req-2', 'Not needed');

      // Verify WS message
      expect(wsClient.send).toHaveBeenCalledOnce();
      const sentMsg = wsClient.send.mock.calls[0]![0] as PermissionResponseMessage;
      expect(sentMsg).toEqual({
        type: 'permission_response',
        requestId: 'req-2',
        decision: 'denied',
        reason: 'Not needed'
      });

      // Verify store updated
      expect(store.getState().pendingRequests).toHaveLength(2);
      expect(store.getState().history).toHaveLength(1);
      expect(store.getState().history[0]!.decision).toBe('denied');
    });

    it('batch approve sends messages for all pending requests in order', () => {
      actions.approveAll();

      expect(wsClient.send).toHaveBeenCalledTimes(3);
      const calls = wsClient.send.mock.calls as [PermissionResponseMessage][];

      // Verify all requests were approved in order
      expect(calls[0]![0].requestId).toBe('req-1');
      expect(calls[0]![0].decision).toBe('approved');
      expect(calls[1]![0].requestId).toBe('req-2');
      expect(calls[1]![0].decision).toBe('approved');
      expect(calls[2]![0].requestId).toBe('req-3');
      expect(calls[2]![0].decision).toBe('approved');

      // Store should be empty
      expect(store.getState().pendingRequests).toHaveLength(0);
      expect(store.getState().history).toHaveLength(3);
    });

    it('batch deny sends messages for all pending requests', () => {
      actions.denyAll('All denied');

      expect(wsClient.send).toHaveBeenCalledTimes(3);
      const calls = wsClient.send.mock.calls as [PermissionResponseMessage][];

      expect(calls[0]![0].decision).toBe('denied');
      expect(calls[0]![0].reason).toBe('All denied');
      expect(calls[1]![0].decision).toBe('denied');
      expect(calls[2]![0].decision).toBe('denied');

      expect(store.getState().pendingRequests).toHaveLength(0);
      expect(store.getState().history).toHaveLength(3);
    });

    it('sequential approve/deny maintains correct store state', () => {
      actions.approve('req-1');
      expect(store.getState().pendingRequests).toHaveLength(2);
      expect(store.getState().history).toHaveLength(1);

      actions.deny('req-3', 'Too dangerous');
      expect(store.getState().pendingRequests).toHaveLength(1);
      expect(store.getState().history).toHaveLength(2);

      // Only req-2 should remain pending
      expect(store.getState().pendingRequests[0]!.requestId).toBe('req-2');
    });
  });

  describe('Queue handling', () => {
    it('handles multiple requests correctly', () => {
      expect(store.getState().pendingRequests).toHaveLength(3);

      // Approve first, deny last
      actions.approve('req-1');
      actions.deny('req-3', 'Rejected');

      expect(store.getState().pendingRequests).toHaveLength(1);
      expect(store.getState().pendingRequests[0]!.requestId).toBe('req-2');
      expect(store.getState().history).toHaveLength(2);
    });

    it('auto-remove after response: approved request removed from pending', () => {
      expect(store.getState().pendingRequests.map((r) => r.requestId)).toContain('req-1');

      actions.approve('req-1');

      expect(store.getState().pendingRequests.map((r) => r.requestId)).not.toContain('req-1');
    });

    it('auto-remove after response: denied request removed from pending', () => {
      expect(store.getState().pendingRequests.map((r) => r.requestId)).toContain('req-2');

      actions.deny('req-2');

      expect(store.getState().pendingRequests.map((r) => r.requestId)).not.toContain('req-2');
    });
  });
});
