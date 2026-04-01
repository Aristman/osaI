/**
 * @osai/agent -- Inference Service
 *
 * Service for calling LLM providers through the ProviderChain (F-002).
 * Integrates BEFORE_MODEL_INFERENCE / AFTER_MODEL_INFERENCE hooks.
 * Supports both streaming and non-streaming inference.
 *
 * Dependencies are injected via constructor (DI).
 */

import type {
  LLMProvider,
  LLMRequest,
  LLMResponse,
  LLMChunk,
  ChatMessage,
  ToolDefinition,
} from '@osai/providers';
import { HookRegistry } from '../hooks/HookRegistry.js';
import { HookPoint } from '../hooks/types.js';
import type { HookContext } from '../hooks/types.js';
import type { InferenceInput, InferenceResult, InferenceChunk } from './types.js';

// ---------------------------------------------------------------------------
// InferenceService
// ---------------------------------------------------------------------------

/**
 * Orchestrates LLM inference with hook integration.
 *
 * Accepts either an LLMProvider or a ProviderChain (which implements
 * the same interface). Delegates completion/streaming to the provider
 * and fires BEFORE_MODEL_INFERENCE / AFTER_MODEL_INFERENCE hooks.
 */
export class InferenceService {
  private readonly _provider: LLMProvider;
  private readonly _hooks: HookRegistry;

  /**
   * @param provider - An LLMProvider (or ProviderChain) to delegate to.
   * @param hooks    - Hook registry for lifecycle hooks.
   */
  constructor(provider: LLMProvider, hooks: HookRegistry) {
    this._provider = provider;
    this._hooks = hooks;
  }

  // -----------------------------------------------------------------------
  // infer (non-streaming)
  // -----------------------------------------------------------------------

  /**
   * Perform a non-streaming inference call.
   *
   * Pipeline:
   * 1. Fire BEFORE_MODEL_INFERENCE hook
   * 2. Build LLMRequest from InferenceInput + hook context data
   * 3. Delegate to provider.complete()
   * 4. Fire AFTER_MODEL_INFERENCE hook
   * 5. Return InferenceResult
   *
   * @param input - The inference input.
   * @returns The inference result.
   */
  async infer(input: InferenceInput): Promise<InferenceResult> {
    // Step 1: BEFORE_MODEL_INFERENCE hook
    const beforeCtx = await this._executeBeforeHook(input);

    // Step 2: Build LLMRequest
    const request = this._buildRequest(input, beforeCtx);

    // Step 3: Delegate to provider
    const response: LLMResponse = await this._provider.complete(request);

    // Step 4: AFTER_MODEL_INFERENCE hook
    await this._executeAfterHook(response, input);

    // Step 5: Build and return result
    return this._buildResult(response);
  }

  // -----------------------------------------------------------------------
  // inferStream (streaming)
  // -----------------------------------------------------------------------

  /**
   * Perform a streaming inference call.
   *
   * Pipeline:
   * 1. Fire BEFORE_MODEL_INFERENCE hook
   * 2. Build LLMRequest from InferenceInput + hook context data
   * 3. Stream chunks via provider.stream()
   * 4. Fire AFTER_MODEL_INFERENCE hook after stream completes
   * 5. Yield InferenceChunk for each LLMChunk
   *
   * @param input - The inference input.
   * @returns AsyncIterable of inference chunks.
   */
  async *inferStream(input: InferenceInput): AsyncGenerator<InferenceChunk> {
    // Step 1: BEFORE_MODEL_INFERENCE hook
    const beforeCtx = await this._executeBeforeHook(input);

    // Step 2: Build LLMRequest
    const request = this._buildRequest(input, beforeCtx);

    // Step 3: Stream from provider
    const stream = this._provider.stream(request);

    // Collect final info for AFTER hook
    let lastModel = '';
    let lastProvider = '';
    let finalUsage = undefined as LLMChunk['usage'] | undefined;
    let finalFinishReason = '';

    for await (const chunk of stream) {
      lastModel = chunk.model;
      lastProvider = chunk.provider;
      if (chunk.usage !== undefined) {
        finalUsage = chunk.usage;
      }
      if (chunk.finishReason !== undefined) {
        finalFinishReason = chunk.finishReason;
      }

      const hasToolCalls =
        chunk.toolCalls !== undefined && chunk.toolCalls.length > 0;

      const inferenceChunk: InferenceChunk = {
        content: chunk.content,
        toolCalls: chunk.toolCalls,
        hasToolCalls,
        usage: chunk.usage,
        finishReason: chunk.finishReason,
        model: chunk.model,
        provider: chunk.provider,
      };

      yield inferenceChunk;
    }

    // Step 4: AFTER_MODEL_INFERENCE hook
    const finalResponse: LLMResponse = {
      content: '',
      toolCalls: [],
      usage: finalUsage ?? {
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
      },
      model: lastModel,
      provider: lastProvider,
      finishReason: finalFinishReason || undefined,
    };

    await this._executeAfterHook(finalResponse, input);
  }

