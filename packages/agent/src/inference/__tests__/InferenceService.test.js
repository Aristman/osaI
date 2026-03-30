/**
 * Unit tests for InferenceService
 *
 * Covers: T-003 Model Inference acceptance criteria
 *   - TC-003-1: Non-streaming inference through ProviderChain
 *   - TC-003-2: Streaming inference returns AsyncIterable
 *   - TC-003-3: BEFORE_MODEL_INFERENCE hook called
 *   - TC-003-4: Tool_use response correctly handled
 *   - TC-003-5: Error from Provider propagated
 *   - TC-003-6: Tools definitions passed to ProviderChain
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { InferenceService } from '../InferenceService.js';
import { HookRegistry } from '../../hooks/HookRegistry.js';
import { HookPoint } from '../../hooks/types.js';
import { ProviderStatus } from '@osai/providers';
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function createTestInput(overrides) {
    return {
        messages: [
            { role: 'user', content: 'Hello, world!' },
        ],
        sessionId: 'session-001',
        chatId: 'chat-001',
        traceId: 'trace-001',
        ...overrides,
    };
}
function createMockLLMResponse(overrides) {
    return {
        content: 'Hello! How can I help you today?',
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
function createMockLLMChunk(overrides) {
    return {
        content: 'chunk content',
        model: 'glm-5',
        provider: 'z-ai',
        ...overrides,
    };
}
function createMockProvider(overrides) {
    return {
        id: 'mock-provider',
        name: 'Mock Provider',
        isAvailable: vi.fn().mockResolvedValue(true),
        complete: vi.fn().mockResolvedValue(createMockLLMResponse()),
        stream: vi.fn().mockReturnValue(async function* () {
            // Default empty stream
        }),
        countTokens: vi.fn().mockReturnValue(0),
        getStatus: vi.fn().mockReturnValue(ProviderStatus.Available),
        ...overrides,
    };
}
// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('InferenceService', () => {
    let service;
    let mockProvider;
    let hooks;
    beforeEach(() => {
        mockProvider = createMockProvider();
        hooks = new HookRegistry();
        service = new InferenceService(mockProvider, hooks);
    });
    // -----------------------------------------------------------------------
    // TC-003-1: Non-streaming inference through ProviderChain
    // -----------------------------------------------------------------------
    describe('TC-003-1: Non-streaming inference', () => {
        it('should return InferenceResult with content, usage, model, provider', async () => {
            const mockResponse = createMockLLMResponse({
                content: 'Test response content',
                model: 'glm-5',
                provider: 'z-ai',
                usage: {
                    promptTokens: 15,
                    completionTokens: 25,
                    totalTokens: 40,
                },
            });
            vi.mocked(mockProvider.complete).mockResolvedValue(mockResponse);
            const input = createTestInput();
            const result = await service.infer(input);
            expect(result).toBeDefined();
            expect(result.content).toBe('Test response content');
            expect(result.model).toBe('glm-5');
            expect(result.provider).toBe('z-ai');
            expect(result.usage).toEqual({
                promptTokens: 15,
                completionTokens: 25,
                totalTokens: 40,
            });
            expect(result.hasToolCalls).toBe(false);
        });
        it('should call provider.complete with correct LLMRequest', async () => {
            const input = createTestInput({
                model: 'test-model',
                temperature: 0.7,
                maxTokens: 500,
            });
            await service.infer(input);
            expect(mockProvider.complete).toHaveBeenCalledTimes(1);
            const callArg = vi.mocked(mockProvider.complete).mock.calls[0][0];
            expect(callArg.model).toBe('test-model');
            expect(callArg.messages).toEqual(input.messages);
            expect(callArg.temperature).toBe(0.7);
            expect(callArg.maxTokens).toBe(500);
            expect(callArg.stream).toBe(false);
        });
        it('should include stopSequences in the request when provided', async () => {
            const input = createTestInput({
                stopSequences: ['\n', 'STOP'],
            });
            await service.infer(input);
            const callArg = vi.mocked(mockProvider.complete).mock.calls[0][0];
            expect(callArg.stopSequences).toEqual(['\n', 'STOP']);
        });
        it('should pass messages array correctly', async () => {
            const messages = [
                { role: 'system', content: 'You are helpful.' },
                { role: 'user', content: 'Hello' },
                { role: 'assistant', content: 'Hi there!' },
                { role: 'user', content: 'How are you?' },
            ];
            const input = createTestInput({ messages });
            await service.infer(input);
            const callArg = vi.mocked(mockProvider.complete).mock.calls[0][0];
            expect(callArg.messages).toEqual(messages);
        });
    });
    // -----------------------------------------------------------------------
    // TC-003-2: Streaming inference returns AsyncIterable
    // -----------------------------------------------------------------------
    describe('TC-003-2: Streaming inference', () => {
        it('should yield InferenceChunks from the provider stream', async () => {
            const chunks = [
                createMockLLMChunk({ content: 'Hello', model: 'glm-5', provider: 'z-ai' }),
                createMockLLMChunk({ content: ' world', model: 'glm-5', provider: 'z-ai' }),
                createMockLLMChunk({
                    content: '!',
                    model: 'glm-5',
                    provider: 'z-ai',
                    finishReason: 'stop',
                }),
            ];
            vi.mocked(mockProvider.stream).mockReturnValue((async function* () {
                for (const chunk of chunks) {
                    yield chunk;
                }
            })());
            const input = createTestInput();
            const collectedChunks = [];
            for await (const chunk of service.inferStream(input)) {
                collectedChunks.push(chunk);
            }
            expect(collectedChunks).toHaveLength(3);
            expect(collectedChunks[0].content).toBe('Hello');
            expect(collectedChunks[1].content).toBe(' world');
            expect(collectedChunks[2].content).toBe('!');
            expect(collectedChunks[2].finishReason).toBe('stop');
        });
        it('should set hasToolCalls to false when no tool calls in chunks', async () => {
            vi.mocked(mockProvider.stream).mockReturnValue((async function* () {
                yield createMockLLMChunk({ content: 'text' });
            })());
            const input = createTestInput();
            const collectedChunks = [];
            for await (const chunk of service.inferStream(input)) {
                collectedChunks.push(chunk);
            }
            expect(collectedChunks).toHaveLength(1);
            expect(collectedChunks[0].hasToolCalls).toBe(false);
        });
        it('should propagate model and provider from each chunk', async () => {
            vi.mocked(mockProvider.stream).mockReturnValue((async function* () {
                yield createMockLLMChunk({ model: 'glm-5', provider: 'z-ai' });
                yield createMockLLMChunk({ model: 'glm-5', provider: 'z-ai' });
            })());
            const input = createTestInput();
            const collectedChunks = [];
            for await (const chunk of service.inferStream(input)) {
                collectedChunks.push(chunk);
            }
            for (const c of collectedChunks) {
                expect(c.model).toBe('glm-5');
                expect(c.provider).toBe('z-ai');
            }
        });
        it('should handle empty stream', async () => {
            vi.mocked(mockProvider.stream).mockReturnValue((async function* () {
                // empty stream
            })());
            const input = createTestInput();
            const collectedChunks = [];
            for await (const chunk of service.inferStream(input)) {
                collectedChunks.push(chunk);
            }
            expect(collectedChunks).toHaveLength(0);
        });
        it('should call provider.stream with stream flag', async () => {
            vi.mocked(mockProvider.stream).mockReturnValue((async function* () {
                yield createMockLLMChunk({ content: 'ok' });
            })());
            const input = createTestInput({ model: 'stream-model' });
            for await (const _chunk of service.inferStream(input)) {
                // consume stream
            }
            expect(mockProvider.stream).toHaveBeenCalledTimes(1);
            const callArg = vi.mocked(mockProvider.stream).mock.calls[0][0];
            expect(callArg.model).toBe('stream-model');
        });
    });
    // -----------------------------------------------------------------------
    // TC-003-3: BEFORE_MODEL_INFERENCE hook called
    // -----------------------------------------------------------------------
    describe('TC-003-3: BEFORE_MODEL_INFERENCE hook', () => {
        it('should call BEFORE_MODEL_INFERENCE hook before provider.complete', async () => {
            const handler = vi.fn((ctx) => ctx);
            hooks.register(HookPoint.BEFORE_MODEL_INFERENCE, handler);
            const input = createTestInput();
            await service.infer(input);
            expect(handler).toHaveBeenCalledTimes(1);
            // Verify context contains correct data
            const ctx = handler.mock.calls[0][0];
            expect(ctx.hookPoint).toBe(HookPoint.BEFORE_MODEL_INFERENCE);
            expect(ctx.sessionId).toBe('session-001');
            expect(ctx.chatId).toBe('chat-001');
            expect(ctx.traceId).toBe('trace-001');
            expect(ctx.data['messages']).toEqual(input.messages);
        });
        it('should call BEFORE_MODEL_INFERENCE hook before provider.stream', async () => {
            const handler = vi.fn((ctx) => ctx);
            hooks.register(HookPoint.BEFORE_MODEL_INFERENCE, handler);
            vi.mocked(mockProvider.stream).mockReturnValue((async function* () {
                yield createMockLLMChunk({ content: 'ok' });
            })());
            const input = createTestInput();
            for await (const _chunk of service.inferStream(input)) {
                // consume
            }
            expect(handler).toHaveBeenCalledTimes(1);
        });
        it('should allow hook to modify model in request', async () => {
            const modifierHandler = (ctx) => ({
                ...ctx,
                data: { ...ctx.data, model: 'hook-override-model' },
            });
            hooks.register(HookPoint.BEFORE_MODEL_INFERENCE, modifierHandler);
            const input = createTestInput({ model: 'original-model' });
            await service.infer(input);
            const callArg = vi.mocked(mockProvider.complete).mock.calls[0][0];
            expect(callArg.model).toBe('hook-override-model');
        });
        it('should work correctly when no hook is registered', async () => {
            const input = createTestInput();
            const result = await service.infer(input);
            expect(result).toBeDefined();
            expect(result.content).toBe('Hello! How can I help you today?');
        });
        it('should call AFTER_MODEL_INFERENCE hook after provider.complete', async () => {
            const afterHandler = vi.fn((ctx) => ctx);
            hooks.register(HookPoint.AFTER_MODEL_INFERENCE, afterHandler);
            const mockResponse = createMockLLMResponse({ content: 'test' });
            vi.mocked(mockProvider.complete).mockResolvedValue(mockResponse);
            const input = createTestInput();
            await service.infer(input);
            expect(afterHandler).toHaveBeenCalledTimes(1);
            const ctx = afterHandler.mock.calls[0][0];
            expect(ctx.hookPoint).toBe(HookPoint.AFTER_MODEL_INFERENCE);
            expect(ctx.sessionId).toBe('session-001');
            expect(ctx.chatId).toBe('chat-001');
            expect(ctx.traceId).toBe('trace-001');
        });
        it('should call AFTER_MODEL_INFERENCE hook after stream completes', async () => {
            const afterHandler = vi.fn((ctx) => ctx);
            hooks.register(HookPoint.AFTER_MODEL_INFERENCE, afterHandler);
            vi.mocked(mockProvider.stream).mockReturnValue((async function* () {
                yield createMockLLMChunk({
                    content: 'text',
                    model: 'glm-5',
                    provider: 'z-ai',
                    finishReason: 'stop',
                    usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
                });
            })());
            const input = createTestInput();
            for await (const _chunk of service.inferStream(input)) {
                // consume
            }
            expect(afterHandler).toHaveBeenCalledTimes(1);
            const ctx = afterHandler.mock.calls[0][0];
            expect(ctx.hookPoint).toBe(HookPoint.AFTER_MODEL_INFERENCE);
        });
        it('should call hooks in correct order: before then after', async () => {
            const callOrder = [];
            const beforeHandler = (ctx) => {
                callOrder.push('before');
                return ctx;
            };
            const afterHandler = (ctx) => {
                callOrder.push('after');
                return ctx;
            };
            hooks.register(HookPoint.BEFORE_MODEL_INFERENCE, beforeHandler);
            hooks.register(HookPoint.AFTER_MODEL_INFERENCE, afterHandler);
            const input = createTestInput();
            await service.infer(input);
            expect(callOrder).toEqual(['before', 'after']);
        });
    });
    // -----------------------------------------------------------------------
    // TC-003-4: Tool_use response correctly handled
    // -----------------------------------------------------------------------
    describe('TC-003-4: Tool_use detection', () => {
        const toolCalls = [
            {
                id: 'call-001',
                name: 'read_file',
                arguments: '{"path": "/tmp/test.txt"}',
            },
        ];
        it('should set hasToolCalls to true when response has toolCalls', async () => {
            const mockResponse = createMockLLMResponse({
                toolCalls,
                finishReason: 'tool_calls',
            });
            vi.mocked(mockProvider.complete).mockResolvedValue(mockResponse);
            const input = createTestInput();
            const result = await service.infer(input);
            expect(result.hasToolCalls).toBe(true);
            expect(result.toolCalls).toBeDefined();
            expect(result.toolCalls).toHaveLength(1);
            expect(result.toolCalls[0].id).toBe('call-001');
            expect(result.toolCalls[0].name).toBe('read_file');
        });
        it('should set hasToolCalls to false when response has no toolCalls', async () => {
            const mockResponse = createMockLLMResponse();
            vi.mocked(mockProvider.complete).mockResolvedValue(mockResponse);
            const input = createTestInput();
            const result = await service.infer(input);
            expect(result.hasToolCalls).toBe(false);
        });
        it('should set hasToolCalls to false when toolCalls is empty array', async () => {
            const mockResponse = createMockLLMResponse({
                toolCalls: [],
            });
            vi.mocked(mockProvider.complete).mockResolvedValue(mockResponse);
            const input = createTestInput();
            const result = await service.infer(input);
            expect(result.hasToolCalls).toBe(false);
        });
        it('should handle multiple tool calls in response', async () => {
            const multipleToolCalls = [
                {
                    id: 'call-001',
                    name: 'read_file',
                    arguments: '{"path": "/tmp/a.txt"}',
                },
                {
                    id: 'call-002',
                    name: 'write_file',
                    arguments: '{"path": "/tmp/b.txt", "content": "hello"}',
                },
            ];
            const mockResponse = createMockLLMResponse({
                toolCalls: multipleToolCalls,
                finishReason: 'tool_calls',
            });
            vi.mocked(mockProvider.complete).mockResolvedValue(mockResponse);
            const input = createTestInput();
            const result = await service.infer(input);
            expect(result.hasToolCalls).toBe(true);
            expect(result.toolCalls).toHaveLength(2);
        });
        it('should detect tool calls in streaming chunks', async () => {
            const streamToolCalls = [
                {
                    id: 'call-stream-001',
                    name: 'search',
                    arguments: '{"query": "test"}',
                },
            ];
            vi.mocked(mockProvider.stream).mockReturnValue((async function* () {
                yield createMockLLMChunk({ content: '' });
                yield createMockLLMChunk({
                    content: '',
                    toolCalls: streamToolCalls,
                });
                yield createMockLLMChunk({
                    content: '',
                    finishReason: 'tool_calls',
                });
            })());
            const input = createTestInput();
            const collectedChunks = [];
            for await (const chunk of service.inferStream(input)) {
                collectedChunks.push(chunk);
            }
            // The chunk with toolCalls should have hasToolCalls = true
            expect(collectedChunks[1].hasToolCalls).toBe(true);
            expect(collectedChunks[1].toolCalls).toHaveLength(1);
            expect(collectedChunks[1].toolCalls[0].name).toBe('search');
            // Chunks without toolCalls should have hasToolCalls = false
            expect(collectedChunks[0].hasToolCalls).toBe(false);
        });
    });
    // -----------------------------------------------------------------------
    // TC-003-5: Error from Provider propagated
    // -----------------------------------------------------------------------
    describe('TC-003-5: Error handling', () => {
        it('should propagate error from provider.complete', async () => {
            const providerError = new Error('Provider connection failed');
            vi.mocked(mockProvider.complete).mockRejectedValue(providerError);
            const input = createTestInput();
            await expect(service.infer(input)).rejects.toThrow('Provider connection failed');
        });
        it('should propagate error from provider.stream', async () => {
            vi.mocked(mockProvider.stream).mockImplementation(() => {
                throw new Error('Stream failed');
            });
            const input = createTestInput();
            await expect((async () => {
                for await (const _chunk of service.inferStream(input)) {
                    // consume
                }
            })()).rejects.toThrow('Stream failed');
        });
        it('should still call BEFORE_MODEL_INFERENCE hook even if provider throws', async () => {
            const handler = vi.fn((ctx) => ctx);
            hooks.register(HookPoint.BEFORE_MODEL_INFERENCE, handler);
            vi.mocked(mockProvider.complete).mockRejectedValue(new Error('Provider error'));
            const input = createTestInput();
            await expect(service.infer(input)).rejects.toThrow('Provider error');
            // Hook was called before the error
            expect(handler).toHaveBeenCalledTimes(1);
        });
        it('should NOT call AFTER_MODEL_INFERENCE hook if provider throws', async () => {
            const beforeHandler = vi.fn((ctx) => ctx);
            const afterHandler = vi.fn((ctx) => ctx);
            hooks.register(HookPoint.BEFORE_MODEL_INFERENCE, beforeHandler);
            hooks.register(HookPoint.AFTER_MODEL_INFERENCE, afterHandler);
            vi.mocked(mockProvider.complete).mockRejectedValue(new Error('Provider error'));
            const input = createTestInput();
            await expect(service.infer(input)).rejects.toThrow();
            expect(beforeHandler).toHaveBeenCalledTimes(1);
            expect(afterHandler).not.toHaveBeenCalled();
        });
        it('should propagate stream error mid-stream', async () => {
            vi.mocked(mockProvider.stream).mockReturnValue((async function* () {
                yield createMockLLMChunk({ content: 'before error' });
                throw new Error('Mid-stream failure');
            })());
            const input = createTestInput();
            const collectedChunks = [];
            let streamError;
            try {
                for await (const chunk of service.inferStream(input)) {
                    collectedChunks.push(chunk);
                }
            }
            catch (e) {
                streamError = e;
            }
            expect(collectedChunks).toHaveLength(1);
            expect(streamError).toBeDefined();
            expect(streamError.message).toBe('Mid-stream failure');
        });
    });
    // -----------------------------------------------------------------------
    // TC-003-6: Tools definitions passed to ProviderChain
    // -----------------------------------------------------------------------
    describe('TC-003-6: Tools definitions', () => {
        const tools = [
            {
                type: 'function',
                function: {
                    name: 'read_file',
                    description: 'Read a file from disk',
                    parameters: {
                        type: 'object',
                        properties: {
                            path: { type: 'string' },
                        },
                    },
                },
            },
            {
                type: 'function',
                function: {
                    name: 'write_file',
                    description: 'Write a file to disk',
                    parameters: {
                        type: 'object',
                        properties: {
                            path: { type: 'string' },
                            content: { type: 'string' },
                        },
                    },
                },
            },
        ];
        it('should pass tools to provider.complete in the request', async () => {
            const input = createTestInput({ tools });
            await service.infer(input);
            const callArg = vi.mocked(mockProvider.complete).mock.calls[0][0];
            expect(callArg.tools).toBeDefined();
            expect(callArg.tools).toHaveLength(2);
            expect(callArg.tools[0].function.name).toBe('read_file');
            expect(callArg.tools[1].function.name).toBe('write_file');
        });
        it('should pass tools to provider.stream in the request', async () => {
            vi.mocked(mockProvider.stream).mockReturnValue((async function* () {
                yield createMockLLMChunk({ content: 'ok' });
            })());
            const input = createTestInput({ tools });
            for await (const _chunk of service.inferStream(input)) {
                // consume
            }
            const callArg = vi.mocked(mockProvider.stream).mock.calls[0][0];
            expect(callArg.tools).toBeDefined();
            expect(callArg.tools).toHaveLength(2);
        });
        it('should not include tools in request when not provided', async () => {
            const input = createTestInput();
            await service.infer(input);
            const callArg = vi.mocked(mockProvider.complete).mock.calls[0][0];
            expect(callArg.tools).toBeUndefined();
        });
        it('should not include tools in request when empty array provided', async () => {
            const input = createTestInput({ tools: [] });
            await service.infer(input);
            const callArg = vi.mocked(mockProvider.complete).mock.calls[0][0];
            expect(callArg.tools).toBeUndefined();
        });
        it('should allow hook to modify tools in request', async () => {
            const modifiedTools = [
                {
                    type: 'function',
                    function: {
                        name: 'hook_tool',
                        description: 'Tool injected by hook',
                    },
                },
            ];
            const modifierHandler = (ctx) => ({
                ...ctx,
                data: { ...ctx.data, tools: modifiedTools },
            });
            hooks.register(HookPoint.BEFORE_MODEL_INFERENCE, modifierHandler);
            const input = createTestInput();
            await service.infer(input);
            const callArg = vi.mocked(mockProvider.complete).mock.calls[0][0];
            expect(callArg.tools).toBeDefined();
            expect(callArg.tools).toHaveLength(1);
            expect(callArg.tools[0].function.name).toBe('hook_tool');
        });
    });
    // -----------------------------------------------------------------------
    // Additional edge cases
    // -----------------------------------------------------------------------
    describe('Edge cases', () => {
        it('should handle empty messages array', async () => {
            const input = createTestInput({ messages: [] });
            const result = await service.infer(input);
            expect(result).toBeDefined();
            const callArg = vi.mocked(mockProvider.complete).mock.calls[0][0];
            expect(callArg.messages).toEqual([]);
        });
        it('should default model to "default" when not provided', async () => {
            const input = createTestInput(); // no model
            await service.infer(input);
            const callArg = vi.mocked(mockProvider.complete).mock.calls[0][0];
            expect(callArg.model).toBe('default');
        });
        it('should preserve traceId, chatId, sessionId in hook contexts', async () => {
            const capturedContexts = [];
            const captureHandler = (ctx) => {
                capturedContexts.push(ctx);
                return ctx;
            };
            hooks.register(HookPoint.BEFORE_MODEL_INFERENCE, captureHandler);
            hooks.register(HookPoint.AFTER_MODEL_INFERENCE, captureHandler);
            const input = createTestInput({
                traceId: 'custom-trace',
                chatId: 'custom-chat',
                sessionId: 'custom-session',
            });
            await service.infer(input);
            expect(capturedContexts).toHaveLength(2);
            for (const ctx of capturedContexts) {
                expect(ctx.traceId).toBe('custom-trace');
                expect(ctx.chatId).toBe('custom-chat');
                expect(ctx.sessionId).toBe('custom-session');
            }
            expect(capturedContexts[0].hookPoint).toBe(HookPoint.BEFORE_MODEL_INFERENCE);
            expect(capturedContexts[1].hookPoint).toBe(HookPoint.AFTER_MODEL_INFERENCE);
        });
        it('should handle streaming with usage info in final chunk', async () => {
            const finalUsage = {
                promptTokens: 50,
                completionTokens: 100,
                totalTokens: 150,
            };
            vi.mocked(mockProvider.stream).mockReturnValue((async function* () {
                yield createMockLLMChunk({ content: 'Hello' });
                yield createMockLLMChunk({
                    content: ' world',
                    usage: finalUsage,
                    finishReason: 'stop',
                });
            })());
            const input = createTestInput();
            const collectedChunks = [];
            for await (const chunk of service.inferStream(input)) {
                collectedChunks.push(chunk);
            }
            expect(collectedChunks[1].usage).toEqual(finalUsage);
            expect(collectedChunks[1].finishReason).toBe('stop');
        });
    });
});
//# sourceMappingURL=InferenceService.test.js.map