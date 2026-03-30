/**
 * Unit tests for LLM Provider types and interfaces.
 * T-001: LLMProvider Interface + Types
 */

import { describe, it, expect } from 'vitest';
import type {
  LLMProvider,
  LLMRequest,
  LLMResponse,
  LLMChunk,
  ToolCall,
  TokenUsage,
  ChatMessage,
  ProviderConfig,
  ToolDefinition,
} from '../types.js';
import { ProviderStatus } from '../types.js';

// ---------------------------------------------------------------------------
// ChatMessage
// ---------------------------------------------------------------------------

describe('ChatMessage', () => {
  it('should accept a valid system message', () => {
    const msg: ChatMessage = {
      role: 'system',
      content: 'You are a helpful assistant.',
    };
    expect(msg.role).toBe('system');
    expect(msg.content).toBe('You are a helpful assistant.');
  });

  it('should accept a user message', () => {
    const msg: ChatMessage = {
      role: 'user',
      content: 'Hello!',
    };
    expect(msg.role).toBe('user');
  });

  it('should accept an assistant message with tool calls', () => {
    const toolCall: ToolCall = {
      id: 'call_123',
      name: 'read_file',
      arguments: '{"path": "/tmp/test.txt"}',
    };
    const msg: ChatMessage = {
      role: 'assistant',
      content: '',
      toolCalls: [toolCall],
    };
    expect(msg.role).toBe('assistant');
    expect(msg.toolCalls).toHaveLength(1);
    expect(msg.toolCalls?.[0]?.name).toBe('read_file');
  });

  it('should accept a tool message with toolCallId', () => {
    const msg: ChatMessage = {
      role: 'tool',
      content: '{"result": "file contents here"}',
      toolCallId: 'call_123',
    };
    expect(msg.role).toBe('tool');
    expect(msg.toolCallId).toBe('call_123');
  });

  it('should accept a tool message with name field', () => {
    const msg: ChatMessage = {
      role: 'tool',
      content: 'result data',
      name: 'read_file',
    };
    expect(msg.name).toBe('read_file');
  });
});

// ---------------------------------------------------------------------------
// ToolCall
// ---------------------------------------------------------------------------

describe('ToolCall', () => {
  it('should hold id, name, and arguments', () => {
    const tc: ToolCall = {
      id: 'call_abc',
      name: 'search',
      arguments: '{"query": "typescript"}',
    };
    expect(tc.id).toBe('call_abc');
    expect(tc.name).toBe('search');
    expect(tc.arguments).toBe('{"query": "typescript"}');
  });
});

// ---------------------------------------------------------------------------
// ToolDefinition
// ---------------------------------------------------------------------------

describe('ToolDefinition', () => {
  it('should define a function tool', () => {
    const def: ToolDefinition = {
      type: 'function',
      function: {
        name: 'get_weather',
        description: 'Get the current weather for a location',
        parameters: {
          type: 'object',
          properties: {
            location: { type: 'string' },
          },
          required: ['location'],
        },
      },
    };
    expect(def.type).toBe('function');
    expect(def.function.name).toBe('get_weather');
    expect(def.function.description).toBe('Get the current weather for a location');
  });
});

// ---------------------------------------------------------------------------
// TokenUsage
// ---------------------------------------------------------------------------

describe('TokenUsage', () => {
  it('should hold prompt, completion, and total tokens', () => {
    const usage: TokenUsage = {
      promptTokens: 10,
      completionTokens: 20,
      totalTokens: 30,
    };
    expect(usage.promptTokens).toBe(10);
    expect(usage.completionTokens).toBe(20);
    expect(usage.totalTokens).toBe(30);
  });
});

// ---------------------------------------------------------------------------
// LLMRequest
// ---------------------------------------------------------------------------

