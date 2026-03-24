# Task Roadmap: CLI Client — oclif + ink

## 1. Feature Overview

- **Feature ID:** F-012
- **Feature Name:** CLI Client — oclif + ink
- **Feature Description:** CLI клиент на базе oclif: интерактивный чат с TUI (ink), session management, конфигурация, skills management, memory operations, channel management, system status. Permission prompts для write/exec. Quick command mode. Status bar.
- **Related Requirements:** FR-056-FR-060, NFR-021-NFR-024
- **Domain:** cli
- **Git branch:** feature/f-012-cli-client
- **Version:** v1.0

---

## 2. Dependencies

### 2.1 Feature Dependencies

| Feature ID | Feature Name | Type | Description |
|------------|--------------|------|-------------|
| F-002 | Gateway (WS Control Plane) | **blocking** | CLI подключается к Gateway через WebSocket. Зависит от WS протокола (message, command, permission_response, subscribe) и исходящих сообщений (block, tool_stream, permission_request). |
| F-003 | Configuration System | **blocking** | CLI использует config loader для чтения ~/.osai/openclaw.json. Команда `osai init` создаёт структуру директорий. |

### 2.2 Task Dependencies

```
T-001 (oclif base setup)
  |
  +-- T-002 (Gateway client) [зависит от T-001]
  |     |
  |     +-- T-003 (Interactive chat TUI) [зависит от T-002]
  |     |     |
  |     |     +-- T-004 (Permission prompt UI) [зависит от T-003]
  |     |     |
  |     |     +-- T-005 (Session management + status bar) [зависит от T-003]
  |     |
  |     +-- T-006 (CLI commands: session, config, skills, memory, channel, status) [зависит от T-002]
  |
  +-- T-007 (Integration tests) [зависит от T-001..T-006]
```

### 2.3 Development Order

**Parallel execution possible:**
- T-001 (oclif base setup) — первая задача
- После T-001: T-002 (Gateway client) параллельно с подготовкой структур для T-003
- После T-002: T-003, T-004, T-005, T-006 — до 3 параллельно (T-003 приоритет, затем T-004+T-005 или T-006)
- T-007 (Integration tests) — после завершения всех задач

---

## 3. Task Breakdown

### Task T-001: oclif Base Setup

**Description:**
Инициализация oclif проекта, настройка базовой структуры команд, интеграция с monorepo. Определение команды `osai` как основного entry point. Настройка TypeScript, tsup сборки, линтинга.

**Estimated Time:** 3-4 hours

**Dependencies:** None

**Scope:**
- **In scope:**
  - Инициализация oclif v4 проекта в `packages/cli/`
  - Настройка package.json (name: `@osai/cli`, bin: `osai`)
  - Базовые команды: `init`, `version`, `help`
  - TypeScript конфигурация (extends от корневого tsconfig)
  - tsup/esbuild конфигурация для сборки
  - ESLint + Biome интеграция
  - Интеграция в monorepo workspaces

- **Out scope:**
  - Реализация команд chat, session, config, skills, memory, channel, status
  - Gateway client
  - ink TUI компоненты
  - Тесты (вынесены в T-007)

---

### Task T-002: Gateway Client (WS Connection)

**Description:**
Реализация GatewayClient класса для подключения к Gateway через WebSocket. Обработка соединения, reconnection, отправка/получение сообщений по WS протоколу. Интеграция с событийной моделью oclif.

**Estimated Time:** 3-4 hours

**Dependencies:** T-001 (oclif base setup)

**Scope:**
- **In scope:**
  - GatewayClient класс с методами connect(), disconnect(), send()
  - WS connection к ws://127.0.0.1:18789 (конфигурируемый)
  - Обработка 7 типов входящих сообщений: block, tool_stream, permission_request, error, status, event, command
  - Обработка 4 типов исходящих сообщений: message, command, permission_response, subscribe
  - Reconnection logic (exponential backoff, max attempts)
  - Event emitter pattern для уведомления подписчиков
  - Connection state management (disconnected, connecting, connected, error)
  - Error handling и graceful degradation при недоступности Gateway

