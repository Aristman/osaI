/**
 * Integration Test -- Hook Lifecycle (T-008)
 *
 * TC-008-3: All 14 hook points called in correct order during full loop
 * TC-008-4: osaI-specific hooks (BEFORE_MEMORY_QUERY, AFTER_MEMORY_QUERY,
 *            BEFORE_FACT_EXTRACTION) called correctly
 *
 * Uses real AgentLoop, ContextAssembler, InferenceService, ToolExecutor,
 * FactExtractor, HookRegistry with mocks at external boundaries.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AgentLoop } from '../../loop/AgentLoop.js';
import { ContextAssembler } from '../../context/ContextAssembler.js';
import { InferenceService } from '../../inference/InferenceService.js';
import { ToolExecutor } from '../../loop/ToolExecutor.js';
import { FactExtractor } from '../../memory/FactExtractor.js';
import { HookRegistry } from '../../hooks/HookRegistry.js';
import { HookPoint } from '../../hooks/types.js';
// ---------------------------------------------------------------------------
// Mock LLMProvider
// ---------------------------------------------------------------------------
function createMockProvider(content = 'Test response', toolCalls, finishReason = 'stop') {
    return {
        id: 'test',
        name: 'Test',
        isAvailable: vi.fn().mockResolvedValue(true),
        complete: vi.fn().mockResolvedValue({
            content,
            toolCalls: toolCalls ?? undefined,
            usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
            model: 'glm-5',
            provider: 'z-ai',
            finishReason,
        }),
        stream: vi.fn().mockImplementation(function* () { }),
        countTokens: vi.fn().mockReturnValue(10),
        getStatus: vi.fn().mockReturnValue('available'),
    };
}
// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('Integration: Hook Lifecycle (TC-008-3, TC-008-4)', () => {
    let hooks;
    let config;
    beforeEach(() => {
        hooks = new HookRegistry();
        config = {
            systemPrompt: 'You are a helpful assistant.',
            defaultModel: 'glm-5',
        };
    });
    it('TC-008-3: hooks called in correct order for full loop without tools', async () => {
        const callOrder = [];
        // Register handlers for all hook points to track call order
        for (const hp of Object.values(HookPoint)) {
            hooks.register(hp, (ctx) => {
                callOrder.push(ctx.hookPoint);
                return ctx;
            });
        }
        const ragQuery = vi.fn().mockResolvedValue([
            { content: 'RAG result 1', score: 0.9 },
        ]);
        const provider = createMockProvider('Response text');
        const assembler = new ContextAssembler(hooks, ragQuery);
        const inferenceService = new InferenceService(provider, hooks);
        const loop = new AgentLoop(config, assembler, inferenceService, hooks);
        const input = {
            userMessage: 'Hello',
            messages: [],
            sessionId: 'session-hook-001',
            chatId: 'chat-hook-001',
        };
        await loop.run(input);
        // Verify hook call order:
        // 1. BEFORE_INTAKE (AgentLoop)
        // 2. BEFORE_CONTEXT_ASSEMBLY (ContextAssembler)
        // 3. BEFORE_MEMORY_QUERY (ContextAssembler, if RAG provided)
        // 4. AFTER_CONTEXT_ASSEMBLY (ContextAssembler)
        // 5. BEFORE_MODEL_INFERENCE (InferenceService)
        // 6. AFTER_MODEL_INFERENCE (InferenceService)
        // Note: ContextAssembler does NOT call AFTER_MEMORY_QUERY after RAG query.
        // AFTER_MEMORY_QUERY is only called by FactExtractor.
        expect(callOrder).toEqual([
            HookPoint.BEFORE_INTAKE,
            HookPoint.BEFORE_CONTEXT_ASSEMBLY,
            HookPoint.BEFORE_MEMORY_QUERY,
            HookPoint.AFTER_CONTEXT_ASSEMBLY,
            HookPoint.BEFORE_MODEL_INFERENCE,
            HookPoint.AFTER_MODEL_INFERENCE,
        ]);
    });
    it('TC-008-3: hooks called in correct order for tool execution loop', async () => {
        const callOrder = [];
        for (const hp of Object.values(HookPoint)) {
            hooks.register(hp, (ctx) => {
                callOrder.push(ctx.hookPoint);
                return ctx;
            });
        }
        // Provider that returns tool call then final response
        let callIndex = 0;
        const provider = {
            id: 'test',
            name: 'Test',
            isAvailable: vi.fn().mockResolvedValue(true),
            complete: vi.fn().mockImplementation(() => {
                callIndex++;
                if (callIndex === 1) {
                    return {
                        content: '',
                        toolCalls: [
                            { id: 'call-h-001', name: 'get_time', arguments: '{}' },
                        ],
                        usage: { promptTokens: 10, completionTokens: 10, totalTokens: 20 },
                        model: 'glm-5',
                        provider: 'z-ai',
                        finishReason: 'tool_calls',
                    };
                }
                return {
                    content: 'The time is 12:00',
                    toolCalls: undefined,
                    usage: { promptTokens: 20, completionTokens: 10, totalTokens: 30 },
                    model: 'glm-5',
                    provider: 'z-ai',
                    finishReason: 'stop',
                };
            }),
            stream: vi.fn().mockImplementation(function* () { }),
            countTokens: vi.fn().mockReturnValue(10),
            getStatus: vi.fn().mockReturnValue('available'),
        };
        const registry = {
            execute: vi.fn().mockResolvedValue({
                success: true,
                data: '12:00',
            }),
        };
        const inferenceService = new InferenceService(provider, hooks);
        const executor = new ToolExecutor(inferenceService, registry, hooks);
        const messages = [
            { role: 'user', content: 'What time is it?' },
        ];
        await executor.executeToolLoop(messages, undefined, {
            sessionId: 'session-hook-002',
            chatId: 'chat-hook-002',
            traceId: 'trace-hook-002',
        });
        // Verify order includes tool execution hooks:
        // Iteration 1:
        //   BEFORE_MODEL_INFERENCE
        //   AFTER_MODEL_INFERENCE (with tool_calls)
        //   BEFORE_TOOL_EXECUTION
        //   AFTER_TOOL_EXECUTION
        // Iteration 2:
        //   BEFORE_MODEL_INFERENCE
        //   AFTER_MODEL_INFERENCE (final)
        expect(callOrder[0]).toBe(HookPoint.BEFORE_MODEL_INFERENCE);
        expect(callOrder[1]).toBe(HookPoint.AFTER_MODEL_INFERENCE);
        expect(callOrder[2]).toBe(HookPoint.BEFORE_TOOL_EXECUTION);
        expect(callOrder[3]).toBe(HookPoint.AFTER_TOOL_EXECUTION);
        expect(callOrder[4]).toBe(HookPoint.BEFORE_MODEL_INFERENCE);
        expect(callOrder[5]).toBe(HookPoint.AFTER_MODEL_INFERENCE);
    });
    it('TC-008-4: BEFORE_FACT_EXTRACTION and AFTER_MEMORY_QUERY hooks called in fact extraction', async () => {
        const hookCalls = [];
        hooks.register(HookPoint.BEFORE_FACT_EXTRACTION, (ctx) => {
            hookCalls.push(ctx.hookPoint);
            return ctx;
        });
        hooks.register(HookPoint.AFTER_MEMORY_QUERY, (ctx) => {
            hookCalls.push(ctx.hookPoint);
            return ctx;
        });
        const storeFacts = vi.fn().mockResolvedValue(undefined);
        const extractor = new FactExtractor(hooks, storeFacts);
        await extractor.extract('My name is Alice. The deadline is 2026-06-01.', 'chat-hook-003', 'session-hook-003');
        expect(hookCalls).toEqual([
            HookPoint.BEFORE_FACT_EXTRACTION,
            HookPoint.AFTER_MEMORY_QUERY,
        ]);
    });
    it('should pass correct correlation IDs through all hooks', async () => {
        const capturedContexts = [];
        for (const hp of Object.values(HookPoint)) {
            hooks.register(hp, (ctx) => {
                capturedContexts.push(ctx);
                return ctx;
            });
        }
        const ragQuery = vi.fn().mockResolvedValue([]);
        const provider = createMockProvider('OK');
        const assembler = new ContextAssembler(hooks, ragQuery);
        const inferenceService = new InferenceService(provider, hooks);
        const loop = new AgentLoop(config, assembler, inferenceService, hooks);
        const input = {
            userMessage: 'Test',
            messages: [],
            sessionId: 'session-corr-001',
            chatId: 'chat-corr-001',
            traceId: 'trace-corr-001',
        };
        await loop.run(input);
        // All hooks should have consistent correlation IDs
        for (const ctx of capturedContexts) {
            expect(ctx.sessionId).toBe('session-corr-001');
            expect(ctx.chatId).toBe('chat-corr-001');
            expect(ctx.traceId).toBe('trace-corr-001');
        }
    });
});
//# sourceMappingURL=hook-lifecycle.test.js.map