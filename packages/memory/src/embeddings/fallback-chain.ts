/**
 * EmbeddingFallbackChain -- tries providers in order, falling back on failure.
 *
 * The chain checks `isAvailable()` for each provider before attempting
 * `embed()`. If the active provider throws during embed, it falls back
 * to the next available provider.
 */

import type { EmbeddingResult } from '../types/embeddings.js';
import type { EmbeddingProvider } from './embedding-provider.js';
import { NoProviderAvailableError } from './embedding-provider.js';

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export class EmbeddingFallbackChain implements EmbeddingProvider {
  public readonly name: string;
  private readonly providers: readonly EmbeddingProvider[];

  constructor(providers: readonly EmbeddingProvider[]) {
    if (providers.length === 0) {
      throw new Error('EmbeddingFallbackChain requires at least one provider');
    }
    this.providers = providers;
    this.name = `FallbackChain(${providers.map((p) => p.name).join(', ')})`;
  }

  // -----------------------------------------------------------------------
  // EmbeddingProvider interface
  // -----------------------------------------------------------------------

  public async embed(text: string): Promise<EmbeddingResult>;
  public async embed(texts: string[]): Promise<EmbeddingResult[]>;
  public async embed(textOrTexts: string | string[]): Promise<EmbeddingResult | EmbeddingResult[]> {
    if (Array.isArray(textOrTexts)) {
      return this.embedBatch(textOrTexts);
    }
    return this.embedSingle(textOrTexts);
  }

  public async isAvailable(): Promise<boolean> {
    for (const provider of this.providers) {
      try {
        if (await provider.isAvailable()) {
          return true;
        }
      } catch {
        // Continue to next provider
      }
    }
    return false;
  }

  public getDimensions(): number {
    // Return dimensions from the first provider
    return this.providers[0]!.getDimensions();
  }

  // -----------------------------------------------------------------------
  // Internal
  // -----------------------------------------------------------------------

  private async embedSingle(text: string): Promise<EmbeddingResult> {
    const errors: string[] = [];

    for (const provider of this.providers) {
      // Check availability first
      let available = false;
      try {
        available = await provider.isAvailable();
      } catch {
        available = false;
      }

      if (!available) {
        errors.push(`${provider.name}: unavailable`);
        continue;
      }

      // Try to embed
      try {
        return await provider.embed(text);
      } catch (error) {
        errors.push(`${provider.name}: ${(error as Error).message}`);
      }
    }

    throw new NoProviderAvailableError(
      this.providers.map((p) => p.name),
    );
  }

  private async embedBatch(texts: string[]): Promise<EmbeddingResult[]> {
    // Find the first available provider, then delegate full batch to it.
    const errors: string[] = [];

    for (const provider of this.providers) {
      let available = false;
      try {
        available = await provider.isAvailable();
      } catch {
        available = false;
      }

      if (!available) {
        errors.push(`${provider.name}: unavailable`);
        continue;
      }

      try {
        return await provider.embed(texts);
      } catch (error) {
        errors.push(`${provider.name}: ${(error as Error).message}`);
      }
    }

    throw new NoProviderAvailableError(
      this.providers.map((p) => p.name),
    );
  }
}
