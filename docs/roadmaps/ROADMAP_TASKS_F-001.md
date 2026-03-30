# Task Roadmap: Core Infrastructure (F-001)

**Version:** v1.0
**Date:** 2026-03-30
**Author:** TDD Planner Agent
**Status:** Active

---

## 1. Feature Overview

- **Feature ID:** F-001
- **Feature Name:** Core Infrastructure
- **Description:** Базовая инфраструктура monorepo: pnpm workspace, shared TypeScript конфигурация, структура пакетов, osai.json конфигурация, директория ~/.osai/, SQLite инициализация (WAL mode, единая БД osai.db), загрузчик конфигурации
- **Related Requirements:** FR-024 (Structured Logging -- pino setup), FR-025 (Configuration)
- **Domain:** DOMAIN-001 (Gateway -- shared), DOMAIN-010 (Observability -- shared)
- **Agent Profile:** backend/AGENT_PROFILE_nodejs.md + backend/AGENT_PROFILE_backend-base.md
- **Git branch:** feature/core-infrastructure

---

## 2. Dependencies

### 2.1 Feature Dependencies

**None** -- F-001 является корневой фичей (Level 0), от неё зависят все остальные.

### 2.2 Task Dependencies

```
T-001 (pnpm workspace + tsconfig)
  |
  +---> T-002 (package scaffolding) -- параллельно с T-003, T-004
  +---> T-003 (~/.osai/ directory structure) -- параллельно с T-002, T-004
  +---> T-004 (pino logger setup) -- параллельно с T-002, T-003
  |
  +---> T-005 (SQLite init + schema) -- зависит от T-001
  +---> T-006 (osai.json config loader) -- зависит от T-003, T-004
```

### 2.3 Development Order

- **Wave 1 (parallel):** T-001
- **Wave 2 (parallel, max 3):** T-002, T-003, T-004
- **Wave 3 (parallel):** T-005, T-006

---

## 3. Task Breakdown

### Task T-001: pnpm Workspace + Shared TypeScript Configuration

**Domain:** DOMAIN-001, DOMAIN-010 (shared) | **Dependencies:** None
**Estimated Time:** 2-3 hours

**Description:**
Инициализация pnpm workspace monorepo, создание shared TypeScript конфигурации в strict mode, настройка ESLint базового конфига.

**Scope:**
- **In scope:** pnpm-workspace.yaml, root package.json, root tsconfig.json (strict), base tsconfig for packages, vitest.config.ts (base), ESLint config, .gitignore обновление
- **Out scope:** Package-specific tsconfig (в T-002), CI/CD, husky pre-commit hooks

---

### Task T-002: Package Scaffolding

**Domain:** DOMAIN-001, DOMAIN-010 (shared) | **Dependencies:** T-001
**Estimated Time:** 2-3 hours

**Description:**
Создание скелета всех packages из архитектуры: gateway, agent, skills-core, skills-osai, providers, memory, knowledge-base, os-integration, voice, observability, cli. Каждый package содержит минимальные package.json и tsconfig.json.

**Scope:**
- **In scope:** 11 packages с package.json + tsconfig.json + src/index.ts (barrel export), packages/shared (shared types и утилиты)
- **Out scope:** Реализация внутри пакетов, tests/ директория (в T-003), dependencies версий (минимальные: name, version, main, types)

---

### Task T-003: ~/.osai/ Directory Structure + Init Command

**Domain:** DOMAIN-001 (shared) | **Dependencies:** T-001
**Estimated Time:** 2-3 hours

**Description:**
Создание модуля инициализации директории ~/.osai/ со стандартной структурой (data/, logs/, channels/telegram/session/, workspace/skills/). Команда `osai init` для первичной настройки. Создание osai.json.example с полной конфигурацией по умолчанию.

**Scope:**
- **In scope:** init module (создание ~/.osai/ структуры), osai.json.example, permissions 600 для конфига (NFR-S03), tests/ директория в корне
- **Out scope:** Config loader logic (T-006), `osai config` command (F-011)

---

### Task T-004: pino Logger Setup

**Domain:** DOMAIN-010 | **Dependencies:** T-001
**Estimated Time:** 2 hours

**Description:**
Настройка pino structured JSON logging как shared модуль. Logger с поддержкой уровней (error, warn, info, debug, trace), correlation IDs (trace_id), вывод в stdout + файл (~/.osai/logs/). Создание child logger factory для модулей.

