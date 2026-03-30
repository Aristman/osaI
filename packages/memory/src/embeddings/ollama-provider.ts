/**
 * OllamaEmbeddingProvider -- generates embeddings via local Ollama server.
 *
 * Uses native fetch (Node 22 built-in) to call the Ollama
 * `/api/embeddings` endpoint with `nomic-embed-text` model (768-dim).
 */

import type { EmbeddingResult, EmbeddingProviderType } from '../types/embeddings.js';
import { EMBEDDING_DEFAULTS } from '../types/embeddings.js';
import type { EmbeddingProvider } from './embedding-provider.js';
import { EmbeddingProviderError } from './embedding-provider.js';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface OllamaProviderOptions {
  /** Ollama server base URL. @default EMBEDDING_DEFAULTS.ollamaEndpoint */
  readonly endpoint?: string;
  /** Model name for embedding. @default EMBEDDING_DEFAULTS.ollamaModel */
  readonly model?: string;
  /** Expected vector dimensions. @default EMBEDDING_DEFAULTS.ollamaDimensions */
  readonly dimensions?: number;
  /** Request timeout in ms. @default EMBEDDING_DEFAULTS.timeoutMs */
  readonly timeoutMs?: number;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export class OllamaEmbeddingProvider implements EmbeddingProvider {
  public readonly name: string;
  private readonly endpoint: string;
  private readonly model: string;
  private readonly dimensions: number;
  private readonly timeoutMs: number;
  private readonly providerType: EmbeddingProviderType = 'ollama';

  constructor(options?: OllamaProviderOptions) {
    this.name = 'Ollama';
    this.endpoint = options?.endpoint ?? EMBEDDING_DEFAULTS.ollamaEndpoint;
    this.model = options?.model ?? EMBEDDING_DEFAULTS.ollamaModel;
    this.dimensions = options?.dimensions ?? EMBEDDING_DEFAULTS.ollamaDimensions;
    this.timeoutMs = options?.timeoutMs ?? EMBEDDING_DEFAULTS.timeoutMs;
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
    try {
      // Use a simple probe request to verify Ollama is running.
      // We send a minimal embed request.
      const response = await fetch(`${this.endpoint}/api/embeddings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.model,
          prompt: 'probe',
        }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      if (!response.ok) {
        return false;
      }
      const data = await response.json() as { embedding?: number[] };
      // Accept as available if we got a valid response (embedding field present)
      return Array.isArray(data.embedding);
    } catch {
      return false;
    }
  }

  public getDimensions(): number {
    return this.dimensions;
  }

  // -----------------------------------------------------------------------
  // Internal
  // -----------------------------------------------------------------------

  private async embedSingle(text: string): Promise<EmbeddingResult> {
    this.validateText(text);

    const start = performance.now();
    try {
      const response = await fetch(`${this.endpoint}/api/embeddings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.model,
          prompt: text,
        }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });

      if (!response.ok) {
        throw new EmbeddingProviderError(
          this.name,
          `HTTP ${response.status}: ${response.statusText}`,
        );
      }

      const data = await response.json() as { embedding?: number[] };

      if (!Array.isArray(data.embedding)) {
        throw new EmbeddingProviderError(
          this.name,
          'Response does not contain a valid embedding vector',
        );
      }

      const durationMs = performance.now() - start;

      return {
        vector: data.embedding,
        dimensions: this.dimensions,
        provider: this.providerType,
        durationMs,
      };
    } catch (error) {
      if (error instanceof EmbeddingProviderError) throw error;
      throw new EmbeddingProviderError(
        this.name,
        `Failed to generate embedding: ${(error as Error).message}`,
        error as Error,
      );
    }
  }

  private async embedBatch(texts: string[]): Promise<EmbeddingResult[]> {
    // Validate all texts first
    for (const text of texts) {
      this.validateText(text);
    }
    // Ollama /api/embeddings does not support true batch,
    // so we process sequentially.
    const results: EmbeddingResult[] = [];
    for (const text of texts) {
      results.push(await this.embedSingle(text));
    }
    return results;
  }

  private validateText(text: string): void {
    if (text.trim().length === 0) {
      throw new EmbeddingProviderError(
        this.name,
        'Text must not be empty',
      );
    }
  }
}
