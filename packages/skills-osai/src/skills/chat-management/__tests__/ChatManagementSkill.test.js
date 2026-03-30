/**
 * @osai/skills-osai -- Chat Management Skill Unit Tests
 *
 * TC-008-4: chat_list delegates to Gateway Chat API
 * TC-008-5: chat_create delegates to Gateway Chat API
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
// ---------------------------------------------------------------------------
// Mock @osai/observability
// ---------------------------------------------------------------------------
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
import { ChatManagementSkill } from '../ChatManagementSkill.js';
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function createMockChatGatewayService() {
    return {
        listChats: vi.fn(),
        createChat: vi.fn(),
        switchChat: vi.fn(),
        archiveChat: vi.fn(),
        deleteChat: vi.fn(),
    };
}
// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('ChatManagementSkill', () => {
    let skill;
    let mockService;
    beforeEach(() => {
        vi.clearAllMocks();
        mockService = createMockChatGatewayService();
        skill = new ChatManagementSkill({ chatGatewayService: mockService });
    });
    // -------------------------------------------------------------------------
    // getDefinition
    // -------------------------------------------------------------------------
    describe('getDefinition', () => {
        it('returns a valid SkillDefinition', () => {
            const definition = skill.getDefinition();
            expect(definition.name).toBe('chat-management');
            expect(definition.version).toBe('1.0.0');
            expect(definition.category).toBe('osaI');
            expect(definition.enabled).toBe(true);
            expect(definition.tools).toHaveLength(5);
        });
        it('has correct tool names', () => {
            const definition = skill.getDefinition();
            const toolNames = definition.tools.map(t => t.name);
            expect(toolNames).toContain('chat_list');
            expect(toolNames).toContain('chat_create');
            expect(toolNames).toContain('chat_switch');
            expect(toolNames).toContain('chat_archive');
            expect(toolNames).toContain('chat_delete');
        });
        it('has correct permission mapping', () => {
            const definition = skill.getDefinition();
            expect(definition.permissions['chat_list']).toBe('auto');
            expect(definition.permissions['chat_create']).toBe('confirm');
            expect(definition.permissions['chat_switch']).toBe('auto');
            expect(definition.permissions['chat_archive']).toBe('confirm');
            expect(definition.permissions['chat_delete']).toBe('confirm');
        });
        it('tools have valid JSON Schema parameters', () => {
            const definition = skill.getDefinition();
            for (const tool of definition.tools) {
                expect(tool.parameters.type).toBe('object');
                expect(tool.parameters.properties).toBeDefined();
            }
        });
    });
    // -------------------------------------------------------------------------
    // TC-008-4: chat_list
    // -------------------------------------------------------------------------
    describe('chat_list (TC-008-4)', () => {
        it('delegates to ChatGatewayService.listChats()', async () => {
            const chats = [
                { id: 'chat-001', name: 'Main', description: 'Main chat', isActive: true },
                { id: 'chat-002', name: 'Dev', description: 'Development chat', isActive: false },
            ];
            vi.mocked(mockService.listChats).mockResolvedValue(chats);
            const definition = skill.getDefinition();
            const tool = definition.tools.find(t => t.name === 'chat_list');
            const result = await tool.handler({});
            expect(mockService.listChats).toHaveBeenCalledOnce();
            expect(result.success).toBe(true);
            if (result.success) {
                const data = result.data;
                expect(data).toHaveLength(2);
                expect(data[0].id).toBe('chat-001');
                expect(data[1].id).toBe('chat-002');
            }
        });
        it('returns empty array when no chats', async () => {
            vi.mocked(mockService.listChats).mockResolvedValue([]);
            const definition = skill.getDefinition();
            const tool = definition.tools.find(t => t.name === 'chat_list');
            const result = await tool.handler({});
            expect(result.success).toBe(true);
            if (result.success) {
                expect(result.data).toEqual([]);
            }
        });
        it('returns error when service throws', async () => {
            vi.mocked(mockService.listChats).mockRejectedValue(new Error('Gateway unavailable'));
            const definition = skill.getDefinition();
            const tool = definition.tools.find(t => t.name === 'chat_list');
            const result = await tool.handler({});
            expect(result.success).toBe(false);
            if (!result.success) {
                expect(result.error).toBe('Gateway unavailable');
            }
        });
    });
    // -------------------------------------------------------------------------
    // TC-008-5: chat_create
    // -------------------------------------------------------------------------
    describe('chat_create (TC-008-5)', () => {
        it('delegates to ChatGatewayService.createChat()', async () => {
            vi.mocked(mockService.createChat).mockResolvedValue({ id: 'chat-new', name: 'New Chat' });
            const definition = skill.getDefinition();
            const tool = definition.tools.find(t => t.name === 'chat_create');
            const result = await tool.handler({ name: 'New Chat', description: 'A new chat' });
            expect(mockService.createChat).toHaveBeenCalledOnce();
            expect(mockService.createChat).toHaveBeenCalledWith({
                name: 'New Chat',
                description: 'A new chat',
            });
            expect(result.success).toBe(true);
            if (result.success) {
                expect(result.data).toEqual({ id: 'chat-new', name: 'New Chat' });
            }
        });
        it('creates chat without name and description', async () => {
            vi.mocked(mockService.createChat).mockResolvedValue({ id: 'chat-003', name: 'Untitled' });
            const definition = skill.getDefinition();
            const tool = definition.tools.find(t => t.name === 'chat_create');
            const result = await tool.handler({});
            expect(mockService.createChat).toHaveBeenCalledWith({ name: undefined, description: undefined });
            expect(result.success).toBe(true);
        });
        it('returns error when service throws', async () => {
            vi.mocked(mockService.createChat).mockRejectedValue(new Error('Invalid chat name'));
            const definition = skill.getDefinition();
            const tool = definition.tools.find(t => t.name === 'chat_create');
            const result = await tool.handler({ name: 'Bad Name' });
            expect(result.success).toBe(false);
            if (!result.success) {
                expect(result.error).toBe('Invalid chat name');
            }
        });
    });
    // -------------------------------------------------------------------------
    // chat_switch
    // -------------------------------------------------------------------------
    describe('chat_switch', () => {
        it('delegates to ChatGatewayService.switchChat()', async () => {
            vi.mocked(mockService.switchChat).mockResolvedValue({ activeChatId: 'chat-001' });
            const definition = skill.getDefinition();
            const tool = definition.tools.find(t => t.name === 'chat_switch');
            const result = await tool.handler({ chatId: 'chat-001' });
            expect(mockService.switchChat).toHaveBeenCalledOnce();
            expect(mockService.switchChat).toHaveBeenCalledWith('chat-001');
            expect(result.success).toBe(true);
            if (result.success) {
                expect(result.data).toEqual({ activeChatId: 'chat-001' });
            }
        });
        it('returns error when chatId is missing', async () => {
            const definition = skill.getDefinition();
            const tool = definition.tools.find(t => t.name === 'chat_switch');
            const result = await tool.handler({});
            expect(result.success).toBe(false);
            if (!result.success) {
                expect(result.error).toContain('chatId');
            }
            expect(mockService.switchChat).not.toHaveBeenCalled();
        });
        it('returns error when service throws', async () => {
            vi.mocked(mockService.switchChat).mockRejectedValue(new Error('Chat not found'));
            const definition = skill.getDefinition();
            const tool = definition.tools.find(t => t.name === 'chat_switch');
            const result = await tool.handler({ chatId: 'nonexistent' });
            expect(result.success).toBe(false);
            if (!result.success) {
                expect(result.error).toBe('Chat not found');
            }
        });
    });
    // -------------------------------------------------------------------------
    // chat_archive
    // -------------------------------------------------------------------------
    describe('chat_archive', () => {
        it('delegates to ChatGatewayService.archiveChat()', async () => {
            vi.mocked(mockService.archiveChat).mockResolvedValue({ archived: true, chatId: 'chat-001' });
            const definition = skill.getDefinition();
            const tool = definition.tools.find(t => t.name === 'chat_archive');
            const result = await tool.handler({ chatId: 'chat-001' });
            expect(mockService.archiveChat).toHaveBeenCalledOnce();
            expect(mockService.archiveChat).toHaveBeenCalledWith('chat-001');
            expect(result.success).toBe(true);
            if (result.success) {
                expect(result.data).toEqual({ archived: true, chatId: 'chat-001' });
            }
        });
        it('returns error when chatId is missing', async () => {
            const definition = skill.getDefinition();
            const tool = definition.tools.find(t => t.name === 'chat_archive');
            const result = await tool.handler({});
            expect(result.success).toBe(false);
            if (!result.success) {
                expect(result.error).toContain('chatId');
            }
            expect(mockService.archiveChat).not.toHaveBeenCalled();
        });
        it('returns error when service throws', async () => {
            vi.mocked(mockService.archiveChat).mockRejectedValue(new Error('Already archived'));
            const definition = skill.getDefinition();
            const tool = definition.tools.find(t => t.name === 'chat_archive');
            const result = await tool.handler({ chatId: 'chat-001' });
            expect(result.success).toBe(false);
            if (!result.success) {
                expect(result.error).toBe('Already archived');
            }
        });
    });
    // -------------------------------------------------------------------------
    // chat_delete
    // -------------------------------------------------------------------------
    describe('chat_delete', () => {
        it('delegates to ChatGatewayService.deleteChat()', async () => {
            vi.mocked(mockService.deleteChat).mockResolvedValue({ deleted: true, chatId: 'chat-001' });
            const definition = skill.getDefinition();
            const tool = definition.tools.find(t => t.name === 'chat_delete');
            const result = await tool.handler({ chatId: 'chat-001' });
            expect(mockService.deleteChat).toHaveBeenCalledOnce();
            expect(mockService.deleteChat).toHaveBeenCalledWith('chat-001');
            expect(result.success).toBe(true);
            if (result.success) {
                expect(result.data).toEqual({ deleted: true, chatId: 'chat-001' });
            }
        });
        it('returns error when chatId is missing', async () => {
            const definition = skill.getDefinition();
            const tool = definition.tools.find(t => t.name === 'chat_delete');
            const result = await tool.handler({});
            expect(result.success).toBe(false);
            if (!result.success) {
                expect(result.error).toContain('chatId');
            }
            expect(mockService.deleteChat).not.toHaveBeenCalled();
        });
        it('returns error when service throws', async () => {
            vi.mocked(mockService.deleteChat).mockRejectedValue(new Error('Chat is active'));
            const definition = skill.getDefinition();
            const tool = definition.tools.find(t => t.name === 'chat_delete');
            const result = await tool.handler({ chatId: 'chat-001' });
            expect(result.success).toBe(false);
            if (!result.success) {
                expect(result.error).toBe('Chat is active');
            }
        });
    });
});
//# sourceMappingURL=ChatManagementSkill.test.js.map