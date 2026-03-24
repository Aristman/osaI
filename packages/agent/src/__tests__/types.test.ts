/**
 * Unit tests for @osai/agent types
 *
 * Validates type contracts, structure compliance,
 * and type-level constraints.
 */

import { describe, it, expect, expectTypeOf } from 'vitest';
import type {
  HookPoint,
  HookContext,
  HookHandler,
  HookRegistration,
  AgentMessage,
  AgentResponse,
  SessionState,
  ToolSchema,
  ToolCall,
  ToolResult,
  ToolContext,
  ToolExecutor,
  ModelProvider,
  ModelMessage,
  ModelOptions,
  ModelResponse,
  StreamChunk,
  TokenUsage,
  ModelInfo,
  AgentConfig,
  SkillDefinition,
  AssembledContext,
  BlockMessage,
  ToolStreamMessage,
} from '../types.js';

// ---------------------------------------------------------------------------
// HookPoint
// ---------------------------------------------------------------------------

describe('HookPoint type', () => {
  it('accepts all 11 valid hook point values', () => {
    const validHooks: HookPoint[] = [
      'before_model_resolve',
      'before_prompt_build',
      'before_agent_start',
      'before_tool_call',
      'after_tool_call',
      'agent_end',
      'on_error',
      'before_memory_query',
      'after_memory_extract',
      'on_file_access',
      'on_desktop_notification',
    ];

    expect(validHooks).toHaveLength(11);

    // Verify each value is assignable to HookPoint
    for (const hook of validHooks) {
      const _assertion: HookPoint = hook;
      expectTypeOf(_assertion).toEqualTypeOf<HookPoint>();
    }
  });
});

// ---------------------------------------------------------------------------
// HookContext
// ---------------------------------------------------------------------------

