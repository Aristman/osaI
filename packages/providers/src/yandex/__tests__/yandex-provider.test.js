/**
 * @osai/providers -- Yandex Provider Tests (DOMAIN-008)
 *
 * Unit tests for YandexProvider with mocked global fetch.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { YandexProvider } from '../yandex-provider.js';
import { ProviderStatus } from '../../types.js';
import { RateLimitError, ProviderUnavailableError, AuthError, ProviderError, } from '../../errors.js';
// ---------------------------------------------------------------------------
// Test Setup
// ---------------------------------------------------------------------------
const TEST_CATALOGUE_ID = 'b1g2v3d4e5f6g7h8i9j0';
const TEST_CONFIG = {
    id: 'yandex',
    name: 'Yandex Foundation Models',
    baseUrl: 'https://llm.api.cloud.yandex.net/foundationModels/v1',
    apiKeys: ['test-iam-token'],
    defaultModel: 'yandexgpt-32k-latest',
    timeoutMs: 5000,
    extra: {
        catalogueId: TEST_CATALOGUE_ID,
    },
};
function createProvider(config = {}) {
    const merged = {
        ...TEST_CONFIG,
        ...config,
        extra: { ...TEST_CONFIG.extra, ...config.extra },
    };
    return new YandexProvider(merged);
}
// ---------------------------------------------------------------------------
// Mock fetch
// ---------------------------------------------------------------------------
const mockFetch = vi.fn();
beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch);
});
afterEach(() => {
    vi.restoreAllMocks();
});
// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('YandexProvider', () => {
    beforeEach(() => {
        mockFetch.mockReset();
    });
    // -- Constructor ----------------------------------------------------------
    describe('constructor', () => {
        it('should set id and name from config', () => {
            const provider = createProvider();
            expect(provider.id).toBe('yandex');
            expect(provider.name).toBe('Yandex Foundation Models');
        });
        it('should extract catalogueId from extra config', () => {
            const provider = createProvider();
            expect(provider.getAuthHeader()).toBe('Bearer test-iam-token');
        });
        it('should use first API key for auth (TT-002-40)', () => {
            const provider = createProvider({
                apiKeys: ['key-1', 'key-2'],
            });
            expect(provider.getAuthHeader()).toBe('Bearer key-1');
        });
        it('should use default config values', () => {
            const provider = new YandexProvider({});
            expect(provider.id).toBe('yandex');
            expect(provider.name).toBe('Yandex Foundation Models');
        });
    });
    // -- isAvailable ----------------------------------------------------------
    describe('isAvailable', () => {
        it('should return true when API responds with 200', async () => {
            mockFetch.mockResolvedValue({
                ok: true,
                status: 200,
            });
            const provider = createProvider();
            const result = await provider.isAvailable();
            expect(result).toBe(true);
            expect(provider.getStatus()).toBe(ProviderStatus.Available);
        });
        it('should return false when API responds with 401', async () => {
            mockFetch.mockResolvedValue({
                ok: false,
                status: 401,
            });
            const provider = createProvider();
            const result = await provider.isAvailable();
            expect(result).toBe(false);
            expect(provider.getStatus()).toBe(ProviderStatus.Unavailable);
        });
        it('should return false when API responds with 403', async () => {
            mockFetch.mockResolvedValue({
                ok: false,
                status: 403,
            });
            const provider = createProvider();
            const result = await provider.isAvailable();
            expect(result).toBe(false);
            expect(provider.getStatus()).toBe(ProviderStatus.Unavailable);
        });
        it('should return true when rate limited (429) -- API is reachable', async () => {
            mockFetch.mockResolvedValue({
                ok: false,
                status: 429,
            });
            const provider = createProvider();
            const result = await provider.isAvailable();
            expect(result).toBe(true);
            expect(provider.getStatus()).toBe(ProviderStatus.RateLimited);
        });
        it('should return false on 5xx errors', async () => {
            mockFetch.mockResolvedValue({
                ok: false,
                status: 500,
            });
            const provider = createProvider();
            const result = await provider.isAvailable();
            expect(result).toBe(false);
            expect(provider.getStatus()).toBe(ProviderStatus.Unavailable);
        });
        it('should return false on connection error', async () => {
            mockFetch.mockRejectedValue(new TypeError('fetch failed'));
            const provider = createProvider();
            const result = await provider.isAvailable();
            expect(result).toBe(false);
            expect(provider.getStatus()).toBe(ProviderStatus.Unavailable);
        });
        it('should send Authorization header with IAM token', async () => {
            mockFetch.mockResolvedValue({ ok: true, status: 200 });
            const provider = createProvider();
            await provider.isAvailable();
            expect(mockFetch).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
                headers: expect.objectContaining({
                    Authorization: 'Bearer test-iam-token',
                }),
            }));
        });
    });
    // -- complete -------------------------------------------------------------
    describe('complete', () => {
        const basicRequest = {
            model: 'yandexgpt-32k-latest',
            messages: [
                { role: 'system', content: 'Be helpful.' },
                { role: 'user', content: 'Hello' },
            ],
        };
        const successResponse = {
            result: {
                alternatives: [
                    {
                        message: {
                            role: 'assistant',
                            text: 'Hello! How can I help you?',
                        },
                        status: 'ALTERNATIVE_STATUS_FINAL',
                    },
                ],
                usage: {
                    inputTextTokens: '10',
                    completionTextTokens: '7',
                    totalTokens: '17',
                },
                modelVersion: 'yandexgpt-32k-latest',
            },
        };
        it('should send correct payload with catalogueId (TT-002-41)', async () => {
            mockFetch.mockResolvedValue({
                ok: true,
                status: 200,
                json: () => Promise.resolve(successResponse),
            });
            const provider = createProvider();
            await provider.complete(basicRequest);
            expect(mockFetch).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
                method: 'POST',
                headers: expect.objectContaining({
                    Authorization: 'Bearer test-iam-token',
                    'Content-Type': 'application/json',
                    'x-folder-id': TEST_CATALOGUE_ID,
                }),
            }));
            // Verify request body
            const callArgs = mockFetch.mock.calls[0];
            const body = JSON.parse(callArgs[1].body);
            expect(body.modelUri).toContain(TEST_CATALOGUE_ID);
            expect(body.completionOptions).toBeDefined();
            expect(body.messages).toBeDefined();
        });
        it('should return correct LLMResponse (TT-002-42)', async () => {
            mockFetch.mockResolvedValue({
                ok: true,
                status: 200,
                json: () => Promise.resolve(successResponse),
            });
            const provider = createProvider();
            const response = await provider.complete(basicRequest);
            expect(response.content).toBe('Hello! How can I help you?');
            expect(response.model).toBe('yandexgpt-32k-latest');
            expect(response.provider).toBe('yandex');
            expect(response.usage).toEqual({
                promptTokens: 10,
                completionTokens: 7,
                totalTokens: 17,
            });
            expect(response.finishReason).toBe('stop');
        });
        it('should include system message in Yandex request', async () => {
            mockFetch.mockResolvedValue({
                ok: true,
                status: 200,
                json: () => Promise.resolve(successResponse),
            });
            const provider = createProvider();
            await provider.complete(basicRequest);
            const callArgs = mockFetch.mock.calls[0];
            const body = JSON.parse(callArgs[1].body);
            expect(body.messages).toEqual([
                { role: 'system', text: 'Be helpful.' },
                { role: 'user', text: 'Hello' },
            ]);
        });
        it('should pass temperature and maxTokens in completionOptions', async () => {
            mockFetch.mockResolvedValue({
                ok: true,
                status: 200,
                json: () => Promise.resolve(successResponse),
            });
            const provider = createProvider();
            await provider.complete({
                ...basicRequest,
                temperature: 0.3,
                maxTokens: 2048,
            });
            const callArgs = mockFetch.mock.calls[0];
            const body = JSON.parse(callArgs[1].body);
            expect(body.completionOptions.temperature).toBe(0.3);
            expect(body.completionOptions.maxTokens).toBe('2048');
        });
        it('should throw RateLimitError on 429 response', async () => {
            mockFetch.mockResolvedValue({
                ok: false,
                status: 429,
                headers: new Headers({ 'retry-after': '5' }),
            });
            const provider = createProvider();
            await expect(provider.complete(basicRequest)).rejects.toThrow(RateLimitError);
        });
        it('should throw AuthError on 401 response', async () => {
            mockFetch.mockResolvedValue({
                ok: false,
                status: 401,
            });
            const provider = createProvider();
            await expect(provider.complete(basicRequest)).rejects.toThrow(AuthError);
        });
        it('should throw AuthError on 403 response', async () => {
            mockFetch.mockResolvedValue({
                ok: false,
                status: 403,
            });
            const provider = createProvider();
            await expect(provider.complete(basicRequest)).rejects.toThrow(AuthError);
        });
        it('should throw ProviderUnavailableError on 500 response', async () => {
            mockFetch.mockResolvedValue({
                ok: false,
                status: 500,
            });
            const provider = createProvider();
            await expect(provider.complete(basicRequest)).rejects.toThrow(ProviderUnavailableError);
        });
        it('should throw ProviderUnavailableError on connection error', async () => {
            mockFetch.mockRejectedValue(new TypeError('fetch failed'));
            const provider = createProvider();
            await expect(provider.complete(basicRequest)).rejects.toThrow(ProviderUnavailableError);
        });
        it('should include retryAfterMs in RateLimitError when retry-after header present', async () => {
            mockFetch.mockResolvedValue({
                ok: false,
                status: 429,
                headers: new Headers({ 'retry-after': '10' }),
            });
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
        it('should throw ProviderError for unknown status codes', async () => {
            mockFetch.mockResolvedValue({
                ok: false,
                status: 418,
                json: () => Promise.resolve({ error_message: 'I am a teapot' }),
                headers: new Headers(),
            });
            const provider = createProvider();
            await expect(provider.complete(basicRequest)).rejects.toThrow(ProviderError);
        });
    });
    // -- stream ---------------------------------------------------------------
    describe('stream', () => {
        const basicRequest = {
            model: 'yandexgpt-32k-latest',
            messages: [
                { role: 'user', content: 'Hello' },
            ],
        };
        it('should yield text chunks from streaming response', async () => {
            // Yandex streaming uses JSON lines (NDJSON) in the response body
            const chunks = [
                JSON.stringify({
                    result: {
                        alternatives: [
                            {
                                message: { role: 'assistant', text: 'Hello ' },
                                status: 'ALTERNATIVE_STATUS_PARTIAL',
                            },
                        ],
                    },
                }),
                JSON.stringify({
                    result: {
                        alternatives: [
                            {
                                message: { role: 'assistant', text: 'from ' },
                                status: 'ALTERNATIVE_STATUS_PARTIAL',
                            },
                        ],
                    },
                }),
                JSON.stringify({
                    result: {
                        alternatives: [
                            {
                                message: { role: 'assistant', text: 'Yandex' },
                                status: 'ALTERNATIVE_STATUS_FINAL',
                            },
                        ],
                        usage: {
                            inputTextTokens: '10',
                            completionTextTokens: '5',
                            totalTokens: '15',
                        },
                    },
                }),
            ];
            mockFetch.mockResolvedValue({
                ok: true,
                status: 200,
                body: createReadableStream(chunks),
            });
            const provider = createProvider();
            const collected = [];
            for await (const chunk of provider.stream(basicRequest)) {
                collected.push(chunk.content);
            }
            expect(collected).toEqual(['Hello ', 'from ', 'Yandex']);
        });
        it('should set finishReason on final chunk', async () => {
            const chunks = [
                JSON.stringify({
                    result: {
                        alternatives: [
                            {
                                message: { role: 'assistant', text: 'Done' },
                                status: 'ALTERNATIVE_STATUS_FINAL',
                            },
                        ],
                        usage: {
                            inputTextTokens: '5',
                            completionTextTokens: '1',
                            totalTokens: '6',
                        },
                    },
                }),
            ];
            mockFetch.mockResolvedValue({
                ok: true,
                status: 200,
                body: createReadableStream(chunks),
            });
            const provider = createProvider();
            const collected = [];
            for await (const chunk of provider.stream(basicRequest)) {
                collected.push({ content: chunk.content, finishReason: chunk.finishReason });
            }
            expect(collected[0]?.finishReason).toBe('stop');
        });
        it('should include usage in final chunk', async () => {
            const chunks = [
                JSON.stringify({
                    result: {
                        alternatives: [
                            {
                                message: { role: 'assistant', text: 'Done' },
                                status: 'ALTERNATIVE_STATUS_FINAL',
                            },
                        ],
                        usage: {
                            inputTextTokens: '8',
                            completionTextTokens: '2',
                            totalTokens: '10',
                        },
                    },
                }),
            ];
            mockFetch.mockResolvedValue({
                ok: true,
                status: 200,
                body: createReadableStream(chunks),
            });
            const provider = createProvider();
            let lastChunk;
            for await (const chunk of provider.stream(basicRequest)) {
                lastChunk = chunk;
            }
            expect(lastChunk?.usage).toEqual({
                promptTokens: 8,
                completionTokens: 2,
                totalTokens: 10,
            });
        });
        it('should set stream: true in completion options', async () => {
            const chunks = [
                JSON.stringify({
                    result: {
                        alternatives: [
                            {
                                message: { role: 'assistant', text: 'ok' },
                                status: 'ALTERNATIVE_STATUS_FINAL',
                            },
                        ],
                        usage: {
                            inputTextTokens: '5',
                            completionTextTokens: '1',
                            totalTokens: '6',
                        },
                    },
                }),
            ];
            mockFetch.mockResolvedValue({
                ok: true,
                status: 200,
                body: createReadableStream(chunks),
            });
            const provider = createProvider();
            for await (const _chunk of provider.stream(basicRequest)) {
                // consume
            }
            const callArgs = mockFetch.mock.calls[0];
            const body = JSON.parse(callArgs[1].body);
            expect(body.completionOptions.stream).toBe(true);
        });
        it('should map streaming errors to ProviderError hierarchy', async () => {
            mockFetch.mockRejectedValue(new TypeError('fetch failed'));
            const provider = createProvider();
            try {
                for await (const _chunk of provider.stream(basicRequest)) {
                    // consume
                }
                expect.fail('Should have thrown');
            }
            catch (error) {
                expect(error).toBeInstanceOf(ProviderUnavailableError);
            }
        });
        it('should yield chunks with correct provider and model', async () => {
            const chunks = [
                JSON.stringify({
                    result: {
                        alternatives: [
                            {
                                message: { role: 'assistant', text: 'test' },
                                status: 'ALTERNATIVE_STATUS_FINAL',
                            },
                        ],
                        usage: {
                            inputTextTokens: '5',
                            completionTextTokens: '1',
                            totalTokens: '6',
                        },
                    },
                }),
            ];
            mockFetch.mockResolvedValue({
                ok: true,
                status: 200,
                body: createReadableStream(chunks),
            });
            const provider = createProvider();
            const collected = [];
            for await (const chunk of provider.stream(basicRequest)) {
                collected.push({ provider: chunk.provider, model: chunk.model });
            }
            for (const c of collected) {
                expect(c.provider).toBe('yandex');
                expect(c.model).toBe('yandexgpt-32k-latest');
            }
        });
        it('should handle TRUNCATED status in streaming', async () => {
            const chunks = [
                JSON.stringify({
                    result: {
                        alternatives: [
                            {
                                message: { role: 'assistant', text: 'Truncated...' },
                                status: 'ALTERNATIVE_STATUS_TRUNCATED',
                            },
                        ],
                        usage: {
                            inputTextTokens: '5',
                            completionTextTokens: '100',
                            totalTokens: '105',
                        },
                    },
                }),
            ];
            mockFetch.mockResolvedValue({
                ok: true,
                status: 200,
                body: createReadableStream(chunks),
            });
            const provider = createProvider();
            const collected = [];
            for await (const chunk of provider.stream(basicRequest)) {
                collected.push({ finishReason: chunk.finishReason });
            }
            expect(collected[0]?.finishReason).toBe('length');
        });
        it('should handle empty body as empty stream', async () => {
            mockFetch.mockResolvedValue({
                ok: true,
                status: 200,
                body: createReadableStream([]),
            });
            const provider = createProvider();
            const collected = [];
            for await (const chunk of provider.stream(basicRequest)) {
                collected.push(chunk.content);
            }
            expect(collected).toEqual([]);
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
    // -- Error mapping --------------------------------------------------------
    describe('error mapping', () => {
        it('should extract retry-after header as milliseconds', async () => {
            mockFetch.mockResolvedValue({
                ok: false,
                status: 429,
                headers: new Headers({ 'retry-after': '2.5' }),
            });
            const provider = createProvider();
            try {
                await provider.complete({
                    model: 'test',
                    messages: [{ role: 'user', content: 'test' }],
                });
                expect.fail('Should have thrown');
            }
            catch (error) {
                expect(error).toBeInstanceOf(RateLimitError);
                // 2.5 seconds -> 2500 ms
                expect(error.retryAfterMs).toBe(2500);
            }
        });
    });
});
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
/**
 * Create a ReadableStream from an array of string chunks.
 * Each string is emitted as a separate chunk followed by a newline.
 */
function createReadableStream(chunks) {
    const encoder = new TextEncoder();
    return new ReadableStream({
        start(controller) {
            for (const chunk of chunks) {
                controller.enqueue(encoder.encode(chunk + '\n'));
            }
            controller.close();
        },
    });
}
//# sourceMappingURL=yandex-provider.test.js.map