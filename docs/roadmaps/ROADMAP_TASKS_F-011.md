# Task Roadmap: CLI Client

**Feature ID:** F-011
**Feature Name:** CLI Client
**Domain:** DOMAIN-011 | **Profile:** frontend-cli (oclif, ink, terminal UI)
**Dependencies:** F-009 (Gateway -- WS client)
**Related Requirements:** FR-019
**Git Branch:** feature/F-011-cli-client

---

## Task T-001: oclif Project Scaffolding + WebSocket Client
**Domain:** DOMAIN-011 | **Dependencies:** None | **Estimated:** 3h

**Description:**
Инициализация пакета `packages/cli` с oclif-фреймворком. Создание базового WebSocket клиента для подключения к Gateway (ws://127.0.0.1:18789). Реализация connection lifecycle (connect, reconnect, disconnect).

**Scope:**
- In: packages/cli/package.json, oclif config, WS client класс с reconnect logic
- Out: ink TUI, команды, Gateway protocol handling

#### Checklist
- [ ] CODE: `packages/cli/package.json`, `packages/cli/tsconfig.json`, `packages/cli/src/ws/gateway-client.ts`, `packages/cli/src/index.ts`
- [ ] TEST: `packages/cli/src/__tests__/gateway-client.test.ts` -- connect/disconnect/reconnect mocks
- [ ] BUILD: `pnpm --filter @osai/cli build`

#### Test Cases
| ID | Description | Expected |
|----|-------------|----------|
| TT-001-01 | WS client connects to ws://127.0.0.1:18789 | Connection established, no error |
| TT-001-02 | WS client reconnects on disconnect (3 retries, exponential backoff) | Reconnect attempts 1s, 2s, 4s |
| TT-001-03 | WS client emits `connected` / `disconnected` events | Listeners receive correct events |
| TT-001-04 | `osai --version` prints version | Version string to STDOUT, exit 0 |

#### Acceptance
- `pnpm --filter @osai/cli build` завершается без ошибок
- WS client подключается к Gateway mock
- Reconnect logic работает при разрыве соединения
- Exit codes: 0 = success, 1 = error

---

## Task T-002: Gateway Protocol + Message Router
**Domain:** DOMAIN-011 | **Dependencies:** T-001 | **Estimated:** 3h

**Description:**
Реализация клиента WS-протокола Gateway: отправка сообщений (message, command, permission_response, subscribe), приём streaming-ответов (tool_stream, block, permission_request). Message router для распределения входящих сообщений по обработчикам.

**Scope:**
- In: GatewayMessage отправка, ToolStreamMessage/BlockStreamMessage/PermissionRequest приём, message router
- Out: TUI rendering, конкретные команды

#### Checklist
- [ ] CODE: `packages/cli/src/ws/protocol.ts`, `packages/cli/src/ws/message-router.ts`
- [ ] TEST: `packages/cli/src/__tests__/protocol.test.ts`, `packages/cli/src/__tests__/message-router.test.ts`
- [ ] BUILD: `pnpm --filter @osai/cli build`

#### Test Cases
| ID | Description | Expected |
|----|-------------|----------|
| TT-002-01 | Отправка message типа в Gateway | Корректный JSON на WS, с session_id |
| TT-002-02 | Отправка command типа в Gateway | Корректный JSON, payload передан |
| TT-002-03 | Отправка permission_response (allow/deny) | Корректный JSON с request_id |
| TT-002-04 | Приём tool_stream -- router вызывает handler | Handler получает tool + action + chunk |
| TT-002-05 | Приём block -- router вызывает handler | Handler получает block_type + content |
| TT-002-06 | Приём permission_request -- router вызывает handler | Handler получает request_id + risk_level |
| TT-002-07 | Невалидный JSON от Gateway -- логирование, без краша | Error logged, no crash |

#### Acceptance
- Все типы сообщений протокола отправляются и принимаются корректно
- Message router распределяет сообщения по типу
- Невалидные данные не вызывают краш

---

## Task T-003: Interactive Chat TUI (ink)
**Domain:** DOMAIN-011 | **Dependencies:** T-001, T-002 | **Estimated:** 4h

**Description:**
Интерактивный TUI для чата на базе ink: область ввода сообщений, область отображения ответов (text, code blocks), статус-бар (текущий чат, модель, статус подключения). Команда `osai` запускает интерактивный режим.

**Scope:**
- In: Chat area, input area, status bar, text + code block rendering, streaming display
- Out: Sidebar чатов, permission prompt UI (T-006)

#### Checklist
- [ ] CODE: `packages/cli/src/tui/app.tsx`, `packages/cli/src/tui/chat-area.tsx`, `packages/cli/src/tui/input-area.tsx`, `packages/cli/src/tui/status-bar.tsx`, `packages/cli/src/commands/chat.ts`
- [ ] TEST: `packages/cli/src/__tests__/tui/chat-area.test.tsx`, `packages/cli/src/__tests__/tui/input-area.test.tsx`, `packages/cli/src/__tests__/tui/status-bar.test.tsx`
- [ ] BUILD: `pnpm --filter @osai/cli build`

#### Test Cases
| ID | Description | Expected |
|----|-------------|----------|
| TT-003-01 | `osai` запускает TUI | Ink app рендерится, stdin активен |
| TT-003-02 | Пользователь вводит текст и нажимает Enter | Сообщение отправлено через Gateway client |
| TT-003-03 | block (text) ответ отображается в chat area | Текст появляется в области чата |
| TT-003-04 | block (code) ответ отображается с подсветкой | Код-блок с language label |
| TT-003-05 | tool_stream обновляет progress | Прогресс-бар обновляется в реальном времени |
| TT-003-06 | Статус-бар показывает: chat name, model, connected/disconnected | Корректное отображение |
| TT-003-07 | Ctrl+C -- корректный выход из TUI | Exit code 0, WS disconnect |

#### Acceptance
- TUI запускается командой `osai`, отображает чат-интерфейс
- Сообщения отправляются и ответы отображаются
- Streaming text рендерится по мере поступления
- Статус-бар обновляется при изменении состояния

---

## Task T-004: Chat Commands (list, create, switch, delete, archive)
**Domain:** DOMAIN-011 | **Dependencies:** T-002 | **Estimated:** 3h

**Description:**
Реализация oclif-команд для управления чатами: `osai chat list`, `osai chat create [--name]`, `osai chat switch <id>`, `osai chat delete <id>`, `osai chat archive <id>`. Команды отправляются через Gateway protocol как command-type messages.

**Scope:**
- In: Все chat subcommands, форматирование вывода (table)
- Out: Chat metadata editing, TUI sidebar integration

#### Checklist
- [ ] CODE: `packages/cli/src/commands/chat/list.ts`, `packages/cli/src/commands/chat/create.ts`, `packages/cli/src/commands/chat/switch.ts`, `packages/cli/src/commands/chat/delete.ts`, `packages/cli/src/commands/chat/archive.ts`
- [ ] TEST: `packages/cli/src/__tests__/commands/chat/list.test.ts`, `packages/cli/src/__tests__/commands/chat/create.test.ts`, `packages/cli/src/__tests__/commands/chat/switch.test.ts`
- [ ] BUILD: `pnpm --filter @osai/cli build`

#### Test Cases
| ID | Description | Expected |
|----|-------------|----------|
| TT-004-01 | `osai chat list` -- выводит таблицу чатов | Table с id, name, status, last activity |
| TT-004-02 | `osai chat create --name "Test"` -- создаёт чат | Success message с chat_id, exit 0 |
| TT-004-03 | `osai chat switch <id>` -- переключает активный чат | Success message, exit 0 |
| TT-004-04 | `osai chat delete <id>` -- удаляет чат | Confirmation prompt, success/error |
| TT-004-05 | `osai chat archive <id>` -- архивирует чат | Success message, exit 0 |
| TT-004-06 | Gateway недоступен -- ошибка с понятным сообщением | STDERR: "Cannot connect to Gateway", exit 1 |

#### Acceptance
- Все 5 chat-команд работают и выводят результат
- Ошибки соединения отображаются корректно
- Exit codes соответствуют результату

---

## Task T-005: Management Commands (session, config, skills, memory, status, channel, init)
**Domain:** DOMAIN-011 | **Dependencies:** T-002 | **Estimated:** 4h

**Description:**
Реализация оставных oclif-команд: `osai session list|resume`, `osai config` (show/edit), `osai skills list`, `osai memory search "query"`, `osai status`, `osai channel add telegram`, `osai init`.

**Scope:**
- In: Все management commands, osai init (создание ~/.osai/ с defaults), osai status (gateway + providers + memory)
- Out: Config validation, advanced filtering

#### Checklist
- [ ] CODE: `packages/cli/src/commands/session/list.ts`, `packages/cli/src/commands/session/resume.ts`, `packages/cli/src/commands/config.ts`, `packages/cli/src/commands/skills/list.ts`, `packages/cli/src/commands/memory/search.ts`, `packages/cli/src/commands/status.ts`, `packages/cli/src/commands/channel/add.ts`, `packages/cli/src/commands/init.ts`
- [ ] TEST: `packages/cli/src/__tests__/commands/init.test.ts`, `packages/cli/src/__tests__/commands/status.test.ts`, `packages/cli/src/__tests__/commands/config.test.ts`, `packages/cli/src/__tests__/commands/skills/list.test.ts`, `packages/cli/src/__tests__/commands/memory/search.test.ts`
- [ ] BUILD: `pnpm --filter @osai/cli build`

#### Test Cases
| ID | Description | Expected |
|----|-------------|----------|
| TT-005-01 | `osai init` -- создаёт ~/.osai/ с defaults | Directory structure, osai.json, exit 0 |
| TT-005-02 | `osai init` при существующей конфигурации -- warning | Warning message, skip creation, exit 0 |
| TT-005-03 | `osai status` -- выводит статус системы | Gateway: connected, Providers: list with status |
| TT-005-04 | `osai config` -- выводит текущую конфигурацию | JSON config to STDOUT |
| TT-005-05 | `osai skills list` -- выводит таблицу skills | Table с name, enabled, tools count |
| TT-005-06 | `osai memory search "query"` -- ищет в памяти | Results list с relevance score |
| TT-005-07 | `osai session list` -- выводит список сессий | Table с id, chat, status, started |
| TT-005-08 | `osai channel add telegram` -- интерактивный prompt | Bot token input, save to config |

#### Acceptance
- Все management-команды работают
- `osai init` создаёт корректную структуру директорий
- `osai status` отображает актуальное состояние Gateway
- Вывод команд форматирован и читаем

---

## Task T-006: Permission Prompt UI + Quick Command + Integration Tests
**Domain:** DOMAIN-011 | **Dependencies:** T-002, T-003 | **Estimated:** 3h

**Description:**
Permission prompt в TUI при получении permission_request от Gateway (y/n/a -- allow once/allow always/deny). Quick command mode: `osai "command"` -- отправляет и получает ответ без TUI. E2E интеграционные тесты CLI пакета.

**Scope:**
- In: Permission prompt UI, quick command mode, integration tests
- Out: rich permission UI (V1)

#### Checklist
- [ ] CODE: `packages/cli/src/tui/permission-prompt.tsx`, `packages/cli/src/commands/quick.ts`
- [ ] TEST: `packages/cli/src/__tests__/tui/permission-prompt.test.tsx`, `packages/cli/src/__tests__/commands/quick.test.ts`, `packages/cli/src/__tests__/integration/cli-integration.test.ts`
- [ ] BUILD: `pnpm --filter @osai/cli build && pnpm --filter @osai/cli test`

#### Test Cases
| ID | Description | Expected |
|----|-------------|----------|
| TT-006-01 | Permission request с risk=low -- auto-approve для read | Не показывается prompt, auto-approve |
| TT-006-02 | Permission request с risk=medium -- показ prompt | Prompt с tool, action, params, [y/n/a] |
| TT-006-03 | User нажимает 'y' -- permission_response allow отправлен | Response с allow=true |
| TT-006-04 | User нажимает 'n' -- permission_response deny отправлен | Response с allow=false |
| TT-006-05 | `osai "какая погода?"` -- quick mode, ответ в stdout | Текст ответа, exit 0 |
| TT-006-06 | `osai "command"` -- Gateway недоступен | Error message, exit 1 |
| TT-006-07 | Integration: init -> connect -> send message -> receive response | Полный цикл с mock Gateway |

#### Acceptance
- Permission prompt отображается корректно и отправляет response
- Quick command mode работает для простых запросов
- Все тесты пакета проходят: `pnpm --filter @osai/cli test`
- Полный цикл (connect -> message -> response) работает с mock Gateway

---

## Dependencies

### Feature Dependencies
- **F-009:** Gateway + Multi-Chat System (blocking) -- WS server + protocol

### Task Dependencies
- **T-001** -- no dependencies
- **T-002** -- depends on T-001 (blocking)
- **T-003** -- depends on T-001, T-002 (blocking)
- **T-004** -- depends on T-002 (blocking)
- **T-005** -- depends on T-002 (blocking)
- **T-006** -- depends on T-002, T-003 (blocking)

### Development Order (Parallel Groups)
```
Wave 1: T-001 (scaffolding + WS client)
Wave 2: T-002 (protocol + router)
Wave 3: T-003, T-004, T-005 (parallel: TUI chat / chat commands / management commands)
Wave 4: T-006 (permission prompt + quick mode + integration tests)
```

---

## Build and Run Verification

**Build:**
```bash
pnpm --filter @osai/cli build
```
- Expected: exit 0, dist/ directory created
- Criteria: No TypeScript errors, no missing dependencies

**Run:**
```bash
osai --version        # prints version, exit 0
osai --help           # prints help, exit 0
osai init             # creates ~/.osai/, exit 0
osai status           # shows gateway status, exit 0 (if gateway running)
osai chat list        # shows chats table
```

**Test:**
```bash
pnpm --filter @osai/cli test
```
- Expected: all tests pass
- Criteria: 0 failures, coverage > 80% for protocol/router logic

---

## Quality Expectations

- Coverage: > 80% for WS client, protocol, message router
- CLI latency: <= 50ms для команд (без TUI)
- Startup time: < 500ms для quick command mode
- Exit codes: 0 = success, 1 = error, 2 = usage error
- No sensitive data in logs (API keys, tokens)

---

## Risks

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|------------|
| ink TUI complexity -- React-подобный рендеринг в терминале | Medium | Medium | Начать с минимального UI, расширять итеративно |
| oclif v3 API changes | Low | Medium | Зафиксировать версию в package.json |
| WS reconnect в TUI -- flickering | Medium | Low | Throttle re-renders, debounce status updates |
| Permission prompt race condition | Low | Medium | Очередь permission requests, serial processing |

---

## Notes

- Все команды следуют POSIX exit codes
- Конфиг читается из `~/.osai/osai.json`
- Версия oclif фиксируется в package.json (semver)
- ink-компоненты -- функциональные, без классов
- Тесты TUI используют ink-testing-library
- Mock Gateway для тестов -- простой WS server на случайном порту

---

**Version:** v1.0
**Date:** 2026-03-30
**Author:** TDD Planner Agent
**Status:** Complete
