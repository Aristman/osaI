/**
 * PermissionManager unit tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { PermissionManager } from '../permissions/PermissionManager.js';
import type { PermissionRequest } from '../permissions/types.js';

function makeRequest(overrides: Partial<PermissionRequest> = {}): PermissionRequest {
  return {
    id: 'test-req-1',
    sessionId: 'session-1',
    toolName: 'test_tool',
    action: 'test_action',
    params: {},
    category: 'read',
    riskLevel: 'low',
    timestamp: new Date(),
    ...overrides,
  };
}

describe('PermissionManager', () => {
  let pm: PermissionManager;

  beforeEach(() => {
    pm = new PermissionManager();
  });

  describe('default configuration', () => {
    it('auto-approves read category', () => {
      const request = makeRequest({ category: 'read', riskLevel: 'low' });
      const response = pm.check(request);
      expect(response.decision).toBe('approved');
      expect(response.requestId).toBe('test-req-1');
    });

    it('auto-approves system category', () => {
      const request = makeRequest({ category: 'system', riskLevel: 'low' });
      const response = pm.check(request);
      expect(response.decision).toBe('approved');
    });

    it('requires confirmation for write category', () => {
      const request = makeRequest({ category: 'write', riskLevel: 'medium' });
      const response = pm.check(request);
      expect(response.decision).toBe('pending');
    });

    it('requires confirmation for execute category', () => {
      const request = makeRequest({ category: 'execute', riskLevel: 'medium' });
      const response = pm.check(request);
      expect(response.decision).toBe('pending');
    });

    it('always requires confirmation for critical risk level', () => {
      // Even for auto-approve categories, critical should be pending
      const request = makeRequest({ category: 'read', riskLevel: 'critical' });
      const response = pm.check(request);
      expect(response.decision).toBe('pending');
      expect(response.reason).toContain('Critical risk level');
    });

    it('always requires confirmation for critical risk with write', () => {
      const request = makeRequest({ category: 'write', riskLevel: 'critical' });
      const response = pm.check(request);
      expect(response.decision).toBe('pending');
    });
  });

  describe('custom configuration', () => {
    it('uses custom autoApprove list', () => {
      const customPm = new PermissionManager({
        autoApprove: ['read', 'write', 'execute', 'system'],
      });
      const request = makeRequest({ category: 'write', riskLevel: 'medium' });
      const response = customPm.check(request);
      expect(response.decision).toBe('approved');
    });

    it('uses custom requireConfirm list', () => {
      const customPm = new PermissionManager({
        requireConfirm: ['execute'],
        autoApprove: ['read', 'write', 'system'],
      });
      const request = makeRequest({ category: 'write', riskLevel: 'medium' });
      const response = customPm.check(request);
      expect(response.decision).toBe('approved');
    });

    it('critical overrides custom autoApprove', () => {
      const customPm = new PermissionManager({
        autoApprove: ['read', 'write', 'execute', 'system'],
      });
      const request = makeRequest({ category: 'write', riskLevel: 'critical' });
      const response = customPm.check(request);
      expect(response.decision).toBe('pending');
    });
  });

  describe('pending requests', () => {
    it('tracks pending requests', () => {
      const request = makeRequest({
        id: 'pending-1',
        category: 'write',
        riskLevel: 'medium',
      });
      pm.check(request);
      const pending = pm.getPendingRequests();
      expect(pending).toHaveLength(1);
      expect(pending[0]!.id).toBe('pending-1');
    });

    it('does not track auto-approved requests as pending', () => {
      const request = makeRequest({ category: 'read', riskLevel: 'low' });
      pm.check(request);
      expect(pm.getPendingRequests()).toHaveLength(0);
    });

    it('approve resolves a pending request', () => {
      const request = makeRequest({
        id: 'approve-1',
        category: 'write',
        riskLevel: 'medium',
      });
      pm.check(request);
      expect(pm.getPendingRequests()).toHaveLength(1);

      pm.approve('approve-1');
      expect(pm.getPendingRequests()).toHaveLength(0);
    });

    it('deny resolves a pending request', () => {
      const request = makeRequest({
        id: 'deny-1',
        category: 'execute',
        riskLevel: 'high',
      });
      pm.check(request);
      expect(pm.getPendingRequests()).toHaveLength(1);

      pm.deny('deny-1', 'User rejected');
      expect(pm.getPendingRequests()).toHaveLength(0);
    });

    it('approve non-existent request is a no-op', () => {
      pm.approve('non-existent');
      expect(pm.getPendingRequests()).toHaveLength(0);
    });

    it('deny non-existent request is a no-op', () => {
      pm.deny('non-existent', 'no such request');
      expect(pm.getPendingRequests()).toHaveLength(0);
    });
  });

  describe('history', () => {
    it('records all permission checks', () => {
      pm.check(makeRequest({ id: 'r1', category: 'read' }));
      pm.check(makeRequest({ id: 'r2', category: 'write' }));
      pm.check(makeRequest({ id: 'r3', category: 'execute' }));

      const history = pm.getHistory();
      expect(history).toHaveLength(3);
    });

    it('filters history by sessionId', () => {
      pm.check(makeRequest({ id: 'r1', sessionId: 's1', category: 'read' }));
      pm.check(makeRequest({ id: 'r2', sessionId: 's2', category: 'write' }));
      pm.check(makeRequest({ id: 'r3', sessionId: 's1', category: 'read' }));

      const historyS1 = pm.getHistory('s1');
      expect(historyS1).toHaveLength(2);

      const historyS2 = pm.getHistory('s2');
      expect(historyS2).toHaveLength(1);
    });

    it('updates history after manual approve/deny', () => {
      const request = makeRequest({
        id: 'update-1',
        category: 'write',
        riskLevel: 'medium',
      });
      pm.check(request);

      // Initial history has pending
      const historyBefore = pm.getHistory();
      expect(historyBefore[0]!.response.decision).toBe('pending');

      pm.approve('update-1');

      // History updated to approved
      const historyAfter = pm.getHistory();
      const updated = historyAfter.find(
        (h) => h.request.id === 'update-1',
      );
      expect(updated?.response.decision).toBe('approved');
    });
  });

  describe('clear', () => {
    it('clears history and pending requests', () => {
      pm.check(makeRequest({ id: 'r1', category: 'read' }));
      pm.check(makeRequest({ id: 'r2', category: 'write' }));

      expect(pm.getHistory()).toHaveLength(2);
      expect(pm.getPendingRequests()).toHaveLength(1);

      pm.clear();

      expect(pm.getHistory()).toHaveLength(0);
      expect(pm.getPendingRequests()).toHaveLength(0);
    });
  });

  describe('onPermissionRequest callback', () => {
    it('callback receives pending requests via checkAsync', async () => {
      let receivedRequest: PermissionRequest | null = null;
      pm.onPermissionRequest(async (request) => {
        receivedRequest = request;
        return 'approved';
      });

      const request = makeRequest({
        id: 'async-1',
        category: 'write',
        riskLevel: 'medium',
      });

      const response = await pm.checkAsync(request);
      expect(response.decision).toBe('approved');
      expect(receivedRequest).not.toBeNull();
      expect(receivedRequest!.toolName).toBe('test_tool');
    });

    it('callback can deny requests', async () => {
      pm.onPermissionRequest(async () => 'denied');

      const request = makeRequest({
        id: 'async-2',
        category: 'execute',
        riskLevel: 'high',
      });

      const response = await pm.checkAsync(request);
      expect(response.decision).toBe('denied');
      expect(response.reason).toContain('Denied by user callback');
    });

    it('auto-approved requests bypass callback', async () => {
      let callbackCalled = false;
      pm.onPermissionRequest(async () => {
        callbackCalled = true;
        return 'approved';
      });

      const request = makeRequest({ category: 'read', riskLevel: 'low' });
      const response = await pm.checkAsync(request);
      expect(response.decision).toBe('approved');
      expect(callbackCalled).toBe(false);
    });

    it('callback errors result in denied', async () => {
      pm.onPermissionRequest(async () => {
        throw new Error('Callback failure');
      });

      const request = makeRequest({
        id: 'async-err',
        category: 'write',
        riskLevel: 'medium',
      });

      const response = await pm.checkAsync(request);
      expect(response.decision).toBe('denied');
      expect(response.reason).toContain('Permission callback error');
    });
  });
});
