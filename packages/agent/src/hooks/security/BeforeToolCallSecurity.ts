/**
 * @osai/agent -- BeforeToolCallSecurity Hook (DOMAIN-002, T-008)
 *
 * Security hook that integrates:
 *   - FileSandbox: validates file operation paths (Layer 4)
 *   - CommandValidator: validates shell commands (Layer 5)
 *   - PermissionChecker: checks category-based permissions (Layer 3)
 *   - AuditService: logs security decisions (Layer 7)
 *
 * Registered on HookPoint.BEFORE_TOOL_EXECUTION.
 * If the hook blocks a tool call, it sets context.data.blocked = true
 * and provides a human-readable error in context.data.blockReason.
 *
 * Security pipeline per tool call:
 *   1. Extract tool name and parameters from context.data
 *   2. Permission check (PermissionChecker)
 *   3. If tool is a file operation -> FileSandbox.validate()
 *   4. If tool is shell exec -> CommandValidator.validate()
 *   5. If any check fails -> set blocked=true, log audit
 *   6. If all pass -> set audit metadata, return context
 */

import type { HookContext, HookHandler } from '../types.js';
import type { FileSandbox, CommandValidator, PermissionChecker, PermissionPolicy } from '@osai/skills-core';
import { AuditEventType } from '@osai/observability';
import type { RiskLevel as AuditRiskLevel, UserDecision as AuditUserDecision } from '@osai/observability';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Tool categories for routing to the appropriate security check. */
type ToolSecurityCategory = 'file' | 'shell' | 'other';

/** Audit log entry for the security hooks (compatible with AuditServiceV2). */
interface SecurityAuditEntry {
  readonly action: AuditEventType;
  readonly tool_name?: string;
  readonly skill_name?: string;
  readonly params?: unknown;
  readonly result?: unknown;
  readonly risk_level?: AuditRiskLevel;
  readonly trace_id?: string;
  readonly session_id?: string;
  readonly chat_id?: string;
  readonly user_decision?: AuditUserDecision;
  readonly id?: string;
  readonly timestamp?: string;
}

/** Minimal audit service interface for logging. */
export interface AuditServicePort {
  log(entry: SecurityAuditEntry): unknown;
}

