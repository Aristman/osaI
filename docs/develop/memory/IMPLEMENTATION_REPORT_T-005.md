# Implementation Report -- T-005: SQLite Schema for Memory Entries

## Implemented Scope

Реализован модуль `db/` пакета `@osai/memory` (DOMAIN-004) для SQLite хранилища трёхуровневой памяти:

- SQL schema для 3 таблиц: `memory_entries`, `chat_memory`, `session_memory`
- Индексы для `tier`, `chat_id`, `session_id`, `created_at`, `entry_id`
- `MemoryRepository` с CRUD операциями: `store`, `findById`, `findByChat`, `findBySession`, `findLongTerm`, `delete`, `searchByTags`
- Idempotent schema initialization (CREATE TABLE IF NOT EXISTS, CREATE INDEX IF NOT EXISTS)
- Barrel export через `db/index.ts`

**Строго в рамках scope T-005.** Не затрагивает RAG pipeline, embedding generation.

## Tests Implemented

| TC | Описание | Результат |
|----|----------|-----------|
| TC-001 | store() сохраняет MemoryEntry в таблицу memory_entries | PASS |
| TC-002 | findById() возвращает запись по id или null | PASS |
| TC-003 | findByChat() возвращает все записи для chat_id | PASS |
| TC-004 | findBySession() возвращает все записи для session_id | PASS |
| TC-005 | findLongTerm() возвращает записи tier='long-term' | PASS |
| TC-006 | delete() удаляет запись по id | PASS |
| TC-007 | searchByTags() фильтрует записи по тегам (JSON contains) | PASS |
| TC-008 | Schema migration idempotent (повторный вызов не ошибается) | PASS |

8/8 test cases пройдены. In-memory SQLite для изоляции тестов.

## Code Changes

### Files Added

- `packages/memory/src/db/schema.ts` -- SQL schema для 3 таблиц + 8 индексов
- `packages/memory/src/db/memory-repository.ts` -- MemoryRepository класс с CRUD
- `packages/memory/src/db/index.ts` -- barrel export модуля db
- `packages/memory/src/__tests__/db/memory-repository.test.ts` -- 8 unit tests

### Files Modified

- `packages/memory/package.json` -- добавлены зависимости: `better-sqlite3`, `@types/better-sqlite3`, `@osai/shared`

### Files NOT Modified

- `packages/memory/src/index.ts` -- не перезаписан (может быть обновлён другим агентом)

## Architectural Compliance

- **Layered architecture:** MemoryRepository изолирует data access от business logic (профиль backend-base)
- **Parameterized queries:** все SQL запросы используют `?` placeholder (безопасность от SQL injection)
- **Synchronous API:** better-sqlite3 синхронный API, как в остальном проекте (DatabaseManager, schema.ts)
- **Idempotent schema:** CREATE TABLE IF NOT EXISTS / CREATE INDEX IF NOT EXISTS
- **TypeScript strict mode:** компиляция без ошибок, 0 `any` типов
- **In-memory SQLite для тестов:** изоляция без внешних зависимостей
- **JSON storage:** tags и metadata хранятся как JSON TEXT (совместимо с SQLite без JSON1 extension dependency)

## Design Decisions

1. **Единая таблица memory_entries с chat_memory/session_memory как денормализация** -- chat_memory и session_memory содержат Foreign Key на memory_entries с CASCADE для автоматической очистки при удалении.

2. **searchByTags использует json_each()** -- нативная SQLite функция для разбора JSON массивов. Не требует sqlite-vec или внешних extensions.

3. **MemoryRepository принимает Database.Database напрямую** -- не зависит от DatabaseManager, что позволяет использовать in-memory SQLite для тестов без overhead singleton.

4. **MEMORY_MIGRATION_VERSION = 2** -- следующая после core migration (version 1). Предназначена для интеграции в общий migration runner из `@osai/shared`.

## Deviations

Нет отклонений от roadmap.

## Known Limitations

- `searchByTags` использует OR логику для нескольких тегов (returns entries matching ANY tag). Если потребуется AND логика, потребуется доработка.
- chat_memory/session_memory таблицы заполняются только при store() с соответствующим tier. Запросы findByChat/findBySession работают напрямую через memory_entries (не через materialized tables), что является достаточным для текущей задачи.
