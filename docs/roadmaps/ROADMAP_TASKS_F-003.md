# Task Roadmap: Configuration System (F-003)

**Version:** v1.0
**Generated:** 2026-03-24
**Author:** TDD Planner Agent
**Status:** Ready for implementation
**Traceability:** FEATURES_INDEX.md v1.0, ARCHITECTURE_OVERVIEW.md v1.0, PROJECT_PROFILE.md v1.0

---

## 1. Feature Overview

- **Feature ID:** F-003
- **Feature Name:** Configuration System
- **Feature Description:** Управление конфигурацией osaI: чтение/валидация `~/.osai/openclaw.json`, schema definition (gateway, model, session, skills, security, memory, observability секции), defaults, hot-reload, directory structure initialization (`~/.osai/` layout).
- **Related Requirements:** FR-064-FR-066, NFR-013, NFR-021, NFR-024, NFR-037
- **Domain:** cross-cutting (используется всеми пакетами)
- **Git branch:** feature/configuration-system
- **Priority:** Must Have (MVP)

---

## 2. Dependencies

### 2.1 Feature Dependencies

Данная фича зависит от:

- **F-001: Monorepo Infrastructure** (blocking) — требуется структура monorepo, shared types, tsconfig

**Зависимые фичи (от F-003):**

- F-004 Agent Runtime — читает секции model, session, skills
- F-006 Memory System — читает секцию memory
- F-009 Security Foundation — читает секцию security
- F-010 Observability — читает секцию observability
- F-012 CLI Client — использует config API для `osai init`, config show/edit

### 2.2 Task Dependencies

Внутренние зависимости задач:

```
T-001 (Schema) ──┬──> T-002 (Loader)
                 │
                 └──> T-003 (Directory Init)

T-002 (Loader) ──────> T-004 (Hot-Reload)
```

- **Task T-001:** Не имеет зависимостей (может начинаться параллельно)
- **Task T-002:** Зависит от T-001 (blocking) — требуется schema для валидации
- **Task T-003:** Зависит от T-001 (blocking) — требуется schema для определения layout
- **Task T-004:** Зависит от T-002 (blocking) — требуется loader для notify subscribers

### 2.3 Development Order

**Параллельное выполнение:**
- T-001 (Schema) выполняется первым
- T-002 (Loader) и T-003 (Directory Init) могут разрабатываться параллельно после завершения T-001
- T-004 (Hot-Reload) выполняется после T-002

**Критический путь:** T-001 → T-002 → T-004

---

## 3. Task Breakdown

### Task T-001: Configuration Schema Definition

**Description:**
Определение полной JSON Schema для конфигурационного файла `openclaw.json`. Схема включает все секции: gateway, model, session, skills, security, memory, observability. Каждая секция имеет defaults и validation rules.

**Estimated Time:** 3-4 hours

**Dependencies:** None

**Scope:**
- **In scope:**
  - TypeScript interfaces для всех секций конфигурации
  - JSON Schema definition (для runtime валидации)
  - Default values для всех опциональных полей
  - Type guards для type-safe доступа к секциям
  - Экспорт типов из `packages/types` или отдельного `packages/config`

- **Out scope:**
  - Загрузка и валидация файла (T-002)
  - Создание директорий (T-003)
  - Hot-reload механизм (T-004)

---

### Task T-002: Config Loader Implementation

**Description:**
Реализация загрузчика конфигурации: чтение файла, JSON parsing, schema validation, применение defaults, проверка file permissions (0600), кэширование. Обработка ошибок для missing file, invalid JSON, validation errors.

**Estimated Time:** 3-4 hours

**Dependencies:** T-001 (blocking)

**Scope:**
- **In scope:**
  - Функция `loadConfig(): Promise<OsaiConfig>`
  - Функция `loadConfigSync(): OsaiConfig` (для критичных мест)
  - Валидация против JSON Schema
  - Merge defaults с user-provided values
  - Проверка file permissions (warning если != 0600)
  - Error classes: ConfigNotFoundError, ConfigValidationError, ConfigParseError
  - Логирование через pino

- **Out scope:**
  - Hot-reload (T-004)
  - Создание директорий (T-003)
  - Config editing API (F-012 CLI)

---

### Task T-003: Directory Structure Initialization