- **Out scope:**
  - UI отображение сообщений (T-003)
  - Permission prompt handling (T-004)
  - Session state display (T-005)

---

### Task T-003: Interactive Chat TUI (ink)

**Description:**
Реализация интерактивного чата на базе ink (React for CLI). Message rendering, input handling, tool_stream display, scrollable output. Интеграция с GatewayClient для real-time обновлений.

**Estimated Time:** 4-5 hours

**Dependencies:** T-002 (Gateway client)

**Scope:**
- **In scope:**
  - ink приложение для интерактивного чата
  - MessageInput компонент (user input с readline/ink TextInput)
  - MessageList компонент (scrollable, auto-scroll to bottom)
  - MessageItem компонент (user/assistant differentiation)
  - Block rendering: text, code (с syntax highlighting), table
  - ToolStream display (real-time execution progress)
  - Status indicator (thinking, idle, error)
  - TypeWriter effect для streaming text
  - Keyboard shortcuts (Ctrl+C exit, Ctrl+D cancel, etc.)
  - Цветовая схема (configurable, default: dark theme)
  - Terminal resize handling

- **Out scope:**
  - Permission prompt UI (T-004)
  - Status bar (T-005)
  - Session list/resume commands (T-006)

---

### Task T-004: Permission Prompt UI

**Description:**
Реализация UI для permission prompts. Отображение tool name, action, params, risk level. Интерактивный ввод y/N. Интеграция с Gateway permission_request/response flow.

**Estimated Time:** 2-3 hours

**Dependencies:** T-003 (Interactive chat TUI)

**Scope:**
- **In scope:**
  - PermissionPrompt ink компонент
  - Отображение: tool name, action, parameters (truncated), risk level (color-coded)
  - y/N input с validation
  - Timeout handling (default deny after N seconds, configurable)
  - "Remember decision" option (--yes-always для конкретного tool/action)
  - Отправка permission_response через GatewayClient
  - Batch permission display (multiple requests queue)
  - Audit log entry при decision (через Gateway)

- **Out scope:**
  - Permission logic на стороне Agent (реализовано в F-004, F-009)
  - Desktop notifications (F-011)

---

### Task T-005: Session Management + Status Bar

**Description:**
Реализация status bar с session info (id, model, token usage). Session list/resume/switch functionality. Интеграция с Gateway session management.

**Estimated Time:** 3-4 hours

**Dependencies:** T-003 (Interactive chat TUI)

**Scope:**
- **In scope:**
  - StatusBar ink компонент (bottom of screen)
  - Session info display: session_id (short), model name, token usage (input/output)
  - Connection status indicator (connected/disconnected/reconnecting)
  - Session list command (с поддержкой JSON output для scripting)
  - Session resume по session_id
  - Session switch в интерактивном режиме
  - Session creation (main, group, isolated)
  - Quick command mode: `osai "command text"` — single message, non-interactive

- **Out scope:**
  - Session persistence (реализовано в F-002)
  - Session pruning (реализовано в F-004)

---

### Task T-006: CLI Commands (session, config, skills, memory, channel, status)

**Description:**
Реализация дополнительных CLI команд для управления системой: session, config, skills, memory, channel, status. Все команды поддерживают --help, --json output.

**Estimated Time:** 4-5 hours

**Dependencies:** T-002 (Gateway client)

**Scope:**
- **In scope:**
  - `osai session list` — список сессий (JSON output supported)
  - `osai session resume <id>` — восстановление сессии
  - `osai session create [type]` — создание новой сессии (main/group/isolated)
  - `osai config show` — отображение текущей конфигурации (sanitized, без API keys)
  - `osai config edit` — открыть конфиг в $EDITOR
  - `osai config set <key> <value>` — установка значения конфига
  - `osai skills list` — список доступных skills
  - `osai skills enable <name>` — включение skill
  - `osai skills disable <name>` — отключение skill
  - `osai memory search <query>` — поиск в long-term memory
  - `osai memory stats` — статистика памяти
  - `osai channel list` — список каналов (Telegram, WhatsApp, Dashboard)
  - `osai status` — системный статус (Gateway, Agent, Memory, Qdrant)
  - `osai init` — инициализация ~/.osai/ структуры (делегирует в F-003)
  - Все команды поддерживают `--json` для machine-readable output
  - Все команды поддерживают `--help`

