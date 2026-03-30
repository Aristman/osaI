# Implementation Report -- T-005: Chat Context Isolation + Switching

## Implemented Scope

Реализован ChatContextManager -- менеджер контекста чатов, обеспечивающий:
- Строгую изоляцию контекста между чатами (сообщения и state)
- Переключение между чатами с сохранением контекста исходного
- Загрузку контекста целевого чата при переключении
- Отправку WS уведомления `on_chat_switch` всем подключённым клиентам
- Управление in-memory state для каждого чата
- Защиту от переключения на несуществующий чат (текущий контекст не меняется)

**In scope:**
- ChatContextManager (switchChat, getCurrentChat, getContextForChat)
- Контекстная изоляция (сообщения, state)
- on_chat_switch event для WS клиентов
- Валидация целевого чата при switch

**Out scope (as per roadmap):**
- Session-level контекст (F-008)
- Shared memory доступ (F-005)

## Tests Implemented

Все тест-кейсы из roadmap (T-005):

| ID | Description | Status |
|----|-------------|--------|
| TT-009-25 | Контекст чатов изолирован (getMessages(A) != getMessages(B)) | PASS |
| TT-009-26 | switchChat загружает целевой контекст | PASS |
| TT-009-27 | switchChat сохраняет контекст исходного | PASS |
| TT-009-28 | Клиент уведомляется о переключении (WS broadcast) | PASS |
| TT-009-29 | Switch на несуществующий чат -- error, текущий не изменён | PASS |

Дополнительные тесты:
- Изоляция state между чатами
- updateContextState / clearContextState
- getCurrentContext возвращает null при отсутствии активного чата
- Переключение туда-обратно сохраняет контекст
- В payload уведомления включена metadata чата

**Итого:** 15 тестов, все проходят.

## Code Changes

### Files added
- `packages/gateway/src/chat/ChatContextManager.ts` -- реализация ChatContextManager (175 строк)
- `packages/gateway/src/chat/__tests__/ChatContextManager.test.ts` -- тесты (315 строк)

### Files modified
- `packages/gateway/src/chat/index.ts` -- добавлен экспорт ChatContextManager, ChatContextManagerConfig, ChatContext
- `packages/gateway/src/index.ts` -- добавлен ре-экспорт ChatContextManager и связанных типов

## Architectural Compliance

- **Layered Architecture:** ChatContextManager находится в сервисном слое (chat/), использует ChatService для доступа к данным и WsServer для отправки уведомлений.
- **Dependency Injection:** Зависимости (ChatService, WsServer, logger) инжектируются через конструктор.
- **Profile Compliance:** TypeScript strict mode, pino structured logging, parameterized queries (через ChatService), no console.log.
- **Hook Point:** on_chat_switch event отправляется через WS broadcast (интеграция с F-008 -- через этот hook point).
- **State Management:** In-memory stateMap для per-chat state, сообщения загружаются из SQLite при каждом обращении (fresh data guarantee).

## Deviations

Отклонений от roadmap нет. Реализация полностью соответствует секции T-005 roadmap.

## Known Limitations

- In-memory state (stateMap) не персистируется -- при restart процесса state всех чатов сбрасывается. Это допустимо для MVP (session-level persistence -- в F-008).
- `getContextForChat` загружает сообщения из БД при каждом вызове. Для высоконагруженных сценариев может потребоваться кэширование. Для локального single-user приложения это не критично.
- Нет механизма подписки конкретного клиента на чат -- broadcast отправляется всем подключённым клиентам.
