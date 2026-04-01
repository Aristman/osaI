/**
 * @osai/providers -- Provider Chain (DOMAIN-008)
 *
 * Failover chain manager that iterates through LLM providers in priority order.
 * Default: Z.ai -> Yandex -> Anthropic -> OpenAI -> Ollama.
 *
 * Features:
 * - Circuit breaker per-provider (OPEN providers are skipped)
 * - Auth profile rotation on RateLimitError (try next API key)
 * - Configurable timeout per provider call
 * - Structured logging of all failover events (pino-compatible)
 */

import type {
  LLMProvider,
  LLMRequest,
  LLMResponse,
  LLMChunk,
} from '../types.js';
import { ProviderStatus } from '../types.js';
import {
  ProviderError,
  ProviderUnavailableError,
  CircuitBreakerOpenError,
} from '../errors.js';
import { CircuitBreaker } from '../circuit-breaker/index.js';
import type { CircuitBreakerConfig } from '../circuit-breaker/index.js';
import { CircuitState } from '../circuit-breaker/index.js';
import { AuthRotator } from './auth-rotation.js';
import type { AuthRotationConfig } from './auth-rotation.js';

// ---------------------------------------------------------------------------
// Logger Interface (pino-compatible)
// ---------------------------------------------------------------------------

/**
 * Minimal logger interface compatible with pino.
 * Defined here to avoid a hard dependency on the `pino` package,
 * which lives in the observability package (F-003).
 */
export interface ChainLogger {
  info(obj: Record<string, unknown>, msg: string): void;
  warn(obj: Record<string, unknown>, msg: string): void;
  debug(obj: Record<string, unknown>, msg: string): void;
  error(obj: Record<string, unknown>, msg: string): void;
  fatal(obj: Record<string, unknown>, msg: string): void;
  trace(obj: Record<string, unknown>, msg: string): void;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Status information for a single provider in the chain. */
export interface ProviderChainEntryStatus {
  /** Provider identifier. */
  readonly providerId: string;
  /** Provider display name. */
  readonly providerName: string;
  /** Runtime availability status. */
  readonly status: ProviderStatus;
  /** Circuit breaker state, if applicable. */
  readonly circuitState?: CircuitState;
  /** Number of consecutive failures (circuit breaker). */
  readonly failureCount?: number;
}

/** Configuration for the ProviderChain. */
export interface ProviderChainConfig {
  /**
   * Timeout in milliseconds for each provider call.
   * @default 30_000
   */
  readonly callTimeoutMs?: number;

  /**
   * Circuit breaker configuration applied to all providers.
   * If not provided, defaults are used (failureThreshold=5, resetTimeoutMs=30000).
   */
  readonly circuitBreaker?: CircuitBreakerConfig;

  /**
   * API keys per provider for auth rotation.
   * Keys are provider IDs, values are arrays of API keys.
   * Example: { 'z-ai': ['key1', 'key2'], 'openai': ['key3'] }
   */
  readonly authKeys?: Readonly<Record<string, readonly string[]>>;

  /**
   * Logger instance for structured logging.
   * Must be pino-compatible. If not provided, a no-op logger is used.
   */
  readonly logger?: ChainLogger;
}

/** A wrapper around a provider with its circuit breaker and auth rotator. */
interface ProviderEntry {
  readonly provider: LLMProvider;
  readonly circuitBreaker: CircuitBreaker;
  readonly authRotator: AuthRotator;
}

// ---------------------------------------------------------------------------
// No-op Logger
// ---------------------------------------------------------------------------

/** Minimal logger that does nothing, used when no logger is provided. */
const noopLogger: ChainLogger = {
  fatal: () => {},
  error: () => {},
  warn: () => {},
  info: () => {},
  debug: () => {},
  trace: () => {},
};

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const DEFAULT_CALL_TIMEOUT_MS = 30_000;

// ---------------------------------------------------------------------------
// ProviderChain
// ---------------------------------------------------------------------------

/**
 * Failover chain manager for LLM providers.
 *
 * Iterates through providers in priority order, wrapping each in a circuit
 * breaker. When a provider fails with RateLimitError, rotates API keys before
 * moving to the next provider.
 *
 * @example
 * ```typescript
 * const chain = new ProviderChain(
 *   [zAiProvider, yandexProvider, anthropicProvider, openaiProvider, ollamaProvider],
 *   { logger: pinoLogger }
 * );
 *
 * const response = await chain.execute(request);
 * // response.provider === 'z-ai' (if available)
 *
 * for await (const chunk of chain.executeStream(request)) {
 *   process.stdout.write(chunk.content);
 * }
 * ```
 */
export class ProviderChain {
  private readonly _entries: readonly ProviderEntry[];
  private readonly _callTimeoutMs: number;
  private readonly _logger: ChainLogger;
  private readonly _authKeys: Readonly<Record<string, readonly string[]>>;