**Scope:**
- **In scope:** packages/observability/src/logger.ts, LoggerFactory (create module-specific child logger), file transport в ~/.osai/logs/, correlation ID propagation, base logger configuration
- **Out scope:** Audit logging (F-003), OpenTelemetry (V1), pino-child для specific modules

---

### Task T-005: SQLite Initialization + Core Schema

**Domain:** DOMAIN-001 (shared) | **Dependencies:** T-001
**Estimated Time:** 3-4 hours

**Description:**
Инициализация единой SQLite БД (~/.osai/data/osai.db) в WAL mode через better-sqlite3. Создание core таблиц: chats, chat_messages, sessions, osai_audit_log (подготовка для F-003). Параметризованные запросы, PRAGMA настройки (foreign_keys, journal_mode=WAL).

**Scope:**
- **In scope:** packages/shared/src/db.ts (Database singleton), WAL mode, PRAGMA конфигурация, таблицы: chats, chat_messages, sessions, osai_audit_log, indexes, migration framework (версионирование схемы)
- **Out scope:** CRUD для чатов (F-009), audit log service (F-003), sqlite-vec (F-005)

---

### Task T-006: osai.json Configuration Loader

**Domain:** DOMAIN-001 (shared) | **Dependencies:** T-003, T-004
**Estimated Time:** 2-3 hours

**Description:**
Модуль загрузки и валидации конфигурации из ~/.osai/osai.json. Zod-схема для валидации всех секций (agent, providers, memory, channels, security, skills, voice). Merge с defaults при отсутствии ключей. LoadConfig + GetConfig + ReloadConfig API.

**Scope:**
- **In scope:** packages/shared/src/config.ts, Zod schema для osai.json (все секции из ARCHITECTURE_OVERVIEW), default values, merge strategy, error messages при невалидной конфигурации, reload capability
- **Out scope:** Config mutation (write), env variable substitution, `osai config` CLI command

---

## 4. Test Strategy (TDD)

### 4.1 Test Types per Task

| Task | Unit Tests | Integration Tests | Build + Run |
|------|-----------|-------------------|-------------|
| T-001 | tsconfig валидация, workspace resolution | pnpm install across packages | `pnpm install && pnpm build` |
| T-002 | barrel export каждого package | cross-package import resolution | `pnpm build` |
| T-003 | init module (dir creation, file permissions) | `osai init` end-to-end | `pnpm build` |
| T-004 | logger output format, log levels, child logger | file transport writes to ~/.osai/logs/ | `pnpm build` |
| T-005 | DB init, WAL mode, table creation, PRAGMA | real SQLite file creation + read | `pnpm build` |
| T-006 | config load, Zod validation, defaults merge, errors | load from real osai.json file | `pnpm build` |

### 4.2 Build and Run Verification

**Build Verification:**
```bash
pnpm install          # Установка зависимостей workspace
pnpm build            # Сборка всех packages (tsc)
```

**Ожидаемый результат:**
- exit code 0
- dist/ директория в каждом package
- Нет TypeScript ошибок (strict mode)

**Run Verification:**
```bash
pnpm test             # Запуск всех тестов (vitest)
```

**Ожидаемый результат:**
- Все unit тесты проходят (green)
- Нет flaky тестов
- Coverage > 80% для modules

### 4.3 Test Cases per Task

---

#### T-001 Tests

| ID | Description | Preconditions | Expected Result | Pass Criteria |
|----|-------------|---------------|-----------------|---------------|
| TT-001-01 | pnpm workspace разрешает packages/* | pnpm-workspace.yaml существует | `pnpm ls --depth 0` показывает все packages | Все 11 packages + shared видны |
| TT-001-02 | Root tsconfig.json содержит strict: true | Файл создан | tsc --showConfig в корне | strict=true, noImplicitAny, strictNullChecks включены |
| TT-001-03 | Base package tsconfig расширяет root | packages/gateway/tsconfig.json | extends "../../tsconfig.base.json" | Компиляция без ошибок при правильном коде |
| TT-001-04 | ESLint конфигурация применяется | .eslintrc создан | eslint packages/*/src/**/*.ts | Нет ошибок на валидном коде |
| TT-001-05 | Vitest конфигурация работает | vitest.config.ts создан | vitest run | Тесты обнаруживаются и запускаются |

