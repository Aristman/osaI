/**
 * Simple markdown-like renderer for assistant messages.
 *
 * Supports: bold (**text**), italic (*text*), inline code (`code`),
 * code blocks (```lang\n...\n```), unordered lists, ordered lists,
 * links ([text](url)), and line breaks.
 *
 * Returns HTML string. All user input is escaped before markdown parsing
 * to prevent XSS. The output is safe for use with {@html} directives.
 */

/**
 * Escape HTML special characters to prevent XSS.
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Render markdown-like text to safe HTML.
 * Input is first HTML-escaped, then markdown patterns are applied.
 */
export function renderMarkdown(input: string): string {
  const escaped = escapeHtml(input);

  // Code blocks: ```lang\ncode\n```
  let result = escaped.replace(/```(\w*)\n([\s\S]*?)```/g, (_match, lang, code) => {
    const language = lang ? ` data-language="${lang}"` : '';
    const trimmedCode = code.trimEnd();
    return `<pre class="markdown-code-block"${language}><code>${trimmedCode}</code></pre>`;
  });

  // Inline code: `text`
  result = result.replace(/`([^`\n]+)`/g, '<code class="markdown-inline-code">$1</code>');

  // Bold: **text**
  result = result.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

  // Italic: *text*
  result = result.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '<em>$1</em>');

  // Links: [text](url)
  result = result.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" class="markdown-link">$1</a>');

  // Unordered lists: - item or * item (but not **bold** or *italic*)
  result = result.replace(/^(\s*)[-*] (.+)$/gm, '$1<li class="markdown-list-item">$2</li>');
  result = result.replace(/((?:<li class="markdown-list-item">.*<\/li>\n?)+)/g, '<ul class="markdown-list">$1</ul>');

  // Ordered lists: 1. item
  result = result.replace(/^\d+\. (.+)$/gm, '<li class="markdown-list-item">$1</li>');

  // Line breaks (double newline becomes paragraph break, single newline becomes <br>)
  result = result.replace(/\n{2,}/g, '</p><p class="markdown-paragraph">');
  result = result.replace(/\n/g, '<br>');

  // Wrap in paragraph
  result = `<p class="markdown-paragraph">${result}</p>`;

  return result;
}
