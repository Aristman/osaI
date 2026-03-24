# Task Roadmap: Monorepo Infrastructure

**Version:** v1.0
**Generated:** 2026-03-24
**Agent:** TDD Planner Agent
**Status:** Ready for Implementation

---

## 1. Feature Overview

- **Feature ID:** F-001
- **Feature Name:** Monorepo Infrastructure
- **Feature Description:** Базовая инфраструктура monorepo: корневая конфигурация (package.json, tsconfig.json), shared types, CI/CD (GitHub Actions), linting (ESLint + Biome), formatting (Prettier), build pipeline (tsup/esbuild). Фундамент для всех остальных фич.
- **Related Requirements:** FR-066, FR-070-FR-072, NFR-025, NFR-026, NFR-029
- **Domain:** cross-cutting, infrastructure
- **Git branch:** feature/monorepo-infrastructure

---

## 2. Dependencies

### 2.1 Feature Dependencies

**None**

Фича F-001 является первой в dependency graph (Level 0) и не зависит от других фич.

### 2.2 Task Dependencies

| Task ID | Depends On | Type |
|---------|------------|------|
| T-001 | None | Independent |
| T-002 | T-001 | Blocking |
| T-003 | T-001 | Blocking |
| T-004 | T-001 | Blocking |
| T-005 | T-002, T-003, T-004 | Blocking |
| T-006 | T-005 | Blocking |

### 2.3 Development Order

**Параллельное выполнение:**
- После T-001 задачи T-002, T-003, T-004 могут выполняться параллельно (до 3 задач одновременно)

**Последовательное выполнение:**
- T-001 -> (T-002 || T-003 || T-004) -> T-005 -> T-006

```
T-001 (Root Setup)
   |
   +---> T-002 (Shared Types) ----+
   |                              |
   +---> T-003 (Linting/Format) --+---> T-005 (CI/CD) ---> T-006 (Build Verification)
   |                              |
   +---> T-004 (Build Config) ----+
```

---

## 3. Task Breakdown

### Task T-001: Root Monorepo Setup

**Description:**
Инициализация корневой структуры monorepo: package.json с npm workspaces, базовый tsconfig.json с настройками TypeScript 5.x strict mode, структура директорий packages/ и apps/, .gitignore, .nvmrc для Node.js 20 LTS.

**Estimated Time:** 2-3 hours

**Dependencies:** None

**Scope:**
- **In scope:**
  - Создание package.json с workspaces конфигурацией
  - Создание tsconfig.json (base config, strict mode)
  - Создание директорий packages/, apps/, tests/, docs/
  - Создание .gitignore для Node.js/TypeScript проекта
  - Создание .nvmrc для Node.js 20 LTS
  - Создание .editorconfig для единообразного форматирования

