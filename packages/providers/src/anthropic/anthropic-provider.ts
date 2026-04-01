/**
 * @osai/providers -- Anthropic Claude Provider (DOMAIN-008)
 *
 * LLM provider implementation for Anthropic Claude using the
 * @anthropic-ai/sdk package.
 *
 * Key specifics:
 * - System prompt is extracted from messages and passed as a separate parameter
 * - Tool calls use Anthropic `tool_use` content blocks
 * - Streaming uses SSE with RawMessageStreamEvent format
 * - Error mapping: rate_limit_error -> RateLimitError,
 *   overloaded_error -> ProviderUnavailableError
 */

import Anthropic from '@anthropic-ai/sdk';
import type {
  LLMRequest,
  LLMResponse,
  LLMChunk,
  ProviderConfig,
  TokenUsage,
} from '../types.js';
import { ProviderStatus } from '../types.js';
import { BaseLLMProvider } from '../base.js';
import {
  ProviderError,
  ProviderUnavailableError,
  RateLimitError,
  AuthError,
  TokenLimitError,
} from '../errors.js';
import {
  extractSystemPrompt,
  toAnthropicMessages,
  toAnthropicTools,
  fromAnthropicContent,
} from './message-converter.js';
import type { RawMessageStreamEvent } from '@anthropic-ai/sdk/resources/messages.js';

// ---------------------------------------------------------------------------
// Anthropic Provider
// ---------------------------------------------------------------------------

/**
 * Anthropic Claude LLM provider.
 *
 * Implements the LLMProvider interface using the Anthropic Messages API.
 * Handles message format conversion, streaming, and error mapping.
 */
export class AnthropicProvider extends BaseLLMProvider {
  private readonly client: Anthropic;

  constructor(config: ProviderConfig) {
    super(config);

    const apiKey = config.apiKeys[0] ?? '';
    this.client = new Anthropic({
      apiKey,
      baseURL: config.baseUrl || undefined,
      timeout: config.timeoutMs ?? 30_000,
    });
  }

  // -- LLMProvider interface ------------------------------------------------

  /**
   * Check if Anthropic API is available.
   * Sends a lightweight request to verify connectivity.
   */
  async isAvailable(): Promise<boolean> {
    try {
      await this.client.messages.countTokens({
        model: this.config.defaultModel,
        messages: [{ role: 'user', content: 'ping' }],
      });
      this.setStatus(ProviderStatus.Available);
      return true;
    } catch (error) {
      if (isAnthropicAPIError(error)) {
        // 4xx errors (except 429) mean the API is reachable but auth/config is wrong
        // 429 means rate-limited but available
        if (error.status === 429) {
          this.setStatus(ProviderStatus.RateLimited);
          return true;
        }
        if (
          error.status === 401 ||
          error.status === 403
        ) {
          this.setStatus(ProviderStatus.Unavailable);
          return false;
        }
        // Other 4xx: API reachable but request malformed -- still "available"
        if (error.status && error.status >= 400 && error.status < 500) {
          this.setStatus(ProviderStatus.Available);
          return true;
        }
      }
      this.setStatus(ProviderStatus.Unavailable);
      return false;
    }
  }

  /**
   * Perform a non-streaming completion request.
   */
  async complete(request: LLMRequest): Promise<LLMResponse> {
    const system = extractSystemPrompt(request.messages);
    const messages = toAnthropicMessages(request.messages);

    const params: Anthropic.MessageCreateParamsNonStreaming = {
      model: request.model ?? this.config.defaultModel,
      max_tokens: request.maxTokens ?? 4096,
      messages,
    };

    if (system) {
      params.system = system;
    }
    if (request.temperature !== undefined) {
      params.temperature = request.temperature;
    }
    if (request.tools && request.tools.length > 0) {
      params.tools = toAnthropicTools(request.tools);
    }
    if (request.stopSequences && request.stopSequences.length > 0) {
      params.stop_sequences = [...request.stopSequences];
    }

    try {
      const response = await this.client.messages.create(params);

      const { content, toolCalls, finishReason } = fromAnthropicContent(
        response.content,
        response.stop_reason,
      );

      const usage = this.mapUsage(response.usage);

      this.setStatus(ProviderStatus.Available);

      return this.buildResponse(request, content, usage, {
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
        finishReason,
      });
    } catch (error) {
      throw this.mapError(error);
    }
  }

