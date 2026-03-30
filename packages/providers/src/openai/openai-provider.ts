/**
 * @osai/providers -- OpenAI GPT Provider (DOMAIN-008, T-003)
 *
 * OpenAI GPT provider (fallback 3 in the failover chain).
 * Uses the official OpenAI Node.js SDK with default baseURL.
 * Supports streaming, non-streaming, and tool/function calling.
 */

import OpenAI from 'openai';
import type {
  LLMRequest,
  LLMResponse,
  LLMChunk,
  TokenUsage,
  ProviderConfig,
  ChatMessage,
  ToolCall,
  ToolDefinition,
} from '../types.js';
import { ProviderStatus } from '../types.js';
import { BaseLLMProvider } from '../base.js';
import {
  ProviderError,
  ProviderUnavailableError,
  RateLimitError,
  AuthError,
} from '../errors.js';

// ---------------------------------------------------------------------------
// Duck typing helper for OpenAI APIError
// ---------------------------------------------------------------------------

interface OpenAIErrorLike {
  readonly status: number;
  readonly headers?: Record<string, string>;
}

function isOpenAIAPIError(error: unknown): error is OpenAIErrorLike & Error {
  return (
    typeof error === 'object' &&
    error !== null &&
    'status' in error &&
    typeof (error as OpenAIErrorLike).status === 'number'
  );
}

// ---------------------------------------------------------------------------
// OpenAI Provider
// ---------------------------------------------------------------------------

/**
 * OpenAI GPT provider implementation.
 *
 * Uses the official `openai` npm package with the standard base URL.
 * Supports complete(), stream(), isAvailable(), countTokens(), and
 * tool/function calling through the Chat Completions API.
 */
export class OpenAIProvider extends BaseLLMProvider {
  private readonly client: OpenAI;

  constructor(config: ProviderConfig) {
    super(config);

    const apiKey = config.apiKeys[0] ?? '';

    const timeoutMs = config.timeoutMs ?? 30_000;

    this.client = new OpenAI({
      apiKey,
      baseURL: config.baseUrl,
      timeout: timeoutMs,
    });
  }

  // -- LLMProvider interface ------------------------------------------------

  /**
   * Check OpenAI API availability by listing models.
   * A successful list call confirms the API key and endpoint are reachable.
   */
  async isAvailable(): Promise<boolean> {
    try {
      await this.client.models.list();
      this.setStatus(ProviderStatus.Available);
      return true;
    } catch (_error) {
      this.setStatus(ProviderStatus.Unavailable);
      return false;
    }
  }

  /**
   * Perform a non-streaming completion request via OpenAI Chat Completions API.
   */
  async complete(request: LLMRequest): Promise<LLMResponse> {
    try {
      const params = this.buildRequestParams(request);

      const response = await this.client.chat.completions.create({
        ...params,
        stream: false,
      });

      return this.mapResponse(response, request);
    } catch (error) {
      throw this.mapError(error);
    }
  }

  /**
   * Perform a streaming completion request.
   * Returns an AsyncIterable of LLMChunk objects.
   */
  async *stream(request: LLMRequest): AsyncIterable<LLMChunk> {
    try {
      const params = this.buildRequestParams(request);

      const stream = await this.client.chat.completions.create({
        ...params,
        stream: true,
        stream_options: { include_usage: true },
      });

      // Accumulator for streaming tool calls (OpenAI sends them as deltas)
      const toolCallAccumulator = new Map<number, { id: string; name: string; arguments: string }>();

      for await (const chunk of stream) {
        const choice = chunk.choices[0];
        if (!choice) continue;

        const delta = choice.delta;

        // Accumulate tool call deltas
        if (delta.tool_calls) {
          for (const tc of delta.tool_calls) {
            if (tc.index === undefined) continue;

            if (!toolCallAccumulator.has(tc.index)) {
              toolCallAccumulator.set(tc.index, {
                id: tc.id ?? '',
                name: tc.function?.name ?? '',
                arguments: '',
              });
            }

            const accumulated = toolCallAccumulator.get(tc.index)!;
            if (tc.id) accumulated.id = tc.id;
            if (tc.function?.name) accumulated.name = tc.function.name;
            if (tc.function?.arguments) accumulated.arguments += tc.function.arguments;
          }
        }

        // Build accumulated tool calls array for this chunk
        const toolCalls: ToolCall[] | undefined =
          toolCallAccumulator.size > 0
            ? [...toolCallAccumulator.entries()]
                .sort(([a], [b]) => a - b)
                .map(([_idx, tc]) => ({
                  id: tc.id,
                  name: tc.name,
                  arguments: tc.arguments,
                }))
            : undefined;

        let usage: TokenUsage | undefined;
        if (chunk.usage) {
          usage = {
            promptTokens: chunk.usage.prompt_tokens,
            completionTokens: chunk.usage.completion_tokens,
            totalTokens: chunk.usage.total_tokens,
          };
        }

        yield this.buildChunk(request, delta.content ?? '', {
          toolCalls,
          usage,
          finishReason: choice.finish_reason ?? undefined,
        });
      }
    } catch (error) {
      throw this.mapError(error);
    }
  }

  // -- Private helpers ------------------------------------------------------

