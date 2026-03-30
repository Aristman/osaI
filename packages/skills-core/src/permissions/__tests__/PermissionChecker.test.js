/**
 * Unit tests for PermissionChecker (T-003: Permission Model)
 *
 * Test cases:
 * TC-003-1: read category = auto
 * TC-003-2: write category = confirm
 * TC-003-3: exec category = confirm
 * TC-003-4: system category = auto
 * TC-003-5: PermissionDecision contains risk_level
 */
import { describe, it, expect } from 'vitest';
import { PermissionChecker } from '../PermissionChecker.js';
describe('PermissionChecker', () => {
    let checker;
    beforeEach(() => {
        checker = new PermissionChecker();
    });
    describe('TC-003-1: read category = auto', () => {
        it('should return auto decision for read_ tools', () => {
            const policy = {};
            const result = checker.check('read_file', policy);
            expect(result.decision).toBe('auto');
            expect(result.category).toBe('read');
            expect(result.toolName).toBe('read_file');
        });
        it('should return auto decision for list_ tools', () => {
            const policy = {};
            const result = checker.check('list_dir', policy);
            expect(result.decision).toBe('auto');
            expect(result.category).toBe('read');
        });
        it('should return auto decision for get_ tools', () => {
            const policy = {};
            const result = checker.check('get_file_info', policy);
            expect(result.decision).toBe('auto');
            expect(result.category).toBe('read');
        });
        it('should return auto decision for search_ tools', () => {
            const policy = {};
            const result = checker.check('search_files', policy);
            expect(result.decision).toBe('auto');
            expect(result.category).toBe('read');
        });
    });
    describe('TC-003-2: write category = confirm', () => {
        it('should return confirm decision for write_ tools', () => {
            const policy = {};
            const result = checker.check('write_file', policy);
            expect(result.decision).toBe('confirm');
            expect(result.category).toBe('write');
            expect(result.toolName).toBe('write_file');
        });
        it('should return confirm decision for create_ tools', () => {
            const policy = {};
            const result = checker.check('create_file', policy);
            expect(result.decision).toBe('confirm');
            expect(result.category).toBe('write');
        });
        it('should return confirm decision for delete_ tools', () => {
            const policy = {};
            const result = checker.check('delete_file', policy);
            expect(result.decision).toBe('confirm');
            expect(result.category).toBe('write');
        });
        it('should return confirm decision for move_ tools', () => {
            const policy = {};
            const result = checker.check('move_file', policy);
            expect(result.decision).toBe('confirm');
            expect(result.category).toBe('write');
        });
    });
    describe('TC-003-3: exec category = confirm', () => {
        it('should return confirm decision for exec_ tools', () => {
            const policy = {};
            const result = checker.check('exec', policy);
            expect(result.decision).toBe('confirm');
            expect(result.category).toBe('exec');
            expect(result.toolName).toBe('exec');
        });
        it('should return confirm decision for shell_ tools', () => {
            const policy = {};
            const result = checker.check('shell_exec', policy);
            expect(result.decision).toBe('confirm');
            expect(result.category).toBe('exec');
        });
    });
    describe('TC-003-4: system category = auto', () => {
        it('should return auto decision for system_ tools', () => {
            const policy = {};
            const result = checker.check('system_info', policy);
            expect(result.decision).toBe('auto');
            expect(result.category).toBe('system');
            expect(result.toolName).toBe('system_info');
        });
    });
    describe('TC-003-5: PermissionDecision contains risk_level', () => {
        it('should return risk_level=low for read category', () => {
            const policy = {};
            const result = checker.check('read_file', policy);
            expect(result.riskLevel).toBe('low');
        });
        it('should return risk_level=medium for write category', () => {
            const policy = {};
            const result = checker.check('write_file', policy);
            expect(result.riskLevel).toBe('medium');
        });
        it('should return risk_level=high for exec category', () => {
            const policy = {};
            const result = checker.check('exec', policy);
            expect(result.riskLevel).toBe('high');
        });
        it('should return risk_level=low for system category', () => {
            const policy = {};
            const result = checker.check('system_info', policy);
            expect(result.riskLevel).toBe('low');
        });
    });
    describe('Custom policy overrides', () => {
        it('should use policy override when tool has explicit entry', () => {
            const policy = {
                read_file: 'deny',
            };
            const result = checker.check('read_file', policy);
            expect(result.decision).toBe('deny');
            expect(result.riskLevel).toBe('medium');
            expect(result.reason).toContain('overridden by policy');
        });
        it('should use policy auto override for a write tool', () => {
            const policy = {
                write_file: 'auto',
            };
            const result = checker.check('write_file', policy);
            expect(result.decision).toBe('auto');
            expect(result.riskLevel).toBe('low');
        });
        it('should use policy deny override for an exec tool', () => {
            const policy = {
                exec: 'deny',
            };
            const result = checker.check('exec', policy);
            expect(result.decision).toBe('deny');
            expect(result.riskLevel).toBe('high');
        });
        it('should return category default when tool not in policy', () => {
            const policy = {
                other_tool: 'deny',
            };
            const result = checker.check('read_file', policy);
            expect(result.decision).toBe('auto');
            expect(result.riskLevel).toBe('low');
            expect(result.reason).toContain("defaults to 'auto'");
        });
        it('should include reason in decision', () => {
            const policy = {};
            const result = checker.check('read_file', policy);
            expect(result.reason).toBeDefined();
            expect(result.reason).toContain('read_file');
        });
    });
});
//# sourceMappingURL=PermissionChecker.test.js.map