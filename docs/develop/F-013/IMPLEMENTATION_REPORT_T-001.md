# Implementation Report -- T-001: Vitest Configuration + Unit Test Infrastructure

## Implemented Scope

Настроена root-level тестовая инфраструктура для monorepo:
- Root `vitest.config.ts` с workspace project resolver (test.projects)
- Глобальный test setup (environment variables, cleanup hooks)
- Переиспользуемые mock-утилиты (mock-fs, mock-sqlite, mock-ws)
- Barrel exports для helpers
- Скрипты в package.json: test:unit, test:coverage, test:ci
- .nvmrc для pin Node.js 22
- Smoke test, подтверждающий работоспособность конфигурации

**In scope only.** Написание unit tests для пакетов -- вне scope (T-002, T-003).

## Tests Implemented

| Test File | Tests | Status |
|---|---|---|
| `tests/unit/examples/config-smoke.test.ts` | 5 | PASS |

### Smoke test coverage:
- Vitest запускается и обнаруживает root-level тесты
- Globals (describe, it, expect) доступны
- Setup file (tests/setup.ts) выполняется -- env variables установлены
- createTempDir / createTempFile / cleanupTempDirs работают корректно
- createMockStructure создаёт файловое дерево корректно

## Code Changes

### Files Added

| File | Purpose |
|---|---|
| `vitest.config.ts` (modified) | Root vitest config: workspace projects, coverage (v8), aliases |
| `tests/setup.ts` | Global test setup: env variables, cleanup hooks |
| `tests/helpers/index.ts` | Barrel exports for test helpers |
| `tests/helpers/mock-fs.ts` | Temp directory management utilities |
| `tests/helpers/mock-sqlite.ts` | In-memory SQLite factory + core schema |
| `tests/helpers/mock-ws.ts` | WebSocket server/client test utilities |
| `tests/unit/examples/config-smoke.test.ts` | Smoke test (5 assertions) |
| `.nvmrc` | Pin Node.js 22 |

### Files Modified

| File | Changes |
|---|---|
| `package.json` | Added scripts: test:unit, test:coverage, test:ci |

### Files Removed

| File | Reason |
|---|---|
| `vitest.workspace.ts` (created then removed) | Deprecated in vitest 3.x; replaced with test.projects in vitest.config.ts |

## Architectural Compliance

- **ESM only**: все файлы используют `.js` extensions в imports (Node16 moduleResolution)
- **Barrel exports**: helpers/index.ts обеспечивает единый import path
- **pnpm workspace**: конфигурация совместима с workspace layout
- **TypeScript strict**: все новые файлы следуют strict mode conventions
- **Profile compliance**: nodejs agent profile -- vitest для тестирования, ESM modules, barrel exports

## Deviations

1. **vitest.workspace.ts --> test.projects**: Roadmap указывал `vitest.workspace.ts`, но vitest 3.2.4 показывает deprecation warning и рекомендует `test.projects` field в `vitest.config.ts`. Использован рекомендуемый подход.

2. **test:unit script uses path pattern instead of --project**: Inline project definitions в `test.projects` не поддерживают фильтрацию через `--project <name>` в vitest 3.x. Скрипт `test:unit` использует `vitest run tests/` вместо `vitest run --project root`.

3. **Coverage thresholds not enforced at root level**: Глобальные coverage thresholds (80%) убраны из root config. Каждый package задаёт свои thresholds в собственном vitest.config.ts. Root project не меряет coverage -- только пакетные проекты.

4. **WS helpers not re-exported from barrel**: `mock-ws.ts` требует `ws` dependency. Чтобы избежать подтягивания `ws` в тесты, которые его не используют, WS helpers доступны только через прямой import: `import { createWsPair } from "../helpers/mock-ws.js"`.

## Known Limitations

1. **`pnpm test:unit` runs all tests in tests/ directory**, включая pre-existing `tests/unit/shared/platform.test.ts` с 1 failing test (не scope T-001). Для запуска только smoke: `vitest run tests/unit/examples/`.

2. **Only 2 of 13 packages have own vitest.config.ts** (cli, observability). Остальные 11 пакетов включены в root project через include glob при запуске `pnpm test`. По мере добавления vitest.config.ts в другие пакеты -- их нужно добавить в `projects` array.

3. **mock-sqlite.ts uses dynamic require** для better-sqlite3, что работает корректно в vitest, но может потребовать адаптации если vitest изменит handling of dynamic requires.
