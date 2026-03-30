/**
 * @osai/providers -- Abstract Base LLM Provider (DOMAIN-008)
 *
 * Provides shared functionality for all LLM provider implementations.
 * Concrete providers extend BaseLLMProvider and implement the abstract methods.
 */

import type {
  LLMProvider,
  LLMRequest,
  LLMResponse,
  LLMChunk,
  ChatMessage,
  TokenUsage,
  ProviderConfig,
} from './types.js';
import { ProviderStatus } from './types.js';

// ---------------------------------------------------------------------------
// Base Provider
// ---------------------------------------------------------------------------

/**
 * Abstract base class for LLM providers.
 *
 * Implements common token counting and status management.
 * Subclasses must implement `isAvailable`, `complete`, and `stream`.
 */
export abstract class BaseLLMProvider implements LLMProvider {
  public readonly id: string;
  public readonly name: string;

  protected readonly config: ProviderConfig;
  protected _status: ProviderStatus = ProviderStatus.Unknown;

  constructor(config: ProviderConfig) {
    this.id = config.id;
    this.name = config.name;
    this.config = config;
  }

  // -- LLMProvider interface ------------------------------------------------

  abstract isAvailable(): Promise<boolean>;
  abstract complete(request: LLMRequest): Promise<LLMResponse>;
  abstract stream(request: LLMRequest): AsyncIterable<LLMChunk>;

  /**
   * Estimate token count using the character-based heuristic.
   * Rule of thumb: ~4 characters per token for English text.
   *
   * Subclasses may override this with provider-specific counting.
   */
  countTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  getStatus(): ProviderStatus {
    return this._status;
  }

  // -- Helpers --------------------------------------------------------------

  /**
   * Compute token usage for a set of messages.
   *
   * Uses the character-based heuristic for both prompt and completion estimation.
   */
  protected estimateUsage(
    messages: readonly ChatMessage[],
    completionText: string,
  ): TokenUsage {
    const promptText = messages
      .map((m) => m.content)
      .join('');

    const promptTokens = this.countTokens(promptText);
    const completionTokens = this.countTokens(completionText);

    return {
      promptTokens,
      completionTokens,
      totalTokens: promptTokens + completionTokens,
    };
  }

  /**
   * Build a TokenUsage object from known values.
   */
  protected buildUsage(partial: {
    promptTokens: number;
    completionTokens: number;
  }): TokenUsage {
    return {
      promptTokens: partial.promptTokens,
      completionTokens: partial.completionTokens,
      totalTokens: partial.promptTokens + partial.completionTokens,
    };
  }

  /**
   * Create a standard LLMResponse.
   */
  protected buildResponse(
    request: LLMRequest,
    content: string,
    usage: TokenUsage,
    extra?: {
      toolCalls?: LLMResponse['toolCalls'];
      finishReason?: LLMResponse['finishReason'];
      metadata?: LLMResponse['metadata'];
    },
  ): LLMResponse {
    return {
      content,
      usage,
      model: request.model,
      provider: this.id,
      toolCalls: extra?.toolCalls,
      finishReason: extra?.finishReason,
      metadata: extra?.metadata,
    };
  }

  /**
   * Create a standard LLMChunk.
   */
  protected buildChunk(
    request: LLMRequest,
    content: string,
    extra?: {
      toolCalls?: LLMChunk['toolCalls'];
      usage?: LLMChunk['usage'];
      finishReason?: LLMChunk['finishReason'];
    },
  ): LLMChunk {
    return {
      content,
      model: request.model,
      provider: this.id,
      toolCalls: extra?.toolCalls,
      usage: extra?.usage,
      finishReason: extra?.finishReason,
    };
  }

  // -- Status management ----------------------------------------------------

  protected setStatus(status: ProviderStatus): void {
    this._status = status;
  }
}
