# Implementation Report -- F-003 T-003: Directory Structure Initialization

## Implemented Scope

Реализована функция `initializeOsaiDirectory` для создания структуры директорий `~/.osai/` и файла `openclaw.json` с defaults. Idempotent operation.

**В рамках scope:** создание ~/.osai/, ~/.osai/openclaw.json (0600), ~/.osai/data/, ~/.osai/logs/, ~/.osai/workspace/, ~/.osai/sessions/, ~/.osai/memory/, ~/.osai/workspace/skills/ -- directories (0700).

## Tests Implemented

- `init.test.ts` -- 22 теста:
  - `T003-UT-01`: getExpectedPaths возвращает пути под ~/.osai/
  - `T003-UT-02`: создание всех директорий
  - `T003-UT-03`: создание openclaw.json с defaults
  - `T003-UT-04`: permissions 0600 для openclaw.json
  - `T003-UT-05`: permissions 0700 для директорий
  - `T003-UT-06`: idempotency
  - `T003-UT-07`: не перезаписывает существующий openclaw.json
  - `T003-IT-01`: полная инициализация на реальной FS
  - `isOsaiDirectoryInitialized`: true/false
  - `directoriesOnly` option
  - `initializeOsaiDirectorySync`: sync version
  - `ensureDirectory`, `ensureFile` helpers
  - `T003-IT-02`: custom osaiDir path

## Code Changes

- `/home/aristman/projects/osai/packages/config/src/init.ts` -- новый файл (init function, helpers, layout definition)
- `/home/aristman/projects/osai/packages/config/src/__tests__/init.test.ts` -- новый файл (22 unit теста)

## Architectural Compliance

- Idempotent operation (безопасно вызывать многократно)
- Directory mode 0700, file mode 0600
- Поддержка custom osaiDir (для тестов и advanced usage)
- Sync и async API

## Deviations

Нет отклонений.

## Known Limitations

- `chmodSync` может не работать на некоторых filesystems (silent ignore)
