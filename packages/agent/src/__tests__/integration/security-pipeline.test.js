/**
 * Security Pipeline -- Integration Tests (T-008)
 *
 * TC-008-6: Full pipeline: request -> sandbox check -> exec -> audit
 *
 * Tests the complete security chain:
 *   BeforeToolCallSecurity -> tool execution -> OnFileAccessAudit / AfterToolCallAudit
 *
 * Uses mock AuditService, FileSandbox, CommandValidator.
 * Verifies end-to-end security flow through HookRegistry.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HookRegistry, HookPoint } from '@osai/agent';
import { createBeforeToolCallSecurity, createOnFileAccessAudit, createAfterToolCallAudit } from '@osai/agent';
import { AuditEventType } from '@osai/observability';
import { FileSandbox, CommandValidator, PermissionChecker } from '@osai/skills-core';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
// ---------------------------------------------------------------------------
// Test infrastructure
// ---------------------------------------------------------------------------
function createInMemoryAuditService() {
    const records = [];
    return {
        records,
        auditService: {
            log: vi.fn((entry) => {
                records.push(entry);
            }),
            query: vi.fn(() => []),
            queryExtended: vi.fn(() => []),
            cleanup: vi.fn(() => 0),
        },
    };
}
function createContext(data) {
    return {
        hookPoint: HookPoint.BEFORE_TOOL_EXECUTION,
        sessionId: 'integration-session',
        chatId: 'integration-chat',
        traceId: 'integration-trace',
        timestamp: new Date().toISOString(),
        data,
    };
}
// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('Security Pipeline Integration', () => {
    let audit;
    let fileSandbox;
    let commandValidator;
    let permissionChecker;
    let registry;
    beforeEach(() => {
        vi.clearAllMocks();
        audit = createInMemoryAuditService();
        const tmpDir = tmpdir();
        fileSandbox = new FileSandbox(FileSandbox.createConfig({
            allowedDirs: [tmpDir],
        }));
        commandValidator = new CommandValidator();
        permissionChecker = new PermissionChecker();
        registry = new HookRegistry();
    });
    // TC-008-6: Full pipeline -- file operation allowed
    it('TC-008-6: full pipeline -- file op allowed -> sandbox check -> audit', async () => {
        // Register security hooks
        registry.register(HookPoint.BEFORE_TOOL_EXECUTION, createBeforeToolCallSecurity({
            fileSandbox,
            commandValidator,
            permissionChecker,
            auditService: audit.auditService,
            permissionPolicy: {},
        }), 10);
        registry.register(HookPoint.AFTER_TOOL_EXECUTION, createOnFileAccessAudit({ auditService: audit.auditService }), 10);
        // Simulate a file read in sandbox
        const tmpFile = join(tmpdir(), 'security-pipeline-test.txt');
        // Step 1: BEFORE_TOOL_EXECUTION
        let ctx = createContext({
            tool_name: 'read_file',
            tool_params: { path: tmpFile },
        });
        ctx = await registry.execute(HookPoint.BEFORE_TOOL_EXECUTION, ctx);
        // Should NOT be blocked
        expect(ctx.data['blocked']).toBe(false);
        // Step 2: Simulate tool execution (set result)
        ctx = {
            ...ctx,
            hookPoint: HookPoint.AFTER_TOOL_EXECUTION,
            data: {
                ...ctx.data,
                tool_result: { success: true, data: 'test content' },
            },
        };
        // Step 3: AFTER_TOOL_EXECUTION
        ctx = await registry.execute(HookPoint.AFTER_TOOL_EXECUTION, ctx);
        // Verify audit records
        expect(audit.records.length).toBeGreaterThanOrEqual(2);
        // Should have TOOL_CALL from BeforeToolCallSecurity
        const toolCallRecord = audit.records.find((r) => r.action === AuditEventType.TOOL_CALL);
        expect(toolCallRecord).toBeDefined();
        expect(toolCallRecord.tool_name).toBe('read_file');
        // Should have FILE_ACCESS from OnFileAccessAudit
        const fileAccessRecord = audit.records.find((r) => r.action === AuditEventType.FILE_ACCESS);
        expect(fileAccessRecord).toBeDefined();
        expect(fileAccessRecord.tool_name).toBe('read_file');
        expect(fileAccessRecord.params).toEqual({ path: tmpFile });
    });
    // Full pipeline -- shell command allowed
    it('full pipeline -- shell exec allowed -> command validated -> audit', async () => {
        registry.register(HookPoint.BEFORE_TOOL_EXECUTION, createBeforeToolCallSecurity({
            fileSandbox,
            commandValidator,
            permissionChecker,
            auditService: audit.auditService,
            permissionPolicy: {},
        }), 10);
        registry.register(HookPoint.AFTER_TOOL_EXECUTION, createAfterToolCallAudit({ auditService: audit.auditService }), 10);
        // Step 1: BEFORE_TOOL_EXECUTION
        let ctx = createContext({
            tool_name: 'exec',
            tool_params: { command: 'echo hello' },
        });
        ctx = await registry.execute(HookPoint.BEFORE_TOOL_EXECUTION, ctx);
        expect(ctx.data['blocked']).toBe(false);
        // Step 2: Simulate tool execution
        ctx = {
            ...ctx,
            hookPoint: HookPoint.AFTER_TOOL_EXECUTION,
            data: {
                ...ctx.data,
                tool_result: {
                    success: true,
                    data: { stdout: 'hello', exit_code: 0 },
                },
            },
        };
        // Step 3: AFTER_TOOL_EXECUTION
        ctx = await registry.execute(HookPoint.AFTER_TOOL_EXECUTION, ctx);
        // Verify audit records
        const toolCallRecord = audit.records.find((r) => r.action === AuditEventType.TOOL_CALL);
        expect(toolCallRecord).toBeDefined();
        const shellExecRecord = audit.records.find((r) => r.action === AuditEventType.SHELL_EXEC);
        expect(shellExecRecord).toBeDefined();
        expect(shellExecRecord.tool_name).toBe('exec');
        expect(shellExecRecord.params).toEqual({ command: 'echo hello' });
        expect(shellExecRecord.result).toEqual({ success: true, exit_code: 0 });
    });
    // Full pipeline -- sandbox violation
    it('full pipeline -- sandbox violation -> blocked, no after hook audit', async () => {
        registry.register(HookPoint.BEFORE_TOOL_EXECUTION, createBeforeToolCallSecurity({
            fileSandbox,
            commandValidator,
            permissionChecker,
            auditService: audit.auditService,
            permissionPolicy: {},
        }), 10);
        registry.register(HookPoint.AFTER_TOOL_EXECUTION, createOnFileAccessAudit({ auditService: audit.auditService }), 10);
        // Try to read a file outside sandbox
        let ctx = createContext({
            tool_name: 'read_file',
            tool_params: { path: '/etc/passwd' },
        });
        ctx = await registry.execute(HookPoint.BEFORE_TOOL_EXECUTION, ctx);
        // Should be blocked
        expect(ctx.data['blocked']).toBe(true);
        expect(ctx.data['blockReason']).toContain('not within any allowed directory');
        // Should have SANDBOX_VIOLATION audit record
        const violationRecord = audit.records.find((r) => r.action === AuditEventType.SANDBOX_VIOLATION);
        expect(violationRecord).toBeDefined();
        expect(violationRecord.risk_level).toBe('high');
        // Should NOT have TOOL_CALL record (blocked before that)
        const toolCallRecord = audit.records.find((r) => r.action === AuditEventType.TOOL_CALL);
        expect(toolCallRecord).toBeUndefined();
    });
    // Full pipeline -- blocked command
    it('full pipeline -- blocked command -> denied', async () => {
        registry.register(HookPoint.BEFORE_TOOL_EXECUTION, createBeforeToolCallSecurity({
            fileSandbox,
            commandValidator,
            permissionChecker,
            auditService: audit.auditService,
            permissionPolicy: {},
        }), 10);
        registry.register(HookPoint.AFTER_TOOL_EXECUTION, createAfterToolCallAudit({ auditService: audit.auditService }), 10);
        let ctx = createContext({
            tool_name: 'exec',
            tool_params: { command: 'rm -rf /' },
        });
        ctx = await registry.execute(HookPoint.BEFORE_TOOL_EXECUTION, ctx);
        expect(ctx.data['blocked']).toBe(true);
        expect(ctx.data['blockReason']).toContain('Blocked command');
        // Should have SHELL_EXEC audit with blocked=true
        const shellRecord = audit.records.find((r) => r.action === AuditEventType.SHELL_EXEC);
        expect(shellRecord).toBeDefined();
        expect(shellRecord.result).toEqual(expect.objectContaining({ blocked: true }));
        expect(shellRecord.risk_level).toBe('high');
    });
    // Full pipeline -- trace_id consistency across all audit records
    it('trace_id consistent across all audit records in pipeline', async () => {
        registry.register(HookPoint.BEFORE_TOOL_EXECUTION, createBeforeToolCallSecurity({
            fileSandbox,
            commandValidator,
            permissionChecker,
            auditService: audit.auditService,
            permissionPolicy: {},
        }), 10);
        registry.register(HookPoint.AFTER_TOOL_EXECUTION, createOnFileAccessAudit({ auditService: audit.auditService }), 10);
        const traceId = 'trace-consistency-xyz';
        let ctx = createContext({
            traceId,
            tool_name: 'read_file',
            tool_params: { path: join(tmpdir(), 'test.txt') },
        });
        ctx = await registry.execute(HookPoint.BEFORE_TOOL_EXECUTION, ctx);
        ctx = {
            ...ctx,
            hookPoint: HookPoint.AFTER_TOOL_EXECUTION,
            data: {
                ...ctx.data,
                tool_result: { success: true },
            },
        };
        ctx = await registry.execute(HookPoint.AFTER_TOOL_EXECUTION, ctx);
        // All records should have the same trace_id
        for (const record of audit.records) {
            expect(record.trace_id).toBe(traceId);
        }
    });
});
//# sourceMappingURL=security-pipeline.test.js.map