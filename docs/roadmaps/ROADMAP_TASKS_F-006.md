# Task Roadmap: Knowledge Base

**Feature ID:** F-006
**Feature Name:** Knowledge Base
**Domain:** DOMAIN-005 (Knowledge Base)
**Agent Profile:** backend-typescript (extends backend-base + nodejs)
**Git Branch:** feature/knowledge-base
**Dependencies:** F-001 (Core Infrastructure), F-002 (LLM Provider System -- embeddings), F-003 (Observability), F-005 (Memory System -- embeddings provider, vector storage)
**Related Requirements:** FR-012
**Components:** S-025 (Document Ingestion), S-026 (Semantic Search), S-027 (Source Management)
**Version:** v1.0

---

## Feature F-006: Knowledge Base
**Domain:** DOMAIN-005 | **Dependencies:** F-001, F-002, F-003, F-005

Ингест документов (parse + chunking + embedding + vector storage), семантический поиск с source attribution, управление источниками (add, remove, list по тегам). Форматы MVP: txt, md, pdf.

**Ключевые решения из архитектуры:**
- Ингест pipeline: Document -> Parse (txt/md/pdf) -> Chunking (1024 tokens, overlap 128) -> Embedding -> Store in sqlite-vec + SQLite
- Search pipeline: Query -> Embedding -> Vector search -> Filter (similarity > 0.7) -> Source attribution
- Использует EmbeddingProvider и VectorStorage из packages/memory (F-005)
- Knowledge base доступна из любого чата (shared)
- Нативный модуль: sqlite-vec через better-sqlite3

---

## Dependencies

### 2.1 Feature Dependencies

- **F-001:** Core Infrastructure (blocking) -- SQLite, pino, osai.json, WAL mode
- **F-002:** LLM Provider System (blocking) -- Ollama embeddings (nomic-embed-text)
- **F-003:** Observability (blocking) -- audit logging, trace_id
- **F-005:** Memory System (blocking) -- EmbeddingProvider interface, VectorStorage interface

### 2.2 Task Dependencies

- **T-001** -- None (базовая структура package)
- **T-002** -- T-001 (требует package structure + types)
- **T-003** -- T-001 (требует package structure + DB schema)
- **T-004** -- T-002, T-003 (требует parsers + schema + embeddings)
- **T-005** -- T-004 (требует ingested chunks в БД)
- **T-006** -- T-005 (требует ingested chunks + source metadata)
- **T-007** -- T-004, T-005, T-006 (интеграция всех компонентов)

### 2.3 Development Order

```
Параллельно:
  T-001 (package setup)

Параллельно:
  T-002 (document parsers) + T-003 (SQLite schema)

Последовательно:
  T-004 (ingest pipeline)

Параллельно:
  T-005 (semantic search) + T-006 (source management)

Последовательно:
  T-007 (integration tests)
```

---

## Task Breakdown

---

### Task T-001: Package Knowledge Base -- Base Structure and Interfaces

**Domain:** DOMAIN-005 | **Dependencies:** None

**Description:**
Создание структуры package `packages/knowledge-base`, TypeScript interfaces, типов, barrel exports. Зависит от types из packages/memory (F-005).

**Estimated Time:** 2 hours

#### Checklist
- [ ] CODE: `packages/knowledge-base/package.json` -- зависимости: better-sqlite3, sqlite-vec (optional), pino, @osai/memory
- [ ] CODE: `packages/knowledge-base/tsconfig.json`
- [ ] CODE: `packages/knowledge-base/src/types/document.ts` -- KnowledgeDocument, DocumentFormat (txt|md|pdf), DocumentStatus
- [ ] CODE: `packages/knowledge-base/src/types/chunk.ts` -- KnowledgeChunk, ChunkMetadata
- [ ] CODE: `packages/knowledge-base/src/types/search.ts` -- KBSearchQuery, KBSearchResult, KBSearchConfig
- [ ] CODE: `packages/knowledge-base/src/types/source.ts` -- SourceInfo, SourceTag
- [ ] CODE: `packages/knowledge-base/src/index.ts` -- barrel export
- [ ] TEST: `packages/knowledge-base/src/__tests__/types.test.ts` -- корректность типов, enum values, defaults
- [ ] BUILD: `pnpm --filter @osai/knowledge-base build`

