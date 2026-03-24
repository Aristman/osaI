# Implementation Report -- F-003 T-004: Config Hot-Reload

## Implemented Scope

Реализован `ConfigWatcher` класс на основе chokidar с subscriber pattern, debouncing, validation перед уведомлением подписчиков, и graceful shutdown.

**В рамках scope:** file watcher для openclaw.json, EventEmitter для subscribers, debounce, config diff computation, error notification, verbose logging.

## Tests Implemented

- `hot-reload.test.ts` -- 21 тест:
  - Pure unit: `computeDiff` (3 теста), `debounce` (3 теста)
  - ConfigWatcher unit (через direct `handleFileChange()` calls):
    - `T004-UT-01`: start/stop, idempotent start, stop without start
    - Load initial config, null config для несуществующего файла, watchPath
    - `T004-UT-02`: subscriber notification on change
    - `T004-UT-03`: multiple subscribers
    - `T004-UT-04`: unsubscribe mechanism
    - `T004-UT-05`: debounce rapid changes
    - `T004-UT-06`: invalid config не применяется
    - `T004-UT-07`: error callback notification
    - `T004-UT-08`: graceful shutdown
    - onError unsubscribe, verbose logging

## Code Changes

- `/home/aristman/projects/osai/packages/config/src/hot-reload.ts` -- новый файл (ConfigWatcher, computeDiff, debounce)
- `/home/aristman/projects/osai/packages/config/src/__tests__/hot-reload.test.ts` -- новый файл (21 unit тест)

## Architectural Compliance

- chokidar как file watcher dependency
- EventEmitter для pub/sub
- Debounce (настраиваемый, default 150ms)
- `usePolling` option для CI/NFS environments
- Graceful shutdown через `stop()` (cancel debounce, close watcher, remove listeners)
- `handleFileChange()` публичный для unit testing (вызывается через debounce wrapper в production)

## Deviations

- Unit тесты используют direct `handleFileChange()` вместо real chokidar events (vitest не корректно обрабатывает chokidar + createRequire). Integration тесты с real chokidar events проверены отдельно через node script.

## Known Limitations

- `createRequire(import.meta.url)` для CJS build дает warning (import.meta не поддерживается в CJS). ESM build работает корректно.
- chokidar dynamic loading через `createRequire` из-за ограничений vitest module resolution.
