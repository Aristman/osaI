/**
 * @osai/agent -- Agent Loop
 *
 * Core orchestration class for the Agent Runtime pipeline.
 *
 * A single run() invocation performs:
 *   1. BEFORE_INTAKE hook
 *   2. context.assemble()  -- builds messages array with RAG
 *   3. inference.infer()   -- non-streaming LLM call
 *   4. Return response
 *
 * On error: logs + returns error response (graceful degradation).
 * Does NOT include tool execution loop (T-005) -- only one inference call.
 *
 * Dependencies (ContextAssembler, InferenceService, HookRegistry) are
 * injected via constructor (DI).
 */

import crypto from 'node:crypto';
import { HookPoint } from '../hooks/types.js';
import type { HookRegistry, HookContext } from '../hooks/index.js';
import type { ContextAssembler } from '../context/index.js';
import type { InferenceService } from '../inference/index.js';
import type {
  AgentLoopConfig,
  AgentLoopInput,
  AgentLoopOutput,
} from './types.js';

// ---------------------------------------------------------------------------
// AgentLoop
// ---------------------------------------------------------------------------

export class AgentLoop {
  private readonly _config: AgentLoopConfig;
  private readonly _contextAssembler: ContextAssembler;
  private readonly _inferenceService: InferenceService;
  private readonly _hooks: HookRegistry;

  /**
   * @param config           - Loop configuration (system prompt, defaults, etc.)
   * @param contextAssembler - Context assembly service (T-002).
   * @param inferenceService - Model inference service (T-003).
   * @param hooks            - Hook registry for lifecycle hooks.
   */
  constructor(
    config: AgentLoopConfig,
    contextAssembler: ContextAssembler,
    inferenceService: InferenceService,
    hooks: HookRegistry,
  ) {
    this._config = config;
    this._contextAssembler = contextAssembler;
    this._inferenceService = inferenceService;
    this._hooks = hooks;
  }

  // -----------------------------------------------------------------------
  // run
  // -----------------------------------------------------------------------

  /**
   * Execute one full agent loop iteration.
   *
   * Pipeline:
   *   1. BEFORE_INTAKE hook (lifecycle start)
   *   2. context.assemble() -- builds messages with history + RAG
   *   3. inference.infer()  -- single non-streaming LLM call
   *   4. Return AgentLoopOutput
   *
   * If any step fails, returns an error response (graceful degradation).
   *
   * @param input - The user message and context for this invocation.
   * @returns The agent loop output (response or error).
   */
  async run(input: AgentLoopInput): Promise<AgentLoopOutput> {
    const traceId = input.traceId ?? crypto.randomUUID();

    // Step 1: BEFORE_INTAKE hook
    await this._executeIntakeHook(input, traceId);

    try {
      // Step 2: Context assembly
      const assemblyResult = await this._contextAssembler.assemble({
        userMessage: input.userMessage,
        systemPrompt: this._config.systemPrompt,
        messages: input.messages,
        sessionId: input.sessionId,
        chatId: input.chatId,
        traceId,
      });

      // Step 3: Model inference (single call -- no tool loop)
      const inferenceResult = await this._inferenceService.infer({
        messages: assemblyResult.messages,
        tools: this._config.tools,
        model: this._config.defaultModel,
        temperature: this._config.defaultTemperature,
        maxTokens: this._config.defaultMaxTokens,
        sessionId: input.sessionId,
        chatId: input.chatId,
        traceId,
      });

      return {
        content: inferenceResult.content,
        toolCalls: inferenceResult.toolCalls,
        hasToolCalls: inferenceResult.hasToolCalls,
        usage: inferenceResult.usage,
        model: inferenceResult.model,
        provider: inferenceResult.provider,
        finishReason: inferenceResult.finishReason,
        traceId,
        isError: false,
        ragResultCount: assemblyResult.ragResultCount,
      };
    } catch (error: unknown) {
      // Graceful degradation: log + return error response
      const message =
        error instanceof Error ? error.message : String(error);

      console.error(
        `[AgentLoop] Error during pipeline execution (trace=${traceId}):`,
        message,
      );

      return {
        content: '',
        hasToolCalls: false,
        usage: {
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0,
        },
        model: this._config.defaultModel ?? 'unknown',
        provider: 'unknown',
        traceId,
        isError: true,
        errorMessage: message,
        ragResultCount: 0,
      };
    }
  }

  // -----------------------------------------------------------------------
  // Internal: Hook execution
  // -----------------------------------------------------------------------

  /**
   * Execute the BEFORE_INTAKE hook at the start of the loop.
   */
  private async _executeIntakeHook(
    input: AgentLoopInput,
    traceId: string,
  ): Promise<HookContext> {
    const context: HookContext = {
      hookPoint: HookPoint.BEFORE_INTAKE,
      sessionId: input.sessionId,
      chatId: input.chatId,
      traceId,
      timestamp: new Date().toISOString(),
      data: {
        userMessage: input.userMessage,
        historyLength: input.messages.length,
      },
    };

    return this._hooks.execute(HookPoint.BEFORE_INTAKE, context);
  }
}