describe('LLMRequest', () => {
  it('should accept a minimal request with model and messages', () => {
    const req: LLMRequest = {
      model: 'glm-5',
      messages: [{ role: 'user', content: 'Hello' }],
    };
    expect(req.model).toBe('glm-5');
    expect(req.messages).toHaveLength(1);
    expect(req.temperature).toBeUndefined();
    expect(req.maxTokens).toBeUndefined();
    expect(req.stream).toBeUndefined();
    expect(req.tools).toBeUndefined();
  });

  it('should accept a full request with all optional fields', () => {
    const tool: ToolDefinition = {
      type: 'function',
      function: { name: 'test_tool' },
    };
    const req: LLMRequest = {
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: 'You are helpful.' },
        { role: 'user', content: 'Hi' },
      ],
      tools: [tool],
      temperature: 0.7,
      maxTokens: 1024,
      stream: false,
      stopSequences: ['\n\n'],
      metadata: { traceId: 'trace-001' },
    };
    expect(req.model).toBe('gpt-4o');
    expect(req.messages).toHaveLength(2);
    expect(req.tools).toHaveLength(1);
    expect(req.temperature).toBe(0.7);
    expect(req.maxTokens).toBe(1024);
    expect(req.stream).toBe(false);
    expect(req.stopSequences).toEqual(['\n\n']);
    expect(req.metadata?.traceId).toBe('trace-001');
  });

  it('should accept streaming flag', () => {
    const req: LLMRequest = {
      model: 'glm-5',
      messages: [{ role: 'user', content: 'Stream this' }],
      stream: true,
    };
    expect(req.stream).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// LLMResponse
// ---------------------------------------------------------------------------

describe('LLMResponse', () => {
  it('should hold content, usage, model, and provider', () => {
    const res: LLMResponse = {
      content: 'Hello from the LLM!',
      usage: { promptTokens: 5, completionTokens: 7, totalTokens: 12 },
      model: 'glm-5',
      provider: 'z-ai',
    };
    expect(res.content).toBe('Hello from the LLM!');
    expect(res.usage.totalTokens).toBe(12);
    expect(res.model).toBe('glm-5');
    expect(res.provider).toBe('z-ai');
  });

  it('should accept tool calls in response', () => {
    const tc: ToolCall = {
      id: 'call_1',
      name: 'get_weather',
      arguments: '{"location": "Moscow"}',
    };
    const res: LLMResponse = {
      content: '',
      toolCalls: [tc],
      usage: { promptTokens: 20, completionTokens: 5, totalTokens: 25 },
      model: 'glm-5',
      provider: 'z-ai',
      finishReason: 'tool_calls',
    };
    expect(res.toolCalls).toHaveLength(1);
    expect(res.finishReason).toBe('tool_calls');
  });

  it('should accept metadata', () => {
    const res: LLMResponse = {
      content: 'OK',
      usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
      model: 'gpt-4o',
      provider: 'openai',
      metadata: { requestId: 'req-42' },
    };
    expect(res.metadata?.requestId).toBe('req-42');
  });
});

// ---------------------------------------------------------------------------
// LLMChunk
// ---------------------------------------------------------------------------

describe('LLMChunk', () => {
  it('should hold incremental content with model and provider', () => {
    const chunk: LLMChunk = {
      content: 'Hello',
      model: 'glm-5',
      provider: 'z-ai',
    };
    expect(chunk.content).toBe('Hello');
    expect(chunk.model).toBe('glm-5');
    expect(chunk.provider).toBe('z-ai');
  });

  it('should accept tool calls in a chunk', () => {
    const tc: ToolCall = {
      id: 'call_1',
      name: 'read_file',
      arguments: '{}',
    };
    const chunk: LLMChunk = {
      content: '',
      toolCalls: [tc],
      model: 'gpt-4o',
      provider: 'openai',
    };
    expect(chunk.toolCalls).toHaveLength(1);
  });

  it('should accept cumulative usage in a chunk', () => {
    const chunk: LLMChunk = {
      content: 'more text',
      usage: { promptTokens: 10, completionTokens: 3, totalTokens: 13 },
      model: 'gpt-4o',
      provider: 'openai',
    };
    expect(chunk.usage?.totalTokens).toBe(13);
  });

  it('should accept finishReason on the final chunk', () => {
    const chunk: LLMChunk = {
      content: '',
      model: 'glm-5',
      provider: 'z-ai',
      finishReason: 'stop',
    };
    expect(chunk.finishReason).toBe('stop');
  });
});

// ---------------------------------------------------------------------------
// ProviderConfig
// ---------------------------------------------------------------------------

describe('ProviderConfig', () => {
  it('should hold all required configuration fields', () => {
    const config: ProviderConfig = {
      id: 'z-ai',
      name: 'Z.ai',
      baseUrl: 'https://api.z.ai/api/paas/v4',
      apiKeys: ['key-1', 'key-2'],
      defaultModel: 'glm-5',
    };
    expect(config.id).toBe('z-ai');
    expect(config.name).toBe('Z.ai');
    expect(config.baseUrl).toBe('https://api.z.ai/api/paas/v4');
    expect(config.apiKeys).toHaveLength(2);
    expect(config.defaultModel).toBe('glm-5');
  });

  it('should accept optional timeout and extra fields', () => {
    const config: ProviderConfig = {
      id: 'ollama',
      name: 'Ollama (local)',
      baseUrl: 'http://localhost:11434',
      apiKeys: [],
      defaultModel: 'llama3',
      timeoutMs: 60000,
      extra: { numCtx: 4096 },
    };
    expect(config.timeoutMs).toBe(60000);
    expect(config.extra?.numCtx).toBe(4096);
  });
});

// ---------------------------------------------------------------------------
// ProviderStatus
// ---------------------------------------------------------------------------

describe('ProviderStatus', () => {
  it('should have all expected values', () => {
    expect(ProviderStatus.Available).toBe('available');
    expect(ProviderStatus.Unavailable).toBe('unavailable');
    expect(ProviderStatus.RateLimited).toBe('rate_limited');
    expect(ProviderStatus.Degraded).toBe('degraded');
    expect(ProviderStatus.Unknown).toBe('unknown');
  });
});

// ---------------------------------------------------------------------------
// LLMProvider interface -- type assertion on mock class
// TT-002-01: LLMProvider type assertion
// ---------------------------------------------------------------------------

describe('LLMProvider interface', () => {
  it('TT-002-01: should be satisfied by a conforming class', () => {
    // This test verifies the interface compiles correctly.
    // If the types are incompatible, TypeScript will fail at build time.
    class MockProvider implements LLMProvider {
      readonly id = 'mock';
      readonly name = 'Mock Provider';

      async isAvailable(): Promise<boolean> {
        return true;
      }

      async complete(_request: LLMRequest): Promise<LLMResponse> {
        return {
          content: 'mock response',
          usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
          model: 'mock-model',
          provider: 'mock',
        };
      }

      async *stream(_request: LLMRequest): AsyncIterable<LLMChunk> {
        yield {
          content: 'chunk',
          model: 'mock-model',
          provider: 'mock',
        };
      }

      countTokens(text: string): number {
        return Math.ceil(text.length / 4);
      }

      getStatus(): ProviderStatus {
        return ProviderStatus.Available;
      }
    }

    const provider: LLMProvider = new MockProvider();
    expect(provider.id).toBe('mock');
    expect(provider.name).toBe('Mock Provider');
    expect(typeof provider.isAvailable).toBe('function');
    expect(typeof provider.complete).toBe('function');
    expect(typeof provider.stream).toBe('function');
    expect(typeof provider.countTokens).toBe('function');
    expect(typeof provider.getStatus).toBe('function');
  });

  it('should support AsyncIterable for stream', async () => {
    class StreamProvider implements LLMProvider {
      readonly id = 'stream-mock';
      readonly name = 'Stream Mock';

      async isAvailable(): Promise<boolean> {
        return true;
      }

      async complete(_request: LLMRequest): Promise<LLMResponse> {
        return {
          content: '',
          usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
          model: 'm',
          provider: 's',
        };
      }

      async *stream(request: LLMRequest): AsyncIterable<LLMChunk> {
        const words = ['Hello', ' ', 'world', '!'];
        for (const word of words) {
          yield {
            content: word,
            model: request.model,
            provider: this.id,
          };
        }
      }

      countTokens(text: string): number {
        return Math.ceil(text.length / 4);
      }

      getStatus(): ProviderStatus {
        return ProviderStatus.Available;
      }
    }

    const provider = new StreamProvider();
    const chunks: LLMChunk[] = [];
    for await (const chunk of provider.stream({ model: 'm', messages: [] })) {
      chunks.push(chunk);
    }
    expect(chunks).toHaveLength(4);
    expect(chunks.map((c) => c.content).join('')).toBe('Hello world!');
  });
});

// ---------------------------------------------------------------------------
// Readonly constraints
// ---------------------------------------------------------------------------

describe('Readonly constraints on types', () => {
  it('messages should be readonly in LLMRequest', () => {
    const req: LLMRequest = {
      model: 'glm-5',
      messages: [{ role: 'user', content: 'Hello' }],
    };
    // TypeScript should enforce readonly -- this test documents the contract.
    expect(Object.isFrozen(req.messages)).toBe(false); // shallow readonly
    expect(req.messages).toHaveLength(1);
  });

  it('toolCalls should be readonly in LLMResponse', () => {
    const res: LLMResponse = {
      content: '',
      toolCalls: [{ id: '1', name: 'fn', arguments: '{}' }],
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      model: 'm',
      provider: 'p',
    };
    expect(res.toolCalls).toHaveLength(1);
  });

  it('apiKeys should be readonly in ProviderConfig', () => {
    const config: ProviderConfig = {
      id: 'test',
      name: 'Test',
      baseUrl: 'http://localhost',
      apiKeys: ['key1', 'key2'],
      defaultModel: 'model',
    };
    expect(config.apiKeys).toHaveLength(2);
  });
});
