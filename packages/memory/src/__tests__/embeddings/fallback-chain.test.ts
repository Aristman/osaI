/**
 * Unit tests for EmbeddingFallbackChain (TC-005 .. TC-007).
 *
 * Uses mock EmbeddingProvider implementations.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EmbeddingFallbackChain } from '../../embeddings/fallback-chain.js';
import type { EmbeddingProvider, EmbeddingResult } from '../../embeddings/embedding-provider.js';

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

function makeProvider(
  name: string,
  available: boolean,
  embedFn?: (text: string) => EmbeddingResult,
): EmbeddingProvider {
  const singleResult: EmbeddingResult = {
    vector: new Array(768).fill(0.01),
    dimensions: 768,
    provider: 'ollama',
    durationMs: 10,
  };

  return {
    name,
    isAvailable: vi.fn().mockResolvedValue(available),
    getDimensions: vi.fn().mockReturnValue(768),
    embed: vi.fn().mockImplementation(async (textOrTexts: string | string[]) => {
      if (Array.isArray(textOrTexts)) {
        return textOrTexts.map(() => embedFn ? embedFn('batch') : singleResult);
      }
      if (embedFn) return embedFn(textOrTexts);
      return singleResult;
    }),
  };
}

// ---------------------------------------------------------------------------
// TC-005: chain calls primary provider when available
// TC-006: chain falls back to secondary when primary is unavailable
// TC-007: chain throws Error when all providers are unavailable
// ---------------------------------------------------------------------------

describe('EmbeddingFallbackChain', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // -----------------------------------------------------------------------
  // TC-005
  // -----------------------------------------------------------------------
  it('TC-005: chain calls primary provider when available', async () => {
    const primary = makeProvider('primary', true);
    const secondary = makeProvider('secondary', true);

    const chain = new EmbeddingFallbackChain([primary, secondary]);
    const result = await chain.embed('hello');

    expect(result.vector).toHaveLength(768);
    expect(result.dimensions).toBe(768);

    // Primary was called
    expect(primary.embed).toHaveBeenCalledOnce();
    // Secondary was NOT called
    expect(secondary.embed).not.toHaveBeenCalled();
  });

  // -----------------------------------------------------------------------
  // TC-006
  // -----------------------------------------------------------------------
  it('TC-006: chain falls back to secondary when primary is unavailable', async () => {
    const primary = makeProvider('primary', false);
    const secondary = makeProvider('secondary', true);

    const chain = new EmbeddingFallbackChain([primary, secondary]);
    const result = await chain.embed('hello');

    expect(result.vector).toHaveLength(768);

    // Primary was NOT called for embed (was checked via isAvailable)
    expect(primary.embed).not.toHaveBeenCalled();
    // Secondary was called
    expect(secondary.embed).toHaveBeenCalledOnce();
  });

  // -----------------------------------------------------------------------
  // TC-007
  // -----------------------------------------------------------------------
  it('TC-007: chain throws Error when all providers are unavailable', async () => {
    const primary = makeProvider('primary', false);
    const secondary = makeProvider('secondary', false);

    const chain = new EmbeddingFallbackChain([primary, secondary]);

    await expect(chain.embed('hello')).rejects.toThrow();
    await expect(chain.embed('hello')).rejects.toThrow(
      /no.*available|all.*unavailable/i,
    );
  });

  // -----------------------------------------------------------------------
  // Additional coverage: isAvailable
  // -----------------------------------------------------------------------
  it('isAvailable returns true when at least one provider is available', async () => {
    const primary = makeProvider('primary', false);
    const secondary = makeProvider('secondary', true);

    const chain = new EmbeddingFallbackChain([primary, secondary]);
    expect(await chain.isAvailable()).toBe(true);
  });

  it('isAvailable returns false when no providers are available', async () => {
    const primary = makeProvider('primary', false);
    const secondary = makeProvider('secondary', false);

    const chain = new EmbeddingFallbackChain([primary, secondary]);
    expect(await chain.isAvailable()).toBe(false);
  });

  // -----------------------------------------------------------------------
  // Additional coverage: getDimensions returns first available provider dimensions
  // -----------------------------------------------------------------------
  it('getDimensions returns dimensions from first available provider', () => {
    const primary = makeProvider('primary', true);
    const secondary = makeProvider('secondary', true);

    const chain = new EmbeddingFallbackChain([primary, secondary]);
    expect(chain.getDimensions()).toBe(768);
  });

  // -----------------------------------------------------------------------
  // Additional coverage: batch embed(texts: string[])
  // -----------------------------------------------------------------------
  it('embed(texts) delegates to active provider', async () => {
    const primary = makeProvider('primary', true);
    const secondary = makeProvider('secondary', true);

    const chain = new EmbeddingFallbackChain([primary, secondary]);
    const results = await chain.embed(['hello', 'world']);

    expect(results).toHaveLength(2);
    // FallbackChain delegates batch as a single call to the active provider
    expect(primary.embed).toHaveBeenCalledOnce();
    expect(primary.embed).toHaveBeenCalledWith(['hello', 'world']);
    expect(secondary.embed).not.toHaveBeenCalled();
  });

  // -----------------------------------------------------------------------
  // Additional coverage: fallback on embed failure (provider throws)
  // -----------------------------------------------------------------------
  it('falls back to next provider when active provider embed throws', async () => {
    const primary = makeProvider('primary', true);
    const primaryEmbed = vi.fn().mockRejectedValue(new Error('timeout'));
    primary.embed = primaryEmbed;

    const secondary = makeProvider('secondary', true);

    const chain = new EmbeddingFallbackChain([primary, secondary]);
    const result = await chain.embed('hello');

    expect(result.vector).toHaveLength(768);
    expect(secondary.embed).toHaveBeenCalledOnce();
  });
});
