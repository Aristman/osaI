/**
 * Integration Test: Tool Execution Loop
 *
 * T-004 / F-013
 *
 * Tests the Agent tool execution loop:
 *   Request -> tool_use -> Skill Execution -> tool_result -> Final Response
 *
 * Verifies that the ToolExecutor correctly:
 * - Dispatches tool calls to SkillRegistry
 * - Appends tool results to messages
 * - Re-calls inference with updated context
 * - Terminates when LLM stops requesting tools
 * - Respects max iterations guard
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import {
  createTestFixture,
  createTestToolCall,
  createTestChatMessage,
  TEST_IDS,
  createMockSkillRegistry,
} from './setup.js';
import type {
  ChatMessage,
  ToolCall,
} from '../../packages/providers/src/types.js';
import { DatabaseManager } from '../../packages/shared/src/database.js';
import { ToolExecutor } from '../../packages/agent/src/loop/ToolExecutor.js';
import { HookRegistry } from '../../packages/agent/src/hooks/HookRegistry.js';
import { HookPoint } from '../../packages/agent/src/hooks/types.js';
import { InferenceService } from '../../packages/agent/src/inference/InferenceService.js';
import { SkillRegistry } from '../../packages/skills-core/src/registry/SkillRegistry.js';
import type { SkillDefinition, ToolResult } from '../../packages/skills-core/src/types.js';

describe('Integration: Tool Execution Loop', () => {
  let dbManager: DatabaseManager;
  let hooks: HookRegistry;
  let inferenceService: InferenceService;
  let skillRegistry: SkillRegistry;

  beforeAll(() => {
    dbManager = new DatabaseManager({ dbPath: ':memory:' });
    dbManager.initialize();
  });

  afterAll(() => {
    dbManager.close();
  });

  beforeEach(() => {
    hooks = new HookRegistry();
    skillRegistry = new SkillRegistry();
  });

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  /**
   * Create an InferenceService with a mock provider that returns
   * predefined responses based on a call sequence.
   */
  function createInferenceWithCallSequence(
    responses: Array<{
      content: string;
      toolCalls?: readonly ToolCall[];
    }>,
  ): InferenceService {
    const callIndex = { value: 0 };

    const mockProvider = createMockLLMProviderWithSequence(responses, callIndex);
    return new InferenceService(mockProvider, hooks);
  }

  function createMockLLMProviderWithSequence(
    responses: Array<{
      content: string;
      toolCalls?: readonly ToolCall[];
    }>,
    callIndex: { value: number },
  ) {
    return {
      id: 'mock-sequence-provider',
      name: 'Mock Sequence Provider',
      isAvailable: async () => true,
      complete: async () => {
        const idx = callIndex.value++;
        const response = responses[idx] ?? { content: 'Fallback response' };
        return {
          content: response.content,
          toolCalls: response.toolCalls,
          usage: { promptTokens: 10, completionTokens: 10, totalTokens: 20 },
          model: 'mock-model',
          provider: 'mock-sequence-provider',
          finishReason: response.toolCalls && response.toolCalls.length > 0 ? 'tool_calls' : 'stop',
        };
      },
      stream: async function* () {
        const idx = callIndex.value++;
        const response = responses[idx] ?? { content: 'Fallback response' };
        yield {
          content: response.content,
          toolCalls: response.toolCalls,
          usage: { promptTokens: 10, completionTokens: 10, totalTokens: 20 },
          finishReason: response.toolCalls && response.toolCalls.length > 0 ? 'tool_calls' : 'stop',
          model: 'mock-model',
          provider: 'mock-sequence-provider',
        };
      },
      countTokens: () => 10,
      getStatus: () => 'available' as const,
    };
  }

  // ---------------------------------------------------------------------------
  // T-004: Agent loop: tool_use -> skill execution -> tool_result -> final response
  // ---------------------------------------------------------------------------

  it('executes a single tool call and produces a final response', async () => {
    // Register a skill with a read_file tool
    skillRegistry.register({
      name: 'filesystem',
      version: '1.0.0',
      description: 'Filesystem skill',
      category: 'bundled',
      tools: [
        {
          name: 'read_file',
          description: 'Read a file',
          parameters: { type: 'object', properties: { path: { type: 'string' } } },
          handler: async (params) => {
            return { content: `Contents of ${params.path}` };
          },
        },
      ],
      enabled: true,
      permissions: { read_file: 'auto' },
    });

    // Inference sequence: first call returns tool_use, second returns final
    const inferenceService = createInferenceWithCallSequence([
      {
        content: '',
        toolCalls: [createTestToolCall('tc-1', 'read_file', { path: '/tmp/test.txt' })],
      },
      {
        content: 'The file contains important data.',
      },
    ]);

    const toolExecutor = new ToolExecutor(inferenceService, skillRegistry, hooks);

    const result = await toolExecutor.executeToolLoop(
      [createTestChatMessage('user', 'Read /tmp/test.txt')],
      undefined,
      {
        sessionId: TEST_IDS.sessionId,
        chatId: TEST_IDS.chatId,
        traceId: TEST_IDS.traceId,
      },
    );

    // Should have 2 iterations (tool call + final response)
    expect(result.iterations).toBe(2);
    expect(result.maxIterationsReached).toBe(false);

    // Should have 1 tool call in the first iteration
    expect(result.toolCalls[0]!.length).toBe(1);
    expect(result.toolCalls[0]![0]!.name).toBe('read_file');

    // Second iteration should have no tool calls (final response)
    expect(result.toolCalls[1]!.length).toBe(0);

    // Messages should contain: original user, assistant with tool_call, tool result, final assistant
    expect(result.messages.length).toBe(4); // user + assistant(tool_call) + tool + assistant(final)
    expect(result.messages[0]!.role).toBe('user');
    expect(result.messages[1]!.role).toBe('assistant');
    expect(result.messages[2]!.role).toBe('tool');
    expect(result.messages[3]!.role).toBe('assistant');
    expect(result.messages[3]!.content).toBe('The file contains important data.');
  });

  it('executes multiple tool calls in a single inference response', async () => {
    skillRegistry.register({
      name: 'filesystem',
      version: '1.0.0',
      description: 'Filesystem skill',
      category: 'bundled',
      tools: [
        {
          name: 'read_file',
          description: 'Read a file',
          parameters: { type: 'object', properties: {} },
          handler: async (_params) => ({ content: 'file contents' }),
        },
        {
          name: 'list_dir',
          description: 'List directory',
          parameters: { type: 'object', properties: {} },
          handler: async () => ({ items: ['a.txt', 'b.txt'] }),
        },
      ],
      enabled: true,
      permissions: { read_file: 'auto', list_dir: 'auto' },
    });

    const inferenceService = createInferenceWithCallSequence([
      {
        content: '',
        toolCalls: [
          createTestToolCall('tc-1', 'read_file', { path: '/tmp/a.txt' }),
          createTestToolCall('tc-2', 'list_dir', { path: '/tmp' }),
        ],
      },
      {
        content: 'Here are the results.',
      },
    ]);

    const toolExecutor = new ToolExecutor(inferenceService, skillRegistry, hooks);

    const result = await toolExecutor.executeToolLoop(
      [createTestChatMessage('user', 'Show me files')],
      undefined,
      {
        sessionId: TEST_IDS.sessionId,
        chatId: TEST_IDS.chatId,
        traceId: TEST_IDS.traceId,
      },
    );

    // Two tool calls in first iteration
    expect(result.toolCalls[0]!.length).toBe(2);
    expect(result.toolCalls[0]![0]!.name).toBe('read_file');
    expect(result.toolCalls[0]![1]!.name).toBe('list_dir');

    // Messages: user + assistant(2 tools) + tool_result_1 + tool_result_2 + assistant(final)
    expect(result.messages.length).toBe(5);
  });

  it('executes a multi-step tool chain (tool -> tool -> final)', async () => {
    skillRegistry.register({
      name: 'filesystem',
      version: '1.0.0',
      description: 'Filesystem skill',
      category: 'bundled',
      tools: [
        {
          name: 'list_dir',
          description: 'List directory',
          parameters: { type: 'object', properties: {} },
          handler: async () => ({ items: ['data.txt'] }),
        },
        {
          name: 'read_file',
          description: 'Read file',
          parameters: { type: 'object', properties: {} },
          handler: async () => ({ content: 'Important data here' }),
        },
      ],
      enabled: true,
      permissions: { list_dir: 'auto', read_file: 'auto' },
    });

    // Three-step sequence: list_dir -> read_file -> final
    const inferenceService = createInferenceWithCallSequence([
      {
        content: '',
        toolCalls: [createTestToolCall('tc-1', 'list_dir', { path: '/tmp' })],
      },
      {
        content: '',
        toolCalls: [createTestToolCall('tc-2', 'read_file', { path: '/tmp/data.txt' })],
      },
      {
        content: 'The directory contains data.txt with important content.',
      },
    ]);

    const toolExecutor = new ToolExecutor(inferenceService, skillRegistry, hooks);

    const result = await toolExecutor.executeToolLoop(
      [createTestChatMessage('user', 'What is in /tmp?')],
      undefined,
      {
        sessionId: TEST_IDS.sessionId,
        chatId: TEST_IDS.chatId,
        traceId: TEST_IDS.traceId,
      },
    );

    // Three iterations
    expect(result.iterations).toBe(3);
    expect(result.maxIterationsReached).toBe(false);

    // Verify tool call sequence
    expect(result.toolCalls[0]![0]!.name).toBe('list_dir');
    expect(result.toolCalls[1]![0]!.name).toBe('read_file');
    expect(result.toolCalls[2]!.length).toBe(0);
  });

  it('stops at max iterations guard', async () => {
    // Register a tool that always triggers another tool call
    skillRegistry.register({
      name: 'loop-skill',
      version: '1.0.0',
      description: 'Always loops',
      category: 'bundled',
      tools: [
        {
          name: 'get_more',
          description: 'Get more data',
          parameters: { type: 'object', properties: {} },
          handler: async () => ({ more: 'data' }),
        },
      ],
      enabled: true,
      permissions: { get_more: 'auto' },
    });

    // Always return tool_use (never stops)
    const inferenceService = createInferenceWithCallSequence(
      Array.from({ length: 20 }, (_, i) => ({
        content: '',
        toolCalls: [createTestToolCall(`tc-${i}`, 'get_more', { page: i })],
      })),
    );

    const toolExecutor = new ToolExecutor(inferenceService, skillRegistry, hooks);

    const result = await toolExecutor.executeToolLoop(
      [createTestChatMessage('user', 'Get all data')],
      undefined,
      {
        sessionId: TEST_IDS.sessionId,
        chatId: TEST_IDS.chatId,
        traceId: TEST_IDS.traceId,
        maxIterations: 3,
      },
    );

    expect(result.maxIterationsReached).toBe(true);
    expect(result.iterations).toBe(3);
  });

  it('fires BEFORE_TOOL_EXECUTION and AFTER_TOOL_EXECUTION hooks', async () => {
    const beforeCalls: string[] = [];
    const afterCalls: string[] = [];

    // HookPoint enum values
    hooks.register(
      HookPoint.BEFORE_TOOL_EXECUTION,
      (ctx) => {
        beforeCalls.push(String(ctx.data.toolName));
        return ctx;
      },
    );

    hooks.register(
      HookPoint.AFTER_TOOL_EXECUTION,
      (ctx) => {
        afterCalls.push(String(ctx.data.toolName));
        return ctx;
      },
    );

    skillRegistry.register({
      name: 'test-skill',
      version: '1.0.0',
      description: 'Test skill',
      category: 'bundled',
      tools: [
        {
          name: 'test_tool',
          description: 'Test tool',
          parameters: { type: 'object', properties: {} },
          handler: async () => ({ result: 'ok' }),
        },
      ],
      enabled: true,
      permissions: { test_tool: 'auto' },
    });

    const inferenceService = createInferenceWithCallSequence([
      {
        content: '',
        toolCalls: [createTestToolCall('tc-1', 'test_tool', {})],
      },
      { content: 'Done.' },
    ]);

    const toolExecutor = new ToolExecutor(inferenceService, skillRegistry, hooks);

    await toolExecutor.executeToolLoop(
      [createTestChatMessage('user', 'Run tool')],
      undefined,
      {
        sessionId: TEST_IDS.sessionId,
        chatId: TEST_IDS.chatId,
        traceId: TEST_IDS.traceId,
      },
    );

    expect(beforeCalls).toEqual(['test_tool']);
    expect(afterCalls).toEqual(['test_tool']);
  });

  it('handles tool execution error gracefully and continues', async () => {
    skillRegistry.register({
      name: 'failing-skill',
      version: '1.0.0',
      description: 'Failing skill',
      category: 'bundled',
      tools: [
        {
          name: 'fail_tool',
          description: 'Always fails',
          parameters: { type: 'object', properties: {} },
          handler: async () => {
            throw new Error('Tool execution error');
          },
        },
      ],
      enabled: true,
      permissions: { fail_tool: 'auto' },
    });

    const inferenceService = createInferenceWithCallSequence([
      {
        content: '',
        toolCalls: [createTestToolCall('tc-1', 'fail_tool', {})],
      },
      {
        content: 'The tool failed but I recovered.',
      },
    ]);

    const toolExecutor = new ToolExecutor(inferenceService, skillRegistry, hooks);

    const result = await toolExecutor.executeToolLoop(
      [createTestChatMessage('user', 'Run failing tool')],
      undefined,
      {
        sessionId: TEST_IDS.sessionId,
        chatId: TEST_IDS.chatId,
        traceId: TEST_IDS.traceId,
      },
    );

    // Should still complete the loop despite tool error
    expect(result.iterations).toBe(2);
    expect(result.maxIterationsReached).toBe(false);

    // The tool result message should contain an error
    const toolResultMsg = result.messages.find((m) => m.role === 'tool');
    expect(toolResultMsg).toBeDefined();
    expect(toolResultMsg!.content).toContain('Tool execution error');
  });
});