**Description:**
Реализация инициализации директории `~/.osai/` со стандартной структурой. Создание `openclaw.json` с defaults, поддиректорий (logs/, sessions/, memory/, workspace/), установка правильных permissions.

**Estimated Time:** 2-3 hours

**Dependencies:** T-001 (blocking)

**Scope:**
- **In scope:**
  - Функция `initializeOsaiDirectory(): Promise<void>`
  - Функция `getOsaiDirectory(): string` (возвращает путь ~/.osai)
  - Создание layout:
    ```
    ~/.osai/
    ├── openclaw.json          # Main config (permissions: 0600)
    ├── logs/                  # Log files
    ├── sessions/              # Session persistence
    ├── memory/                # SQLite databases for memory
    │   ├── shortterm.db
    │   └── longterm.db
    └── workspace/             # User workspace files
        ├── AGENTS.md
        ├── SOUL.md
        └── skills/            # Custom skills
    ```
  - Проверка и создание директорий с правильными permissions (0700)
  - Создание начального `openclaw.json` с defaults
  - Idempotent operation (не перезаписывает существующие файлы)

- **Out scope:**
  - Загрузка конфигурации (T-002)
  - Hot-reload (T-004)
  - CLI команда `osai init` (F-012)

---

### Task T-004: Config Hot-Reload Mechanism

**Description:**
Реализация механизма hot-reload для конфигурации. File watcher на `~/.osai/openclaw.json`, уведомление подписчиков об изменениях, graceful reload без прерывания активных сессий.

**Estimated Time:** 3-4 hours

**Dependencies:** T-002 (blocking)

**Scope:**
- **In scope:**
  - Класс `ConfigWatcher` с использованием `chokidar`
  - Subscriber pattern: `subscribe(callback: ConfigChangeCallback): Unsubscribe`
  - Debouncing file changes (защита от duplicate events)
  - Валидация новой конфигурации перед уведомлением
  - Error handling: invalid config не применяется, сохраняется старая
  - Логирование изменений (с diff для audit)

- **Out scope:**
  - Применение конфигурации в других пакетах (их ответственность)
  - UI для config editing (F-012, F-013)

---

## 4. Test Strategy (TDD)

### 4.1 Test Types per Task

| Task | Unit Tests | Integration Tests | Build & Run Verification |
|------|------------|-------------------|--------------------------|
| T-001 | Schema validation tests | — | tsc compilation |
| T-002 | Loader tests, error handling | File I/O tests | tsc + vitest run |
| T-003 | Directory creation tests | Real filesystem tests | tsc + vitest run |
| T-004 | Watcher tests, subscriber tests | File change simulation | tsc + vitest run |

### 4.2 Build and Run Verification

**Build Verification (обязательно для каждой задачи):**
```bash
# Сборка TypeScript
pnpm --filter @osai/config build
# Или из корня
pnpm build

# Ожидаемый результат: 0 errors, выходной код 0
# Критерий успеха: dist/ директория создана с .js и .d.ts файлами
```

**Run Verification (после завершения всех задач):**
```bash
# Проверка импорта модуля
node -e "const { loadConfig } = require('@osai/config'); console.log(typeof loadConfig);"

# Ожидаемый результат: "function"
# Базовая проверка: модуль экспортирует ожидаемые функции
```

### 4.3 Test Cases per Task

#### Task T-001: Configuration Schema Definition

| Test ID | Description | Preconditions | Expected Result | Pass/Fail Criteria |
|---------|-------------|---------------|-----------------|-------------------|
| T001-UT-01 | Validate full config with all sections | Schema defined | Validation passes | No validation errors |
| T001-UT-02 | Validate minimal config (empty object) | Schema defined | Validation passes, defaults applied | All defaults are correct |
| T001-UT-03 | Validate invalid config type | Schema defined | Validation fails | Error message contains path and expected type |
| T001-UT-04 | Type guard for gateway section | Interfaces defined | Type guard returns correct boolean | Compiles without errors |
| T001-UT-05 | Type guard for model section | Interfaces defined | Type guard returns correct boolean | Compiles without errors |
| T001-UT-06 | Missing required field detected | Schema defined | Validation fails | Error message indicates missing field |
| T001-UT-07 | Invalid enum value detected | Schema defined | Validation fails | Error message contains allowed values |
| T001-UT-08 | Nested object validation | Schema defined | Nested errors reported | All nested errors captured |
| T001-UT-09 | All section interfaces exported | Package built | All types accessible | Import succeeds |
| T001-UT-10 | Default values are frozen/immutable | Defaults defined | Modification throws or is ignored | Immutability preserved |

