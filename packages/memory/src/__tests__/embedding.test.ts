/**
 * @osai/memory -- StubEmbeddingProvider tests
 */

import { describe, it, expect } from 'vitest';
import { StubEmbeddingProvider } from '../embedding/EmbeddingProvider.js';

describe('StubEmbeddingProvider', () => {
  // -----------------------------------------------------------------------
  // Construction
  // -----------------------------------------------------------------------
  describe('constructor', () => {
    it('should default to 128 dimensions', () => {
      const provider = new StubEmbeddingProvider();
      expect(provider.getDimension()).toBe(128);
    });

    it('should accept a custom dimension', () => {
      const provider = new StubEmbeddingProvider(256);
      expect(provider.getDimension()).toBe(256);
    });
  });

  // -----------------------------------------------------------------------
  // embed
  // -----------------------------------------------------------------------
  describe('embed', () => {
    it('should return a vector of the configured dimension', async () => {
      const provider = new StubEmbeddingProvider(64);
      const result = await provider.embed('hello world');
      expect(result).toHaveLength(64);
    });

    it('should return deterministic vectors for the same input', async () => {
      const provider = new StubEmbeddingProvider(32);
      const v1 = await provider.embed('test');
      const v2 = await provider.embed('test');
      expect(v1).toEqual(v2);
    });

    it('should return different vectors for different inputs', async () => {
      const provider = new StubEmbeddingProvider(32);
      const v1 = await provider.embed('hello');
      const v2 = await provider.embed('goodbye');
      expect(v1).not.toEqual(v2);
    });

    it('should produce values in [0, 1) range', async () => {
      const provider = new StubEmbeddingProvider(100);
      const vec = await provider.embed('range check');
      for (const val of vec) {
        expect(val).toBeGreaterThanOrEqual(0);
        expect(val).toBeLessThan(1);
      }
    });
  });

  // -----------------------------------------------------------------------
  // embedBatch
  // -----------------------------------------------------------------------
  describe('embedBatch', () => {
    it('should return a vector for each input text', async () => {
      const provider = new StubEmbeddingProvider(16);
      const results = await provider.embedBatch(['a', 'b', 'c']);
      expect(results).toHaveLength(3);
      for (const vec of results) {
        expect(vec).toHaveLength(16);
      }
    });

    it('should return an empty array for empty input', async () => {
      const provider = new StubEmbeddingProvider(16);
      const results = await provider.embedBatch([]);
      expect(results).toEqual([]);
    });

    it('should return consistent vectors with embed for the same text', async () => {
      const provider = new StubEmbeddingProvider(32);
      const single = await provider.embed('batch test');
      const batch = await provider.embedBatch(['batch test']);
      expect(batch[0]).toEqual(single);
    });

    it('should handle a single-element batch', async () => {
      const provider = new StubEmbeddingProvider(64);
      const results = await provider.embedBatch(['only one']);
      expect(results).toHaveLength(1);
      expect(results[0]).toHaveLength(64);
    });
  });

  // -----------------------------------------------------------------------
  // getDimension
  // -----------------------------------------------------------------------
  describe('getDimension', () => {
    it('should return the configured dimension', () => {
      const provider = new StubEmbeddingProvider(512);
      expect(provider.getDimension()).toBe(512);
    });
  });
});