---

#### T-002 Tests

| ID | Description | Preconditions | Expected Result | Pass Criteria |
|----|-------------|---------------|-----------------|---------------|
| TT-002-01 | Каждый package имеет package.json | T-001 завершён | 12 директорий с package.json | gateway, agent, skills-core, skills-osai, providers, memory, knowledge-base, os-integration, voice, observability, cli, shared |
| TT-002-02 | Barrel export каждого package компилируется | tsconfig настроен | tsc компилирует packages/*/src/index.ts | Нет ошибок компиляции |
| TT-002-03 | Cross-package import работает | packages собраны | import { Logger } from '@osai/observability' из gateway | Резолвится корректно |
| TT-002-04 | pnpm build собирает все packages | packages/*/src/index.ts существуют | pnpm build exit code 0 | dist/ в каждом package |

---

#### T-003 Tests

| ID | Description | Preconditions | Expected Result | Pass Criteria |
|----|-------------|---------------|-----------------|---------------|
| TT-003-01 | init создаст ~/.osai/ структуру | HOME директория доступна | ~/.osai/data/, ~/.osai/logs/, ~/.osai/channels/telegram/session/, ~/.osai/workspace/skills/ существуют | Все директории созданы |
| TT-003-02 | init копирует osai.json.example | osai.json.example существует | ~/.osai/osai.json создан | Файл существует и валиден JSON |
| TT-003-03 | osai.json имеет права 600 | init выполнен | fs.statSync().mode === 0o600 | Права owner read/write only |
| TT-003-04 | init не перезаписывает существующий ~/.osai/ | ~/.osai/osai.json уже существует | Существующий файл не затёрт | Файл без изменений |
| TT-003-05 | tests/ директория создана в корне | Корень проекта существует | tests/unit/, tests/integration/, tests/e2e/ | Директории существуют |

---

#### T-004 Tests

| ID | Description | Preconditions | Expected Result | Pass Criteria |
|----|-------------|---------------|-----------------|---------------|
| TT-004-01 | Logger создаёт structured JSON output | pino установлен | log entry содержит: timestamp, level, message | JSON формат с полями |
| TT-004-02 | Logger поддерживает все уровни | Logger инициализирован | error, warn, info, debug, trace работают | Каждый уровень логируется |
| TT-004-03 | Child logger наследит настройки | Parent logger создан | child logger содержит module field | module = имя модуля |
| TT-004-04 | Correlation ID передаётся в логи | trace_id задан | log entry содержит trace_id | Поле trace_id в JSON output |
| TT-004-05 | File transport пишет в ~/.osai/logs/ | Logger с file transport | Файл osai.log создаётся в ~/.osai/logs/ | Файл содержит JSON логи |
| TT-004-06 | LoggerFactory создаёт уникальные child loggers | LoggerFactory.create('module') | Разные module в каждом child | Уникальные module поля |

---

#### T-005 Tests

| ID | Description | Preconditions | Expected Result | Pass Criteria |
|----|-------------|---------------|-----------------|---------------|
| TT-005-01 | SQLite БД создаётся в WAL mode | better-sqlite3 установлен | PRAGMA journal_mode = 'wal' | Результат запроса = 'wal' |
| TT-005-02 | БД создаётся по пути ~/.osai/data/osai.db | ~/.osai/data/ существует | Файл osai.db создан | fs.existsSync возвращает true |
| TT-005-03 | Core таблицы создаются корректно | initDatabase() вызван | tables: chats, chat_messages, sessions, osai_audit_log | PRAGMA table_info возвращает columns |
| TT-005-04 | Foreign keys включены | PRAGMA foreign_keys | Result = 1 | FK constraints работают |
| TT-005-05 | Indexes создаются | initDatabase() вызван | Index на chat_messages(chat_id, created_at) | EXPLAIN INDEX работает |
| TT-005-06 | Idempotent init (повторный вызов не падает) | БД уже инициализирована | initDatabase() второй раз succeeds | Нет ошибки, данные не теряются |
| TT-005-07 | Migration framework версионирует схему | _schema_version таблица | INSERT текущей версии | Version записана в таблицу |
| TT-005-08 | Параметризованные запросы используются | DB module | Никаких string concatenation в SQL queries | Code review / static analysis |