- **Out scope:**
  - Interactive chat (T-003)
  - Memory operations через Agent (использует REST API F-006)
  - Observability queries (F-010)

---

### Task T-007: Integration Tests

**Description:**
Интеграционные тесты для CLI: command execution, interactive session simulation, Gateway connection, edge cases.

**Estimated Time:** 3-4 hours

**Dependencies:** T-001, T-002, T-003, T-004, T-005, T-006

**Scope:**
- **In scope:**
  - Unit tests для GatewayClient (connection, send/receive, reconnection)
  - Unit tests для command parsing (oclif args/flags)
  - Integration tests: CLI + Gateway (mocked или test Gateway)
  - Snapshot tests для output formatting
  - Edge cases: Gateway unavailable, connection drop, permission timeout
  - Quick command mode tests: `osai "hello"`
  - Session lifecycle tests (create, resume, switch)
  - Permission prompt flow tests
  - Coverage report (target: >= 70%)

- **Out scope:**
  - E2E tests с реальным Agent Runtime (отдельная задача)
  - Performance benchmarks

---

## 4. Test Strategy (TDD)

### 4.1 Test Types per Task

| Task | Unit Tests | Integration Tests | Build & Run Verification |
|------|------------|-------------------|--------------------------|
| T-001 | command parsing, help output | npm run build execution | `osai --help`, `osai version` |
| T-002 | GatewayClient methods, message parsing | WS mock server connection | import test, type check |
| T-003 | ink components rendering | terminal output capture | `osai chat` startup |
| T-004 | PermissionPrompt rendering, input handling | permission flow simulation | prompt display test |
| T-005 | StatusBar rendering, session commands | session mock operations | status bar display |
| T-006 | each command execution | command + Gateway mock | each command --help |
| T-007 | test runner setup | full CLI suite | vitest run |

### 4.2 Build and Run Verification

**Build Verification:**
```bash
# Команда сборки
cd /home/aristman/projects/osai && npm run build --workspace=@osai/cli

# Ожидаемый результат
# - dist/ директория с скомпилированными файлами
# - bin/run.js executable
# - No TypeScript errors
# - No lint errors

# Критерии успешной сборки
# - Exit code: 0
# - Output содержит "Build completed"
# - dist/index.js существует
```

**Run Verification:**
```bash
# Команда запуска
cd /home/aristman/projects/osai && node packages/cli/bin/run.js --help

# Ожидаемый результат
# - Help text с списком команд
# - Exit code: 0

# Базовая проверка работоспособности
node packages/cli/bin/run.js version
# Ожидается: версия CLI (например, 0.1.0)
```

### 4.3 Test Cases per Task

#### Task T-001: oclif Base Setup

| Test ID | Description | Preconditions | Expected Result | Pass/Fail Criteria |
|---------|-------------|---------------|-----------------|-------------------|
| T001-U01 | `osai --help` displays help | CLI built | Help text with commands list | Exit code 0, contains "COMMANDS" |
| T001-U02 | `osai version` displays version | CLI built | Version string | Exit code 0, semver format |
| T001-U03 | `osai init` creates directory structure | No ~/.osai/ | ~/.osai/ created | Directory exists |
| T001-U04 | TypeScript compilation succeeds | Source files exist | No type errors | Exit code 0 |
| T001-U05 | ESLint passes | Source files exist | No lint errors | Exit code 0 |

#### Task T-002: Gateway Client