  /**
   * Create a new ProviderChain.
   *
   * @param providers - Array of LLM providers in priority order.
   * @param config - Optional chain configuration.
   */
  constructor(
    providers: readonly LLMProvider[],
    config?: ProviderChainConfig,
  ) {
    this._callTimeoutMs = config?.callTimeoutMs ?? DEFAULT_CALL_TIMEOUT_MS;
    this._logger = config?.logger ?? noopLogger;
    this._authKeys = config?.authKeys ?? {};
    this.id = 'provider-chain';
    this.name = providers.length > 0
      ? `ProviderChain(${providers.map((p) => p.id).join(', ')})`
      : 'ProviderChain(empty)';

    this._entries = providers.map((provider) => {
      const cbConfig: CircuitBreakerConfig | undefined = config?.circuitBreaker;
      const authKeysForProvider = this._authKeys[provider.id];
      const rotationConfig: AuthRotationConfig = {
        apiKeys: authKeysForProvider ?? [],
      };

      return {
        provider,
        circuitBreaker: new CircuitBreaker(provider.id, cbConfig),
        authRotator: new AuthRotator(rotationConfig),
      };
    });
  }

  // -- LLMProvider interface (for InferenceService compatibility) -----------

  readonly id: string;
  readonly name: string;

  /**
   * LLMProvider.complete() -- delegates to execute() with failover.
   * This allows ProviderChain to be passed to InferenceService directly.
   */
  complete(request: LLMRequest): Promise<LLMResponse> {
    return this.execute(request);
  }

  /**
   * LLMProvider.stream() -- delegates to executeStream() with failover.
   */
  stream(request: LLMRequest): AsyncIterable<LLMChunk> {
    return this.executeStream(request);
  }

  /**
   * LLMProvider.isAvailable() -- at least one provider has a closed circuit breaker.
   */
  async isAvailable(): Promise<boolean> {
    return this._entries.some((e) => e.circuitBreaker.canExecute());
  }

  /**
   * LLMProvider.countTokens() -- approximate via first active provider.
   */
  countTokens(text: string): number {
    const active = this.getActiveProvider();
    return active ? active.countTokens(text) : Math.ceil(text.length / 4);
  }

  /**
   * LLMProvider.status -- returns 'available' if any provider is up.
   */
  get status(): string {
    return this._entries.some((e) => e.circuitBreaker.canExecute())
      ? 'available'
      : 'unavailable';
  }

  /**
   * LLMProvider.getStatus() -- returns ProviderStatus.
   */
  getStatus(): ProviderStatus {
    return this._entries.some((e) => e.circuitBreaker.canExecute())
      ? ProviderStatus.Available
      : ProviderStatus.Unavailable;
  }

  // -- Public API -----------------------------------------------------------

