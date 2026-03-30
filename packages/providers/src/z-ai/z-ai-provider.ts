/**
 * @osai/providers -- Z.ai Provider (DOMAIN-008)
 *
 * Primary LLM provider using the Z.ai OpenAI-compatible API.
 * Endpoint: https://api.z.ai/api/paas/v4
 * Model: glm-5
 *
 * Uses the official OpenAI Node.js SDK with a custom baseURL.
 */

import OpenAI, {
  APIError as OpenAI_APIError,
  APIConnectionError as OpenAI_APIConnectionError,
  APIUserAbortError as OpenAI_APIUserAbortError,
} from 'openai';
import type { Stream } from 'openai/streaming';
import type {
  ChatCompletionMessageParam,
  ChatCompletionTool,
  ChatCompletionMessageToolCall,
} from 'openai/resources/chat/completions';
import type { ChatCompletionChunk } from 'openai/resources/chat/completions';

import type {
  LLMRequest,
  LLMResponse,
  LLMChunk,
  ToolCall,
  ToolDefinition,
  ChatMessage,
} from '../types.js';
import { BaseLLMProvider } from '../base.js';
import { ProviderStatus } from '../types.js';
import {
  ProviderError,
  ProviderUnavailableError,
  RateLimitError,
  AuthError,
} from '../errors.js';

// ---------------------------------------------------------------------------
// Z.ai Provider
// ---------------------------------------------------------------------------

/** Default Z.ai endpoint. */
const DEFAULT_BASE_URL = 'https://api.z.ai/api/paas/v4';

/** Default model identifier for Z.ai. */
const DEFAULT_MODEL = 'glm-5';

/** Shape of a streaming tool_call delta from OpenAI SDK. */
interface StreamToolCallDelta {
  index: number;
  id?: string;
  type?: 'function';
  function?: {
    name?: string;
    arguments?: string;
  };
}

/**
 * Z.ai LLM provider (primary, OpenAI-compatible).
 *
 * Communicates with the Z.ai API via the OpenAI Node.js SDK
 * using a custom `baseURL`. Supports both streaming and non-streaming
 * completions, tool/function calling, and health checks.
 */
export class ZAiProvider extends BaseLLMProvider {
  private readonly client: OpenAI;

  constructor(config?: Partial<import('../types.js').ProviderConfig>) {
    const mergedConfig: import('../types.js').ProviderConfig = {
      id: config?.id ?? 'z-ai',
      name: config?.name ?? 'Z.ai',
      baseUrl: config?.baseUrl ?? DEFAULT_BASE_URL,
      apiKeys: config?.apiKeys ?? [],
      defaultModel: config?.defaultModel ?? DEFAULT_MODEL,
      timeoutMs: config?.timeoutMs ?? 30_000,
      extra: config?.extra,
    };

    super(mergedConfig);

    const apiKey = mergedConfig.apiKeys[0] ?? '';

    this.client = new OpenAI({
      apiKey,
      baseURL: mergedConfig.baseUrl,
      timeout: mergedConfig.timeoutMs,
    });
  }

  // -- Health check -----------------------------------------------------------

  /**
   * Check Z.ai availability by listing models.
   *
   * A successful GET /models response indicates the provider is reachable
   * and the API key is valid.
   */
  async isAvailable(): Promise<boolean> {
    try {
      await this.client.models.list();
      this.setStatus(ProviderStatus.Available);
      return true;
    } catch (_error: unknown) {
      this.setStatus(ProviderStatus.Unavailable);
      return false;
    }
  }

  // -- Non-streaming completion -----------------------------------------------

  /**
   * Perform a non-streaming chat completion against Z.ai.
   *
   * @throws {RateLimitError} On HTTP 429 responses.
   * @throws {AuthError} On HTTP 401/403 responses.
   * @throws {ProviderUnavailableError} On HTTP 5xx or connection errors.
   * @throws {ProviderError} On other API errors.
   */
  async complete(request: LLMRequest): Promise<LLMResponse> {
    const messages = this.convertMessages(request.messages);
    const tools = request.tools ? this.convertTools(request.tools) : undefined;

    const params: OpenAI.ChatCompletionCreateParams = {
      model: request.model ?? this.config.defaultModel,
      messages,
      temperature: request.temperature,
      max_tokens: request.maxTokens,
      stop: request.stopSequences as string[] | undefined,
      tools,
    };

    try {
      const response = await this.client.chat.completions.create(params);
      return this.mapResponse(request, response);
    } catch (error: unknown) {
      throw this.mapError(error);
    }
  }

  // -- Streaming completion ---------------------------------------------------