| Test ID | Description | Preconditions | Expected Result | Pass/Fail Criteria |
|---------|-------------|---------------|-----------------|-------------------|
| T002-U01 | GatewayClient connects to WS | Mock WS server running | state = "connected" | Connection established |
| T002-U02 | send() transmits message | Connected | Message received by server | Message logged |
| T002-U03 | onMessage() receives block message | Server sends block | Handler called with block | Handler invoked |
| T002-U04 | onMessage() receives permission_request | Server sends request | Handler called | Request parsed correctly |
| T002-U05 | Reconnection on disconnect | Server disconnects | Reconnect attempt | Backoff applied |
| T002-U06 | Exponential backoff max attempts | Server unavailable | Give up after max attempts | Error emitted |
| T002-I01 | Full message flow | Connected client | Send + receive works | Round-trip < 100ms |

#### Task T-003: Interactive Chat TUI

| Test ID | Description | Preconditions | Expected Result | Pass/Fail Criteria |
|---------|-------------|---------------|-----------------|-------------------|
| T003-U01 | MessageInput renders | ink app started | Input field visible | Component mounted |
| T003-U02 | MessageList displays messages | Messages array provided | All messages rendered | Count matches |
| T003-U03 | Text block rendering | Block type "text" | Formatted text output | Text visible |
| T003-U04 | Code block with highlighting | Block type "code" | Syntax highlighted | Language detected |
| T003-U05 | ToolStream progress display | tool_stream received | Progress indicator | Updates in real-time |
| T003-U06 | Auto-scroll on new message | Messages exceed screen | Scroll to bottom | Latest visible |
| T003-U07 | Ctrl+C exits gracefully | Chat running | Clean exit | No zombie processes |
| T003-U08 | Terminal resize handling | Terminal resized | Layout adapts | No overflow |

#### Task T-004: Permission Prompt UI

| Test ID | Description | Preconditions | Expected Result | Pass/Fail Criteria |
|---------|-------------|---------------|-----------------|-------------------|
| T004-U01 | Prompt displays tool info | permission_request received | Tool name, action visible | All fields shown |
| T004-U02 | Risk level color coding | risk_level = "high" | Red color applied | Color correct |
| T004-U03 | y input approves | Prompt displayed | approved sent | Response correct |
| T004-U04 | N input denies | Prompt displayed | denied sent | Response correct |
| T004-U05 | Timeout denies | No input for N seconds | denied sent | Timeout works |
| T004-U06 | Parameters truncated | Long params string | Truncated display | Fits screen |
| T004-I01 | Full permission flow | Gateway + Prompt | Request -> Response | Round-trip complete |

#### Task T-005: Session Management + Status Bar

| Test ID | Description | Preconditions | Expected Result | Pass/Fail Criteria |
|---------|-------------|---------------|-----------------|-------------------|
| T005-U01 | StatusBar renders | Chat started | Session info visible | All fields shown |
| T005-U02 | Token usage updates | tool_stream received | Updated count | Correct values |
| T005-U03 | Connection status indicator | State change | Icon/text updates | State correct |
| T005-U04 | Quick command mode | `osai "hello"` | Single message sent | Exit after response |
| T005-I01 | Session list command | Sessions exist | List displayed | JSON output valid |
| T005-I02 | Session resume | Session ID provided | Session restored | History loaded |

#### Task T-006: CLI Commands

| Test ID | Description | Preconditions | Expected Result | Pass/Fail Criteria |
|---------|-------------|---------------|-----------------|-------------------|
| T006-U01 | `session list --json` | Sessions exist | Valid JSON output | Parseable JSON |
| T006-U02 | `config show` | Config exists | Config displayed | Keys sanitized |
| T006-U03 | `config set` | Valid key/value | Config updated | Value persisted |
| T006-U04 | `skills list` | Skills loaded | List displayed | All skills shown |
| T006-U05 | `skills enable/disable` | Skill exists | Status changed | Config updated |
| T006-U06 | `memory search` | Query provided | Results displayed | Valid format |
| T006-U07 | `channel list` | Channels configured | List displayed | Status correct |
| T006-U08 | `status` command | System running | All components shown | Health check |
| T006-U09 | Each command --help | Command exists | Help displayed | Usage shown |

