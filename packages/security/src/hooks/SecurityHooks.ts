/**
 * @osai/security -- Security Hooks
 *
 * Integration hooks for PermissionManager and AuditTrail
 * that work with the @osai/agent HookManager.
 */

import type { HookContext, HookHandler, HookPoint } from '@osai/agent';
import { PermissionManager } from '../permissions/PermissionManager.js';
import { generateId } from '../permissions/PermissionManager.js';
import type { AuditTrail } from '../audit/AuditTrail.js';
import type { AuditActor, AuditCategory } from '../audit/types.js';

interface SecurityHookDeps {
  permissionManager: PermissionManager;
  auditTrail: AuditTrail;
}

/**
 * Create a permission hook for the 'before_tool_call' hook point.
 * Checks permissions before a tool is executed.
 * Sets `abort: true` if permission is denied.
 */
export function createPermissionHook(
  deps: SecurityHookDeps,
  priority: number = 5,
): { hookPoint: HookPoint; handler: HookHandler; priority: number } {
  const handler: HookHandler = async (context: HookContext) => {
    const toolName = context.data['toolName'] as string | undefined;
    const action = context.data['action'] as string | undefined;
    const params = (context.data['params'] as Record<string, unknown>) ?? {};
    const category = context.data['category'] as
      | 'read'
      | 'write'
      | 'execute'
      | 'system'
      | undefined;
    const riskLevel = context.data['riskLevel'] as
      | 'low'
      | 'medium'
      | 'high'
      | 'critical'
      | undefined;

    if (!toolName) {
      return context;
    }

    const request = {
      id: generateId(`perm-${toolName}`),
      sessionId: context.sessionId,
      toolName,
      action: action ?? toolName,
      params,
      category: category ?? 'read',
      riskLevel: riskLevel ?? 'medium',
      timestamp: new Date(),
    };

    const response = deps.permissionManager.check(request);

    // Record the permission check in audit trail
    deps.auditTrail.record({
      sessionId: context.sessionId,
      action: 'permission_check',
      actor: 'system' as AuditActor,
      category: 'permission' as AuditCategory,
      level: response.decision === 'approved' ? 'low' : response.decision === 'denied' ? 'high' : 'medium',
      details: {
        toolName: request.toolName,
        category: request.category,
        riskLevel: request.riskLevel,
        decision: response.decision,
        reason: response.reason,
      },
    });

    if (response.decision === 'denied') {
      return {
        ...context,
        abort: true,
        data: {
          ...context.data,
          permissionDenied: true,
          permissionReason: response.reason,
        },
      };
    }

    if (response.decision === 'pending') {
      // For async approval flow, abort and let caller handle retry
      return {
        ...context,
        abort: true,
        data: {
          ...context.data,
          permissionPending: true,
          permissionRequestId: request.id,
          permissionReason: response.reason,
        },
      };
    }

    return context;
  };

  return {
    hookPoint: 'before_tool_call',
    handler,
    priority,
  };
}

/**
 * Create an audit hook for the 'after_tool_call' hook point.
 * Records tool execution results in the audit trail.
 */
export function createAuditHook(
  auditTrail: AuditTrail,
  priority: number = 50,
): { hookPoint: HookPoint; handler: HookHandler; priority: number } {
  const handler: HookHandler = async (context: HookContext) => {
    const toolName = context.data['toolName'] as string | undefined;
    const success = context.data['success'] as boolean | undefined;
    const duration = context.data['duration'] as number | undefined;

    if (!toolName) {
      return context;
    }

    auditTrail.record({
      sessionId: context.sessionId,
      action: 'tool_call',
      actor: 'agent' as AuditActor,
      category: 'tool' as AuditCategory,
      level: success ? 'low' : 'high',
      details: {
        toolName,
        success: success ?? true,
        duration,
      },
    });

    return context;
  };

  return {
    hookPoint: 'after_tool_call',
    handler,
    priority,
  };
}

/**
 * Create an error audit hook for the 'on_error' hook point.
 * Records errors in the audit trail.
 */
export function createErrorAuditHook(
  auditTrail: AuditTrail,
  priority: number = 50,
): { hookPoint: HookPoint; handler: HookHandler; priority: number } {
  const handler: HookHandler = async (context: HookContext) => {
    const error = context.data['error'] as string | undefined;
    const originalHook = context.data['originalHook'] as string | undefined;

    auditTrail.record({
      sessionId: context.sessionId,
      action: 'error',
      actor: 'system' as AuditActor,
      category: 'security' as AuditCategory,
      level: 'high',
      details: {
        error: error ?? 'Unknown error',
        originalHook: originalHook ?? 'unknown',
      },
    });

    return context;
  };

  return {
    hookPoint: 'on_error',
    handler,
    priority,
  };
}
