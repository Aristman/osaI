/**
 * OnFileAccessAudit Hook -- Unit Tests (T-008)
 *
 * TC-008-4: on_file_access: audit record created
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createOnFileAccessAudit } from '../OnFileAccessAudit.js';
import { HookPoint } from '../../types.js';
import { AuditEventType } from '@osai/observability';
// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------
function createMockAuditService() {
    const logCalls = [];
    const auditService = {
        log: vi.fn((entry) => {
            logCalls.push(entry);
        }),
    };
    return { auditService, logCalls };
}
function createContext(overrides = {}) {
    return {
        hookPoint: HookPoint.AFTER_TOOL_EXECUTION,
        sessionId: 'session-1',
        chatId: 'chat-1',
        traceId: 'trace-1',
        timestamp: new Date().toISOString(),
        data: {},
        ...overrides,
    };
}
// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('OnFileAccessAudit', () => {
    let mockAudit;
    beforeEach(() => {
        vi.clearAllMocks();
        mockAudit = createMockAuditService();
    });
    it('TC-008-4: file read -- audit record created', async () => {
        const hook = createOnFileAccessAudit({
            auditService: mockAudit.auditService,
        });
        const ctx = createContext({
            data: {
                tool_name: 'read_file',
                tool_params: { path: '/tmp/test.txt' },
                tool_result: { success: true, data: 'file contents' },
            },
        });
        await hook(ctx);
        expect(mockAudit.logCalls).toHaveLength(1);
        expect(mockAudit.logCalls[0].action).toBe(AuditEventType.FILE_ACCESS);
        expect(mockAudit.logCalls[0].tool_name).toBe('read_file');
        expect(mockAudit.logCalls[0].skill_name).toBe('filesystem');
        expect(mockAudit.logCalls[0].params).toEqual({ path: '/tmp/test.txt' });
        expect(mockAudit.logCalls[0].result).toEqual({ success: true });
        expect(mockAudit.logCalls[0].risk_level).toBe('low');
    });
    it('file write -- audit record with medium risk', async () => {
        const hook = createOnFileAccessAudit({
            auditService: mockAudit.auditService,
        });
        const ctx = createContext({
            data: {
                tool_name: 'write_file',
                tool_params: { path: '/tmp/output.txt' },
                tool_result: { success: true },
            },
        });
        await hook(ctx);
        expect(mockAudit.logCalls).toHaveLength(1);
        expect(mockAudit.logCalls[0].action).toBe(AuditEventType.FILE_ACCESS);
        expect(mockAudit.logCalls[0].risk_level).toBe('medium');
    });
    it('file delete -- audit record with medium risk', async () => {
        const hook = createOnFileAccessAudit({
            auditService: mockAudit.auditService,
        });
        const ctx = createContext({
            data: {
                tool_name: 'delete_file',
                tool_params: { path: '/tmp/old.txt' },
                tool_result: { success: false, error: 'file not found' },
            },
        });
        await hook(ctx);
        expect(mockAudit.logCalls).toHaveLength(1);
        expect(mockAudit.logCalls[0].action).toBe(AuditEventType.FILE_ACCESS);
        expect(mockAudit.logCalls[0].risk_level).toBe('medium');
        expect(mockAudit.logCalls[0].result).toEqual({
            success: false,
            error: 'file not found',
        });
    });
    it('non-file tool -- no audit record created', async () => {
        const hook = createOnFileAccessAudit({
            auditService: mockAudit.auditService,
        });
        const ctx = createContext({
            data: {
                tool_name: 'exec',
                tool_params: { command: 'ls' },
                tool_result: { success: true },
            },
        });
        await hook(ctx);
        expect(mockAudit.logCalls).toHaveLength(0);
    });
    it('no tool_name -- no audit record created', async () => {
        const hook = createOnFileAccessAudit({
            auditService: mockAudit.auditService,
        });
        const ctx = createContext({ data: {} });
        await hook(ctx);
        expect(mockAudit.logCalls).toHaveLength(0);
    });
    it('correlation IDs propagated to audit', async () => {
        const hook = createOnFileAccessAudit({
            auditService: mockAudit.auditService,
        });
        const ctx = createContext({
            traceId: 'trace-file-123',
            sessionId: 'sess-a',
            chatId: 'chat-b',
            data: {
                tool_name: 'list_dir',
                tool_params: { path: '/tmp' },
                tool_result: { success: true },
            },
        });
        await hook(ctx);
        expect(mockAudit.auditService.log).toHaveBeenCalledWith(expect.objectContaining({
            trace_id: 'trace-file-123',
            session_id: 'sess-a',
            chat_id: 'chat-b',
        }));
    });
});
//# sourceMappingURL=OnFileAccessAudit.test.js.map