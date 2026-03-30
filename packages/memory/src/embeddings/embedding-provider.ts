/**
 * EmbeddingProvider interface and related error types.
 *
 * Defines the contract for all embedding providers
 * (Ollama, Yandex, ONNX) used in the RAG pipeline.
 */

import type { EmbeddingResult } from '../types/embeddings.js';

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

/**
 * Contract for an embedding generation provider.
 *
 * Implementations must be stateless between calls and handle their own
 * connection management / error recovery.
 */
export interface EmbeddingProvider {
  /** Human-readable provider name (e.g. 'Ollama', 'Yandex'). */
  readonly name: string;

  /**
   * Generate an embedding for a single text.
   *
   * @param text  Non-empty text to embed.
   * @returns EmbeddingResult with vector, dimensions, provider, and timing.
   * @throws {Error} When text is empty or the provider is unreachable.
   */
  embed(text: string): Promise<EmbeddingResult>;

  /**
   * Generate embeddings for multiple texts.
   *
   * Default implementation delegates to {@link embed} for each text.
   * Providers may override this for batch optimisation.
   *
   * @param texts  Array of non-empty strings to embed.
   * @returns Array of EmbeddingResult in the same order as input.
   * @throws {Error} When any text is empty or the provider is unreachable.
   */
  embed(texts: string[]): Promise<EmbeddingResult[]>;

  /**
   * Check whether the provider is currently reachable.
   *
   * This should be a lightweight health-check, not a full embedding call.
   */
  isAvailable(): Promise<boolean>;

  /**
   * Fixed dimensionality of vectors produced by this provider.
   */
  getDimensions(): number;
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/**
 * Thrown when no embedding provider in a chain is available.
 */
export class NoProviderAvailableError extends Error {
  public readonly providerNames: string[];

  constructor(providerNames: string[]) {
    super(
      `No embedding provider available. Checked: [${providerNames.join(', ')}]`,
    );
    this.name = 'NoProviderAvailableError';
    this.providerNames = providerNames;
  }
}

/**
 * Thrown when an embedding provider returns an unexpected response.
 */
export class EmbeddingProviderError extends Error {
  public readonly provider: string;
  public readonly cause?: Error;

  constructor(provider: string, message: string, cause?: Error) {
    super(`[${provider}] ${message}`);
    this.name = 'EmbeddingProviderError';
    this.provider = provider;
    this.cause = cause;
  }
}
