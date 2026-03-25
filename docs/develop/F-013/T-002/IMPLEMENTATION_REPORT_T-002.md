# Implementation Report -- T-002: WS Client + State Management

## Implemented Scope

Реализован WebSocket client и Svelte stores для управления состоянием приложения Dashboard.

- WS client (`ws-client.ts`): подключение/отключение, отправка сообщений, auto-reconnect с exponential backoff, event emitter pattern
- Connection store (`connection.ts`): WS connection state, reconnect attempts, last error
- Sessions store (`sessions.ts`): session list, active session, CRUD операции
- Messages store (`messages.ts`): chat messages per session, поддержка block и tool_stream типов
- Permissions store (`permissions.ts`): pending permission requests, resolve actions, history
- Traces store (`traces.ts`): agent traces с tool calls, durations, token usage
- Barrel export (`index.ts`): re-export всех stores и типов

## Tests Implemented

### ws-client.test.ts (14 tests)
- T002-UNIT-001: инициализация в disconnected state
- T002-UNIT-001: переход к connecting при connect()
- T002-UNIT-001: переход к connected при успешном подключении
- T002-UNIT-001: emit 'connected' event
- T002-UNIT-002: переход к disconnected при close
- T002-UNIT-002: переход к reconnecting при abnormal close
- T002-UNIT-002: emit 'disconnected' event
- send(): отправка JSON через WebSocket
- send(): ошибка при неустановленном соединении
- Event emitter: on/off pattern
- T002-UNIT-005: exponential backoff (1s, 2s, 4s, 8s)
- T002-UNIT-005: сброс backoff при успешном подключении
- disconnect(): закрытие и остановка reconnect
- Message parsing: разбор и emit входящих JSON сообщений

### connection.test.ts (6 tests)
- Initial state is disconnected
- Initial state structure
- Set/get connection URL
- Track reconnect attempts (increment/reset)
- Track last error (set/clear)
- Reset to initial state

### sessions.test.ts (8 tests)
- Initial state
- Set sessions list
- Set active session
- Derived activeSession store
- activeSession null when not set
- Add/update/remove session
- Reset store

### messages.test.ts (8 tests)
- Initial state
- T002-UNIT-003: add block message to store
- T002-UNIT-003: add message to session list
- Update tool stream in place (no duplicates)
- Derived sessionMessages store
- Empty array for non-existent session
- Clear session messages
- Reset entire store

### permissions.test.ts (6 tests)
- Initial state
- T002-UNIT-004: add permission request to pending
- Remove from pending on resolve
- Add to history on resolve
- Derived pendingPermissionCount
- Reset store

### traces.test.ts (7 tests)
- Initial state
- Add trace on started
- Update trace on completion
- Add to session list
- Derived sessionTraces store
- Update token usage
- Reset store

**Total: 49 new tests (74 total including T-001 tests)**

## Code Changes

### Files added
- `apps/dashboard/src/lib/ws-client.ts` -- WebSocket client class
- `apps/dashboard/src/lib/stores/connection.ts` -- connection store
- `apps/dashboard/src/lib/stores/sessions.ts` -- sessions store
- `apps/dashboard/src/lib/stores/messages.ts` -- messages store
- `apps/dashboard/src/lib/stores/permissions.ts` -- permissions store
- `apps/dashboard/src/lib/stores/traces.ts` -- traces store
- `apps/dashboard/src/lib/stores/index.ts` -- barrel exports
- `apps/dashboard/src/lib/__tests__/ws-client.test.ts` -- WS client tests
- `apps/dashboard/src/lib/__tests__/connection.test.ts` -- connection store tests
- `apps/dashboard/src/lib/__tests__/sessions.test.ts` -- sessions store tests
- `apps/dashboard/src/lib/__tests__/messages.test.ts` -- messages store tests
- `apps/dashboard/src/lib/__tests__/permissions.test.ts` -- permissions store tests
- `apps/dashboard/src/lib/__tests__/traces.test.ts` -- traces store tests

### Files modified
- none (только новые файлы)

## Architectural Compliance

- Все типы WS сообщений используются из `apps/dashboard/src/lib/types.ts`
- State management отделено от UI (чистые Svelte stores)
- Side effects (WS connection) изолированы в `ws-client.ts`
- Event emitter pattern в ws-client для подписки stores на WS events
- Все stores являются writable с actions (update/reset)
- Barrel export для удобного импорта
- TypeScript strict mode, noUncheckedIndexedAccess -- совместимо
- Профиль AGENT_PROFILE_web.md соблюден: явное управление state, side effects изолированы

## Deviations

Нет отклонений от роадмапа T-002.

## Known Limitations

- Memory store и status store из scope роадмапа не реализованы (T-002 scope не включает их; они нужны для T-006 и T-007)
- Heartbeat/ping-pong упрощен (не реализован как отдельный механизм; можно добавить при интеграции)
- WS client не подписывает stores автоматически -- подписка будет добавлена при интеграции с UI (T-003, T-005)
