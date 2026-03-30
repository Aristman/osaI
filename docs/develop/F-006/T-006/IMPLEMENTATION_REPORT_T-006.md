# Implementation Report -- T-006

## Implemented Scope

Реализован SourceManager (S-027) -- CRUD операции для управления источниками документов в Knowledge Base (DOMAIN-005):

- **addSource** -- делегирует IngestPipeline полный цикл ингеста (parse -> chunk -> embed -> store)
- **removeSource** -- каскадное удаление: vectors из VectorStorage -> document + chunks из DB (FK cascade)
- **listSources** -- фильтрация по тегам (AND логика -- ВСЕ указанные теги должны присутствовать), сортировка по дате DESC
- **getSourceStats** -- агрегированная статистика: total, byFormat, byTag

Фильтрация тегов реализована поверх `repository.listDocuments()`, который уже возвращает документы DESC по created_at. В `listSources` применяется дополнительная сортировка для гарантии порядка.

Диапазон реализации строго ограничен T-006 из ROADMAP_TASKS_F-006.md.

## Tests Implemented

| ID | Description | Status |
|----|-------------|--------|
| TC-006-1 | Add source ingests document, returns document ID | pass |
| TC-006-1 | Add source passes format and tags to pipeline | pass |
| TC-006-2 | Remove source deletes document, chunks, and vectors | pass |
| TC-006-2 | Remove source handles document with zero chunks | pass |
| TC-006-3 | Remove non-existent source throws SourceNotFoundError | pass |
| TC-006-4 | List sources returns all documents as SourceInfo | pass |
| TC-006-4 | List sources returns empty array when no documents | pass |
| TC-006-4 | List sources converts timestamps to ISO strings | pass |
| TC-006-4 | List sources includes tags as SourceTag array | pass |
| TC-006-5 | List sources filters by single tag | pass |
| TC-006-5 | List sources requires ALL tags to match (AND logic) | pass |
| TC-006-5 | List sources returns empty when no match | pass |
| TC-006-5 | List sources handles empty tags array | pass |
| TC-006-6 | Get stats returns total and byFormat | pass |
| TC-006-6 | Get stats counts by tag | pass |
| TC-006-6 | Get stats returns zeroed for empty KB | pass |
| TC-006-7 | Add source propagates DocumentAlreadyExistsError | pass |

**Всего: 17 тестов, все pass.**
**Все 135 тестов knowledge-base package pass (без регрессий).**

Test coverage: IngestPipeline, KnowledgeRepository, VectorStorage полностью замокированы.

## Code Changes

### Files added
- `packages/knowledge-base/src/sources/source-manager.ts` -- SourceManager class (177 lines)
- `packages/knowledge-base/src/sources/index.ts` -- barrel export
- `packages/knowledge-base/src/__tests__/sources/source-manager.test.ts` -- 17 unit tests

### Files modified
- `packages/knowledge-base/src/index.ts` -- добавлен barrel export для SourceManager, SourceNotFoundError, ListSourcesFilter, SourceStats

## Architectural Compliance

- **Profile compliance:** backend-nodejs -- TypeScript strict mode, constructor DI, barrel exports, Vitest для тестов
- **Layered architecture:** SourceManager расположен в слое бизнес-логики, использует repository и pipeline через DI
- **Separation of concerns:** SourceManager координирует, не содержит логику парсинга/эмбеддинга/хранилища напрямую
- **Error handling:** явные ошибки (SourceNotFoundError), проброс DocumentAlreadyExistsError от pipeline
- **No new dependencies:** используются только существующие типы из @osai/memory и внутренних модулей

## Deviations

Отсутствуют.

## Known Limitations

- `listSources` загружает все документы из DB и фильтрует в памяти. Для больших коллекций потребуется пагинация на уровне SQL (roadmap упоминает пагинацию как часть listSources, но конкретный API не специфицирован -- оставлено для T-007 или V1).
- `getSourceStats` также вычисляется в памяти. При масштабировании следует перенести агрегацию на уровень SQL.