- **Out scope:**
  - Конфигурация отдельных пакетов (packages/*)
  - CI/CD конфигурация (Task T-005)
  - Linting/formatting конфигурация (Task T-003)

---

### Task T-002: Shared Types Package

**Description:**
Создание packages/types с общими TypeScript интерфейсами: WS message types (message, command, permission_response, subscribe, tool_stream, block, permission_request), error types, базовые domain interfaces. Публикация как @osai/types.

**Estimated Time:** 3-4 hours

**Dependencies:** T-001 (Blocking)

**Scope:**
- **In scope:**
  - Создание packages/types/package.json
  - Создание packages/types/tsconfig.json (extends root)
  - Определение WS message types (7 типов сообщений)
  - Определение error types (AppError, SessionError, ToolError)
  - Определение базовых domain interfaces (Session, Channel, Skill)
  - Barrel exports (index.ts)
  - tsup.config.ts для сборки types

- **Out scope:**
  - Domain-specific types (agent, memory, observability) -- будут добавлены в соответствующих фичах
  - Runtime валидация (zod schemas) -- Task T-004
  - JSON Schema определения -- F-003 Configuration

---

### Task T-003: Linting and Formatting Configuration

**Description:**
Настройка ESLint 9.x + Biome + Prettier для monorepo. Конфигурация в корне проекта, shared config для всех пакетов. Интеграция с TypeScript strict checks. Скрипты lint, lint:fix, format в root package.json.

**Estimated Time:** 2-3 hours

**Dependencies:** T-001 (Blocking)

**Scope:**
- **In scope:**
  - Установка ESLint 9.x с TypeScript plugin
  - Установка Biome для быстрого linting
  - Установка Prettier с конфигурацией
  - Создание eslint.config.js (flat config)
  - Создание biome.json
  - Создание .prettierrc + .prettierignore
  - Добавление npm scripts: lint, lint:fix, format, format:check
  - Интеграция с VS Code (settings.json recommendations)

- **Out scope:**
  - Pre-commit hooks (husky/lint-staged) -- Task T-005
  - CI/CD lint шаги -- Task T-005
  - Custom lint rules -- при необходимости в будущих фичах

---

### Task T-004: Build Pipeline Configuration

**Description:**
Настройка tsup/esbuild для сборки пакетов monorepo. Базовый tsup.config.ts с общими настройками (ESM + CJS output, sourcemaps, dts generation). Скрипты build, build:watch, clean в root package.json. Turbo/Nx для кэширования сборки (опционально).

**Estimated Time:** 2-3 hours

**Dependencies:** T-001 (Blocking)

**Scope:**
- **In scope:**
  - Установка tsup и esbuild
  - Создание tsup.config.ts (base config)
  - Определение форматов: ESM (.mjs) + CJS (.cjs)
  - Настройка sourcemaps и declarations (.d.ts)
  - Добавление npm scripts: build, build:watch, clean
  - Создание scripts/clean.js для очистки dist/ директорий
  - Опционально: turbo.json для кэширования

- **Out scope:**
  - Сборка конкретных пакетов -- каждая фича настраивает самостоятельно
  - Bundling для production deployment -- out of MVP scope
  - Code splitting оптимизации -- V1/V2 scope

---

### Task T-005: CI/CD Pipeline (GitHub Actions)

**Description:**
Создание GitHub Actions workflow для автоматической проверки: install dependencies, lint, type-check, test, build. Workflow запускается на push в main и pull_request. Кэширование node_modules и build artifacts.

**Estimated Time:** 3-4 hours

**Dependencies:** T-002, T-003, T-004 (Blocking)

**Scope:**
- **In scope:**
  - Создание .github/workflows/ci.yml
  - Job: install (с кэшированием pnpm store)
  - Job: lint (ESLint + Biome)
  - Job: type-check (tsc --noEmit)
  - Job: test (vitest --run)
  - Job: build (tsup для всех пакетов)
  - Кэширование node_modules и .turbo
  - Matrix testing (Node.js 20 LTS)
  - Установка husky + lint-staged для pre-commit hooks

- **Out scope:**
  - Deploy workflows -- V1 scope
  - Release automation -- V1 scope
  - Security scanning (dependabot, codeql) -- V1 scope
  - Multiple Node.js versions -- V1 scope

---

### Task T-006: Build and Run Verification

**Description:**
Финальная верификация monorepo infrastructure: полный цикл сборки, проверка работоспособности shared types импорта, валидация CI/CD pipeline на GitHub, документирование npm scripts.

**Estimated Time:** 2-3 hours

**Dependencies:** T-005 (Blocking)

**Scope:**
- **In scope:**
  - Выполнение полного цикла: install -> lint -> type-check -> build
  - Проверка импорта @osai/types из тестового файла
  - Локальный запуск CI steps (act или manual)
  - Проверка pre-commit hooks
  - Обновление root README.md с описанием npm scripts
  - Создание scripts/verify-setup.sh для автоматической проверки

- **Out scope:**
  - Функциональные тесты пакетов -- каждая фича отвечает за свои тесты
  - Performance тесты сборки -- V1 scope
  - E2E тесты -- V1 scope

---

## 4. Test Strategy (TDD)

### 4.1 Test Types per Task

| Task ID | Unit Tests | Integration Tests | Build & Run Verification |
|---------|------------|-------------------|--------------------------|
| T-001 | - | - | REQUIRED |
| T-002 | REQUIRED | - | REQUIRED |
| T-003 | REQUIRED | - | REQUIRED |
| T-004 | - | REQUIRED | REQUIRED |
| T-005 | - | REQUIRED | REQUIRED |
| T-006 | - | - | REQUIRED |

### 4.2 Build and Run Verification

**Build Verification:**

```bash
# Команда установки зависимостей
pnpm install

# Ожидаемый результат
# - Все зависимости установлены в node_modules/
# - pnpm-lock.yaml создан/обновлен
# - Workspaces разрешены (packages/*, apps/*)

# Команда сборки
pnpm build

# Ожидаемый результат
# - Все пакеты собраны без ошибок
# - dist/ директории созданы в каждом пакете
# - .d.ts файлы сгенерированы
# - sourcemaps созданы

# Критерии успешной сборки
# - Exit code: 0
# - No TypeScript errors
# - No build warnings (или только допустимые)
# - Output size reasonable (< 1MB per package)
```

**Run Verification:**

```bash
# Команда проверки типов
pnpm type-check

# Ожидаемый результат
# - tsc --noEmit проходит без ошибок
# - Все типы валидны

# Команда linting
pnpm lint

# Ожидаемый результат
# - ESLint: 0 errors, 0 warnings
# - Biome: 0 errors, 0 warnings

# Команда тестов
pnpm test

# Ожидаемый результат
# - vitest --run проходит
# - Все тесты green
# - Coverage report сгенерирован (если настроен)
```

**Verification Script:**

```bash
#!/bin/bash
# scripts/verify-setup.sh

set -e

echo "=== Verifying Monorepo Setup ==="

echo "1. Checking Node.js version..."
node -v | grep -q "v20" && echo "   [OK] Node.js 20 detected" || echo "   [FAIL] Node.js 20 required"

echo "2. Installing dependencies..."
pnpm install

echo "3. Running lint..."
pnpm lint

echo "4. Running type-check..."
pnpm type-check

echo "5. Running tests..."
pnpm test

echo "6. Running build..."
pnpm build

echo "7. Verifying @osai/types import..."
node -e "const types = require('./packages/types/dist/index.cjs'); console.log('   [OK] Types import works');"

echo "=== All verifications passed ==="
```

### 4.3 Test Cases per Task

---

#### Task T-001: Root Monorepo Setup

**Test Strategy:** Build & Run Verification only (no code to test)

| Test ID | Type | Description | Preconditions | Expected Result | Pass/Fail Criteria |
|---------|------|-------------|---------------|-----------------|-------------------|
| T001-01 | Build | package.json валиден | - | npm/pnpm распознаёт package.json | `pnpm install` не падает |
| T001-02 | Build | Workspaces разрешаются | package.json существует | packages/*, apps/* доступны как workspaces | `pnpm list --depth 0` показывает workspaces |
| T001-03 | Build | tsconfig.json валиден | tsconfig.json существует | tsc распознаёт конфиг | `tsc --showConfig` не падает |
| T001-04 | Build | Strict mode включён | tsconfig.json существует | strict: true в конфиге | `grep '"strict": true' tsconfig.json` |
| T001-05 | Build | Директории существуют | - | packages/, apps/, tests/, docs/ созданы | `ls -d packages apps tests docs` |

---

#### Task T-002: Shared Types Package

**Test Strategy:** Unit Tests + Build Verification

| Test ID | Type | Description | Preconditions | Expected Result | Pass/Fail Criteria |
|---------|------|-------------|---------------|-----------------|-------------------|
| T002-01 | Unit | WSMessage type экспортируется | types package собран | import { WSMessage } работает | TypeScript не выдаёт ошибку |
| T002-02 | Unit | Все 7 WS message types определены | types package собран | message, command, permission_response, subscribe, tool_stream, block, permission_request | Все типы доступны |
| T002-03 | Unit | Error types экспортируются | types package собран | AppError, SessionError, ToolError | Все типы доступны |
| T002-04 | Unit | Session interface валиден | types package собран | Session содержит id, type, status, createdAt | TypeScript type-check проходит |
| T002-05 | Unit | Channel interface валиден | types package собран | Channel содержит id, type, status | TypeScript type-check проходит |
| T002-06 | Build | Package собирается | tsup.config.ts настроен | dist/ с .js, .d.ts, .map файлами | `pnpm build` завершается успешно |
| T002-07 | Build | ESM и CJS форматы | types package собран | .mjs и .cjs файлы в dist/ | `ls packages/types/dist/*.mjs *.cjs` |
| T002-08 | Integration | Импорт из другого пакета | types package опубликован локально | import from '@osai/types' работает | pnpm workspace resolution работает |

**Пример Unit Test (vitest):**

```typescript
// packages/types/__tests__/message-types.test.ts
import { describe, it, expectTypeOf } from 'vitest';
import type {
  WSMessage,
  UserMessage,
  CommandMessage,
  PermissionResponseMessage,
  SubscribeMessage,
  ToolStreamMessage,
  BlockMessage,
  PermissionRequestMessage,
} from '../src/messages';

describe('WS Message Types', () => {
  it('should define all 7 message types', () => {
    // Type-only test - compile-time validation
    expectTypeOf<WSMessage>().toBeUnion();
  });

  it('UserMessage should have required fields', () => {
    type RequiredFields = 'type' | 'sessionId' | 'content';
    expectTypeOf<UserMessage>().toMatchTypeOf<{ [K in RequiredFields]: unknown }>();
  });
});
```

---

#### Task T-003: Linting and Formatting Configuration

**Test Strategy:** Unit Tests + Build Verification

| Test ID | Type | Description | Preconditions | Expected Result | Pass/Fail Criteria |
|---------|------|-------------|---------------|-----------------|-------------------|
| T003-01 | Build | ESLint конфиг валиден | eslint.config.js существует | ESLint запускается | `pnpm lint` не падает на конфиге |
| T003-02 | Build | Biome конфиг валиден | biome.json существует | Biome запускается | `biome check .` не падает |
| T003-03 | Build | Prettier конфиг валиден | .prettierrc существует | Prettier запускается | `pnpm format:check` не падает |
| T003-04 | Unit | ESLint находит intentional error | Тестовый файл с ошибкой | ESLint сообщает об ошибке | Exit code != 0 |
| T003-05 | Unit | Prettier форматирует код | Тестовый файл (unformatted) | Код отформатирован | Diff показывает изменения |
| T003-06 | Build | TypeScript rules включены | eslint.config.js существует | @typescript-eslint rules активны | ESLint проверяет TS файлы |

---

#### Task T-004: Build Pipeline Configuration

**Test Strategy:** Integration Tests + Build Verification

| Test ID | Type | Description | Preconditions | Expected Result | Pass/Fail Criteria |
|---------|------|-------------|---------------|-----------------|-------------------|
| T004-01 | Integration | tsup собирает тестовый пакет | packages/test-pkg создан | dist/ появляется | `pnpm build` создаёт dist/ |
| T004-02 | Integration | ESM output корректен | Сборка завершена | .mjs файл валиден | Node.js может импортировать |
| T004-03 | Integration | CJS output корректен | Сборка завершена | .cjs файл валиден | Node.js может require() |
| T004-04 | Integration | Declarations сгенерированы | Сборка завершена | .d.ts файлы существуют | TypeScript может использовать типы |
| T004-05 | Integration | Sourcemaps сгенерированы | Сборка завершена | .map файлы существуют | DevTools показывает исходный код |
| T004-06 | Build | clean скрипт работает | dist/ существует | dist/ удалён | `pnpm clean` удаляет dist/ |
| T004-07 | Build | build:watch работает | tsup запущен | Rebuild при изменении | Файл обновляется в dist/ |

---

#### Task T-005: CI/CD Pipeline (GitHub Actions)

**Test Strategy:** Integration Tests + Build Verification

| Test ID | Type | Description | Preconditions | Expected Result | Pass/Fail Criteria |
|---------|------|-------------|---------------|-----------------|-------------------|
| T005-01 | Integration | Workflow файл валиден | .github/workflows/ci.yml существует | YAML парсится | GitHub Actions не выдаёт ошибку |
| T005-02 | Integration | Install job завершается | Push в ветку | Dependencies установлены | Job exit code: 0 |
| T005-03 | Integration | Lint job завершается | Install job success | Lint проходит | Job exit code: 0 |
| T005-04 | Integration | Type-check job завершается | Install job success | Type-check проходит | Job exit code: 0 |
| T005-05 | Integration | Test job завершается | Install job success | Tests проходят | Job exit code: 0 |
| T005-06 | Integration | Build job завершается | Все предыдущие success | Build проходит | Job exit code: 0 |
| T005-07 | Build | Кэширование работает | Второй запуск workflow | Кэш hit | Logs показывают cache hit |
| T005-08 | Build | Pre-commit hooks работают | husky установлен | lint-staged запускается | Commit блокируется при lint errors |

---

#### Task T-006: Build and Run Verification

**Test Strategy:** Build Verification (Final Integration)

| Test ID | Type | Description | Preconditions | Expected Result | Pass/Fail Criteria |
|---------|------|-------------|---------------|-----------------|-------------------|
| T006-01 | Build | Полный цикл install -> build | Чистый репозиторий | Все шаги завершаются | Exit code: 0 на каждом шаге |
| T006-02 | Build | @osai/types импортируется | types package собран | Импорт работает | Node.js script не падает |
| T006-03 | Build | CI steps локально | act установлен | act проходит | `act --list` показывает все jobs |
| T006-04 | Build | README.md актуален | - | npm scripts описаны | Документация соответствует scripts |
| T006-05 | Build | verify-setup.sh работает | Скрипт создан | Все проверки проходят | Exit code: 0 |

---

## 5. Implementation Plan per Task

### Task T-001: Root Monorepo Setup

**Logical Implementation Steps:**

1. Создать package.json с workspaces конфигурацией:
   ```json
   {
     "name": "osai",
     "private": true,
     "type": "module",
     "workspaces": ["packages/*", "apps/*"],
     "engines": {
       "node": ">=20.0.0",
       "pnpm": ">=8.0.0"
     },
     "scripts": {
       "lint": "eslint .",
       "lint:fix": "eslint . --fix",
       "format": "prettier --write .",
       "format:check": "prettier --check .",
       "type-check": "tsc --noEmit",
       "build": "pnpm -r build",
       "test": "vitest run",
       "clean": "node scripts/clean.js"
     }
   }
   ```

2. Создать tsconfig.json с strict mode:
   ```json
   {
     "compilerOptions": {
       "target": "ES2022",
       "module": "ESNext",
       "moduleResolution": "bundler",
       "lib": ["ES2022"],
       "strict": true,
       "esModuleInterop": true,
       "skipLibCheck": true,
       "forceConsistentCasingInFileNames": true,
       "declaration": true,
       "declarationMap": true,
       "sourceMap": true,
       "resolveJsonModule": true,
       "isolatedModules": true,
       "noUnusedLocals": true,
       "noUnusedParameters": true,
       "noFallthroughCasesInSwitch": true
     },
     "exclude": ["node_modules", "dist", "**/dist/**"]
   }
   ```

3. Создать структуру директорий:
   ```
   osai/
   ├── packages/
   │   └── .gitkeep
   ├── apps/
   │   └── .gitkeep
   ├── tests/
   │   ├── unit/
   │   ├── integration/
   │   └── e2e/
   ├── docs/
   ├── scripts/
   └── workspace/
   ```

4. Создать .gitignore:
   ```
   node_modules/
   dist/
   .turbo/
   *.log
   .env
   .env.*
   coverage/
   .pnpm-store/
   ```

5. Создать .nvmrc: `20`

6. Создать .editorconfig:
   ```ini
   root = true
   [*]
   charset = utf-8
   end_of_line = lf
   indent_style = space
   indent_size = 2
   insert_final_newline = true
   trim_trailing_whitespace = true
   ```

**Constraints from Architecture:**
- Node.js 20 LTS (PROJECT_PROFILE.md)
- TypeScript 5.x strict mode (ARCHITECTURE_OVERVIEW.md)
- npm/pnpm workspaces (ARCHITECTURE_OVERVIEW.md)
- Local-first, solo developer (PROJECT_PROFILE.md)

**Integration Points:**
- None (первая задача, foundation для всех остальных)

---

### Task T-002: Shared Types Package

**Logical Implementation Steps:**

1. Создать packages/types/package.json:
   ```json
   {
     "name": "@osai/types",
     "version": "0.0.1",
     "type": "module",
     "main": "./dist/index.cjs",
     "module": "./dist/index.mjs",
     "types": "./dist/index.d.ts",
     "exports": {
       ".": {
         "import": "./dist/index.mjs",
         "require": "./dist/index.cjs",
         "types": "./dist/index.d.ts"
       }
     },
     "files": ["dist"],
     "scripts": {
       "build": "tsup",
       "dev": "tsup --watch"
     },
     "devDependencies": {
       "tsup": "^8.0.0",
       "typescript": "^5.0.0"
     }
   }
   ```

2. Создать packages/types/tsconfig.json (extends root):
   ```json
   {
     "extends": "../../tsconfig.json",
     "compilerOptions": {
       "outDir": "./dist",
       "rootDir": "./src"
     },
     "include": ["src/**/*"]
   }
   ```

3. Определить WS message types (src/messages.ts):
   - UserMessage, CommandMessage, PermissionResponseMessage
   - SubscribeMessage, ToolStreamMessage, BlockMessage
   - PermissionRequestMessage
   - WSMessage union type

4. Определить error types (src/errors.ts):
   - AppError, SessionError, ToolError, ConfigError

5. Определить domain interfaces (src/domain.ts):
   - Session, Channel, Skill, Agent

6. Создать barrel export (src/index.ts)

7. Создать tsup.config.ts

**Constraints from Architecture:**
- WS protocol: 7 message types (ARCHITECTURE_OVERVIEW.md)
- Category-based permissions (ARCHITECTURE_OVERVIEW.md)
- Session types: main, group, isolated (ARCHITECTURE_OVERVIEW.md)

**Integration Points:**
- Используется всеми пакетами: gateway, agent, skills-core, skills-osai, memory, observability, os-integration, cli, dashboard

---

### Task T-003: Linting and Formatting Configuration

**Logical Implementation Steps:**

1. Установить зависимости:
   ```bash
   pnpm add -Dw eslint @eslint/js typescript-eslint prettier @biomejs/biome
   ```

2. Создать eslint.config.js (flat config):
   ```javascript
   import js from '@eslint/js';
   import tseslint from 'typescript-eslint';

   export default [
     js.configs.recommended,
     ...tseslint.configs.recommended,
     {
       files: ['**/*.ts', '**/*.tsx'],
       languageOptions: {
         parserOptions: {
           project: true,
         },
       },
     },
     {
       ignores: ['dist/**', 'node_modules/**', 'coverage/**'],
     },
   ];
   ```

3. Создать biome.json:
   ```json
   {
     "$schema": "https://biomejs.dev/schemas/1.5.0/schema.json",
     "organizeImports": {
       "enabled": true
     },
     "linter": {
       "enabled": true,
       "rules": {
         "recommended": true
       }
     }
   }
   ```

4. Создать .prettierrc:
   ```json
   {
     "semi": true,
     "singleQuote": true,
     "trailingComma": "es5",
     "tabWidth": 2,
     "printWidth": 100
   }
   ```

5. Создать .prettierignore: `dist/\nnode_modules/\ncoverage/`

6. Обновить npm scripts в root package.json

7. Создать .vscode/settings.json (recommendations)

**Constraints from Architecture:**
- ESLint + Biome (ARCHITECTURE_OVERVIEW.md, PROJECT_PROFILE.md)
- Prettier (ARCHITECTURE_OVERVIEW.md)
- TypeScript strict checks enabled

**Integration Points:**
- CI/CD pipeline (Task T-005)
- Pre-commit hooks (Task T-005)

---

### Task T-004: Build Pipeline Configuration

**Logical Implementation Steps:**

1. Установить зависимости:
   ```bash
   pnpm add -Dw tsup esbuild
   ```

2. Создать tsup.config.ts (base config):
   ```typescript
   import { defineConfig } from 'tsup';

   export default defineConfig({
     format: ['esm', 'cjs'],
     dts: true,
     sourcemap: true,
     clean: true,
     minify: false,
     splitting: false,
     treeshake: true,
   });
   ```

3. Создать scripts/clean.js:
   ```javascript
   import { rm } from 'fs/promises';
   import { glob } from 'glob';

   const distDirs = await glob('{packages,apps}/*/dist');
   await Promise.all(distDirs.map(dir => rm(dir, { recursive: true })));
   console.log('Cleaned all dist directories');
   ```

4. Добавить npm scripts в root package.json

5. (Опционально) Создать turbo.json для кэширования

**Constraints from Architecture:**
- tsup/esbuild (ARCHITECTURE_OVERVIEW.md)
- ESM + CJS outputs (Node.js compatibility)
- Sourcemaps required (debugging)

**Integration Points:**
- CI/CD pipeline (Task T-005)
- Все пакеты используют базовую конфигурацию

---

### Task T-005: CI/CD Pipeline (GitHub Actions)

**Logical Implementation Steps:**

1. Создать .github/workflows/ci.yml:
   ```yaml
   name: CI

   on:
     push:
       branches: [main]
     pull_request:
       branches: [main]

   jobs:
     install:
       runs-on: ubuntu-latest
       steps:
         - uses: actions/checkout@v4
         - uses: pnpm/action-setup@v2
           with:
             version: 8
         - uses: actions/setup-node@v4
           with:
             node-version: 20
             cache: 'pnpm'
         - run: pnpm install --frozen-lockfile

     lint:
       needs: install
       runs-on: ubuntu-latest
       steps:
         - uses: actions/checkout@v4
         - uses: pnpm/action-setup@v2
         - uses: actions/setup-node@v4
           with:
             node-version: 20
             cache: 'pnpm'
         - run: pnpm install --frozen-lockfile
         - run: pnpm lint

     type-check:
       needs: install
       runs-on: ubuntu-latest
       steps:
         - uses: actions/checkout@v4
         - uses: pnpm/action-setup@v2
         - uses: actions/setup-node@v4
           with:
             node-version: 20
             cache: 'pnpm'
         - run: pnpm install --frozen-lockfile
         - run: pnpm type-check

     test:
       needs: install
       runs-on: ubuntu-latest
       steps:
         - uses: actions/checkout@v4
         - uses: pnpm/action-setup@v2
         - uses: actions/setup-node@v4
           with:
             node-version: 20
             cache: 'pnpm'
         - run: pnpm install --frozen-lockfile
         - run: pnpm test

     build:
       needs: [lint, type-check, test]
       runs-on: ubuntu-latest
       steps:
         - uses: actions/checkout@v4
         - uses: pnpm/action-setup@v2
         - uses: actions/setup-node@v4
           with:
             node-version: 20
             cache: 'pnpm'
         - run: pnpm install --frozen-lockfile
         - run: pnpm build
   ```

2. Установить husky и lint-staged:
   ```bash
   pnpm add -Dw husky lint-staged
   pnpm exec husky init
   ```

3. Настроить .husky/pre-commit:
   ```bash
   pnpm lint-staged
   ```

4. Добавить lint-staged в package.json:
   ```json
   {
     "lint-staged": {
       "*.{ts,tsx}": ["eslint --fix", "prettier --write"],
       "*.{json,md}": ["prettier --write"]
     }
   }
   ```

**Constraints from Architecture:**
- GitHub Actions (PROJECT_PROFILE.md)
- Node.js 20 LTS only (MVP scope)
- Кэширование для ускорения CI

**Integration Points:**
- Linting config (Task T-003)
- Build config (Task T-004)

---

### Task T-006: Build and Run Verification

**Logical Implementation Steps:**

1. Выполнить полный цикл сборки:
   ```bash
   pnpm install
   pnpm lint
   pnpm type-check
   pnpm test
   pnpm build
   ```

2. Создать тестовый скрипт для проверки импорта:
   ```javascript
   // scripts/test-types-import.mjs
   import type { WSMessage, Session } from '@osai/types';
   console.log('Types import works!');
   ```

3. Создать scripts/verify-setup.sh (см. раздел 4.2)

4. Обновить README.md с npm scripts документацией

5. Запустить локальную симуляцию CI (если act установлен)

6. Проверить pre-commit hooks:
   - Создать intentional lint error
   - Попытаться commit
   - Убедиться что commit заблокирован

**Constraints from Architecture:**
- Все шаги должны проходить без ошибок
- Локальная верификация перед push

**Integration Points:**
- Все предыдущие задачи должны быть завершены

---

## 6. Acceptance Criteria per Task

### Task T-001: Root Monorepo Setup

- [ ] package.json существует и содержит workspaces конфигурацию
- [ ] tsconfig.json существует и содержит strict: true
- [ ] Директории packages/, apps/, tests/, docs/, scripts/, workspace/ созданы
- [ ] .gitignore существует и содержит node_modules, dist, .env
- [ ] .nvmrc существует и содержит "20"
- [ ] .editorconfig существует и валиден
- [ ] `pnpm install` завершается без ошибок
- [ ] `tsc --showConfig` завершается без ошибок

### Task T-002: Shared Types Package

- [ ] packages/types/package.json существует
- [ ] packages/types/tsconfig.json существует и extends root config
- [ ] Все 7 WS message types определены в src/messages.ts
- [ ] Error types (AppError, SessionError, ToolError) определены в src/errors.ts
- [ ] Domain interfaces (Session, Channel, Skill) определены в src/domain.ts
- [ ] src/index.ts экспортирует все типы
- [ ] tsup.config.ts существует
- [ ] `pnpm build` в packages/types завершается успешно
- [ ] dist/ содержит .mjs, .cjs, .d.ts файлы
- [ ] Unit tests проходят (`pnpm test`)

### Task T-003: Linting and Formatting Configuration

- [ ] eslint.config.js существует и валиден
- [ ] biome.json существует и валиден
- [ ] .prettierrc и .prettierignore существуют
- [ ] npm scripts: lint, lint:fix, format, format:check добавлены
- [ ] `pnpm lint` завершается без ошибок (на валидном коде)
- [ ] `pnpm format:check` завершается без ошибок
- [ ] ESLint correctly обрабатывает TypeScript файлы
- [ ] .vscode/settings.json создан с рекомендациями

### Task T-004: Build Pipeline Configuration

- [ ] tsup.config.ts существует в корне
- [ ] scripts/clean.js существует
- [ ] npm scripts: build, build:watch, clean добавлены
- [ ] ESM (.mjs) output генерируется
- [ ] CJS (.cjs) output генерируется
- [ ] .d.ts declarations генерируются
- [ ] Sourcemaps (.map) генерируются
- [ ] `pnpm clean` удаляет все dist/ директории
- [ ] `pnpm build` собирает все пакеты

### Task T-005: CI/CD Pipeline (GitHub Actions)

- [ ] .github/workflows/ci.yml существует и валиден
- [ ] Workflow содержит jobs: install, lint, type-check, test, build
- [ ] Кэширование pnpm store настроено
- [ ] husky установлен и инициализирован
- [ ] .husky/pre-commit существует
- [ ] lint-staged настроен в package.json
- [ ] Pre-commit hook блокирует commit при lint errors
- [ ] Workflow запускается на push в main и PR

### Task T-006: Build and Run Verification

- [ ] Полный цикл install -> lint -> type-check -> test -> build проходит
- [ ] @osai/types импортируется из других пакетов
- [ ] scripts/verify-setup.sh существует и выполняется успешно
- [ ] README.md содержит документацию npm scripts
- [ ] Pre-commit hooks работают корректно
- [ ] CI pipeline зелёный на GitHub (после push)

---

## 7. Quality Expectations

### Coverage Requirements

| Task ID | Unit Coverage | Integration Coverage |
|---------|---------------|---------------------|
| T-001 | N/A | N/A |
| T-002 | 80%+ | N/A |
| T-003 | 70%+ (config validation) | N/A |
| T-004 | N/A | Build artifacts verification |
| T-005 | N/A | CI pipeline verification |
| T-006 | N/A | Full cycle verification |

### Task Completion Time

| Task ID | Estimated | Target |
|---------|-----------|--------|
| T-001 | 2-3 hours | 3 hours max |
| T-002 | 3-4 hours | 4 hours max |
| T-003 | 2-3 hours | 3 hours max |
| T-004 | 2-3 hours | 3 hours max |
| T-005 | 3-4 hours | 4 hours max |
| T-006 | 2-3 hours | 3 hours max |

**Total Estimated:** 14-20 hours (2-3 working days)

### Build and Run Stability

- Build должен быть детерминированным (идентичный output при идентичном input)
- Build должен быть reproducible (работает на любой машине с Node.js 20)
- All npm scripts должны возвращать корректный exit code
- No silent failures

---

## 8. Risks and Edge Cases

### Known Edge Cases

| Edge Case | Risk Level | Mitigation |
|-----------|------------|------------|
| pnpm vs npm compatibility | Low | Указать pnpm в engines и README |
| ESM/CJS dual package hazard | Medium | careful exports configuration, conditional exports |
| ESLint flat config compatibility | Low | Use latest ESLint 9.x with typescript-eslint |
| Biome vs ESLint conflicts | Low | Configure Biome for formatting only, ESLint for linting |
| Windows path issues | Low | Local-first Linux/macOS, use path.posix in scripts |

### Risky Scenarios

| Scenario | Impact | Probability | Mitigation |
|----------|--------|-------------|------------|
| Husky pre-commit blocks legitimate commit | High frustration | Low | Add --no-verify option documented |
| CI cache invalidation issues | Slow CI | Medium | Use pnpm lockfile hash for cache key |
| TypeScript version mismatch | Type errors | Low | Pin typescript version in root package.json |
| Workspace resolution fails | Build fails | Low | Verify pnpm-workspace.yaml syntax |

### Dependency-Related Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Breaking changes in ESLint 9 | High | Pin version, review changelog before upgrade |
| tsup API changes | Medium | Pin version, use stable API |
| Node.js 20 EOL | Low (LTS until 2026) | Plan migration to Node.js 22+ in V1/V2 |

---

## 9. Notes

### Assumptions

1. **Package Manager:** pnpm выбран как основной (PROJECT_PROFILE.md указывает pnpm как preferred)
2. **Node.js Version:** 20 LTS -- единственная версия для MVP (matrix testing в V1)
3. **Build Tool:** tsup выбран вместо чистого esbuild для удобства (dts generation из коробки)
4. **CI Platform:** GitHub Actions (PROJECT_PROFILE.md указывает GitHub Actions)
5. **Pre-commit Hooks:** Husky + lint-staged (стандартный выбор для Node.js monorepo)

### Clarifications

1. **turbo/nx:** Опционально для MVP. Добавить если build time станет проблемой.
2. **pnpm workspaces:** Используем встроенную поддержку workspaces в pnpm (не Lerna)
3. **Types package scope:** @osai/* -- использовать как scope для всех пакетов
4. **ESM first:** ESM -- primary format, CJS -- для совместимости

### Planning Notes

1. **Parallel Development:** T-002, T-003, T-004 могут разрабатываться параллельно после T-001
2. **Critical Path:** T-001 -> T-002 -> T-005 -> T-006
3. **Verification:** T-006 -- критически важная задача, не пропускать
4. **Documentation:** README.md обновляется в T-006, не раньше

---

## Appendix A: File Structure After F-001

```
osai/
├── .github/
│   └── workflows/
│       └── ci.yml
├── .husky/
│   └── pre-commit
├── .vscode/
│   └── settings.json
├── apps/
│   └── .gitkeep
├── docs/
│   └── roadmaps/
│       └── ROADMAP_TASKS_F-001.md
├── packages/
│   └── types/
│       ├── dist/
│       │   ├── index.cjs
│       │   ├── index.cjs.map
│       │   ├── index.d.ts
│       │   ├── index.mjs
│       │   └── index.mjs.map
│       ├── src/
│       │   ├── domain.ts
│       │   ├── errors.ts
│       │   ├── index.ts
│       │   └── messages.ts
│       ├── __tests__/
│       │   └── message-types.test.ts
│       ├── package.json
│       ├── tsconfig.json
│       └── tsup.config.ts
├── scripts/
│   ├── clean.js
│   ├── test-types-import.mjs
│   └── verify-setup.sh
├── tests/
│   ├── e2e/
│   ├── integration/
│   └── unit/
├── workspace/
│   └── .gitkeep
├── .editorconfig
├── .gitignore
├── .nvmrc
├── .prettierrc
├── .prettierignore
├── biome.json
├── eslint.config.js
├── package.json
├── pnpm-lock.yaml
├── pnpm-workspace.yaml
├── README.md
├── tsconfig.json
└── tsup.config.ts
```

---

## Appendix B: npm scripts Summary

| Script | Command | Description |
|--------|---------|-------------|
| `lint` | `eslint .` | Run ESLint on all files |
| `lint:fix` | `eslint . --fix` | Run ESLint with auto-fix |
| `format` | `prettier --write .` | Format all files with Prettier |
| `format:check` | `prettier --check .` | Check formatting without changes |
| `type-check` | `tsc --noEmit` | Run TypeScript type checking |
| `build` | `pnpm -r build` | Build all packages |
| `build:watch` | `pnpm -r build:watch` | Build all packages in watch mode |
| `test` | `vitest run` | Run all tests |
| `test:watch` | `vitest` | Run tests in watch mode |
| `clean` | `node scripts/clean.js` | Remove all dist/ directories |
| `verify` | `./scripts/verify-setup.sh` | Run full verification |

---

*End of Task Roadmap: Monorepo Infrastructure v1.0*
