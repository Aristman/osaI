import { describe, it, expect, beforeEach } from 'vitest';
import { ParserRegistry } from '../../parsers/parser-registry.js';
import { TxtParser } from '../../parsers/txt-parser.js';
import { MdParser } from '../../parsers/md-parser.js';
import { UnsupportedFormatError } from '../../parsers/document-parser.js';
describe('ParserRegistry', () => {
    let registry;
    beforeEach(() => {
        registry = new ParserRegistry();
    });
    describe('TC-002-7: ParserRegistry selects correct parser', () => {
        it('should return TxtParser for txt format', () => {
            const parser = registry.getParser('txt');
            expect(parser).toBeInstanceOf(TxtParser);
        });
        it('should return MdParser for md format', () => {
            const parser = registry.getParser('md');
            expect(parser).toBeInstanceOf(MdParser);
        });
    });
    describe('TC-002-8: ParserRegistry throws on unsupported format', () => {
        it('should throw UnsupportedFormatError for docx format', () => {
            expect(() => registry.getParser('docx')).toThrow(UnsupportedFormatError);
            expect(() => registry.getParser('docx')).toThrow(/Unsupported document format: docx/);
        });
        it('should throw UnsupportedFormatError for html format', () => {
            expect(() => registry.getParser('html')).toThrow(UnsupportedFormatError);
        });
    });
    describe('ParserRegistry register custom parser', () => {
        it('should allow registering a custom parser', () => {
            const customParser = {
                parse: () => ({ content: 'custom' }),
                supports: (format) => format === 'docx',
            };
            registry.register(customParser);
            expect(registry.getParser('docx')).toBe(customParser);
        });
    });
    describe('ParserRegistry list supported formats', () => {
        it('should return list of supported formats', () => {
            const formats = registry.getSupportedFormats();
            expect(formats).toContain('txt');
            expect(formats).toContain('md');
        });
    });
    describe('ParserRegistry hasParser', () => {
        it('should return true for supported format', () => {
            expect(registry.hasParser('txt')).toBe(true);
        });
        it('should return false for unsupported format', () => {
            expect(registry.hasParser('docx')).toBe(false);
        });
    });
});
//# sourceMappingURL=parser-registry.test.js.map