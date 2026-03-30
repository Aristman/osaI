/**
 * @osai/agent -- AfterToolCallAudit Hook (DOMAIN-002, T-008)
 *
 * Audit hook for shell execution results (Layer 7).
 *
 * Logs an audit record for every shell tool call with:
 *   - command executed
 *   - exit_code (from tool result)
 *   - duration (if available)
 *   - success/failure status
 *
 * This hook is registered on AFTER_TOOL_EXECUTION and only processes
 * shell-related tool calls (exec, exec_sandbox).
 */

import type { HookContext, HookHandler } from '../types.js';
import { AuditEventType } from '@osai/observability';
import type { AuditServicePort } from './BeforeToolCallSecurity.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Configuration for the AfterToolCallAudit hook. */
export interface AfterToolCallAuditConfig {
  readonly auditService: AuditServicePort;
}

/** Tool names that are shell operations. */
const SHELL_TOOL_NAMES: ReadonlySet<string> = new Set([
  'exec',
  'exec_sandbox',
]);

// ---------------------------------------------------------------------------
// Hook Factory
// ---------------------------------------------------------------------------

/**
 * Create an AFTER_TOOL_EXECUTION hook handler that audits shell results.
 *
 * Only fires for shell-related tool names. Other tools are silently passed
 * through (no audit record created, no modification to context).
 *
 * For shell tools, logs:
 *   - action: "shell_exec"
 *   - command: the executed command string
 *   - exit_code: from tool result data
 *   - success: from tool result
 *
 * Usage:
 * ```ts
 * const hook = createAfterToolCallAudit({ auditService });
 * registry.register(HookPoint.AFTER_TOOL_EXECUTION, hook, 20);
 * ```
 */
export function createAfterToolCallAudit(
  config: AfterToolCallAuditConfig,
): HookHandler {
  const { auditService } = config;

  return async (context: HookContext): Promise<HookContext> => {
    const toolName = context.data['tool_name'] as string | undefined;
    const toolParams = (context.data['tool_params'] as Record<string, unknown>) ?? {};
    const toolResult = context.data['tool_result'] as Record<string, unknown> | undefined;

    // Skip if not a shell tool
    if (toolName === undefined || !SHELL_TOOL_NAMES.has(toolName)) {
      return context;
    }

    const command = toolParams['command'] as string | undefined;
    const resultData = toolResult?.['data'] as Record<string, unknown> | undefined;
    const success = toolResult?.['success'] as boolean ?? false;
    const exitCode = resultData?.['exit_code'] as number | undefined;
    const error = toolResult?.['error'] as string | undefined;

    auditService.log({
      action: AuditEventType.SHELL_EXEC,
      tool_name: toolName,
      skill_name: 'shell',
      params: {
        command: command ?? '<unknown>',
      },
      result: {
        success,
        exit_code: exitCode ?? -1,
        ...(error !== undefined ? { error } : {}),
      },
      risk_level: 'high',
      trace_id: context.traceId,
      session_id: context.sessionId,
      chat_id: context.chatId,
    });

    return context;
  };
}
