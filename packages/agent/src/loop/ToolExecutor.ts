/**
 * @osai/agent -- Tool Executor
 *
 * Executes the tool execution loop: when the LLM returns tool_use responses,
 * the ToolExecutor dispatches tool calls to SkillRegistry, appends results
 * to messages, and re-calls inference until the LLM stops requesting tools
 * or the max iterations guard is reached.
 *
 * Hook integration:
 *   - BEFORE_TOOL_EXECUTION: fired before each tool call
 *   - AFTER_TOOL_EXECUTION: fired after each tool call (with result)
 *
 * Dependencies (InferenceService, SkillRegistry, HookRegistry) are
 * injected via constructor (DI).
 */

import type { ChatMessage, ToolCall, ToolDefinition } from '@osai/providers';
import type { ToolResult } from '@osai/skills-core';
import { HookPoint } from '../hooks/types.js';
import type { HookRegistry, HookContext } from '../hooks/index.js';
import type { InferenceService, InferenceResult } from '../inference/index.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Configuration for a ToolExecutor.run() invocation.
 */
export interface ToolExecutorConfig {
  /** Correlation: session identifier. */
  readonly sessionId: string;
  /** Correlation: chat identifier. */
  readonly chatId: string;
  /** Correlation: trace identifier. */
  readonly traceId: string;
  /** Maximum number of inference iterations. Default: 10. */
  readonly maxIterations?: number;
}

/**
 * Input for ToolExecutor.executeToolLoop().
 */
export interface ToolExecutorInput {
  /** Current conversation messages. */
  readonly messages: readonly ChatMessage[];
  /** Optional tool definitions to pass to inference. */
  readonly tools?: readonly ToolDefinition[];
}

/**
 * Output from ToolExecutor.executeToolLoop().
 */
export interface ToolExecutorOutput {
  /** Final messages array including all tool results and responses. */
  readonly messages: ChatMessage[];
  /** Tool calls per iteration (array of arrays). */
  readonly toolCalls: ToolCall[][];
  /** Total number of inference iterations executed. */
  readonly iterations: number;
  /** Whether the loop was terminated due to max iterations guard. */
  readonly maxIterationsReached: boolean;
}

// ---------------------------------------------------------------------------
// ToolExecutor
// ---------------------------------------------------------------------------

/**
 * Orchestrates the tool execution loop.
 *
 * Loop logic:
 * 1. Call inference.infer(messages, tools)
 * 2. If response has toolCalls:
 *    a. For each toolCall:
 *       - BEFORE_TOOL_EXECUTION hook
 *       - SkillRegistry.execute(toolName, params) -> ToolResult
 *       - AFTER_TOOL_EXECUTION hook
 *       - Append tool result message to messages
 *    b. Re-call inference with updated messages
 * 3. If response has NO toolCalls -> break loop
 * 4. Max iterations guard (default 10) -> return with warning
 */
export class ToolExecutor {
  private readonly _inferenceService: InferenceService;
  private readonly _skillRegistry: {
    execute(toolName: string, params: Record<string, unknown>): Promise<ToolResult>;
  };
  private readonly _hooks: HookRegistry;

  /** Default max iterations guard value. */
  private static readonly DEFAULT_MAX_ITERATIONS = 10;

  /**
   * @param inferenceService - Model inference service (T-003).
   * @param skillRegistry    - Skill registry for tool dispatch (F-007).
   * @param hooks            - Hook registry for lifecycle hooks.
   */
  constructor(
    inferenceService: InferenceService,
    skillRegistry: {
      execute(toolName: string, params: Record<string, unknown>): Promise<ToolResult>;
    },
    hooks: HookRegistry,
  ) {
    this._inferenceService = inferenceService;
    this._skillRegistry = skillRegistry;
    this._hooks = hooks;
  }

  // -----------------------------------------------------------------------
  // executeToolLoop
  // -----------------------------------------------------------------------

