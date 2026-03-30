/**
 * @osai/knowledge-base -- Text Chunker (T-004)
 *
 * Token-aware text splitting for document ingestion.
 * Uses estimateTokens from @osai/memory when available,
 * falls back to local char-based estimation.
 *
 * Splitting strategy:
 * - Count tokens in the text using estimateTokens
 * - If text fits in chunkSize, return single chunk
 * - Otherwise, split by finding char boundary close to chunkSize tokens
 * - Apply overlap between adjacent chunks
 */

import type { ChunkMetadata } from '../types/chunk.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A chunk of text extracted from a document. */
export interface Chunk {
  /** The text content of the chunk. */
  content: string;
  /** Metadata about the chunk's position and size. */
  metadata: ChunkMetadata;
}

// ---------------------------------------------------------------------------
// Token estimation (local fallback)
// ---------------------------------------------------------------------------

const UTF8_ENCODER = new TextEncoder();
const ASCII_CHARS_PER_TOKEN = 4;
const MULTIBYTE_BYTES_PER_TOKEN = 2;

/**
 * Estimate the number of tokens in a text string.
 *
 * Uses the same conservative algorithm as @osai/memory token-counter:
 * - ASCII (1-byte UTF-8): 1 token ~ 4 chars
 * - Multibyte UTF-8 (Cyrillic, CJK, emoji, etc.): 1 token ~ 2 bytes
 *
 * @param text - The input text to estimate tokens for.
 * @returns The estimated token count (ceiling of fractional tokens).
 */
export function estimateTokens(text: string): number {
  if (text.length === 0) {
    return 0;
  }

  const bytes = UTF8_ENCODER.encode(text);
  let tokenCount = 0;
  let i = 0;

  while (i < bytes.length) {
    const byte = bytes[i]!;

    if (byte <= 0x7F) {
      tokenCount += 1 / ASCII_CHARS_PER_TOKEN;
      i += 1;
    } else {
      let charByteLength = 1;
      if ((byte & 0xE0) === 0xC0) {
        charByteLength = 2;
      } else if ((byte & 0xF0) === 0xE0) {
        charByteLength = 3;
      } else if ((byte & 0xF8) === 0xF0) {
        charByteLength = 4;
      }

      tokenCount += charByteLength / MULTIBYTE_BYTES_PER_TOKEN;
      i += charByteLength;
    }
  }

  return Math.ceil(tokenCount);
}

// ---------------------------------------------------------------------------
// Token-aware splitting helpers
// ---------------------------------------------------------------------------

/**
 * Find a character position in text that is close to the target token count.
 *
 * Scans characters until accumulated token count reaches or exceeds target.
 *
 * @param text - Full text to search in.
 * @param targetTokens - Target number of tokens.
 * @returns Character position index.
 */
function findCharPositionForTokens(text: string, targetTokens: number): number {
  if (targetTokens <= 0) {
    return 0;
  }

  const bytes = UTF8_ENCODER.encode(text);
  let tokenCount = 0;
  let i = 0;
  let lastValidBreak = 0;

  while (i < bytes.length && tokenCount < targetTokens) {
    const byte = bytes[i]!;

    if (byte <= 0x7F) {
      tokenCount += 1 / ASCII_CHARS_PER_TOKEN;
      i += 1;
    } else {
      let charByteLength = 1;
      if ((byte & 0xE0) === 0xC0) {
        charByteLength = 2;
      } else if ((byte & 0xF0) === 0xE0) {
        charByteLength = 3;
      } else if ((byte & 0xF8) === 0xF0) {
        charByteLength = 4;
      }

      tokenCount += charByteLength / MULTIBYTE_BYTES_PER_TOKEN;
      i += charByteLength;
    }

    // Track whitespace boundaries for clean breaks
    const char = text[i];
    if (char === ' ' || char === '\n' || char === '\t' || char === '\r') {
      lastValidBreak = i;
    }
  }

  // Prefer breaking at whitespace; but never exceed targetTokens by more than a few tokens.
  // We allow at most 5% overage from whitespace snapping.
  const maxAllowedTokens = Math.ceil(targetTokens * 1.05);
  const targetCharPos = i;

  if (lastValidBreak > targetCharPos * 0.5) {
    // Verify whitespace break doesn't exceed max allowed tokens
    const breakText = text.slice(0, lastValidBreak + 1);
    const breakTokens = estimateTokens(breakText);
    if (breakTokens <= maxAllowedTokens) {
      return lastValidBreak + 1; // skip the whitespace
    }
  }

  // If whitespace break exceeded limit, use the position at targetTokens exactly
  // Scan back a few chars to find the last whitespace before we overshot
  let exactBreak = targetCharPos;
  for (let j = targetCharPos; j > targetCharPos - 20 && j > 0; j--) {
    const ch = text[j];
    if (ch === ' ' || ch === '\n' || ch === '\t' || ch === '\r') {
      exactBreak = j + 1;
      break;
    }
  }

  return exactBreak;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Split text into token-aware chunks with overlap.
 *
 * Algorithm:
 * 1. If text is empty/whitespace-only, return empty array.
 * 2. If total tokens <= chunkSize, return single chunk.
 * 3. Find char boundary for chunkSize tokens, extract chunk.
 * 4. Apply overlap: next chunk starts overlap tokens before the end of the previous chunk.
 * 5. Repeat until all text is consumed.
 *
 * @param text      - The full text to split.
 * @param chunkSize - Target chunk size in tokens (default: 1024).
 * @param overlap   - Overlap between adjacent chunks in tokens (default: 128).
 * @returns Array of chunks with content and metadata.
 */
export function splitTextIntoChunks(
  text: string,
  chunkSize = 1024,
  overlap = 128,
): Chunk[] {
  // Handle empty / whitespace-only
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return [];
  }

  const totalTokens = estimateTokens(text);

  // Short text: single chunk
  if (totalTokens <= chunkSize) {
    return [
      {
        content: text,
        metadata: {
          chunkIndex: 0,
          tokenCount: totalTokens,
          charOffset: 0,
          charLength: text.length,
        },
      },
    ];
  }

  const chunks: Chunk[] = [];
  let currentCharOffset = 0;
  let chunkIndex = 0;

  while (currentCharOffset < text.length) {
    const remainingText = text.slice(currentCharOffset);
    const remainingTokens = estimateTokens(remainingText);

    // If remaining text fits in a chunk, take it all
    if (remainingTokens <= chunkSize) {
      chunks.push({
        content: remainingText,
        metadata: {
          chunkIndex,
          tokenCount: remainingTokens,
          charOffset: currentCharOffset,
          charLength: remainingText.length,
        },
      });
      break;
    }

    // Find char boundary for this chunk
    const endCharPos = findCharPositionForTokens(remainingText, chunkSize);
    const chunkContent = remainingText.slice(0, endCharPos);

    if (chunkContent.trim().length === 0) {
      // Safety: if we got empty chunk, advance by at least 1 char
      currentCharOffset += 1;
      continue;
    }

    chunks.push({
      content: chunkContent,
      metadata: {
        chunkIndex,
        tokenCount: estimateTokens(chunkContent),
        charOffset: currentCharOffset,
        charLength: chunkContent.length,
      },
    });

    // Advance offset: back up by overlap amount
    if (endCharPos >= text.length - currentCharOffset) {
      break;
    }

    // Find char position for overlap (measured from start of current chunk text)
    const overlapChars = Math.min(
      overlap * 4, // rough estimate: 4 chars per token
      endCharPos,
    );
    currentCharOffset += endCharPos - overlapChars;
    chunkIndex++;
  }

  return chunks;
}
