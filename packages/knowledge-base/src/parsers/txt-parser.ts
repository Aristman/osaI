/**
 * Plain text parser for .txt files.
 */
import type { DocumentFormat } from '../types/document.js';
import type { DocumentParser, ParsedDocument } from './document-parser.js';

export class TxtParser implements DocumentParser {
  parse(buffer: Buffer): ParsedDocument {
    const content = buffer.toString('utf-8');
    return { content };
  }

  parseAsync(buffer: Buffer): Promise<ParsedDocument> {
    return Promise.resolve(this.parse(buffer));
  }

  supports(format: DocumentFormat): boolean {
    return format === 'txt';
  }
}
