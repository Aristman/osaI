/**
 * ModelResolver -- resolves the active model provider and manages
 * failover chains with circuit-breaker and exponential backoff.
 */

import type { ModelInfo, ModelProvider, ModelMessage, ModelOptions, ModelResponse } from '../types.js';
import { ClaudeProvider } from './providers/ClaudeProvider.js';
import { OpenAIProvider } from './providers/OpenAIProvider.js';
import { OllamaProvider } from './providers/OllamaProvider.js';
import { ModelError, AllProvidersExhaustedError } from './errors.js';
import type { ProviderAttempt } from './errors.js';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface ModelProviderConfig {
  provider: string;
  model: string;
  apiKey?: string;
  baseUrl?: string;
  maxRetries?: number;
  timeout?: number;
}

export interface ModelResolverOptions {
  /** Circuit-breaker threshold: provider becomes unavailable after this many consecutive failures. Default 3. */
  circuitBreakerThreshold?: number;
  /** Exponential backoff base delay in ms. Default 1000. */
  baseDelay?: number;
}

// ---------------------------------------------------------------------------
// Internal state for each provider slot
// ---------------------------------------------------------------------------

interface ProviderSlot {
  config: ModelProviderConfig;
  instance: ModelProvider;
  consecutiveFailures: number;
  unavailable: boolean;
  unavailableUntil: number; // timestamp ms
}

// ---------------------------------------------------------------------------
// ModelResolver
// ---------------------------------------------------------------------------

export class ModelResolver {
  private readonly slots: ProviderSlot[];
  private activeIndex: number;
  private readonly circuitBreakerThreshold: number;
  private readonly baseDelay: number;

  constructor(providers: ModelProviderConfig[], options?: ModelResolverOptions) {
    if (providers.length === 0) {
      throw new Error('ModelResolver requires at least one provider');
    }

    this.circuitBreakerThreshold = options?.circuitBreakerThreshold ?? 3;
    this.baseDelay = options?.baseDelay ?? 1000;
    this.activeIndex = 0;

    this.slots = providers.map((cfg) => ({
      config: cfg,
      instance: createProviderInstance(cfg),
      consecutiveFailures: 0,
      unavailable: false,
      unavailableUntil: 0,
    }));
  }

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  /** Returns the currently active provider. */
  resolve(): ModelProvider {
    const slot = this.slots[this.activeIndex]!;
    return slot.instance;
  }

  /** Switches to the next available provider in the chain. */
  failover(): ModelProvider {
    const attempts: ProviderAttempt[] = [];
    const currentSlot = this.slots[this.activeIndex]!;

    attempts.push({
      provider: currentSlot.config.provider,
      model: currentSlot.config.model,
      error: 'failover requested',
      retryable: true,
    });

    for (let i = 1; i < this.slots.length; i++) {
      const idx = (this.activeIndex + i) % this.slots.length;
      const slot = this.slots[idx]!;

      if (slot.unavailable && Date.now() < slot.unavailableUntil) {
        attempts.push({
          provider: slot.config.provider,
          model: slot.config.model,
          error: 'provider is unavailable (circuit breaker open)',
          retryable: true,
        });
        continue;
      }

      // Reset the unavailable state when we try a provider again
      if (slot.unavailable && Date.now() >= slot.unavailableUntil) {
        slot.unavailable = false;
        slot.unavailableUntil = 0;
        slot.consecutiveFailures = 0;
      }

      this.activeIndex = idx;
      return slot.instance;
    }

    throw new AllProvidersExhaustedError(attempts);
  }

  /** Returns ModelInfo for the currently active provider. */
  getActiveModel(): ModelInfo {
    const slot = this.slots[this.activeIndex]!;
    const instance = slot.instance;

    return {
      name: instance.name,
      provider: slot.config.provider,
      model: slot.config.model,
      active: !slot.unavailable,
    };
  }