#### Task T-007: Integration Tests

| Test ID | Description | Preconditions | Expected Result | Pass/Fail Criteria |
|---------|-------------|---------------|-----------------|-------------------|
| T007-I01 | Full chat session | Gateway + CLI running | Messages exchanged | No errors |
| T007-I02 | Permission flow E2E | Tool requires permission | Prompt -> Response | Approved/Denied |
| T007-I03 | Connection recovery | Gateway restarts | Reconnects | Session resumes |
| T007-I04 | Multiple sessions | Create + switch | Sessions isolated | No cross-talk |
| T007-I05 | Edge case: Gateway down | Gateway unavailable | Graceful error | Exit code != 0 |
| T007-I06 | Edge case: Invalid session | Non-existent ID | Error message | Helpful error |
| T007-I07 | Coverage threshold | All tests run | >= 70% coverage | Report generated |

---

## 5. Implementation Plan per Task

### Task T-001: oclif Base Setup

**Implementation Steps:**
1. Create `packages/cli/` directory structure
2. Initialize oclif project: `npx oclif generate cli`
3. Configure package.json:
   - name: `@osai/cli`
   - bin: `osai`
   - dependencies: oclif, @oclif/core, @oclif/plugin-help
4. Setup tsconfig.json (extends root)
5. Create base commands:
   - `src/commands/init.ts` — delegate to F-003
   - `src/commands/version.ts` — display version
6. Configure tsup build
7. Add npm scripts: build, dev, lint, test
8. Update root package.json workspaces

**Constraints from Architecture:**
- TypeScript strict mode
- oclif v4 (latest stable)
- ink v4 for TUI (React 18 based)
- Node.js 20+ compatibility

**Integration Points:**
- Monorepo workspaces (root package.json)
- Shared types from `@osai/types`
- Config loader from F-003

---

### Task T-002: Gateway Client

**Implementation Steps:**
1. Install ws dependency
2. Create `src/lib/gateway-client.ts`
3. Define types for WS messages (import from @osai/types if available)
4. Implement GatewayClient class:
   - constructor(config: ClientConfig)
   - connect(): Promise<void>
   - disconnect(): Promise<void>
   - send(message: InboundMessage): void
   - onMessage(handler): unsubscribe function
   - onPermissionRequest(handler): unsubscribe function
   - onStateChange(handler): unsubscribe function
5. Implement reconnection logic:
   - Exponential backoff: 1s, 2s, 4s, 8s, 16s, 30s (max)
   - Max attempts: 10 (configurable)
   - Jitter: +/- 25%
6. Handle all message types from ARCHITECTURE_OVERVIEW.md
7. Add error handling and logging (pino)

**Constraints from Architecture:**
- Default endpoint: ws://127.0.0.1:18789
- Graceful degradation when Gateway unavailable
- No blocking operations on main thread

**Integration Points:**
- Config loader for endpoint configuration
- Types from Gateway WS protocol (F-002)
- Logging via pino (shared instance)

---

### Task T-003: Interactive Chat TUI

**Implementation Steps:**
1. Install ink, react, ink-text-input, ink-spinner dependencies
2. Create `src/components/` structure:
   - `chat-app.tsx` — main ink app
   - `message-input.tsx` — user input
   - `message-list.tsx` — messages container
   - `message-item.tsx` — single message
   - `block-renderer.tsx` — block type switcher
   - `tool-stream-display.tsx` — execution progress
   - `status-indicator.tsx` — thinking/idle/error
3. Create `src/hooks/`:
   - `use-gateway.ts` — GatewayClient integration
   - `use-messages.ts` — message state management
   - `use-input.ts` — keyboard input handling
4. Implement `src/commands/chat.ts`:
   - Interactive mode (default)
   - Quick command mode (with argument)
