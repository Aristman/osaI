# Implementation Report -- T-004

**Feature:** F-011 CLI Client
**Task:** T-004 -- Chat Commands (list, create, switch, delete, archive)
**Domain:** DOMAIN-011
**Date:** 2026-03-30
**Iteration:** 1

---

## Implemented Scope

Реализованы 5 chat-подкоманд CLI:
- `osai chat list` -- вывод таблицы всех чатов (ID, Name, Status, Last Activity)
- `osai chat create [--name]` -- создание нового чата с выводом chat_id
- `osai chat switch <id>` -- переключение активного чата
- `osai chat delete <id>` -- удаление чата с подтверждением (y/N prompt)
- `osai chat archive <id>` -- архивирование чата

Все команды:
- Отправляют command-type сообщения через Gateway protocol (sendCommand)
- Выводят результат в STDOUT (нормальный результат) / STDERR (ошибки)
- Используют exit codes: 0 = success, 1 = error
- При недоступности Gateway выводят понятное сообщение: "Cannot connect to Gateway. Is the Gateway running? (osai start)"

В рамках задачи также реализован:
- `GatewayConnector` -- helper для подключения к Gateway и выполнения единичной команды с timeout
- Переиспользование существующего `formatTable` из `utils/table.ts`

---

## Tests Implemented

| Файл | Тесты | Описание |
|---|---|---|
| `src/__tests__/ws/gateway-connector.test.ts` | 4 теста | Connection, timeout, command payload, Gateway unavailable |
| `src/__tests__/commands/chat/list.test.ts` | 3 теста | TT-004-01 (table output), empty list, TT-004-06 (Gateway unavailable) |
| `src/__tests__/commands/chat/create.test.ts` | 3 теста | TT-004-02 (create with name), create without name, TT-004-06 |
| `src/__tests__/commands/chat/switch.test.ts` | 3 теста | TT-004-03 (switch success), empty ID validation, TT-004-06 |
| `src/__tests__/commands/chat/delete.test.ts` | 3 теста | TT-004-04 (delete with --yes), empty ID, TT-004-06 |
| `src/__tests__/commands/chat/archive.test.ts` | 4 теста | TT-004-05 (archive with name), archive without name, empty ID, TT-004-06 |

**Итого:** 20 тестов, все проходят.

Покрытие тест-кейсов roadmap:
- TT-004-01:covered (list test -- table with id, name, status, last activity)
- TT-004-02: covered (create test -- success message with chat_id)
- TT-004-03: covered (switch test -- success message)
- TT-004-04: covered (delete test -- confirmation with --yes, success/error)
- TT-004-05: covered (archive test -- success message)
- TT-004-06: covered (all 5 command tests -- Gateway unavailable error)

---

## Code Changes

### Files Added
- `packages/cli/src/ws/gateway-connector.ts` -- helper для выполнения единичной Gateway-команды
- `packages/cli/src/commands/chat/list.ts` -- `runChatList()`
- `packages/cli/src/commands/chat/create.ts` -- `runChatCreate()`
- `packages/cli/src/commands/chat/switch.ts` -- `runChatSwitch()`
- `packages/cli/src/commands/chat/delete.ts` -- `runChatDelete()`
- `packages/cli/src/commands/chat/archive.ts` -- `runChatArchive()`
- `packages/cli/src/commands/chat/index.ts` -- barrel export
- `packages/cli/src/__tests__/ws/gateway-connector.test.ts` -- connector tests
- `packages/cli/src/__tests__/commands/chat/list.test.ts` -- list command tests
- `packages/cli/src/__tests__/commands/chat/create.test.ts` -- create command tests
- `packages/cli/src/__tests__/commands/chat/switch.test.ts` -- switch command tests
- `packages/cli/src/__tests__/commands/chat/delete.test.ts` -- delete command tests
- `packages/cli/src/__tests__/commands/chat/archive.test.ts` -- archive command tests

### Files Modified
- `packages/cli/src/commands/index.ts` -- добавлен экспорт chat-команд
- `packages/cli/src/index.ts` -- добавлены экспорты executeGatewayCommand, GatewayConnectorOptions, CommandResponse, runChatList..runChatArchive

---

## Architectural Compliance

- Команды отправляются через Gateway protocol как `command`-type сообщения (sendCommand из protocol.ts)
- Форматирование таблиц через существующий `formatTable` из utils/table.ts
- pino structured logging для диагностики
- STDOUT для нормального вывода, STDERR для ошибок -- conforme CLI profile
- Exit codes: 0 = success, 1 = error -- conforme POSIX / profile
- GatewayConnector использует GatewayClient с maxRetries=0 (fail fast для CLI)

---

## Deviations

1. Изначально был создан `format/table.ts` с отдельной реализацией formatTable, но обнаружен дубликат `utils/table.ts` от параллельной задачи T-005. Файл `format/table.ts` удалён, команды используют `utils/table.ts`.

2. Команды реализованы как функции (не oclif Command-классы), что соответствует существующему паттерну проекта (см. `channel/add-telegram.ts`). oclif-интеграция (декларативная регистрация) ожидается при интеграции в bin/osai.js.

---

## Known Limitations

- Confirmation prompt в `delete` использует readline (не ink). Для интерактивного TUI потребуется ink-based prompt.
- `GatewayConnector` создает новое соединение для каждой команды (connect -> send -> receive -> disconnect). Для частых команд можно оптимизировать через shared connection pool, но это выходит за рамки T-004.
- Команды пока не интегрированы в bin/osai.js (маршрутизация аргументов CLI). Требуется отдельная задача для обновления CLI entry point.
