/**
 * @osai/providers -- Yandex Foundation Models Provider (DOMAIN-008)
 *
 * LLM provider implementation for Yandex Foundation Models API.
 *
 * Key specifics:
 * - Uses raw HTTP (fetch) -- Yandex API is NOT OpenAI-compatible
 * - Endpoint: https://llm.api.cloud.yandex.net/foundationModels/v1/completion
 * - Auth: IAM token or API key via Authorization header
 * - catalogueId required for routing (passed as x-folder-id header)
 * - Response format uses alternatives[] with string status codes
 * - Streaming uses newline-delimited JSON (NDJSON)
 * - Token usage values are strings, not numbers
 */

import type {
  LLMRequest,
  LLMResponse,
  LLMChunk,
  ProviderConfig,
} from '../types.js';
import { ProviderStatus } from '../types.js';
import { BaseLLMProvider } from '../base.js';
import {
  ProviderError,
  ProviderUnavailableError,
  RateLimitError,
  AuthError,
} from '../errors.js';
import {
  toYandexMessages,
  toYandexCompletionOptions,
  fromYandexResponse,
  fromYandexAlternative,
  parseYandexUsage,
} from './message-converter.js';
import type { YandexResponse } from './message-converter.js';

// ---------------------------------------------------------------------------
// Yandex Provider
// ---------------------------------------------------------------------------

/** Default Yandex API endpoint. */
const DEFAULT_BASE_URL = 'https://llm.api.cloud.yandex.net/foundationModels/v1';

/** Default model identifier for Yandex. */
const DEFAULT_MODEL = 'yandexgpt-32k-latest';

/**
 * Yandex Foundation Models LLM provider (fallback 1).
 *
 * Implements the LLMProvider interface using raw HTTP calls via fetch.
 * Yandex API is not OpenAI-compatible, so it cannot use the OpenAI SDK.
 *
 * Authorization supports two modes:
 * 1. IAM token: passed as `Authorization: Bearer {iamToken}`
 * 2. API key: passed as `Authorization: ApiKey {apiKey}`
 *
 * The catalogueId is required and is passed via the `x-folder-id` header.
 */
export class YandexProvider extends BaseLLMProvider {
  private readonly catalogueId: string;
  private readonly completionEndpoint: string;

  constructor(config?: Partial<ProviderConfig>) {
    const mergedConfig: ProviderConfig = {
      id: config?.id ?? 'yandex',
      name: config?.name ?? 'Yandex Foundation Models',
      baseUrl: config?.baseUrl ?? DEFAULT_BASE_URL,
      apiKeys: config?.apiKeys ?? [],
      defaultModel: config?.defaultModel ?? DEFAULT_MODEL,
      timeoutMs: config?.timeoutMs ?? 30_000,
      extra: config?.extra,
    };

    super(mergedConfig);

    this.catalogueId = String(mergedConfig.extra?.catalogueId ?? '');
    this.completionEndpoint = `${mergedConfig.baseUrl}/completion`;
  }

  // -- Public API for tests -------------------------------------------------

  /**
   * Get the Authorization header value.
   * Public for testing purposes (TT-002-40).
   *
   * Supports two auth modes:
   * - 'iam': Authorization: Bearer {token} (default)
   * - 'apikey': Authorization: ApiKey {key}
   *
   * Auth mode can be configured via `extra.authType`.
   */
  getAuthHeader(): string {
    const key = this.config.apiKeys[0] ?? '';
    const authType = this.config.extra?.authType as string | undefined;

    if (authType === 'apikey') {
      return `ApiKey ${key}`;
    }

    // Default: IAM token with Bearer prefix
    return `Bearer ${key}`;
  }

  // -- LLMProvider interface ------------------------------------------------

  /**
   * Check Yandex API availability.
   *
   * Sends a lightweight GET request to the completion endpoint.
   * A successful response (or any non-auth error) means the API is reachable.
   */
  async isAvailable(): Promise<boolean> {
    try {
      const response = await fetch(this.completionEndpoint, {
        method: 'GET',
        headers: this.buildHeaders(),
        signal: AbortSignal.timeout(this.config.timeoutMs ?? 30_000),
      });

      if (response.status === 401 || response.status === 403) {
        this.setStatus(ProviderStatus.Unavailable);
        return false;
      }

      if (response.status === 429) {
        this.setStatus(ProviderStatus.RateLimited);
        return true;
      }

      if (response.status >= 500) {
        this.setStatus(ProviderStatus.Unavailable);
        return false;
      }

      // 2xx or 4xx (non-auth) -- API is reachable
      this.setStatus(ProviderStatus.Available);
      return true;
    } catch {
      this.setStatus(ProviderStatus.Unavailable);
      return false;
    }
  }

  /**
   * Perform a non-streaming completion request.
   *
   * @throws {RateLimitError} On HTTP 429 responses.
   * @throws {AuthError} On HTTP 401/403 responses.
   * @throws {ProviderUnavailableError} On HTTP 5xx or connection errors.
   * @throws {ProviderError} On other API errors.
   */
  async complete(request: LLMRequest): Promise<LLMResponse> {
    const body = this.buildRequestBody(request, false);

    try {
      const response = await fetch(this.completionEndpoint, {
        method: 'POST',
        headers: this.buildHeaders(),
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(this.config.timeoutMs ?? 30_000),
      });

      if (!response.ok) {
        throw await this.mapHttpError(response);
      }

      const data = await response.json() as YandexResponse;
      this.setStatus(ProviderStatus.Available);

      return fromYandexResponse(data, request);
    } catch (error) {
      if (error instanceof ProviderError) throw error;
      throw this.mapUnknownError(error);
    }
  }