5. Add keyboard shortcuts:
   - Ctrl+C: exit
   - Ctrl+D: cancel current operation
   - Up/Down: message history
6. Implement TypeWriter effect for streaming
7. Add syntax highlighting for code blocks (cli-highlight or similar)
8. Handle terminal resize

**Constraints from Architecture:**
- Terminal agnostic (works in any POSIX terminal)
- Graceful degradation for limited terminals
- No external dependencies for rendering (pure ink)

**Integration Points:**
- GatewayClient for real-time updates
- ink React components
- Terminal capabilities detection

---

### Task T-004: Permission Prompt UI

**Implementation Steps:**
1. Create `src/components/permission-prompt.tsx`:
   - Display tool name, action, params, risk level
   - y/N input handling
   - Timeout countdown
2. Create `src/hooks/use-permission-queue.ts`:
   - Queue management for multiple requests
   - State for current request
3. Integrate with GatewayClient.onPermissionRequest()
4. Implement "remember decision" logic:
   - Store in memory for session
   - Optional: persist to config
5. Color coding for risk levels:
   - low: green
   - medium: yellow
   - high: red
6. Parameter truncation for display
7. Send permission_response through GatewayClient

**Constraints from Architecture:**
- Default timeout: 30 seconds (configurable)
- Must not block terminal (async handling)
- Audit log entry via Gateway

**Integration Points:**
- GatewayClient permission flow
- ink rendering
- Configuration for timeout

---

### Task T-005: Session Management + Status Bar

**Implementation Steps:**
1. Create `src/components/status-bar.tsx`:
   - Session ID (short form: first 8 chars)
   - Model name
   - Token usage (input/output)
   - Connection status
2. Create `src/lib/session-manager.ts`:
   - Create session (main/group/isolated)
   - Resume session
   - Switch session
   - List sessions
3. Implement session commands:
   - `src/commands/session/list.ts`
   - `src/commands/session/resume.ts`
   - `src/commands/session/create.ts`
4. Implement quick command mode:
   - Parse argument as message
   - Connect, send, wait for response, exit
5. Integrate status bar into chat app
6. Add session info to GatewayClient.subscribe()

**Constraints from Architecture:**
- Session ID format: UUID v4
- Token usage from tool_stream/status messages
- Connection state from GatewayClient

**Integration Points:**
- GatewayClient session operations
- ink status bar component
- Configuration for default session type

---

### Task T-006: CLI Commands

**Implementation Steps:**
1. Create command structure:
   - `src/commands/session/index.ts` (subcommand router)
   - `src/commands/config/index.ts`
   - `src/commands/skills/index.ts`
   - `src/commands/memory/index.ts`
   - `src/commands/channel/index.ts`
   - `src/commands/status.ts`
2. Implement each command:
   - session list: query Gateway, format output
   - session resume: connect + restore
   - session create: request new session
   - config show: read config, sanitize, display
   - config edit: spawn $EDITOR
   - config set: update config file
   - skills list: query Gateway/Agent
   - skills enable/disable: update config
   - memory search: call REST API (F-006)
   - memory stats: call REST API
   - channel list: query Gateway
   - status: health check all components
3. Add --json flag support for all commands
4. Add --help for all commands
5. Update init command to use F-003 API

**Constraints from Architecture:**
- JSON output must be valid, parseable
- Error messages must be actionable
- Exit codes: 0 (success), 1 (error), 2 (invalid args)

**Integration Points:**
- GatewayClient for session/commands
- Config loader (F-003)
- REST API client for memory (F-006)
- REST API for status/health

---

### Task T-007: Integration Tests

**Implementation Steps:**
1. Setup vitest in packages/cli/
2. Create test utilities:
   - `tests/helpers/mock-gateway.ts` — WS mock server
   - `tests/helpers/test-fixtures.ts` — common test data
3. Write unit tests for each module:
   - GatewayClient
   - Command parsers
   - ink components (using ink-testing-library)