#### Test Cases

| ID | Description | Preconditions | Expected | Criteria |
|----|-------------|----------------|----------|----------|
| TC-001-1 | DocumentFormat enum содержит txt, md, pdf | package собран | enum values = ['txt', 'md', 'pdf'] | pass |
| TC-001-2 | KnowledgeDocument fields are correctly typed | types imported | all required fields present, optional fields defined | pass |
| TC-001-3 | KBSearchQuery accepts topK and minSimilarity | types imported | default values: topK=5, minSimilarity=0.7 | pass |
| TC-001-4 | Barrel export exposes all types | index.ts imported | all public types available | pass |

#### Acceptance
- package.json содержит @osai/memory как dependency
- Все интерфейсы экспортируются через barrel export
- TypeScript strict mode компилируется без ошибок
- Unit tests проходят
- `pnpm --filter @osai/knowledge-base build` завершается успешно

---

### Task T-002: Document Parsers (txt, md, pdf)

**Domain:** DOMAIN-005 | **Dependencies:** T-001

**Description:**
Реализация парсеров для текстовых форматов: txt (plain text), md (markdown с сохранением структуры), pdf (минимальный парсинг через pdf-parse). Strategy pattern для расширения новыми форматами.

**Estimated Time:** 3 hours

#### Checklist
- [ ] CODE: `packages/knowledge-base/src/parsers/document-parser.ts` -- interface DocumentParser { parse(buffer: Buffer): ParsedDocument; supports(format: DocumentFormat): boolean }
- [ ] CODE: `packages/knowledge-base/src/parsers/txt-parser.ts` -- plain text parser
- [ ] CODE: `packages/knowledge-base/src/parsers/md-parser.ts` -- markdown parser (extract text, preserve headers)
- [ ] CODE: `packages/knowledge-base/src/parsers/pdf-parser.ts` -- pdf-parse wrapper (extract text from PDF)
- [ ] CODE: `packages/knowledge-base/src/parsers/parser-registry.ts` -- registry + auto-select by format
- [ ] TEST: `packages/knowledge-base/src/__tests__/parsers/txt-parser.test.ts` -- parse plain text, handle empty, handle unicode
- [ ] TEST: `packages/knowledge-base/src/__tests__/parsers/md-parser.test.ts` -- parse markdown, preserve headers, handle code blocks
- [ ] TEST: `packages/knowledge-base/src/__tests__/parsers/pdf-parser.test.ts` -- parse PDF (mock pdf-parse), handle corrupted PDF
- [ ] TEST: `packages/knowledge-base/src/__tests__/parsers/parser-registry.test.ts` -- registry selection, unsupported format error
- [ ] BUILD: `pnpm --filter @osai/knowledge-base build`

#### Test Cases