#### Task T-002: Config Loader Implementation

| Test ID | Description | Preconditions | Expected Result | Pass/Fail Criteria |
|---------|-------------|---------------|-----------------|-------------------|
| T002-UT-01 | Load valid config file | Valid openclaw.json exists | Config object returned | All fields match file content |
| T002-UT-02 | Load config with defaults merge | Partial openclaw.json | Missing fields filled with defaults | Defaults correctly merged |
| T002-UT-03 | ConfigNotFoundError for missing file | No openclaw.json | Error thrown | Error is ConfigNotFoundError instance |
| T002-UT-04 | ConfigParseError for invalid JSON | Invalid JSON in file | Error thrown | Error is ConfigParseError instance |
| T002-UT-05 | ConfigValidationError for schema violation | Invalid config structure | Error thrown | Error contains validation details |
| T002-UT-06 | File permissions warning (0777) | File with wide permissions | Warning logged | Warning message contains permission value |
| T002-UT-07 | Sync loader works | Valid config exists | Config returned synchronously | No Promise involved |
| T002-UT-08 | LoadConfig caches result | Call loadConfig twice | Same object reference | Cache hit on second call |
| T002-UT-09 | Cache invalidation | Call with forceReload: true | Fresh config loaded | File read again |
| T002-IT-01 | Load config from real filesystem | Temp directory with config | Config loaded correctly | File content matches result |
| T002-IT-02 | Handle symlinked config | Symlink to config file | Config loaded from target | Symlink resolved correctly |

#### Task T-003: Directory Structure Initialization

| Test ID | Description | Preconditions | Expected Result | Pass/Fail Criteria |
|---------|-------------|---------------|-----------------|-------------------|
| T003-UT-01 | getOsaiDirectory returns correct path | HOME env set | ~/.osai returned | Path ends with /.osai |
| T003-UT-02 | Initialize creates all directories | Directory does not exist | All directories created | 6 directories exist |
| T003-UT-03 | Initialize creates openclaw.json | Directory does not exist | File created with defaults | Valid JSON with all sections |
| T003-UT-04 | openclaw.json has 0600 permissions | File created | Permissions are 0600 | stat.mode matches |
| T003-UT-05 | Directories have 0700 permissions | Directories created | Permissions are 0700 | stat.mode matches |
| T003-UT-06 | Idempotent operation | Directory already exists | No error, existing files preserved | Original content unchanged |
| T003-UT-07 | Does not overwrite existing openclaw.json | File exists with custom config | File unchanged | Content matches original |
| T003-IT-01 | Full initialization on real filesystem | Temp directory | Complete layout created | All expected paths exist |
| T003-IT-02 | Initialize from non-existent home | Invalid HOME env | Error thrown or fallback used | Error handling correct |

#### Task T-004: Config Hot-Reload Mechanism

| Test ID | Description | Preconditions | Expected Result | Pass/Fail Criteria |
|---------|-------------|---------------|-----------------|-------------------|
| T004-UT-01 | Watcher starts and stops | ConfigWatcher instance | No errors | Clean start/stop |
| T004-UT-02 | Subscriber notified on change | Watcher active, subscriber registered | Callback invoked | Callback received new config |
| T004-UT-03 | Multiple subscribers notified | Multiple subscribers | All callbacks invoked | Call count matches subscribers |
| T004-UT-04 | Unsubscribe works | Subscriber unsubscribed | No notification after unsubscribe | Callback not invoked |
| T004-UT-05 | Debounce prevents duplicate events | Rapid file saves | Single notification | Only one callback per debounce window |
| T004-UT-06 | Invalid config not applied | Invalid JSON written | Old config kept, error logged | Subscriber not called with invalid |
| T004-UT-07 | Error notification to subscribers | Invalid config | Error callback invoked | Subscriber receives error |
| T004-UT-08 | Graceful shutdown | Watcher stopping | All resources released | No file handles left open |
| T004-IT-01 | Real file change detection | Real filesystem, chokidar | Change detected | Callback within 100ms of change |
| T004-IT-02 | Config diff logged | Config changed | Diff in logs | Added/removed/changed fields logged |