4. Write integration tests:
   - CLI + mock Gateway
   - Full command execution
   - Permission flow
   - Session lifecycle
5. Setup coverage reporting:
   - vitest --coverage
   - Target: >= 70%
6. Add snapshot tests for output
7. Create CI test script

**Constraints from Architecture:**
- vitest as test runner (monorepo standard)
- No real Gateway dependency (use mocks)
- Coverage threshold enforced in CI

**Integration Points:**
- vitest configuration
- Mock utilities
- CI pipeline

---

## 6. Acceptance Criteria per Task

### Task T-001: oclif Base Setup

- [ ] `npm run build --workspace=@osai/cli` succeeds with exit code 0
- [ ] `osai --help` displays help text with commands list
- [ ] `osai version` displays version string
- [ ] `osai init` creates ~/.osai/ directory structure
- [ ] TypeScript compilation with strict mode succeeds
- [ ] ESLint passes with 0 errors
- [ ] Package integrates in monorepo workspaces
- [ ] bin/run.js is executable

### Task T-002: Gateway Client

- [ ] GatewayClient connects to ws://127.0.0.1:18789
- [ ] send() transmits messages correctly
- [ ] onMessage() receives all message types
- [ ] onPermissionRequest() receives permission requests
- [ ] Reconnection works with exponential backoff
- [ ] Max reconnection attempts respected
- [ ] Connection state changes emitted
- [ ] Error handling for Gateway unavailable
- [ ] Unit tests pass

### Task T-003: Interactive Chat TUI

- [ ] Chat app starts with `osai` or `osai chat`
- [ ] User input works (message sending)
- [ ] Messages display correctly (user + assistant)
- [ ] Text blocks render properly
- [ ] Code blocks render with syntax highlighting
- [ ] tool_stream displays execution progress
- [ ] Auto-scroll to bottom on new messages
- [ ] Ctrl+C exits gracefully
- [ ] Terminal resize handled
- [ ] Status indicator shows thinking/idle/error
- [ ] Unit tests pass

### Task T-004: Permission Prompt UI

- [ ] Permission prompt displays tool info
- [ ] Risk level color coded correctly
- [ ] y input sends approved response
- [ ] N input sends denied response
- [ ] Timeout sends denied after configured time
- [ ] Long parameters truncated for display
- [ ] Multiple requests queued properly
- [ ] permission_response sent through Gateway
- [ ] Unit tests pass

### Task T-005: Session Management + Status Bar

- [ ] Status bar displays session info
- [ ] Token usage updates in real-time
- [ ] Connection status indicator works
- [ ] Quick command mode: `osai "text"` works
- [ ] Session list displays correctly
- [ ] Session resume restores history
- [ ] Session create works for all types
- [ ] Session switch in interactive mode
- [ ] Integration tests pass

### Task T-006: CLI Commands

- [ ] All commands have --help output
- [ ] All commands support --json output
- [ ] session list/resume/create work
- [ ] config show/edit/set work
- [ ] skills list/enable/disable work
- [ ] memory search/stats work
- [ ] channel list works
- [ ] status displays all components
- [ ] init creates ~/.osai/ structure
- [ ] Exit codes correct (0/1/2)
- [ ] Unit tests pass

### Task T-007: Integration Tests

- [ ] All unit tests pass
- [ ] Integration tests pass
- [ ] Coverage >= 70%
- [ ] Edge cases covered (Gateway down, etc.)
- [ ] Snapshot tests up to date
- [ ] CI test script works
- [ ] No flaky tests

---

## 7. Quality Expectations

### Coverage Requirements

| Task | Unit Test Coverage | Integration Coverage |
|------|-------------------|---------------------|
| T-001 | >= 80% | N/A (infra) |
| T-002 | >= 85% | >= 70% |
| T-003 | >= 75% | >= 60% |
| T-004 | >= 80% | >= 70% |
| T-005 | >= 75% | >= 60% |
| T-006 | >= 80% | >= 70% |
| T-007 | >= 70% | >= 50% |

