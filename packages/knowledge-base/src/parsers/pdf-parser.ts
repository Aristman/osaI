/**
 * PDF parser using pdf-parse library.
 *
 * pdf-parse is an optional dependency. If not available, parse() / parseAsync() throws ParseError.
 */
import type { DocumentFormat } from '../types/document.js';
import type { DocumentParser, ParsedDocument } from './document-parser.js';
import { ParseError } from './document-parser.js';

/** Type of the pdf-parse default export. */
type PdfParseResult = {
  text: string;
  numpages: number;
  info: Record<string, unknown>;
};

type PdfParseFn = (buffer: Buffer) => Promise<PdfParseResult>;

/**
 * PDF parser implementation.
 *
 * Uses pdf-parse (optional dependency) to extract text from PDF buffers.
 * If pdf-parse is not installed, parse() and parseAsync() will throw ParseError.
 *
 * parse() is synchronous-only and throws because pdf-parse is inherently async.
 * Use parseAsync() for proper async PDF parsing.
 */
export class PdfParser implements DocumentParser {
  private pdfParse: PdfParseFn | null = null;
  private loadError: string | null = null;

  /**
   * @param pdfParseModule - Optional pdf-parse module reference (for DI / testing).
   *                        If not provided, will attempt to require('pdf-parse').
   */
  constructor(pdfParseModule?: PdfParseFn) {
    if (pdfParseModule !== undefined) {
      this.pdfParse = pdfParseModule;
    } else {
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        this.pdfParse = require('pdf-parse') as PdfParseFn;
      } catch {
        this.loadError = 'pdf-parse not available';
      }
    }
  }

  /**
   * Synchronous parse -- throws ParseError because pdf-parse is inherently async.
   * Use parseAsync() for PDF documents.
   */
  parse(_buffer: Buffer): ParsedDocument {
    if (this.pdfParse === null) {
      throw new ParseError(
        this.loadError ?? 'pdf-parse not available',
        'pdf',
      );
    }

    throw new ParseError(
      'PDF parsing is asynchronous; use parseAsync() instead',
      'pdf',
    );
  }

  async parseAsync(buffer: Buffer): Promise<ParsedDocument> {
    if (this.pdfParse === null) {
      throw new ParseError(
        this.loadError ?? 'pdf-parse not available',
        'pdf',
      );
    }

    let result: PdfParseResult;

    try {
      result = await this.pdfParse(buffer);
    } catch (error) {
      throw new ParseError(
        `Failed to parse PDF: ${error instanceof Error ? error.message : String(error)}`,
        'pdf',
        error,
      );
    }

    const metadata: Record<string, unknown> = {};
    if (result.numpages !== undefined) {
      metadata.pageCount = result.numpages;
    }
    if (result.info?.Author) {
      metadata.author = result.info.Author;
    }

    return {
      content: result.text,
      title: typeof result.info?.Title === 'string' ? result.info.Title : undefined,
      metadata,
    };
  }

  supports(format: DocumentFormat): boolean {
    return format === 'pdf';
  }
}
