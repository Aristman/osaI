/**
 * Parser registry for document format auto-selection.
 *
 * Maintains a collection of DocumentParser instances and provides
 * lookup by DocumentFormat.
 */
import type { DocumentFormat } from '../types/document.js';
import type { DocumentParser, ParsedDocument } from './document-parser.js';
import { UnsupportedFormatError } from './document-parser.js';
import { TxtParser } from './txt-parser.js';
import { MdParser } from './md-parser.js';

/**
 * Registry of document parsers.
 *
 * Auto-registers built-in parsers (txt, md). PdfParser is optional
 * and can be registered if pdf-parse is available.
 */
export class ParserRegistry {
  private readonly parsers: Map<DocumentFormat, DocumentParser> = new Map();

  constructor() {
    this.register(new TxtParser());
    this.register(new MdParser());
  }

  /**
   * Register a parser instance.
   */
  register(parser: DocumentParser): void {
    // We register for all known formats the parser supports.
    const knownFormats: readonly string[] = ['txt', 'md', 'pdf', 'docx', 'html', 'csv', 'json'];
    for (const format of knownFormats) {
      if (parser.supports(format as DocumentFormat)) {
        this.parsers.set(format as DocumentFormat, parser);
      }
    }
  }

  /**
   * Get a parser for the given format.
   *
   * @throws UnsupportedFormatError if no parser is registered for the format.
   */
  getParser(format: DocumentFormat): DocumentParser {
    const parser = this.parsers.get(format);
    if (!parser) {
      throw new UnsupportedFormatError(format);
    }
    return parser;
  }

  /**
   * Check if a parser is registered for the given format.
   */
  hasParser(format: DocumentFormat): boolean {
    return this.parsers.has(format);
  }

  /**
   * Get list of all supported formats.
   */
  getSupportedFormats(): DocumentFormat[] {
    return Array.from(this.parsers.keys());
  }

  /**
   * Parse a document buffer using the parser for the given format.
   *
   * @throws UnsupportedFormatError if no parser is registered for the format.
   * @throws ParseError if parsing fails.
   */
  parse(format: DocumentFormat, buffer: Buffer): ParsedDocument {
    return this.getParser(format).parse(buffer);
  }

  /**
   * Parse a document buffer asynchronously.
   * For sync parsers (txt, md), this wraps the sync result in a resolved promise.
   * For async parsers (pdf), this calls parseAsync.
   *
   * @throws UnsupportedFormatError if no parser is registered for the format.
   * @throws ParseError if parsing fails.
   */
  async parseAsync(format: DocumentFormat, buffer: Buffer): Promise<ParsedDocument> {
    const parser = this.getParser(format);
    return parser.parseAsync(buffer);
  }
}
