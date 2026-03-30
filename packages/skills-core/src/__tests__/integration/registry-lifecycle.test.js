/**
 * @osai/skills-core -- Integration Test: Registry Lifecycle (T-006)
 *
 * Tests register/unregister/enable/disable/reload lifecycle.
 * Uses real Filesystem and Shell skill implementations.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { SkillRegistry } from '../../registry/SkillRegistry.js';
import { createFilesystemSkill } from '../../skills/filesystem/FilesystemSkill.js';
import { createShellSkill } from '../../skills/shell/ShellSkill.js';
// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('Integration: Registry Lifecycle (T-006)', () => {
    let registry;
    beforeEach(() => {
        registry = new SkillRegistry();
    });
    // -------------------------------------------------------------------------
    // Register
    // -------------------------------------------------------------------------
    describe('register', () => {
        it('adds skill to registry', () => {
            registry.register(createFilesystemSkill());
            expect(registry.getSkill('filesystem')).toBeDefined();
        });
        it('tools from registered skill are in getTools()', () => {
            registry.register(createFilesystemSkill());
            const tools = registry.getTools();
            expect(tools.length).toBeGreaterThan(0);
            expect(tools.find((t) => t.name === 'read_file')).toBeDefined();
        });
        it('throws on duplicate registration', () => {
            registry.register(createFilesystemSkill());
            expect(() => registry.register(createFilesystemSkill())).toThrow(/already registered/i);
        });
    });
    // -------------------------------------------------------------------------
    // Unregister
    // -------------------------------------------------------------------------
    describe('unregister', () => {
        it('removes skill from registry', () => {
            registry.register(createFilesystemSkill());
            registry.unregister('filesystem');
            expect(registry.getSkill('filesystem')).toBeUndefined();
        });
        it('removes tools from getTools()', () => {
            registry.register(createFilesystemSkill());
            registry.register(createShellSkill());
            expect(registry.getTools()).toHaveLength(9);
            registry.unregister('filesystem');
            const remainingTools = registry.getTools();
            expect(remainingTools).toHaveLength(2);
            expect(remainingTools.find((t) => t.name === 'read_file')).toBeUndefined();
            expect(remainingTools.find((t) => t.name === 'exec')).toBeDefined();
        });
        it('silently ignores non-existent skill', () => {
            expect(() => registry.unregister('nonexistent')).not.toThrow();
        });
    });
    // -------------------------------------------------------------------------
    // Enable
    // -------------------------------------------------------------------------
    describe('enable', () => {
        it('enables a previously disabled skill', () => {
            registry.register(createFilesystemSkill());
            registry.disable('filesystem');
            expect(registry.isEnabled('filesystem')).toBe(false);
            expect(registry.getTools()).toHaveLength(0);
            registry.enable('filesystem');
            expect(registry.isEnabled('filesystem')).toBe(true);
            expect(registry.getTools()).toHaveLength(7);
        });
        it('silently ignores non-existent skill', () => {
            expect(() => registry.enable('nonexistent')).not.toThrow();
        });
    });
    // -------------------------------------------------------------------------
    // Disable
    // -------------------------------------------------------------------------
    describe('disable', () => {
        it('disables a registered skill', () => {
            registry.register(createFilesystemSkill());
            expect(registry.isEnabled('filesystem')).toBe(true);
            registry.disable('filesystem');
            expect(registry.isEnabled('filesystem')).toBe(false);
        });
        it('excludes disabled skill tools from getTools()', () => {
            registry.register(createFilesystemSkill());
            registry.register(createShellSkill());
            expect(registry.getTools()).toHaveLength(9);
            registry.disable('filesystem');
            const tools = registry.getTools();
            expect(tools).toHaveLength(2);
            expect(tools.every((t) => t.name === 'exec' || t.name === 'exec_sandbox')).toBe(true);
        });
        it('execute() throws for disabled skill tools', async () => {
            registry.register(createFilesystemSkill());
            registry.disable('filesystem');
            await expect(registry.execute('read_file', { path: '/tmp/test' })).rejects.toThrow(/not registered or not enabled/i);
        });
        it('silently ignores non-existent skill', () => {
            expect(() => registry.disable('nonexistent')).not.toThrow();
        });
    });
    // -------------------------------------------------------------------------
    // Enable/Disable isolation
    // -------------------------------------------------------------------------
    describe('enable/disable isolation', () => {
        it('disabling one skill does not affect another', () => {
            registry.register(createFilesystemSkill());
            registry.register(createShellSkill());
            registry.disable('filesystem');
            // Filesystem tools hidden
            expect(registry.getTools().find((t) => t.name === 'read_file')).toBeUndefined();
            // Shell tools still available
            expect(registry.getTools().find((t) => t.name === 'exec')).toBeDefined();
            expect(registry.getTools().find((t) => t.name === 'exec_sandbox')).toBeDefined();
        });
        it('enabling one skill does not re-enable another', () => {
            registry.register(createFilesystemSkill());
            registry.register(createShellSkill());
            registry.disable('filesystem');
            registry.disable('shell');
            expect(registry.getTools()).toHaveLength(0);
            registry.enable('filesystem');
            expect(registry.getTools()).toHaveLength(7);
            // Shell still disabled
            expect(registry.getTools().find((t) => t.name === 'exec')).toBeUndefined();
        });
    });
    // -------------------------------------------------------------------------
    // Reload (re-registration simulates reload)
    // -------------------------------------------------------------------------
    describe('reload simulation', () => {
        it('unregister + re-register preserves tool availability', () => {
            registry.register(createFilesystemSkill());
            expect(registry.getTools()).toHaveLength(7);
            // Simulate reload: unregister and re-register
            registry.unregister('filesystem');
            expect(registry.getTools()).toHaveLength(0);
            registry.register(createFilesystemSkill());
            expect(registry.getTools()).toHaveLength(7);
        });
        it('reload preserves execution capability', async () => {
            registry.register(createShellSkill());
            const result1 = await registry.execute('exec', { command: 'echo before' });
            expect(result1.success).toBe(true);
            // Reload
            registry.unregister('shell');
            registry.register(createShellSkill());
            const result2 = await registry.execute('exec', { command: 'echo after' });
            expect(result2.success).toBe(true);
        });
        it('full reload cycle: unregister all, re-register all', () => {
            registry.register(createFilesystemSkill());
            registry.register(createShellSkill());
            expect(registry.getTools()).toHaveLength(9);
            // Full unload
            registry.unregister('filesystem');
            registry.unregister('shell');
            expect(registry.getTools()).toHaveLength(0);
            // Full reload
            registry.register(createFilesystemSkill());
            registry.register(createShellSkill());
            expect(registry.getTools()).toHaveLength(9);
            // Verify tool names
            const toolNames = registry.getTools().map((t) => t.name);
            expect(toolNames).toContain('read_file');
            expect(toolNames).toContain('exec');
        });
    });
    // -------------------------------------------------------------------------
    // listSkills
    // -------------------------------------------------------------------------
    describe('listSkills', () => {
        it('returns empty array for empty registry', () => {
            expect(registry.listSkills()).toHaveLength(0);
        });
        it('returns all registered skills', () => {
            registry.register(createFilesystemSkill());
            registry.register(createShellSkill());
            const skills = registry.listSkills();
            expect(skills).toHaveLength(2);
            expect(skills.find((s) => s.name === 'filesystem')).toBeDefined();
            expect(skills.find((s) => s.name === 'shell')).toBeDefined();
        });
    });
    // -------------------------------------------------------------------------
    // getTool
    // -------------------------------------------------------------------------
    describe('getTool', () => {
        beforeEach(() => {
            registry.register(createFilesystemSkill());
            registry.register(createShellSkill());
        });
        it('returns tool definition by name', () => {
            const tool = registry.getTool('read_file');
            expect(tool).toBeDefined();
            expect(tool.name).toBe('read_file');
            expect(tool.description).toBeTruthy();
        });
        it('returns undefined for non-existent tool', () => {
            expect(registry.getTool('nonexistent')).toBeUndefined();
        });
        it('does not return tools from disabled skills', () => {
            registry.disable('shell');
            expect(registry.getTool('exec')).toBeUndefined();
        });
    });
});
//# sourceMappingURL=registry-lifecycle.test.js.map