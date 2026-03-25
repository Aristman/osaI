/**
 * T003-UNIT-002: Text block renders as markdown
 * Tests for the render-markdown utility.
 */
import { describe, it, expect } from 'vitest';
import { renderMarkdown } from '../components/render-markdown';

describe('renderMarkdown', () => {
  it('T003-UNIT-002: renders bold text with ** syntax', () => {
    const result = renderMarkdown('Hello **world** test');
    expect(result).toContain('<strong>world</strong>');
  });

  it('T003-UNIT-002: renders italic text with * syntax', () => {
    const result = renderMarkdown('Hello *world* test');
    expect(result).toContain('<em>world</em>');
  });

  it('T003-UNIT-002: renders inline code', () => {
    const result = renderMarkdown('Use `console.log()` here');
    expect(result).toContain('<code class="markdown-inline-code">console.log()</code>');
  });

  it('T003-UNIT-002: renders code blocks with language', () => {
    const result = renderMarkdown('```ts\nconst x = 1;\n```');
    expect(result).toContain('<pre class="markdown-code-block" data-language="ts">');
    expect(result).toContain('const x = 1;');
  });

  it('T003-UNIT-002: renders code blocks without language', () => {
    const result = renderMarkdown('```\nsome code\n```');
    expect(result).toContain('<pre class="markdown-code-block">');
    expect(result).toContain('some code');
  });

  it('T003-UNIT-002: renders links', () => {
    const result = renderMarkdown('[OpenAI](https://openai.com)');
    expect(result).toContain('<a href="https://openai.com"');
    expect(result).toContain('OpenAI');
  });

  it('T003-UNIT-002: renders unordered lists', () => {
    const result = renderMarkdown('- item 1\n- item 2\n- item 3');
    expect(result).toContain('<li class="markdown-list-item">item 1</li>');
    expect(result).toContain('<li class="markdown-list-item">item 2</li>');
    expect(result).toContain('<ul class="markdown-list">');
  });

  it('escapes HTML to prevent XSS', () => {
    const result = renderMarkdown('<script>alert("xss")</script>');
    expect(result).not.toContain('<script>');
    expect(result).toContain('&lt;script&gt;');
  });

  it('wraps output in paragraph', () => {
    const result = renderMarkdown('Hello world');
    expect(result).toContain('<p class="markdown-paragraph">');
  });

  it('converts double newlines to paragraph breaks', () => {
    const result = renderMarkdown('First paragraph\n\nSecond paragraph');
    expect(result).toContain('</p><p class="markdown-paragraph">');
  });

  it('preserves plain text', () => {
    const result = renderMarkdown('Hello world');
    expect(result).toContain('Hello world');
  });
});
