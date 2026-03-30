# Implementation Report -- T-004: Ingest Pipeline (Chunking + Embedding + Storage)

## Implemented Scope

Реализован полный ingest pipeline для Knowledge Base (DOMAIN-005):
- Token-aware чанкинг текста с overlap
- Полный pipeline: parse -> chunk -> embed (batch) -> store
- Rollback при ошибках (better-sqlite3 транзакция)
- Прогресс-отчётность через EventEmitter
- Checksum-based dedup для обнаружения дубликатов

Все изменения строго в рамках T-004 roadmap.

## Tests Implemented

| Test ID | Description | File | Status |
|---------|-------------|------|--------|
| TC-004-1 | Chunker разбивает текст на ~chunkSize токенов | chunker.test.ts | PASS |
| TC-004-2 | Chunker применяет overlap между смежными чанками | chunker.test.ts | PASS |
| TC-004-3 | Chunker обрабатывает короткий текст (< chunkSize) | chunker.test.ts | PASS |
| TC-004-4 | Chunker обрабатывает пустой текст | chunker.test.ts | PASS |
| TC-004-5 | Pipeline полностью выполняется (end-to-end) | ingest-pipeline.test.ts | PASS |
| TC-004-6 | Pipeline откатывает данные при ошибке embedding | ingest-pipeline.test.ts | PASS |
| TC-004-7 | Pipeline генерирует события прогресса | ingest-pipeline.test.ts | PASS |
| TC-004-8 | Pipeline обрабатывает дублирующийся документ | ingest-pipeline.test.ts | PASS |

Дополнительные тесты (расширенное покрытие):
- estimateTokens: пустая строка, ASCII, multibyte UTF-8
- Chunk metadata: chunkIndex, charOffset (с учётом overlap), tokenCount
- Edge cases: точное соответствие chunkSize, очень большой текст, дефолтные параметры
- Checksum dedup: наличие checksum, различие для разного контента
- Tags: корректное сохранение тегов
- Format auto-detection: определение формата по расширению файла
- Title extraction: из заголовка markdown, fallback на имя файла

Итого: **14 тестов chunker** + **10 тестов pipeline** = **24 теста**, все PASS.

## Code Changes

### Files Added

| File | Description |
|------|-------------|
| `packages/knowledge-base/src/ingest/chunker.ts` | Token-aware text splitting: estimateTokens, findCharPositionForTokens, splitTextIntoChunks |
| `packages/knowledge-base/src/ingest/ingest-pipeline.ts` | IngestPipeline: parse -> chunk -> embed -> store с rollback и прогресс-событиями |
| `packages/knowledge-base/src/ingest/index.ts` | Barrel export для ingest модуля |
| `packages/knowledge-base/src/__tests__/ingest/chunker.test.ts` | 14 unit-тестов для chunker |
| `packages/knowledge-base/src/__tests__/ingest/ingest-pipeline.test.ts` | 10 unit-тестов для ingest pipeline |

### Files Modified

| File | Change |
|------|--------|
| `packages/knowledge-base/src/index.ts` | Добавлены экспорты для ingest модуля, parsers, и KnowledgeRepository |

## Architectural Compliance

- **Layered Architecture**: IngestPipeline (service layer) использует KnowledgeRepository (data access), ParserRegistry (parsing), EmbeddingProvider + VectorStorage (из @osai/memory) через constructor DI.
- **Separation of Concerns**: Chunker (чистая функция), Pipeline (оркестрация с EventEmitter), Repository (data access) -- чётко разделены.
- **Dependency Inversion**: Все зависимости инжектируются через конструктор. В тестах используются моки.
- **Explicit Transactions**: better-sqlite3 транзакция (BEGIN/COMMIT/ROLLBACK) для атомарности записи.
- **EventEmitter**: Прогресс-отчётность через стандартный Node.js EventEmitter с типизированными событиями.
- **Profile Compliance**: TypeScript strict mode, ESM modules, barrel exports, parameterized queries, explicit error handling.

### Constraints

- `estimateTokens` реализован локально (копия алгоритма из @osai/memory) для избежания runtime-зависимости. Алгоритм идентичен.
- Все внешние зависимости (EmbeddingProvider, VectorStorage) замоканы в тестах.
- Rollback реализован через `db.exec('ROLLBACK')` в catch-блоке внутри try/finally-подобной структуры.

## Deviations

| Deviation | Justification |
|-----------|---------------|
| Локальная копия `estimateTokens` вместо импорта из `@osai/memory` | Избегание runtime-зависимости при build. Алгоритм идентичен. Экспорт `estimateTokens` доступен из ingest модуля для переиспользования. |
| Допуск 5% overage для whitespace-boundary snapping | Breaking text на whitespace-границе может добавить 1-2 токена. 5% overage обеспечивает чистый разрыв без потери качества чанков. |
| Duplicate detection через `listDocuments()` | В схеме нет dedicated index для быстрого lookup по path. Для MVP (один пользователь) полный scan списка документов допустим. Оптимизация возможна через direct query в T-006. |

## Known Limitations

- `detectFormat` поддерживает только txt/md/pdf (соответствует MVP scope).
- Duplicate detection не использует checksum (только path). Разные файлы с одинаковым путём невозможны, но одинаковый контент с разными путями -- разрешён.
- Token estimation -- приблизительная (conservative). Реальные токены LLM-модели могут отличаться на +/- 10%.
- Транзакция включает только SQLite операции; VectorStorage.upsert не rollback-ится (нет ACID транзакции). При rollback SQLite, векторы в VectorStorage остаются. Для Production: добавить cleanup в rollback.