describe('HookContext interface', () => {
  it('has required fields: hookPoint, sessionId, data, abort', () => {
    type RequiredFields = 'hookPoint' | 'sessionId' | 'data' | 'abort';
    expectTypeOf<HookContext>().toMatchTypeOf<{ [K in RequiredFields]: unknown }>();
  });

  it('abort defaults to false', () => {
    const ctx: HookContext = {
      hookPoint: 'before_agent_start',
      sessionId: 'session-1',
      data: {},
      abort: false,
    };
    expect(ctx.abort).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// HookHandler
// ---------------------------------------------------------------------------

describe('HookHandler type', () => {
  it('returns Promise<HookContext | null>', async () => {
    const handler: HookHandler = async (ctx) => {
      return ctx;
    };

    const ctx: HookContext = {
      hookPoint: 'on_error',
      sessionId: 'session-1',
      data: { error: 'test' },
      abort: false,
    };

    const result = await handler(ctx);
    expect(result).not.toBeNull();
    expectTypeOf(result).toEqualTypeOf<HookContext | null>();
  });

  it('can return null to skip hook chain', async () => {
    const handler: HookHandler = async (_ctx) => {
      return null;
    };

    const result = await handler({
      hookPoint: 'on_error',
      sessionId: 'session-1',
      data: {},
      abort: false,
    });

    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// HookRegistration
// ---------------------------------------------------------------------------

describe('HookRegistration interface', () => {
  it('has id, handler, and priority', () => {
    type RequiredFields = 'id' | 'handler' | 'priority';
    expectTypeOf<HookRegistration>().toMatchTypeOf<{ [K in RequiredFields]: unknown }>();
  });
});

// ---------------------------------------------------------------------------
// AgentConfig
// ---------------------------------------------------------------------------

describe('AgentConfig interface', () => {
  it('has model config with provider, model, and optional fields', () => {
    const config: AgentConfig = {
      model: {
        provider: 'openai',
        model: 'gpt-4',
        apiKey: 'test-key',
        maxTokens: 4096,
        temperature: 0.7,
      },
    };

    expect(config.model.provider).toBe('openai');
    expect(config.model.model).toBe('gpt-4');
    expect(config.model.apiKey).toBe('test-key');
    expect(config.model.maxTokens).toBe(4096);
    expect(config.model.temperature).toBe(0.7);
  });

  it('supports model fallbacks (failover configuration)', () => {
    const config: AgentConfig = {
      model: {
        provider: 'openai',
        model: 'gpt-4',
        apiKey: 'primary-key',
        fallbacks: [
          { provider: 'anthropic', model: 'claude-3', apiKey: 'fallback-key-1' },
          { provider: 'google', model: 'gemini-pro' },
        ],
      },
    };

    expect(config.model.fallbacks).toHaveLength(2);
    expect(config.model.fallbacks?.[0]?.provider).toBe('anthropic');
    expect(config.model.fallbacks?.[1]?.apiKey).toBeUndefined();
  });

  it('supports optional session config', () => {
    const config: AgentConfig = {
      model: { provider: 'openai', model: 'gpt-4' },
      session: {
        maxHistory: 100,
        timeout: 30000,
        maxTokens: 100000,
      },
    };

    expect(config.session?.maxHistory).toBe(100);
    expect(config.session?.timeout).toBe(30000);
    expect(config.session?.maxTokens).toBe(100000);
  });

  it('supports optional skills config', () => {
    const config: AgentConfig = {
      model: { provider: 'openai', model: 'gpt-4' },
      skills: {
        enabled: ['filesystem', 'web'],
        disabled: ['dangerous-tool'],
        extraDirs: ['/custom/skills'],
      },
    };

    expect(config.skills?.enabled).toEqual(['filesystem', 'web']);
    expect(config.skills?.disabled).toEqual(['dangerous-tool']);
    expect(config.skills?.extraDirs).toEqual(['/custom/skills']);
  });

  it('supports optional errorHandling config', () => {
    const config: AgentConfig = {
      model: { provider: 'openai', model: 'gpt-4' },
      errorHandling: {
        maxRetries: 3,
        baseDelay: 1000,
      },
    };

    expect(config.errorHandling?.maxRetries).toBe(3);
    expect(config.errorHandling?.baseDelay).toBe(1000);
  });
});

// ---------------------------------------------------------------------------
// ToolSchema
// ---------------------------------------------------------------------------

describe('ToolSchema interface', () => {
  it('matches required structure with name, description, category, parameters', () => {
    const schema: ToolSchema = {
      name: 'read_file',
      description: 'Reads a file from disk',
      category: 'read',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string' },
        },
        required: ['path'],
      },
    };

    expect(schema.name).toBe('read_file');
    expect(schema.description).toBe('Reads a file from disk');
    expect(schema.category).toBe('read');
    expect(schema.parameters).toHaveProperty('type');

    type RequiredFields = 'name' | 'description' | 'category' | 'parameters';
    expectTypeOf<ToolSchema>().toMatchTypeOf<{ [K in RequiredFields]: unknown }>();
  });

  it('accepts all category values', () => {
    const categories: Array<ToolSchema['category']> = ['read', 'write', 'execute', 'system'];
    expect(categories).toHaveLength(4);
  });
});

// ---------------------------------------------------------------------------
// ToolCall, ToolResult, ToolContext, ToolExecutor
// ---------------------------------------------------------------------------

describe('Tool types', () => {
  it('ToolCall has id, name, parameters', () => {
    type RequiredFields = 'id' | 'name' | 'parameters';
    expectTypeOf<ToolCall>().toMatchTypeOf<{ [K in RequiredFields]: unknown }>();
  });

  it('ToolResult has success and optional output/error/metadata', () => {
    const result: ToolResult = {
      success: true,
      output: 'file contents here',
      metadata: { lines: 42 },
    };

    expect(result.success).toBe(true);
    expect(result.output).toBe('file contents here');

    const errorResult: ToolResult = {
      success: false,
      error: 'File not found',
    };
    expect(errorResult.success).toBe(false);
    expect(errorResult.error).toBe('File not found');
  });

  it('ToolContext has sessionId, toolCall, config', () => {
    type RequiredFields = 'sessionId' | 'toolCall' | 'config';
    expectTypeOf<ToolContext>().toMatchTypeOf<{ [K in RequiredFields]: unknown }>();
  });

  it('ToolExecutor is callable and returns Promise<ToolResult>', async () => {
    const executor: ToolExecutor = async (params, _context) => {
      return {
        success: true,
        output: JSON.stringify(params),
      };
    };

    const context: ToolContext = {
      sessionId: 'session-1',
      toolCall: { id: 'tc-1', name: 'test', parameters: {} },
      config: {},
    };

    const result = await executor({ key: 'value' }, context);
    expect(result.success).toBe(true);
    expect(result.output).toBe('{"key":"value"}');
  });
});

// ---------------------------------------------------------------------------
// Model Provider Types
// ---------------------------------------------------------------------------

describe('Model provider types', () => {
  it('ModelProvider has name, model, complete method and optional stream', () => {
    type RequiredFields = 'name' | 'model' | 'complete';
    expectTypeOf<ModelProvider>().toMatchTypeOf<{ [K in RequiredFields]: unknown }>();
    expectTypeOf<ModelProvider>().toHaveProperty('stream');
  });

  it('ModelMessage has role, content, optional toolCallId and toolCalls', () => {
    type RequiredFields = 'role' | 'content';
    expectTypeOf<ModelMessage>().toMatchTypeOf<{ [K in RequiredFields]: unknown }>();
  });

  it('ModelResponse has content, usage, finishReason and optional toolCalls', () => {
    type RequiredFields = 'content' | 'usage' | 'finishReason';
    expectTypeOf<ModelResponse>().toMatchTypeOf<{ [K in RequiredFields]: unknown }>();

    const response: ModelResponse = {
      content: 'Hello!',
      usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
      finishReason: 'stop',
    };
    expect(response.finishReason).toBe('stop');
  });

  it('ModelOptions has optional maxTokens, temperature, tools', () => {
    const options: ModelOptions = {
      maxTokens: 4096,
      temperature: 0.7,
      tools: [
        {
          name: 'read',
          description: 'Read file',
          category: 'read',
          parameters: {},
        },
      ],
    };
    expect(options.maxTokens).toBe(4096);
    expect(options.tools).toHaveLength(1);
  });

  it('StreamChunk has type field with valid variants', () => {
    const contentChunk: StreamChunk = { type: 'content', content: 'hello' };
    const doneChunk: StreamChunk = { type: 'done', usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 } };
    const errorChunk: StreamChunk = { type: 'error', error: 'Something failed' };
    const toolCallChunk: StreamChunk = { type: 'tool_call', toolCall: { name: 'read' } };

    expect(contentChunk.type).toBe('content');
    expect(doneChunk.type).toBe('done');
    expect(errorChunk.type).toBe('error');
    expect(toolCallChunk.type).toBe('tool_call');
  });

  it('TokenUsage has promptTokens, completionTokens, totalTokens', () => {
    type RequiredFields = 'promptTokens' | 'completionTokens' | 'totalTokens';
    expectTypeOf<TokenUsage>().toMatchTypeOf<{ [K in RequiredFields]: number }>();
  });

  it('ModelInfo has name, provider, model, active', () => {
    type RequiredFields = 'name' | 'provider' | 'model' | 'active';
    expectTypeOf<ModelInfo>().toMatchTypeOf<{ [K in RequiredFields]: unknown }>();
  });
});

// ---------------------------------------------------------------------------
// AgentMessage, AgentResponse, SessionState
// ---------------------------------------------------------------------------

describe('Agent message types', () => {
  it('AgentMessage has id, role, content, timestamp', () => {
    type RequiredFields = 'id' | 'role' | 'content' | 'timestamp';
    expectTypeOf<AgentMessage>().toMatchTypeOf<{ [K in RequiredFields]: unknown }>();

    const msg: AgentMessage = {
      id: 'msg-1',
      role: 'user',
      content: 'Hello',
      timestamp: new Date(),
      metadata: { source: 'cli' },
    };
    expect(msg.role).toBe('user');
    expect(msg.metadata?.source).toBe('cli');
  });

  it('AgentResponse has id, sessionId, content, timestamp', () => {
    type RequiredFields = 'id' | 'sessionId' | 'content' | 'timestamp';
    expectTypeOf<AgentResponse>().toMatchTypeOf<{ [K in RequiredFields]: unknown }>();
  });

  it('SessionState has all 5 valid states', () => {
    const states: SessionState[] = ['idle', 'processing', 'streaming', 'error', 'closed'];
    expect(states).toHaveLength(5);
  });
});

// ---------------------------------------------------------------------------
// SkillDefinition
// ---------------------------------------------------------------------------

describe('SkillDefinition interface', () => {
  it('has required fields: name, version, description, category, tools', () => {
    type RequiredFields = 'name' | 'version' | 'description' | 'category' | 'tools';
    expectTypeOf<SkillDefinition>().toMatchTypeOf<{ [K in RequiredFields]: unknown }>();
  });

  it('supports optional hooks and permissions', () => {
    const skill: SkillDefinition = {
      name: 'filesystem',
      version: '1.0.0',
      description: 'File system operations',
      category: 'core',
      tools: [
        {
          name: 'read_file',
          description: 'Read a file',
          category: 'read',
          parameters: {},
        },
      ],
      hooks: [
        { point: 'on_file_access', priority: 10 },
      ],
      permissions: ['fs:read', 'fs:write'],
    };

    expect(skill.hooks).toHaveLength(1);
    expect(skill.permissions).toEqual(['fs:read', 'fs:write']);
  });
});

// ---------------------------------------------------------------------------
// AssembledContext
// ---------------------------------------------------------------------------

describe('AssembledContext interface', () => {
  it('has systemPrompt, toolSchemas, history, totalTokens', () => {
    type RequiredFields = 'systemPrompt' | 'toolSchemas' | 'history' | 'totalTokens';
    expectTypeOf<AssembledContext>().toMatchTypeOf<{ [K in RequiredFields]: unknown }>();
  });
});

// ---------------------------------------------------------------------------
// Stream Output
// ---------------------------------------------------------------------------

describe('Stream output types', () => {
  it('BlockMessage has type, content and optional language', () => {
    type RequiredFields = 'type' | 'content';
    expectTypeOf<BlockMessage>().toMatchTypeOf<{ [K in RequiredFields]: unknown }>();

    const block: BlockMessage = {
      type: 'code',
      content: 'console.log("hello")',
      language: 'typescript',
    };
    expect(block.type).toBe('code');
    expect(block.language).toBe('typescript');
  });

  it('ToolStreamMessage has sessionId, tool, action, chunk and optional progress', () => {
    type RequiredFields = 'sessionId' | 'tool' | 'action' | 'chunk';
    expectTypeOf<ToolStreamMessage>().toMatchTypeOf<{ [K in RequiredFields]: unknown }>();

    const msg: ToolStreamMessage = {
      sessionId: 'session-1',
      tool: 'filesystem',
      action: 'read',
      chunk: { path: '/tmp/file.txt', content: 'data' },
      progress: 50,
    };
    expect(msg.progress).toBe(50);
  });
});
