/**
 * @osai/agent -- OnFileAccessAudit Hook (DOMAIN-002, T-008)
 *
 * Audit hook for file access operations (Layer 7).
 *
 * Logs an audit record for every file operation:
 *   - read_file, write_file, list_dir, search_files,
 *     move_file, delete_file, get_file_info
 *
 * Records: tool_name, path, operation outcome (success/failure).
 * All records are correlated by trace_id, session_id, chat_id.
 *
 * This hook is designed to be registered on a hook point that fires
 * AFTER file operations complete. In the current 14-hook system it
 * maps to AFTER_TOOL_EXECUTION with a file-tool filter, or can be
 * wired into a dedicated ON_FILE_ACCESS point if added later.
 */

import type { HookContext, HookHandler } from '../types.js';
import { AuditEventType } from '@osai/observability';
import type { AuditServicePort } from './BeforeToolCallSecurity.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Configuration for the OnFileAccessAudit hook. */
export interface OnFileAccessAuditConfig {
  readonly auditService: AuditServicePort;
}

/** Tool names that are file operations. */
const FILE_TOOL_NAMES: ReadonlySet<string> = new Set([
  'read_file',
  'write_file',
  'list_dir',
  'search_files',
  'move_file',
  'delete_file',
  'get_file_info',
]);

/**
 * Extract the primary path from tool parameters.
 */
function extractPath(
  toolName: string,
  params: Record<string, unknown>,
): string | undefined {
  if (toolName === 'search_files') {
    return typeof params['directory'] === 'string'
      ? params['directory']
      : undefined;
  }
  if (toolName === 'move_file') {
    const source = params['source'];
    // Return source as primary path
    return typeof source === 'string' ? source : undefined;
  }
  return typeof params['path'] === 'string'
    ? params['path']
    : undefined;
}

// ---------------------------------------------------------------------------
// Hook Factory
// ---------------------------------------------------------------------------

/**
 * Create an AFTER_TOOL_EXECUTION hook handler that audits file access.
 *
 * Only fires for file-related tool names. Other tools are silently passed
 * through (no audit record created, no modification to context).
 *
 * Usage:
 * ```ts
 * const hook = createOnFileAccessAudit({ auditService });
 * registry.register(HookPoint.AFTER_TOOL_EXECUTION, hook, 10);
 * ```
 */
export function createOnFileAccessAudit(
  config: OnFileAccessAuditConfig,
): HookHandler {
  const { auditService } = config;

  return async (context: HookContext): Promise<HookContext> => {
    const toolName = context.data['tool_name'] as string | undefined;
    const toolParams = (context.data['tool_params'] as Record<string, unknown>) ?? {};
    const toolResult = context.data['tool_result'] as Record<string, unknown> | undefined;

    // Skip if not a file tool
    if (toolName === undefined || !FILE_TOOL_NAMES.has(toolName)) {
      return context;
    }

    const filePath = extractPath(toolName, toolParams);
    const success = toolResult?.['success'] as boolean ?? false;

    // Determine risk level based on operation type
    const writeTools = new Set(['write_file', 'move_file', 'delete_file']);
    const riskLevel = writeTools.has(toolName) ? 'medium' : 'low';

    auditService.log({
      action: AuditEventType.FILE_ACCESS,
      tool_name: toolName,
      skill_name: 'filesystem',
      params: {
        path: filePath,
      },
      result: {
        success,
        ...(toolResult?.['error'] !== undefined ? { error: toolResult['error'] } : {}),
      },
      risk_level: riskLevel,
      trace_id: context.traceId,
      session_id: context.sessionId,
      chat_id: context.chatId,
    });

    return context;
  };
}