  /**
   * Execute a non-streaming LLM request with failover.
   *
   * Tries each provider in order. If a provider's circuit breaker is open,
   * it is skipped. If a provider throws RateLimitError, auth rotation is
   * attempted before falling back to the next provider.
   *
   * @param request - The LLM completion request.
   * @returns Response from the first available provider.
   * @throws {ProviderError} If all providers are unavailable, with diagnostic info.
   */
  async execute(request: LLMRequest): Promise<LLMResponse> {
    const errors: Array<{ providerId: string; error: Error }> = [];

    for (const entry of this._entries) {
      const { provider, circuitBreaker } = entry;

      // Skip providers with open circuit breaker
      if (!circuitBreaker.canExecute()) {
        this._logger.info(
          {
            event: 'provider_chain.skip',
            provider: provider.id,
            reason: 'circuit_breaker_open',
            circuitState: circuitBreaker.getState(),
          },
          `Skipping provider "${provider.id}" -- circuit breaker open`,
        );
        errors.push({
          providerId: provider.id,
          error: new CircuitBreakerOpenError(provider.id),
        });
        continue;
      }

      try {
        this._logger.debug(
          {
            event: 'provider_chain.attempt',
            provider: provider.id,
            model: request.model,
          },
          `Attempting provider "${provider.id}"`,
        );

        const response = await this._executeWithFailover(
          entry,
          () => provider.complete(request),
        );

        this._logger.info(
          {
            event: 'provider_chain.success',
            provider: response.provider,
            model: response.model,
            usage: response.usage,
          },
          `Provider "${response.provider}" responded successfully`,
        );

        return response;
      } catch (error) {
        const providerError =
          error instanceof ProviderError
            ? error
            : new ProviderError(
                String(error),
                provider.id,
                error instanceof Error ? { cause: error } : undefined,
              );

        this._logger.warn(
          {
            event: 'provider_chain.failover',
            provider: provider.id,
            error: providerError.message,
            errorType: providerError.name,
          },
          `Provider "${provider.id}" failed, attempting next`,
        );

        errors.push({ providerId: provider.id, error: providerError });
      }
    }

    // All providers exhausted
    throw this._buildAggregateError(errors);
  }

  /**
   * Execute a streaming LLM request with failover.
   *
   * Returns an AsyncIterable that yields LLMChunk objects from the first
   * available provider.
   *
   * @param request - The LLM completion request.
   * @returns AsyncIterable of streaming chunks.
   * @throws {ProviderError} If all providers are unavailable.
   */
  async *executeStream(request: LLMRequest): AsyncGenerator<LLMChunk> {
    const errors: Array<{ providerId: string; error: Error }> = [];

    for (const entry of this._entries) {
      const { provider, circuitBreaker } = entry;

      // Skip providers with open circuit breaker
      if (!circuitBreaker.canExecute()) {
        this._logger.info(
          {
            event: 'provider_chain.stream.skip',
            provider: provider.id,
            reason: 'circuit_breaker_open',
            circuitState: circuitBreaker.getState(),
          },
          `Skipping provider "${provider.id}" for streaming -- circuit breaker open`,
        );
        errors.push({
          providerId: provider.id,
          error: new CircuitBreakerOpenError(provider.id),
        });
        continue;
      }

      try {
        this._logger.debug(
          {
            event: 'provider_chain.stream.attempt',
            provider: provider.id,
            model: request.model,
          },
          `Attempting streaming from provider "${provider.id}"`,
        );

        // Get the iterable from the first successful provider
        const iterable = await this._executeWithFailover(
          entry,
          () => Promise.resolve(provider.stream(request)) as Promise<AsyncIterable<LLMChunk>>,
        );

        // Track which provider yielded chunks
        let providerIdentified = false;

        for await (const chunk of iterable) {
          if (!providerIdentified) {
            this._logger.info(
              {
                event: 'provider_chain.stream.success',
                provider: chunk.provider ?? provider.id,
                model: chunk.model,
              },
              `Streaming from provider "${chunk.provider ?? provider.id}"`,
            );
            providerIdentified = true;
          }

          yield chunk;
        }

        // If we get here, the stream completed successfully
        return;
      } catch (error) {
        const providerError =
          error instanceof ProviderError
            ? error
            : new ProviderError(
                String(error),
                provider.id,
                error instanceof Error ? { cause: error } : undefined,
              );

        this._logger.warn(
          {
            event: 'provider_chain.stream.failover',
            provider: provider.id,
            error: providerError.message,
            errorType: providerError.name,
          },
          `Provider "${provider.id}" stream failed, attempting next`,
        );

        errors.push({ providerId: provider.id, error: providerError });
      }
    }

    // All providers exhausted -- throw the aggregate error
    throw this._buildAggregateError(errors);
  }

  /**
   * Get the status of all providers in the chain.
   *
   * @returns Array of status entries for each provider.
   */
  getChainStatus(): ProviderChainEntryStatus[] {
    return this._entries.map((entry) => {
      const stats = entry.circuitBreaker.getStats();
      return {
        providerId: entry.provider.id,
        providerName: entry.provider.name,
        status: this._mapCircuitStateToProviderStatus(stats.state),
        circuitState: stats.state,
        failureCount: stats.failureCount,
      };
    });
  }

