# Implementation Report -- T-003

## Implemented Scope

Реализован UserbotBridge -- Node.js сторона bridge для управления Python Telethon microservice через child_process.

**Реализовано:**
- Класс `UserbotBridge` в `packages/gateway/src/channels/telegram/userbot.ts`
- JSON-over-stdio протокол: line-delimited JSON, request/response корреляция по `id`
- Методы: `start()`, `stop()`, `sendMessage()`, `getChats()`, `healthCheck()`
- Auto-restart при краше Python процесса с конфигурируемым лимитом (`maxRestartAttempts`)
- Таймаут health check (`healthCheckTimeoutMs`)
- Обработка невалидного JSON от Python: логирование warning, без краша Node.js
- `onMessage` callback для входящих сообщений от Python (unsolicited message responses)
- Сброс счётчика рестартов при успешной коммуникации
- Barrel exports через `telegram/index.ts`, `channels/index.ts`, `gateway/src/index.ts`

**Не в scope (по roadmap):**
- Python-код Telethon (T-004)
- Интеграция с TelegramManager (будет в отдельной задаче)

## Tests Implemented

**Файл:** `packages/gateway/src/channels/telegram/__tests__/userbot-bridge.test.ts`

**28 тестов, все проходят:**

| Секция | Тест | Описание |
|--------|------|----------|
| construction | 3 теста | Создание bridge, custom logger, expose config |
| lifecycle | 6 тестов | start/stop, spawn args, double start, stop without start, restart cycle |
| JSON-over-stdio protocol | 3 теста | Line-delimited JSON, корреляция по id (out-of-order), error response |
| methods | 5 тестов | sendMessage, getChats, healthCheck, timeout, pre-start guard |
| message callback | 3 теста | onMessage invocation, correlated response filtering, no callback case |
| auto-restart | 3 теста | Crash restart, max attempts limit, counter reset on success |
| invalid JSON handling | 3 теста | Invalid JSON log, partial JSON, empty lines |
| UserbotBridgeError | 2 теста | Error construction, error with cause |

**Мокирование:** `node:child_process.spawn` -- полная симуляция ChildProcess через `vi.hoisted()` + `vi.mock()` factory.

## Code Changes

### Добавленные файлы

| Файл | Описание |
|------|----------|
| `packages/gateway/src/channels/telegram/userbot.ts` | UserbotBridge класс (основная реализация) |
| `packages/gateway/src/channels/telegram/__tests__/userbot-bridge.test.ts` | Unit tests (28 тестов) |

### Изменённые файлы

| Файл | Изменение |
|------|-----------|
| `packages/gateway/src/channels/telegram/index.ts` | Добавлены экспорты `UserbotBridge`, `UserbotBridgeError`, `UserbotBridgeConfig` |
| `packages/gateway/src/channels/index.ts` | Добавлены re-exports из `telegram/index.js` |
| `packages/gateway/src/index.ts` | Добавлены re-exports UserbotBridge и TelegramBot |

## Architectural Compliance

- **Bridge pattern (AD-006):** UserbotBridge управляет Python child_process через stdio -- соответствует архитектурному решению
- **Bridge Protocol:** JSON-over-stdio с line-delimited JSON и корреляцией по id -- соответствует спецификации из ARCHITECTURE_OVERVIEW.md
- **TypeScript strict mode:** Все типы строго определены, нет `any`
- **pino logging:** Структурированный JSON лог с child logger
- **ESM:** Все импорты используют `.js` extensions
- **Barrel exports:** Чистые экспорты через index.ts
- **Graceful degradation:** При ошибке spawn/stop -- логирование без краша
- **Error handling:** Custom `UserbotBridgeError` extends Error

## Deviations

Отклонений от roadmap нет.

## Known Limitations

- При рестарте после краша новый ChildProcess mock не наследует stdin/stdout слушатели от предыдущего процесса -- это корректное поведение, так как каждый spawn создаёт новый процесс
- Тест для "should expose configuration" использует проверку полей вместо `toBe`, т.к. `getConfig()` возвращает расширенный объект с default-значениями
- Ошибки компиляции в `bot.ts` (T-002) -- не в scope T-003, не исправлялись