  /**
   * Perform a streaming chat completion against Z.ai.
   *
   * Returns an `AsyncIterable` of `LLMChunk` objects.
   */
  async *stream(request: LLMRequest): AsyncIterable<LLMChunk> {
    const messages = this.convertMessages(request.messages);
    const tools = request.tools ? this.convertTools(request.tools) : undefined;

    const params: OpenAI.ChatCompletionCreateParams = {
      model: request.model ?? this.config.defaultModel,
      messages,
      temperature: request.temperature,
      max_tokens: request.maxTokens,
      stop: request.stopSequences as string[] | undefined,
      tools,
      stream: true,
    };

    let responseStream: Stream<ChatCompletionChunk>;

    try {
      responseStream = await this.client.chat.completions.create(params);
    } catch (error: unknown) {
      throw this.mapError(error);
    }

    try {
      for await (const chunk of responseStream) {
        const delta = chunk.choices[0]?.delta;
        const finishReason = chunk.choices[0]?.finish_reason ?? undefined;

        const content = delta?.content ?? '';

        const toolCalls = delta?.tool_calls
          ? delta.tool_calls.map(this.mapToolCallDelta)
          : undefined;

        const usage = chunk.usage
          ? {
              promptTokens: chunk.usage.prompt_tokens,
              completionTokens: chunk.usage.completion_tokens,
              totalTokens: chunk.usage.total_tokens,
            }
          : undefined;

        yield this.buildChunk(request, content, {
          toolCalls: toolCalls?.length ? toolCalls : undefined,
          usage,
          finishReason: finishReason ?? undefined,
        });
      }
    } catch (error: unknown) {
      throw this.mapError(error);
    }
  }

  // -- Message conversion -----------------------------------------------------

  /**
   * Convert internal ChatMessage[] to OpenAI SDK message format.
   */
  private convertMessages(
    messages: readonly ChatMessage[],
  ): ChatCompletionMessageParam[] {
    return messages.map((msg): ChatCompletionMessageParam => {
      // Handle tool role messages
      if (msg.role === 'tool') {
        return {
          role: 'tool' as const,
          content: msg.content,
          tool_call_id: msg.toolCallId ?? '',
        };
      }

      // Handle assistant messages with tool_calls
      if (msg.role === 'assistant' && msg.toolCalls?.length) {
        return {
          role: 'assistant' as const,
          content: msg.content,
          tool_calls: msg.toolCalls.map((tc) => ({
            id: tc.id,
            type: 'function' as const,
            function: {
              name: tc.name,
              arguments: tc.arguments,
            },
          })),
        };
      }

      // Default: system, user, assistant without tool_calls
      return {
        role: msg.role as 'system' | 'user' | 'assistant',
        content: msg.content,
      };
    });
  }

  /**
   * Convert internal ToolDefinition[] to OpenAI SDK tool format.
   */
  private convertTools(
    tools: readonly ToolDefinition[],
  ): ChatCompletionTool[] {
    return tools.map((tool): ChatCompletionTool => ({
      type: 'function' as const,
      function: {
        name: tool.function.name,
        description: tool.function.description,
        parameters: tool.function.parameters,
      },
    }));
  }

  // -- Response mapping -------------------------------------------------------

  /**
   * Map an OpenAI ChatCompletion response to LLMResponse.
   */
  private mapResponse(
    request: LLMRequest,
    response: OpenAI.ChatCompletion,
  ): LLMResponse {
    const choice = response.choices[0];
    const content = choice?.message?.content ?? '';

    const toolCalls = choice?.message?.tool_calls
      ? choice.message.tool_calls.map(this.mapToolCall)
      : undefined;

    const usage = this.buildUsage({
      promptTokens: response.usage?.prompt_tokens ?? 0,
      completionTokens: response.usage?.completion_tokens ?? 0,
    });

    return this.buildResponse(request, content, usage, {
      toolCalls: toolCalls?.length ? toolCalls : undefined,
      finishReason: choice?.finish_reason ?? undefined,
    });
  }

  /**
   * Map a single OpenAI ChatCompletionMessageToolCall to internal ToolCall.
   */
  private mapToolCall(tc: ChatCompletionMessageToolCall): ToolCall {
    return {
      id: tc.id,
      name: tc.function.name,
      arguments: tc.function.arguments,
    };
  }

  /**
   * Map a streaming tool_call delta to internal ToolCall.
   */
  private mapToolCallDelta(tc: StreamToolCallDelta): ToolCall {
    return {
      id: tc.id ?? '',
      name: tc.function?.name ?? '',
      arguments: tc.function?.arguments ?? '',
    };
  }

  // -- Error mapping ----------------------------------------------------------

  /**
   * Map OpenAI SDK errors to the ProviderError hierarchy.
   *
   * - 429 -> RateLimitError
   * - 401/403 -> AuthError
   * - 5xx / connection errors -> ProviderUnavailableError
   * - Other -> ProviderError
   */
  private mapError(error: unknown): ProviderError {
    if (error instanceof OpenAI_APIError) {
      const status = error.status;
      const message = error.message;

      if (status === 429) {
        const retryAfterMs = error.headers?.['retry-after']
          ? parseInt(error.headers['retry-after'], 10) * 1000
          : undefined;
        return new RateLimitError(message, this.id, { retryAfterMs });
      }

      if (status === 401 || status === 403) {
        return new AuthError(message, this.id, {
          statusCode: status === 403 ? 403 : 401,
        });
      }

      if (status != null && status >= 500) {
        return new ProviderUnavailableError(message, this.id, {
          statusCode: status,
        });
      }

      return new ProviderError(message, this.id, {
        statusCode: status,
        cause: error,
      });
    }

    if (error instanceof OpenAI_APIConnectionError) {
      return new ProviderUnavailableError(
        `Connection failed: ${error.message}`,
        this.id,
        { cause: error },
      );
    }

    if (error instanceof OpenAI_APIUserAbortError) {
      return new ProviderError('Request aborted', this.id, {
        cause: error,
      });
    }

    // Fallback for unexpected error types
    const message =
      error instanceof Error ? error.message : 'Unknown Z.ai error';
    return new ProviderError(message, this.id, {
      cause: error instanceof Error ? error : undefined,
    });
  }
}
