/**
 * @osai/memory -- StubEmbeddingProvider
 *
 * Stub implementation that returns deterministic dummy embeddings.
 * Used for testing and development; real providers will replace this in production.
 */

import type { EmbeddingProvider } from '../types.js';

/**
 * Generates a deterministic pseudo-random vector from a string input.
 * Uses a simple hash-based approach for reproducibility.
 */
function hashToVector(text: string, dimension: number): number[] {
  const vec: number[] = new Array(dimension);
  for (let i = 0; i < dimension; i++) {
    // Simple djb2-like hash per dimension
    let hash = 5381;
    for (let j = 0; j < text.length; j++) {
      hash = (hash * 33) ^ text.charCodeAt(j);
      hash = hash ^ (i * 7);
    }
    // Normalize to [0, 1) range
    vec[i] = (Math.abs(hash) % 10000) / 10000;
  }
  return vec;
}

export class StubEmbeddingProvider implements EmbeddingProvider {
  private readonly dimension: number;

  constructor(dimension?: number) {
    this.dimension = dimension ?? 128;
  }

  async embed(text: string): Promise<number[]> {
    return hashToVector(text, this.dimension);
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    return texts.map((text) => hashToVector(text, this.dimension));
  }

  getDimension(): number {
    return this.dimension;
  }
}
