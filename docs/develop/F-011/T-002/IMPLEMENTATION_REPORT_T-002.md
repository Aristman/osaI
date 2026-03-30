# Implementation Report -- T-002: Gateway Protocol + Message Router

**Feature:** F-011 CLI Client
**Domain:** DOMAIN-011
**Profile:** frontend-cli (AGENT_PROFILE_cli.md)
**Date:** 2026-03-31

---

## Implemented Scope

Реализован клиент WS-протокола Gateway для отправки сообщений (message, command, permission_response, subscribe) и message router для маршрутизации входящих сообщений (tool_stream, block, permission_request) по обработчикам. Невалидный JSON логируется без краша приложения.

**In scope:**
- Типы исходящих сообщений (Client -> Gateway): `ClientMessage`, `ClientCommand`, `ClientPermissionResponse`, `ClientSubscribe`
- Типы входящих сообщений (Gateway -> Client): `ToolStreamMessage`, `BlockStreamMessage`, `PermissionRequestMessage`
- Функции отправки: `sendUserMessage`, `sendCommand`, `sendPermissionResponse`, `sendSubscribe`
- `MessageRouter` -- маршрутизация входящих сообщений через EventEmitter
- Barrel exports в `src/index.ts`
- Невалидный JSON -- логирование через pino, emit события `error`, без краша

**Out of scope:**
- TUI rendering (T-003)
- Конкретные команды (T-004, T-005)
- Permission prompt UI (T-006)

---

## Tests Implemented

| ID | Description | Status |
|----|-------------|--------|
| TT-002-01 | Отправка message типа в Gateway -- корректный JSON, session_id, chat_id | Passed |
| TT-002-02 | Отправка command типа в Gateway -- payload, args, chat_id | Passed |
| TT-002-03 | Отправка permission_response (allow/deny) -- request_id | Passed |
| TT-002-04 | Приём tool_stream -- handler получает tool, action, chunk, progress | Passed |
| TT-002-05 | Приём block -- handler получает block_type, content, language | Passed |
| TT-002-06 | Приём permission_request -- handler получает request_id, risk_level | Passed |
| TT-002-07 | Невалидный JSON -- логирование, без краша, продолжение работы | Passed |

**Дополнительные тесты (coverage):**
- Subscribe отправка с events и chat_id
- Неизвестный тип сообщения -- emit error
- Сообщение без поля type -- emit error
- Повторный attach -- warning без краша
- Detach без attach -- без краша
- Отсутствие обработки сообщений после detach

**Total:** 18 новых тестов, 30 всего в пакете, все passed.

**Test files:**
- `packages/cli/src/__tests__/protocol.test.ts` -- 9 tests
- `packages/cli/src/__tests__/message-router.test.ts` -- 9 tests

---

## Code Changes

### Files added
- `packages/cli/src/ws/protocol.ts` -- типы протокола и функции отправки сообщений
- `packages/cli/src/ws/message-router.ts` -- MessageRouter (EventEmitter-based)
- `packages/cli/src/__tests__/protocol.test.ts` -- тесты отправки (TT-002-01..03)
- `packages/cli/src/__tests__/message-router.test.ts` -- тесты маршрутизации (TT-002-04..07)

### Files modified
- `packages/cli/src/index.ts` -- barrel exports для protocol и message-router типов/функций

---

## Architectural Compliance

- **TypeScript strict mode:** все файлы компилируются с `"strict": true` (tsconfig.base.json)
- **ESM:** `package.json` имеет `"type": "module"`, импорты используют `.js` extensions
- **pino logging:** MessageRouter принимает опциональный logger, создаёт default если не предоставлен
- **EventEmitter pattern:** MessageRouter расширяет EventEmitter с типизированными событиями
- **Профиль AGENT_PROFILE_cli.md:** код следует CLI interface design rules (explicit, no silent failures), error handling rules (explicit, descriptive), security constraints (external input treated as untrusted)
- **Архитектура ARCHITECTURE_OVERVIEW.md:** типы сообщений соответствуют контракту WebSocket Protocol (раздел 4.1)

---

## Deviations

Нет отклонений от roadmap.

---

## Known Limitations

- `MessageRouter` не валидирует полную структуру сообщений (например, наличие обязательных полей в tool_stream). Это допустимо -- router маршрутизирует по полю `type`, валидация полей делегируется downstream handlers.
- Mock client в тестах протокола не имитирует `JSON.stringify` на уровне WS, а делает это на уровне mock -- поведение эквивалентно реальному `GatewayClient.send()`.