/** Configuration for the BeforeToolCallSecurity hook. */
export interface BeforeToolCallSecurityConfig {
  readonly fileSandbox: FileSandbox;
  readonly commandValidator: CommandValidator;
  readonly permissionChecker: PermissionChecker;
  readonly auditService: AuditServicePort;
  readonly permissionPolicy: PermissionPolicy;
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

/** Tool names that are shell operations. */
const SHELL_TOOL_NAMES: ReadonlySet<string> = new Set([
  'exec',
  'exec_sandbox',
]);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Determine the security category of a tool by its name.
 */
function resolveSecurityCategory(toolName: string): ToolSecurityCategory {
  if (FILE_TOOL_NAMES.has(toolName)) {
    return 'file';
  }
  if (SHELL_TOOL_NAMES.has(toolName)) {
    return 'shell';
  }
  return 'other';
}

/**
 * Extract a path from tool parameters.
 * Supports both 'path' and 'directory' parameter names.
 */
function extractFilePath(
  toolName: string,
  params: Record<string, unknown>,
): string | undefined {
  if (toolName === 'search_files') {
    return typeof params['directory'] === 'string'
      ? params['directory']
      : undefined;
  }
  if (toolName === 'move_file') {
    // For move_file, check source path
    return typeof params['source'] === 'string'
      ? params['source']
      : undefined;
  }
  return typeof params['path'] === 'string'
    ? params['path']
    : undefined;
}

// ---------------------------------------------------------------------------
// Hook Factory
// ---------------------------------------------------------------------------

/**
 * Create a BEFORE_TOOL_EXECUTION hook handler that enforces security checks.
 *
 * Pipeline:
 *   1. Read tool_name and tool_params from context.data
 *   2. Permission check via PermissionChecker
 *   3. File sandbox check (for file tools)
 *   4. Command validator check (for shell tools)
 *   5. If blocked: set context.data.blocked = true, log audit, return context
 *   6. If allowed: set audit metadata, return context
 *
 * Usage:
 * ```ts
 * const hook = createBeforeToolCallSecurity({
 *   fileSandbox,
 *   commandValidator,
 *   permissionChecker,
 *   auditService,
 *   permissionPolicy,
 * });
 * registry.register(HookPoint.BEFORE_TOOL_EXECUTION, hook, 10);
 * ```
 */
export function createBeforeToolCallSecurity(
  config: BeforeToolCallSecurityConfig,
): HookHandler {
  const {
    fileSandbox,
    commandValidator,
    permissionChecker,
    auditService,
    permissionPolicy,
  } = config;

  return async (context: HookContext): Promise<HookContext> => {
    const toolName = context.data['tool_name'] as string | undefined;
    const toolParams = (context.data['tool_params'] as Record<string, unknown>) ?? {};

    // Skip if no tool name provided (not a tool call)
    if (toolName === undefined || typeof toolName !== 'string') {
      return context;
    }

    // --- Step 1: Permission check (Layer 3) ---
    const permissionDecision = permissionChecker.check(toolName, permissionPolicy);

    if (permissionDecision.decision === 'deny') {
      // Blocked by permission policy
      auditService.log({
        action: AuditEventType.PERMISSION_DECISION,
        tool_name: toolName,
        params: toolParams,
        result: { blocked: true, reason: `Permission denied: ${permissionDecision.reason}` },
        risk_level: permissionDecision.riskLevel === 'high' ? 'high' : 'medium',
        trace_id: context.traceId,
        session_id: context.sessionId,
        chat_id: context.chatId,
        user_decision: 'denied',
      });

      return {
        ...context,
        data: {
          ...context.data,
          blocked: true,
          blockReason: `Permission denied: ${permissionDecision.reason}`,
          permissionDecision,
        },
      };
    }

    // --- Step 2: Category-specific security checks ---

    const category = resolveSecurityCategory(toolName);

    if (category === 'file') {
      // File sandbox check (Layer 4)
      const filePath = extractFilePath(toolName, toolParams);
      if (filePath !== undefined) {
        const sandboxResult = fileSandbox.validate(filePath);

        if (!sandboxResult.allowed) {
          // Sandbox violation
          auditService.log({
            action: AuditEventType.SANDBOX_VIOLATION,
            tool_name: toolName,
            params: { path: filePath, resolvedPath: sandboxResult.resolvedPath },
            result: { blocked: true, violationType: sandboxResult.violationType },
            risk_level: 'high',
            trace_id: context.traceId,
            session_id: context.sessionId,
            chat_id: context.chatId,
          });

          return {
            ...context,
            data: {
              ...context.data,
              blocked: true,
              blockReason: sandboxResult.error ?? 'Sandbox violation',
              sandboxResult,
            },
          };
        }
      }
    }

    if (category === 'shell') {
      // Shell command validation (Layer 5)
      const command = toolParams['command'] as string | undefined;
      if (command !== undefined && typeof command === 'string') {
        const validationResult = commandValidator.validate(command);

        if (!validationResult.allowed) {
          // Blocked command
          auditService.log({
            action: AuditEventType.SHELL_EXEC,
            tool_name: toolName,
            params: { command },
            result: { blocked: true, reason: validationResult.reason },
            risk_level: 'high',
            trace_id: context.traceId,
            session_id: context.sessionId,
            chat_id: context.chatId,
          });

          return {
            ...context,
            data: {
              ...context.data,
              blocked: true,
              blockReason: `Blocked command: ${validationResult.reason}`,
              validation: validationResult,
            },
          };
        }
      }
    }

    // --- All checks passed ---

    // Log tool_call audit entry (for 100% audit coverage)
    auditService.log({
      action: AuditEventType.TOOL_CALL,
      tool_name: toolName,
      params: toolParams,
      result: { blocked: false },
      risk_level: permissionDecision.riskLevel === 'high' ? 'high' : permissionDecision.riskLevel === 'medium' ? 'medium' : 'low',
      trace_id: context.traceId,
      session_id: context.sessionId,
      chat_id: context.chatId,
    });

    return {
      ...context,
      data: {
        ...context.data,
        blocked: false,
        permissionDecision,
      },
    };
  };
}