### Task Completion Time

| Task | Estimated | Max |
|------|-----------|-----|
| T-001 | 3-4 hours | 6 hours |
| T-002 | 3-4 hours | 6 hours |
| T-003 | 4-5 hours | 8 hours |
| T-004 | 2-3 hours | 5 hours |
| T-005 | 3-4 hours | 6 hours |
| T-006 | 4-5 hours | 8 hours |
| T-007 | 3-4 hours | 6 hours |

### Build and Run Stability

- Build must complete in < 30 seconds
- CLI startup time < 500ms
- No memory leaks in long-running chat sessions
- Graceful exit on all platforms (Linux, macOS)

---

## 8. Risks and Edge Cases

### Known Edge Cases

1. **Gateway unavailable at startup**
   - Risk: CLI hangs or crashes
   - Mitigation: Graceful error message, exit code 1, retry suggestion

2. **Terminal too small for TUI**
   - Risk: Rendering issues
   - Mitigation: Minimum size check, fallback to simple mode

3. **Very long messages**
   - Risk: Memory issues, rendering lag
   - Mitigation: Message truncation, pagination

4. **Rapid permission requests**
   - Risk: Queue overflow, UI confusion
   - Mitigation: Queue management, one at a time display

5. **Connection drop during operation**
   - Risk: Data loss, user confusion
   - Mitigation: Reconnection indicator, operation resume

6. **Non-interactive environment (CI)**
   - Risk: TUI fails
   - Mitigation: Detect TTY, fallback to non-interactive mode

### Risky Scenarios

1. **ink + oclif integration**
   - Risk: Conflicting stdin/stdout handling
   - Mitigation: Test early, use ink's useStdin/useStdout hooks

2. **Multiple concurrent sessions**
   - Risk: State confusion
   - Mitigation: Clear session isolation, state management

3. **Binary output in terminal**
   - Risk: Terminal corruption
   - Mitigation: Sanitize all output, detect binary content

### Dependency-Related Risks

1. **F-002 Gateway not ready**
   - Risk: Cannot test GatewayClient
   - Mitigation: Use mock Gateway server for development

2. **F-003 Config changes**
   - Risk: CLI config commands break
   - Mitigation: Interface-based integration, version compatibility

---

## 9. Notes

### Profile Compliance

- Domain: `cli` -> Profile: `AGENT_PROFILE_cli.md`
- All CLI interface design rules apply
- POSIX conventions respected
- Standard exit codes used
- `--help` for all commands
- Machine-readable output (`--json`) supported

### Technical Decisions

1. **oclif v4** chosen for mature CLI framework with plugin support
2. **ink v4** chosen for React-based TUI (familiar patterns)
3. **ws** library for WebSocket (matches Gateway implementation)
4. **vitest** for testing (monorepo standard)

### Assumptions

1. Gateway runs on ws://127.0.0.1:18789 (configurable)
2. Configuration in ~/.osai/openclaw.json (F-003)
3. User has Node.js 20+ installed
4. Terminal supports ANSI colors (graceful degradation if not)
5. Single user, single machine (no multi-tenancy)

### Future Enhancements (Out of Scope)

- Shell completion (bash, zsh, fish)
- Config file schema validation
- Plugin system for custom commands
- Theme customization
- Session export/import
- Voice input/output

---

## 10. Related Requirements Traceability

| Requirement | Covered by Task |
|-------------|-----------------|
| FR-056: CLI client with TUI | T-003 |
| FR-057: Permission prompts | T-004 |
| FR-058: Session management | T-005, T-006 |
| FR-059: Quick command mode | T-005 |
| FR-060: Status bar | T-005 |
| NFR-021: CLI startup < 500ms | T-001 (build optimization) |
| NFR-022: Terminal compatibility | T-003 (ink compatibility) |
| NFR-023: Exit codes | T-006 (all commands) |
| NFR-024: JSON output | T-006 (--json flag) |

---

*End of ROADMAP_TASKS_F-012.md v1.0*
