import { describe, it, expect } from 'vitest';
import { MdParser } from '../../parsers/md-parser.js';

describe('MdParser', () => {
  const parser = new MdParser();

  describe('TC-002-3: MdParser preserves header hierarchy', () => {
    it('should extract h1, h2, h3 headers as sections', () => {
      const markdown = `# Chapter 1

Some content here.

## Section 1.1

More content.

### Subsection 1.1.1

Deep content.

## Section 1.2

Final content.`;

      const buffer = Buffer.from(markdown, 'utf-8');
      const result = parser.parse(buffer);

      expect(result.sections).toBeDefined();
      expect(result.sections!.length).toBe(4);

      expect(result.sections![0]).toEqual({
        level: 1,
        title: 'Chapter 1',
        content: expect.stringContaining('Some content here.'),
      });

      expect(result.sections![1]).toEqual({
        level: 2,
        title: 'Section 1.1',
        content: expect.stringContaining('More content.'),
      });

      expect(result.sections![2]).toEqual({
        level: 3,
        title: 'Subsection 1.1.1',
        content: expect.stringContaining('Deep content.'),
      });

      expect(result.sections![3]).toEqual({
        level: 2,
        title: 'Section 1.2',
        content: expect.stringContaining('Final content.'),
      });
    });
  });

  describe('TC-002-4: MdParser extracts code blocks', () => {
    it('should preserve code blocks in content', () => {
      const markdown = `# Example

Here is a code example:

\`\`\`typescript
const x: number = 42;
console.log(x);
\`\`\`

And some more text.

\`\`\`python
def hello():
    print("world")
\`\`\``;

      const buffer = Buffer.from(markdown, 'utf-8');
      const result = parser.parse(buffer);

      expect(result.content).toContain('const x: number = 42;');
      expect(result.content).toContain('console.log(x);');
      expect(result.content).toContain('def hello():');
      expect(result.content).toContain('print("world")');
    });
  });

  describe('MdParser handles empty input', () => {
    it('should handle empty markdown', () => {
      const buffer = Buffer.alloc(0);
      const result = parser.parse(buffer);

      expect(result.content).toBe('');
    });
  });

  describe('MdParser extracts title', () => {
    it('should use first h1 as title', () => {
      const markdown = `# Document Title

Some body text.`;

      const buffer = Buffer.from(markdown, 'utf-8');
      const result = parser.parse(buffer);

      expect(result.title).toBe('Document Title');
    });
  });

  describe('MdParser supports format', () => {
    it('should support md format', () => {
      expect(parser.supports('md')).toBe(true);
    });

    it('should not support other formats', () => {
      expect(parser.supports('txt')).toBe(false);
      expect(parser.supports('pdf')).toBe(false);
    });
  });

  describe('MdParser handles bold/italic/links', () => {
    it('should preserve inline formatting in content', () => {
      const markdown = `# Title

This is **bold** and *italic* text.
[Link](https://example.com) is here.`;

      const buffer = Buffer.from(markdown, 'utf-8');
      const result = parser.parse(buffer);

      expect(result.content).toContain('**bold**');
      expect(result.content).toContain('*italic*');
      expect(result.content).toContain('[Link](https://example.com)');
    });
  });

  describe('MdParser handles no headers', () => {
    it('should work with markdown that has no headers', () => {
      const markdown = 'Just some plain text\nwith no headers at all.';

      const buffer = Buffer.from(markdown, 'utf-8');
      const result = parser.parse(buffer);

      expect(result.content).toContain('Just some plain text');
      expect(result.sections).toBeUndefined();
      expect(result.title).toBeUndefined();
    });
  });
});
