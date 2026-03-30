/**
 * AfterToolCallAudit Hook -- Unit Tests (T-008)
 *
 * TC-008-5: after_tool_call: shell exec result logged with exit_code
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createAfterToolCallAudit } from '../AfterToolCallAudit.js';
import { HookPoint } from '../../types.js';
import type { HookContext } from '../../types.js';
import { AuditEventType } from '@osai/observability';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

function createMockAuditService() {
  const logCalls: Array<Record<string, unknown>> = [];
  const auditService = {
    log: vi.fn((entry: Record<string, unknown>) => {
      logCalls.push(entry);
    }),
  };
  return { auditService, logCalls };
}

function createContext(overrides: Partial<Record<string, unknown>> = {}): HookContext {
  return {
    hookPoint: HookPoint.AFTER_TOOL_EXECUTION,
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

describe('AfterToolCallAudit', () => {
  let mockAudit: ReturnType<typeof createMockAuditService>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAudit = createMockAuditService();
  });

  it('TC-008-5: shell exec with exit_code -- audit record logged', async () => {
    const hook = createAfterToolCallAudit({
      auditService: mockAudit.auditService as never,
    });

    const ctx = createContext({
      data: {
        tool_name: 'exec',
        tool_params: { command: 'ls -la' },
        tool_result: {
          success: true,
          data: { stdout: 'file1.txt\nfile2.txt', exit_code: 0 },
        },
      },
    });

    await hook(ctx);

    expect(mockAudit.logCalls).toHaveLength(1);
    expect(mockAudit.logCalls[0]!.action).toBe(AuditEventType.SHELL_EXEC);
    expect(mockAudit.logCalls[0]!.tool_name).toBe('exec');
    expect(mockAudit.logCalls[0]!.skill_name).toBe('shell');
    expect(mockAudit.logCalls[0]!.params).toEqual({ command: 'ls -la' });
    expect(mockAudit.logCalls[0]!.result).toEqual({
      success: true,
      exit_code: 0,
    });
    expect(mockAudit.logCalls[0]!.risk_level).toBe('high');
  });

  it('shell exec failure -- audit record with error', async () => {
    const hook = createAfterToolCallAudit({
      auditService: mockAudit.auditService as never,
    });

    const ctx = createContext({
      data: {
        tool_name: 'exec',
        tool_params: { command: 'nonexistent_command' },
        tool_result: {
          success: false,
          error: 'command not found',
          data: { exit_code: 127 },
        },
      },
    });

    await hook(ctx);

    expect(mockAudit.logCalls).toHaveLength(1);
    expect(mockAudit.logCalls[0]!.action).toBe(AuditEventType.SHELL_EXEC);
    expect(mockAudit.logCalls[0]!.result).toEqual({
      success: false,
      exit_code: 127,
      error: 'command not found',
    });
  });

  it('shell exec_sandbox -- also audited', async () => {
    const hook = createAfterToolCallAudit({
      auditService: mockAudit.auditService as never,
    });

    const ctx = createContext({
      data: {
        tool_name: 'exec_sandbox',
        tool_params: { command: 'cat /etc/hosts' },
        tool_result: {
          success: true,
          data: { stdout: '127.0.0.1 localhost', exit_code: 0 },
        },
      },
    });

    await hook(ctx);

    expect(mockAudit.logCalls).toHaveLength(1);
    expect(mockAudit.logCalls[0]!.tool_name).toBe('exec_sandbox');
  });

  it('non-shell tool -- no audit record created', async () => {
    const hook = createAfterToolCallAudit({
      auditService: mockAudit.auditService as never,
    });

    const ctx = createContext({
      data: {
        tool_name: 'read_file',
        tool_params: { path: '/tmp/test.txt' },
        tool_result: { success: true },
      },
    });

    await hook(ctx);

    expect(mockAudit.logCalls).toHaveLength(0);
  });

  it('no tool_name -- no audit record created', async () => {
    const hook = createAfterToolCallAudit({
      auditService: mockAudit.auditService as never,
    });

    const ctx = createContext({ data: {} });

    await hook(ctx);

    expect(mockAudit.logCalls).toHaveLength(0);
  });

  it('correlation IDs propagated to audit', async () => {
    const hook = createAfterToolCallAudit({
      auditService: mockAudit.auditService as never,
    });

    const ctx = createContext({
      traceId: 'trace-shell-456',
      sessionId: 'sess-x',
      chatId: 'chat-y',
      data: {
        tool_name: 'exec',
        tool_params: { command: 'echo hello' },
        tool_result: { success: true, data: { exit_code: 0 } },
      },
    });

    await hook(ctx);

    expect(mockAudit.auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        trace_id: 'trace-shell-456',
        session_id: 'sess-x',
        chat_id: 'chat-y',
      }),
    );
  });
});