  /**
   * Perform a streaming completion request.
   *
   * Returns an AsyncIterable that yields LLMChunk objects as they arrive.
   * Handles Anthropic's SSE event format (message_start, content_block_delta, etc.).
   */
  async *stream(request: LLMRequest): AsyncIterable<LLMChunk> {
    const system = extractSystemPrompt(request.messages);
    const messages = toAnthropicMessages(request.messages);

    const params: Anthropic.MessageCreateParamsStreaming = {
      model: request.model ?? this.config.defaultModel,
      max_tokens: request.maxTokens ?? 4096,
      messages,
      stream: true,
    };

    if (system) {
      params.system = system;
    }
    if (request.temperature !== undefined) {
      params.temperature = request.temperature;
    }
    if (request.tools && request.tools.length > 0) {
      params.tools = toAnthropicTools(request.tools);
    }
    if (request.stopSequences && request.stopSequences.length > 0) {
      params.stop_sequences = [...request.stopSequences];
    }

    let accumulatedToolCalls: Array<{
      id: string;
      name: string;
      inputParts: string[];
    }> = [];

    try {
      const stream = await this.client.messages.create(params);

      for await (const event of stream as AsyncIterable<RawMessageStreamEvent>) {
        if (event.type === 'content_block_delta') {
          const delta = event.delta;

          if (delta.type === 'text_delta') {
            yield this.buildChunk(request, delta.text);
          } else if (delta.type === 'input_json_delta') {
            // Accumulate tool input JSON parts
            const currentBlock = accumulatedToolCalls[accumulatedToolCalls.length - 1];
            if (currentBlock) {
              currentBlock.inputParts.push(delta.partial_json);
            }
          }
          // Ignore thinking_delta, signature_delta, citations_delta
        } else if (event.type === 'content_block_start') {
          if (event.content_block.type === 'tool_use') {
            accumulatedToolCalls.push({
              id: event.content_block.id,
              name: event.content_block.name,
              inputParts: [],
            });
          }
          // Ignore text, thinking, redacted_thinking blocks
        } else if (event.type === 'message_delta') {
          const stopReason = this.mapStopReason(event.delta.stop_reason);

          // Build final tool calls from accumulated data
          const finalToolCalls = accumulatedToolCalls.map((tc) => ({
            id: tc.id,
            name: tc.name,
            arguments: tc.inputParts.join(''),
          }));

          const usage = event.usage
            ? this.mapDeltaUsage({ input_tokens: (event.usage as unknown as { input_tokens?: number | null }).input_tokens ?? null, output_tokens: (event.usage as unknown as { output_tokens?: number }).output_tokens ?? 0 })
            : undefined;

          yield this.buildChunk(request, '', {
            toolCalls: finalToolCalls.length > 0 ? finalToolCalls : undefined,
            finishReason: stopReason ?? undefined,
            usage,
          });
        }
        // message_start and message_stop events are informational, no chunks emitted
      }

      this.setStatus(ProviderStatus.Available);
    } catch (error) {
      throw this.mapError(error);
    }
  }

  // -- Error mapping ---------------------------------------------------------

  private mapError(error: unknown): ProviderError {
    if (isAnthropicAPIError(error)) {
      // Rate limit (429) -- check status on the error
      if (error.status === 429) {
        return new RateLimitError(
          error.message,
          this.id,
          { cause: error, retryAfterMs: extractRetryAfterMs(error) },
        );
      }

      if (error.status === 529 || error.status === 530) {
        // overloaded_error
        return new ProviderUnavailableError(
          error.message,
          this.id,
          { cause: error, statusCode: error.status },
        );
      }

      if (error.status === 401 || error.status === 403) {
        return new AuthError(
          error.message,
          this.id,
          { cause: error, statusCode: error.status as 401 | 403 },
        );
      }

      if (error.status === 400) {
        // Check for token limit errors
        if (error.message.toLowerCase().includes('token')) {
          return new TokenLimitError(
            error.message,
            this.id,
            0,
            0,
          );
        }
      }

      return new ProviderError(
        error.message,
        this.id,
        { cause: error, statusCode: error.status },
      );
    }

    if (isAnthropicConnectionError(error)) {
      return new ProviderUnavailableError(
        error.message,
        this.id,
        { cause: error },
      );
    }

    const message =
      error instanceof Error ? error.message : String(error);
    return new ProviderError(message, this.id);
  }

  // -- Usage mapping ---------------------------------------------------------

  private mapUsage(usage: Anthropic.Usage): TokenUsage {
    return this.buildUsage({
      promptTokens: usage.input_tokens,
      completionTokens: usage.output_tokens,
    });
  }

  private mapDeltaUsage(usage: {
    input_tokens: number | null;
    output_tokens: number;
  }): TokenUsage {
    return this.buildUsage({
      promptTokens: usage.input_tokens ?? 0,
      completionTokens: usage.output_tokens,
    });
  }

  // -- Stop reason mapping ---------------------------------------------------

  private mapStopReason(
    reason: string | null | undefined,
  ): 'stop' | 'length' | 'tool_calls' | string | undefined {
    if (reason === 'tool_use') return 'tool_calls';
    if (reason === 'end_turn') return 'stop';
    if (reason === 'max_tokens') return 'length';
    return reason ?? undefined;
  }
}

// ---------------------------------------------------------------------------
// Duck-typing helpers for Anthropic error detection
// ---------------------------------------------------------------------------

/**
 * Check if an error looks like an Anthropic APIError.
 *
 * Uses duck-typing instead of `instanceof` for testability,
 * since mocked SDK modules may not share prototype chains.
 */
function isAnthropicAPIError(
  error: unknown,
): error is Error & { status: number | undefined; headers: Record<string, string> | undefined } {
  return (
    error instanceof Error &&
    'status' in error &&
    typeof (error as Record<string, unknown>).status === 'number'
  );
}

/**
 * Check if an error looks like an Anthropic APIConnectionError.
 *
 * Uses duck-typing based on error name / message for testability.
 */
function isAnthropicConnectionError(error: unknown): error is Error {
  return (
    error instanceof Error &&
    (error.constructor.name === 'APIConnectionError' ||
     error.name === 'APIConnectionError')
  );
}

/**
 * Extract retry-after duration from error headers (in milliseconds).
 */
function extractRetryAfterMs(
  error: Error & { headers?: Record<string, string> | undefined },
): number | undefined {
  const retryAfter = error.headers?.['retry-after'];
  if (typeof retryAfter === 'string') {
    const seconds = Number(retryAfter);
    if (!Number.isNaN(seconds)) {
      return seconds * 1000;
    }
  }
  return undefined;
}