---

## 5. Implementation Plan per Task

### Task T-001: Configuration Schema Definition

**Logical Steps:**

1. Создать директорию `packages/config/` (если не существует)
2. Определить TypeScript interfaces:
   - `OsaiConfig` — root interface
   - `GatewayConfig` — секция gateway (host, port, wsPath)
   - `ModelConfig` — секция model (providers, failover chain, default model)
   - `SessionConfig` — секция session (defaultSessionType, maxSessions, queueMode)
   - `SkillsConfig` — секция skills (enabled, blocked, custom paths)
   - `SecurityConfig` — секция security (sandbox enabled, permission categories)
   - `MemoryConfig` — секция memory (short-term/long-term settings, embedding provider)
   - `ObservabilityConfig` — секция observability (logging, tracing, metrics)
3. Определить JSON Schema с использованием `ajv` или `zod`
4. Создать объект `DEFAULT_CONFIG: DeepReadonly<OsaiConfig>`
5. Создать type guards для каждой секции
6. Настроить экспорт через `index.ts`

**Constraints from Architecture:**
- TypeScript strict mode
- Совместимость с OpenClaw config format (если применимо)
- Все опциональные поля должны иметь defaults

**Integration Points:**
- `packages/types` — могут быть shared interfaces
- Все другие пакеты будут импортировать типы из `@osai/config`

---

### Task T-002: Config Loader Implementation

**Logical Steps:**

1. Создать Error classes: `ConfigNotFoundError`, `ConfigParseError`, `ConfigValidationError`
2. Реализовать `getConfigPath(): string` — возвращает `~/.osai/openclaw.json`
3. Реализовать `readConfigFile(path: string): string` — синхронное чтение
4. Реализовать `parseConfig(content: string): unknown` — JSON parsing
5. Реализовать `validateConfig(data: unknown): OsaiConfig` — schema validation
6. Реализовать `checkPermissions(path: string): void` — проверка 0600, warning если иначе
7. Реализовать `loadConfig(): Promise<OsaiConfig>` — композиция вышеуказанных функций
8. Реализовать `loadConfigSync(): OsaiConfig` — синхронная версия
9. Добавить простейший in-memory кэш
10. Добавить логирование через pino

**Constraints from Architecture:**
- File permissions check — warning только, не error
- Все ошибки должны быть typed и catchable
- Logging через pino с structured output

**Integration Points:**
- `@osai/config` schema (T-001)
- pino logger (уже должен быть в dependencies)

---

### Task T-003: Directory Structure Initialization

**Logical Steps:**

1. Реализовать `getOsaiDirectory(): string` — platform-specific home directory
2. Определить `OSAI_LAYOUT` — массив путей для создания
3. Реализовать `ensureDirectory(path: string, mode: number): void`
4. Реализовать `ensureFile(path: string, content: string, mode: number): void`
5. Реализовать `initializeOsaiDirectory(options?: InitOptions): Promise<void>`
6. Создать template для `openclaw.json` (JSON.stringify defaults с formatting)
7. Добавить проверку на существование файлов перед созданием
8. Добавить логирование созданных путей

**Constraints from Architecture:**
- Idempotent — можно вызывать многократно
- Не перезаписывать существующие пользовательские файлы
- Permissions: files 0600, directories 0700

**Integration Points:**
- `@osai/config` defaults (T-001)
- File system APIs (Node.js fs module)

---

### Task T-004: Config Hot-Reload Mechanism

**Logical Steps:**

1. Добавить dependency `chokidar`
2. Создать interface `ConfigChangeCallback(newConfig: OsaiConfig, oldConfig: OsaiConfig): void`
3. Создать interface `ConfigErrorCallback(error: Error): void`
4. Реализовать класс `ConfigWatcher`:
   - constructor(configPath: string, loader: ConfigLoader)
   - `start(): void` — начать watching
   - `stop(): void` — прекратить watching
   - `subscribe(callback: ConfigChangeCallback): Unsubscribe`
   - `onError(callback: ConfigErrorCallback): void`
5. Реализовать debouncing (100-200ms default)
6. Добавить validation перед notify subscribers
7. Реализовать diff logging для audit
8. Добавить graceful error handling

