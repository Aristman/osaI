# Implementation Report -- F-003 T-002: Config Loader

## Implemented Scope

Реализован `ConfigLoader` класс с функциями: загрузка JSON файла, валидация по схеме, применение дефолтных значений, проверка file permissions, singleton-паттерн через кэширование.

**В рамках scope:** `loadConfigSync`, `loadConfig` (async), `getConfig` (singleton), `validateAndNormalize`, path helpers, error classes, permission warnings, cache management.

## Tests Implemented

- `loader.test.ts` -- 26 тестов:
  - `T002-UT-01`: загрузка валидного конфига
  - `T002-UT-02`: merge defaults с partial config
  - `T002-UT-03`: `ConfigNotFoundError` для отсутствующего файла
  - `T002-UT-04`: `ConfigParseError` для невалидного JSON
  - `T002-UT-05`: `ConfigValidationError` для schema violation
  - `T002-UT-06`: warning о insecure permissions
  - `T002-UT-07`: sync loader
  - `T002-UT-08`: кэширование результата
  - `T002-UT-09`: cache invalidation через `forceReload`
  - `T002-IT-01`: загрузка из реальной filesystem
  - `T002-IT-02`: загрузка через symlink
  - Async loader, cache management, path helpers, `validateAndNormalize`
  - Error classes: `ConfigNotFoundError`, `ConfigParseError`, `ConfigValidationError`, `ConfigPermissionWarning`

## Code Changes

- `/home/aristman/projects/osai/packages/config/src/loader.ts` -- новый файл (loader, path helpers, cache, singleton)
- `/home/aristman/projects/osai/packages/config/src/errors.ts` -- новый файл (typed error classes)
- `/home/aristman/projects/osai/packages/config/src/__tests__/loader.test.ts` -- новый файл (26 unit тестов)

## Architectural Compliance

- Singleton pattern через module-level cache
- File permissions check (warning для group/others readable)
- Custom error classes с error codes и details
- Sync API для startup, async API для совместимости

## Deviations

Нет отклонений.

## Known Limitations

- Permission check -- warning только, не enforcement
- Singleton reset (`resetLoaderState`) предназначен для тестов
