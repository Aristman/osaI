import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PdfParser } from '../../parsers/pdf-parser.js';
import { ParseError } from '../../parsers/document-parser.js';
describe('PdfParser', () => {
    describe('TC-002-5: PdfParser extracts text', () => {
        it('should extract text content from a valid PDF buffer (mocked)', async () => {
            const expectedText = 'This is extracted PDF text content.';
            const mockPdfParse = vi.fn().mockResolvedValue({
                text: expectedText,
                numpages: 3,
                info: {
                    Title: 'Test Document',
                    Author: 'Test Author',
                },
            });
            const parser = new PdfParser(mockPdfParse);
            const buffer = Buffer.from('fake-pdf-content');
            const result = await parser.parseAsync(buffer);
            expect(result.content).toBe(expectedText);
            expect(result.title).toBe('Test Document');
            expect(result.metadata).toEqual({
                pageCount: 3,
                author: 'Test Author',
            });
            expect(mockPdfParse).toHaveBeenCalledWith(buffer);
        });
    });
    describe('TC-002-6: PdfParser throws on corrupted PDF', () => {
        it('should throw ParseError with descriptive message for invalid PDF', async () => {
            const mockPdfParse = vi.fn().mockRejectedValue(new Error('Invalid PDF structure'));
            const parser = new PdfParser(mockPdfParse);
            const buffer = Buffer.from('corrupted-content');
            await expect(parser.parseAsync(buffer)).rejects.toThrow(ParseError);
            await expect(parser.parseAsync(buffer)).rejects.toThrow(/Failed to parse PDF/);
        });
    });
    describe('PdfParser handles empty text', () => {
        it('should return empty content when PDF has no text', async () => {
            const mockPdfParse = vi.fn().mockResolvedValue({
                text: '',
                numpages: 1,
                info: {},
            });
            const parser = new PdfParser(mockPdfParse);
            const buffer = Buffer.from('empty-pdf');
            const result = await parser.parseAsync(buffer);
            expect(result.content).toBe('');
        });
    });
    describe('PdfParser parse() throws for sync usage', () => {
        it('should throw ParseError indicating async is required when pdf-parse is loaded', () => {
            const mockPdfParse = vi.fn().mockResolvedValue({ text: 'test', numpages: 1, info: {} });
            const parser = new PdfParser(mockPdfParse);
            const buffer = Buffer.from('fake-pdf');
            expect(() => parser.parse(buffer)).toThrow(ParseError);
            expect(() => parser.parse(buffer)).toThrow(/asynchronous.*parseAsync/);
        });
    });
    describe('PdfParser supports format', () => {
        it('should support pdf format', () => {
            const parser = new PdfParser(vi.fn().mockResolvedValue({ text: '', numpages: 0, info: {} }));
            expect(parser.supports('pdf')).toBe(true);
        });
        it('should not support other formats', () => {
            const parser = new PdfParser(vi.fn().mockResolvedValue({ text: '', numpages: 0, info: {} }));
            expect(parser.supports('txt')).toBe(false);
            expect(parser.supports('md')).toBe(false);
        });
    });
    describe('PdfParser without pdf-parse module', () => {
        it('should throw ParseError from parseAsync when no module provided and pdf-parse not installed', async () => {
            const parser = new PdfParser();
            const buffer = Buffer.from('test');
            // Without the mock and without pdf-parse installed, constructor sets loadError.
            // parseAsync should throw ParseError.
            await expect(parser.parseAsync(buffer)).rejects.toThrow(ParseError);
            await expect(parser.parseAsync(buffer)).rejects.toThrow(/pdf-parse not available/);
        });
        it('should throw ParseError from parse() when no module provided', () => {
            const parser = new PdfParser();
            const buffer = Buffer.from('test');
            expect(() => parser.parse(buffer)).toThrow(ParseError);
            expect(() => parser.parse(buffer)).toThrow(/pdf-parse not available/);
        });
        it('should still report supporting pdf format', () => {
            const parser = new PdfParser();
            expect(parser.supports('pdf')).toBe(true);
        });
    });
});
//# sourceMappingURL=pdf-parser.test.js.map