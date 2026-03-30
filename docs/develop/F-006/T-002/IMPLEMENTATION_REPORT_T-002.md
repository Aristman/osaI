# Implementation Report -- T-002: Document Parsers (txt, md, pdf)

## Implemented Scope

Реализована система парсинга документов для Knowledge Base (DOMAIN-005):
- Интерфейс `DocumentParser` (strategy pattern) с синхронным `parse()` и асинхронным `parseAsync()`
- Тип `ParsedDocument` с content, title, sections, metadata
- Тип `ParsedSection` для структурированных секций (уровень заголовка, название, контент)
- `ParseError` -- ошибка парсинга с format и cause
- `UnsupportedFormatError` -- ошибка при отсутствии парсера для формата
- `TxtParser` -- plain text parser (buffer.toString('utf-8'))
- `MdParser` -- markdown parser (сохранение структуры заголовков, извлечение title)
- `PdfParser` -- обёртка над pdf-parse (optional dependency, DI для тестирования)
- `ParserRegistry` -- registry с auto-select по формату, поддержка кастомных парсеров

Scope строго ограничен задачей T-002 из ROADMAP_TASKS_F-006.md.

## Tests Implemented

| ID | Test | File | Status |
|----|------|------|--------|
| TC-002-1 | TxtParser extracts raw text | txt-parser.test.ts | pass |
| TC-002-2 | TxtParser handles empty input | txt-parser.test.ts | pass |
| TC-002-3 | MdParser preserves header hierarchy | md-parser.test.ts | pass |
| TC-002-4 | MdParser extracts code blocks | md-parser.test.ts | pass |
| TC-002-5 | PdfParser extracts text | pdf-parser.test.ts | pass |
| TC-002-6 | PdfParser throws on corrupted PDF | pdf-parser.test.ts | pass |
| TC-002-7 | ParserRegistry selects correct parser | parser-registry.test.ts | pass |
| TC-002-8 | ParserRegistry throws on unsupported format | parser-registry.test.ts | pass |

Дополнительно реализованы тесты:
- TxtParser: unicode handling, multiline text, supports()
- MdParser: title extraction, inline formatting, no headers
- PdfParser: empty text, sync parse() rejection, module unavailability
- ParserRegistry: custom parser registration, supported formats list, hasParser()

**Total: 31 tests, all passing.**

## Code Changes

### Files Added
- `packages/knowledge-base/src/parsers/document-parser.ts` -- DocumentParser interface, ParsedDocument, ParsedSection, ParseError, UnsupportedFormatError
- `packages/knowledge-base/src/parsers/txt-parser.ts` -- TxtParser implementation
- `packages/knowledge-base/src/parsers/md-parser.ts` -- MdParser implementation
- `packages/knowledge-base/src/parsers/pdf-parser.ts` -- PdfParser implementation
- `packages/knowledge-base/src/parsers/parser-registry.ts` -- ParserRegistry implementation
- `packages/knowledge-base/src/parsers/index.ts` -- barrel export
- `packages/knowledge-base/src/__tests__/parsers/txt-parser.test.ts` -- 6 tests
- `packages/knowledge-base/src/__tests__/parsers/md-parser.test.ts` -- 8 tests
- `packages/knowledge-base/src/__tests__/parsers/pdf-parser.test.ts` -- 9 tests
- `packages/knowledge-base/src/__tests__/parsers/parser-registry.test.ts` -- 8 tests

### Files Modified
- `packages/knowledge-base/src/types/document.ts` -- DocumentFormat type (overwritten by T-001 agent concurrently; T-001 version retained)

## Architectural Compliance

- **Strategy Pattern**: Каждый парсер реализует интерфейс `DocumentParser`, registry выбирает по формату
- **Dependency Inversion**: PdfParser использует DI (constructor injection) для pdf-parse модуля, что позволяет мокировать в тестах
- **TypeScript strict mode**: Все файлы компилируются с `strict: true`, `noUncheckedIndexedAccess: true`
- **Barrel exports**: `parsers/index.ts` экспортирует все публичные типы и классы
- **Error handling**: Кастомные error classes (ParseError, UnsupportedFormatError) с контекстной информацией
- **Graceful degradation**: PdfParser корректно обрабатывает отсутствие pdf-parse (throws ParseError)

## Deviations

1. **parseAsync() добавлен к DocumentParser interface**
   - Roadmap определяет только синхронный `parse(buffer: Buffer): ParsedDocument`
   - pdf-parse -- асинхронная библиотека, синхронный parse() невозможен
   - Добавлен `parseAsync()` как обязательный метод интерфейса (backward compatible extension)
   - TxtParser и MdParser реализуют parseAsync() через `Promise.resolve(parse())`
   - PdfParser реализует parseAsync() через `await pdfParse(buffer)`
   - PdfParser.parse() бросает ParseError с указанием использовать parseAsync()

   **Justification**: Техническое ограничение pdf-parse (async-only API). Без parseAsync() PDF парсинг невозможен.

2. **PdfParser constructor с DI**
   - Constructor принимает опциональный `pdfParseModule: PdfParseFn`
   - Без параметра пытается `require('pdf-parse')` (runtime)
   - **Justification**: Необходимость мокирования pdf-parse в тестах без установки реального пакета.

## Known Limitations

1. PdfParser.parse() всегда бросает ParseError (асинхронная природа pdf-parse). Callers должны использовать parseAsync() для PDF.
2. pdf-parse не установлен как dependency в package.json -- optional dependency, установка при необходимости.
3. Build package не проходит из-за ошибки в `db/index.ts` (задача T-003 другого агента). Мои файлы компилируются без ошибок.
4. ParserRegistry.register() использует hardcoded список форматов для проверки supports() -- расширение требует добавления формата в knownFormats list.
