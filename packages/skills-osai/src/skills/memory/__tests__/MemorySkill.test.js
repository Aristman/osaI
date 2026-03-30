/**
 * @osai/skills-osai -- Memory Skill Unit Tests
 *
 * TC-007-1: remember delegates to MemoryService.store()
 * TC-007-2: recall delegates to MemoryService.query()
 * TC-007-3: forget delegates to MemoryService.forget()
 * TC-007-4: summarize_session delegates to MemoryService (placeholder)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
// ---------------------------------------------------------------------------
// Mock MemoryService (vi.mock)
// ---------------------------------------------------------------------------
const mockStore = vi.fn();
const mockQuery = vi.fn();
const mockForget = vi.fn();
vi.mock('@osai/memory', () => ({
    MemoryService: vi.fn().mockImplementation(() => ({
        store: mockStore,
        query: mockQuery,
        forget: mockForget,
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
import { MemorySkill } from '../MemorySkill.js';
import { MemoryService } from '@osai/memory';
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function createMockStoredEntry(overrides) {
    const now = new Date().toISOString();
    return {
        id: overrides?.id ?? crypto.randomUUID(),
        content: overrides?.content ?? 'test memory content',
        category: 'fact',
        tier: 'long-term',
        tags: overrides?.tags ?? [],
        createdAt: now,
        updatedAt: now,
        ...overrides,
    };
}
function createMockRAGResult(overrides) {
    return {
        entry: createMockStoredEntry(overrides?.entry),
        similarity: overrides?.similarity ?? 0.95,
        rank: overrides?.rank ?? 0,
        ...overrides,
    };
}
// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('MemorySkill', () => {
    let skill;
    beforeEach(() => {
        vi.clearAllMocks();
        skill = new MemorySkill({
            memoryService: new MemoryService(),
        });
    });
    // -------------------------------------------------------------------------
    // getDefinition
    // -------------------------------------------------------------------------
    describe('getDefinition', () => {
        it('returns a valid SkillDefinition', () => {
            const definition = skill.getDefinition();
            expect(definition.name).toBe('memory');
            expect(definition.version).toBe('1.0.0');
            expect(definition.category).toBe('osaI');
            expect(definition.enabled).toBe(true);
            expect(definition.tools).toHaveLength(4);
        });
        it('has correct tool names', () => {
            const definition = skill.getDefinition();
            const toolNames = definition.tools.map((t) => t.name);
            expect(toolNames).toContain('remember');
            expect(toolNames).toContain('recall');
            expect(toolNames).toContain('forget');
            expect(toolNames).toContain('summarize_session');
        });
        it('has all tools with confirm permission', () => {
            const definition = skill.getDefinition();
            for (const toolName of Object.keys(definition.permissions)) {
                expect(definition.permissions[toolName]).toBe('confirm');
            }
        });
        it('tools have valid JSON Schema parameters', () => {
            const definition = skill.getDefinition();
            for (const tool of definition.tools) {
                expect(tool.parameters.type).toBe('object');
                expect(tool.parameters.properties).toBeDefined();
                expect(tool.parameters.required).toBeDefined();
            }
        });
    });
    // -------------------------------------------------------------------------
    // TC-007-1: remember
    // -------------------------------------------------------------------------
    describe('remember (TC-007-1)', () => {
        it('delegates to MemoryService.store() with correct parameters', async () => {
            const storedEntry = createMockStoredEntry({ content: 'User prefers dark mode' });
            mockStore.mockResolvedValue(storedEntry);
            const definition = skill.getDefinition();
            const tool = definition.tools.find((t) => t.name === 'remember');
            const result = await tool.handler({ content: 'User prefers dark mode', tags: ['preference'] });
            expect(mockStore).toHaveBeenCalledOnce();
            expect(result.success).toBe(true);
            if (result.success) {
                expect(result.data).toHaveProperty('id');
                expect(result.data).toHaveProperty('content', 'User prefers dark mode');
            }
        });
        it('stores with long-term tier', async () => {
            const storedEntry = createMockStoredEntry();
            mockStore.mockResolvedValue(storedEntry);
            const definition = skill.getDefinition();
            const tool = definition.tools.find((t) => t.name === 'remember');
            await tool.handler({ content: 'test content' });
            // Verify store was called with long-term tier
            const callArgs = mockStore.mock.calls[0];
            expect(callArgs[1]).toBe('long-term');
            expect(callArgs[0].tier).toBe('long-term');
        });
        it('uses provided tags', async () => {
            const storedEntry = createMockStoredEntry();
            mockStore.mockResolvedValue(storedEntry);
            const definition = skill.getDefinition();
            const tool = definition.tools.find((t) => t.name === 'remember');
            await tool.handler({ content: 'test', tags: ['tag1', 'tag2'] });
            const callArgs = mockStore.mock.calls[0];
            expect(callArgs[0].tags).toEqual(['tag1', 'tag2']);
        });
        it('uses empty tags when not provided', async () => {
            const storedEntry = createMockStoredEntry();
            mockStore.mockResolvedValue(storedEntry);
            const definition = skill.getDefinition();
            const tool = definition.tools.find((t) => t.name === 'remember');
            await tool.handler({ content: 'test' });
            const callArgs = mockStore.mock.calls[0];
            expect(callArgs[0].tags).toEqual([]);
        });
        it('returns error when content is missing', async () => {
            const definition = skill.getDefinition();
            const tool = definition.tools.find((t) => t.name === 'remember');
            const result = await tool.handler({});
            expect(result.success).toBe(false);
            if (!result.success) {
                expect(result.error).toContain('content');
            }
            expect(mockStore).not.toHaveBeenCalled();
        });
        it('returns error when MemoryService.store() throws', async () => {
            mockStore.mockRejectedValue(new Error('Database connection failed'));
            const definition = skill.getDefinition();
            const tool = definition.tools.find((t) => t.name === 'remember');
            const result = await tool.handler({ content: 'test' });
            expect(result.success).toBe(false);
            if (!result.success) {
                expect(result.error).toBe('Database connection failed');
            }
        });
    });
    // -------------------------------------------------------------------------
    // TC-007-2: recall
    // -------------------------------------------------------------------------
    describe('recall (TC-007-2)', () => {
        it('delegates to MemoryService.query() with correct parameters', async () => {
            const ragResults = [createMockRAGResult({ similarity: 0.95 })];
            mockQuery.mockResolvedValue(ragResults);
            const definition = skill.getDefinition();
            const tool = definition.tools.find((t) => t.name === 'recall');
            const result = await tool.handler({ query: 'user preferences' });
            expect(mockQuery).toHaveBeenCalledOnce();
            expect(result.success).toBe(true);
            if (result.success) {
                const data = result.data;
                expect(data).toHaveLength(1);
                expect(data[0].score).toBe(0.95);
            }
        });
        it('passes topK option to query', async () => {
            mockQuery.mockResolvedValue([]);
            const definition = skill.getDefinition();
            const tool = definition.tools.find((t) => t.name === 'recall');
            await tool.handler({ query: 'test', topK: 3 });
            expect(mockQuery).toHaveBeenCalledWith('test', { topK: 3 });
        });
        it('uses default topK=5 when not provided', async () => {
            mockQuery.mockResolvedValue([]);
            const definition = skill.getDefinition();
            const tool = definition.tools.find((t) => t.name === 'recall');
            await tool.handler({ query: 'test' });
            expect(mockQuery).toHaveBeenCalledWith('test', { topK: 5 });
        });
        it('returns multiple results', async () => {
            const ragResults = [
                createMockRAGResult({ similarity: 0.95 }),
                createMockRAGResult({ similarity: 0.87 }),
                createMockRAGResult({ similarity: 0.72 }),
            ];
            mockQuery.mockResolvedValue(ragResults);
            const definition = skill.getDefinition();
            const tool = definition.tools.find((t) => t.name === 'recall');
            const result = await tool.handler({ query: 'test' });
            expect(result.success).toBe(true);
            if (result.success) {
                const data = result.data;
                expect(data).toHaveLength(3);
            }
        });
        it('returns empty array when no results', async () => {
            mockQuery.mockResolvedValue([]);
            const definition = skill.getDefinition();
            const tool = definition.tools.find((t) => t.name === 'recall');
            const result = await tool.handler({ query: 'nonexistent' });
            expect(result.success).toBe(true);
            if (result.success) {
                const data = result.data;
                expect(data).toHaveLength(0);
            }
        });
        it('returns error when query is missing', async () => {
            const definition = skill.getDefinition();
            const tool = definition.tools.find((t) => t.name === 'recall');
            const result = await tool.handler({});
            expect(result.success).toBe(false);
            if (!result.success) {
                expect(result.error).toContain('query');
            }
            expect(mockQuery).not.toHaveBeenCalled();
        });
        it('returns error when MemoryService.query() throws', async () => {
            mockQuery.mockRejectedValue(new Error('Embedding service unavailable'));
            const definition = skill.getDefinition();
            const tool = definition.tools.find((t) => t.name === 'recall');
            const result = await tool.handler({ query: 'test' });
            expect(result.success).toBe(false);
            if (!result.success) {
                expect(result.error).toBe('Embedding service unavailable');
            }
        });
    });
    // -------------------------------------------------------------------------
    // TC-007-3: forget
    // -------------------------------------------------------------------------
    describe('forget (TC-007-3)', () => {
        it('delegates to MemoryService.forget() with correct ID', async () => {
            mockForget.mockResolvedValue(true);
            const definition = skill.getDefinition();
            const tool = definition.tools.find((t) => t.name === 'forget');
            const result = await tool.handler({ memoryId: 'mem-123' });
            expect(mockForget).toHaveBeenCalledOnce();
            expect(mockForget).toHaveBeenCalledWith('mem-123');
            expect(result.success).toBe(true);
            if (result.success) {
                expect(result.data).toEqual({ deleted: true });
            }
        });
        it('returns deleted=false when memory not found', async () => {
            mockForget.mockResolvedValue(false);
            const definition = skill.getDefinition();
            const tool = definition.tools.find((t) => t.name === 'forget');
            const result = await tool.handler({ memoryId: 'nonexistent-id' });
            expect(result.success).toBe(true);
            if (result.success) {
                expect(result.data).toEqual({ deleted: false });
            }
        });
        it('returns error when memoryId is missing', async () => {
            const definition = skill.getDefinition();
            const tool = definition.tools.find((t) => t.name === 'forget');
            const result = await tool.handler({});
            expect(result.success).toBe(false);
            if (!result.success) {
                expect(result.error).toContain('memoryId');
            }
            expect(mockForget).not.toHaveBeenCalled();
        });
        it('returns error when MemoryService.forget() throws', async () => {
            mockForget.mockRejectedValue(new Error('Storage locked'));
            const definition = skill.getDefinition();
            const tool = definition.tools.find((t) => t.name === 'forget');
            const result = await tool.handler({ memoryId: 'mem-123' });
            expect(result.success).toBe(false);
            if (!result.success) {
                expect(result.error).toBe('Storage locked');
            }
        });
    });
    // -------------------------------------------------------------------------
    // TC-007-4: summarize_session
    // -------------------------------------------------------------------------
    describe('summarize_session (TC-007-4)', () => {
        it('delegates to MemoryService.query() with session context (placeholder)', async () => {
            const ragResults = [createMockRAGResult({ similarity: 0.88 })];
            mockQuery.mockResolvedValue(ragResults);
            const definition = skill.getDefinition();
            const tool = definition.tools.find((t) => t.name === 'summarize_session');
            const result = await tool.handler({ sessionId: 'session-456' });
            // Placeholder delegates to query()
            expect(mockQuery).toHaveBeenCalledOnce();
            expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining('session-456'), { topK: 10 });
            expect(result.success).toBe(true);
            if (result.success) {
                const data = result.data;
                expect(data.sessionId).toBe('session-456');
                expect(data.summary).toContain('session-456');
                expect(data.facts).toHaveLength(1);
            }
        });
        it('returns empty facts when no session memories found', async () => {
            mockQuery.mockResolvedValue([]);
            const definition = skill.getDefinition();
            const tool = definition.tools.find((t) => t.name === 'summarize_session');
            const result = await tool.handler({ sessionId: 'empty-session' });
            expect(result.success).toBe(true);
            if (result.success) {
                const data = result.data;
                expect(data.facts).toHaveLength(0);
            }
        });
        it('returns error when sessionId is missing', async () => {
            const definition = skill.getDefinition();
            const tool = definition.tools.find((t) => t.name === 'summarize_session');
            const result = await tool.handler({});
            expect(result.success).toBe(false);
            if (!result.success) {
                expect(result.error).toContain('sessionId');
            }
            expect(mockQuery).not.toHaveBeenCalled();
        });
        it('returns error when MemoryService.query() throws', async () => {
            mockQuery.mockRejectedValue(new Error('Service unavailable'));
            const definition = skill.getDefinition();
            const tool = definition.tools.find((t) => t.name === 'summarize_session');
            const result = await tool.handler({ sessionId: 'session-456' });
            expect(result.success).toBe(false);
            if (!result.success) {
                expect(result.error).toBe('Service unavailable');
            }
        });
    });
});
//# sourceMappingURL=MemorySkill.test.js.map