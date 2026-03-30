# Implementation Report -- T-003

## Implemented Scope

Реализован SQLite schema для Knowledge Base (F-006, DOMAIN-005):

- **schema.ts** -- DDL для таблиц `knowledge_documents` и `knowledge_chunks` с индексами, FOREIGN KEY ON DELETE CASCADE
- **repository.ts** -- KnowledgeRepository: полный CRUD для документов и чанков
- **db/index.ts** -- barrel export модуля db
- **Unit тесты** -- 19 тестов покрывающие все TC-003-1 .. TC-003-6 из roadmap

Реализация строго в рамках scope T-003.

## Tests Implemented

| ID | Описание | Результат |
|----|----------|-----------|
| TC-003-1 | Tables created on init (knowledge_documents + knowledge_chunks) | pass |
| TC-003-1 ext | Indexes created on init (3 indexes) | pass |
| TC-003-1 ext | Foreign key constraint on knowledge_chunks.document_id | pass |
| TC-003-1 ext | UNIQUE constraint on knowledge_documents.path | pass |
| TC-003-2 | Init is idempotent (no error on second init) | pass |
| TC-003-2 ext | Third init also succeeds | pass |
| TC-003-3 | Insert and retrieve document | pass |
| TC-003-3 ext | getDocument returns null for nonexistent id | pass |
| TC-003-3 ext | Update document fields correctly | pass |
| TC-003-4 | Delete document cascades chunks (5 chunks) | pass |
| TC-003-5 | List documents with tag filter (3 docs, 2 with tag) | pass |
| TC-003-5 ext | List filtered by format | pass |
| TC-003-5 ext | List filtered by status | pass |
| TC-003-6 | Insert chunk links to document | pass |
| TC-003-6 ext | getChunksByDocument returns empty for nonexistent doc | pass |
| Extension | deleteChunksByDocument removes all chunks | pass |
| Extension | deleteChunksByDocument returns 0 for nonexistent doc | pass |
| Extension | Chunks ordered by chunkIndex ASC | pass |
| Extension | insertDocument applies default values correctly | pass |

**Total: 19 tests, all passing.**

## Code Changes

### Files added
- `packages/knowledge-base/src/db/schema.ts` -- DDL (CREATE TABLE IF NOT EXISTS, CREATE INDEX IF NOT EXISTS)
- `packages/knowledge-base/src/db/repository.ts` -- KnowledgeRepository class (CRUD operations)
- `packages/knowledge-base/src/db/index.ts` -- barrel export for db module
- `packages/knowledge-base/src/__tests__/db/schema.test.ts` -- schema unit tests (6 tests)
- `packages/knowledge-base/src/__tests__/db/repository.test.ts` -- repository unit tests (13 tests)
- `docs/develop/F-006/T-003/IMPLEMENTATION_REPORT_T-003.md` -- данный report

### Files modified
- `packages/knowledge-base/package.json` -- добавлены зависимости better-sqlite3, @types/better-sqlite3

### Schema details

**knowledge_documents:**
| Column | Type | Constraints |
|--------|------|-------------|
| id | TEXT | PRIMARY KEY |
| title | TEXT | NOT NULL |
| path | TEXT | UNIQUE, NOT NULL |
| format | TEXT | NOT NULL |
| status | TEXT | NOT NULL, DEFAULT 'pending' |
| chunks_count | INTEGER | NOT NULL, DEFAULT 0 |
| total_size | INTEGER | NOT NULL, DEFAULT 0 |
| tags | TEXT | DEFAULT '[]' (JSON array) |
| created_at | INTEGER | NOT NULL (Unix timestamp) |
| updated_at | INTEGER | NOT NULL (Unix timestamp) |
| checksum | TEXT | nullable |

**knowledge_chunks:**
| Column | Type | Constraints |
|--------|------|-------------|
| id | TEXT | PRIMARY KEY |
| document_id | TEXT | NOT NULL, FK -> knowledge_documents(id) ON DELETE CASCADE |
| content | TEXT | NOT NULL |
| chunk_index | INTEGER | NOT NULL |
| created_at | INTEGER | NOT NULL (Unix timestamp) |

**Indexes:**
- `idx_knowledge_chunks_document_id` ON knowledge_chunks(document_id)
- `idx_knowledge_documents_format` ON knowledge_documents(format)
- `idx_knowledge_documents_status` ON knowledge_documents(status)

## Architectural Compliance

- **Синхронный API:** KnowledgeRepository использует синхронный better-sqlite3 API (как в packages/memory)
- **Parameterized queries:** все SQL запросы используют `?` placeholders (TT-005-08, backend-base security)
- **Idempotent schema:** CREATE TABLE IF NOT EXISTS / CREATE INDEX IF NOT EXISTS (как в memory schema)
- **FOREIGN KEY ON DELETE CASCADE:** автоматическое удаление чанков при удалении документа
- **Type imports:** repository импортирует типы из types/index.js (T-001)
- **in-memory SQLite для тестов:** :memory: с foreign_keys = ON (как в memory tests)
- **Barrel exports:** db/index.ts экспортирует KnowledgeRepository, KB_SCHEMA_SQL, KB_SCHEMA_VERSION, KB_TABLE_NAMES

## Deviations

- **db/index.ts** -- не реэкспортирует типы (KnowledgeDocument, InsertKnowledgeDocument и т.д.) из repository.ts, т.к. repository.ts импортирует их через `import type` из types/index.js. Типы доступны через основной barrel export `src/index.ts`. Это принятое решение, аналогичное подходу packages/memory/src/db/index.ts.

## Known Limitations

- **Tag filtering** использует SQLite json_each() -- это работает корректно, но для больших таблиц может быть неэффективно. Для MVP это приемлемо.
- **listDocuments ordering** по created_at DESC -- при одинаковых created_at порядок не определён. Для production может потребоваться вторичный критерий сортировки.