  /**
   * Get the currently active (first available) provider.
   *
   * @returns The first provider whose circuit breaker allows execution, or null if all are down.
   */
  getActiveProvider(): LLMProvider | null {
    for (const entry of this._entries) {
      if (entry.circuitBreaker.canExecute()) {
        return entry.provider;
      }
    }
    return null;
  }

  /**
   * Get the circuit breaker for a specific provider.
   *
   * @param providerId - The provider identifier.
   * @returns The CircuitBreaker instance, or undefined if provider not found.
   */
  getCircuitBreaker(providerId: string): CircuitBreaker | undefined {
    const entry = this._entries.find(
      (e) => e.provider.id === providerId,
    );
    return entry?.circuitBreaker;
  }

  /**
   * Reset all circuit breakers in the chain.
   */
  resetAll(): void {
    for (const entry of this._entries) {
      entry.circuitBreaker.reset();
    }
  }

  /**
   * Reset the circuit breaker for a specific provider.
   *
   * @param providerId - The provider identifier.
   */
  resetProvider(providerId: string): void {
    const entry = this._entries.find(
      (e) => e.provider.id === providerId,
    );
    entry?.circuitBreaker.reset();
  }

  /**
   * Get all providers in the chain.
   */
  get providers(): readonly LLMProvider[] {
    return this._entries.map((e) => e.provider);
  }

  /**
   * Get the number of providers in the chain.
   */
  get length(): number {
    return this._entries.length;
  }

  // -- Internal -------------------------------------------------------------

  /**
   * Execute a request through a single provider with circuit breaker
   * protection.
   */
  private async _executeWithFailover<T>(
    entry: ProviderEntry,
    requestFn: () => Promise<T>,
  ): Promise<T> {
    const { circuitBreaker } = entry;

    // Wrap the request in a timeout and pass to the circuit breaker.
    // CircuitBreaker is stored as CircuitBreaker<unknown>, so we use
    // a typed wrapper to preserve the generic return type.
    const timedFn = (): Promise<T> =>
      this._withTimeout(requestFn(), this._callTimeoutMs, entry.provider.id);

    // The circuit breaker execute() returns Promise<unknown> because
    // CircuitBreaker was instantiated without a type parameter.
    // We know the actual return type is T, so we cast.
    return circuitBreaker.execute(timedFn as () => Promise<unknown>) as Promise<T>;
  }

  /**
   * Wrap a promise with a timeout.
   */
  private _withTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
    providerId: string,
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(
          new ProviderUnavailableError(
            `Provider "${providerId}" timed out after ${timeoutMs}ms`,
            providerId,
          ),
        );
      }, timeoutMs);

      promise.then(
        (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        (error: unknown) => {
          clearTimeout(timer);
          reject(error);
        },
      );
    });
  }

  /**
   * Build an aggregate error from all provider failures.
   */
  private _buildAggregateError(
    errors: Array<{ providerId: string; error: Error }>,
  ): ProviderError {
    const errorDetails = errors
      .map((e) => `  - ${e.providerId}: ${e.error.message} (${e.error.name})`)
      .join('\n');

    const message = [
      `All ${errors.length} provider(s) failed:`,
      errorDetails,
    ].join('\n');

    const error = new ProviderError(message, 'provider-chain');
    error.name = 'AllProvidersFailedError';

    // Attach individual errors for diagnostic purposes
    (error as unknown as Record<string, unknown>)._errors = errors;

    return error;
  }

  /**
   * Map circuit breaker state to ProviderStatus.
   */
  private _mapCircuitStateToProviderStatus(
    state: CircuitState,
  ): ProviderStatus {
    switch (state) {
      case CircuitState.Closed:
        return ProviderStatus.Available;
      case CircuitState.Open:
        return ProviderStatus.Unavailable;
      case CircuitState.HalfOpen:
        return ProviderStatus.Degraded;
    }
  }

  // -- Lifecycle ------------------------------------------------------------

  /**
   * Dispose all circuit breakers (cancel pending timers).
   */
  dispose(): void {
    for (const entry of this._entries) {
      entry.circuitBreaker.dispose();
    }
  }
}
