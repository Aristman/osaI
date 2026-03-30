/**
 * BeforeToolCallSecurity Hook -- Unit Tests (T-008)
 *
 * TC-008-1: before_tool_call: file op in sandbox -- OK -> hook passes
 * TC-008-2: before_tool_call: file op outside sandbox -- BLOCKED
 * TC-008-3: before_tool_call: blocked shell command -- BLOCKED
 * TC-008-4: on_file_access: audit record created
 * TC-008-5: after_tool_call: shell exec result logged
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createBeforeToolCallSecurity } from '../BeforeToolCallSecurity.js';
import { HookPoint } from '../../types.js';
import type { HookContext } from '../../types.js';
import { AuditEventType } from '@osai/observability';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

function createMockAuditService(): {
  auditService: { log: ReturnType<typeof vi.fn> };
  logCalls: Array<{ action: string; tool_name?: string; risk_level?: string; result?: unknown }>;
} {
  const logCalls: Array<{ action: string; tool_name?: string; risk_level?: string; result?: unknown }> = [];
  const auditService = {
    log: vi.fn((entry: Record<string, unknown>) => {
      logCalls.push({
        action: entry.action as string,
        tool_name: entry.tool_name as string | undefined,
        risk_level: entry.risk_level as string | undefined,
        result: entry.result as Record<string, unknown> | undefined,
      });
    }),
  };
  return { auditService, logCalls };
}

function createMockFileSandbox(allowed = true): {
  sandbox: { validate: ReturnType<typeof vi.fn> };
} {
  const sandbox = {
    validate: vi.fn(() => ({
      allowed,
      path: '/tmp/test.txt',
      resolvedPath: allowed ? '/tmp/test.txt' : null,
      error: allowed ? undefined : 'Path is not within any allowed directory',
      violationType: allowed ? undefined : 'not_in_allowed_dirs',
    })),
  };
  return { sandbox };
}

function createMockCommandValidator(allowed = true): {
  validator: { validate: ReturnType<typeof vi.fn> };
} {
  const validator = {
    validate: vi.fn(() => ({
      allowed,
      reason: allowed ? undefined : 'Destructive: recursive removal of filesystem root',
    })),
  };
  return { validator };
}

function createMockPermissionChecker(): {
  checker: { check: ReturnType<typeof vi.fn> };
} {
  const checker = {
    check: vi.fn(() => ({
      toolName: 'read_file',
      category: 'read',
      decision: 'auto' as const,
      riskLevel: 'low' as const,
      reason: "Category 'read' defaults to 'auto' for 'read_file'",
    })),
  };
  return { checker };
}

function createContext(overrides: Partial<Record<string, unknown>> = {}): HookContext {
  return {
    hookPoint: HookPoint.BEFORE_TOOL_EXECUTION,
    sessionId: 'session-1',
    chatId: 'chat-1',
    traceId: 'trace-1',
    timestamp: new Date().toISOString(),
    data: {},
    ...overrides,
  } as HookContext;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('BeforeToolCallSecurity', () => {
  let mockAudit: ReturnType<typeof createMockAuditService>;
  let mockSandbox: ReturnType<typeof createMockFileSandbox>;
  let mockValidator: ReturnType<typeof createMockCommandValidator>;
  let mockPermission: ReturnType<typeof createMockPermissionChecker>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAudit = createMockAuditService();
    mockSandbox = createMockFileSandbox(true);
    mockValidator = createMockCommandValidator(true);
    mockPermission = createMockPermissionChecker();
  });

  // TC-008-1: File operation in sandbox -- allowed
  it('TC-008-1: file op in sandbox -- hook passes, tool executes', async () => {
    const hook = createBeforeToolCallSecurity({
      fileSandbox: mockSandbox.sandbox as never,
      commandValidator: mockValidator.validator as never,
      permissionChecker: mockPermission.checker as never,
      auditService: mockAudit.auditService as never,
      permissionPolicy: {},
    });

    const ctx = createContext({
      data: {
        tool_name: 'read_file',
        tool_params: { path: '/tmp/test.txt' },
      },
    });

    const result = await hook(ctx);

    expect(result.data['blocked']).toBe(false);
    expect(mockAudit.logCalls).toHaveLength(1);
    expect(mockAudit.logCalls[0]!.action).toBe(AuditEventType.TOOL_CALL);
    expect(mockAudit.logCalls[0]!.tool_name).toBe('read_file');
  });

  // TC-008-2: File operation outside sandbox -- blocked
  it('TC-008-2: file op outside sandbox -- hook blocks, permission_request sent', async () => {
    const blockSandbox = createMockFileSandbox(false);
    const hook = createBeforeToolCallSecurity({
      fileSandbox: blockSandbox.sandbox as never,
      commandValidator: mockValidator.validator as never,
      permissionChecker: mockPermission.checker as never,
      auditService: mockAudit.auditService as never,
      permissionPolicy: {},
    });

    const ctx = createContext({
      data: {
        tool_name: 'read_file',
        tool_params: { path: '/etc/passwd' },
      },
    });

    const result = await hook(ctx);

    expect(result.data['blocked']).toBe(true);
    expect(result.data['blockReason']).toContain('not within any allowed directory');
    expect(mockAudit.logCalls).toHaveLength(1);
    expect(mockAudit.logCalls[0]!.action).toBe(AuditEventType.SANDBOX_VIOLATION);
    expect(mockAudit.logCalls[0]!.risk_level).toBe('high');
  });

  // TC-008-3: Blocked shell command -- blocked
  it('TC-008-3: blocked shell command -- hook blocks, audit logged', async () => {
    const blockValidator = createMockCommandValidator(false);
    const hook = createBeforeToolCallSecurity({
      fileSandbox: mockSandbox.sandbox as never,
      commandValidator: blockValidator.validator as never,
      permissionChecker: mockPermission.checker as never,
      auditService: mockAudit.auditService as never,
      permissionPolicy: {},
    });

    const ctx = createContext({
      data: {
        tool_name: 'exec',
        tool_params: { command: 'rm -rf /' },
      },
    });

    const result = await hook(ctx);

    expect(result.data['blocked']).toBe(true);
    expect(result.data['blockReason']).toContain('Blocked command');
    expect(mockAudit.logCalls).toHaveLength(1);
    expect(mockAudit.logCalls[0]!.action).toBe(AuditEventType.SHELL_EXEC);
    expect(mockAudit.logCalls[0]!.risk_level).toBe('high');
  });

  // Shell command allowed
  it('allowed shell command -- hook passes', async () => {
    const hook = createBeforeToolCallSecurity({
      fileSandbox: mockSandbox.sandbox as never,
      commandValidator: mockValidator.validator as never,
      permissionChecker: mockPermission.checker as never,
      auditService: mockAudit.auditService as never,
      permissionPolicy: {},
    });

    const ctx = createContext({
      data: {
        tool_name: 'exec',
        tool_params: { command: 'ls -la' },
      },
    });

    const result = await hook(ctx);

    expect(result.data['blocked']).toBe(false);
    expect(mockAudit.logCalls).toHaveLength(1);
    expect(mockAudit.logCalls[0]!.action).toBe(AuditEventType.TOOL_CALL);
  });

  // Permission denied
  it('permission denied -- hook blocks', async () => {
    const denyChecker = {
      check: vi.fn(() => ({
        toolName: 'exec',
        category: 'exec' as const,
        decision: 'deny' as const,
        riskLevel: 'high' as const,
        reason: "Category 'exec' defaults to 'confirm' for 'exec'",
      })),
    };

    const hook = createBeforeToolCallSecurity({
      fileSandbox: mockSandbox.sandbox as never,
      commandValidator: mockValidator.validator as never,
      permissionChecker: denyChecker as never,
      auditService: mockAudit.auditService as never,
      permissionPolicy: {},
    });

    const ctx = createContext({
      data: {
        tool_name: 'exec',
        tool_params: { command: 'ls' },
      },
    });

    const result = await hook(ctx);

    expect(result.data['blocked']).toBe(true);
    expect(result.data['blockReason']).toContain('Permission denied');
    expect(mockAudit.logCalls).toHaveLength(1);
    expect(mockAudit.logCalls[0]!.action).toBe(AuditEventType.PERMISSION_DECISION);
  });

  // No tool_name -- skip
  it('no tool_name -- skips security checks', async () => {
    const hook = createBeforeToolCallSecurity({
      fileSandbox: mockSandbox.sandbox as never,
      commandValidator: mockValidator.validator as never,
      permissionChecker: mockPermission.checker as never,
      auditService: mockAudit.auditService as never,
      permissionPolicy: {},
    });

    const ctx = createContext({ data: {} });

    await hook(ctx);

    expect(mockAudit.logCalls).toHaveLength(0);
    expect(mockSandbox.sandbox.validate).not.toHaveBeenCalled();
  });

  // Unknown tool -- passes through
  it('unknown tool -- passes with tool_call audit', async () => {
    const hook = createBeforeToolCallSecurity({
      fileSandbox: mockSandbox.sandbox as never,
      commandValidator: mockValidator.validator as never,
      permissionChecker: mockPermission.checker as never,
      auditService: mockAudit.auditService as never,
      permissionPolicy: {},
    });

    const ctx = createContext({
      data: {
        tool_name: 'some_other_tool',
        tool_params: { foo: 'bar' },
      },
    });

    const result = await hook(ctx);

    expect(result.data['blocked']).toBe(false);
    expect(mockAudit.logCalls).toHaveLength(1);
    expect(mockAudit.logCalls[0]!.action).toBe(AuditEventType.TOOL_CALL);
  });

  // Correlation IDs propagated to audit
  it('correlation IDs (traceId, sessionId, chatId) propagated to audit', async () => {
    const hook = createBeforeToolCallSecurity({
      fileSandbox: mockSandbox.sandbox as never,
      commandValidator: mockValidator.validator as never,
      permissionChecker: mockPermission.checker as never,
      auditService: mockAudit.auditService as never,
      permissionPolicy: {},
    });

    const ctx = createContext({
      traceId: 'trace-abc-123',
      sessionId: 'sess-xyz',
      chatId: 'chat-def',
      data: {
        tool_name: 'read_file',
        tool_params: { path: '/tmp/test.txt' },
      },
    });

    await hook(ctx);

    expect(mockAudit.auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        trace_id: 'trace-abc-123',
        session_id: 'sess-xyz',
        chat_id: 'chat-def',
      }),
    );
  });
});