---

#### T-006 Tests

| ID | Description | Preconditions | Expected Result | Pass Criteria |
|----|-------------|---------------|-----------------|---------------|
| TT-006-01 | Config загружается из ~/.osai/osai.json | Файл существует и валиден | loadConfig() возвращает конфиг объект | Все секции распознаны |
| TT-006-02 | Defaults применяются при отсутствии ключей | osai.json с частичной конфигурацией | Отсутствующие ключи = default values | agent.model = default, circuitBreaker thresholds = defaults |
| TT-006-03 | Zod валидация отклоняет невалидный JSON | osai.json с неверным типом | Бросается ошибка с описанием проблемы | Error message содержит path и expected type |
| TT-006-04 | Config reload работает | Config уже загружен, файл изменён | reloadConfig() перечитывает файл | Новые значения отражены |
| TT-006-05 | LoadConfig бросает понятную ошибку при отсутствии файла | ~/.osai/osai.json не существует | Error с сообщением "run osai init" | Подсказка пользователю |
| TT-006-06 | Все секции из ARCHITECTURE_OVERVIEW покрыты схемой | Zod schema полная | agent, providers, memory, channels, security, skills, voice | Каждая секция валидируется |

---

## 5. Implementation Plan per Task

### T-001: pnpm Workspace + Shared TypeScript Configuration
1. Создать `pnpm-workspace.yaml` с `packages/*`
2. Создать root `package.json` (name, private, scripts, engines: node>=22.16)
3. Создать `tsconfig.json` (root, strict mode, path aliases)
4. Создать `tsconfig.base.json` (базовый для packages, extends root)
5. Создать `vitest.config.ts` (root, shared config)
6. Создать `.eslintrc.json` (базовый, TypeScript правила)
7. Обновить `.gitignore` (dist/, node_modules/, ~/.osai/)

**Constraints:** strict: true обязательно (NFR-M01), ESM modules только

### T-002: Package Scaffolding
1. Создать структуру для 11 packages + shared по ARCHITECTURE_OVERVIEW
2. Для каждого package: package.json (name: @osai/<name>, version, main, types, scripts)
3. Для каждого package: tsconfig.json (extends ../../tsconfig.base.json)
4. Создать src/index.ts barrel export для каждого package
5. Настроить workspace references в package.json (dependencies между packages)

