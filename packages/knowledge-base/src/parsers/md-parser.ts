/**
 * Markdown parser for .md files.
 *
 * Extracts full text content and preserves header hierarchy as sections.
 */
import type { DocumentFormat } from '../types/document.js';
import type { DocumentParser, ParsedDocument, ParsedSection } from './document-parser.js';

/**
 * Markdown parser implementation.
 *
 * Splits document into sections based on header hierarchy.
 * First H1 is used as document title if present.
 */
export class MdParser implements DocumentParser {
  parse(buffer: Buffer): ParsedDocument {
    const raw = buffer.toString('utf-8');

    if (raw.trim().length === 0) {
      return { content: '' };
    }

    const sections = this.extractSections(raw);
    const title = this.extractTitle(raw);

    return {
      content: raw,
      title: title ?? undefined,
      sections: sections.length > 0 ? sections : undefined,
    };
  }

  parseAsync(buffer: Buffer): Promise<ParsedDocument> {
    return Promise.resolve(this.parse(buffer));
  }

  supports(format: DocumentFormat): boolean {
    return format === 'md';
  }

  private extractTitle(raw: string): string | null {
    const match = raw.match(/^#\s+(.+)$/m);
    return match?.[1]?.trim() ?? null;
  }

  private extractSections(raw: string): ParsedSection[] {
    const sections: ParsedSection[] = [];
    const lines = raw.split('\n');

    let currentSection: ParsedSection | null = null;

    for (const line of lines) {
      const headerMatch = line.match(/^(#{1,6})\s+(.+)$/);
      if (headerMatch) {
        // Save previous section if exists
        if (currentSection) {
          currentSection.content = currentSection.content.trimEnd();
          sections.push(currentSection);
        }
        const hashes = headerMatch[1] ?? '';
        const level = hashes.length;
        const title = (headerMatch[2] ?? '').trim();
        currentSection = { level, title, content: '' };
      } else if (currentSection) {
        currentSection.content += line + '\n';
      }
    }

    // Push last section
    if (currentSection) {
      currentSection.content = currentSection.content.trimEnd();
      sections.push(currentSection);
    }

    return sections;
  }
}
