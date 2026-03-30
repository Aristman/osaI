/**
 * @osai/skills-osai -- Integration Test: Full Registry (T-009)
 *
 * Full registry test with all 6 skills loaded (2 bundled + 4 osaI).
 * osaI skills have their external dependencies mocked.
 * Bundled skills use real implementations.
 *
 * Acceptance Criteria:
 * - 6 skills loaded
 * - All tools available via getTools()
 * - Permission checker classifies all tools
 * - Enable/disable isolation works
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
// ---------------------------------------------------------------------------
// Mocks for external packages (must be hoisted before imports)
// ---------------------------------------------------------------------------
vi.mock('@osai/memory', () => ({
    MemoryService: vi.fn().mockImplementation(() => ({
        store: vi.fn().mockResolvedValue({
            id: 'mock-id',
            content: 'stored',
            tier: 'long-term',
            tags: [],
        }),
        query: vi.fn().mockResolvedValue([]),
        forget: vi.fn().mockResolvedValue(true),
        buildContext: vi.fn(),
        extractFacts: vi.fn(),
        destroy: vi.fn(),
        isInitialized: vi.fn().mockReturnValue(true),
    })),
    MemoryCategory: {
        Fact: 'fact',
        Preference: 'preference',
        Context: 'context',
        Skill: 'skill',
        Event: 'event',
        General: 'general',
    },
    MemoryTier: {
        Chat: 'chat',
        Session: 'session',
        LongTerm: 'long-term',
    },
}));
vi.mock('@osai/observability', () => ({
    LoggerFactory: {
        create: vi.fn().mockReturnValue({
            info: vi.fn(),
            warn: vi.fn(),
            error: vi.fn(),
            debug: vi.fn(),
        }),
    },
}));
// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------
import { SkillRegistry, PermissionChecker, createFilesystemSkill, createShellSkill } from '@osai/skills-core';
import { MemorySkill } from '../../skills/memory/MemorySkill.js';
import { KnowledgeBaseSkill } from '../../skills/knowledge-base/KnowledgeBaseSkill.js';
import { ChatManagementSkill } from '../../skills/chat-management/ChatManagementSkill.js';
import { OsIntegrationSkill } from '../../skills/os-integration/OsIntegrationSkill.js';
import { MemoryService } from '@osai/memory';
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function createMockKBService() {
    return {
        ingestDocument: vi.fn().mockResolvedValue({ documentId: 'doc-1' }),
        search: vi.fn().mockResolvedValue([]),
        listSources: vi.fn().mockResolvedValue([]),
        removeSource: vi.fn().mockResolvedValue(undefined),
    };
}
function createMockChatService() {
    return {
        listChats: vi.fn().mockResolvedValue([]),
        createChat: vi.fn().mockResolvedValue({ id: 'chat-1', name: 'New Chat' }),
        switchChat: vi.fn().mockResolvedValue({ activeChatId: 'chat-1' }),
        archiveChat: vi.fn().mockResolvedValue({ archived: true, chatId: 'chat-1' }),
        deleteChat: vi.fn().mockResolvedValue({ deleted: true, chatId: 'chat-1' }),
    };
}
function createMockOsService() {
    return {
        notify: vi.fn().mockResolvedValue({ ok: true }),
        listProcesses: vi.fn().mockResolvedValue([]),
        getSystemInfo: vi.fn().mockResolvedValue({
            cpu: { model: 'Test', physicalCores: 4, logicalCores: 8, speed: 3000, load: 0.5 },
            memory: { total: 16384, used: 8192, free: 8192, swapTotal: 4096, swapUsed: 0 },
            disk: [],
        }),
    };
}
function registerAllSkills(registry) {
    // Bundled skills (real implementations)
    registry.register(createFilesystemSkill());
    registry.register(createShellSkill());
    // osaI skills (mocked external deps)
    registry.register(new MemorySkill({ memoryService: new MemoryService() }).getDefinition());
    registry.register(new KnowledgeBaseSkill({ knowledgeBaseService: createMockKBService() }).getDefinition());
    registry.register(new ChatManagementSkill({ chatGatewayService: createMockChatService() }).getDefinition());
    registry.register(new OsIntegrationSkill({ osIntegrationService: createMockOsService() }).getDefinition());
}
// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('Integration: Full Registry (T-009)', () => {
    let registry;
    let permissionChecker;
    beforeEach(() => {
        registry = new SkillRegistry();
        permissionChecker = new PermissionChecker();
    });
    // -------------------------------------------------------------------------
    // TC-009-1: Full registry load (6 skills)
    // -------------------------------------------------------------------------
    describe('TC-009-1: Full registry load', () => {
        it('loads all 6 skills', () => {
            registerAllSkills(registry);
            expect(registry.listSkills()).toHaveLength(6);
        });
        it('has correct skill names', () => {
            registerAllSkills(registry);
            const names = registry.listSkills().map((s) => s.name);
            expect(names).toContain('filesystem');
            expect(names).toContain('shell');
            expect(names).toContain('memory');
            expect(names).toContain('knowledge-base');
            expect(names).toContain('chat-management');
            expect(names).toContain('os-integration');
        });
        it('all skills are enabled by default', () => {
            registerAllSkills(registry);
            for (const skill of registry.listSkills()) {
                expect(registry.isEnabled(skill.name)).toBe(true);
            }
        });
        it('skill categories are correct', () => {
            registerAllSkills(registry);
            const fs = registry.getSkill('filesystem');
            const shell = registry.getSkill('shell');
            const memory = registry.getSkill('memory');
            const kb = registry.getSkill('knowledge-base');
            const chat = registry.getSkill('chat-management');
            const os = registry.getSkill('os-integration');
            expect(fs.category).toBe('bundled');
            expect(shell.category).toBe('bundled');
            expect(memory.category).toBe('osaI');
            expect(kb.category).toBe('osaI');
            expect(chat.category).toBe('osaI');
            expect(os.category).toBe('osaI');
        });
    });
    // -------------------------------------------------------------------------
    // TC-009-2: getTools() returns valid JSON Schema tools array
    // -------------------------------------------------------------------------
    describe('TC-009-2: getTools() for LLM request', () => {
        it('returns 25 tools total (7 + 2 + 4 + 4 + 5 + 3)', () => {
            registerAllSkills(registry);
            expect(registry.getTools()).toHaveLength(25);
        });
        it('all tools have valid LLM function calling format', () => {
            registerAllSkills(registry);
            const tools = registry.getTools();
            for (const tool of tools) {
                expect(tool.name).toBeTruthy();
                expect(tool.description).toBeTruthy();
                expect(tool.parameters).toBeDefined();
                expect(tool.parameters.type).toBe('object');
                expect(tool.parameters.properties).toBeDefined();
                // Must not include handler
                expect('handler' in tool).toBe(false);
            }
        });
        it('tool names are unique', () => {
            registerAllSkills(registry);
            const tools = registry.getTools();
            const names = tools.map((t) => t.name);
            expect(new Set(names).size).toBe(names.length);
        });
    });
    // -------------------------------------------------------------------------
    // TC-009-3: Permission flow for all tools
    // -------------------------------------------------------------------------
    describe('TC-009-3: Permission flow', () => {
        it('permission checker classifies all 25 tools', () => {
            registerAllSkills(registry);
            const tools = registry.getTools();
            const allPermissions = {};
            for (const skill of registry.listSkills()) {
                Object.assign(allPermissions, skill.permissions);
            }
            for (const tool of tools) {
                const decision = permissionChecker.check(tool.name, allPermissions);
                expect(decision.toolName).toBe(tool.name);
                expect(decision.decision).toBeDefined();
                expect(decision.riskLevel).toBeDefined();
                expect(decision.category).toBeDefined();
            }
        });
        it('all read-category tools have auto decision', () => {
            registerAllSkills(registry);
            const tools = registry.getTools();
            const readTools = tools.filter((t) => t.name.startsWith('read_') ||
                t.name.startsWith('list_') ||
                t.name.startsWith('get_') ||
                t.name.startsWith('search_') ||
                t.name === 'query_knowledge' ||
                t.name === 'chat_list' ||
                t.name === 'chat_switch' ||
                t.name === 'list_sources');
            const allPermissions = {};
            for (const skill of registry.listSkills()) {
                Object.assign(allPermissions, skill.permissions);
            }
            for (const tool of readTools) {
                const decision = permissionChecker.check(tool.name, allPermissions);
                expect(decision.decision).toBe('auto');
            }
        });
        it('all exec-category tools have confirm decision', () => {
            registerAllSkills(registry);
            const allPermissions = {};
            for (const skill of registry.listSkills()) {
                Object.assign(allPermissions, skill.permissions);
            }
            for (const toolName of ['exec', 'exec_sandbox']) {
                const decision = permissionChecker.check(toolName, allPermissions);
                expect(decision.decision).toBe('confirm');
                expect(decision.riskLevel).toBe('high');
            }
        });
    });
    // -------------------------------------------------------------------------
    // TC-009-4: Enable/disable isolation
    // -------------------------------------------------------------------------
    describe('TC-009-4: Enable/disable isolation', () => {
        it('disabling one skill removes only its tools', () => {
            registerAllSkills(registry);
            expect(registry.getTools()).toHaveLength(25);
            registry.disable('filesystem');
            const tools = registry.getTools();
            expect(tools).toHaveLength(18); // 25 - 7
            expect(tools.find((t) => t.name === 'read_file')).toBeUndefined();
            expect(tools.find((t) => t.name === 'exec')).toBeDefined();
            expect(tools.find((t) => t.name === 'remember')).toBeDefined();
        });
        it('disabling all osaI skills leaves bundled tools', () => {
            registerAllSkills(registry);
            registry.disable('memory');
            registry.disable('knowledge-base');
            registry.disable('chat-management');
            registry.disable('os-integration');
            const tools = registry.getTools();
            expect(tools).toHaveLength(9); // only bundled: 7 + 2
            for (const tool of tools) {
                expect(['read_file', 'write_file', 'list_dir', 'search_files',
                    'move_file', 'delete_file', 'get_file_info', 'exec', 'exec_sandbox']).toContain(tool.name);
            }
        });
        it('disabling all bundled skills leaves osaI tools', () => {
            registerAllSkills(registry);
            registry.disable('filesystem');
            registry.disable('shell');
            const tools = registry.getTools();
            expect(tools).toHaveLength(16); // only osaI: 4 + 4 + 5 + 3
        });
        it('re-enabling a skill restores its tools', () => {
            registerAllSkills(registry);
            registry.disable('shell');
            expect(registry.getTools()).toHaveLength(23);
            registry.enable('shell');
            expect(registry.getTools()).toHaveLength(25);
        });
    });
    // -------------------------------------------------------------------------
    // TC-009-5: Reload preserves state
    // -------------------------------------------------------------------------
    describe('TC-009-5: Reload preserves state', () => {
        it('full unload and reload restores all 25 tools', () => {
            registerAllSkills(registry);
            expect(registry.getTools()).toHaveLength(25);
            // Full unload
            for (const skill of registry.listSkills()) {
                registry.unregister(skill.name);
            }
            expect(registry.getTools()).toHaveLength(0);
            // Full reload
            registerAllSkills(registry);
            expect(registry.getTools()).toHaveLength(25);
        });
        it('execution works after reload', async () => {
            registerAllSkills(registry);
            // Execute before reload
            const result1 = await registry.execute('exec', { command: 'echo before' });
            expect(result1.success).toBe(true);
            // Full reload
            for (const skill of registry.listSkills()) {
                registry.unregister(skill.name);
            }
            registerAllSkills(registry);
            // Execute after reload
            const result2 = await registry.execute('exec', { command: 'echo after' });
            expect(result2.success).toBe(true);
        });
    });
});
//# sourceMappingURL=full-registry.test.js.map