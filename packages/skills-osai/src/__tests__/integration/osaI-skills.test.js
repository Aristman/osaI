/**
 * @osai/skills-osai -- Integration Test: osaI Skills (T-009)
 *
 * All osaI skills (Memory, KB, Chat, OS) register in SkillRegistry.
 * External dependencies are mocked via vi.mock.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
// ---------------------------------------------------------------------------
// Mocks for external packages
// ---------------------------------------------------------------------------
vi.mock('@osai/memory', () => ({
    MemoryService: vi.fn().mockImplementation(() => ({
        store: vi.fn().mockResolvedValue({
            id: 'mock-memory-id',
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
import { SkillRegistry } from '@osai/skills-core';
import { MemorySkill } from '../../skills/memory/MemorySkill.js';
import { MemoryService } from '@osai/memory';
import { KnowledgeBaseSkill } from '../../skills/knowledge-base/KnowledgeBaseSkill.js';
import { ChatManagementSkill } from '../../skills/chat-management/ChatManagementSkill.js';
import { OsIntegrationSkill } from '../../skills/os-integration/OsIntegrationSkill.js';
import { PermissionChecker } from '@osai/skills-core';
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
            cpu: { model: 'Test CPU', physicalCores: 4, logicalCores: 8, speed: 3000, load: 0.5 },
            memory: { total: 16384, used: 8192, free: 8192, swapTotal: 4096, swapUsed: 0 },
            disk: [],
        }),
    };
}
// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('Integration: osaI Skills (T-009)', () => {
    let registry;
    let permissionChecker;
    beforeEach(() => {
        registry = new SkillRegistry();
        permissionChecker = new PermissionChecker();
    });
    // -------------------------------------------------------------------------
    // All osaI skills register
    // -------------------------------------------------------------------------
    describe('All osaI skills register in registry', () => {
        it('registers Memory skill', () => {
            const skill = new MemorySkill({ memoryService: new MemoryService() });
            registry.register(skill.getDefinition());
            expect(registry.getSkill('memory')).toBeDefined();
        });
        it('registers Knowledge Base skill', () => {
            const skill = new KnowledgeBaseSkill({ knowledgeBaseService: createMockKBService() });
            registry.register(skill.getDefinition());
            expect(registry.getSkill('knowledge-base')).toBeDefined();
        });
        it('registers Chat Management skill', () => {
            const skill = new ChatManagementSkill({ chatGatewayService: createMockChatService() });
            registry.register(skill.getDefinition());
            expect(registry.getSkill('chat-management')).toBeDefined();
        });
        it('registers OS Integration skill', () => {
            const skill = new OsIntegrationSkill({ osIntegrationService: createMockOsService() });
            registry.register(skill.getDefinition());
            expect(registry.getSkill('os-integration')).toBeDefined();
        });
    });
    // -------------------------------------------------------------------------
    // Tool counts and names
    // -------------------------------------------------------------------------
    describe('Tool definitions', () => {
        let allTools;
        beforeEach(() => {
            registry.register(new MemorySkill({ memoryService: new MemoryService() }).getDefinition());
            registry.register(new KnowledgeBaseSkill({ knowledgeBaseService: createMockKBService() }).getDefinition());
            registry.register(new ChatManagementSkill({ chatGatewayService: createMockChatService() }).getDefinition());
            registry.register(new OsIntegrationSkill({ osIntegrationService: createMockOsService() }).getDefinition());
            allTools = registry.getTools();
        });
        it('returns 16 tools total (4 + 4 + 5 + 3)', () => {
            expect(allTools).toHaveLength(16);
        });
        it('has Memory tool names', () => {
            const memorySkill = registry.getSkill('memory');
            const names = memorySkill.tools.map((t) => t.name);
            expect(names).toEqual(['remember', 'recall', 'forget', 'summarize_session']);
        });
        it('has Knowledge Base tool names', () => {
            const kbSkill = registry.getSkill('knowledge-base');
            const names = kbSkill.tools.map((t) => t.name);
            expect(names).toEqual(['ingest_document', 'query_knowledge', 'list_sources', 'remove_source']);
        });
        it('has Chat Management tool names', () => {
            const chatSkill = registry.getSkill('chat-management');
            const names = chatSkill.tools.map((t) => t.name);
            expect(names).toEqual(['chat_list', 'chat_create', 'chat_switch', 'chat_archive', 'chat_delete']);
        });
        it('has OS Integration tool names', () => {
            const osSkill = registry.getSkill('os-integration');
            const names = osSkill.tools.map((t) => t.name);
            expect(names).toEqual(['show_notification', 'list_processes', 'get_system_info']);
        });
        it('all tools have valid JSON Schema parameters', () => {
            for (const tool of allTools) {
                expect(tool.parameters.type).toBe('object');
                expect(tool.parameters.properties).toBeDefined();
            }
        });
    });
    // -------------------------------------------------------------------------
    // Permission flow for all osaI tools
    // -------------------------------------------------------------------------
    describe('Permission flow for all osaI tools', () => {
        it('Memory tools all have confirm permission', () => {
            const memorySkill = new MemorySkill({ memoryService: new MemoryService() });
            const def = memorySkill.getDefinition();
            for (const [toolName, level] of Object.entries(def.permissions)) {
                expect(level).toBe('confirm');
                const decision = permissionChecker.check(toolName, def.permissions);
                expect(decision.decision).toBe('confirm');
            }
        });
        it('KB: ingest_document and remove_source are confirm, others are auto', () => {
            const kbSkill = new KnowledgeBaseSkill({ knowledgeBaseService: createMockKBService() });
            const def = kbSkill.getDefinition();
            expect(def.permissions['ingest_document']).toBe('confirm');
            expect(def.permissions['remove_source']).toBe('confirm');
            expect(def.permissions['query_knowledge']).toBe('auto');
            expect(def.permissions['list_sources']).toBe('auto');
        });
        it('Chat: list and switch are auto, create/archive/delete are confirm', () => {
            const chatSkill = new ChatManagementSkill({ chatGatewayService: createMockChatService() });
            const def = chatSkill.getDefinition();
            expect(def.permissions['chat_list']).toBe('auto');
            expect(def.permissions['chat_switch']).toBe('auto');
            expect(def.permissions['chat_create']).toBe('confirm');
            expect(def.permissions['chat_archive']).toBe('confirm');
            expect(def.permissions['chat_delete']).toBe('confirm');
        });
        it('OS: show_notification is confirm, list_processes and get_system_info are auto', () => {
            const osSkill = new OsIntegrationSkill({ osIntegrationService: createMockOsService() });
            const def = osSkill.getDefinition();
            expect(def.permissions['show_notification']).toBe('confirm');
            expect(def.permissions['list_processes']).toBe('auto');
            expect(def.permissions['get_system_info']).toBe('auto');
        });
    });
    // -------------------------------------------------------------------------
    // Enable/disable isolation for osaI skills
    // -------------------------------------------------------------------------
    describe('Enable/disable isolation', () => {
        beforeEach(() => {
            registry.register(new MemorySkill({ memoryService: new MemoryService() }).getDefinition());
            registry.register(new KnowledgeBaseSkill({ knowledgeBaseService: createMockKBService() }).getDefinition());
            registry.register(new ChatManagementSkill({ chatGatewayService: createMockChatService() }).getDefinition());
            registry.register(new OsIntegrationSkill({ osIntegrationService: createMockOsService() }).getDefinition());
        });
        it('disabling Memory skill excludes its tools from getTools()', () => {
            registry.disable('memory');
            const tools = registry.getTools();
            expect(tools.find((t) => t.name === 'remember')).toBeUndefined();
            expect(tools).toHaveLength(12); // 16 - 4
        });
        it('disabling Chat Management excludes its 5 tools', () => {
            registry.disable('chat-management');
            const tools = registry.getTools();
            expect(tools.find((t) => t.name === 'chat_list')).toBeUndefined();
            expect(tools).toHaveLength(11); // 16 - 5
        });
    });
    // -------------------------------------------------------------------------
    // Execution via registry
    // -------------------------------------------------------------------------
    describe('Execute via registry', () => {
        it('Memory: recall returns empty results through registry', async () => {
            const memorySkill = new MemorySkill({ memoryService: new MemoryService() });
            registry.register(memorySkill.getDefinition());
            const result = await registry.execute('recall', { query: 'test query' });
            // osaI handlers return ToolResult, which gets wrapped by registry.execute()
            expect(result.success).toBe(true);
            const inner = result.data;
            expect(inner.success).toBe(true);
            expect(inner.data).toEqual([]);
        });
        it('KB: list_sources returns empty through registry', async () => {
            const kbSkill = new KnowledgeBaseSkill({ knowledgeBaseService: createMockKBService() });
            registry.register(kbSkill.getDefinition());
            const result = await registry.execute('list_sources', {});
            expect(result.success).toBe(true);
            const inner = result.data;
            expect(inner.success).toBe(true);
            expect(inner.data).toEqual([]);
        });
        it('Chat: chat_list returns empty through registry', async () => {
            const chatSkill = new ChatManagementSkill({ chatGatewayService: createMockChatService() });
            registry.register(chatSkill.getDefinition());
            const result = await registry.execute('chat_list', {});
            expect(result.success).toBe(true);
            const inner = result.data;
            expect(inner.success).toBe(true);
            expect(inner.data).toEqual([]);
        });
        it('OS: get_system_info returns data through registry', async () => {
            const osSkill = new OsIntegrationSkill({ osIntegrationService: createMockOsService() });
            registry.register(osSkill.getDefinition());
            const result = await registry.execute('get_system_info', {});
            expect(result.success).toBe(true);
            const inner = result.data;
            expect(inner.success).toBe(true);
            expect(inner.data.cpu.model).toBe('Test CPU');
        });
    });
});
//# sourceMappingURL=osaI-skills.test.js.map