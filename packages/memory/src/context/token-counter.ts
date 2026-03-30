/**
 * Token estimation for the Context Window Manager.
 *
 * Uses conservative estimation:
 * - ASCII (1-byte UTF-8): 1 token ~ 4 chars
 * - Multibyte UTF-8 (Cyrillic, CJK, emoji, etc.): 1 token ~ 2 bytes
 *
 * This ensures we never underestimate token counts, keeping the
 * context window within safe limits.
 */

const UTF8_ENCODER = new TextEncoder();

const ASCII_CHARS_PER_TOKEN = 4;
const MULTIBYTE_BYTES_PER_TOKEN = 2;

/**
 * Estimate the number of tokens in a text string.
 *
 * Algorithm:
 * 1. Encode the text to UTF-8 bytes using TextEncoder.
 * 2. Walk through the bytes, counting:
 *    - Single-byte (ASCII) characters contribute 1/4 token each
 *    - Multibyte characters contribute (byte_length / 2) tokens each
 *
 * This is deliberately conservative: the actual token count for most
 * models will be equal to or less than our estimate.
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
      // ASCII: single-byte character -> 1/4 token
      tokenCount += 1 / ASCII_CHARS_PER_TOKEN;
      i += 1;
    } else {
      // Multibyte UTF-8 character: determine byte length from leading byte
      let charByteLength = 1;
      if ((byte & 0xE0) === 0xC0) {
        charByteLength = 2; // 2-byte sequence (Latin Extended, Cyrillic, etc.)
      } else if ((byte & 0xF0) === 0xE0) {
        charByteLength = 3; // 3-byte sequence (CJK, etc.)
      } else if ((byte & 0xF8) === 0xF0) {
        charByteLength = 4; // 4-byte sequence (emoji, rare CJK, etc.)
      }

      // Multibyte chars: 1 token = 2 bytes
      tokenCount += charByteLength / MULTIBYTE_BYTES_PER_TOKEN;
      i += charByteLength;
    }
  }

  // Ceiling to never underestimate
  return Math.ceil(tokenCount);
}