**Constraints:** Имена пакетов @osai/*, минимальные cross-dependencies

### T-003: ~/.osai/ Directory Structure + Init Command
1. Создать packages/shared/src/init.ts (createDirectories, copyConfigTemplate)
2. Определить структуру: data/, logs/, channels/telegram/session/, workspace/skills/
3. Создать osai.json.example (полная конфигурация из ARCHITECTURE_OVERVIEW)
4. Реализовать permission 600 для osai.json (NFR-S03)
5. Создать tests/ директорию (unit/, integration/, e2e/)
6. Idempotent: не перезаписывать существующие файлы

**Constraints:** Кроссплатформенность (Linux + Windows), path resolution через os.homedir()

### T-004: pino Logger Setup
1. Создать packages/observability/src/logger.ts
2. Настроить pino с structured JSON output
3. Реализовать LoggerFactory.create(moduleName) с child logger
4. Добавить correlation ID (trace_id) через pino child binding
5. Настроить pino file transport для ~/.osai/logs/osai.log
6. Экспортировать из packages/observability/src/index.ts

**Constraints:** pino JSON format (NFR-O01), correlation IDs, file + stdout

### T-005: SQLite Initialization + Core Schema
1. Создать packages/shared/src/db.ts (Database class / singleton)
2. Настроить better-sqlite3: WAL mode, foreign_keys, busy_timeout
3. Определить SQL для core таблиц (chats, chat_messages, sessions, osai_audit_log)
4. Реализовать initDatabase() с CREATE TABLE IF NOT EXISTS
5. Создать indexes (chat_messages: chat_id + created_at)
6. Реализовать примитивный migration framework (_schema_version table)

**Constraints:** Единственная БД osai.db (AD-008), WAL mode (AD-007), параметризованные запросы

### T-006: osai.json Configuration Loader
1. Создать packages/shared/src/config.ts
2. Определить Zod schema для всех секций конфигурации
3. Реализовать loadConfig(): read file -> parse JSON -> validate with Zod -> merge with defaults
4. Реализовать getConfig(): возвращает загруженную конфигурацию (cached)
5. Реализовать reloadConfig(): перечитывает файл и обновляет кэш
6. Валидация: понятные error messages при невалидной конфигурации

**Constraints:** Zod для валидации, defaults из ARCHITECTURE_OVERVIEW, fail fast на невалидной конфигурации

---

## 6. Acceptance Criteria per Task

### T-001
- [x] `pnpm install` выполняется без ошибок
- [x] `pnpm ls --depth 0` показывает все workspace packages
- [x] Root tsconfig.json содержит `"strict": true`
- [x] Vitest запускается и обнаруживает тесты

### T-002
- [x] 11 packages + shared созданы с package.json
- [x] `pnpm build` собирает все packages без ошибок
- [x] Cross-package imports резолвятся корректно
- [x] Barrel exports компилируются

### T-003
- [x] `osai init` создаёт ~/.osai/ со стандартной структурой
- [x] osai.json.example содержит полную конфигурацию
- [x] osai.json имеет права 600 после создания
- [x] Повторный вызов init не перезаписывает данные

### T-004
- [x] pino logger создаёт structured JSON output
- [x] Все уровни логирования работают (error, warn, info, debug, trace)
- [x] Child logger factory создаёт loggers с module field
- [x] File transport пишет в ~/.osai/logs/osai.log
- [x] Correlation ID (trace_id) присутствует в log entries

### T-005
- [x] SQLite БД создаётся в ~/.osai/data/osai.db в WAL mode
- [x] Все core таблицы существуют (chats, chat_messages, sessions, osai_audit_log)
- [x] Foreign keys включены
- [x] Indexes созданы для chat_messages
- [x] Init idempotent (повторный вызов безопасен)
- [x] Migration version записана

### T-006
- [x] Config загружается из ~/.osai/osai.json
- [x] Zod валидация работает для всех секций
- [x] Defaults корректно применяются
- [x] Понятные ошибки при невалидной конфигурации
- [x] Reload capability работает

---

## 7. Quality Expectations

- **TypeScript strict mode** -- обязательно для всех файлов (NFR-M01)
- **Test coverage** -- > 80% для каждого модуля
- **ESLint** -- zero errors на `pnpm lint`
- **Build stability** -- `pnpm build` всегда exit code 0
- **Test speed** -- все unit тесты < 10s
- **No console.log** -- использовать pino logger (profile constraint)
- **No any type** -- без веских оснований (profile constraint)

---

## 8. Risks and Edge Cases

| Risk | Impact | Mitigation |
|------|--------|------------|
| better-sqlite3 native module не собирается на Windows | High | Prebuild binaries, CI на Windows, fallback: delay T-005 |
| pino file transport не создаёт ~/.osai/logs/ директорию | Medium | init (T-003) создаёт директорию раньше T-004 |
| Zod schema не покрывает все поля конфигурации | Low | Схема основана на ARCHITECTURE_OVERVIEW (авторитетный источник) |
| WAL mode не работает на NFS/сетевых FS | Low | osaI -- local-first, FS на локальной машине |
| ~/.osai/ путь занят другой версией osaI | Medium | Version check в init, warning при существующей БД |
| Permissions 600 не работает на Windows NTFS | Medium | Windows ACL fallback (icacls) |

---

## 9. Notes

1. **PROFILE ADAPTATION:** Стандартный nodejs profile предполагает Express/Fastify структуру. osaI -- не HTTP-сервер, поэтому структура src/config, src/services, src/repositories адаптирована под monorepo packages.
2. **NAMING:** В архитектуре используется `openclaw.json` для совместимости, но фактическое имя файла -- `osai.json` (как в ARCHITECTURE_OVERVIEW). Сохранена обратная совместимость: init проверяет оба имени.
3. **DATABASE SINGLETON:** Единственный экземпляр better-sqlite3 Database на процесс (синхронный API). Это соответствует modular monolith pattern.
4. **ZOD SCHEMA VERSIONING:** Schema в T-006 должна соответствовать osai.json.example из T-003. Изменения в schema требуют обновления example.
5. **ESM ONLY:** Проект использует только ES Modules. Все imports/exports через ESM синтаксис. CommonJS запрещён (profile constraint).
