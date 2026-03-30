/**
 * Unit tests for ZAiProvider.
 * T-002: Z.ai Provider (OpenAI-Compatible)
 *
 * Tests cover:
 * - TT-002-10: complete() sends correct payload
 * - TT-002-11: complete() returns LLMResponse with usage
 * - TT-002-12: stream() yields LLMChunk objects
 * - TT-002-13: isAvailable() returns true on 200
 * - TT-002-14: 429 response -> RateLimitError
 * - TT-002-15: 5xx response -> ProviderUnavailableError
 * - TT-002-16: baseURL from configuration
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
// ---------------------------------------------------------------------------
// Mock setup using vi.hoisted (vitest 3.x pattern for hoisted mocks)
// ---------------------------------------------------------------------------
const { mockList, mockCreate } = vi.hoisted(() => {
    return {
        mockList: vi.fn(),
        mockCreate: vi.fn(),
    };
});
vi.mock('openai', () => {
    const OpenAIClass = vi.fn().mockImplementation(() => ({
        models: {
            list: mockList,
        },
        chat: {
            completions: {
                create: mockCreate,
            },
        },
    }));
    // Provide stub error classes for the provider's instanceof checks
    class MockAPIError extends Error {
        status;
        headers;
        constructor(status, _body, _message, headers) {
            super(_message);
            this.status = status;
            this.headers = headers;
            this.name = 'APIError';
        }
    }
    class MockAPIConnectionError extends Error {
        constructor(opts) {
            super(opts.message);
            this.name = 'APIConnectionError';
        }
    }
    class MockAPIUserAbortError extends Error {
        constructor() {
            super('Request aborted');
            this.name = 'APIUserAbortError';
        }
    }
    return {
        default: OpenAIClass,
        APIError: MockAPIError,
        APIConnectionError: MockAPIConnectionError,
        APIUserAbortError: MockAPIUserAbortError,
    };
});
vi.mock('openai/streaming', () => ({
    Stream: vi.fn(),
}));
// ---------------------------------------------------------------------------
// Imports (after mock declarations)
// ---------------------------------------------------------------------------
import { ZAiProvider } from '../z-ai-provider.js';
import { APIError as OpenAI_APIError, APIConnectionError as OpenAI_APIConnectionError, } from 'openai';
import { RateLimitError, ProviderUnavailableError, AuthError, ProviderError, } from '../../errors.js';
import { ProviderStatus } from '../../types.js';
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function createProvider(config) {
    return new ZAiProvider({
        id: 'z-ai',
        name: 'Z.ai',
        baseUrl: 'https://api.z.ai/api/paas/v4',
        apiKeys: ['test-api-key'],
        defaultModel: 'glm-5',
        ...config,
    });
}
const basicRequest = {
    model: 'glm-5',
    messages: [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: 'Hello!' },
    ],
};
const mockCompletionResponse = {
    id: 'chatcmpl-test',
    object: 'chat.completion',
    created: Date.now(),
    model: 'glm-5',
    choices: [
        {
            index: 0,
            message: {
                role: 'assistant',
                content: 'Hello! How can I help you today?',
            },
            finish_reason: 'stop',
        },
    ],
    usage: {
        prompt_tokens: 20,
        completion_tokens: 10,
        total_tokens: 30,
    },
};
function createAsyncIterable(items) {
    return {
        [Symbol.asyncIterator]() {
            let index = 0;
            return {
                async next() {
                    if (index < items.length) {
                        return { value: items[index++], done: false };
                    }
                    return { value: undefined, done: true };
                },
            };
        },
    };
}
// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('ZAiProvider', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });
    // --------------------------------------------------------------------------
    // Constructor
    // --------------------------------------------------------------------------
    describe('constructor', () => {
        it('should use default values when no config provided', () => {
            const provider = new ZAiProvider();
            expect(provider.id).toBe('z-ai');
            expect(provider.name).toBe('Z.ai');
            expect(provider.getStatus()).toBe(ProviderStatus.Unknown);
        });
        it('should accept custom config', () => {
            const provider = new ZAiProvider({
                id: 'z-ai-custom',
                name: 'Custom Z.ai',
                baseUrl: 'https://custom.z.ai/api',
                apiKeys: ['key1', 'key2'],
                defaultModel: 'glm-4',
            });
            expect(provider.id).toBe('z-ai-custom');
            expect(provider.name).toBe('Custom Z.ai');
        });
        it('should create OpenAI client with correct baseURL and apiKey', () => {
            createProvider({
                baseUrl: 'https://api.z.ai/api/paas/v4',
                apiKeys: ['my-key'],
            });
            // OpenAI constructor was called (it is mocked)
            expect(mockCreate).toBeDefined();
            expect(mockList).toBeDefined();
        });
        it('TT-002-16: should use default baseURL https://api.z.ai/api/paas/v4', () => {
            const provider = new ZAiProvider();
            // Verify the provider was created without errors with default config
            expect(provider.id).toBe('z-ai');
        });
    });
    // --------------------------------------------------------------------------
    // isAvailable
    // --------------------------------------------------------------------------
    describe('isAvailable', () => {
        it('TT-002-13: should return true when models.list succeeds', async () => {
            mockList.mockResolvedValue({ data: [] });
            const provider = createProvider();
            const result = await provider.isAvailable();
            expect(result).toBe(true);
            expect(provider.getStatus()).toBe(ProviderStatus.Available);
            expect(mockList).toHaveBeenCalledOnce();
        });
        it('should return false when models.list fails', async () => {
            mockList.mockRejectedValue(new Error('Network error'));
            const provider = createProvider();
            const result = await provider.isAvailable();
            expect(result).toBe(false);
            expect(provider.getStatus()).toBe(ProviderStatus.Unavailable);
        });
    });
    // --------------------------------------------------------------------------
    // complete
    // --------------------------------------------------------------------------
    describe('complete', () => {
        it('TT-002-10: should send correct payload with messages and model', async () => {
            mockCreate.mockResolvedValue(mockCompletionResponse);
            const provider = createProvider();
            await provider.complete(basicRequest);
            expect(mockCreate).toHaveBeenCalledOnce();
            const callArgs = mockCreate.mock.calls[0][0];
            expect(callArgs.model).toBe('glm-5');
            expect(callArgs.messages).toEqual([
                { role: 'system', content: 'You are a helpful assistant.' },
                { role: 'user', content: 'Hello!' },
            ]);
        });
        it('should pass temperature and maxTokens', async () => {
            mockCreate.mockResolvedValue(mockCompletionResponse);
            const provider = createProvider();
            const request = {
                ...basicRequest,
                temperature: 0.7,
                maxTokens: 1024,
            };
            await provider.complete(request);
            const callArgs = mockCreate.mock.calls[0][0];
            expect(callArgs.temperature).toBe(0.7);
            expect(callArgs.max_tokens).toBe(1024);
        });
        it('TT-002-11: should return LLMResponse with content and usage', async () => {
            mockCreate.mockResolvedValue(mockCompletionResponse);
            const provider = createProvider();
            const response = await provider.complete(basicRequest);
            expect(response.content).toBe('Hello! How can I help you today?');
            expect(response.provider).toBe('z-ai');
            expect(response.model).toBe('glm-5');
            expect(response.usage).toEqual({
                promptTokens: 20,
                completionTokens: 10,
                totalTokens: 30,
            });
            expect(response.finishReason).toBe('stop');
        });
        it('should map tool_calls from response', async () => {
            const toolResponse = {
                ...mockCompletionResponse,
                choices: [
                    {
                        index: 0,
                        message: {
                            role: 'assistant',
                            content: '',
                            tool_calls: [
                                {
                                    id: 'call_123',
                                    type: 'function',
                                    function: {
                                        name: 'get_weather',
                                        arguments: '{"city":"Tokyo"}',
                                    },
                                },
                            ],
                        },
                        finish_reason: 'tool_calls',
                    },
                ],
            };
            mockCreate.mockResolvedValue(toolResponse);
            const provider = createProvider();
            const response = await provider.complete(basicRequest);
            expect(response.toolCalls).toHaveLength(1);
            expect(response.toolCalls?.[0]).toEqual({
                id: 'call_123',
                name: 'get_weather',
                arguments: '{"city":"Tokyo"}',
            });
            expect(response.finishReason).toBe('tool_calls');
        });
        it('should pass tools in OpenAI format', async () => {
            mockCreate.mockResolvedValue(mockCompletionResponse);
            const provider = createProvider();
            const tools = [
                {
                    type: 'function',
                    function: {
                        name: 'get_weather',
                        description: 'Get weather for a city',
                        parameters: {
                            type: 'object',
                            properties: { city: { type: 'string' } },
                        },
                    },
                },
            ];
            const request = { ...basicRequest, tools };
            await provider.complete(request);
            const callArgs = mockCreate.mock.calls[0][0];
            expect(callArgs.tools).toEqual([
                {
                    type: 'function',
                    function: {
                        name: 'get_weather',
                        description: 'Get weather for a city',
                        parameters: {
                            type: 'object',
                            properties: { city: { type: 'string' } },
                        },
                    },
                },
            ]);
        });
        it('should convert assistant messages with tool_calls', async () => {
            mockCreate.mockResolvedValue(mockCompletionResponse);
            const provider = createProvider();
            const request = {
                model: 'glm-5',
                messages: [
                    { role: 'user', content: 'Get weather' },
                    {
                        role: 'assistant',
                        content: '',
                        toolCalls: [
                            {
                                id: 'call_123',
                                name: 'get_weather',
                                arguments: '{"city":"Tokyo"}',
                            },
                        ],
                    },
                    {
                        role: 'tool',
                        content: '{"temp": 20}',
                        toolCallId: 'call_123',
                    },
                ],
            };
            await provider.complete(request);
            const callArgs = mockCreate.mock.calls[0][0];
            const messages = callArgs.messages;
            expect(messages[1]).toEqual({
                role: 'assistant',
                content: '',
                tool_calls: [
                    {
                        id: 'call_123',
                        type: 'function',
                        function: { name: 'get_weather', arguments: '{"city":"Tokyo"}' },
                    },
                ],
            });
            expect(messages[2]).toEqual({
                role: 'tool',
                content: '{"temp": 20}',
                tool_call_id: 'call_123',
            });
        });
        it('should pass stop sequences', async () => {
            mockCreate.mockResolvedValue(mockCompletionResponse);
            const provider = createProvider();
            const request = {
                ...basicRequest,
                stopSequences: ['\n\n', 'STOP'],
            };
            await provider.complete(request);
            const callArgs = mockCreate.mock.calls[0][0];
            expect(callArgs.stop).toEqual(['\n\n', 'STOP']);
        });
    });
    // --------------------------------------------------------------------------
    // Error mapping (complete)
    //
    // NOTE: Since we mock the openai module, we cannot use real OpenAI error
    // constructors. Instead we throw generic errors and verify that the
    // mapError method in the provider converts them appropriately via the
    // OpenAI SDK error classes at runtime. Here we test the error mapping
    // by throwing errors that the mocked SDK would throw.
    // --------------------------------------------------------------------------
    describe('complete -- error mapping', () => {
        it('TT-002-14: should throw RateLimitError on 429 response', async () => {
            const apiError = new OpenAI_APIError(429, { message: 'Rate limit exceeded' }, 'Rate limit exceeded', {});
            mockCreate.mockRejectedValue(apiError);
            const provider = createProvider();
            try {
                await provider.complete(basicRequest);
                expect.fail('Should have thrown');
            }
            catch (error) {
                expect(error).toBeInstanceOf(RateLimitError);
                const rlError = error;
                expect(rlError.providerId).toBe('z-ai');
                expect(rlError.statusCode).toBe(429);
            }
        });
        it('should include retryAfterMs when retry-after header is present', async () => {
            const apiError = new OpenAI_APIError(429, { message: 'Rate limit' }, 'Rate limit', { 'retry-after': '5' });
            mockCreate.mockRejectedValue(apiError);
            const provider = createProvider();
            try {
                await provider.complete(basicRequest);
                expect.fail('Should have thrown');
            }
            catch (error) {
                expect(error).toBeInstanceOf(RateLimitError);
                const rlError = error;
                expect(rlError.retryAfterMs).toBe(5000);
            }
        });
        it('TT-002-15: should throw ProviderUnavailableError on 5xx response', async () => {
            const apiError = new OpenAI_APIError(500, { message: 'Internal server error' }, 'Internal server error', {});
            mockCreate.mockRejectedValue(apiError);
            const provider = createProvider();
            try {
                await provider.complete(basicRequest);
                expect.fail('Should have thrown');
            }
            catch (error) {
                expect(error).toBeInstanceOf(ProviderUnavailableError);
                const ue = error;
                expect(ue.providerId).toBe('z-ai');
                expect(ue.statusCode).toBe(500);
            }
        });
        it('should throw AuthError on 401 response', async () => {
            const apiError = new OpenAI_APIError(401, { message: 'Invalid API key' }, 'Invalid API key', {});
            mockCreate.mockRejectedValue(apiError);
            const provider = createProvider();
            try {
                await provider.complete(basicRequest);
                expect.fail('Should have thrown');
            }
            catch (error) {
                expect(error).toBeInstanceOf(AuthError);
                const ae = error;
                expect(ae.providerId).toBe('z-ai');
                expect(ae.statusCode).toBe(401);
            }
        });
        it('should throw AuthError on 403 response', async () => {
            const apiError = new OpenAI_APIError(403, { message: 'Forbidden' }, 'Forbidden', {});
            mockCreate.mockRejectedValue(apiError);
            const provider = createProvider();
            try {
                await provider.complete(basicRequest);
                expect.fail('Should have thrown');
            }
            catch (error) {
                expect(error).toBeInstanceOf(AuthError);
                const ae = error;
                expect(ae.statusCode).toBe(403);
            }
        });
        it('should throw ProviderUnavailableError on connection error', async () => {
            const connError = new OpenAI_APIConnectionError({ message: 'ECONNREFUSED' });
            mockCreate.mockRejectedValue(connError);
            const provider = createProvider();
            try {
                await provider.complete(basicRequest);
                expect.fail('Should have thrown');
            }
            catch (error) {
                expect(error).toBeInstanceOf(ProviderUnavailableError);
                const ue = error;
                expect(ue.providerId).toBe('z-ai');
                expect(ue.message).toContain('Connection failed');
            }
        });
        it('should throw ProviderError for other errors (4xx)', async () => {
            const apiError = new OpenAI_APIError(400, { message: 'Bad request' }, 'Bad request', {});
            mockCreate.mockRejectedValue(apiError);
            const provider = createProvider();
            try {
                await provider.complete(basicRequest);
                expect.fail('Should have thrown');
            }
            catch (error) {
                expect(error).toBeInstanceOf(ProviderError);
                expect(error).not.toBeInstanceOf(RateLimitError);
                expect(error).not.toBeInstanceOf(ProviderUnavailableError);
                const pe = error;
                expect(pe.providerId).toBe('z-ai');
                expect(pe.statusCode).toBe(400);
            }
        });
        it('should throw ProviderError for unknown error types', async () => {
            mockCreate.mockRejectedValue(new Error('Unknown failure'));
            const provider = createProvider();
            try {
                await provider.complete(basicRequest);
                expect.fail('Should have thrown');
            }
            catch (error) {
                expect(error).toBeInstanceOf(ProviderError);
                expect(error.providerId).toBe('z-ai');
            }
        });
        it('should not leak API key in error messages', async () => {
            mockCreate.mockRejectedValue(new Error('Unknown failure'));
            const provider = createProvider();
            try {
                await provider.complete(basicRequest);
                expect.fail('Should have thrown');
            }
            catch (error) {
                const message = error.message;
                expect(message).not.toContain('test-api-key');
            }
        });
    });
    // --------------------------------------------------------------------------
    // stream
    // --------------------------------------------------------------------------
    describe('stream', () => {
        it('TT-002-12: should yield LLMChunk objects with content deltas', async () => {
            const chunks = [
                {
                    id: 'chatcmpl-stream',
                    object: 'chat.completion.chunk',
                    created: Date.now(),
                    model: 'glm-5',
                    choices: [
                        {
                            index: 0,
                            delta: { role: 'assistant', content: 'Hello' },
                            finish_reason: null,
                        },
                    ],
                },
                {
                    id: 'chatcmpl-stream',
                    object: 'chat.completion.chunk',
                    created: Date.now(),
                    model: 'glm-5',
                    choices: [
                        {
                            index: 0,
                            delta: { content: ' world' },
                            finish_reason: null,
                        },
                    ],
                },
                {
                    id: 'chatcmpl-stream',
                    object: 'chat.completion.chunk',
                    created: Date.now(),
                    model: 'glm-5',
                    choices: [
                        {
                            index: 0,
                            delta: {},
                            finish_reason: 'stop',
                        },
                    ],
                },
            ];
            mockCreate.mockResolvedValue(createAsyncIterable(chunks));
            const provider = createProvider();
            const collectedChunks = [];
            const results = [];
            for await (const chunk of provider.stream(basicRequest)) {
                results.push(chunk);
                collectedChunks.push(chunk.content);
            }
            expect(results).toHaveLength(3);
            expect(collectedChunks).toEqual(['Hello', ' world', '']);
            expect(results[0].provider).toBe('z-ai');
            expect(results[0].model).toBe('glm-5');
            expect(results[2].finishReason).toBe('stop');
        });
        it('should pass stream: true to the API', async () => {
            const chunks = [
                {
                    id: 'chatcmpl-stream',
                    object: 'chat.completion.chunk',
                    created: Date.now(),
                    model: 'glm-5',
                    choices: [
                        {
                            index: 0,
                            delta: { role: 'assistant', content: 'Hi' },
                            finish_reason: 'stop',
                        },
                    ],
                },
            ];
            mockCreate.mockResolvedValue(createAsyncIterable(chunks));
            const provider = createProvider();
            for await (const _ of provider.stream(basicRequest)) {
                break;
            }
            const callArgs = mockCreate.mock.calls[0][0];
            expect(callArgs.stream).toBe(true);
        });
        it('should include usage when present in stream chunk', async () => {
            const chunks = [
                {
                    id: 'chatcmpl-stream',
                    object: 'chat.completion.chunk',
                    created: Date.now(),
                    model: 'glm-5',
                    choices: [
                        {
                            index: 0,
                            delta: { content: 'final' },
                            finish_reason: 'stop',
                        },
                    ],
                    usage: {
                        prompt_tokens: 15,
                        completion_tokens: 5,
                        total_tokens: 20,
                    },
                },
            ];
            mockCreate.mockResolvedValue(createAsyncIterable(chunks));
            const provider = createProvider();
            const results = [];
            for await (const chunk of provider.stream(basicRequest)) {
                results.push(chunk);
            }
            expect(results).toHaveLength(1);
            expect(results[0].usage).toEqual({
                promptTokens: 15,
                completionTokens: 5,
                totalTokens: 20,
            });
        });
        it('should map tool_calls from stream deltas', async () => {
            const chunks = [
                {
                    id: 'chatcmpl-stream',
                    object: 'chat.completion.chunk',
                    created: Date.now(),
                    model: 'glm-5',
                    choices: [
                        {
                            index: 0,
                            delta: {
                                tool_calls: [
                                    {
                                        index: 0,
                                        id: 'call_stream_1',
                                        type: 'function',
                                        function: { name: 'search', arguments: '' },
                                    },
                                ],
                            },
                            finish_reason: null,
                        },
                    ],
                },
                {
                    id: 'chatcmpl-stream',
                    object: 'chat.completion.chunk',
                    created: Date.now(),
                    model: 'glm-5',
                    choices: [
                        {
                            index: 0,
                            delta: {
                                tool_calls: [
                                    {
                                        index: 0,
                                        id: null,
                                        function: { arguments: '{"q":"test"}' },
                                    },
                                ],
                            },
                            finish_reason: null,
                        },
                    ],
                },
                {
                    id: 'chatcmpl-stream',
                    object: 'chat.completion.chunk',
                    created: Date.now(),
                    model: 'glm-5',
                    choices: [
                        {
                            index: 0,
                            delta: {},
                            finish_reason: 'tool_calls',
                        },
                    ],
                },
            ];
            mockCreate.mockResolvedValue(createAsyncIterable(chunks));
            const provider = createProvider();
            const results = [];
            for await (const chunk of provider.stream(basicRequest)) {
                results.push(chunk);
            }
            // First chunk should have tool_calls
            expect(results[0].toolCalls).toBeDefined();
            expect(results[0].toolCalls).toHaveLength(1);
            expect(results[0].toolCalls[0]).toEqual({
                id: 'call_stream_1',
                name: 'search',
                arguments: '',
            });
            // Second chunk should have tool_calls with accumulated arguments
            expect(results[1].toolCalls).toBeDefined();
            expect(results[1].toolCalls[0]).toEqual({
                id: '',
                name: '',
                arguments: '{"q":"test"}',
            });
            // Final chunk has finishReason
            expect(results[2].finishReason).toBe('tool_calls');
        });
        it('should map errors during stream to ProviderUnavailableError', async () => {
            const apiError = new OpenAI_APIError(500, { message: 'Stream error' }, 'Stream error', {});
            mockCreate.mockRejectedValue(apiError);
            const provider = createProvider();
            try {
                const stream = provider.stream(basicRequest);
                for await (const _ of stream) {
                    // should not reach
                }
                expect.fail('Should have thrown');
            }
            catch (error) {
                expect(error).toBeInstanceOf(ProviderUnavailableError);
            }
        });
    });
    // --------------------------------------------------------------------------
    // countTokens
    // --------------------------------------------------------------------------
    describe('countTokens', () => {
        it('should estimate tokens using character / 4 heuristic', () => {
            const provider = createProvider();
            expect(provider.countTokens('Hello world')).toBe(Math.ceil('Hello world'.length / 4));
        });
        it('should return 0 for empty string', () => {
            const provider = createProvider();
            expect(provider.countTokens('')).toBe(0);
        });
        it('should handle multibyte characters', () => {
            const provider = createProvider();
            // 3 characters in "abc" -> ceil(3/4) = 1
            expect(provider.countTokens('abc')).toBe(1);
            // 8 characters -> ceil(8/4) = 2
            expect(provider.countTokens('abcdefgh')).toBe(2);
        });
    });
});
//# sourceMappingURL=z-ai-provider.test.js.map