  // -----------------------------------------------------------------------
  // Internal: Hook execution
  // -----------------------------------------------------------------------

  /**
   * Execute the BEFORE_MODEL_INFERENCE hook.
   * Returns the (possibly modified) context.
   */
  private async _executeBeforeHook(input: InferenceInput): Promise<HookContext> {
    const context: HookContext = {
      hookPoint: HookPoint.BEFORE_MODEL_INFERENCE,
      sessionId: input.sessionId,
      chatId: input.chatId,
      traceId: input.traceId,
      timestamp: new Date().toISOString(),
      data: {
        model: input.model,
        messages: input.messages,
        tools: input.tools,
        temperature: input.temperature,
        maxTokens: input.maxTokens,
        stopSequences: input.stopSequences,
      },
    };

    return this._hooks.execute(HookPoint.BEFORE_MODEL_INFERENCE, context);
  }

  /**
   * Execute the AFTER_MODEL_INFERENCE hook.
   */
  private async _executeAfterHook(
    response: LLMResponse,
    input: InferenceInput,
  ): Promise<void> {
    const context: HookContext = {
      hookPoint: HookPoint.AFTER_MODEL_INFERENCE,
      sessionId: input.sessionId,
      chatId: input.chatId,
      traceId: input.traceId,
      timestamp: new Date().toISOString(),
      data: {
        response,
      },
    };

    await this._hooks.execute(HookPoint.AFTER_MODEL_INFERENCE, context);
  }

  // -----------------------------------------------------------------------
  // Internal: Request / Result building
  // -----------------------------------------------------------------------

  /**
   * Build an LLMRequest from InferenceInput, potentially modified by hook context.
   */
  private _buildRequest(
    input: InferenceInput,
    hookContext: HookContext,
  ): LLMRequest {
    const hookData = hookContext.data;

    // Allow hooks to override request parameters
    const model: string =
      (hookData['model'] as string | undefined) ?? input.model ?? 'default';
    const messages = (hookData['messages'] as readonly ChatMessage[] | undefined) ??
      input.messages;
    const tools = (hookData['tools'] as readonly ToolDefinition[] | undefined) ??
      input.tools;
    const temperature = (hookData['temperature'] as number | undefined) ??
      input.temperature;
    const maxTokens = (hookData['maxTokens'] as number | undefined) ??
      input.maxTokens;
    const stopSequences = (hookData['stopSequences'] as readonly string[] | undefined) ??
      input.stopSequences;

    const request: LLMRequest = {
      ...(model !== 'default' ? { model } : {}),
      messages,
      stream: false,
    };

    if (tools !== undefined && tools.length > 0) {
      request.tools = tools;
    }
    if (temperature !== undefined) {
      request.temperature = temperature;
    }
    if (maxTokens !== undefined) {
      request.maxTokens = maxTokens;
    }
    if (stopSequences !== undefined && stopSequences.length > 0) {
      request.stopSequences = stopSequences;
    }

    return request;
  }

  /**
   * Build an InferenceResult from an LLMResponse.
   */
  private _buildResult(response: LLMResponse): InferenceResult {
    const hasToolCalls =
      response.toolCalls !== undefined && response.toolCalls.length > 0;

    return {
      content: response.content,
      toolCalls: response.toolCalls,
      hasToolCalls,
      usage: response.usage,
      model: response.model,
      provider: response.provider,
      finishReason: response.finishReason,
    };
  }
}