  /**
   * Perform a streaming completion request.
   *
   * Returns an AsyncIterable that yields LLMChunk objects.
   * Yandex streaming uses NDJSON (newline-delimited JSON) format.
   */
  async *stream(request: LLMRequest): AsyncIterable<LLMChunk> {
    const body = this.buildRequestBody(request, true);

    let response: Response;

    try {
      response = await fetch(this.completionEndpoint, {
        method: 'POST',
        headers: this.buildHeaders(),
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(this.config.timeoutMs ?? 30_000),
      });

      if (!response.ok) {
        throw await this.mapHttpError(response);
      }
    } catch (error) {
      if (error instanceof ProviderError) throw error;
      throw this.mapUnknownError(error);
    }

    this.setStatus(ProviderStatus.Available);

    // Parse NDJSON stream
    if (!response.body) {
      return; // Empty response body -- nothing to stream
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        // Keep the last potentially incomplete line in the buffer
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;

          try {
            const parsed = JSON.parse(trimmed) as YandexResponse;
            const alternative = parsed.result?.alternatives?.[0];

            if (!alternative) continue;

            const { text, finishReason } = fromYandexAlternative(alternative);

            const usage = parsed.result?.usage
              ? parseYandexUsage(parsed.result.usage)
              : undefined;

            yield this.buildChunk(request, text, {
              usage,
              finishReason,
            });
          } catch {
            // Skip malformed JSON lines -- robustness for partial reads
          }
        }
      }

      // Process any remaining data in buffer
      if (buffer.trim()) {
        try {
          const parsed = JSON.parse(buffer.trim()) as YandexResponse;
          const alternative = parsed.result?.alternatives?.[0];

          if (alternative) {
            const { text, finishReason } = fromYandexAlternative(alternative);
            const usage = parsed.result?.usage
              ? parseYandexUsage(parsed.result.usage)
              : undefined;

            yield this.buildChunk(request, text, {
              usage,
              finishReason,
            });
          }
        } catch {
          // Skip malformed remaining data
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  // -- Request building -----------------------------------------------------

  /**
   * Build the request body for Yandex completion API.
   *
   * The modelUri must include the catalogueId:
   * `gpt://{catalogueId}/{model}`
   */
  private buildRequestBody(
    request: LLMRequest,
    stream: boolean,
  ): Record<string, unknown> {
    const model = request.model ?? this.config.defaultModel;
    const modelUri = this.catalogueId
      ? `gpt://${this.catalogueId}/${model}`
      : model;

    return {
      modelUri,
      completionOptions: toYandexCompletionOptions(request, stream),
      messages: toYandexMessages(request.messages),
    };
  }

  /**
   * Build HTTP headers for Yandex API requests.
   *
   * - Authorization: Bearer {iamToken} or ApiKey {apiKey}
   * - x-folder-id: catalogueId for routing
   * - Content-Type: application/json (for POST)
   */
  private buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      Authorization: this.getAuthHeader(),
      'Content-Type': 'application/json',
    };

    if (this.catalogueId) {
      headers['x-folder-id'] = this.catalogueId;
    }

    return headers;
  }

  // -- Error mapping --------------------------------------------------------

  /**
   * Map an HTTP response with non-2xx status to ProviderError hierarchy.
   */
  private async mapHttpError(response: Response): Promise<ProviderError> {
    const status = response.status;

    if (status === 429) {
      const retryAfterMs = extractRetryAfterMs(response.headers);
      return new RateLimitError(
        'Yandex API rate limit exceeded',
        this.id,
        { retryAfterMs },
      );
    }

    if (status === 401 || status === 403) {
      return new AuthError(
        `Yandex API auth failed (${status})`,
        this.id,
        { statusCode: status === 403 ? 403 : 401 },
      );
    }

    if (status >= 500) {
      return new ProviderUnavailableError(
        `Yandex API server error (${status})`,
        this.id,
        { statusCode: status },
      );
    }

    // Try to extract error message from response body
    let message = `Yandex API error (${status})`;
    try {
      const body = await response.json() as { error_message?: string };
      if (body.error_message) {
        message = body.error_message;
      }
    } catch {
      // Response body is not JSON -- use default message
    }

    return new ProviderError(message, this.id, { statusCode: status });
  }

  /**
   * Map unknown errors (connection failures, aborts, etc.)
   * to ProviderError hierarchy.
   */
  private mapUnknownError(error: unknown): ProviderError {
    if (error instanceof TypeError) {
      // TypeError from fetch typically means connection failure
      return new ProviderUnavailableError(
        `Yandex API connection failed: ${error.message}`,
        this.id,
        { cause: error },
      );
    }

    if (error instanceof DOMException && error.name === 'TimeoutError') {
      return new ProviderUnavailableError(
        'Yandex API request timed out',
        this.id,
        { cause: error },
      );
    }

    if (error instanceof Error) {
      return new ProviderError(
        `Yandex API error: ${error.message}`,
        this.id,
        { cause: error },
      );
    }

    return new ProviderError(
      'Unknown Yandex API error',
      this.id,
    );
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Extract retry-after duration from response headers (in milliseconds).
 */
function extractRetryAfterMs(headers: Headers): number | undefined {
  const retryAfter = headers.get('retry-after');
  if (retryAfter == null) return undefined;

  const seconds = Number(retryAfter);
  if (!Number.isNaN(seconds) && seconds > 0) {
    return Math.round(seconds * 1000);
  }
  return undefined;
}