| ID | Description | Preconditions | Expected | Criteria |
|----|-------------|----------------|----------|----------|
| TC-002-1 | TxtParser extracts raw text | Buffer with UTF-8 text | ParsedDocument.content = original text | pass |
| TC-002-2 | TxtParser handles empty input | Buffer(0) | content = '', no error thrown | pass |
| TC-002-3 | MdParser preserves header hierarchy | markdown with h1-h3 | ParsedDocument.sections detected | pass |
| TC-002-4 | MdParser extracts code blocks | markdown with ``` blocks | code blocks preserved in content | pass |
| TC-002-5 | PdfParser extracts text | valid PDF buffer (mocked) | text content extracted | pass |
| TC-002-6 | PdfParser throws on corrupted PDF | invalid PDF buffer | throws ParseError with descriptive message | pass |
| TC-002-7 | ParserRegistry selects correct parser | format='pdf' | returns PdfParser instance | pass |
| TC-002-8 | ParserRegistry throws on unsupported format | format='docx' | throws UnsupportedFormatError | pass |

#### Acceptance
- Все 3 парсера реализованы и покрыты тестами
- ParserRegistry корректно выбирает парсер по формату
- pdf-parse добавлен как optional dependency
- Все тесты проходят
- Build успешен

---

### Task T-003: SQLite Schema for Knowledge Base

**Domain:** DOMAIN-005 | **Dependencies:** T-001

**Description:**
Создание SQLite таблиц (knowledge_documents, knowledge_chunks) в единой БД osai.db. Индексы для быстрого поиска. Миграции/инициализация схемы.

**Estimated Time:** 2 hours

#### Checklist
- [ ] CODE: `packages/knowledge-base/src/db/schema.ts` -- CREATE TABLE knowledge_documents (id, title, path, format, status, chunks_count, total_size, tags TEXT[], created_at, updated_at, checksum)
- [ ] CODE: `packages/knowledge-base/src/db/schema.ts` -- CREATE TABLE knowledge_chunks (id, document_id, content, chunk_index, created_at)
- [ ] CODE: `packages/knowledge-base/src/db/repository.ts` -- KnowledgeRepository: insertDocument, updateDocument, deleteDocument, getDocument, listDocuments, insertChunk, deleteChunksByDocument
- [ ] CODE: `packages/knowledge-base/src/db/initializer.ts` -- initKnowledgeSchema(db) -- creates tables + indexes if not exist
- [ ] TEST: `packages/knowledge-base/src/__tests__/db/schema.test.ts` -- таблицы создаются, индексы существуют, idempotent init
- [ ] TEST: `packages/knowledge-base/src/__tests__/db/repository.test.ts` -- CRUD operations для documents и chunks
- [ ] BUILD: `pnpm --filter @osai/knowledge-base build`

#### Test Cases

| ID | Description | Preconditions | Expected | Criteria |
|----|-------------|----------------|----------|----------|
| TC-003-1 | Tables created on init | in-memory SQLite DB | knowledge_documents + knowledge_chunks exist | pass |
| TC-003-2 | Init is idempotent | DB with existing tables | no error on second init call | pass |
| TC-003-3 | Insert and retrieve document | initialized DB | document fields match inserted values | pass |
| TC-003-4 | Delete document cascades chunks | document with 5 chunks | all chunks deleted, document deleted | pass |
| TC-003-5 | List documents with tag filter | 3 documents, 2 with tag 'api' | returns only 2 documents | pass |
| TC-003-6 | Insert chunk links to document | existing document | chunk.document_id matches | pass |

#### Acceptance
- Две таблицы создаются корректно с индексами
- Инициализация идемпотентна
- CRUD операции работают для документов и чанков
- Cascade delete для chunks при удалении документа
- Все тесты проходят

---

### Task T-004: Ingest Pipeline (Chunking + Embedding + Storage)

**Domain:** DOMAIN-005 | **Dependencies:** T-002, T-003

**Description:**
Полный pipeline ингеста: Document -> Parse -> Chunk (1024 tokens, overlap 128) -> Embed (через EmbeddingProvider из memory) -> Store (SQLite + sqlite-vec). Обработка ошибок на каждом этапе. Прогресс-отчётность.

**Estimated Time:** 4 hours

#### Checklist
- [ ] CODE: `packages/knowledge-base/src/ingest/chunker.ts` -- splitTextIntoChunks(text, chunkSize=1024, overlap=128): Chunk[] -- token-aware splitting
- [ ] CODE: `packages/knowledge-base/src/ingest/ingest-pipeline.ts` -- IngestPipeline: ingestDocument(path, format, tags) -> IngestResult
- [ ] CODE: `packages/knowledge-base/src/ingest/ingest-pipeline.ts` -- шаги: parse -> chunk -> embed (batch) -> store
- [ ] CODE: `packages/knowledge-base/src/ingest/ingest-pipeline.ts` -- error handling: rollback на failure, audit logging
- [ ] CODE: `packages/knowledge-base/src/ingest/ingest-pipeline.ts` -- прогресс: EventEmitter с событиями progress, chunk Embedded, document Stored
- [ ] TEST: `packages/knowledge-base/src/__tests__/ingest/chunker.test.ts` -- split plain text, respect overlap, handle short text, handle empty
- [ ] TEST: `packages/knowledge-base/src/__tests__/ingest/ingest-pipeline.test.ts` -- full pipeline with mocks, error rollback, progress events
- [ ] BUILD: `pnpm --filter @osai/knowledge-base build`

#### Test Cases

| ID | Description | Preconditions | Expected | Criteria |
|----|-------------|----------------|----------|----------|
| TC-004-1 | Chunker splits text into ~1024 token chunks | text > 2000 tokens | chunks.length >= 2, each chunk <= 1024 tokens | pass |
| TC-004-2 | Chunker applies 128 token overlap | text > 2000 tokens | adjacent chunks share ~128 tokens | pass |
| TC-004-3 | Chunker handles short text (< chunkSize) | text = 100 tokens | single chunk, content = original text | pass |
| TC-004-4 | Chunker handles empty text | text = '' | single empty chunk or empty array | pass |
| TC-004-5 | Ingest pipeline completes end-to-end | txt file, mocked embeddings | document + chunks stored in DB, vector stored | pass |
| TC-004-6 | Pipeline rolls back on embed failure | embedding provider throws | no partial data in DB, error reported | pass |
| TC-004-7 | Pipeline emits progress events | 5-chunk document | 5 'chunk:embedded' + 1 'document:stored' events | pass |
| TC-004-8 | Pipeline handles duplicate document | document with same path already exists | error: DocumentAlreadyExists or update mode | pass |

#### Acceptance
- Chunking корректно разбивает текст на ~1024 токенов с overlap 128
- Pipeline проходит все этапы: parse -> chunk -> embed -> store
- Rollback при ошибке на любом этапе
- Прогресс-события генерируются
- Все тесты проходят (с моками для embeddings)
- Build успешен

---

### Task T-005: Semantic Search with Source Attribution

**Domain:** DOMAIN-005 | **Dependencies:** T-004

**Description:**
Семантический поиск по Knowledge Base: query -> embed -> vector search (cosine similarity) -> filter (top_k, min_similarity) -> source attribution. Интеграция с VectorStorage из memory.

**Estimated Time:** 3 hours

#### Checklist
- [ ] CODE: `packages/knowledge-base/src/search/kb-search.ts` -- KBSearch: search(query, config?) -> KBSearchResult[]
- [ ] CODE: `packages/knowledge-base/src/search/kb-search.ts` -- embed query через EmbeddingProvider, vector search через VectorStorage
- [ ] CODE: `packages/knowledge-base/src/search/kb-search.ts` -- filter: top_k=5 (default), min_similarity=0.7 (default)
- [ ] CODE: `packages/knowledge-base/src/search/kb-search.ts` -- source attribution: each result includes document title, path, chunk_index, tags
- [ ] CODE: `packages/knowledge-base/src/search/kb-search.ts` -- RAG formatting: results formatted as markdown for system prompt injection
- [ ] TEST: `packages/knowledge-base/src/__tests__/search/kb-search.test.ts` -- search returns relevant chunks, filters by similarity, source attribution present
- [ ] TEST: `packages/knowledge-base/src/__tests__/search/kb-search.test.ts` -- empty results when no match, malformed query handling
- [ ] BUILD: `pnpm --filter @osai/knowledge-base build`

#### Test Cases

| ID | Description | Preconditions | Expected | Criteria |
|----|-------------|----------------|----------|----------|
| TC-005-1 | Search returns top-k relevant chunks | DB with 10 documents, query matches 3 | results.length <= 5, all similarity > 0.7 | pass |
| TC-005-2 | Search filters by min_similarity | chunks with similarity 0.5, 0.8, 0.9 | only 0.8 and 0.9 returned | pass |
| TC-005-3 | Search includes source attribution | matching chunk found | result contains document title, path, chunk_index | pass |
| TC-005-4 | Search returns empty for no match | query unrelated to any document | results.length = 0, no error thrown | pass |
| TC-005-5 | Search handles empty query | query = '' | error thrown or empty results | pass |
| TC-005-6 | RAG formatting produces valid markdown | 3 search results | formatted string with sources and content | pass |
| TC-005-7 | Search respects top_k=1 | config.topK = 1 | returns at most 1 result (highest similarity) | pass |

#### Acceptance
- Семантический поиск работает через VectorStorage из memory
- Фильтрация по top_k и min_similarity корректна
- Source attribution содержит document title, path, chunk_index
- RAG formatting в markdown для инъекции в system prompt
- Пустые результаты обрабатываются корректно
- Все тесты проходят
- Build успешен

---

### Task T-006: Source Management (Add, Remove, List)

**Domain:** DOMAIN-005 | **Dependencies:** T-005

**Description:**
CRUD операции для управления источниками документов: добавление (ingest), удаление (remove document + chunks + vectors), список по тегам, статистика.

**Estimated Time:** 2 hours

#### Checklist
- [ ] CODE: `packages/knowledge-base/src/sources/source-manager.ts` -- SourceManager: addSource(path, format?, tags?), removeSource(documentId), listSources(filter?), getSourceStats()
- [ ] CODE: `packages/knowledge-base/src/sources/source-manager.ts` -- addSource вызывает IngestPipeline, removeSource удаляет document + chunks + vectors
- [ ] CODE: `packages/knowledge-base/src/sources/source-manager.ts` -- listSources: filter по tags, sort по date, pagination
- [ ] CODE: `packages/knowledge-base/src/sources/source-manager.ts` -- getSourceStats: total documents, total chunks, by format, by tag
- [ ] TEST: `packages/knowledge-base/src/__tests__/sources/source-manager.test.ts` -- add/remove/list/stats
- [ ] TEST: `packages/knowledge-base/src/__tests__/sources/source-manager.test.ts` -- remove non-existent source, list with empty filter, tag filtering
- [ ] BUILD: `pnpm --filter @osai/knowledge-base build`

#### Test Cases

| ID | Description | Preconditions | Expected | Criteria |
|----|-------------|----------------|----------|----------|
| TC-006-1 | Add source ingests document | valid txt file | document created, chunks stored, returns document ID | pass |
| TC-006-2 | Remove source deletes all related data | document with 5 chunks + vectors | document deleted, chunks deleted, vectors removed | pass |
| TC-006-3 | Remove non-existent source throws | no such document ID | throws NotFoundError | pass |
| TC-006-4 | List sources returns all documents | 3 documents in DB | returns array of 3 SourceInfo objects | pass |
| TC-006-5 | List sources filters by tags | 3 docs, 2 tagged 'api' | returns 2 documents | pass |
| TC-006-6 | Get stats returns correct counts | 3 txt, 2 pdf docs | stats: { total: 5, byFormat: {txt: 3, pdf: 2} } | pass |
| TC-006-7 | Add source with duplicate path | same path already ingested | error: DuplicateSource or update mode | pass |

#### Acceptance
- addSource запускает полный ingest pipeline
- removeSource удаляет document + chunks + vectors (cascade)
- listSources фильтрует по тегам
- getSourceStats возвращает корректную статистику
- Все тесты проходят
- Build успешен

---

### Task T-007: Integration Tests + Build/Run Verification

**Domain:** DOMAIN-005 | **Dependencies:** T-004, T-005, T-006

**Description:**
Сквозные интеграционные тесты: ingest -> search -> remove. Проверка сборки всего пакета, совместимости с packages/memory.

**Estimated Time:** 3 hours

#### Checklist
- [ ] TEST: `packages/knowledge-base/src/__tests__/integration/ingest-search-remove.test.ts` -- полный цикл: ingest txt -> search -> verify attribution -> remove -> verify deleted
- [ ] TEST: `packages/knowledge-base/src/__tests__/integration/multi-format.test.ts` -- ingest txt + md + pdf -> search across all -> verify cross-format results
- [ ] TEST: `packages/knowledge-base/src/__tests__/integration/rag-context.test.ts` -- search results formatted for RAG injection, verify markdown structure
- [ ] TEST: `packages/knowledge-base/src/__tests__/integration/large-document.test.ts` -- ingest document > 10 chunks -> verify all chunks stored -> search returns from correct chunks
- [ ] BUILD: `pnpm --filter @osai/knowledge-base build` -- полная сборка пакета
- [ ] BUILD: `pnpm build` -- сборка всего monorepo (проверка совместимости)
- [ ] RUN: `pnpm --filter @osai/knowledge-base test` -- все тесты (unit + integration)

#### Test Cases

| ID | Description | Preconditions | Expected | Criteria |
|----|-------------|----------------|----------|----------|
| TC-007-1 | Full cycle: ingest -> search -> remove | in-memory DB, mocked embeddings | ingest succeeds, search finds results, remove cleans up | pass |
| TC-007-2 | Cross-format search | txt + md + pdf ingested | search returns results from all 3 formats | pass |
| TC-007-3 | RAG context format | 3 search results | markdown with source titles, paths, content sections | pass |
| TC-007-4 | Large document (10+ chunks) | text > 10K tokens | all chunks stored, search returns relevant subset | pass |
| TC-007-5 | Build passes | all code implemented | `pnpm --filter @osai/knowledge-base build` exits 0 | pass |
| TC-007-6 | All tests pass | test environment ready | `pnpm --filter @osai/knowledge-base test` exits 0 | pass |

#### Acceptance
- Все интеграционные тесты проходят
- Сборка пакета успешна
- Сборка monorepo не сломана
- Все тесты (unit + integration) проходят
- Нет критических ошибок при запуске

---

## Test Strategy (TDD)

### 4.1 Test Types per Task

| Task | Unit | Integration | Build/Run |
|------|------|-------------|-----------|
| T-001 | types.test.ts | -- | build |
| T-002 | 4 parser test files | -- | build |
| T-003 | schema.test.ts, repository.test.ts | -- | build |
| T-004 | chunker.test.ts, ingest-pipeline.test.ts | -- | build |
| T-005 | kb-search.test.ts | -- | build |
| T-006 | source-manager.test.ts | -- | build |
| T-007 | -- | 4 integration test files | build + test |

### 4.2 Build and Run Verification

**Build:**
```bash
pnpm --filter @osai/knowledge-base build
pnpm build  # full monorepo
```

**Test:**
```bash
pnpm --filter @osai/knowledge-base test
```

**Критерий:** exit code 0, нет TypeScript errors, все тесты green.

### 4.3 Coverage Expectations

- T-001..T-003: 80%+ coverage (types, parsers, schema)
- T-004: 85%+ coverage (critical pipeline -- error handling paths)
- T-005: 80%+ coverage (search logic)
- T-006: 75%+ coverage (CRUD operations)
- T-007: 100% of defined integration scenarios covered

---

## Risks and Edge Cases

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| pdf-parse native dependency на Windows | Medium | Medium | pdf-parse -- pure JS, no native deps; fallback: skip PDF в MVP |
| sqlite-vec не работает на Windows | Low (F-005 mitigated) | High | Fallback на Orama (in-process); F-005 уже решает эту проблему |
| Token counting неточен для chunking | Medium | Low | Использовать tiktoken или proxy-tokenizer; допуск +/- 10% на размер чанка |
| Large files (>10MB) вызывают OOM | Low | Medium | Streaming read, ограничение размера документа (configurable, default 10MB) |
| Duplicate ingestion | Medium | Low | Checksum-based dedup; error на duplicate path |
| Embedding provider недоступен | Medium | Medium | Graceful degradation: store chunks без embeddings, embed позже |

---

## Notes

1. Knowledge Base полностью зависит от Memory System (F-005) -- использует EmbeddingProvider и VectorStorage интерфейсы
2. PDF parsing через pdf-parse (pure JS npm package) -- не требует внешних процессов
3. Для chunking используется token-based splitting (tiktoken или proxy-tokenizer), а не character-based
4. Source attribution критически важен для RAG -- каждые search results должны содержать ссылку на source document
5. Knowledge base shared между всеми чатами (нет привязки к конкретному chat_id)
6. Форматы MVP: txt, md, pdf. Расширение на docx, html -- V1

---

**Версия документа:** v1.0
**Дата создания:** 2026-03-30
**Автор:** TDD Planner Agent
**Статус:** Завершён
