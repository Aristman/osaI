/**
 * Context Assembly -- Unit Tests (T-005)
 *
 * Tests for ContextAssembler, SystemPromptLoader.
 * Covers: system prompt loading, tool schemas, history conversion,
 * token estimation, hook integration, abort handling.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ContextAssembler } from '../context/ContextAssembler.js';
import { SystemPromptLoader } from '../context/SystemPromptLoader.js';
import { SkillRegistry } from '../skills/SkillRegistry.js';
import { HookManager } from '../hooks/HookManager.js';
import type { AgentMessage, SkillDefinition } from '../types.js';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const TEST_AGENTS_MD = 'You are osaI, an AI operating system assistant.';

const TEST_SOUL_MD =
  'You are curious, helpful, and direct. Always prefer precision over verbosity.';

function createTestSkill(name: string, toolCount = 1): SkillDefinition {
  const tools = Array.from({ length: toolCount }, (_, i) => ({
    name: `tool_${i}`,
    description: `Test tool ${i} for ${name}`,
    category: 'read' as const,
    parameters: {
      type: 'object',
      properties: {
        input: { type: 'string', description: 'Input parameter' },
      },
      required: ['input'],
    },
  }));

  return {
    name,
    version: '1.0.0',
    description: `Test skill ${name}`,
    category: 'test',
    tools,
  };
}

function createTestMessage(
  id: string,
  role: AgentMessage['role'],
  content: string,
): AgentMessage {
  return {
    id,
    role,
    content,
    timestamp: new Date('2026-03-25T00:00:00Z'),
  };
}

// ---------------------------------------------------------------------------
// SystemPromptLoader tests
// ---------------------------------------------------------------------------

describe('SystemPromptLoader', () => {
  it('should return default AGENTS.md when not set', () => {
    const loader = new SystemPromptLoader();
    const result = loader.getAgentsMd();
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('should return empty default SOUL.md when not set', () => {
    const loader = new SystemPromptLoader();
    const result = loader.getSoulMd();
    expect(result).toBe('');
  });

  it('should return set AGENTS.md content', () => {
    const loader = new SystemPromptLoader();
    loader.setAgentsMd(TEST_AGENTS_MD);
    expect(loader.getAgentsMd()).toBe(TEST_AGENTS_MD);
  });

  it('should return set SOUL.md content', () => {
    const loader = new SystemPromptLoader();
    loader.setSoulMd(TEST_SOUL_MD);
    expect(loader.getSoulMd()).toBe(TEST_SOUL_MD);
  });

  it('should load content from a file', async () => {
    const loader = new SystemPromptLoader();
    // Use an existing test file as a read target
    const content = await loader.loadFromFile(
      new URL('./context.test.ts', import.meta.url).pathname,
    );
    expect(content.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// ContextAssembler tests
// ---------------------------------------------------------------------------

describe('ContextAssembler', () => {
  let registry: SkillRegistry;
  let assembler: ContextAssembler;

  beforeEach(() => {
    registry = new SkillRegistry();
    assembler = new ContextAssembler(registry, null);
  });

  // T005-01: Load system prompt
  it('should return system prompt string', () => {
    assembler.systemPromptLoader.setAgentsMd(TEST_AGENTS_MD);
    const prompt = assembler.buildSystemPrompt();
    expect(typeof prompt).toBe('string');
    expect(prompt).toContain('osaI');
  });

  // T005-02: Load SOUL.md -- content appended
  it('should include SOUL.md content in system prompt', () => {
    assembler.systemPromptLoader.setAgentsMd(TEST_AGENTS_MD);
    assembler.systemPromptLoader.setSoulMd(TEST_SOUL_MD);
    const prompt = assembler.buildSystemPrompt();
    expect(prompt).toContain(TEST_AGENTS_MD);
    expect(prompt).toContain(TEST_SOUL_MD);
    // AGENTS.md should come before SOUL.md
    expect(prompt.indexOf(TEST_AGENTS_MD)).toBeLessThan(
      prompt.indexOf(TEST_SOUL_MD),
    );
  });

  // T005-03: Load tool schemas from SkillRegistry
  it('should load tool schemas from SkillRegistry', () => {
    registry.register(createTestSkill('filesystem', 2));
    registry.register(createTestSkill('shell', 1));

    const schemas = assembler.loadToolSchemas();
    expect(schemas).toHaveLength(3);
    expect(schemas[0]?.name).toBe('filesystem.tool_0');
    expect(schemas[1]?.name).toBe('filesystem.tool_1');
    expect(schemas[2]?.name).toBe('shell.tool_0');
  });

  // T005-04: Load session history
  it('should convert AgentMessage history to ModelMessage format', () => {
    const history: AgentMessage[] = [
      createTestMessage('1', 'user', 'Hello'),
      createTestMessage('2', 'assistant', 'Hi there!'),
      createTestMessage('3', 'user', 'How are you?'),
    ];

    const modelMessages = assembler.historyToModelMessages(history);
    expect(modelMessages).toHaveLength(3);
    expect(modelMessages[0]).toEqual({ role: 'user', content: 'Hello' });
    expect(modelMessages[1]).toEqual({ role: 'assistant', content: 'Hi there!' });
    expect(modelMessages[2]).toEqual({ role: 'user', content: 'How are you?' });
  });

  // T005-04b: historyToModelMessages preserves tool call metadata
  it('should preserve toolCallId and toolCalls from AgentMessage metadata', () => {
    const history: AgentMessage[] = [
      {
        id: '1',
        role: 'tool',
        content: '{"result": "ok"}',
        timestamp: new Date('2026-03-25T00:00:00Z'),
        metadata: {
          toolCallId: 'call_123',
          toolCalls: [
            {
              id: 'call_123',
              name: 'filesystem.tool_0',
              parameters: { path: '/tmp/test' },
            },
          ],
        },
      },
    ];

    const modelMessages = assembler.historyToModelMessages(history);
    expect(modelMessages).toHaveLength(1);
    expect(modelMessages[0]?.role).toBe('tool');
    expect(modelMessages[0]?.toolCallId).toBe('call_123');
    expect(modelMessages[0]?.toolCalls).toHaveLength(1);
    expect(modelMessages[0]?.toolCalls?.[0]?.name).toBe('filesystem.tool_0');
  });

  // T005-05: Estimate context tokens > 0
  it('should estimate total tokens > 0 for non-empty context', async () => {
    assembler.systemPromptLoader.setAgentsMd(TEST_AGENTS_MD);
    registry.register(createTestSkill('filesystem', 1));
    const history = [createTestMessage('1', 'user', 'Hello world')];

    const context = await assembler.assemble('session-1', history);
    expect(context.totalTokens).toBeGreaterThan(0);
  });

  // T005-06: Empty session returns minimal context
  it('should return minimal context for empty session', async () => {
    const context = await assembler.assemble('session-new', []);
    expect(context.systemPrompt).toBeTruthy();
    expect(context.toolSchemas).toEqual([]);
    expect(context.history).toEqual([]);
    // Even with default prompt, tokens should be estimated
    expect(context.totalTokens).toBeGreaterThanOrEqual(0);
  });

  // T005-07: Context order: system -> soul -> tools -> history
  it('should maintain context order: system prompt contains AGENTS.md then SOUL.md', async () => {
    assembler.systemPromptLoader.setAgentsMd(TEST_AGENTS_MD);
    assembler.systemPromptLoader.setSoulMd(TEST_SOUL_MD);
    registry.register(createTestSkill('filesystem', 1));
    const history = [createTestMessage('1', 'user', 'Hello')];

    const context = await assembler.assemble('session-1', history);

    // System prompt: AGENTS.md before SOUL.md
    expect(context.systemPrompt.indexOf(TEST_AGENTS_MD)).toBeLessThan(
      context.systemPrompt.indexOf(TEST_SOUL_MD),
    );
    // Tool schemas present
    expect(context.toolSchemas.length).toBe(1);
    // History present
    expect(context.history.length).toBe(1);
  });

  // T005-08: Assemble returns AssembledContext with all fields
  it('should return AssembledContext with all required fields', async () => {
    assembler.systemPromptLoader.setAgentsMd(TEST_AGENTS_MD);
    registry.register(createTestSkill('shell', 1));
    const history = [
      createTestMessage('1', 'user', 'Test'),
      createTestMessage('2', 'assistant', 'Response'),
    ];

    const context = await assembler.assemble('session-1', history);

    expect(context).toHaveProperty('systemPrompt');
    expect(context).toHaveProperty('toolSchemas');
    expect(context).toHaveProperty('history');
    expect(context).toHaveProperty('totalTokens');

    expect(typeof context.systemPrompt).toBe('string');
    expect(Array.isArray(context.toolSchemas)).toBe(true);
    expect(Array.isArray(context.history)).toBe(true);
    expect(typeof context.totalTokens).toBe('number');
    expect(context.history).toHaveLength(2);
    expect(context.toolSchemas).toHaveLength(1);
  });

  // T005-09: before_prompt_build hook called
  it('should call before_prompt_build hook when HookManager is provided', async () => {
    const hookManager = new HookManager();
    assembler = new ContextAssembler(registry, hookManager);

    const hookSpy = vi.fn().mockImplementation(async (ctx) => ctx);

    hookManager.registerHook('before_prompt_build', hookSpy, 10);

    await assembler.assemble('session-1', []);

    expect(hookSpy).toHaveBeenCalledTimes(1);
    expect(hookSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        hookPoint: 'before_prompt_build',
        sessionId: 'session-1',
        abort: false,
      }),
    );
  });

  // T005-10: Hook abort throws error
  it('should throw error when before_prompt_build hook aborts', async () => {
    const hookManager = new HookManager();
    assembler = new ContextAssembler(registry, hookManager);

    hookManager.registerHook('before_prompt_build', async (ctx) => ({
      ...ctx,
      abort: true,
    }), 10);

    await expect(assembler.assemble('session-1', [])).rejects.toThrow(
      'Context assembly aborted by hook',
    );
  });

  // T005-11: Token estimation accuracy (~4 chars per token)
  it('should estimate tokens with approximately 4 chars per token', () => {
    const text16 = 'a'.repeat(16); // 4 tokens
    const text20 = 'b'.repeat(20); // 5 tokens
    const text1 = 'c'; // 1 token

    expect(assembler.estimateTokens(text16)).toBe(4);
    expect(assembler.estimateTokens(text20)).toBe(5);
    expect(assembler.estimateTokens(text1)).toBe(1);
  });

  it('should return 0 for empty string token estimation', () => {
    expect(assembler.estimateTokens('')).toBe(0);
  });

  // Additional: system prompt filters out empty components
  it('should filter out empty AGENTS.md and SOUL.md from system prompt', () => {
    // Default SOUL.md is empty
    const prompt = assembler.buildSystemPrompt();
    // Should not have double newlines from empty soul
    expect(prompt).not.toMatch(/\n\n\n/);
    // Should only contain default agents content
    expect(prompt.length).toBeGreaterThan(0);
  });

  // Additional: assemble with no HookManager does not throw
  it('should assemble without errors when no HookManager is provided', async () => {
    const context = await assembler.assemble('session-1', [
      createTestMessage('1', 'user', 'Hello'),
    ]);
    expect(context.totalTokens).toBeGreaterThan(0);
  });

  // Additional: multiple tool schemas from multiple skills
  it('should aggregate tool schemas from all registered skills', async () => {
    registry.register(createTestSkill('fs', 2));
    registry.register(createTestSkill('shell', 3));
    registry.register(createTestSkill('http', 1));

    const context = await assembler.assemble('session-1', []);
    expect(context.toolSchemas).toHaveLength(6);
    expect(context.toolSchemas.map((s) => s.name)).toContain('fs.tool_0');
    expect(context.toolSchemas.map((s) => s.name)).toContain('shell.tool_2');
    expect(context.toolSchemas.map((s) => s.name)).toContain('http.tool_0');
  });

  // Additional: hook receives systemPrompt, toolSchemas, history in data
  it('should pass systemPrompt, toolSchemas, and history in hook context data', async () => {
    const hookManager = new HookManager();
    assembler = new ContextAssembler(registry, hookManager);
    assembler.systemPromptLoader.setAgentsMd('Test prompt');
    registry.register(createTestSkill('test', 1));

    let capturedData: Record<string, unknown> | undefined;

    hookManager.registerHook('before_prompt_build', async (ctx) => {
      capturedData = ctx.data;
      return ctx;
    }, 10);

    const history = [createTestMessage('1', 'user', 'Hi')];
    await assembler.assemble('session-1', history);

    expect(capturedData).toBeDefined();
    expect(capturedData!.systemPrompt).toBe('Test prompt');
    expect(Array.isArray(capturedData!.toolSchemas)).toBe(true);
    expect(Array.isArray(capturedData!.history)).toBe(true);
  });

  // Additional: null return from hook also causes abort
  it('should throw error when before_prompt_build hook returns null', async () => {
    const hookManager = new HookManager();
    assembler = new ContextAssembler(registry, hookManager);

    // HookManager treats null return as abort
    hookManager.registerHook('before_prompt_build', async () => null, 10);

    await expect(assembler.assemble('session-1', [])).rejects.toThrow(
      'Context assembly aborted by hook',
    );
  });
});