**Constraints from Architecture:**
- Debounce обязателен (файловые системы могут генерировать multiple events)
- Invalid config не должен применяться
- Все изменения логируются для audit

**Integration Points:**
- Config loader (T-002)
- pino logger
- chokidar file watcher

---

## 6. Acceptance Criteria per Task

### Task T-001: Configuration Schema Definition

- [ ] Все TypeScript interfaces определены и экспортированы
- [ ] JSON Schema покрывает все поля interfaces
- [ ] Default values определены для всех опциональных полей
- [ ] Type guards работают корректно
- [ ] TypeScript компиляция проходит без ошибок (`pnpm build`)
- [ ] Все unit tests проходят (`pnpm test`)

### Task T-002: Config Loader Implementation

- [ ] `loadConfig()` загружает валидную конфигурацию
- [ ] `loadConfigSync()` работает синхронно
- [ ] Defaults корректно merge'ятся с user config
- [ ] Все error cases обрабатываются с правильными error types
- [ ] File permissions warning логируется
- [ ] TypeScript компиляция проходит без ошибок
- [ ] Все tests (unit + integration) проходят

### Task T-003: Directory Structure Initialization

- [ ] `getOsaiDirectory()` возвращает корректный путь
- [ ] `initializeOsaiDirectory()` создаёт полный layout
- [ ] Permissions установлены корректно (0600/0700)
- [ ] Операция idempotent
- [ ] Существующие файлы не перезаписываются
- [ ] TypeScript компиляция проходит без ошибок
- [ ] Все tests (unit + integration) проходят

### Task T-004: Config Hot-Reload Mechanism

- [ ] `ConfigWatcher` корректно отслеживает изменения
- [ ] Subscribers получают уведомления
- [ ] Unsubscribe работает
- [ ] Debounce предотвращает duplicate notifications
- [ ] Invalid config не применяется, error callback вызывается
- [ ] Diff логируется для audit
- [ ] Graceful shutdown без утечки ресурсов
- [ ] TypeScript компиляция проходит без ошибок
- [ ] Все tests (unit + integration) проходят

---

## 7. Quality Expectations

### Coverage Requirements

| Task | Unit Test Coverage | Integration Coverage |
|------|-------------------|---------------------|
| T-001 | 90%+ (schema validation) | N/A |
| T-002 | 85%+ (loader logic) | 70%+ (file I/O) |
| T-003 | 80%+ (directory logic) | 75%+ (real filesystem) |
| T-004 | 85%+ (watcher logic) | 70%+ (file watching) |

### Task Completion Time

- **T-001:** 3-4 hours
- **T-002:** 3-4 hours
- **T-003:** 2-3 hours
- **T-004:** 3-4 hours

**Total Estimated:** 11-15 hours (может быть распределено на 2-3 дня)

### Build and Run Stability

- TypeScript strict mode включён
- Все типы явно определены (no implicit any)
- ESLint проходит без errors
- Vitest tests стабильны (no flaky tests)

---

## 8. Risks and Edge Cases

### Known Edge Cases

| Edge Case | Task | Handling Strategy |
|-----------|------|-------------------|
| HOME env variable not set | T-003 | Fallback to /tmp/osai или throw error |
| Config file is a directory | T-002 | ConfigParseError |
| Config file is a symlink | T-002 | Resolve symlink, validate target |
| Race condition on file write | T-004 | Debounce + validation before apply |
| Config file deleted while watching | T-004 | Error callback, continue watching |
| Permission denied reading config | T-002 | ConfigNotFoundError или explicit error |
| Very large config file (>1MB) | T-002 | Log warning, allow but may impact performance |
| Circular references in JSON | T-002 | JSON.parse will throw, ConfigParseError |

### Risky Scenarios

1. **Schema evolution:** Добавление новых полей может сломать backward compatibility
   - *Mitigation:* Version field в schema, migration functions

2. **Hot-reload race conditions:** Изменение в момент чтения
   - *Mitigation:* Debounce, atomic read, validation before apply

3. **Cross-platform paths:** Windows vs Unix path separators
   - *Mitigation:* Всегда использовать `path.join()` и `os.homedir()`

4. **Chokidar reliability:** Некоторые filesystems могут не поддерживать watching
   - *Mitigation:* Polling fallback, error handling

### Dependency-Related Risks