  /** Resets the resolver to the primary (first) provider. */
  reset(): void {
    this.activeIndex = 0;
    for (const slot of this.slots) {
      slot.consecutiveFailures = 0;
      slot.unavailable = false;
      slot.unavailableUntil = 0;
    }
  }

  /** Records a successful call on the active provider, resetting its failure counter. */
  recordSuccess(): void {
    const slot = this.slots[this.activeIndex]!;
    slot.consecutiveFailures = 0;
  }

  /**
   * Records a failure on the active provider. Returns the delay before the
   * next retry is recommended (exponential backoff).
   */
  recordFailure(): number {
    const slot = this.slots[this.activeIndex]!;
    slot.consecutiveFailures += 1;

    if (slot.consecutiveFailures >= this.circuitBreakerThreshold) {
      slot.unavailable = true;
      slot.unavailableUntil = Date.now() + this.backoff(slot.consecutiveFailures);
    }

    return this.backoff(slot.consecutiveFailures);
  }

  /**
   * Computes the exponential backoff delay for a given attempt number.
   * Returns the delay in milliseconds.
   */
  backoff(attempt: number): number {
    return Math.min(this.baseDelay * Math.pow(2, attempt - 1), 60_000);
  }

  /**
   * Tries to complete a request, automatically failing over to the next
   * provider if the current one fails. Throws AllProvidersExhaustedError
   * if every provider has been tried.
   */
  async completeWithFailover(
    messages: ModelMessage[],
    options?: ModelOptions,
  ): Promise<ModelResponse> {
    const attempts: ProviderAttempt[] = [];
    let tried = 0;

    while (tried < this.slots.length) {
      const slot = this.slots[this.activeIndex]!;

      // Skip circuit-broken providers
      if (slot.unavailable && Date.now() < slot.unavailableUntil) {
        attempts.push({
          provider: slot.config.provider,
          model: slot.config.model,
          error: 'circuit breaker open',
          retryable: true,
        });
        tried++;
        if (tried < this.slots.length) {
          this.failover();
        }
        continue;
      }

      // Reset if cooldown expired
      if (slot.unavailable && Date.now() >= slot.unavailableUntil) {
        slot.unavailable = false;
        slot.unavailableUntil = 0;
        slot.consecutiveFailures = 0;
      }

      try {
        const result = await slot.instance.complete(messages, options);
        this.recordSuccess();
        return result;
      } catch (err) {
        const modelErr = err instanceof ModelError
          ? err
          : new ModelError(slot.config.provider, String(err), err instanceof Error ? (err as Error & { retryable?: boolean }).retryable ?? true : true);

        this.recordFailure();

        attempts.push({
          provider: slot.config.provider,
          model: slot.config.model,
          error: modelErr.message,
          retryable: modelErr.retryable,
        });

        tried++;

        if (tried < this.slots.length) {
          try {
            this.failover();
          } catch {
            throw new AllProvidersExhaustedError(attempts);
          }
        }
      }
    }

    throw new AllProvidersExhaustedError(attempts);
  }
}

// ---------------------------------------------------------------------------
// Provider factory
// ---------------------------------------------------------------------------

function createProviderInstance(cfg: ModelProviderConfig): ModelProvider {
  switch (cfg.provider) {
    case 'claude':
    case 'anthropic':
      return new ClaudeProvider({
        model: cfg.model,
        apiKey: cfg.apiKey,
        baseUrl: cfg.baseUrl,
        timeout: cfg.timeout,
      });

    case 'openai':
    case 'gpt':
      return new OpenAIProvider({
        model: cfg.model,
        apiKey: cfg.apiKey,
        baseUrl: cfg.baseUrl,
        timeout: cfg.timeout,
      });

    case 'ollama':
      return new OllamaProvider({
        model: cfg.model,
        baseUrl: cfg.baseUrl,
        timeout: cfg.timeout,
      });

    default:
      throw new Error(`Unknown provider: ${cfg.provider}`);
  }
}
