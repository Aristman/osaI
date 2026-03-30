/**
 * Document parser interface and types.
 *
 * Strategy pattern: each parser implements DocumentParser for a specific format.
 */
import type { DocumentFormat } from '../types/document.js';

/**
 * A parsed section extracted from a structured document (e.g., markdown headers).
 */
export interface ParsedSection {
  /** Header level (1-6 for markdown). */
  level: number;
  /** Section title text. */
  title: string;
  /** Section body content (text below the header until the next header of same or higher level). */
  content: string;
}

/**
 * Result of parsing a document.
 */
export interface ParsedDocument {
  /** Full extracted text content. */
  content: string;
  /** Optional document title (from metadata or first header). */
  title?: string;
  /** Structured sections (e.g., from markdown headers). */
  sections?: ParsedSection[];
  /** Additional metadata extracted from the document. */
  metadata?: Record<string, unknown>;
}

/**
 * Error thrown when document parsing fails.
 */
export class ParseError extends Error {
  constructor(
    message: string,
    public readonly format?: DocumentFormat,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'ParseError';
  }
}

/**
 * Error thrown when no parser is registered for a given format.
 */
export class UnsupportedFormatError extends Error {
  constructor(public readonly format: string) {
    super(`Unsupported document format: ${format}`);
    this.name = 'UnsupportedFormatError';
  }
}

/**
 * Interface for document parsers.
 *
 * Each parser handles a specific document format.
 */
export interface DocumentParser {
  /**
   * Parse a document buffer into a ParsedDocument (synchronous).
   *
   * @param buffer - Raw document bytes.
   * @returns Parsed document content and metadata.
   * @throws ParseError if parsing fails.
   */
  parse(buffer: Buffer): ParsedDocument;

  /**
   * Parse a document buffer asynchronously.
   * Optional -- parsers that require async I/O (e.g., PDF) should implement this.
   * Sync parsers return a resolved promise wrapping their parse() result.
   *
   * @param buffer - Raw document bytes.
   * @returns Promise resolving to parsed document content and metadata.
   * @throws ParseError if parsing fails.
   */
  parseAsync(buffer: Buffer): Promise<ParsedDocument>;

  /**
   * Check if this parser supports the given format.
   *
   * @param format - Document format to check.
   * @returns true if this parser can handle the format.
   */
  supports(format: DocumentFormat): boolean;
}
