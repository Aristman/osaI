/**
 * Integration Test -- Full Agent Loop (T-008)
 *
 * TC-008-1: Full loop without tools
 *   user message -> context assembly -> inference -> response
 *
 * Uses real AgentLoop, ContextAssembler, InferenceService, HookRegistry
 * with mocks only at external boundaries (LLMProvider, SkillRegistry).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AgentLoop } from '../../loop/AgentLoop.js';
import { ContextAssembler } from '../../context/ContextAssembler.js';
import { InferenceService } from '../../inference/InferenceService.js';
import { HookRegistry } from '../../hooks/HookRegistry.js';
import { HookPoint } from '../../hooks/types.js';
// ---------------------------------------------------------------------------
// Mock LLMProvider
// ---------------------------------------------------------------------------
function createMockLLMProvider(responseContent, model = 'glm-5', provider = 'z-ai') {
    return {
        id: provider,
        name: provider,
        isAvailable: vi.fn().mockResolvedValue(true),
        complete: vi.fn().mockResolvedValue({
            content: responseContent,
            toolCalls: undefined,
            usage: {
                promptTokens: 50,
                completionTokens: 100,
                totalTokens: 150,
            },
            model,
            provider,
            finishReason: 'stop',
        }),
        stream: vi.fn().mockImplementation(function* () {
            // Not used in non-streaming tests
        }),
        countTokens: vi.fn().mockReturnValue(10),
        getStatus: vi.fn().mockReturnValue('available'),
    };
}
// ---------------------------------------------------------------------------
// Mock RAG Query
// ---------------------------------------------------------------------------
function createMockRAGQuery(results = []) {
    return vi.fn().mockResolvedValue(results);
}
// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('Integration: Full Agent Loop (TC-008-1)', () => {
    let hooks;
    let provider;
    let config;
    beforeEach(() => {
        hooks = new HookRegistry();
        provider = createMockLLMProvider('Hello! I can help you with that.');
        config = {
            systemPrompt: 'You are a helpful assistant.',
            defaultModel: 'glm-5',
            defaultTemperature: 0.7,
            defaultMaxTokens: 1000,
        };
    });
    it('should complete full pipeline: user message -> context -> inference -> response', async () => {
        const ragQuery = createMockRAGQuery();
        const assembler = new ContextAssembler(hooks, ragQuery);
        const inferenceService = new InferenceService(provider, hooks);
        const loop = new AgentLoop(config, assembler, inferenceService, hooks);
        const input = {
            userMessage: 'Tell me about TypeScript',
            messages: [],
            sessionId: 'session-int-001',
            chatId: 'chat-int-001',
            traceId: 'trace-int-001',
        };
        const result = await loop.run(input);
        // Verify pipeline completed
        expect(result.isError).toBe(false);
        expect(result.content).toBe('Hello! I can help you with that.');
        expect(result.hasToolCalls).toBe(false);
        expect(result.model).toBe('glm-5');
        expect(result.provider).toBe('z-ai');
        expect(result.usage.totalTokens).toBe(150);
        expect(result.traceId).toBe('trace-int-001');
    });
    it('should pass through chat history to context assembly', async () => {
        const ragQuery = createMockRAGQuery();
        const assembler = new ContextAssembler(hooks, ragQuery);
        const inferenceService = new InferenceService(provider, hooks);
        const loop = new AgentLoop(config, assembler, inferenceService, hooks);
        const history = [
            { role: 'user', content: 'Previous question' },
            { role: 'assistant', content: 'Previous answer' },
        ];
        const input = {
            userMessage: 'Follow-up question',
            messages: history,
            sessionId: 'session-002',
            chatId: 'chat-002',
        };
        const result = await loop.run(input);
        expect(result.isError).toBe(false);
        // Verify provider.complete was called with messages including history
        expect(provider.complete).toHaveBeenCalledTimes(1);
        const callArgs = provider.complete.mock.calls[0][0];
        // Should have: system + history (2 messages) + user = 4 messages
        expect(callArgs.messages.length).toBe(4);
    });
    it('should inject RAG results into context', async () => {
        const ragResults = [
            { content: 'TypeScript is a typed superset of JavaScript', score: 0.95 },
            { content: 'TypeScript was developed by Microsoft', score: 0.87 },
        ];
        const ragQuery = createMockRAGQuery(ragResults);
        const assembler = new ContextAssembler(hooks, ragQuery);
        const inferenceService = new InferenceService(provider, hooks);
        const loop = new AgentLoop(config, assembler, inferenceService, hooks);
        const input = {
            userMessage: 'What is TypeScript?',
            messages: [],
            sessionId: 'session-003',
            chatId: 'chat-003',
        };
        const result = await loop.run(input);
        expect(result.isError).toBe(false);
        expect(result.ragResultCount).toBe(2);
        // Verify RAG was queried
        expect(ragQuery).toHaveBeenCalledTimes(1);
        expect(ragQuery).toHaveBeenCalledWith('What is TypeScript?');
    });
    it('should work without RAG query function', async () => {
        const assembler = new ContextAssembler(hooks); // No RAG query
        const inferenceService = new InferenceService(provider, hooks);
        const loop = new AgentLoop(config, assembler, inferenceService, hooks);
        const input = {
            userMessage: 'Hello',
            messages: [],
            sessionId: 'session-004',
            chatId: 'chat-004',
        };
        const result = await loop.run(input);
        expect(result.isError).toBe(false);
        expect(result.ragResultCount).toBe(0);
    });
});
//# sourceMappingURL=agent-loop.test.js.map