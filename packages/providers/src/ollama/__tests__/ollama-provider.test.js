/**
 * @osai/providers -- Ollama Provider Tests (DOMAIN-008, T-006)
 *
 * Unit tests for OllamaProvider with mocked fetch (global).
 * Tests cover: isAvailable(), complete(), stream(), countTokens(), error mapping.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OllamaProvider } from '../ollama-provider.js';
import { ProviderUnavailableError, ProviderError } from '../../errors.js';
// ---------------------------------------------------------------------------
// Mock global fetch
// ---------------------------------------------------------------------------
const mockFetch = vi.fn();
// Store original fetch to restore after tests
const originalFetch = globalThis.fetch;
beforeEach(() => {
    vi.clearAllMocks();
    globalThis.fetch = mockFetch;
});
afterEach(() => {
    globalThis.fetch = originalFetch;
});
// ---------------------------------------------------------------------------
// Helper: create a fake Response with given status and body
// ---------------------------------------------------------------------------
function createJsonResponse(body, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });
}
function createNdjsonStream(lines) {
    const encoder = new TextEncoder();
    // Ollama NDJSON: each line is a JSON object terminated by \n
    const data = lines.join('\n');
    let offset = 0;
    return new ReadableStream({
        pull(controller) {
            if (offset < data.length) {
                // Feed in small chunks to simulate real streaming
                const chunkSize = Math.min(64, data.length - offset);
                controller.enqueue(encoder.encode(data.slice(offset, offset + chunkSize)));
                offset += chunkSize;
            }
            else {
                controller.close();
            }
        },
    });
}
// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------
const DEFAULT_CONFIG = {
    id: 'ollama',
    name: 'Ollama (Local)',
    baseUrl: 'http://localhost:11434',
    apiKeys: [],
    defaultModel: 'llama3',
};
const SIMPLE_MESSAGES = [
    { role: 'user', content: 'Hello, how are you?' },
];
const SIMPLE_REQUEST = {
    model: 'llama3',
    messages: SIMPLE_MESSAGES,
};
// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('OllamaProvider', () => {
    let provider;
    beforeEach(() => {
        vi.clearAllMocks();
        globalThis.fetch = mockFetch;
        provider = new OllamaProvider(DEFAULT_CONFIG);
    });
    // -------------------------------------------------------------------------
    // Construction
    // -------------------------------------------------------------------------
    describe('construction', () => {
        it('should set id and name from config', () => {
            expect(provider.id).toBe('ollama');
            expect(provider.name).toBe('Ollama (Local)');
        });
        it('should use default baseUrl when not overridden', () => {
            const p = new OllamaProvider({
                ...DEFAULT_CONFIG,
                baseUrl: 'http://localhost:11434',
            });
            expect(p.id).toBe('ollama');
        });
        it('should use default model llama3 when not overridden', () => {
            const p = new OllamaProvider(DEFAULT_CONFIG);
            // defaultModel is accessible via config
            expect(p['config'].defaultModel).toBe('llama3');
        });
        it('should accept custom model', () => {
            const p = new OllamaProvider({
                ...DEFAULT_CONFIG,
                defaultModel: 'mistral',
            });
            expect(p['config'].defaultModel).toBe('mistral');
        });
        it('should accept custom baseUrl', () => {
            const p = new OllamaProvider({
                ...DEFAULT_CONFIG,
                baseUrl: 'http://192.168.1.100:11434',
            });
            expect(p['config'].baseUrl).toBe('http://192.168.1.100:11434');
        });
        it('should support partial config with defaults', () => {
            const p = new OllamaProvider();
            expect(p.id).toBe('ollama');
            expect(p.name).toBe('Ollama (Local)');
            expect(p['config'].baseUrl).toBe('http://localhost:11434');
            expect(p['config'].defaultModel).toBe('llama3');
        });
    });
    // -------------------------------------------------------------------------
    // isAvailable() -- TT-002-50
    // -------------------------------------------------------------------------
    describe('isAvailable', () => {
        it('should return true when GET /api/tags succeeds (TT-002-50)', async () => {
            mockFetch.mockResolvedValue(createJsonResponse({
                model_names: ['llama3', 'mistral'],
                models: [
                    { name: 'llama3', modified_at: '2024-01-01', size: 4000000000 },
                    { name: 'mistral', modified_at: '2024-01-01', size: 4000000000 },
                ],
            }));
            const result = await provider.isAvailable();
            expect(result).toBe(true);
            expect(mockFetch).toHaveBeenCalledTimes(1);
            const calledUrl = mockFetch.mock.calls[0][0];
            expect(calledUrl).toContain('/api/tags');
            expect(calledUrl).toContain('http://localhost:11434');
        });
        it('should return false when Ollama is not running (connection refused)', async () => {
            mockFetch.mockRejectedValue(new TypeError('fetch failed'));
            const result = await provider.isAvailable();
            expect(result).toBe(false);
        });
        it('should return false when fetch rejects with any error', async () => {
            mockFetch.mockRejectedValue(new Error('ECONNREFUSED'));
            const result = await provider.isAvailable();
            expect(result).toBe(false);
        });
        it('should return false when /api/tags returns non-200 status', async () => {
            mockFetch.mockResolvedValue(createJsonResponse({ error: 'not found' }, 404));
            const result = await provider.isAvailable();
            expect(result).toBe(false);
        });
        it('should return false when /api/tags returns 500', async () => {
            mockFetch.mockResolvedValue(createJsonResponse({ error: 'internal server error' }, 500));
            const result = await provider.isAvailable();
            expect(result).toBe(false);
        });
        it('should set status to Available after successful check', async () => {
            mockFetch.mockResolvedValue(createJsonResponse({
                model_names: ['llama3'],
                models: [],
            }));
            await provider.isAvailable();
            expect(provider.getStatus()).toBe('available');
        });
        it('should set status to Unavailable after failed check', async () => {
            mockFetch.mockRejectedValue(new TypeError('fetch failed'));
            await provider.isAvailable();
            expect(provider.getStatus()).toBe('unavailable');
        });
    });
    // -------------------------------------------------------------------------
    // complete() -- TT-002-51
    // -------------------------------------------------------------------------
    describe('complete', () => {
        it('should call /api/chat with correct endpoint (TT-002-51)', async () => {
            const ollamaResponse = {
                model: 'llama3',
                created_at: '2024-01-01T00:00:00Z',
                message: { role: 'assistant', content: 'I am fine, thank you!' },
                done: true,
                total_duration: 1000000000,
                eval_count: 8,
                prompt_eval_count: 10,
            };
            mockFetch.mockResolvedValue(createJsonResponse(ollamaResponse));
            await provider.complete(SIMPLE_REQUEST);
            expect(mockFetch).toHaveBeenCalledTimes(1);
            const callArgs = mockFetch.mock.calls[0];
            const calledUrl = callArgs[0];
            expect(calledUrl).toContain('/api/chat');
            const options = callArgs[1];
            expect(options.method).toBe('POST');
            const body = JSON.parse(options.body);
            expect(body.model).toBe('llama3');
            expect(body.stream).toBe(false);
            expect(body.messages).toEqual([
                { role: 'user', content: 'Hello, how are you?' },
            ]);
        });
        it('should return LLMResponse with content and usage', async () => {
            const ollamaResponse = {
                model: 'llama3',
                created_at: '2024-01-01T00:00:00Z',
                message: { role: 'assistant', content: 'Hello! How can I help you?' },
                done: true,
                total_duration: 1000000000,
                eval_count: 6,
                prompt_eval_count: 15,
            };
            mockFetch.mockResolvedValue(createJsonResponse(ollamaResponse));
            const result = await provider.complete(SIMPLE_REQUEST);
            expect(result.content).toBe('Hello! How can I help you?');
            expect(result.model).toBe('llama3');
            expect(result.provider).toBe('ollama');
            expect(result.usage.promptTokens).toBe(15);
            expect(result.usage.completionTokens).toBe(6);
            expect(result.usage.totalTokens).toBe(21);
        });
        it('should pass temperature and maxTokens to API', async () => {
            const ollamaResponse = {
                model: 'llama3',
                created_at: '2024-01-01T00:00:00Z',
                message: { role: 'assistant', content: 'Creative response' },
                done: true,
                eval_count: 5,
                prompt_eval_count: 10,
            };
            mockFetch.mockResolvedValue(createJsonResponse(ollamaResponse));
            await provider.complete({
                ...SIMPLE_REQUEST,
                temperature: 0.7,
                maxTokens: 100,
            });
            const options = mockFetch.mock.calls[0][1];
            const body = JSON.parse(options.body);
            expect(body.options?.temperature).toBe(0.7);
            expect(body.options?.num_predict).toBe(100);
        });
        it('should pass stop sequences to API', async () => {
            const ollamaResponse = {
                model: 'llama3',
                created_at: '2024-01-01T00:00:00Z',
                message: { role: 'assistant', content: 'partial' },
                done: true,
                eval_count: 3,
                prompt_eval_count: 10,
            };
            mockFetch.mockResolvedValue(createJsonResponse(ollamaResponse));
            await provider.complete({
                ...SIMPLE_REQUEST,
                stopSequences: ['\n', '---'],
            });
            const options = mockFetch.mock.calls[0][1];
            const body = JSON.parse(options.body);
            expect(body.options?.stop).toEqual(['\n', '---']);
        });
        it('should pass tools to API', async () => {
            const ollamaResponse = {
                model: 'llama3',
                created_at: '2024-01-01T00:00:00Z',
                message: {
                    role: 'assistant',
                    content: '',
                    tool_calls: [
                        {
                            function: { name: 'get_weather', arguments: { city: 'London' } },
                        },
                    ],
                },
                done: true,
                eval_count: 30,
                prompt_eval_count: 50,
            };
            mockFetch.mockResolvedValue(createJsonResponse(ollamaResponse));
            const tools = [
                {
                    type: 'function',
                    function: {
                        name: 'get_weather',
                        description: 'Get weather',
                        parameters: { type: 'object', properties: { city: { type: 'string' } } },
                    },
                },
            ];
            await provider.complete({ ...SIMPLE_REQUEST, tools });
            const options = mockFetch.mock.calls[0][1];
            const body = JSON.parse(options.body);
            expect(body.tools).toBeDefined();
            expect(body.tools).toHaveLength(1);
            expect(body.tools[0].function.name).toBe('get_weather');
        });
        it('should map tool_calls in response', async () => {
            const ollamaResponse = {
                model: 'llama3',
                created_at: '2024-01-01T00:00:00Z',
                message: {
                    role: 'assistant',
                    content: '',
                    tool_calls: [
                        {
                            function: { name: 'get_weather', arguments: { city: 'London' } },
                        },
                    ],
                },
                done: true,
                eval_count: 30,
                prompt_eval_count: 50,
            };
            mockFetch.mockResolvedValue(createJsonResponse(ollamaResponse));
            const result = await provider.complete(SIMPLE_REQUEST);
            expect(result.toolCalls).toBeDefined();
            expect(result.toolCalls).toHaveLength(1);
            expect(result.toolCalls[0]).toEqual({
                id: expect.any(String),
                name: 'get_weather',
                arguments: JSON.stringify({ city: 'London' }),
            });
        });
        it('should use default model when request.model is empty', async () => {
            const ollamaResponse = {
                model: 'llama3',
                created_at: '2024-01-01T00:00:00Z',
                message: { role: 'assistant', content: 'response' },
                done: true,
                eval_count: 5,
                prompt_eval_count: 10,
            };
            mockFetch.mockResolvedValue(createJsonResponse(ollamaResponse));
            const requestWithNoModel = {
                model: '',
                messages: SIMPLE_MESSAGES,
            };
            await provider.complete(requestWithNoModel);
            const options = mockFetch.mock.calls[0][1];
            const body = JSON.parse(options.body);
            expect(body.model).toBe('llama3');
        });
        it('should use estimated usage when eval_count is not provided', async () => {
            const ollamaResponse = {
                model: 'llama3',
                created_at: '2024-01-01T00:00:00Z',
                message: { role: 'assistant', content: 'Hello!' },
                done: true,
            };
            mockFetch.mockResolvedValue(createJsonResponse(ollamaResponse));
            const result = await provider.complete(SIMPLE_REQUEST);
            expect(result.usage.promptTokens).toBeGreaterThan(0);
            expect(result.usage.completionTokens).toBeGreaterThan(0);
        });
        it('should throw ProviderUnavailableError on connection error', async () => {
            mockFetch.mockRejectedValue(new TypeError('fetch failed'));
            await expect(provider.complete(SIMPLE_REQUEST)).rejects.toThrow(ProviderUnavailableError);
        });
        it('should throw ProviderError on non-success HTTP status', async () => {
            mockFetch.mockResolvedValue(createJsonResponse({ error: 'model not found' }, 404));
            await expect(provider.complete(SIMPLE_REQUEST)).rejects.toThrow(ProviderError);
        });
    });
    // -------------------------------------------------------------------------
    // stream() -- TT-002-52
    // -------------------------------------------------------------------------
    describe('stream', () => {
        it('should parse newline-delimited JSON stream (TT-002-52)', async () => {
            const ndjsonLines = [
                JSON.stringify({
                    model: 'llama3',
                    created_at: '2024-01-01T00:00:00Z',
                    message: { role: 'assistant', content: 'Hello' },
                    done: false,
                }),
                JSON.stringify({
                    model: 'llama3',
                    created_at: '2024-01-01T00:00:00Z',
                    message: { role: 'assistant', content: ' world' },
                    done: false,
                }),
                JSON.stringify({
                    model: 'llama3',
                    created_at: '2024-01-01T00:00:00Z',
                    message: { role: 'assistant', content: '!' },
                    done: true,
                    eval_count: 3,
                    prompt_eval_count: 10,
                }),
            ];
            const stream = createNdjsonStream(ndjsonLines);
            mockFetch.mockResolvedValue(new Response(stream));
            const collected = [];
            for await (const chunk of provider.stream(SIMPLE_REQUEST)) {
                collected.push({ content: chunk.content, finishReason: chunk.finishReason });
            }
            expect(collected).toHaveLength(3);
            expect(collected[0]).toEqual({ content: 'Hello' });
            expect(collected[1]).toEqual({ content: ' world' });
            expect(collected[2]).toEqual({ content: '!', finishReason: 'stop' });
        });
        it('should call /api/chat with stream: true', async () => {
            const stream = createNdjsonStream([
                JSON.stringify({
                    model: 'llama3',
                    message: { role: 'assistant', content: 'test' },
                    done: true,
                }),
            ]);
            mockFetch.mockResolvedValue(new Response(stream));
            for await (const _ of provider.stream(SIMPLE_REQUEST)) {
                break;
            }
            expect(mockFetch).toHaveBeenCalledTimes(1);
            const callArgs = mockFetch.mock.calls[0];
            const calledUrl = callArgs[0];
            expect(calledUrl).toContain('/api/chat');
            const options = callArgs[1];
            const body = JSON.parse(options.body);
            expect(body.stream).toBe(true);
        });
        it('should include usage in final chunk when provided by Ollama', async () => {
            const stream = createNdjsonStream([
                JSON.stringify({
                    model: 'llama3',
                    message: { role: 'assistant', content: 'Hi' },
                    done: true,
                    eval_count: 5,
                    prompt_eval_count: 12,
                }),
            ]);
            mockFetch.mockResolvedValue(new Response(stream));
            const chunks = [];
            for await (const chunk of provider.stream(SIMPLE_REQUEST)) {
                chunks.push(chunk);
            }
            const lastChunk = chunks[0];
            expect(lastChunk.usage).toBeDefined();
            expect(lastChunk.usage.promptTokens).toBe(12);
            expect(lastChunk.usage.completionTokens).toBe(5);
            expect(lastChunk.usage.totalTokens).toBe(17);
        });
        it('should set correct provider and model on chunks', async () => {
            const stream = createNdjsonStream([
                JSON.stringify({
                    model: 'llama3',
                    message: { role: 'assistant', content: 'test' },
                    done: true,
                }),
            ]);
            mockFetch.mockResolvedValue(new Response(stream));
            for await (const chunk of provider.stream(SIMPLE_REQUEST)) {
                expect(chunk.model).toBe('llama3');
                expect(chunk.provider).toBe('ollama');
                break;
            }
        });
        it('should throw ProviderUnavailableError on connection error', async () => {
            mockFetch.mockRejectedValue(new TypeError('fetch failed'));
            const gen = provider.stream(SIMPLE_REQUEST);
            await expect((async () => {
                for await (const _ of gen) {
                    // drain
                }
            })()).rejects.toThrow(ProviderUnavailableError);
        });
        it('should throw ProviderError on non-success HTTP status', async () => {
            mockFetch.mockResolvedValue(createJsonResponse({ error: 'model not found' }, 404));
            const gen = provider.stream(SIMPLE_REQUEST);
            await expect((async () => {
                for await (const _ of gen) {
                    // drain
                }
            })()).rejects.toThrow(ProviderError);
        });
        it('should handle empty stream gracefully', async () => {
            const stream = createNdjsonStream([]);
            mockFetch.mockResolvedValue(new Response(stream));
            const collected = [];
            for await (const chunk of provider.stream(SIMPLE_REQUEST)) {
                collected.push(chunk);
            }
            expect(collected).toHaveLength(0);
        });
        it('should pass temperature and maxTokens for streaming', async () => {
            const stream = createNdjsonStream([
                JSON.stringify({
                    model: 'llama3',
                    message: { role: 'assistant', content: 'test' },
                    done: true,
                }),
            ]);
            mockFetch.mockResolvedValue(new Response(stream));
            for await (const _ of provider.stream({
                ...SIMPLE_REQUEST,
                temperature: 0.5,
                maxTokens: 200,
            })) {
                break;
            }
            const options = mockFetch.mock.calls[0][1];
            const body = JSON.parse(options.body);
            expect(body.options?.temperature).toBe(0.5);
            expect(body.options?.num_predict).toBe(200);
        });
    });
    // -------------------------------------------------------------------------
    // countTokens()
    // -------------------------------------------------------------------------
    describe('countTokens', () => {
        it('should estimate tokens using character heuristic (inherited from BaseLLMProvider)', () => {
            const text = 'Hello world!'; // 12 chars -> ceil(12/4) = 3
            expect(provider.countTokens(text)).toBe(3);
        });
        it('should return 0 for empty string', () => {
            expect(provider.countTokens('')).toBe(0);
        });
        it('should handle longer text', () => {
            const text = 'a'.repeat(100); // 100 chars -> 25 tokens
            expect(provider.countTokens(text)).toBe(25);
        });
    });
    // -------------------------------------------------------------------------
    // getStatus()
    // -------------------------------------------------------------------------
    describe('getStatus', () => {
        it('should return Unknown status initially', () => {
            expect(provider.getStatus()).toBe('unknown');
        });
        it('should return Available after successful isAvailable', async () => {
            mockFetch.mockResolvedValue(createJsonResponse({ model_names: ['llama3'], models: [] }));
            await provider.isAvailable();
            expect(provider.getStatus()).toBe('available');
        });
        it('should return Unavailable after failed isAvailable', async () => {
            mockFetch.mockRejectedValue(new TypeError('fetch failed'));
            await provider.isAvailable();
            expect(provider.getStatus()).toBe('unavailable');
        });
    });
    // -------------------------------------------------------------------------
    // Error mapping
    // -------------------------------------------------------------------------
    describe('error mapping', () => {
        it('should map connection errors to ProviderUnavailableError', async () => {
            mockFetch.mockRejectedValue(new TypeError('fetch failed'));
            await expect(provider.complete(SIMPLE_REQUEST)).rejects.toThrow(ProviderUnavailableError);
        });
        it('should map HTTP errors to ProviderError with statusCode', async () => {
            mockFetch.mockResolvedValue(createJsonResponse({ error: 'bad request' }, 400));
            try {
                await provider.complete(SIMPLE_REQUEST);
                expect.unreachable('Should have thrown');
            }
            catch (error) {
                expect(error).toBeInstanceOf(ProviderError);
                const pe = error;
                expect(pe.statusCode).toBe(400);
                expect(pe.providerId).toBe('ollama');
            }
        });
        it('should include Ollama error message in ProviderError', async () => {
            const ollamaError = { error: 'model "nonexistent" not found' };
            mockFetch.mockResolvedValue(createJsonResponse(ollamaError, 404));
            try {
                await provider.complete(SIMPLE_REQUEST);
                expect.unreachable('Should have thrown');
            }
            catch (error) {
                expect(error).toBeInstanceOf(ProviderError);
                expect(error.message).toContain('nonexistent');
            }
        });
    });
    // -------------------------------------------------------------------------
    // Request format conversion
    // -------------------------------------------------------------------------
    describe('request format', () => {
        it('should convert system messages to Ollama format', async () => {
            mockFetch.mockResolvedValue(createJsonResponse({
                model: 'llama3',
                message: { role: 'assistant', content: 'ok' },
                done: true,
                eval_count: 1,
                prompt_eval_count: 10,
            }));
            const request = {
                model: 'llama3',
                messages: [
                    { role: 'system', content: 'You are helpful.' },
                    { role: 'user', content: 'Hello' },
                ],
            };
            await provider.complete(request);
            const options = mockFetch.mock.calls[0][1];
            const body = JSON.parse(options.body);
            expect(body.messages).toHaveLength(2);
            expect(body.messages[0]).toEqual({ role: 'system', content: 'You are helpful.' });
            expect(body.messages[1]).toEqual({ role: 'user', content: 'Hello' });
        });
        it('should convert tool result messages correctly', async () => {
            mockFetch.mockResolvedValue(createJsonResponse({
                model: 'llama3',
                message: { role: 'assistant', content: 'result processed' },
                done: true,
                eval_count: 5,
                prompt_eval_count: 20,
            }));
            const request = {
                model: 'llama3',
                messages: [
                    { role: 'tool', content: '{"temp": 72}', toolCallId: 'call_1', name: 'get_weather' },
                ],
            };
            await provider.complete(request);
            const options = mockFetch.mock.calls[0][1];
            const body = JSON.parse(options.body);
            expect(body.messages[0]).toEqual({ role: 'tool', content: '{"temp": 72}' });
        });
        it('should pass tools to Ollama in correct format', async () => {
            mockFetch.mockResolvedValue(createJsonResponse({
                model: 'llama3',
                message: { role: 'assistant', content: 'ok' },
                done: true,
                eval_count: 1,
                prompt_eval_count: 15,
            }));
            const request = {
                model: 'llama3',
                messages: [{ role: 'user', content: 'What is the weather?' }],
                tools: [
                    {
                        type: 'function',
                        function: {
                            name: 'get_weather',
                            description: 'Get weather for a city',
                            parameters: {
                                type: 'object',
                                properties: {
                                    city: { type: 'string' },
                                },
                                required: ['city'],
                            },
                        },
                    },
                ],
            };
            await provider.complete(request);
            const options = mockFetch.mock.calls[0][1];
            const body = JSON.parse(options.body);
            expect(body.tools).toHaveLength(1);
            expect(body.tools[0].type).toBe('function');
            expect(body.tools[0].function.name).toBe('get_weather');
            expect(body.tools[0].function.description).toBe('Get weather for a city');
            expect(body.tools[0].function.parameters).toBeDefined();
        });
    });
});
//# sourceMappingURL=ollama-provider.test.js.map