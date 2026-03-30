/**
 * @osai/agent -- ContextAssembler Unit Tests
 *
 * Test cases TC-002-1 through TC-002-6 from ROADMAP_TASKS_F-008.md.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { HookRegistry } from '../../hooks/HookRegistry.js';
import { HookPoint } from '../../hooks/types.js';
import { ContextAssembler } from '../ContextAssembler.js';
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeInput(overrides = {}) {
    return {
        userMessage: 'What is the weather today?',
        systemPrompt: 'You are a helpful assistant.',
        messages: [],
        sessionId: 'sess-001',
        chatId: 'chat-001',
        traceId: 'trace-001',
        ...overrides,
    };
}
// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('ContextAssembler', () => {
    let hooks;
    beforeEach(() => {
        hooks = new HookRegistry();
    });
    // -----------------------------------------------------------------------
    // TC-002-1: Forms messages array from chat history
    // -----------------------------------------------------------------------
    describe('TC-002-1: forms messages array from chat history', () => {
        it('should include chat history messages between system and user', async () => {
            const assembler = new ContextAssembler(hooks);
            const input = makeInput({
                messages: [
                    { role: 'user', content: 'Hello' },
                    { role: 'assistant', content: 'Hi there!' },
                    { role: 'user', content: 'How are you?' },
                    { role: 'assistant', content: 'I am fine.' },
                ],
            });
            const result = await assembler.assemble(input);
            // system + 4 history + 1 user = 6
            expect(result.messages).toHaveLength(6);
            expect(result.messages[0].role).toBe('system');
            expect(result.messages[1].role).toBe('user');
            expect(result.messages[1].content).toBe('Hello');
            expect(result.messages[2].role).toBe('assistant');
            expect(result.messages[2].content).toBe('Hi there!');
            expect(result.messages[3].role).toBe('user');
            expect(result.messages[3].content).toBe('How are you?');
            expect(result.messages[4].role).toBe('assistant');
            expect(result.messages[4].content).toBe('I am fine.');
            expect(result.messages[5].role).toBe('user');
            expect(result.messages[5].content).toBe('What is the weather today?');
        });
        it('should preserve history order exactly', async () => {
            const assembler = new ContextAssembler(hooks);
            const input = makeInput({
                messages: [
                    { role: 'user', content: 'First' },
                    { role: 'assistant', content: 'Second' },
                    { role: 'user', content: 'Third' },
                ],
            });
            const result = await assembler.assemble(input);
            const contents = result.messages.map((m) => m.content);
            expect(contents).toEqual([
                'You are a helpful assistant.',
                'First',
                'Second',
                'Third',
                'What is the weather today?',
            ]);
        });
    });
    // -----------------------------------------------------------------------
    // TC-002-2: Calls BEFORE_MEMORY_QUERY hook
    // -----------------------------------------------------------------------
    describe('TC-002-2: calls BEFORE_MEMORY_QUERY hook', () => {
        it('should call before_memory_query hook with user message when RAG is provided', async () => {
            let hookCalled = false;
            let capturedQuery = '';
            hooks.register(HookPoint.BEFORE_MEMORY_QUERY, (ctx) => {
                hookCalled = true;
                capturedQuery = ctx.data.query;
                return ctx;
            });
            const mockRAG = async (_query) => [];
            const assembler = new ContextAssembler(hooks, mockRAG);
            const input = makeInput();
            await assembler.assemble(input);
            expect(hookCalled).toBe(true);
            expect(capturedQuery).toBe('What is the weather today?');
        });
        it('should NOT call before_memory_query hook when RAG is not provided', async () => {
            let hookCalled = false;
            hooks.register(HookPoint.BEFORE_MEMORY_QUERY, () => {
                hookCalled = true;
                throw new Error('should not be called');
            });
            const assembler = new ContextAssembler(hooks);
            const input = makeInput();
            await assembler.assemble(input);
            expect(hookCalled).toBe(false);
        });
    });
    // -----------------------------------------------------------------------
    // TC-002-3: Injects RAG results into system prompt
    // -----------------------------------------------------------------------
    describe('TC-002-3: injects RAG results into system prompt', () => {
        it('should include ## Relevant Memory section in system prompt', async () => {
            const mockRAG = async (_query) => [
                { content: 'User prefers dark mode.', score: 0.92 },
                { content: 'User is a TypeScript developer.', score: 0.85 },
            ];
            const assembler = new ContextAssembler(hooks, mockRAG);
            const input = makeInput();
            const result = await assembler.assemble(input);
            const systemContent = result.messages[0].content;
            expect(systemContent).toContain('## Relevant Memory');
            expect(systemContent).toContain('User prefers dark mode.');
            expect(systemContent).toContain('User is a TypeScript developer.');
            expect(result.ragResultCount).toBe(2);
            expect(result.ragQueried).toBe(true);
        });
        it('should not add RAG section when RAG returns empty results', async () => {
            const mockRAG = async (_query) => [];
            const assembler = new ContextAssembler(hooks, mockRAG);
            const input = makeInput();
            const result = await assembler.assemble(input);
            const systemContent = result.messages[0].content;
            expect(systemContent).not.toContain('## Relevant Memory');
            expect(result.ragResultCount).toBe(0);
        });
    });
    // -----------------------------------------------------------------------
    // TC-002-4: Calls AFTER_CONTEXT_ASSEMBLY hook
    // -----------------------------------------------------------------------
    describe('TC-002-4: calls AFTER_CONTEXT_ASSEMBLY hook', () => {
        it('should call after_context_assembly hook before returning', async () => {
            let hookCalled = false;
            hooks.register(HookPoint.AFTER_CONTEXT_ASSEMBLY, (ctx) => {
                hookCalled = true;
                expect(ctx.data.systemPrompt).toContain('You are a helpful assistant.');
                return ctx;
            });
            const assembler = new ContextAssembler(hooks);
            const input = makeInput();
            await assembler.assemble(input);
            expect(hookCalled).toBe(true);
        });
        it('should allow hook to modify the system prompt', async () => {
            hooks.register(HookPoint.AFTER_CONTEXT_ASSEMBLY, (ctx) => {
                ctx.data.systemPrompt = 'Modified system prompt.';
                return ctx;
            });
            const assembler = new ContextAssembler(hooks);
            const input = makeInput();
            const result = await assembler.assemble(input);
            expect(result.messages[0].content).toBe('Modified system prompt.');
        });
        it('should include ragResultCount in after_context_assembly context', async () => {
            const mockRAG = async (_query) => [
                { content: 'Fact 1', score: 0.9 },
            ];
            let capturedRagCount = -1;
            hooks.register(HookPoint.AFTER_CONTEXT_ASSEMBLY, (ctx) => {
                capturedRagCount = ctx.data.ragResultCount;
                return ctx;
            });
            const assembler = new ContextAssembler(hooks, mockRAG);
            const input = makeInput();
            await assembler.assemble(input);
            expect(capturedRagCount).toBe(1);
        });
    });
    // -----------------------------------------------------------------------
    // TC-002-5: Works correctly without RAG
    // -----------------------------------------------------------------------
    describe('TC-002-5: works correctly without RAG', () => {
        it('should produce messages without RAG section', async () => {
            const assembler = new ContextAssembler(hooks);
            const input = makeInput();
            const result = await assembler.assemble(input);
            expect(result.messages).toHaveLength(2); // system + user
            expect(result.messages[0].content).not.toContain('## Relevant Memory');
            expect(result.ragResultCount).toBe(0);
            expect(result.ragQueried).toBe(false);
        });
        it('should handle RAG failure gracefully and still return messages', async () => {
            const failingRAG = async (_query) => {
                throw new Error('Memory system unavailable');
            };
            const assembler = new ContextAssembler(hooks, failingRAG);
            const input = makeInput();
            const result = await assembler.assemble(input);
            // Should still return valid result, just without RAG content.
            expect(result.messages).toHaveLength(2);
            expect(result.messages[0].content).not.toContain('## Relevant Memory');
            expect(result.ragResultCount).toBe(0);
            expect(result.ragQueried).toBe(true);
        });
        it('should include chat history even without RAG', async () => {
            const assembler = new ContextAssembler(hooks);
            const input = makeInput({
                messages: [
                    { role: 'user', content: 'Previous question' },
                    { role: 'assistant', content: 'Previous answer' },
                ],
            });
            const result = await assembler.assemble(input);
            expect(result.messages).toHaveLength(4); // system + 2 history + user
            expect(result.messages[1].content).toBe('Previous question');
            expect(result.messages[2].content).toBe('Previous answer');
        });
    });
    // -----------------------------------------------------------------------
    // TC-002-6: Empty chat history -> only system + user
    // -----------------------------------------------------------------------
    describe('TC-002-6: empty chat history produces system + user only', () => {
        it('should return only system and user messages when history is empty', async () => {
            const assembler = new ContextAssembler(hooks);
            const input = makeInput({
                messages: [],
            });
            const result = await assembler.assemble(input);
            expect(result.messages).toHaveLength(2);
            expect(result.messages[0].role).toBe('system');
            expect(result.messages[0].content).toBe('You are a helpful assistant.');
            expect(result.messages[1].role).toBe('user');
            expect(result.messages[1].content).toBe('What is the weather today?');
        });
    });
    // -----------------------------------------------------------------------
    // Additional: BEFORE_CONTEXT_ASSEMBLY hook
    // -----------------------------------------------------------------------
    describe('BEFORE_CONTEXT_ASSEMBLY hook integration', () => {
        it('should call before_context_assembly hook first', async () => {
            const callOrder = [];
            hooks.register(HookPoint.BEFORE_CONTEXT_ASSEMBLY, (ctx) => {
                callOrder.push('before_context_assembly');
                return ctx;
            });
            hooks.register(HookPoint.BEFORE_MEMORY_QUERY, (ctx) => {
                callOrder.push('before_memory_query');
                return ctx;
            });
            hooks.register(HookPoint.AFTER_CONTEXT_ASSEMBLY, (ctx) => {
                callOrder.push('after_context_assembly');
                return ctx;
            });
            const mockRAG = async (_q) => [];
            const assembler = new ContextAssembler(hooks, mockRAG);
            const input = makeInput();
            await assembler.assemble(input);
            expect(callOrder).toEqual([
                'before_context_assembly',
                'before_memory_query',
                'after_context_assembly',
            ]);
        });
        it('should allow before_context_assembly to modify system prompt', async () => {
            hooks.register(HookPoint.BEFORE_CONTEXT_ASSEMBLY, (ctx) => {
                ctx.data.systemPrompt = 'Custom system prompt from hook.';
                return ctx;
            });
            const assembler = new ContextAssembler(hooks);
            const input = makeInput();
            const result = await assembler.assemble(input);
            expect(result.messages[0].content).toBe('Custom system prompt from hook.');
        });
    });
    // -----------------------------------------------------------------------
    // Additional: HookContext correlation IDs
    // -----------------------------------------------------------------------
    describe('hook context correlation IDs', () => {
        it('should pass correct correlation IDs in all hooks', async () => {
            const capturedContexts = [];
            hooks.register(HookPoint.BEFORE_CONTEXT_ASSEMBLY, (ctx) => {
                capturedContexts.push({
                    hook: 'before_context_assembly',
                    sessionId: ctx.sessionId,
                    chatId: ctx.chatId,
                    traceId: ctx.traceId,
                });
                return ctx;
            });
            hooks.register(HookPoint.AFTER_CONTEXT_ASSEMBLY, (ctx) => {
                capturedContexts.push({
                    hook: 'after_context_assembly',
                    sessionId: ctx.sessionId,
                    chatId: ctx.chatId,
                    traceId: ctx.traceId,
                });
                return ctx;
            });
            const assembler = new ContextAssembler(hooks);
            const input = makeInput({
                sessionId: 'my-session',
                chatId: 'my-chat',
                traceId: 'my-trace',
            });
            await assembler.assemble(input);
            for (const captured of capturedContexts) {
                expect(captured.sessionId).toBe('my-session');
                expect(captured.chatId).toBe('my-chat');
                expect(captured.traceId).toBe('my-trace');
            }
        });
    });
});
//# sourceMappingURL=ContextAssembler.test.js.map