  /**
   * Build OpenAI API request parameters from LLMRequest.
   */
  private buildRequestParams(
    request: LLMRequest,
  ): Omit<OpenAI.ChatCompletionCreateParams, 'stream'> & {
    stream?: boolean;
    stream_options?: { include_usage: boolean };
  } {
    const params: Record<string, unknown> = {
      model: request.model,
      messages: this.mapMessages(request.messages),
    };

    if (request.temperature !== undefined) {
      params.temperature = request.temperature;
    }

    if (request.maxTokens !== undefined) {
      params.max_tokens = request.maxTokens;
    }

    if (request.stopSequences && request.stopSequences.length > 0) {
      params.stop = request.stopSequences;
    }

    if (request.tools && request.tools.length > 0) {
      params.tools = this.mapTools(request.tools);
    }

    return params as Omit<OpenAI.ChatCompletionCreateParams, 'stream'> & {
      stream?: boolean;
      stream_options?: { include_usage: boolean };
    };
  }

  /**
   * Map ChatMessage[] to OpenAI message format.
   */
  private mapMessages(
    messages: readonly ChatMessage[],
  ): OpenAI.ChatCompletionMessageParam[] {
    return messages.map((msg): OpenAI.ChatCompletionMessageParam => {
      const base = { role: msg.role as 'system' | 'user' | 'assistant' | 'tool' };

      // Tool result messages need tool_call_id
      if (msg.role === 'tool') {
        return {
          ...base,
          content: msg.content,
          tool_call_id: msg.toolCallId ?? '',
        } as OpenAI.ChatCompletionToolMessageParam;
      }

      // Assistant messages may have tool_calls
      if (msg.role === 'assistant' && msg.toolCalls && msg.toolCalls.length > 0) {
        return {
          ...base,
          content: msg.content || null,
          tool_calls: msg.toolCalls.map((tc) => ({
            id: tc.id,
            type: 'function' as const,
            function: {
              name: tc.name,
              arguments: tc.arguments,
            },
          })),
        } as OpenAI.ChatCompletionAssistantMessageParam;
      }

      return {
        ...base,
        content: msg.content,
      } as OpenAI.ChatCompletionUserMessageParam;
    });
  }

  /**
   * Map ToolDefinition[] to OpenAI tools format.
   */
  private mapTools(
    tools: readonly ToolDefinition[],
  ): OpenAI.ChatCompletionTool[] {
    return tools.map((tool) => ({
      type: 'function' as const,
      function: {
        name: tool.function.name,
        description: tool.function.description,
        parameters: tool.function.parameters as Record<string, unknown> | undefined,
      },
    }));
  }

  /**
   * Map OpenAI ChatCompletion response to LLMResponse.
   */
  private mapResponse(
    response: OpenAI.ChatCompletion,
    request: LLMRequest,
  ): LLMResponse {
    const choice = response.choices[0];
    if (!choice) {
      throw new ProviderError(
        'No choices returned from OpenAI',
        this.id,
      );
    }

    const message = choice.message;
    const content = message.content ?? '';

    let toolCalls: ToolCall[] | undefined;
    if (message.tool_calls && message.tool_calls.length > 0) {
      toolCalls = message.tool_calls.map((tc) => ({
        id: tc.id,
        name: tc.function.name,
        arguments: tc.function.arguments,
      }));
    }

    const usage: TokenUsage = response.usage
      ? {
          promptTokens: response.usage.prompt_tokens,
          completionTokens: response.usage.completion_tokens,
          totalTokens: response.usage.total_tokens,
        }
      : this.estimateUsage(request.messages, content);

    return this.buildResponse(request, content, usage, {
      toolCalls,
      finishReason: choice.finish_reason ?? undefined,
    });
  }

  /**
   * Map OpenAI SDK errors to ProviderError hierarchy.
   *
   * Uses duck typing on `status` and `headers` properties to detect
   * OpenAI APIError, which makes the code testable without relying
   * on `instanceof` checks against the mocked SDK constructor.
   */
  private mapError(error: unknown): ProviderError {
    if (isOpenAIAPIError(error)) {
      const statusCode = error.status;
      const message =
        error instanceof Error ? error.message : String(error);

      if (statusCode === 429) {
        const retryAfterMs = error.headers?.['retry-after']
          ? Number(error.headers['retry-after']) * 1000
          : undefined;

        return new RateLimitError(
          message,
          this.id,
          { cause: error instanceof Error ? error : undefined, retryAfterMs },
        );
      }

      if (statusCode === 401 || statusCode === 403) {
        return new AuthError(
          message,
          this.id,
          { cause: error instanceof Error ? error : undefined, statusCode: statusCode as 401 | 403 },
        );
      }

      if (statusCode >= 500) {
        return new ProviderUnavailableError(
          message,
          this.id,
          { cause: error instanceof Error ? error : undefined, statusCode },
        );
      }

      return new ProviderError(
        message,
        this.id,
        { cause: error instanceof Error ? error : undefined, statusCode },
      );
    }

    if (error instanceof ProviderError) {
      return error;
    }

    // Wrap unknown errors
    const message =
      error instanceof Error ? error.message : String(error);
    const cause = error instanceof Error ? error : undefined;

    return new ProviderUnavailableError(
      message,
      this.id,
      { cause },
    );
  }
}
