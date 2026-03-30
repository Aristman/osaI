# Implementation Report -- T-006 (Streaming + Persistence)

## Implemented Scope

Реализованы два модуля для задачи T-006 (Streaming + Persistence) в рамках Feature F-008 (Agent Runtime):

1. **StreamManager** -- управление потоковой передачей inference chunks клиенту
   - Принимает `AsyncIterable<InferenceChunk>` и вызывает callback для каждого chunk
   - Накапливает полный текст ответа
   - Генерирует события `complete` и `chunk` через EventEmitter
   - Поддерживает множественные слушатели, removeListener, removeAllListeners

2. **PersistenceService** -- персистенция сообщений чата в SQLite
   - Сохранение user/assistant/tool сообщений в таблицу `chat_messages`
   - Все записи содержат `chat_id`, `session_id`, `trace_id` (в metadata JSON)
   - Параметризованные SQL запросы (prepared statements)
   - Возврат истории в формате `ChatMessage[]`

Строго в рамках scope, определённого в roadmap T-006. Без выходящих за рамки расширений.

## Tests Implemented

### StreamManager.test.ts (17 tests)

| Категория | Тесты | Критерии |
|---|---|---|
| constructor | без callback, с callback | корректное создание |
| processStream | callback вызывается N раз | TC-006-1 |
| processStream | emit complete event | TC-006-2 |
| processStream | накопление полного текста | корректность |
| processStream | пустой stream | graceful handling |
| processStream | tool calls в chunk | pass-through |
| processStream | model/provider из последнего chunk | корректность |
| getAccumulatedText | возвращает накопленный текст | API проверка |
| reset | новый processStream сбрасывает текст | state isolation |
| events | multiple listeners | EventEmitter API |
| events | removeListener | EventEmitter API |
| events | removeAllListeners | EventEmitter API |
| events | chunk event | lifecycle |

### PersistenceService.test.ts (17 tests)

| Категория | Тесты | Критерии |
|---|---|---|
| saveUserMessage | сохранение в SQLite | TC-006-3 |
| saveUserMessage | генерация UUID id | формат |
| saveUserMessage | metadata с session_id + trace_id | TC-006-6 |
| saveAssistantMessage | сохранение ответа | TC-006-4 |
| saveAssistantMessage | metadata с trace_id | TC-006-6 |
| saveAssistantMessage | без tool calls | graceful handling |
| saveAssistantMessage + toolCalls | сохранение tool calls | TC-006-5 |
| saveAssistantMessage + toolCalls | множественные tool calls | корректность |
| saveToolResult | role=tool + content | корректность |
| saveToolResult | metadata с tool_call_id | TC-006-6 |
| getChatHistory | порядок по created_at ASC | корректность |
| getChatHistory | параметр limit | корректность |
| getChatHistory | tool_calls в ответе | pass-through |
| getChatHistory | tool_call_id в ответе | pass-through |
| getChatHistory | пустой чат | пустой массив |
| getChatHistory | изоляция по chat_id | корректность |
| getChatHistory | без limit = все сообщения | корректность |

**Total: 34 tests, 34 passed.**

## Code Changes

### Files added

| Файл | Описание |
|---|---|
| `packages/agent/src/streaming/types.ts` | StreamChunk, StreamEvent, StreamCallback |
| `packages/agent/src/streaming/StreamManager.ts` | StreamManager class (EventEmitter) |
| `packages/agent/src/streaming/index.ts` | Barrel export |
| `packages/agent/src/streaming/__tests__/StreamManager.test.ts` | 17 unit tests |
| `packages/agent/src/persistence/PersistenceService.ts` | PersistenceService class |
| `packages/agent/src/persistence/index.ts` | Barrel export |
| `packages/agent/src/persistence/__tests__/PersistenceService.test.ts` | 17 unit tests |
| `docs/develop/F-008/T-006/IMPLEMENTATION_REPORT_T-006.md` | Данный отчёт |

### Files modified

| Файл | Изменение |
|---|---|
| `packages/agent/src/index.ts` | Добавлены exports для streaming и persistence модулей |
| `packages/agent/package.json` | Добавлены devDependencies: `better-sqlite3`, `@types/better-sqlite3` |

## Architectural Compliance

- **DI через конструктор**: StreamManager принимает optional callback, PersistenceService принимает `Database.Database`
- ** barrel exports**: каждый модуль имеет index.ts с re-exports
- **TypeScript strict mode**: все файлы проходят `tsc --noEmit` без ошибок
- **Parameterized SQL queries**: PersistenceService использует prepared statements с `?` placeholders
- **Synchronous API (better-sqlite3)**: все SQL операции синхронные (`db.prepare().run()`)
- **EventEmitter pattern**: StreamManager наследует от `node:events.EventEmitter`
- **In-memory SQLite для тестов**: PersistenceService.test.ts создаёт `:memory:` базу с требуемой схемой
- **Profile compliance**: AGENT_PROFILE_nodejs -- TypeScript strict, barrel exports, DI, unit tests с vitest

## Deviations

Отклонений от roadmap нет. Все checklist-пункты T-006 реализованы.

## Known Limitations

1. **PersistenceService не управляет жизненным циклом Database** -- ожидает, что вызывающий код закрывает соединение через `DatabaseManager.close()` или `db.close()`.
2. **ORDER BY created_at может дать одинаковый порядок** для записей в одной секунде -- в getChatHistory с limit используется `ORDER BY rowid DESC` для детерминизма.
3. **Нет транзакционной обертки** для сохранения полного conversation turn (user + assistant + tool results) -- каждая операция insert является отдельной транзакцией. Транзакционная семантика может быть добавлена при интеграции в T-008.
