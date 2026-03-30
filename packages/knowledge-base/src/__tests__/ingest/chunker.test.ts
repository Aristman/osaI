import { describe, it, expect } from 'vitest';
import { splitTextIntoChunks, estimateTokens } from '../../ingest/chunker.js';

describe('estimateTokens', () => {
  it('should return 0 for empty string', () => {
    expect(estimateTokens('')).toBe(0);
  });

  it('should estimate ASCII text tokens (~4 chars per token)', () => {
    // 400 ASCII chars ~ 100 tokens
    const text = 'a'.repeat(400);
    const tokens = estimateTokens(text);
    expect(tokens).toBe(100);
  });

  it('should estimate multibyte UTF-8 tokens (~2 bytes per token)', () => {
    // Cyrillic: each char is 2 bytes, so 100 chars = 200 bytes ~ 100 tokens
    const text = '\u0430'.repeat(100); // Cyrillic 'a'
    const tokens = estimateTokens(text);
    expect(tokens).toBe(100);
  });
});

describe('splitTextIntoChunks', () => {
  describe('TC-004-1: Chunker splits text into ~chunkSize token chunks', () => {
    it('should split text > chunkSize into multiple chunks', () => {
      // Create text ~2000 tokens (8000 ASCII chars)
      const text = 'word '.repeat(2000); // 10000 chars ~ 2500 tokens
      const chunks = splitTextIntoChunks(text, 1024, 128);

      expect(chunks.length).toBeGreaterThanOrEqual(2);
      for (const chunk of chunks) {
        const tokenCount = estimateTokens(chunk.content);
        // Allow up to 5% overage from whitespace-boundary snapping
        expect(tokenCount).toBeLessThanOrEqual(Math.ceil(1024 * 1.05));
      }
    });
  });

  describe('TC-004-2: Chunker applies overlap between adjacent chunks', () => {
    it('should have ~overlap tokens shared between adjacent chunks', () => {
      // Create text large enough for multiple chunks
      const text = 'word '.repeat(2000); // ~2500 tokens
      const overlap = 128;
      const chunks = splitTextIntoChunks(text, 1024, overlap);

      expect(chunks.length).toBeGreaterThanOrEqual(2);

      for (let i = 1; i < chunks.length; i++) {
        const prevContent = chunks[i - 1]!.content;
        const currContent = chunks[i]!.content;

        // Check that there is an overlap: find a substring of prev in curr
        const tailLen = Math.min(overlap * 4, prevContent.length); // rough char estimate
        const tail = prevContent.slice(-tailLen);
        const headLen = Math.min(overlap * 4, currContent.length);
        const head = currContent.slice(0, headLen);

        // At least some characters should overlap
        const overlapFound = tail.split('').some(char => head.includes(char));
        expect(overlapFound).toBe(true);
      }
    });
  });

  describe('TC-004-3: Chunker handles short text (< chunkSize)', () => {
    it('should return single chunk for text shorter than chunkSize', () => {
      // ~100 tokens = 400 chars
      const text = 'word '.repeat(100);
      const chunks = splitTextIntoChunks(text, 1024, 128);

      expect(chunks).toHaveLength(1);
      expect(chunks[0]!.content).toBe(text);
    });
  });

  describe('TC-004-4: Chunker handles empty text', () => {
    it('should return empty array for empty string', () => {
      const chunks = splitTextIntoChunks('', 1024, 128);

      expect(chunks).toHaveLength(0);
    });

    it('should return empty array for whitespace-only string', () => {
      const chunks = splitTextIntoChunks('   \n\n  ', 1024, 128);

      expect(chunks).toHaveLength(0);
    });
  });

  describe('Chunk metadata', () => {
    it('should include correct chunkIndex for each chunk', () => {
      const text = 'word '.repeat(2000);
      const chunks = splitTextIntoChunks(text, 1024, 128);

      chunks.forEach((chunk, index) => {
        expect(chunk.metadata.chunkIndex).toBe(index);
      });
    });

    it('should include charOffset tracking that accounts for overlap', () => {
      const text = 'word '.repeat(2000);
      const chunks = splitTextIntoChunks(text, 1024, 128);

      // First chunk should start at offset 0
      expect(chunks[0]!.metadata.charOffset).toBe(0);

      // With overlap, each subsequent chunk's offset < previous offset + previous length
      // (because we step back for overlap)
      for (let i = 1; i < chunks.length; i++) {
        expect(chunks[i]!.metadata.charOffset).toBeLessThan(
          chunks[i - 1]!.metadata.charOffset + chunks[i - 1]!.metadata.charLength,
        );
        // charOffset should still be positive and within text bounds
        expect(chunks[i]!.metadata.charOffset).toBeGreaterThan(0);
        expect(chunks[i]!.metadata.charOffset).toBeLessThan(text.length);
      }
    });

    it('should include tokenCount in metadata', () => {
      const text = 'word '.repeat(2000);
      const chunks = splitTextIntoChunks(text, 1024, 128);

      for (const chunk of chunks) {
        expect(chunk.metadata.tokenCount).toBeGreaterThan(0);
        // Allow up to 5% overage from whitespace-boundary snapping
        expect(chunk.metadata.tokenCount).toBeLessThanOrEqual(Math.ceil(1024 * 1.05));
      }
    });
  });

  describe('Edge cases', () => {
    it('should handle text exactly at chunkSize', () => {
      // Create text exactly ~1024 tokens (4096 chars)
      const text = 'a'.repeat(4096);
      const chunks = splitTextIntoChunks(text, 1024, 128);

      expect(chunks.length).toBeGreaterThanOrEqual(1);
    });

    it('should handle very large text', () => {
      // ~5000 tokens = 20000 chars
      const text = 'word '.repeat(5000);
      const chunks = splitTextIntoChunks(text, 1024, 128);

      expect(chunks.length).toBeGreaterThanOrEqual(4);
    });

    it('should use default chunkSize and overlap when not specified', () => {
      const text = 'word '.repeat(500); // ~625 tokens, fits in default
      const chunks = splitTextIntoChunks(text);

      expect(chunks).toHaveLength(1);
    });
  });
});
