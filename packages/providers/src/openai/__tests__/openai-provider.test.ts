/**
 * @osai/providers -- OpenAI Provider Tests (DOMAIN-008, T-003)
 *
 * Unit tests for OpenAIProvider with mocked OpenAI SDK.
 * Tests cover: complete(), stream(), tool_calls mapping, isAvailable(), error mapping.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OpenAIProvider } from '../openai-provider.js';
import {
  RateLimitError,
  ProviderUnavailableError,
  AuthError,
  ProviderError,
} from '../../errors.js';

// ---------------------------------------------------------------------------
// Mock OpenAI SDK
// ---------------------------------------------------------------------------

const mockChatCompletionsCreate = vi.fn();
const mockModelsList = vi.fn();

vi.mock('openai', () => ({
  default: vi.fn().mockImplementation(() => ({
    chat: {
      completions: {
        create: (...args: unknown[]) => mockChatCompletionsCreate(...args),
      },
    },
    models: {
      list: (...args: unknown[]) => mockModelsList(...args),
    },
  })),
}));

// ---------------------------------------------------------------------------
// Helper: create a fake OpenAI APIError-like object
// ---------------------------------------------------------------------------

function createFakeAPIError(
  status: number,
  message: string,
  headers: Record<string, string> = {},
): Error & { status: number; headers: Record<string, string> } {
  const error = new Error(message) as Error & { status: number; headers: Record<string, string> };
  error.status = status;
  error.headers = headers;
  error.name = 'APIError';
  return error;
}

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const DEFAULT_CONFIG = {
  id: 'openai',
  name: 'OpenAI GPT',
  baseUrl: 'https://api.openai.com/v1',
  apiKeys: ['sk-test-key-123'],
  defaultModel: 'gpt-4o',
};

const SIMPLE_REQUEST = {
  model: 'gpt-4o',
  messages: [
    { role: 'user' as const, content: 'Hello, how are you?' },
  ],
};

const SIMPLE_MESSAGES = [
  { role: 'user' as const, content: 'Hello, how are you?' },
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('OpenAIProvider', () => {
  let provider: OpenAIProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new OpenAIProvider(DEFAULT_CONFIG);
  });

  // -------------------------------------------------------------------------
  // Construction
  // -------------------------------------------------------------------------

  describe('construction', () => {
    it('should set id and name from config', () => {
      expect(provider.id).toBe('openai');
      expect(provider.name).toBe('OpenAI GPT');
    });

    it('should use default baseUrl when not overridden', () => {
      const p = new OpenAIProvider({
        ...DEFAULT_CONFIG,
        baseUrl: 'https://api.openai.com/v1',
      });
      expect(p.id).toBe('openai');
    });

    it('should accept custom timeout', () => {
      const p = new OpenAIProvider({
        ...DEFAULT_CONFIG,
        timeoutMs: 5000,
      });
      expect(p.id).toBe('openai');
    });
  });

  // -------------------------------------------------------------------------
  // isAvailable()
  // -------------------------------------------------------------------------

  describe('isAvailable', () => {
    it('should return true when models list succeeds', async () => {
      mockModelsList.mockResolvedValue({ data: [{ id: 'gpt-4o' }] });

      const result = await provider.isAvailable();

      expect(result).toBe(true);
      expect(mockModelsList).toHaveBeenCalledTimes(1);
    });

    it('should return false when models list fails with connection error', async () => {
      mockModelsList.mockRejectedValue(new Error('Connection refused'));

      const result = await provider.isAvailable();

      expect(result).toBe(false);
    });

    it('should return false when models list fails with auth error', async () => {
      const authError = createFakeAPIError(401, 'Invalid API key');
      mockModelsList.mockRejectedValue(authError);

      const result = await provider.isAvailable();

      expect(result).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // complete()
  // -------------------------------------------------------------------------

  describe('complete', () => {
    it('should call OpenAI Chat Completions API (TT-002-20)', async () => {
      const mockResponse = {
        id: 'chatcmpl-123',
        choices: [
          {
            message: { role: 'assistant', content: 'I am fine, thank you!' },
            finish_reason: 'stop',
            index: 0,
          },
        ],
        usage: { prompt_tokens: 10, completion_tokens: 8, total_tokens: 18 },
        model: 'gpt-4o',
      };
      mockChatCompletionsCreate.mockResolvedValue(mockResponse);

      await provider.complete(SIMPLE_REQUEST);

      expect(mockChatCompletionsCreate).toHaveBeenCalledTimes(1);
      const callArgs = mockChatCompletionsCreate.mock.calls[0]![0] as Record<string, unknown>;
      expect(callArgs.model).toBe('gpt-4o');
      expect(callArgs.messages).toEqual(SIMPLE_MESSAGES);
    });

    it('should return LLMResponse with content and usage', async () => {
      const mockResponse = {
        id: 'chatcmpl-123',
        choices: [
          {
            message: { role: 'assistant', content: 'Hello! How can I help you?' },
            finish_reason: 'stop',
            index: 0,
          },
        ],
        usage: { prompt_tokens: 15, completion_tokens: 6, total_tokens: 21 },
        model: 'gpt-4o',
      };
      mockChatCompletionsCreate.mockResolvedValue(mockResponse);

      const result = await provider.complete(SIMPLE_REQUEST);

      expect(result.content).toBe('Hello! How can I help you?');
      expect(result.model).toBe('gpt-4o');
      expect(result.provider).toBe('openai');
      expect(result.usage.promptTokens).toBe(15);
      expect(result.usage.completionTokens).toBe(6);
      expect(result.usage.totalTokens).toBe(21);
    });

    it('should map tool_calls to ToolCall[] (TT-002-21)', async () => {
      const mockResponse = {
        id: 'chatcmpl-456',
        choices: [
          {
            message: {
              role: 'assistant',
              content: '',
              tool_calls: [
                {
                  id: 'call_abc123',
                  type: 'function',
                  function: {
                    name: 'get_weather',
                    arguments: '{"city":"London"}',
                  },
                },
                {
                  id: 'call_def456',
                  type: 'function',
                  function: {
                    name: 'search_files',
                    arguments: '{"query":"test","limit":5}',
                  },
                },
              ],
            },
            finish_reason: 'tool_calls',
            index: 0,
          },
        ],
        usage: { prompt_tokens: 50, completion_tokens: 30, total_tokens: 80 },
        model: 'gpt-4o',
      };
      mockChatCompletionsCreate.mockResolvedValue(mockResponse);

      const result = await provider.complete({
        ...SIMPLE_REQUEST,
        tools: [
          {
            type: 'function' as const,
            function: { name: 'get_weather', description: 'Get weather' },
          },
        ],
      });

      expect(result.toolCalls).toBeDefined();
      expect(result.toolCalls).toHaveLength(2);
      expect(result.toolCalls![0]).toEqual({
        id: 'call_abc123',
        name: 'get_weather',
        arguments: '{"city":"London"}',
      });
      expect(result.toolCalls![1]).toEqual({
        id: 'call_def456',
        name: 'search_files',
        arguments: '{"query":"test","limit":5}',
      });
      expect(result.finishReason).toBe('tool_calls');
    });

    it('should pass temperature and maxTokens to API', async () => {
      const mockResponse = {
        id: 'chatcmpl-789',
        choices: [
          {
            message: { role: 'assistant', content: 'Creative response' },
            finish_reason: 'stop',
            index: 0,
          },
        ],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
        model: 'gpt-4o',
      };
      mockChatCompletionsCreate.mockResolvedValue(mockResponse);

      await provider.complete({
        ...SIMPLE_REQUEST,
        temperature: 0.7,
        maxTokens: 100,
      });

      const callArgs = mockChatCompletionsCreate.mock.calls[0]![0] as Record<string, unknown>;
      expect(callArgs.temperature).toBe(0.7);
      expect(callArgs.max_tokens).toBe(100);
    });

    it('should pass stop sequences to API', async () => {
      const mockResponse = {
        id: 'chatcmpl-stop',
        choices: [
          {
            message: { role: 'assistant', content: 'partial' },
            finish_reason: 'stop',
            index: 0,
          },
        ],
        usage: { prompt_tokens: 10, completion_tokens: 3, total_tokens: 13 },
        model: 'gpt-4o',
      };
      mockChatCompletionsCreate.mockResolvedValue(mockResponse);

      await provider.complete({
        ...SIMPLE_REQUEST,
        stopSequences: ['\n', '---'],
      });

      const callArgs = mockChatCompletionsCreate.mock.calls[0]![0] as Record<string, unknown>;
      expect(callArgs.stop).toEqual(['\n', '---']);
    });

    it('should convert ToolDefinition[] to OpenAI tools format', async () => {
      const mockResponse = {
        id: 'chatcmpl-tools',
        choices: [
          {
            message: { role: 'assistant', content: 'ok' },
            finish_reason: 'stop',
            index: 0,
          },
        ],
        usage: { prompt_tokens: 20, completion_tokens: 2, total_tokens: 22 },
        model: 'gpt-4o',
      };
      mockChatCompletionsCreate.mockResolvedValue(mockResponse);

      const tools = [
        {
          type: 'function' as const,
          function: {
            name: 'read_file',
            description: 'Read a file from disk',
            parameters: {
              type: 'object',
              properties: { path: { type: 'string' } },
              required: ['path'],
            },
          },
        },
      ];

      await provider.complete({ ...SIMPLE_REQUEST, tools });

      const callArgs = mockChatCompletionsCreate.mock.calls[0]![0] as Record<string, unknown>;
      expect(callArgs.tools).toEqual(tools);
    });

    it('should handle empty content with no tool_calls', async () => {
      const mockResponse = {
        id: 'chatcmpl-empty',
        choices: [
          {
            message: { role: 'assistant', content: null, tool_calls: undefined },
            finish_reason: 'stop',
            index: 0,
          },
        ],
        usage: { prompt_tokens: 10, completion_tokens: 0, total_tokens: 10 },
        model: 'gpt-4o',
      };
      mockChatCompletionsCreate.mockResolvedValue(mockResponse);

      const result = await provider.complete(SIMPLE_REQUEST);

      expect(result.content).toBe('');
    });
  });

  // -------------------------------------------------------------------------
  // Error mapping
  // -------------------------------------------------------------------------

  describe('error mapping', () => {
    it('should map 429 response to RateLimitError', async () => {
      const apiError = createFakeAPIError(429, 'Rate limit exceeded', {
        'retry-after': '5',
      });
      mockChatCompletionsCreate.mockRejectedValue(apiError);

      await expect(provider.complete(SIMPLE_REQUEST)).rejects.toThrow(RateLimitError);
    });

    it('should include retryAfterMs in RateLimitError from header', async () => {
      const apiError = createFakeAPIError(429, 'Rate limit exceeded', {
        'retry-after': '10',
      });
      mockChatCompletionsCreate.mockRejectedValue(apiError);

      try {
        await provider.complete(SIMPLE_REQUEST);
        expect.unreachable('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(RateLimitError);
        const rlError = error as RateLimitError;
        expect(rlError.retryAfterMs).toBe(10000);
        expect(rlError.providerId).toBe('openai');
        expect(rlError.statusCode).toBe(429);
      }
    });

    it('should map 5xx response to ProviderUnavailableError', async () => {
      const apiError = createFakeAPIError(500, 'Internal server error');
      mockChatCompletionsCreate.mockRejectedValue(apiError);

      await expect(provider.complete(SIMPLE_REQUEST)).rejects.toThrow(
        ProviderUnavailableError,
      );
    });

    it('should map 401 response to AuthError', async () => {
      const apiError = createFakeAPIError(401, 'Invalid API key');
      mockChatCompletionsCreate.mockRejectedValue(apiError);

      await expect(provider.complete(SIMPLE_REQUEST)).rejects.toThrow(AuthError);
    });

    it('should map 403 response to AuthError', async () => {
      const apiError = createFakeAPIError(403, 'Forbidden');
      mockChatCompletionsCreate.mockRejectedValue(apiError);

      await expect(provider.complete(SIMPLE_REQUEST)).rejects.toThrow(AuthError);
    });

    it('should wrap unknown errors in ProviderError', async () => {
      mockChatCompletionsCreate.mockRejectedValue(new Error('Network timeout'));

      try {
        await provider.complete(SIMPLE_REQUEST);
        expect.unreachable('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ProviderError);
      }
    });
  });

  // -------------------------------------------------------------------------
  // stream()
  // -------------------------------------------------------------------------

  describe('stream', () => {
    it('should yield chunks with delta.content (TT-002-22)', async () => {
      const chunks: Array<Record<string, unknown>> = [
        {
          id: 'chatcmpl-stream-1',
          choices: [
            {
              delta: { role: 'assistant', content: 'Hello' },
              finish_reason: null,
              index: 0,
            },
          ],
          model: 'gpt-4o',
        },
        {
          id: 'chatcmpl-stream-1',
          choices: [
            {
              delta: { content: ' world' },
              finish_reason: null,
              index: 0,
            },
          ],
          model: 'gpt-4o',
        },
        {
          id: 'chatcmpl-stream-1',
          choices: [
            {
              delta: { content: '!' },
              finish_reason: 'stop',
              index: 0,
            },
          ],
          model: 'gpt-4o',
          usage: { prompt_tokens: 10, completion_tokens: 3, total_tokens: 13 },
        },
      ];

      // Simulate an async iterable
      async function* generateChunks() {
        for (const chunk of chunks) {
          yield chunk;
        }
      }

      mockChatCompletionsCreate.mockResolvedValue(generateChunks());

      const collected: Array<{ content: string; finishReason?: string }> = [];
      for await (const chunk of provider.stream(SIMPLE_REQUEST)) {
        collected.push({ content: chunk.content, finishReason: chunk.finishReason });
      }

      expect(collected).toHaveLength(3);
      expect(collected[0]).toEqual({ content: 'Hello' });
      expect(collected[1]).toEqual({ content: ' world' });
      expect(collected[2]).toEqual({ content: '!', finishReason: 'stop' });
    });

    it('should yield chunks with correct provider and model', async () => {
      async function* singleChunk() {
        yield {
          id: 'chatcmpl-s',
          choices: [
            {
              delta: { content: 'test' },
              finish_reason: null,
              index: 0,
            },
          ],
          model: 'gpt-4o',
        };
      }

      mockChatCompletionsCreate.mockResolvedValue(singleChunk());

      for await (const chunk of provider.stream(SIMPLE_REQUEST)) {
        expect(chunk.model).toBe('gpt-4o');
        expect(chunk.provider).toBe('openai');
        break;
      }
    });

    it('should accumulate tool_calls in streaming chunks', async () => {
      const streamChunks: Array<Record<string, unknown>> = [
        {
          id: 'chatcmpl-tc',
          choices: [
            {
              delta: {
                role: 'assistant',
                tool_calls: [
                  {
                    index: 0,
                    id: 'call_stream_1',
                    type: 'function',
                    function: { name: 'read_file', arguments: '' },
                  },
                ],
              },
              finish_reason: null,
              index: 0,
            },
          ],
          model: 'gpt-4o',
        },
        {
          id: 'chatcmpl-tc',
          choices: [
            {
              delta: {
                tool_calls: [
                  {
                    index: 0,
                    function: { arguments: '{"path":"' },
                  },
                ],
              },
              finish_reason: null,
              index: 0,
            },
          ],
          model: 'gpt-4o',
        },
        {
          id: 'chatcmpl-tc',
          choices: [
            {
              delta: {
                tool_calls: [
                  {
                    index: 0,
                    function: { arguments: '/test.txt"}' },
                  },
                ],
              },
              finish_reason: 'tool_calls',
              index: 0,
            },
          ],
          model: 'gpt-4o',
        },
      ];

      async function* generateStreamChunks() {
        for (const chunk of streamChunks) {
          yield chunk;
        }
      }

      mockChatCompletionsCreate.mockResolvedValue(generateStreamChunks());

      const collectedChunks: unknown[] = [];
      for await (const chunk of provider.stream(SIMPLE_REQUEST)) {
        collectedChunks.push(chunk);
      }

      // The last chunk should contain the accumulated tool calls
      const lastChunk = collectedChunks[collectedChunks.length - 1] as {
        toolCalls?: unknown[];
        finishReason?: string;
      };
      expect(lastChunk.finishReason).toBe('tool_calls');
      expect(lastChunk.toolCalls).toBeDefined();
      expect(lastChunk.toolCalls).toHaveLength(1);
      expect(lastChunk.toolCalls![0]).toEqual({
        id: 'call_stream_1',
        name: 'read_file',
        arguments: '{"path":"/test.txt"}',
      });
    });

    it('should pass stream: true to API', async () => {
      async function* emptyStream() {
        // empty
      }
      mockChatCompletionsCreate.mockResolvedValue(emptyStream());

      for await (const _ of provider.stream(SIMPLE_REQUEST)) {
        // drain
      }

      const callArgs = mockChatCompletionsCreate.mock.calls[0]![0] as Record<string, unknown>;
      expect(callArgs.stream).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // countTokens()
  // -------------------------------------------------------------------------

  describe('countTokens', () => {
    it('should estimate tokens using character heuristic', () => {
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
      mockModelsList.mockResolvedValue({ data: [{ id: 'gpt-4o' }] });

      await provider.isAvailable();

      expect(provider.getStatus()).toBe('available');
    });

    it('should return Unavailable after failed isAvailable', async () => {
      mockModelsList.mockRejectedValue(new Error('Connection refused'));

      await provider.isAvailable();

      expect(provider.getStatus()).toBe('unavailable');
    });
  });
});
