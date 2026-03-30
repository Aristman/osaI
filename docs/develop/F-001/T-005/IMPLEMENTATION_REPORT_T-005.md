# Implementation Report -- T-005: SQLite Initialization + Core Schema

## Implemented Scope

Реализована инициализация SQLite БД с WAL mode, PRAGMA конфигурацией, core-таблицами и фреймворком миграций. Все компоненты размещены в `packages/shared/src/`, так как SQLite используется несколькими доменами (DOMAIN-001, DOMAIN-010).

**In scope (реализовано):**
- DatabaseManager -- singleton инициализация better-sqlite3
- WAL mode, foreign_keys, busy_timeout, synchronous, cache_size PRAGMA
- Путь БД: `~/.osai/data/osai.db` (по умолчанию)
- Core таблицы: chats, chat_messages, sessions, osai_audit_log
- Indexes для chat_messages, sessions, osai_audit_log
- Migration framework с версионированием (_schema_version)
- Barrel export из packages/shared/src/index.ts

**Out scope (не реализовано):**
- CRUD для чатов (F-009)
- Audit log service (F-003)
- sqlite-vec (F-005)

## Tests Implemented

### database.test.ts -- 18 tests

| Test ID | Description | Status |
|---------|-------------|--------|
| TT-005-01 | WAL mode verification (PRAGMA journal_mode = 'wal') | PASS |
| TT-005-02 | DB file created at specified path | PASS |
| TT-005-04 | Foreign keys enabled (PRAGMA foreign_keys = 1) | PASS |
| TT-005-06 | Idempotent init -- no throw on repeated calls | PASS |
| TT-005-06 | Idempotent init -- data preserved | PASS |
| Singleton | Same connection returned from getDb() | PASS |
| Singleton | getDb() throws before initialize | PASS |
| Singleton | close() releases connection | PASS |
| TT-005-03 | Table: chats created | PASS |
| TT-005-03 | Table: chat_messages created | PASS |
| TT-005-03 | Table: sessions created | PASS |
| TT-005-03 | Table: osai_audit_log created | PASS |
| TT-005-05 | Index idx_chat_messages_chat_id_created_at created | PASS |
| TT-005-07 | _schema_version table created | PASS |
| TT-005-07 | Migration version recorded | PASS |
| TT-005-07 | No re-apply on already applied migrations | PASS |
| TT-005-08 | No string interpolation in migration SQL | PASS |
| TT-005-08 | Parameterized INSERT for migration records | PASS |

### schema.test.ts -- 43 tests

| Category | Count | Status |
|----------|-------|--------|
| MIGRATION_001 executes without errors | 1 | PASS |
| All core tables created | 4 | PASS |
| chats table columns (11 columns) | 11 | PASS |
| chat_messages table columns (7 columns) | 7 | PASS |
| sessions table columns (8 columns) | 8 | PASS |
| osai_audit_log table columns (12 columns) | 12 | PASS |
| Foreign key: chat_messages -> chats | 1 | PASS |
| Foreign key: sessions -> chats | 1 | PASS |
| CORE_TABLE_NAMES contains all 4 tables | 1 | PASS |

**Total: 61 tests, all passing.**

## Code Changes

### Files Added

| File | Description |
|------|-------------|
| `packages/shared/src/database.ts` | DatabaseManager class -- singleton, WAL mode, PRAGMA |
| `packages/shared/src/schema.ts` | SQL DDL для core таблиц и indexes |
| `packages/shared/src/migrations.ts` | Migration runner с версионированием |
| `packages/shared/src/database.test.ts` | 18 unit tests для DatabaseManager + migrations |
| `packages/shared/src/schema.test.ts` | 43 unit tests для SQL schema |
| `docs/develop/F-001/T-005/IMPLEMENTATION_REPORT_T-005.md` | Данный отчёт |

### Files Modified

| File | Change |
|------|--------|
| `packages/shared/src/index.ts` | Barrel exports: DatabaseManager, schema, migrations |
| `packages/shared/package.json` | Added dependencies: better-sqlite3, @types/better-sqlite3 |

## Architectural Compliance

- **Единая БД (AD-008):** DatabaseManager -- singleton на процесс, один файл osai.db
- **WAL mode (AD-007):** journal_mode = WAL настроен в initialize()
- **Параметризованные запросы (TT-005-08):** recordMigration использует `?` placeholders; DDL без параметризации (стандартный SQLite pattern)
- **Foreign keys:** Включены через PRAGMA; FK constraints для chat_messages и sessions на chats
- **ESM modules:** Все импорты через .js extension, type: "module" в package.json
- **TypeScript strict mode:** Нет `any`, строгая типизация
- **Idempotency:** CREATE TABLE IF NOT EXISTS, CREATE INDEX IF NOT EXISTS, INSERT OR IGNORE для версий

## Deviations

Нет отклонений от roadmap.

## Known Limitations

1. `DatabaseManager.initialize()` не запускает миграции автоматически -- требуется отдельный вызов `runMigrations(db)`. Это намеренное разделение ответственности: DatabaseManager управляет соединением, а миграции запускаются явно при старте приложения.
2. better-sqlite3 -- синхронный API (by design). Это соответствует архитектурному решению modular monolith, где БД доступна только в основном потоке.
3. На Windows может потребоваться Visual C++ Build Tools для сборки better-sqlite3 из source (prebuild binaries покрывают большинство случаев).
