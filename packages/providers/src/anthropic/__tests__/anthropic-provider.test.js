/**
 * @osai/providers -- Anthropic Provider Tests (DOMAIN-008)
 *
 * Unit tests for AnthropicProvider with mocked Anthropic SDK.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AnthropicProvider } from '../anthropic-provider.js';
import { ProviderStatus } from '../../types.js';
import { RateLimitError, ProviderUnavailableError, AuthError, ProviderError } from '../../errors.js';
// ---------------------------------------------------------------------------
// Test Setup
// ---------------------------------------------------------------------------
const TEST_CONFIG = {
    id: 'anthropic',
    name: 'Anthropic Claude',
    baseUrl: 'https://api.anthropic.com',
    apiKeys: ['sk-ant-test-key'],
    defaultModel: 'claude-sonnet-4-5-20250929',
    timeoutMs: 5000,
};
function createProvider(config = TEST_CONFIG) {
    return new AnthropicProvider(config);
}
// ---------------------------------------------------------------------------
// Error factory helpers (duck-typed to match Anthropic error shapes)
// ---------------------------------------------------------------------------
class MockAPIError extends Error {
    status;
    headers;
    constructor(message, status, headers) {
        super(message);
        this.name = 'APIError';
        this.status = status;
        this.headers = headers;
    }
}
function createAPIError(message, status, headers) {
    return new MockAPIError(message, status, headers);
}
function createConnectionError(message) {
    const err = new Error(message);
    err.name = 'APIConnectionError';
    return err;
}
// ---------------------------------------------------------------------------
// Mock Anthropic SDK
// ---------------------------------------------------------------------------
const { mockCountTokens, mockCreate, mockAnthropicConstructor } = vi.hoisted(() => {
    const mockCountTokens = vi.fn();
    const mockCreate = vi.fn();
    const mockAnthropicConstructor = vi.fn().mockImplementation(() => ({
        messages: {
            countTokens: mockCountTokens,
            create: mockCreate,
        },
    }));
    return { mockCountTokens, mockCreate, mockAnthropicConstructor };
});
vi.mock('@anthropic-ai/sdk', () => ({
    default: mockAnthropicConstructor,
}));
// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('AnthropicProvider', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockAnthropicConstructor.mockImplementation(() => ({
            messages: {
                countTokens: mockCountTokens,
                create: mockCreate,
            },
        }));
    });
    afterEach(() => {
        vi.restoreAllMocks();
    });
    // -- Constructor ----------------------------------------------------------
    describe('constructor', () => {
        it('should set id and name from config', () => {
            const provider = createProvider();
            expect(provider.id).toBe('anthropic');
            expect(provider.name).toBe('Anthropic Claude');
        });
        it('should create Anthropic client with first API key', () => {
            createProvider();
            expect(mockAnthropicConstructor).toHaveBeenCalledWith(expect.objectContaining({
                apiKey: 'sk-ant-test-key',
            }));
        });
        it('should pass baseURL to Anthropic client', () => {
            createProvider();
            expect(mockAnthropicConstructor).toHaveBeenCalledWith(expect.objectContaining({
                baseURL: 'https://api.anthropic.com',
            }));
        });
        it('should pass timeout to Anthropic client', () => {
            createProvider();
            expect(mockAnthropicConstructor).toHaveBeenCalledWith(expect.objectContaining({
                timeout: 5000,
            }));
        });
        it('should use default timeout when not specified', () => {
            const config = {
                ...TEST_CONFIG,
                timeoutMs: undefined,
            };
            createProvider(config);
            expect(mockAnthropicConstructor).toHaveBeenCalledWith(expect.objectContaining({
                timeout: 30_000,
            }));
        });
    });
    // -- isAvailable ----------------------------------------------------------
    describe('isAvailable', () => {
        it('should return true when countTokens succeeds', async () => {
            mockCountTokens.mockResolvedValue({ input_tokens: 10 });
            const provider = createProvider();
            const result = await provider.isAvailable();
            expect(result).toBe(true);
            expect(provider.getStatus()).toBe(ProviderStatus.Available);
        });
        it('should return true when rate limited (429)', async () => {
            mockCountTokens.mockRejectedValue(createAPIError('Rate limited', 429));
            const provider = createProvider();
            const result = await provider.isAvailable();
            expect(result).toBe(true);
            expect(provider.getStatus()).toBe(ProviderStatus.RateLimited);
        });
        it('should return false when auth fails (401)', async () => {
            mockCountTokens.mockRejectedValue(createAPIError('Unauthorized', 401));
            const provider = createProvider();
            const result = await provider.isAvailable();
            expect(result).toBe(false);
            expect(provider.getStatus()).toBe(ProviderStatus.Unavailable);
        });
        it('should return false when forbidden (403)', async () => {
            mockCountTokens.mockRejectedValue(createAPIError('Forbidden', 403));
            const provider = createProvider();
            const result = await provider.isAvailable();
            expect(result).toBe(false);
            expect(provider.getStatus()).toBe(ProviderStatus.Unavailable);
        });
        it('should return true for other 4xx errors (API reachable)', async () => {
            mockCountTokens.mockRejectedValue(createAPIError('Bad request', 400));
            const provider = createProvider();
            const result = await provider.isAvailable();
            expect(result).toBe(true);
            expect(provider.getStatus()).toBe(ProviderStatus.Available);
        });
        it('should return false on connection error', async () => {
            mockCountTokens.mockRejectedValue(createConnectionError('Connection refused'));
            const provider = createProvider();
            const result = await provider.isAvailable();
            expect(result).toBe(false);
            expect(provider.getStatus()).toBe(ProviderStatus.Unavailable);
        });
        it('should return false on 5xx errors', async () => {
            mockCountTokens.mockRejectedValue(createAPIError('Internal server error', 500));
            const provider = createProvider();
            const result = await provider.isAvailable();
            expect(result).toBe(false);
            expect(provider.getStatus()).toBe(ProviderStatus.Unavailable);
        });
    });
    // -- complete -------------------------------------------------------------
    describe('complete', () => {
        const basicRequest = {
            model: 'claude-sonnet-4-5-20250929',
            messages: [
                { role: 'system', content: 'Be helpful.' },
                { role: 'user', content: 'Hello' },
            ],
        };
        it('should extract system prompt and pass to Anthropic API (TT-002-30)', async () => {
            mockCreate.mockResolvedValue({
                id: 'msg_123',
                type: 'message',
                role: 'assistant',
                content: [{ type: 'text', text: 'Hello!', citations: null }],
                model: 'claude-sonnet-4-5-20250929',
                stop_reason: 'end_turn',
                stop_sequence: null,
                usage: { input_tokens: 20, output_tokens: 5, cache_creation: null, cache_read_input_tokens: null },
            });
            const provider = createProvider();
            await provider.complete(basicRequest);
            expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({
                system: 'Be helpful.',
                messages: [{ role: 'user', content: 'Hello' }],
            }));
        });
        it('should return correct LLMResponse', async () => {
            mockCreate.mockResolvedValue({
                id: 'msg_123',
                type: 'message',
                role: 'assistant',
                content: [{ type: 'text', text: 'Hi there!', citations: null }],
                model: 'claude-sonnet-4-5-20250929',
                stop_reason: 'end_turn',
                stop_sequence: null,
                usage: { input_tokens: 15, output_tokens: 3, cache_creation: null, cache_read_input_tokens: null },
            });
            const provider = createProvider();
            const response = await provider.complete(basicRequest);
            expect(response.content).toBe('Hi there!');
            expect(response.model).toBe('claude-sonnet-4-5-20250929');
            expect(response.provider).toBe('anthropic');
            expect(response.usage).toEqual({
                promptTokens: 15,
                completionTokens: 3,
                totalTokens: 18,
            });
            expect(response.finishReason).toBe('stop');
        });
        it('should convert tool_use blocks to ToolCall[] (TT-002-31)', async () => {
            mockCreate.mockResolvedValue({
                id: 'msg_456',
                type: 'message',
                role: 'assistant',
                content: [
                    { type: 'text', text: 'Checking weather.', citations: null },
                    {
                        type: 'tool_use',
                        id: 'toolu_01',
                        name: 'get_weather',
                        input: { location: 'Moscow' },
                        caller: { type: 'direct' },
                    },
                ],
                model: 'claude-sonnet-4-5-20250929',
                stop_reason: 'tool_use',
                stop_sequence: null,
                usage: { input_tokens: 50, output_tokens: 20, cache_creation: null, cache_read_input_tokens: null },
            });
            const provider = createProvider();
            const response = await provider.complete(basicRequest);
            expect(response.content).toBe('Checking weather.');
            expect(response.toolCalls).toHaveLength(1);
            expect(response.toolCalls?.[0]).toEqual({
                id: 'toolu_01',
                name: 'get_weather',
                arguments: '{"location":"Moscow"}',
            });
            expect(response.finishReason).toBe('tool_calls');
        });
        it('should pass tools when provided', async () => {
            mockCreate.mockResolvedValue({
                id: 'msg_789',
                type: 'message',
                role: 'assistant',
                content: [{ type: 'text', text: 'Done', citations: null }],
                model: 'claude-sonnet-4-5-20250929',
                stop_reason: 'end_turn',
                stop_sequence: null,
                usage: { input_tokens: 30, output_tokens: 5, cache_creation: null, cache_read_input_tokens: null },
            });
            const tools = [
                {
                    type: 'function',
                    function: {
                        name: 'get_weather',
                        description: 'Get weather',
                        parameters: { type: 'object', properties: { location: { type: 'string' } } },
                    },
                },
            ];
            const provider = createProvider();
            await provider.complete({ ...basicRequest, tools });
            expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({
                tools: expect.arrayContaining([
                    expect.objectContaining({
                        name: 'get_weather',
                    }),
                ]),
            }));
        });
        it('should pass temperature and maxTokens', async () => {
            mockCreate.mockResolvedValue({
                id: 'msg_t',
                type: 'message',
                role: 'assistant',
                content: [{ type: 'text', text: '', citations: null }],
                model: 'claude-sonnet-4-5-20250929',
                stop_reason: 'end_turn',
                stop_sequence: null,
                usage: { input_tokens: 10, output_tokens: 1, cache_creation: null, cache_read_input_tokens: null },
            });
            const provider = createProvider();
            await provider.complete({
                ...basicRequest,
                temperature: 0.7,
                maxTokens: 1024,
            });
            expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({
                temperature: 0.7,
                max_tokens: 1024,
            }));
        });
        it('should pass stop sequences', async () => {
            mockCreate.mockResolvedValue({
                id: 'msg_s',
                type: 'message',
                role: 'assistant',
                content: [{ type: 'text', text: '', citations: null }],
                model: 'claude-sonnet-4-5-20250929',
                stop_reason: 'stop_sequence',
                stop_sequence: '\n',
                usage: { input_tokens: 10, output_tokens: 1, cache_creation: null, cache_read_input_tokens: null },
            });
            const provider = createProvider();
            await provider.complete({
                ...basicRequest,
                stopSequences: ['\n', 'STOP'],
            });
            expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({
                stop_sequences: ['\n', 'STOP'],
            }));
        });
        it('should map RateLimitError (429)', async () => {
            mockCreate.mockRejectedValue(createAPIError('Rate limited', 429, { 'retry-after': '5' }));
            const provider = createProvider();
            await expect(provider.complete(basicRequest)).rejects.toThrow(RateLimitError);
        });
        it('should map overloaded_error (529) to ProviderUnavailableError', async () => {
            mockCreate.mockRejectedValue(createAPIError('Overloaded', 529));
            const provider = createProvider();
            await expect(provider.complete(basicRequest)).rejects.toThrow(ProviderUnavailableError);
        });
        it('should map 530 to ProviderUnavailableError', async () => {
            mockCreate.mockRejectedValue(createAPIError('Overloaded', 530));
            const provider = createProvider();
            await expect(provider.complete(basicRequest)).rejects.toThrow(ProviderUnavailableError);
        });
        it('should map auth errors (401/403) to AuthError', async () => {
            mockCreate.mockRejectedValue(createAPIError('Invalid API key', 401));
            const provider = createProvider();
            await expect(provider.complete(basicRequest)).rejects.toThrow(AuthError);
        });
        it('should map connection errors to ProviderUnavailableError', async () => {
            mockCreate.mockRejectedValue(createConnectionError('ECONNREFUSED'));
            const provider = createProvider();
            await expect(provider.complete(basicRequest)).rejects.toThrow(ProviderUnavailableError);
        });
        it('should use default max_tokens when not specified', async () => {
            mockCreate.mockResolvedValue({
                id: 'msg_d',
                type: 'message',
                role: 'assistant',
                content: [{ type: 'text', text: '', citations: null }],
                model: 'claude-sonnet-4-5-20250929',
                stop_reason: 'end_turn',
                stop_sequence: null,
                usage: { input_tokens: 10, output_tokens: 1, cache_creation: null, cache_read_input_tokens: null },
            });
            const provider = createProvider();
            await provider.complete({
                ...basicRequest,
                maxTokens: undefined,
            });
            expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({
                max_tokens: 4096,
            }));
        });
        it('should extract retry-after from RateLimitError headers', async () => {
            mockCreate.mockRejectedValue(createAPIError('Rate limited', 429, { 'retry-after': '10' }));
            const provider = createProvider();
            try {
                await provider.complete(basicRequest);
                expect.fail('Should have thrown');
            }
            catch (error) {
                expect(error).toBeInstanceOf(RateLimitError);
                expect(error.retryAfterMs).toBe(10_000);
            }
        });
    });
    // -- stream ---------------------------------------------------------------
    describe('stream', () => {
        const basicRequest = {
            model: 'claude-sonnet-4-5-20250929',
            messages: [
                { role: 'user', content: 'Hello' },
            ],
        };
        it('should yield text chunks from content_block_delta (TT-002-32)', async () => {
            const events = [
                { type: 'message_start', message: { id: 'msg_1', type: 'message', role: 'assistant', content: [], model: 'claude-sonnet-4-5-20250929', stop_reason: null, stop_sequence: null, usage: { input_tokens: 10, output_tokens: 0, cache_creation: null, cache_read_input_tokens: null } } },
                { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '', citations: null } },
                { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Hello ' } },
                { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'from ' } },
                { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Claude' } },
                { type: 'content_block_stop', index: 0 },
                { type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null, container: null }, usage: { input_tokens: 10, output_tokens: 5, cache_creation_input_tokens: null, cache_read_input_tokens: null, server_tool_use: null } },
                { type: 'message_stop' },
            ];
            mockCreate.mockResolvedValue(createAsyncIterable(events));
            const provider = createProvider();
            const chunks = [];
            for await (const chunk of provider.stream(basicRequest)) {
                chunks.push(chunk.content);
            }
            expect(chunks).toEqual(['Hello ', 'from ', 'Claude', '']);
        });
        it('should accumulate tool input JSON from input_json_delta events', async () => {
            const events = [
                { type: 'message_start', message: { id: 'msg_2', type: 'message', role: 'assistant', content: [], model: 'claude-sonnet-4-5-20250929', stop_reason: null, stop_sequence: null, usage: { input_tokens: 10, output_tokens: 0, cache_creation: null, cache_read_input_tokens: null } } },
                { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '', citations: null } },
                { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: '' } },
                { type: 'content_block_stop', index: 0 },
                { type: 'content_block_start', index: 1, content_block: { type: 'tool_use', id: 'toolu_s1', name: 'get_weather', input: {}, caller: { type: 'direct' } } },
                { type: 'content_block_delta', index: 1, delta: { type: 'input_json_delta', partial_json: '{"location":"' } },
                { type: 'content_block_delta', index: 1, delta: { type: 'input_json_delta', partial_json: 'Moscow"}' } },
                { type: 'content_block_stop', index: 1 },
                { type: 'message_delta', delta: { stop_reason: 'tool_use', stop_sequence: null, container: null }, usage: { input_tokens: 50, output_tokens: 30, cache_creation_input_tokens: null, cache_read_input_tokens: null, server_tool_use: null } },
                { type: 'message_stop' },
            ];
            mockCreate.mockResolvedValue(createAsyncIterable(events));
            const provider = createProvider();
            const chunks = [];
            for await (const chunk of provider.stream(basicRequest)) {
                chunks.push(chunk);
            }
            // The final chunk should contain tool calls
            const finalChunk = chunks[chunks.length - 1];
            expect(finalChunk?.finishReason).toBe('tool_calls');
            expect(finalChunk?.toolCalls).toHaveLength(1);
            expect(finalChunk?.toolCalls?.[0]).toEqual({
                id: 'toolu_s1',
                name: 'get_weather',
                arguments: '{"location":"Moscow"}',
            });
        });
        it('should yield chunks with correct provider and model', async () => {
            const events = [
                { type: 'message_start', message: { id: 'msg_3', type: 'message', role: 'assistant', content: [], model: 'claude-sonnet-4-5-20250929', stop_reason: null, stop_sequence: null, usage: { input_tokens: 10, output_tokens: 0, cache_creation: null, cache_read_input_tokens: null } } },
                { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '', citations: null } },
                { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'test' } },
                { type: 'content_block_stop', index: 0 },
                { type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null, container: null }, usage: { input_tokens: 10, output_tokens: 1, cache_creation_input_tokens: null, cache_read_input_tokens: null, server_tool_use: null } },
                { type: 'message_stop' },
            ];
            mockCreate.mockResolvedValue(createAsyncIterable(events));
            const provider = createProvider();
            const chunks = [];
            for await (const chunk of provider.stream(basicRequest)) {
                chunks.push({ provider: chunk.provider, model: chunk.model });
            }
            for (const c of chunks) {
                expect(c.provider).toBe('anthropic');
                expect(c.model).toBe('claude-sonnet-4-5-20250929');
            }
        });
        it('should pass system prompt in stream request', async () => {
            const events = [
                { type: 'message_start', message: { id: 'msg_4', type: 'message', role: 'assistant', content: [], model: 'claude-sonnet-4-5-20250929', stop_reason: null, stop_sequence: null, usage: { input_tokens: 10, output_tokens: 0, cache_creation: null, cache_read_input_tokens: null } } },
                { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '', citations: null } },
                { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'ok' } },
                { type: 'content_block_stop', index: 0 },
                { type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null, container: null }, usage: { input_tokens: 10, output_tokens: 1, cache_creation_input_tokens: null, cache_read_input_tokens: null, server_tool_use: null } },
                { type: 'message_stop' },
            ];
            mockCreate.mockResolvedValue(createAsyncIterable(events));
            const requestWithSystem = {
                model: 'claude-sonnet-4-5-20250929',
                messages: [
                    { role: 'system', content: 'Be brief.' },
                    { role: 'user', content: 'Hi' },
                ],
            };
            const provider = createProvider();
            for await (const _chunk of provider.stream(requestWithSystem)) {
                // consume
            }
            expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({
                system: 'Be brief.',
            }));
        });
        it('should include usage in final chunk', async () => {
            const events = [
                { type: 'message_start', message: { id: 'msg_u', type: 'message', role: 'assistant', content: [], model: 'claude-sonnet-4-5-20250929', stop_reason: null, stop_sequence: null, usage: { input_tokens: 10, output_tokens: 0, cache_creation: null, cache_read_input_tokens: null } } },
                { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '', citations: null } },
                { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'hi' } },
                { type: 'content_block_stop', index: 0 },
                { type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null, container: null }, usage: { input_tokens: 15, output_tokens: 3, cache_creation_input_tokens: null, cache_read_input_tokens: null, server_tool_use: null } },
                { type: 'message_stop' },
            ];
            mockCreate.mockResolvedValue(createAsyncIterable(events));
            const provider = createProvider();
            const chunks = [];
            for await (const chunk of provider.stream(basicRequest)) {
                chunks.push(chunk);
            }
            const finalChunk = chunks[chunks.length - 1];
            expect(finalChunk?.usage).toEqual({
                promptTokens: 15,
                completionTokens: 3,
                totalTokens: 18,
            });
        });
        it('should map stream errors to ProviderError hierarchy', async () => {
            mockCreate.mockRejectedValue(createAPIError('Server error', 500));
            const provider = createProvider();
            try {
                for await (const _chunk of provider.stream(basicRequest)) {
                    // empty
                }
                expect.fail('Should have thrown');
            }
            catch (error) {
                // 500 is a generic server error, mapped to ProviderError (not ProviderUnavailableError
                // which is only for overloaded 529/530)
                expect(error).toBeInstanceOf(ProviderError);
            }
        });
    });
    // -- countTokens ----------------------------------------------------------
    describe('countTokens', () => {
        it('should estimate tokens using character-based heuristic', () => {
            const provider = createProvider();
            const count = provider.countTokens('Hello world!');
            // 12 chars / 4 = 3
            expect(count).toBe(3);
        });
        it('should return at least 1 for non-empty strings', () => {
            const provider = createProvider();
            expect(provider.countTokens('a')).toBe(1);
        });
        it('should return 0 for empty string', () => {
            const provider = createProvider();
            expect(provider.countTokens('')).toBe(0);
        });
    });
});
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
async function* createAsyncIterable(items) {
    for (const item of items) {
        yield item;
    }
}
//# sourceMappingURL=anthropic-provider.test.js.map