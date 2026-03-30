import { describe, it, expect } from 'vitest';
import { TxtParser } from '../../parsers/txt-parser.js';

describe('TxtParser', () => {
  const parser = new TxtParser();

  describe('TC-002-1: TxtParser extracts raw text', () => {
    it('should extract raw text from UTF-8 buffer', () => {
      const text = 'Hello, world! This is a plain text document.';
      const buffer = Buffer.from(text, 'utf-8');
      const result = parser.parse(buffer);

      expect(result.content).toBe(text);
    });
  });

  describe('TC-002-2: TxtParser handles empty input', () => {
    it('should return empty content for empty buffer', () => {
      const buffer = Buffer.alloc(0);
      const result = parser.parse(buffer);

      expect(result.content).toBe('');
      expect(result.sections).toBeUndefined();
    });
  });

  describe('TxtParser handles unicode', () => {
    it('should correctly parse unicode text', () => {
      const text = 'Привет, мир! \u4f60\u597d\u4e16\u754c! \uc548\ub155\ud558\uc138\uc694!';
      const buffer = Buffer.from(text, 'utf-8');
      const result = parser.parse(buffer);

      expect(result.content).toBe(text);
    });
  });

  describe('TxtParser supports format', () => {
    it('should support txt format', () => {
      expect(parser.supports('txt')).toBe(true);
    });

    it('should not support other formats', () => {
      expect(parser.supports('md')).toBe(false);
      expect(parser.supports('pdf')).toBe(false);
    });
  });

  describe('TxtParser multiline text', () => {
    it('should preserve line breaks', () => {
      const text = 'Line 1\nLine 2\nLine 3';
      const buffer = Buffer.from(text, 'utf-8');
      const result = parser.parse(buffer);

      expect(result.content).toBe(text);
    });
  });
});
