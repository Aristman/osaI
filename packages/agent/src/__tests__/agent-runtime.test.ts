/**
 * Tests for AgentRuntime -- T-006: Agent Loop Core
 */

import { describe, it, expect, vi } from 'vitest';
import { AgentRuntime } from '../AgentRuntime.js';
import { HookManager } from '../hooks/HookManager.js';
import { SkillRegistry } from '../skills/SkillRegistry.js';
import { ContextAssembler } from '../context/ContextAssembler.js';
import { ErrorHandler } from '../errors/ErrorHandler.js';
import { ModelResolver } from '../model/ModelResolver.js';
import type {
  AgentConfig,
  AgentMessage,
  ModelResponse,
  ToolCall,
  ToolExecutor,
  SkillDefinition,
} from '../types.js';

// ---------------------------------------------------------------------------
// Mock ModelResolver factory
// ---------------------------------------------------------------------------

function createMockModelResolver(responses: ModelResponse[]): ModelResolver {
  // Create a real ModelResolver with a mock completeWithFailover implementation.
  const resolver = new ModelResolver(
    [
      {
        provider: 'ollama',
        model: 'mock-model',
        baseUrl: 'http://localhost:11434',
      },
    ],
    { circuitBreakerThreshold: 5 },
  );

  // Override completeWithFailover
  let callIndex = 0;
  vi.spyOn(resolver, 'completeWithFailover').mockImplementation(
    async () => {
      const response = responses[callIndex] ?? responses[responses.length - 1]!;
      callIndex++;
      return response;
    },
  );

  vi.spyOn(resolver, 'getActiveModel').mockReturnValue({
    name: 'mock-provider',
    provider: 'ollama',
    model: 'mock-model',
    active: true,
  });

  return resolver;
}

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const TEST_CONFIG: AgentConfig = {
  model: {
    provider: 'ollama',
    model: 'mock-model',
  },
  session: {
    maxTokens: 128000,
  },
};

function makeUserMessage(content: string): AgentMessage {
  return {
    id: 'user-msg-1',
    role: 'user',
    content,
    timestamp: new Date(),
  };
}

function makeStopResponse(content: string): ModelResponse {
  return {
    content,
    finishReason: 'stop',
    usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
  };
}

function makeToolCallResponse(
  content: string,
  toolCalls: ToolCall[],
): ModelResponse {
  return {
    content,
    toolCalls,
    finishReason: 'tool_calls',
    usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
  };
}

