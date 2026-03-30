# Implementation Report -- T-006: Cross-Platform Support (Linux + Windows)

## Implemented Scope

Создан единый source of truth для platform detection (`packages/shared/src/platform.ts`).
Исправлены все найденные hardcoded path separators. Централизована shell configuration
для child_process spawn. Все существующие тесты (389) продолжают проходить.

**In scope (roadmap T-006):**
- `packages/shared/src/platform.ts` -- утилита: isLinux, isWindows, pathSeparator, shell, env, homeDir
- Обновлён barrel export в `packages/shared/src/index.ts`
- Проверены и исправлены все path.join()/fs вызовы
- Обновлён child_process spawn -- shell option зависит от platform
- Создан `tests/unit/shared/platform.test.ts` (48 тестов)
- Обновлён `vitest.config.ts` с resolve alias для @osai/shared

**Out scope:**
- `scripts/check-native-modules.ts` (не в scope текущей задачи, зависит от нативных модулей)
- `package.json` optionalDependencies (requires native module analysis, отложено)
- macOS support (явно out of scope)

## Tests Implemented

**Файл:** `tests/unit/shared/platform.test.ts` (48 тестов)

### Platform Detection (6 тестов)
- exactly one of isLinux or isWindows is true
- platform matches the current OS
- isLinux matches process.platform on Linux
- isWindows matches process.platform on Windows
- getPlatform returns a valid OsaiPlatform value
- getPlatform throws on unsupported platform in development

### Path Constants (7 тестов)
- pathSeparator matches os path.sep
- homeDir returns a non-empty string
- homeDir matches os.homedir()
- tempDir returns a non-empty string
- tempDir matches os.tmpdir()
- pathSeparator is forward slash on Linux
- pathSeparator is backslash on Windows

### osai Directory Paths (7 тестов)
- getOsaiDir returns path ending with .osai
- getOsaiDir uses path.join (no hardcoded separators)
- getOsaiDataDir returns path ending with .osai/data
- getOsaiDbPath returns path ending with osai.db
- getOsaiLogDir returns path ending with .osai/logs
- getTelegramSessionDir returns correct nested path
- all osai paths use the correct platform separator

### Shell Configuration (7 тестов)
- shell is /bin/sh on Linux
- shell is cmd.exe on Windows
- shellArgs is [-c] on Linux
- shellArgs is [/c] on Windows
- buildShellCommand returns correct array on Linux
- buildShellCommand returns correct array on Windows
- shellArgs is readonly (Object.isFrozen)

### Cross-Platform Helpers (14 тестов)
- expandHome: 6 тестов (tilde expansion, absolute/relative paths, edge cases)
- normalizePath: 3 теста (dot segments, double-dot segments, tilde + normalize)
- isPathWithin: 7 тестов (nested paths, siblings, prefix collision, tilde expansion)

### Environment Variable Handling (4 теста)
- homeEnvVar is HOME on Linux
- homeEnvVar is USERPROFILE on Windows
- getHomeFromEnv returns a non-empty string
- getHomeFromEnv matches homeDir when env vars are set

### Integration: No Hardcoded Separators (1 тест)
- all osai paths are consistent with path.join output

### Test Coverage
- 48 тестов покрывают все экспортируемые функции platform.ts
- Условные тесты (isLinux/isWindows) выполняются только на соответствующей платформе
- Итого: 389 тестов во всём проекте (включая 48 новых), все проходят

## Code Changes

### Files Added
- `packages/shared/src/platform.ts` -- Platform detection utility (single source of truth)
- `tests/unit/shared/platform.test.ts` -- 48 unit tests for platform module

### Files Modified
- `packages/shared/src/index.ts` -- добавлены barrel exports для platform module
- `packages/shared/package.json` -- добавлен export `"./platform.js"` для submodule imports
- `packages/skills-core/src/security/shell/ShellSecurity.ts` -- заменён inline platform detection на импорт из @osai/shared/platform.js
- `packages/skills-core/src/skills/shell/ShellSkill.ts` -- заменён inline platform detection на импорт из @osai/shared/platform.js
- `packages/gateway/src/security/telegram/SessionEncryption.ts` -- исправлен hardcoded `/tmp` fallback на `homedir()`
- `packages/gateway/src/security/telegram/__tests__/SessionEncryption.test.ts` -- исправлены hardcoded `/tmp` paths на `os.tmpdir()`
- `vitest.config.ts` -- добавлен resolve alias для @osai/shared в root project

## Architectural Compliance

- **Barrel exports:** platform.ts экспортируется через `packages/shared/src/index.ts` и как submodule
- **ESM:** все imports используют ESM синтаксис (import/export), `type: "module"` в package.json
- **TypeScript strict:** все типы явно указаны, используется `readonly`, `as const`
- **Cross-cutting concern:** platform.ts находится в shared package (DOMAIN-independent)
- **Single source of truth:** все пакеты импортируют platform detection из одного модуля
- **path.join() everywhere:** проверены все path operations в codebase, никакие hardcoded разделители
- **child_process shell:** centralised через platform.ts (shell, shellArgs, buildShellCommand)

## Deviations

### 1. `scripts/check-native-modules.ts` не создан
**Причина:** Roadmap указывает этот скрипт, но он зависит от нативных модулей (better-sqlite3, sqlite-vec), которые в данный момент не сконфигурированы для prebuild. Создание скрипта без реальных нативных модулей нецелесообразно. Рекомендуется реализовать в рамках T-007 (CI matrix) при наличии реальных сборок.

### 2. `package.json` optionalDependencies не обновлён
**Причина:** Анализ optionalDependencies требует понимания конкретных нативных модулей и их платформенных бинарников. Эта задача более уместна при настройке CI в T-007.

### 3. Импорт `@osai/shared/platform.js` вместо submodule path
**Причина:** Vite/vitest resolve не поддерживает submodule exports с точкой в package alias. Вместо этого используется barrel export через `@osai/shared`, который реэкспортирует все platform functions. Submodule export path сохранён в package.json exports для production use.

## Known Limitations

- **macOS не поддерживается:** `getPlatform()` в development mode бросает ошибку для неподерживаемых платформ, в production fallback на linux
- **isLinux/isWindows -- module-level constants:** определяются один раз при загрузке модуля. Не предназначены для динамического изменения. Для тестирования используются conditional checks (if/isLinux/if/isWindows)
- **ShellSecurity.ts и ShellSkill.ts:** используют `isWindows` из platform.ts, но локальный `const isWindows` в ShellSecurity.ts был удалён только в execute(). Kill-секция использует импортированный `isWindows` -- корректно
