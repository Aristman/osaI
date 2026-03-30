/**
 * @osai/providers -- Ollama Provider (DOMAIN-008, T-006)
 *
 * Local LLM provider using the Ollama REST API.
 * Endpoint: http://localhost:11434 (configurable)
 * Default model: llama3 (configurable)
 *
 * Uses raw HTTP (global fetch) for communication -- no external SDK needed.
 * Ollama does not require API keys or authentication.
 *
 * Supported Ollama API endpoints:
 * - POST /api/chat      -- chat completions (streaming and non-streaming)
 * - GET  /api/tags      -- list local models (health check)
 * - POST /api/embeddings -- text embeddings (used for token counting)
 */

import type {
  LLMRequest,
  LLMResponse,
  LLMChunk,
  TokenUsage,
  ProviderConfig,
  ChatMessage,
  ToolDefinition,
} from '../types.js';
import { ProviderStatus } from '../types.js';
import { BaseLLMProvider } from '../base.js';
import {
  ProviderError,
  ProviderUnavailableError,
} from '../errors.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Default Ollama endpoint. */
const DEFAULT_BASE_URL = 'http://localhost:11434';

/** Default model identifier. */
const DEFAULT_MODEL = 'llama3';

// ---------------------------------------------------------------------------
// Ollama API Types
// ---------------------------------------------------------------------------

/** Ollama message format (subset of the full API). */
interface OllamaMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
}

/** Ollama request body for /api/chat. */
interface OllamaChatRequest {
  model: string;
  messages: OllamaMessage[];
  stream: boolean;
  tools?: OllamaTool[];
  options?: {
    temperature?: number;
    num_predict?: number;
    stop?: string[];
    [key: string]: unknown;
  };
}

/** Ollama tool definition format. */
interface OllamaTool {
  type: 'function';
  function: {
    name: string;
    description?: string;
    parameters?: Record<string, unknown>;
  };
}

/** Ollama non-streaming response (done: true). */
interface OllamaChatResponse {
  model: string;
  created_at: string;
  message: {
    role: string;
    content: string;
    tool_calls?: Array<{
      function: {
        name: string;
        arguments: Record<string, unknown>;
      };
    }>;
  };
  done: boolean;
  eval_count?: number;
  prompt_eval_count?: number;
  total_duration?: number;
  error?: string;
}

/** Ollama streaming response chunk. */
interface OllamaChatChunk {
  model: string;
  created_at: string;
  message: {
    role: string;
    content: string;
  };
  done: boolean;
  eval_count?: number;
  prompt_eval_count?: number;
  error?: string;
}

/** Ollama /api/tags response. */
interface OllamaTagsResponse {
  model_names?: string[];
  models?: Array<{ name: string }>;
  error?: string;
}

// ---------------------------------------------------------------------------
// Ollama Provider
// ---------------------------------------------------------------------------

/**
 * Ollama local LLM provider (offline fallback in the failover chain).
 *
 * Communicates with the locally running Ollama server via its REST API.
 * No authentication required. Supports streaming (NDJSON) and non-streaming
 * completions, tool/function calling, and health checks.
 *
 * Graceful degradation: when Ollama is not running, `isAvailable()` returns
 * `false` and the ProviderChain skips this provider.
 */
export class OllamaProvider extends BaseLLMProvider {
  /** Timeout for individual HTTP requests (ms). */
  private readonly requestTimeoutMs: number;

  constructor(config?: Partial<ProviderConfig>) {
    const mergedConfig: ProviderConfig = {
      id: config?.id ?? 'ollama',
      name: config?.name ?? 'Ollama (Local)',
      baseUrl: config?.baseUrl ?? DEFAULT_BASE_URL,
      apiKeys: config?.apiKeys ?? [],
      defaultModel: config?.defaultModel ?? DEFAULT_MODEL,
      timeoutMs: config?.timeoutMs ?? 30_000,
      extra: config?.extra,
    };

    super(mergedConfig);
    this.requestTimeoutMs = mergedConfig.timeoutMs ?? 30_000;
  }

  // -- LLMProvider interface ------------------------------------------------