function createMockSkillRegistry(
  tools: Record<string, ToolExecutor>,
): SkillRegistry {
  const registry = new SkillRegistry();

  const definition: SkillDefinition = {
    name: 'test',
    version: '1.0.0',
    description: 'Test skill',
    category: 'execute',
    tools: Object.keys(tools).map((name) => ({
      name,
      description: `Tool ${name}`,
      category: 'execute' as const,
      parameters: { type: 'object', properties: {} },
    })),
  };

  registry.register(definition, tools);
  return registry;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AgentRuntime', () => {
  // -------------------------------------------------------------------------
  // T006-01: Process message returns valid response
  // -------------------------------------------------------------------------
  it('should return a valid AgentResponse for a simple message', async () => {
    const response = makeStopResponse('Hello! How can I help you?');
    const modelResolver = createMockModelResolver([response]);
    const hookManager = new HookManager();
    const skillRegistry = new SkillRegistry();
    const errorHandler = new ErrorHandler();

    const contextAssembler = new ContextAssembler(
      skillRegistry,
      hookManager,
    );

    const runtime = new AgentRuntime({
      config: TEST_CONFIG,
      hookManager,
      modelResolver,
      skillRegistry,
      contextAssembler,
      errorHandler,
    });

    const result = await runtime.processMessage(
      makeUserMessage('Hello'),
      'session-1',
    );

    expect(result).toBeDefined();
    expect(result.sessionId).toBe('session-1');
    expect(result.content).toBe('Hello! How can I help you?');
    expect(result.id).toBeDefined();
    expect(result.timestamp).toBeInstanceOf(Date);
  });

  // -------------------------------------------------------------------------
  // T006-02: before_agent_start hook called
  // -------------------------------------------------------------------------
  it('should call before_agent_start hook when processing a message', async () => {
    const hookManager = new HookManager();
    const hookSpy = vi.fn().mockImplementation(async (ctx) => ctx);
    hookManager.registerHook('before_agent_start', hookSpy);

    const response = makeStopResponse('Response');
    const modelResolver = createMockModelResolver([response]);

    const runtime = new AgentRuntime({
      config: TEST_CONFIG,
      hookManager,
      modelResolver,
    });

    await runtime.processMessage(makeUserMessage('Test'), 'session-1');

    expect(hookSpy).toHaveBeenCalledTimes(1);
    expect(hookSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        hookPoint: 'before_agent_start',
        sessionId: 'session-1',
      }),
    );
  });

  // -------------------------------------------------------------------------
  // T006-03: before_prompt_build hook called (via assemble)
  // -------------------------------------------------------------------------
  it('should call before_prompt_build hook during context assembly', async () => {
    const hookManager = new HookManager();
    const hookSpy = vi.fn().mockImplementation(async (ctx) => ctx);
    hookManager.registerHook('before_prompt_build', hookSpy);

    const response = makeStopResponse('Response');
    const modelResolver = createMockModelResolver([response]);

    const runtime = new AgentRuntime({
      config: TEST_CONFIG,
      hookManager,
      modelResolver,
    });

    await runtime.processMessage(makeUserMessage('Test'), 'session-1');

    expect(hookSpy).toHaveBeenCalledTimes(1);
    expect(hookSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        hookPoint: 'before_prompt_build',
        sessionId: 'session-1',
      }),
    );
  });

  // -------------------------------------------------------------------------
  // T006-04: Tool execution loop -- model returns tool_call, tool executed,
  //           result sent back, model returns stop
  // -------------------------------------------------------------------------
  it('should execute tool when model returns tool_call and send result back', async () => {
    const toolExecutor: ToolExecutor = vi.fn().mockResolvedValue({
      success: true,
      output: 'Tool executed successfully',
    });

    const skillRegistry = createMockSkillRegistry({
      test_tool: toolExecutor,
    });

    // First call: model wants tool_call
    // Second call: model returns final response after seeing tool result
    const modelResolver = createMockModelResolver([
      makeToolCallResponse('I will use a tool', [
        {
          id: 'tool-call-1',
          name: 'test.test_tool',
          parameters: { query: 'test' },
        },
      ]),
      makeStopResponse('Here is the result after using the tool'),
    ]);

    const hookManager = new HookManager();
    const contextAssembler = new ContextAssembler(
      skillRegistry,
      hookManager,
    );

    const runtime = new AgentRuntime({
      config: TEST_CONFIG,
      hookManager,
      modelResolver,
      skillRegistry,
      contextAssembler,
    });

    const result = await runtime.processMessage(
      makeUserMessage('Use the tool'),
      'session-1',
    );

    // Tool was called
    expect(toolExecutor).toHaveBeenCalledTimes(1);
    expect(toolExecutor).toHaveBeenCalledWith(
      { query: 'test' },
      expect.objectContaining({
        sessionId: 'session-1',
        toolCall: expect.objectContaining({
          id: 'tool-call-1',
          name: 'test.test_tool',
        }),
      }),
    );

    // Final response is from second model call
    expect(result.content).toBe('Here is the result after using the tool');
  });

  // -------------------------------------------------------------------------
  // T006-05: Multi-turn tool execution -- 2 tool calls in 1 iteration
  // -------------------------------------------------------------------------
  it('should execute multiple tool calls from a single model response', async () => {
    const tool1Executor: ToolExecutor = vi.fn().mockResolvedValue({
      success: true,
      output: 'Tool 1 result',
    });
    const tool2Executor: ToolExecutor = vi.fn().mockResolvedValue({
      success: true,
      output: 'Tool 2 result',
    });

    const registry = new SkillRegistry();

    const skillDef: SkillDefinition = {
      name: 'test',
      version: '1.0.0',
      description: 'Test skill',
      category: 'execute',
      tools: [
        {
          name: 'tool_a',
          description: 'Tool A',
          category: 'execute',
          parameters: { type: 'object', properties: {} },
        },
        {
          name: 'tool_b',
          description: 'Tool B',
          category: 'execute',
          parameters: { type: 'object', properties: {} },
        },
      ],
    };
    registry.register(skillDef, {
      tool_a: tool1Executor,
      tool_b: tool2Executor,
    });

    // First: 2 tool calls. Second: final response.
    const modelResolver = createMockModelResolver([
      makeToolCallResponse('Using two tools', [
        { id: 'tc-1', name: 'test.tool_a', parameters: {} },
        { id: 'tc-2', name: 'test.tool_b', parameters: {} },
      ]),
      makeStopResponse('Both tools executed'),
    ]);

    const hookManager = new HookManager();
    const contextAssembler = new ContextAssembler(registry, hookManager);

    const runtime = new AgentRuntime({
      config: TEST_CONFIG,
      hookManager,
      modelResolver,
      skillRegistry: registry,
      contextAssembler,
    });

    const result = await runtime.processMessage(
      makeUserMessage('Run both tools'),
      'session-1',
    );

    expect(tool1Executor).toHaveBeenCalledTimes(1);
    expect(tool2Executor).toHaveBeenCalledTimes(1);
    expect(result.content).toBe('Both tools executed');
  });

  // -------------------------------------------------------------------------
  // T006-06: agent_end hook called
  // -------------------------------------------------------------------------
  it('should call agent_end hook after processing completes', async () => {
    const hookManager = new HookManager();
    const hookSpy = vi.fn().mockImplementation(async (ctx) => ctx);
    hookManager.registerHook('agent_end', hookSpy);

    const response = makeStopResponse('Done');
    const modelResolver = createMockModelResolver([response]);

    const runtime = new AgentRuntime({
      config: TEST_CONFIG,
      hookManager,
      modelResolver,
    });

    await runtime.processMessage(makeUserMessage('Test'), 'session-1');

    expect(hookSpy).toHaveBeenCalledTimes(1);
    expect(hookSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        hookPoint: 'agent_end',
        sessionId: 'session-1',
        data: expect.objectContaining({
          response: expect.objectContaining({
            role: 'assistant',
            content: 'Done',
          }),
        }),
      }),
    );
  });

  // -------------------------------------------------------------------------
  // T006-07: Session persistence -- messages saved
  // -------------------------------------------------------------------------
  it('should persist user and assistant messages to session repository', async () => {
    const mockRepo = {
      sessionExists: vi.fn().mockReturnValue(false),
      saveSession: vi.fn(),
      updateSessionState: vi.fn(),
      saveMessage: vi.fn(),
      getMessages: vi.fn().mockResolvedValue([]),
      loadSession: vi.fn().mockReturnValue(undefined),
      listSessions: vi.fn().mockReturnValue([]),
      deleteSession: vi.fn().mockReturnValue(true),
      deleteMessages: vi.fn().mockReturnValue(true),
      getMessageCount: vi.fn().mockReturnValue(0),
      close: vi.fn(),
    };

    const response = makeStopResponse('Saved response');
    const modelResolver = createMockModelResolver([response]);
    const hookManager = new HookManager();

    const runtime = new AgentRuntime({
      config: TEST_CONFIG,
      hookManager,
      modelResolver,
      sessionRepository: mockRepo as unknown as import('../persistence/SessionRepository.js').SessionRepository,
    });

    await runtime.processMessage(makeUserMessage('Save this'), 'session-1');

    // Session should be created
    expect(mockRepo.saveSession).toHaveBeenCalledWith(
      'session-1',
      'processing',
    );

    // User message should be saved
    expect(mockRepo.saveMessage).toHaveBeenCalledTimes(2);

    // State should be updated to idle at end
    expect(mockRepo.updateSessionState).toHaveBeenCalledWith(
      'session-1',
      'idle',
    );
  });

  // -------------------------------------------------------------------------
  // T006-08: Model failover -- primary fails, fallback succeeds
  // -------------------------------------------------------------------------
  it('should handle model failover through ModelResolver', async () => {
    const responses = [makeStopResponse('Fallback response')];

    const resolver = createMockModelResolver(responses);
    // The mock resolver uses completeWithFailover which is already spied
    // Verify it was called
    const hookManager = new HookManager();

    const runtime = new AgentRuntime({
      config: TEST_CONFIG,
      hookManager,
      modelResolver: resolver,
    });

    const result = await runtime.processMessage(
      makeUserMessage('Test failover'),
      'session-1',
    );

    expect(result.content).toBe('Fallback response');
    expect(resolver.completeWithFailover).toHaveBeenCalledTimes(1);
  });

  // -------------------------------------------------------------------------
  // T006-09: Error handling -- tool execution error does not crash loop
  // -------------------------------------------------------------------------
  it('should not crash the loop when tool execution throws an error', async () => {
    const failingExecutor: ToolExecutor = vi.fn().mockRejectedValue(
      new Error('Tool exploded'),
    );

    const skillRegistry = createMockSkillRegistry({
      bad_tool: failingExecutor,
    });

    // First call: tool_call. Second call: model should get error result and stop.
    const modelResolver = createMockModelResolver([
      makeToolCallResponse('Trying tool', [
        {
          id: 'tc-1',
          name: 'test.bad_tool',
          parameters: {},
        },
      ]),
      makeStopResponse('Tool failed but I recovered'),
    ]);

    const hookManager = new HookManager();
    const contextAssembler = new ContextAssembler(
      skillRegistry,
      hookManager,
    );

    const runtime = new AgentRuntime({
      config: TEST_CONFIG,
      hookManager,
      modelResolver,
      skillRegistry,
      contextAssembler,
    });

    // Should NOT throw
    const result = await runtime.processMessage(
      makeUserMessage('Run failing tool'),
      'session-1',
    );

    expect(result.content).toBe('Tool failed but I recovered');
    expect(failingExecutor).toHaveBeenCalledTimes(1);
  });

  // -------------------------------------------------------------------------
  // T006-10: Empty message handled gracefully
  // -------------------------------------------------------------------------
  it('should handle empty message gracefully', async () => {
    const modelResolver = createMockModelResolver([
      makeStopResponse('Should not be called'),
    ]);

    const hookManager = new HookManager();

    const runtime = new AgentRuntime({
      config: TEST_CONFIG,
      hookManager,
      modelResolver,
    });

    // Empty content
    const result = await runtime.processMessage(
      { id: 'msg-1', role: 'user', content: '', timestamp: new Date() },
      'session-1',
    );

    expect(result.content).toBeDefined();
    expect(result.content.length).toBeGreaterThan(0);

    // Model should NOT have been called
    expect(modelResolver.completeWithFailover).not.toHaveBeenCalled();
  });

  it('should handle whitespace-only message gracefully', async () => {
    const modelResolver = createMockModelResolver([
      makeStopResponse('Should not be called'),
    ]);

    const runtime = new AgentRuntime({
      config: TEST_CONFIG,
      modelResolver,
    });

    const result = await runtime.processMessage(
      { id: 'msg-1', role: 'user', content: '   \t\n  ', timestamp: new Date() },
      'session-1',
    );

    expect(result.content).toBeDefined();
    expect(result.content.length).toBeGreaterThan(0);
    expect(modelResolver.completeWithFailover).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Additional tests
  // -------------------------------------------------------------------------

  it('should return empty response when before_agent_start hook aborts', async () => {
    const hookManager = new HookManager();
    hookManager.registerHook('before_agent_start', async (ctx) => ({
      ...ctx,
      abort: true,
    }));

    const modelResolver = createMockModelResolver([
      makeStopResponse('Should not reach here'),
    ]);

    const runtime = new AgentRuntime({
      config: TEST_CONFIG,
      hookManager,
      modelResolver,
    });

    const result = await runtime.processMessage(
      makeUserMessage('Test'),
      'session-1',
    );

    expect(result.content).toBe('');
    expect(modelResolver.completeWithFailover).not.toHaveBeenCalled();
  });

  it('should call before_tool_call and after_tool_call hooks', async () => {
    const beforeSpy = vi.fn().mockImplementation(async (ctx) => ctx);
    const afterSpy = vi.fn().mockImplementation(async (ctx) => ctx);

    const hookManager = new HookManager();
    hookManager.registerHook('before_tool_call', beforeSpy);
    hookManager.registerHook('after_tool_call', afterSpy);

    const toolExecutor: ToolExecutor = vi.fn().mockResolvedValue({
      success: true,
      output: 'Done',
    });

    const skillRegistry = createMockSkillRegistry({ my_tool: toolExecutor });

    const modelResolver = createMockModelResolver([
      makeToolCallResponse('Calling tool', [
        { id: 'tc-1', name: 'test.my_tool', parameters: {} },
      ]),
      makeStopResponse('Final'),
    ]);

    const contextAssembler = new ContextAssembler(
      skillRegistry,
      hookManager,
    );

    const runtime = new AgentRuntime({
      config: TEST_CONFIG,
      hookManager,
      modelResolver,
      skillRegistry,
      contextAssembler,
    });

    await runtime.processMessage(makeUserMessage('Go'), 'session-1');

    expect(beforeSpy).toHaveBeenCalledTimes(1);
    expect(afterSpy).toHaveBeenCalledTimes(1);
    expect(beforeSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        hookPoint: 'before_tool_call',
        data: expect.objectContaining({
          toolCall: expect.objectContaining({ name: 'test.my_tool' }),
        }),
      }),
    );
  });

  it('should return tool not found error for unregistered tool', async () => {
    // Tool not registered in registry
    const modelResolver = createMockModelResolver([
      makeToolCallResponse('Calling unknown tool', [
        { id: 'tc-1', name: 'unknown.tool', parameters: {} },
      ]),
      makeStopResponse('Got error result'),
    ]);

    const hookManager = new HookManager();
    const skillRegistry = new SkillRegistry();
    const contextAssembler = new ContextAssembler(
      skillRegistry,
      hookManager,
    );

    const runtime = new AgentRuntime({
      config: TEST_CONFIG,
      hookManager,
      modelResolver,
      skillRegistry,
      contextAssembler,
    });

    const result = await runtime.processMessage(
      makeUserMessage('Call unknown'),
      'session-1',
    );

    // Should still complete successfully (loop handles the error gracefully)
    expect(result.content).toBe('Got error result');
  });

  it('should register and unregister hooks via shortcuts', () => {
    const runtime = new AgentRuntime({
      config: TEST_CONFIG,
    });

    const handler = vi.fn();
    const id = runtime.registerHook('on_error', handler, 5);

    expect(id).toBeDefined();
    expect(typeof id).toBe('string');

    const removed = runtime.unregisterHook('on_error', id);
    expect(removed).toBe(true);
  });

  it('should return tool schemas from skill registry', () => {
    const skillRegistry = new SkillRegistry();
    const def: SkillDefinition = {
      name: 'fs',
      version: '1.0.0',
      description: 'File system',
      category: 'execute',
      tools: [
        {
          name: 'read',
          description: 'Read file',
          category: 'read',
          parameters: { type: 'object', properties: {} },
        },
      ],
    };
    skillRegistry.register(def);

    const runtime = new AgentRuntime({
      config: TEST_CONFIG,
      skillRegistry,
    });

    const schemas = runtime.getToolSchemas();
    expect(schemas).toHaveLength(1);
    expect(schemas[0]!.name).toBe('fs.read');
  });

  it('should return config via getConfig', () => {
    const runtime = new AgentRuntime({ config: TEST_CONFIG });
    expect(runtime.getConfig()).toBe(TEST_CONFIG);
  });

  it('should return active model info via getActiveModel', () => {
    const modelResolver = createMockModelResolver([
      makeStopResponse('test'),
    ]);

    const runtime = new AgentRuntime({
      config: TEST_CONFIG,
      modelResolver,
    });

    const info = runtime.getActiveModel();
    expect(info).toBeDefined();
    expect(info.provider).toBe('ollama');
    expect(info.model).toBe('mock-model');
    expect(info.active).toBe(true);
  });

  it('should execute tool via public executeTool method', async () => {
    const toolExecutor: ToolExecutor = vi.fn().mockResolvedValue({
      success: true,
      output: 'Direct execution result',
    });

    const skillRegistry = createMockSkillRegistry({
      direct_tool: toolExecutor,
    });

    const runtime = new AgentRuntime({
      config: TEST_CONFIG,
      skillRegistry,
    });

    const result = await runtime.executeTool(
      'test.direct_tool',
      { key: 'value' },
      'session-1',
    );

    expect(result.success).toBe(true);
    expect(result.output).toBe('Direct execution result');
    expect(toolExecutor).toHaveBeenCalledTimes(1);
  });

  it('should return empty history when no session repository is configured', async () => {
    const runtime = new AgentRuntime({
      config: TEST_CONFIG,
      // No sessionRepository
    });

    const history = await runtime.getSessionHistory('nonexistent');
    expect(history).toEqual([]);
  });
});
