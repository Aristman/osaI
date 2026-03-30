/**
 * Unit tests for AgentLoop
 *
 * Covers: T-004 Agent Loop Core acceptance criteria
 *   - TC-004-1: run() executes full pipeline
 *   - TC-004-2: BEFORE_INTAKE hook called at start
 *   - TC-004-3: agent_end hook called on success
 *   - TC-004-4: on_error hook called on inference error
 *   - TC-004-5: Context assembly error does not crash loop
 *   - TC-004-6: Inference error does not crash loop
 *   - TC-004-7: trace_id preserved through pipeline
 *
 * Mock strategy: ContextAssembler and InferenceService are fully mocked.
 * HookRegistry is real (lightweight, no external deps).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AgentLoop } from '../AgentLoop.js';
import { HookRegistry } from '../../hooks/HookRegistry.js';
import { HookPoint } from '../../hooks/types.js';
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function createTestConfig(overrides) {
    return {
        systemPrompt: 'You are a helpful assistant.',
        ...overrides,
    };
}
function createTestInput(overrides) {
    return {
        userMessage: 'Hello, agent!',
        messages: [],
        sessionId: 'session-001',
        chatId: 'chat-001',
        traceId: 'trace-001',
        ...overrides,
    };
}
function createMockAssemblyResult(overrides) {
    return {
        messages: [
            { role: 'system', content: 'You are a helpful assistant.' },
            { role: 'user', content: 'Hello, agent!' },
        ],
        ragResultCount: 0,
        ragQueried: false,
        ...overrides,
    };
}
function createMockInferenceResult(overrides) {
    return {
        content: 'Hello! How can I help you today?',
        hasToolCalls: false,
        usage: {
            promptTokens: 10,
            completionTokens: 20,
            totalTokens: 30,
        },
        model: 'glm-5',
        provider: 'z-ai',
        finishReason: 'stop',
        ...overrides,
    };
}
function createMockContextAssembler(result) {
    const assemblyResult = result ?? createMockAssemblyResult();
    return {
        assemble: vi.fn().mockResolvedValue(assemblyResult),
    };
}
function createMockInferenceService(result) {
    const inferenceResult = result ?? createMockInferenceResult();
    return {
        infer: vi.fn().mockResolvedValue(inferenceResult),
        inferStream: vi.fn(),
    };
}
// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('AgentLoop', () => {
    let hooks;
    let mockContextAssembler;
    let mockInferenceService;
    let config;
    beforeEach(() => {
        hooks = new HookRegistry();
        config = createTestConfig();
        mockContextAssembler = createMockContextAssembler();
        mockInferenceService = createMockInferenceService();
    });
    // -----------------------------------------------------------------------
    // TC-004-1: run() executes full pipeline
    // -----------------------------------------------------------------------
    describe('TC-004-1: run() executes full pipeline', () => {
        it('should return AgentLoopOutput with content, usage, model, provider', async () => {
            const loop = new AgentLoop(config, mockContextAssembler, mockInferenceService, hooks);
            const input = createTestInput();
            const result = await loop.run(input);
            expect(result).toBeDefined();
            expect(result.content).toBe('Hello! How can I help you today?');
            expect(result.model).toBe('glm-5');
            expect(result.provider).toBe('z-ai');
            expect(result.usage).toEqual({
                promptTokens: 10,
                completionTokens: 20,
                totalTokens: 30,
            });
            expect(result.isError).toBe(false);
            expect(result.hasToolCalls).toBe(false);
        });
        it('should call context.assemble() and inference.infer() in order', async () => {
            const callOrder = [];
            const assembler = createMockContextAssembler();
            const assemblerSpy = vi.spyOn(assembler, 'assemble').mockImplementation(async () => {
                callOrder.push('assemble');
                return createMockAssemblyResult();
            });
            const inferencer = createMockInferenceService();
            const inferencerSpy = vi.spyOn(inferencer, 'infer').mockImplementation(async () => {
                callOrder.push('infer');
                return createMockInferenceResult();
            });
            const loop = new AgentLoop(config, assembler, inferencer, hooks);
            const input = createTestInput();
            await loop.run(input);
            expect(callOrder).toEqual(['assemble', 'infer']);
            expect(assemblerSpy).toHaveBeenCalledTimes(1);
            expect(inferencerSpy).toHaveBeenCalledTimes(1);
        });
        it('should pass correct parameters to context.assemble()', async () => {
            const assembler = createMockContextAssembler();
            const assemblerSpy = vi.spyOn(assembler, 'assemble');
            const loop = new LoopWithAssembler(config, assembler, mockInferenceService, hooks);
            const input = createTestInput({
                userMessage: 'Test message',
                sessionId: 'sess-abc',
                chatId: 'chat-xyz',
                traceId: 'trace-123',
            });
            await loop.run(input);
            expect(assemblerSpy).toHaveBeenCalledWith(expect.objectContaining({
                userMessage: 'Test message',
                systemPrompt: 'You are a helpful assistant.',
                sessionId: 'sess-abc',
                chatId: 'chat-xyz',
                traceId: 'trace-123',
            }));
        });
        it('should pass assembled messages to inference.infer()', async () => {
            const assemblyResult = createMockAssemblyResult({
                messages: [
                    { role: 'system', content: 'Custom system prompt.' },
                    { role: 'user', content: 'Hello, agent!' },
                ],
            });
            const assembler = createMockContextAssembler(assemblyResult);
            const inferencer = createMockInferenceService();
            const inferencerSpy = vi.spyOn(inferencer, 'infer');
            const loop = new LoopWithAssembler(config, assembler, inferencer, hooks);
            const input = createTestInput();
            await loop.run(input);
            expect(inferencerSpy).toHaveBeenCalledWith(expect.objectContaining({
                messages: assemblyResult.messages,
            }));
        });
        it('should pass config defaults to inference.infer()', async () => {
            const inferencer = createMockInferenceService();
            const inferencerSpy = vi.spyOn(inferencer, 'infer');
            const configWithDefaults = {
                systemPrompt: 'Test',
                defaultModel: 'test-model',
                defaultTemperature: 0.7,
                defaultMaxTokens: 500,
            };
            const loop = new LoopWithAssembler(configWithDefaults, mockContextAssembler, inferencer, hooks);
            const input = createTestInput();
            await loop.run(input);
            expect(inferencerSpy).toHaveBeenCalledWith(expect.objectContaining({
                model: 'test-model',
                temperature: 0.7,
                maxTokens: 500,
            }));
        });
        it('should return ragResultCount from context assembly', async () => {
            const assembler = createMockContextAssembler(createMockAssemblyResult({ ragResultCount: 3 }));
            const loop = new LoopWithAssembler(config, assembler, mockInferenceService, hooks);
            const input = createTestInput();
            const result = await loop.run(input);
            expect(result.ragResultCount).toBe(3);
        });
        it('should return hasToolCalls and toolCalls when inference has tool calls', async () => {
            const toolCalls = [
                {
                    id: 'call-001',
                    name: 'read_file',
                    arguments: '{"path": "/tmp/test.txt"}',
                },
            ];
            const inferencer = createMockInferenceService(createMockInferenceResult({
                toolCalls,
                hasToolCalls: true,
                finishReason: 'tool_calls',
            }));
            const loop = new LoopWithAssembler(config, mockContextAssembler, inferencer, hooks);
            const input = createTestInput();
            const result = await loop.run(input);
            expect(result.hasToolCalls).toBe(true);
            expect(result.toolCalls).toBeDefined();
            expect(result.toolCalls).toHaveLength(1);
            expect(result.toolCalls[0].name).toBe('read_file');
        });
        it('should generate traceId when not provided in input', async () => {
            const loop = new LoopWithAssembler(config, mockContextAssembler, mockInferenceService, hooks);
            const input = createTestInput({ traceId: undefined });
            const result = await loop.run(input);
            expect(result.traceId).toBeDefined();
            expect(typeof result.traceId).toBe('string');
            expect(result.traceId.length).toBeGreaterThan(0);
            // Verify it was passed to assemble and infer
            const assemblerSpy = vi.spyOn(loop._contextAssembler, 'assemble');
        });
    });
    // -----------------------------------------------------------------------
    // TC-004-2: BEFORE_INTAKE hook called at start
    // -----------------------------------------------------------------------
    describe('TC-004-2: BEFORE_INTAKE hook called at start', () => {
        it('should call BEFORE_INTAKE hook at the start of run()', async () => {
            const handler = vi.fn((ctx) => ctx);
            hooks.register(HookPoint.BEFORE_INTAKE, handler);
            const loop = new LoopWithAssembler(config, mockContextAssembler, mockInferenceService, hooks);
            const input = createTestInput();
            await loop.run(input);
            expect(handler).toHaveBeenCalledTimes(1);
        });
        it('should pass correct data in BEFORE_INTAKE hook context', async () => {
            const handler = vi.fn((ctx) => ctx);
            hooks.register(HookPoint.BEFORE_INTAKE, handler);
            const loop = new LoopWithAssembler(config, mockContextAssembler, mockInferenceService, hooks);
            const input = createTestInput({
                userMessage: 'My question',
                sessionId: 'sess-test',
                chatId: 'chat-test',
                traceId: 'trace-test',
                messages: [
                    { role: 'user', content: 'Previous' },
                    { role: 'assistant', content: 'Previous answer' },
                ],
            });
            await loop.run(input);
            const ctx = handler.mock.calls[0][0];
            expect(ctx.hookPoint).toBe(HookPoint.BEFORE_INTAKE);
            expect(ctx.sessionId).toBe('sess-test');
            expect(ctx.chatId).toBe('chat-test');
            expect(ctx.traceId).toBe('trace-test');
            expect(ctx.data['userMessage']).toBe('My question');
            expect(ctx.data['historyLength']).toBe(2);
        });
        it('should call BEFORE_INTAKE before context.assemble()', async () => {
            const callOrder = [];
            hooks.register(HookPoint.BEFORE_INTAKE, () => {
                callOrder.push('before_intake');
            });
            const assembler = createMockContextAssembler();
            vi.spyOn(assembler, 'assemble').mockImplementation(async () => {
                callOrder.push('assemble');
                return createMockAssemblyResult();
            });
            const inferencer = createMockInferenceService();
            vi.spyOn(inferencer, 'infer').mockImplementation(async () => {
                callOrder.push('infer');
                return createMockInferenceResult();
            });
            const loop = new LoopWithAssembler(config, assembler, inferencer, hooks);
            const input = createTestInput();
            await loop.run(input);
            expect(callOrder).toEqual(['before_intake', 'assemble', 'infer']);
        });
    });
    // -----------------------------------------------------------------------
    // TC-004-4: Error handling (on_error)
    // -----------------------------------------------------------------------
    describe('TC-004-4: Error handling', () => {
        it('should return error response when inference throws', async () => {
            const consoleSpy = vi
                .spyOn(console, 'error')
                .mockImplementation(() => { });
            const inferencer = createMockInferenceService();
            vi.spyOn(inferencer, 'infer').mockRejectedValue(new Error('Provider connection failed'));
            const loop = new LoopWithAssembler(config, mockContextAssembler, inferencer, hooks);
            const input = createTestInput();
            const result = await loop.run(input);
            expect(result.isError).toBe(true);
            expect(result.errorMessage).toBe('Provider connection failed');
            expect(result.content).toBe('');
            expect(result.hasToolCalls).toBe(false);
            expect(result.traceId).toBe('trace-001');
            // Error should be logged
            expect(consoleSpy).toHaveBeenCalledTimes(1);
            expect(consoleSpy.mock.calls[0][0]).toContain('[AgentLoop]');
            expect(consoleSpy.mock.calls[0][1]).toContain('Provider connection failed');
            consoleSpy.mockRestore();
        });
        it('should return error response when context.assemble() throws', async () => {
            const consoleSpy = vi
                .spyOn(console, 'error')
                .mockImplementation(() => { });
            const assembler = createMockContextAssembler();
            vi.spyOn(assembler, 'assemble').mockRejectedValue(new Error('Memory system unavailable'));
            const loop = new LoopWithAssembler(config, assembler, mockInferenceService, hooks);
            const input = createTestInput();
            const result = await loop.run(input);
            expect(result.isError).toBe(true);
            expect(result.errorMessage).toBe('Memory system unavailable');
            expect(result.content).toBe('');
            expect(result.traceId).toBe('trace-001');
            // inference.infer should NOT have been called
            const inferencer = mockInferenceService;
            expect(inferencer.infer).not.toHaveBeenCalled();
            consoleSpy.mockRestore();
        });
        it('should handle non-Error thrown values', async () => {
            const consoleSpy = vi
                .spyOn(console, 'error')
                .mockImplementation(() => { });
            const assembler = createMockContextAssembler();
            vi.spyOn(assembler, 'assemble').mockRejectedValue('string error');
            const loop = new LoopWithAssembler(config, assembler, mockInferenceService, hooks);
            const input = createTestInput();
            const result = await loop.run(input);
            expect(result.isError).toBe(true);
            expect(result.errorMessage).toBe('string error');
            consoleSpy.mockRestore();
        });
        it('should still call BEFORE_INTAKE hook even when pipeline fails', async () => {
            const consoleSpy = vi
                .spyOn(console, 'error')
                .mockImplementation(() => { });
            const intakeHandler = vi.fn((ctx) => ctx);
            hooks.register(HookPoint.BEFORE_INTAKE, intakeHandler);
            const inferencer = createMockInferenceService();
            vi.spyOn(inferencer, 'infer').mockRejectedValue(new Error('Inference failed'));
            const loop = new LoopWithAssembler(config, mockContextAssembler, inferencer, hooks);
            const input = createTestInput();
            const result = await loop.run(input);
            expect(result.isError).toBe(true);
            expect(intakeHandler).toHaveBeenCalledTimes(1);
            consoleSpy.mockRestore();
        });
        it('should include traceId in error response', async () => {
            const inferencer = createMockInferenceService();
            vi.spyOn(inferencer, 'infer').mockRejectedValue(new Error('fail'));
            const loop = new LoopWithAssembler(config, mockContextAssembler, inferencer, hooks);
            const input = createTestInput({ traceId: 'custom-trace-123' });
            const result = await loop.run(input);
            expect(result.traceId).toBe('custom-trace-123');
        });
        it('should generate traceId in error response when not provided', async () => {
            const inferencer = createMockInferenceService();
            vi.spyOn(inferencer, 'infer').mockRejectedValue(new Error('fail'));
            const loop = new LoopWithAssembler(config, mockContextAssembler, inferencer, hooks);
            const input = createTestInput({ traceId: undefined });
            const result = await loop.run(input);
            expect(result.traceId).toBeDefined();
            expect(typeof result.traceId).toBe('string');
            expect(result.traceId.length).toBeGreaterThan(0);
        });
    });
    // -----------------------------------------------------------------------
    // TC-004-5/TC-004-6: Errors do not crash loop (graceful degradation)
    // -----------------------------------------------------------------------
    describe('TC-004-5/TC-004-6: Graceful degradation', () => {
        it('should return error output with zero usage when context assembly fails', async () => {
            const assembler = createMockContextAssembler();
            vi.spyOn(assembler, 'assemble').mockRejectedValue(new Error('Assembly error'));
            const loop = new LoopWithAssembler(config, assembler, mockInferenceService, hooks);
            const input = createTestInput();
            const result = await loop.run(input);
            expect(result.usage).toEqual({
                promptTokens: 0,
                completionTokens: 0,
                totalTokens: 0,
            });
            expect(result.ragResultCount).toBe(0);
        });
        it('should return error output with correct model/provider from config', async () => {
            const inferencer = createMockInferenceService();
            vi.spyOn(inferencer, 'infer').mockRejectedValue(new Error('fail'));
            const configWithModel = createTestConfig({ defaultModel: 'glm-5' });
            const loop = new LoopWithAssembler(configWithModel, mockContextAssembler, inferencer, hooks);
            const input = createTestInput();
            const result = await loop.run(input);
            expect(result.model).toBe('glm-5');
            expect(result.provider).toBe('unknown');
        });
        it('should return model=unknown when no defaultModel configured on error', async () => {
            const inferencer = createMockInferenceService();
            vi.spyOn(inferencer, 'infer').mockRejectedValue(new Error('fail'));
            const loop = new LoopWithAssembler(config, mockContextAssembler, inferencer, hooks);
            const input = createTestInput();
            const result = await loop.run(input);
            expect(result.model).toBe('unknown');
        });
    });
    // -----------------------------------------------------------------------
    // TC-004-7: trace_id preserved through pipeline
    // -----------------------------------------------------------------------
    describe('TC-004-7: trace_id preserved through pipeline', () => {
        it('should use provided traceId throughout the pipeline', async () => {
            const capturedTraceIds = [];
            hooks.register(HookPoint.BEFORE_INTAKE, (ctx) => {
                capturedTraceIds.push({ source: 'hook', id: ctx.traceId }.id);
                return ctx;
            });
            const assembler = createMockContextAssembler();
            vi.spyOn(assembler, 'assemble').mockImplementation(async (input) => {
                capturedTraceIds.push({ source: 'assemble', id: input.traceId }.id);
                return createMockAssemblyResult();
            });
            const inferencer = createMockInferenceService();
            vi.spyOn(inferencer, 'infer').mockImplementation(async (input) => {
                capturedTraceIds.push({ source: 'infer', id: input.traceId }.id);
                return createMockInferenceResult();
            });
            const loop = new LoopWithAssembler(config, assembler, inferencer, hooks);
            const input = createTestInput({ traceId: 'consistent-trace-id' });
            const result = await loop.run(input);
            expect(result.traceId).toBe('consistent-trace-id');
            for (const entry of capturedTraceIds) {
                expect(entry).toBe('consistent-trace-id');
            }
        });
        it('should pass correlation IDs (sessionId, chatId) to assemble and infer', async () => {
            let assembleInput;
            let inferInput;
            const assembler = createMockContextAssembler();
            vi.spyOn(assembler, 'assemble').mockImplementation(async (input) => {
                assembleInput = input;
                return createMockAssemblyResult();
            });
            const inferencer = createMockInferenceService();
            vi.spyOn(inferencer, 'infer').mockImplementation(async (input) => {
                inferInput = input;
                return createMockInferenceResult();
            });
            const loop = new LoopWithAssembler(config, assembler, inferencer, hooks);
            const input = createTestInput({
                sessionId: 'session-xyz',
                chatId: 'chat-xyz',
                traceId: 'trace-xyz',
            });
            await loop.run(input);
            expect(assembleInput.sessionId).toBe('session-xyz');
            expect(assembleInput.chatId).toBe('chat-xyz');
            expect(inferInput.sessionId).toBe('session-xyz');
            expect(inferInput.chatId).toBe('chat-xyz');
        });
    });
    // -----------------------------------------------------------------------
    // Edge cases
    // -----------------------------------------------------------------------
    describe('Edge cases', () => {
        it('should work with no hooks registered', async () => {
            // Use fresh registry without any handlers
            const emptyHooks = new HookRegistry();
            const loop = new LoopWithAssembler(config, mockContextAssembler, mockInferenceService, emptyHooks);
            const input = createTestInput();
            const result = await loop.run(input);
            expect(result.isError).toBe(false);
            expect(result.content).toBe('Hello! How can I help you today?');
        });
        it('should handle hook error gracefully (graceful degradation in HookRegistry)', async () => {
            const consoleSpy = vi
                .spyOn(console, 'error')
                .mockImplementation(() => { });
            hooks.register(HookPoint.BEFORE_INTAKE, () => {
                throw new Error('Hook error');
            });
            const loop = new LoopWithAssembler(config, mockContextAssembler, mockInferenceService, hooks);
            const input = createTestInput();
            const result = await loop.run(input);
            // HookRegistry handles errors gracefully -- pipeline continues
            expect(result.isError).toBe(false);
            expect(result.content).toBe('Hello! How can I help you today?');
            consoleSpy.mockRestore();
        });
        it('should pass config tools to inference when configured', async () => {
            const tools = [
                {
                    type: 'function',
                    function: {
                        name: 'search',
                        description: 'Search for information',
                    },
                },
            ];
            const configWithTools = createTestConfig({ tools });
            const inferencer = createMockInferenceService();
            const inferencerSpy = vi.spyOn(inferencer, 'infer');
            const loop = new LoopWithAssembler(configWithTools, mockContextAssembler, inferencer, hooks);
            const input = createTestInput();
            await loop.run(input);
            expect(inferencerSpy).toHaveBeenCalledWith(expect.objectContaining({
                tools,
            }));
        });
        it('should return finishReason from inference', async () => {
            const inferencer = createMockInferenceService(createMockInferenceResult({ finishReason: 'tool_calls' }));
            const loop = new LoopWithAssembler(config, mockContextAssembler, inferencer, hooks);
            const input = createTestInput();
            const result = await loop.run(input);
            expect(result.finishReason).toBe('tool_calls');
        });
        it('should allow hook to modify data (but not affect pipeline due to context isolation)', async () => {
            hooks.register(HookPoint.BEFORE_INTAKE, (ctx) => ({
                ...ctx,
                data: { ...ctx.data, injected: true },
            }));
            const loop = new LoopWithAssembler(config, mockContextAssembler, mockInferenceService, hooks);
            const input = createTestInput();
            const result = await loop.run(input);
            // Pipeline should still work normally
            expect(result.isError).toBe(false);
        });
    });
});
// ---------------------------------------------------------------------------
// Helper class to expose internal assembler for spy assertions
// ---------------------------------------------------------------------------
class LoopWithAssembler extends AgentLoop {
    constructor(config, assembler, inferenceService, hooks) {
        super(config, assembler, inferenceService, hooks);
    }
}
//# sourceMappingURL=AgentLoop.test.js.map