  /**
   * Check Ollama availability by listing local models.
   *
   * A successful GET /api/tags response confirms the Ollama server
   * is running and reachable. Returns `false` on connection refused
   * or any error (graceful degradation).
   */
  async isAvailable(): Promise<boolean> {
    try {
      const url = `${this.config.baseUrl}/api/tags`;
      const response = await fetch(url, {
        signal: AbortSignal.timeout(this.requestTimeoutMs),
      });

      if (!response.ok) {
        this.setStatus(ProviderStatus.Unavailable);
        return false;
      }

      // Verify the response is valid JSON (even if no models installed)
      await response.json() as OllamaTagsResponse;
      // If we got here, Ollama is running
      this.setStatus(ProviderStatus.Available);
      return true;
    } catch (_error) {
      this.setStatus(ProviderStatus.Unavailable);
      return false;
    }
  }

  /**
   * Perform a non-streaming chat completion against Ollama.
   *
   * Uses POST /api/chat with `stream: false`.
   *
   * @throws {ProviderUnavailableError} On connection errors.
   * @throws {ProviderError} On HTTP errors from the Ollama API.
   */
  async complete(request: LLMRequest): Promise<LLMResponse> {
    const model = request.model || this.config.defaultModel;
    const body: OllamaChatRequest = {
      model,
      messages: this.convertMessages(request.messages),
      stream: false,
    };

    this.applyOptions(body, request);

    if (request.tools && request.tools.length > 0) {
      body.tools = this.convertTools(request.tools);
    }

    try {
      const url = `${this.config.baseUrl}/api/chat`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(this.requestTimeoutMs),
      });

      if (!response.ok) {
        throw await this.handleHttpError(response);
      }

      const data = (await response.json()) as OllamaChatResponse;

      if (data.error) {
        throw new ProviderError(data.error, this.id);
      }