  /**
   * Execute the tool execution loop.
   *
   * @param messages - Current conversation messages.
   * @param tools    - Optional tool definitions for inference.
   * @param config   - Loop configuration (correlation IDs, max iterations).
   * @returns ToolExecutorOutput with final messages, tool calls, and iteration count.
   */
  async executeToolLoop(
    messages: readonly ChatMessage[],
    tools: readonly ToolDefinition[] | undefined,
    config: ToolExecutorConfig,
  ): Promise<ToolExecutorOutput> {
    const maxIterations = config.maxIterations ?? ToolExecutor.DEFAULT_MAX_ITERATIONS;

    // Working copy of messages (mutable)
    const workingMessages: ChatMessage[] = [...messages];
    const allToolCalls: ToolCall[][] = [];
    let maxIterationsReached = false;

    for (let iteration = 0; iteration < maxIterations; iteration++) {
      // Step 1: Call inference
      const result: InferenceResult = await this._inferenceService.infer({
        messages: workingMessages,
        tools,
        sessionId: config.sessionId,
        chatId: config.chatId,
        traceId: config.traceId,
      });

      // Record tool calls for this iteration
      const iterationToolCalls: ToolCall[] =
        result.toolCalls !== undefined && result.toolCalls.length > 0
          ? [...result.toolCalls]
          : [];

      allToolCalls.push(iterationToolCalls);

      // Append assistant message to working messages
      workingMessages.push({
        role: 'assistant',
        content: result.content,
        toolCalls: iterationToolCalls.length > 0 ? iterationToolCalls : undefined,
      });

      // Step 2: If no tool calls, break the loop
      if (!result.hasToolCalls || iterationToolCalls.length === 0) {
        return {
          messages: workingMessages,
          toolCalls: allToolCalls,
          iterations: iteration + 1,
          maxIterationsReached: false,
        };
      }

      // Step 2a-2b: Execute each tool call
      for (const toolCall of iterationToolCalls) {
        const toolResult = await this._executeSingleToolCall(
          toolCall,
          config,
        );

        // Append tool result message
        workingMessages.push({
          role: 'tool',
          content: JSON.stringify(toolResult),
          toolCallId: toolCall.id,
        });
      }
    }

    // Max iterations reached
    maxIterationsReached = true;
    return {
      messages: workingMessages,
      toolCalls: allToolCalls,
      iterations: maxIterations,
      maxIterationsReached,
    };
  }

  // -----------------------------------------------------------------------
  // Internal: Single tool call execution
  // -----------------------------------------------------------------------

  /**
   * Execute a single tool call with hook integration.
   *
   * Pipeline:
   * 1. BEFORE_TOOL_EXECUTION hook
   * 2. SkillRegistry.execute(toolName, params)
   * 3. AFTER_TOOL_EXECUTION hook
   *
   * On error from SkillRegistry: log error, return error ToolResult,
   * still fire AFTER_TOOL_EXECUTION hook with error result.
   */
  private async _executeSingleToolCall(
    toolCall: ToolCall,
    config: ToolExecutorConfig,
  ): Promise<ToolResult> {
    // Parse tool arguments
    let params: Record<string, unknown> = {};
    try {
      params = JSON.parse(toolCall.arguments) as Record<string, unknown>;
    } catch {
      params = {};
    }

    // Step 1: BEFORE_TOOL_EXECUTION hook
    await this._executeBeforeToolHook(toolCall, params, config);

    // Step 2: Execute tool via SkillRegistry
    let toolResult: ToolResult;

    try {
      toolResult = await this._skillRegistry.execute(toolCall.name, params);
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : String(error);

      console.error(
        `[ToolExecutor] Tool '${toolCall.name}' (id=${toolCall.id}) execution failed:`,
        message,
      );

      toolResult = { success: false, error: message };
    }

    // Step 3: AFTER_TOOL_EXECUTION hook
    await this._executeAfterToolHook(toolCall, toolResult, config);

    return toolResult;
  }

  // -----------------------------------------------------------------------
  // Internal: Hook execution helpers
  // -----------------------------------------------------------------------

  /**
   * Execute the BEFORE_TOOL_EXECUTION hook.
   */
  private async _executeBeforeToolHook(
    toolCall: ToolCall,
    params: Record<string, unknown>,
    config: ToolExecutorConfig,
  ): Promise<void> {
    const context: HookContext = {
      hookPoint: HookPoint.BEFORE_TOOL_EXECUTION,
      sessionId: config.sessionId,
      chatId: config.chatId,
      traceId: config.traceId,
      timestamp: new Date().toISOString(),
      data: {
        toolName: toolCall.name,
        toolCallId: toolCall.id,
        toolParams: params,
      },
    };

    await this._hooks.execute(HookPoint.BEFORE_TOOL_EXECUTION, context);
  }

  /**
   * Execute the AFTER_TOOL_EXECUTION hook.
   */
  private async _executeAfterToolHook(
    toolCall: ToolCall,
    toolResult: ToolResult,
    config: ToolExecutorConfig,
  ): Promise<void> {
    const context: HookContext = {
      hookPoint: HookPoint.AFTER_TOOL_EXECUTION,
      sessionId: config.sessionId,
      chatId: config.chatId,
      traceId: config.traceId,
      timestamp: new Date().toISOString(),
      data: {
        toolName: toolCall.name,
        toolCallId: toolCall.id,
        toolResult,
      },
    };

    await this._hooks.execute(HookPoint.AFTER_TOOL_EXECUTION, context);
  }
}
