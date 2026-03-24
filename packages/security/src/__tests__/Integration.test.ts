/**
 * Integration tests -- Permission Manager + Audit Trail together
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PermissionManager } from '../permissions/PermissionManager.js';
import { AuditTrail } from '../audit/AuditTrail.js';
import { createPermissionHook, createAuditHook, createErrorAuditHook } from '../hooks/SecurityHooks.js';
import type { HookContext } from '@osai/agent';

describe('Security Integration', () => {
  let pm: PermissionManager;
  let trail: AuditTrail;

  beforeEach(() => {
    pm = new PermissionManager();
    trail = new AuditTrail(':memory:');
  });

  afterEach(() => {
    trail.close();
  });

  describe('Permission + Audit together', () => {
    it('approved permission is recorded in audit trail', async () => {
      const hook = createPermissionHook({ permissionManager: pm, auditTrail: trail });
      const context: HookContext = {
        hookPoint: 'before_tool_call',
        sessionId: 'session-1',
        data: {
          toolName: 'read_file',
          category: 'read',
          riskLevel: 'low',
          params: {},
        },
        abort: false,
      };

      await hook.handler(context);
      const pmHistory = pm.getHistory();
      expect(pmHistory).toHaveLength(1);
      expect(pmHistory[0]!.response.decision).toBe('approved');

      const auditEntries = trail.query({ sessionId: 'session-1' });
      expect(auditEntries).toHaveLength(1);
      expect(auditEntries[0]!.action).toBe('permission_check');
      expect(auditEntries[0]!.details).toMatchObject({
        decision: 'approved',
        toolName: 'read_file',
      });
    });

    it('denied permission is recorded in audit trail with abort', async () => {
      // Use a custom PM where 'write' is neither auto-approved nor requires confirm
      const customPm = new PermissionManager({
        autoApprove: ['read', 'system'],
        requireConfirm: ['execute'],
      });
      const hook = createPermissionHook({ permissionManager: customPm, auditTrail: trail });
      const context: HookContext = {
        hookPoint: 'before_tool_call',
        sessionId: 'session-1',
        data: {
          toolName: 'rm_file',
          category: 'write',
          riskLevel: 'medium',
          params: { path: '/tmp/test' },
        },
        abort: false,
      };

      const result = (await hook.handler(context))!;
      expect(result.abort).toBe(true);
      expect(result.data['permissionDenied']).toBe(true);

      const auditEntries = trail.query({ category: 'permission' });
      expect(auditEntries).toHaveLength(1);
      expect(auditEntries[0]!.level).toBe('high');
    });

    it('pending permission is recorded with abort', async () => {
      const hook = createPermissionHook({ permissionManager: pm, auditTrail: trail });
      const context: HookContext = {
        hookPoint: 'before_tool_call',
        sessionId: 'session-1',
        data: {
          toolName: 'exec_bash',
          category: 'execute',
          riskLevel: 'medium',
          params: { cmd: 'ls' },
        },
        abort: false,
      };

      const result = (await hook.handler(context))!;
      expect(result.abort).toBe(true);
      expect(result.data['permissionPending']).toBe(true);

      const auditEntries = trail.query({ category: 'permission' });
      expect(auditEntries).toHaveLength(1);
      expect(auditEntries[0]!.details).toMatchObject({
        decision: 'pending',
        toolName: 'exec_bash',
      });
    });

    it('critical permission is recorded in audit trail', async () => {
      const hook = createPermissionHook({ permissionManager: pm, auditTrail: trail });
      const context: HookContext = {
        hookPoint: 'before_tool_call',
        sessionId: 'session-1',
        data: {
          toolName: 'format_disk',
          category: 'execute',
          riskLevel: 'critical',
          params: {},
        },
        abort: false,
      };

      const result = (await hook.handler(context))!;
      expect(result.abort).toBe(true);
      expect(result.data['permissionPending']).toBe(true);

      const auditEntries = trail.query({ level: 'medium' });
      expect(auditEntries).toHaveLength(1);
      expect(auditEntries[0]!.action).toBe('permission_check');
    });
  });

  describe('Audit hook after tool call', () => {
    it('records successful tool call', async () => {
      const hook = createAuditHook(trail);
      const context: HookContext = {
        hookPoint: 'after_tool_call',
        sessionId: 'session-1',
        data: {
          toolName: 'read_file',
          success: true,
          duration: 150,
        },
        abort: false,
      };

      await hook.handler(context);

      const entries = trail.query({ category: 'tool' });
      expect(entries).toHaveLength(1);
      expect(entries[0]!.action).toBe('tool_call');
      expect(entries[0]!.actor).toBe('agent');
      expect(entries[0]!.level).toBe('low');
      expect(entries[0]!.details).toMatchObject({
        toolName: 'read_file',
        success: true,
        duration: 150,
      });
    });

    it('records failed tool call as high level', async () => {
      const hook = createAuditHook(trail);
      const context: HookContext = {
        hookPoint: 'after_tool_call',
        sessionId: 'session-1',
        data: {
          toolName: 'delete_file',
          success: false,
          duration: 50,
        },
        abort: false,
      };

      await hook.handler(context);

      const entries = trail.query({ category: 'tool' });
      expect(entries).toHaveLength(1);
      expect(entries[0]!.level).toBe('high');
      expect(entries[0]!.details).toMatchObject({ success: false });
    });

    it('skips entries without toolName', async () => {
      const hook = createAuditHook(trail);
      const context: HookContext = {
        hookPoint: 'after_tool_call',
        sessionId: 'session-1',
        data: {},
        abort: false,
      };

      await hook.handler(context);

      const entries = trail.query();
      expect(entries).toHaveLength(0);
    });
  });

  describe('Error audit hook', () => {
    it('records errors in audit trail', async () => {
      const hook = createErrorAuditHook(trail);
      const context: HookContext = {
        hookPoint: 'on_error',
        sessionId: 'session-1',
        data: {
          error: 'Tool execution failed: permission denied',
          originalHook: 'before_tool_call',
        },
        abort: false,
      };

      await hook.handler(context);

      const entries = trail.query({ category: 'security' });
      expect(entries).toHaveLength(1);
      expect(entries[0]!.action).toBe('error');
      expect(entries[0]!.actor).toBe('system');
      expect(entries[0]!.level).toBe('high');
      expect(entries[0]!.details).toMatchObject({
        error: 'Tool execution failed: permission denied',
        originalHook: 'before_tool_call',
      });
    });
  });

  describe('full flow: permission + audit + tool call', () => {
    it('records permission check, tool call, and error in one session', async () => {
      const permHook = createPermissionHook({ permissionManager: pm, auditTrail: trail });
      const auditHook = createAuditHook(trail);
      const errorHook = createErrorAuditHook(trail);

      // Step 1: Permission check (auto-approved)
      const permContext: HookContext = {
        hookPoint: 'before_tool_call',
        sessionId: 'session-1',
        data: {
          toolName: 'read_config',
          category: 'read',
          riskLevel: 'low',
          params: {},
        },
        abort: false,
      };
      await permHook.handler(permContext);

      // Step 2: Tool call succeeded
      const toolContext: HookContext = {
        hookPoint: 'after_tool_call',
        sessionId: 'session-1',
        data: {
          toolName: 'read_config',
          success: true,
          duration: 10,
        },
        abort: false,
      };
      await auditHook.handler(toolContext);

      // Step 3: Error from another hook
      const errorContext: HookContext = {
        hookPoint: 'on_error',
        sessionId: 'session-1',
        data: {
          error: 'Model timeout',
          originalHook: 'before_model_resolve',
        },
        abort: false,
      };
      await errorHook.handler(errorContext);

      // Verify all entries
      const allEntries = trail.query({ sessionId: 'session-1' });
      expect(allEntries).toHaveLength(3);

      // Permission check
      expect(allEntries[0]!.action).toBe('permission_check');
      expect(allEntries[0]!.category).toBe('permission');

      // Tool call
      expect(allEntries[1]!.action).toBe('tool_call');
      expect(allEntries[1]!.category).toBe('tool');

      // Error
      expect(allEntries[2]!.action).toBe('error');
      expect(allEntries[2]!.category).toBe('security');

      // Stats reflect all entries
      const stats = trail.getStats();
      expect(stats.total).toBe(3);
      expect(stats.byCategory['permission']).toBe(1);
      expect(stats.byCategory['tool']).toBe(1);
      expect(stats.byCategory['security']).toBe(1);
    });
  });
});