- **F-001 incomplete:** Если shared types не готовы, создать временные типы в `packages/config`
- **chokidar on special filesystems:** NFS, network mounts могут иметь issues с file watching

---

## 9. Notes

### Clarifications

1. **Config location:** `~/.osai/openclaw.json` — стандартный путь, поддерживается возможность переопределения через env variable `OSAI_CONFIG_PATH`

2. **Config format:** JSON с comments не поддерживается нативно. Если нужны comments — использовать JSONC parser (дополнительная dependency)

3. **Schema validation library:** Рекомендуется `zod` для TypeScript-first approach. Альтернатива — `ajv` для strict JSON Schema compliance

4. **Hot-reload application:** ConfigWatcher только уведомляет об изменениях. Применение конфигурации — ответственность consumer пакетов (agent, gateway, etc.)

5. **Permissions enforcement:** 0600/0700 — рекомендация с warning, не blocker. На некоторых системах permissions могут не применяться корректно

### Planning Notes

- T-001 и T-003 могут частично разрабатываться параллельно разными разработчиками (если есть)
- T-002 требует завершения T-001 для использования schema
- T-004 можно отложить на V1 если hot-reload не критичен для MVP
- Интеграция с CLI (`osai init`, `osai config show`) — в F-012

---

## 10. Configuration Schema Reference (Draft)

```typescript
// packages/config/src/types.ts

export interface OsaiConfig {
  version: string;                    // Config schema version
  gateway: GatewayConfig;
  model: ModelConfig;
  session: SessionConfig;
  skills: SkillsConfig;
  security: SecurityConfig;
  memory: MemoryConfig;
  observability: ObservabilityConfig;
}

export interface GatewayConfig {
  host: string;                       // default: "127.0.0.1"
  port: number;                       // default: 18789
  wsPath: string;                     // default: "/ws"
  maxConnections: number;             // default: 10
}

export interface ModelConfig {
  defaultProvider: 'anthropic' | 'openai' | 'ollama';
  defaultModel: string;               // e.g., "claude-3-opus-20240229"
  providers: {
    anthropic?: ProviderConfig;
    openai?: ProviderConfig;
    ollama?: OllamaProviderConfig;
  };
  failoverChain: string[];            // Provider names in order
  maxRetries: number;                 // default: 3
  timeout: number;                    // default: 120000 (ms)
}

export interface SessionConfig {
  defaultType: 'main' | 'group' | 'isolated';
  maxSessions: number;                // default: 10
  queueMode: 'fifo' | 'priority';
  persistence: boolean;               // default: true
  pruningThreshold: number;           // Context size threshold
}

export interface SkillsConfig {
  enabled: string[];                  // Skill names
  blocked: string[];                  // Blocked skill names
  customPaths: string[];              // Additional skill directories
}

export interface SecurityConfig {
  sandboxEnabled: boolean;            // Docker sandbox for non-main
  permissionCategories: {
    read: 'auto' | 'confirm';
    write: 'auto' | 'confirm';
    exec: 'auto' | 'confirm';
    system: 'auto' | 'confirm';
  };
  blockedCommands: string[];          // Shell command blacklist
  allowedDirectories: string[];       // File sandbox allowlist
  blockedPatterns: string[];          // Path patterns to block
}

export interface MemoryConfig {
  shortTerm: {
    maxMessages: number;              // default: 100
    ttl: number;                      // default: 86400000 (24h)
  };
  longTerm: {
    enabled: boolean;
    provider: 'qdrant' | 'sqlite-vec';
    qdrantUrl?: string;
    collection?: string;
  };
  embedding: {
    provider: 'openai' | 'ollama' | 'onnx';
    model: string;
  };
}

export interface ObservabilityConfig {
  logging: {
    level: 'trace' | 'debug' | 'info' | 'warn' | 'error';
    format: 'json' | 'pretty';
    file: string;                     // Log file path
  };
  tracing: {
    enabled: boolean;
    exporter: 'console' | 'jaeger' | 'zipkin' | 'otlp';
    endpoint?: string;
  };
  metrics: {
    enabled: boolean;
    port: number;                     // Prometheus metrics port
  };
  audit: {
    enabled: boolean;
    retention: number;                // Days
  };
}
```

---

*End of Task Roadmap: Configuration System (F-003) v1.0*