      return this.mapResponse(data, request);
    } catch (error) {
      throw this.mapError(error);
    }
  }

  /**
   * Perform a streaming chat completion against Ollama.
   *
   * Uses POST /api/chat with `stream: true`. The response is
   * a newline-delimited JSON (NDJSON) stream.
   *
   * Returns an `AsyncIterable` of `LLMChunk` objects.
   *
   * @throws {ProviderUnavailableError} On connection errors.
   * @throws {ProviderError} On HTTP errors from the Ollama API.
   */
  async *stream(request: LLMRequest): AsyncIterable<LLMChunk> {
    const model = request.model || this.config.defaultModel;
    const body: OllamaChatRequest = {
      model,
      messages: this.convertMessages(request.messages),
      stream: true,
    };

    this.applyOptions(body, request);

    if (request.tools && request.tools.length > 0) {
      body.tools = this.convertTools(request.tools);
    }

    let response: Response;

    try {
      const url = `${this.config.baseUrl}/api/chat`;
      response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(this.requestTimeoutMs),
      });

      if (!response.ok) {
        throw await this.handleHttpError(response);
      }
    } catch (error) {
      throw this.mapError(error);
    }

    try {
      const reader = response.body!.getReader();
      const decoder = new TextDecoder();

      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Process complete lines (NDJSON: one JSON object per line)
        const lines = buffer.split('\n');
        // Keep the last potentially incomplete line in the buffer
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;

          try {
            const chunk = JSON.parse(trimmed) as OllamaChatChunk;

            if (chunk.error) {
              throw new ProviderError(chunk.error, this.id);
            }

            const content = chunk.message?.content ?? '';

            const usage = (chunk.eval_count != null && chunk.prompt_eval_count != null)
              ? this.buildUsage({
                  promptTokens: chunk.prompt_eval_count!,
                  completionTokens: chunk.eval_count!,
                })
              : undefined;

            const finishReason = chunk.done ? 'stop' : undefined;

            yield this.buildChunk(request, content, {
              usage,
              finishReason,
            });
          } catch (error) {
            // Skip malformed lines (unless it's our own ProviderError)
            if (error instanceof ProviderError) {
              throw error;
            }
            // Ignore JSON parse errors for individual lines
          }
        }
      }

      // Process any remaining data in the buffer
      if (buffer.trim()) {
        try {
          const chunk = JSON.parse(buffer.trim()) as OllamaChatChunk;
          if (chunk.error) {
            throw new ProviderError(chunk.error, this.id);
          }

          const content = chunk.message?.content ?? '';
          const usage = (chunk.eval_count != null && chunk.prompt_eval_count != null)
            ? this.buildUsage({
                promptTokens: chunk.prompt_eval_count!,
                completionTokens: chunk.eval_count!,
              })
            : undefined;

          yield this.buildChunk(request, content, {
            usage,
            finishReason: chunk.done ? 'stop' : undefined,
          });
        } catch (error) {
          if (error instanceof ProviderError) {
            throw error;
          }
        }
      }
    } catch (error) {
      throw this.mapError(error);
    }
  }

  // -- Private helpers ------------------------------------------------------

  /**
   * Convert internal ChatMessage[] to Ollama message format.
   */
  private convertMessages(messages: readonly ChatMessage[]): OllamaMessage[] {
    return messages.map((msg): OllamaMessage => {
      // Ollama supports the standard roles: system, user, assistant, tool
      return {
        role: msg.role as OllamaMessage['role'],
        content: msg.content,
      };
    });
  }

  /**
   * Convert internal ToolDefinition[] to Ollama tool format.
   */
  private convertTools(tools: readonly ToolDefinition[]): OllamaTool[] {
    return tools.map((tool): OllamaTool => ({
      type: 'function',
      function: {
        name: tool.function.name,
        description: tool.function.description,
        parameters: tool.function.parameters,
      },
    }));
  }

  /**
   * Apply optional parameters (temperature, maxTokens, stop) to Ollama request.
   */
  private applyOptions(body: OllamaChatRequest, request: LLMRequest): void {
    const options: NonNullable<OllamaChatRequest['options']> = {};

    if (request.temperature !== undefined) {
      options.temperature = request.temperature;
    }

    if (request.maxTokens !== undefined) {
      options.num_predict = request.maxTokens;
    }

    if (request.stopSequences && request.stopSequences.length > 0) {
      options.stop = [...request.stopSequences];
    }

    if (Object.keys(options).length > 0) {
      body.options = options;
    }
  }

  /**
   * Map an Ollama chat response to LLMResponse.
   */
  private mapResponse(
    data: OllamaChatResponse,
    request: LLMRequest,
  ): LLMResponse {
    const content = data.message?.content ?? '';

    // Build usage from Ollama eval counts or fall back to estimation
    const usage: TokenUsage =
      data.eval_count != null && data.prompt_eval_count != null
        ? this.buildUsage({
            promptTokens: data.prompt_eval_count!,
            completionTokens: data.eval_count!,
          })
        : this.estimateUsage(request.messages, content);

    // Map tool_calls if present
    const toolCalls = data.message?.tool_calls
      ? data.message.tool_calls.map((tc, index) => ({
          id: `call_ollama_${index}`,
          name: tc.function.name,
          arguments: JSON.stringify(tc.function.arguments),
        }))
      : undefined;

    const finishReason = data.done ? 'stop' : undefined;

    return this.buildResponse(request, content, usage, {
      toolCalls: toolCalls?.length ? toolCalls : undefined,
      finishReason,
    });
  }

  /**
   * Handle a non-OK HTTP response by extracting error information.
   */
  private async handleHttpError(response: Response): Promise<ProviderError> {
    let errorMessage = `Ollama API returned HTTP ${response.status}`;

    try {
      const body = (await response.json()) as { error?: string };
      if (body.error) {
        errorMessage = body.error;
      }
    } catch {
      // Response body is not JSON, use default message
    }

    return new ProviderError(errorMessage, this.id, {
      statusCode: response.status,
    });
  }

  /**
   * Map errors to the ProviderError hierarchy.
   *
   * - Connection errors (TypeError from fetch) -> ProviderUnavailableError
   * - ProviderError (re-thrown) -> passthrough
   * - Other errors -> ProviderUnavailableError (conservative)
   */
  private mapError(error: unknown): ProviderError {
    if (error instanceof ProviderError) {
      return error;
    }

    // fetch() throws TypeError on network errors (connection refused, DNS, etc.)
    if (error instanceof TypeError) {
      return new ProviderUnavailableError(
        `Ollama connection failed: ${error.message}`,
        this.id,
        { cause: error },
      );
    }

    // AbortError from AbortSignal.timeout
    if (error instanceof DOMException && error.name === 'AbortError') {
      return new ProviderUnavailableError(
        'Ollama request timed out',
        this.id,
        { cause: error instanceof Error ? error : undefined },
      );
    }

    // Wrap unknown errors
    const message =
      error instanceof Error ? error.message : 'Unknown Ollama error';
    const cause = error instanceof Error ? error : undefined;

    return new ProviderUnavailableError(
      `Ollama error: ${message}`,
      this.id,
      { cause },
    );
  }
}
