# Task Roadmap: Web Dashboard -- SvelteKit + TailwindCSS

**Version:** v1.0
**Generated:** 2026-03-24
**Author:** TDD Planner Agent
**Status:** Active
**Traceability:** FEATURES_INDEX.md v1.0, ARCHITECTURE_OVERVIEW.md v1.0, PROJECT_PROFILE.md v1.0

---

## 1. Feature Overview

### 1.1 Feature Identification

| Attribute | Value |
|-----------|-------|
| **Feature ID** | F-013 |
| **Feature Name** | Web Dashboard -- SvelteKit + TailwindCSS |
| **Domain** | dashboard |
| **Agent Profile** | web (ts-frontend) |
| **Priority** | Should Have (V1) |
| **Estimated Tasks** | 10 (Frontend: 7, Integration: 2, Tests: 1) |

### 1.2 Feature Description

Web Dashboard на SvelteKit + TailwindCSS: chat area (real-time через WS), channel sidebar, agent trace view (tool calls, durations, token usage, cost), permission prompts (approve/deny), memory search, system status (metrics, health). SPA, подключается к Gateway через WebSocket. Routes: /, /sessions, /traces, /memory, /settings, /status.

### 1.3 Related Requirements

| Requirement ID | Description |
|----------------|-------------|
| FR-061 | Web Dashboard: chat area, channel sidebar, agent trace view |
| FR-062 | Permission prompts в Dashboard: approve/deny с tool details |
| FR-063 | Memory search panel и system status в Dashboard |

### 1.4 Git Branch

```
feature/web-dashboard
```

---

## 2. Dependencies

### 2.1 Feature Dependencies

| Feature ID | Feature Name | Type | Description |
|------------|--------------|------|-------------|
| **F-002** | Gateway (WS Control Plane) | blocking | Dashboard подключается к Gateway через WebSocket для real-time communication |

**Note:** Dashboard не зависит от Agent Runtime, Memory, Observability напрямую -- все данные приходят через Gateway WS и REST API.

### 2.2 Task Dependencies

Зависимости между задачами внутри фичи:

| Task ID | Depends On | Type |
|---------|------------|------|
| T-001 | None | - |
| T-002 | T-001 | blocking |
| T-003 | T-001, T-002 | blocking |
| T-004 | T-001 | blocking |
| T-005 | T-001, T-002 | blocking |
| T-006 | T-001 | blocking |
| T-007 | T-001 | blocking |
| T-008 | T-001 | blocking |
| T-009 | All previous | blocking |
| T-010 | All previous | blocking |

**Dependency Graph:**

```
T-001 (Project Setup)
   |
   +---> T-002 (WS Client + Stores) --+---> T-003 (Chat Area)
   |                                   +---> T-005 (Permission Prompts)
   |
   +---> T-004 (Agent Trace View)
   |
   +---> T-006 (Memory Search Panel)
   |
   +---> T-007 (System Status Panel)
   |
   +---> T-008 (Settings Page)
   |
   +---> T-009 (Channel Sidebar)
   |
   v
T-010 (Integration Tests)
```

### 2.3 Development Order

**Задачи выполняются в следующем порядке:**

1. **Phase 1 -- Foundation (последовательно):**
   - T-001: SvelteKit project setup

2. **Phase 2 -- Core Infrastructure (последовательно):**
   - T-002: WS Client + State Management

3. **Phase 3 -- Features (параллельно, до 3 задач):**
   - T-003: Chat Area
   - T-004: Agent Trace View
   - T-005: Permission Prompt UI
   - T-006: Memory Search Panel
   - T-007: System Status Panel
   - T-008: Settings Page
   - T-009: Channel Sidebar

4. **Phase 4 -- Validation (последовательно):**
   - T-010: Integration Tests

**Параллелизм:** После T-002 задачи T-003, T-004, T-005 можно разрабатывать параллельно. После T-001 задачи T-006, T-007, T-008, T-009 можно разрабатывать параллельно.

---

## 3. Task Breakdown

### Task T-001: SvelteKit Project Setup

**Description:**
Создание базовой структуры SvelteKit проекта: инициализация, настройка TailwindCSS, базовый layout, routing, типы для WS сообщений.

**Estimated Time:** 3-4 hours

**Dependencies:** None

**Scope:**
- **In scope:**
  - SvelteKit project initialization (npm create svelte@latest)
  - TailwindCSS setup (tailwind.config.js, postcss, global styles)
  - Base layout component (+layout.svelte)
  - Routes structure: /, /sessions, /traces, /memory, /settings, /status
  - TypeScript types для WS message protocol (из packages/types)
  - Vite config для SPA mode (no SSR)
  - Dark theme по умолчанию
  - Package.json scripts: dev, build, preview

- **Out scope:**
  - WS client implementation (T-002)
  - UI components для chat, traces, memory (T-003+)
  - State management stores (T-002)

---

### Task T-002: WS Client + State Management

**Description:**
Реализация WebSocket клиента для подключения к Gateway и Svelte stores для управления состоянием приложения.

**Estimated Time:** 3-4 hours

**Dependencies:** T-001 (Project Setup)

**Scope:**
- **In scope:**
  - WS client service (connect, disconnect, reconnect with backoff)
  - Message sending/receiving
  - Connection state management (connecting, connected, disconnected, error)
  - Svelte stores:
    - connectionStore (WS connection state)
    - sessionStore (active sessions, current session)
    - messageStore (messages per session)
    - traceStore (agent traces)
    - permissionStore (pending permission requests)
    - memoryStore (memory search results)
    - statusStore (system metrics)
  - Message type handlers (block, tool_stream, permission_request, status, event)
  - Heartbeat/ping-pong для connection health
  - Auto-reconnect logic (exponential backoff)

- **Out scope:**
  - UI components для отображения данных (T-003+)
  - REST API client (если нужен)

---

### Task T-003: Chat Area Component

**Description:**
Компонент чата: отображение сообщений, tool_stream, block types, отправка сообщений.

**Estimated Time:** 3-4 hours

**Dependencies:** T-001, T-002

**Scope:**
- **In scope:**
  - Message list component (virtualized для производительности)
  - Message rendering (user, assistant, system)
  - Block type rendering:
    - text (markdown rendering)
    - code (syntax highlighting)
    - image
    - card
    - table
  - Tool stream display (real-time updates)
  - Message input component (textarea + send button)
  - Auto-scroll к новым сообщениям
  - Loading indicators (typing animation)
  - Timestamp display
  - Session selector (переключение между sessions)

- **Out scope:**
  - Permission prompts (T-005)
  - Session list в sidebar (T-009)

---

### Task T-004: Agent Trace View

**Description:**
Представление agent traces: хронологический список tool calls, durations, token usage, cost.

**Estimated Time:** 3-4 hours

**Dependencies:** T-001

**Scope:**
- **In scope:**
  - Trace list component (chronological ordering)
  - Trace item display:
    - Tool name
    - Action/params (collapsed by default)
    - Duration (ms)
    - Token usage (input/output)
    - Cost estimation
    - Status (pending, running, success, error)
  - Expand/collapse для params
  - Filter по tool name
  - Filter по status
  - Session selector (traces per session)
  - Summary stats (total tools, total duration, total tokens, total cost)
  - Real-time updates (new traces appear automatically)

- **Out scope:**
  - Detailed trace view (отдельная страница)
  - Export traces

---

### Task T-005: Permission Prompt UI

**Description:**
Компонент для отображения permission requests: approve/deny с tool details.

**Estimated Time:** 2-3 hours

**Dependencies:** T-001, T-002

**Scope:**
- **In scope:**
  - Permission prompt modal/dialog
  - Display:
    - Tool name
    - Action type (read/write/exec/system)
    - Parameters (formatted)
    - Risk level (low/medium/high) с цветовой индикацией
  - Approve/Deny buttons
  - Keyboard shortcuts (y/N)
  - Queue из pending requests (если несколько)
  - Timeout countdown (если есть auto-deny timeout)
  - Response отправка через WS (permission_response message)

- **Out scope:**
  - Desktop notifications (packages/os-integration)
  - Permission policy configuration

---

### Task T-006: Memory Search Panel

**Description:**
Панель поиска по памяти: semantic search, category filters, results display.

**Estimated Time:** 3-4 hours

**Dependencies:** T-001

**Scope:**
- **In scope:**
  - Search input component
  - Category filters (FACT, PREFERENCE, KNOWLEDGE, ERROR, PATTERN)
  - Tag filters
  - Search results list:
    - Content preview
    - Category badge
    - Tags
    - Source session
    - Timestamp
    - Relevance score
  - Pagination / infinite scroll
  - Loading state
  - Empty state
  - Error state
  - REST API integration (GET /api/v1/memory/search)

- **Out scope:**
  - Memory detail view
  - Memory CRUD operations

---

### Task T-007: System Status Panel

**Description:**
Панель системного статуса: metrics display, health indicators, resource usage.

**Estimated Time:** 2-3 hours

**Dependencies:** T-001

**Scope:**
- **In scope:**
  - Health status indicator (healthy/degraded/error)
  - Metrics display:
    - Active sessions count
    - Connected clients count
    - Messages processed (total, per minute)
    - Tokens used (total, per session)
    - Cost (total, per session)
    - Memory usage (SQLite size, Qdrant size)
  - Model status (active provider, fallback status)
  - Gateway status (uptime, connections)
  - Recent errors/warnings list
  - Auto-refresh (polling или WS events)
  - REST API integration (GET /api/v1/observability/metrics)

- **Out scope:**
  - Detailed metrics graphs
  - Prometheus integration (backend responsibility)

---

### Task T-008: Settings Page

**Description:**
Страница настроек: просмотр и редактирование конфигурации Dashboard.

**Estimated Time:** 2-3 hours

**Dependencies:** T-001

**Scope:**
- **In scope:**
  - Settings categories:
    - Connection (Gateway URL, reconnect settings)
    - Display (theme, font size, auto-scroll)
    - Notifications (sound, desktop)
  - Settings form components
  - Save/Reset buttons
  - LocalStorage persistence
  - Validation feedback
  - Read-only display системных настроек (из openclaw.json)

- **Out scope:**
  - Редактирование openclaw.json (backend responsibility)
  - User authentication settings

---

### Task T-009: Channel Sidebar

**Description:**
Боковая панель с session list и channel status indicators.

**Estimated Time:** 2-3 hours

**Dependencies:** T-001

**Scope:**
- **In scope:**
  - Sidebar layout (collapsible)
  - Session list:
    - Session ID (truncated)
    - Session type (main/group/isolated)
    - Status indicator (active/inactive)
    - Last message preview
    - Unread count
  - Channel status indicators:
    - CLI (connected/disconnected)
    - Dashboard (connected/disconnected)
    - Telegram (enabled/disabled, connected)
    - WhatsApp (enabled/disabled, connected)
  - New session button
  - Session switcher
  - Active session highlight

- **Out scope:**
  - Channel management (enable/disable)
  - Session creation modal

---

### Task T-010: Integration Tests

**Description:**
Интеграционные тесты: WS reconnection, component rendering, responsive layout.

**Estimated Time:** 3-4 hours

**Dependencies:** All previous tasks

**Scope:**
- **In scope:**
  - WS connection tests:
    - Connect to Gateway
    - Send/receive messages
    - Reconnection after disconnect
    - Heartbeat handling
  - Component integration tests:
    - Chat area + message store
    - Permission prompt flow
    - Memory search + API mock
  - Responsive layout tests (desktop/tablet/mobile)
  - E2E tests (Playwright/Cypress):
    - Full chat flow
    - Permission approval flow
    - Navigation between routes
  - Build verification
  - Run verification

- **Out scope:**
  - Unit tests (должны быть в каждой задаче)
  - Backend tests

---

## 4. Test Strategy (TDD)

### 4.1 Test Types per Task

| Task ID | Unit Tests | Integration Tests | E2E Tests | Build Verification |
|---------|------------|-------------------|-----------|-------------------|
| T-001 | Component rendering | Routing | - | npm run build |
| T-002 | Store logic, WS client mock | WS connection mock | - | npm run build |
| T-003 | Message rendering, input handling | Store integration | Chat flow | npm run build |
| T-004 | Trace rendering, filters | Store integration | - | npm run build |
| T-005 | Prompt rendering, button handlers | WS response mock | Permission flow | npm run build |
| T-006 | Search input, results rendering | API mock | - | npm run build |
| T-007 | Metrics rendering, status indicators | API mock | - | npm run build |
| T-008 | Form validation, persistence | LocalStorage mock | - | npm run build |
| T-009 | Session list rendering | Store integration | - | npm run build |
| T-010 | - | Full suite | Full E2E | npm run build |

### 4.2 Build and Run Verification

**Build Verification:**

```bash
# Команда сборки
cd apps/dashboard && npm run build

# Ожидаемый результат
# - .svelte-kit/output/ директория создана
# - Нет ошибок компиляции
# - Нет TypeScript ошибок
# - Bundle size < 500KB (gzipped)

# Критерии успешной сборки
# - Exit code: 0
# - No critical warnings
# - All routes pre-rendered (если SSG)
```

**Run Verification:**

```bash
# Команда запуска dev server
cd apps/dashboard && npm run dev

# Ожидаемый результат
# - Server запущен на http://localhost:5173
# - Главная страница открывается без ошибок
# - WS connection attempt visible в console

# Команда preview production build
cd apps/dashboard && npm run preview

# Ожидаемый результат
# - Server запущен на http://localhost:4173
# - All routes работают
# - No console errors
```

**Базовая проверка работоспособности:**

1. Открыть http://localhost:5173
2. Проверить, что layout отображается
3. Проверить навигацию по routes
4. Проверить console на отсутствие ошибок
5. Проверить WS connection attempt

### 4.3 Test Cases per Task

---

#### Task T-001: SvelteKit Project Setup

**Test ID: T001-UNIT-001**
- **Description:** Layout component renders correctly
- **Preconditions:** SvelteKit app initialized
- **Expected result:** Layout contains header, sidebar placeholder, main content area
- **Pass criteria:** Component mounts without errors, all elements visible

**Test ID: T001-UNIT-002**
- **Description:** All routes are accessible
- **Preconditions:** Routes defined
- **Expected result:** Navigation to /, /sessions, /traces, /memory, /settings, /status returns 200
- **Pass criteria:** All routes load without 404 errors

**Test ID: T001-UNIT-003**
- **Description:** TailwindCSS classes work
- **Preconditions:** TailwindCSS configured
- **Expected result:** Elements with Tailwind classes have correct styles
- **Pass criteria:** Visual inspection, CSS classes applied

**Test ID: T001-UNIT-004**
- **Description:** TypeScript types compile
- **Preconditions:** WS message types defined
- **Expected result:** No TypeScript compilation errors
- **Pass criteria:** npm run check passes

---

#### Task T-002: WS Client + State Management

**Test ID: T002-UNIT-001**
- **Description:** WS client connects to Gateway
- **Preconditions:** Gateway running on ws://127.0.0.1:18789
- **Expected result:** connectionStore shows "connected"
- **Pass criteria:** Connection established within 5 seconds

**Test ID: T002-UNIT-002**
- **Description:** WS client handles disconnection
- **Preconditions:** WS client connected
- **Expected result:** connectionStore shows "disconnected", reconnect attempted
- **Pass criteria:** State updates correctly, reconnect scheduled

**Test ID: T002-UNIT-003**
- **Description:** Message store updates on block message
- **Preconditions:** WS client connected, messageStore initialized
- **Expected result:** New message added to messageStore
- **Pass criteria:** Message appears in store with correct data

**Test ID: T002-UNIT-004**
- **Description:** Permission store updates on permission_request
- **Preconditions:** WS client connected, permissionStore initialized
- **Expected result:** New permission request added to permissionStore
- **Pass criteria:** Request appears in store with correct data

**Test ID: T002-UNIT-005**
- **Description:** Exponential backoff on reconnect
- **Preconditions:** WS client disconnected
- **Expected result:** Reconnect attempts increase delay: 1s, 2s, 4s, 8s...
- **Pass criteria:** Delays follow exponential pattern

---

#### Task T-003: Chat Area Component

**Test ID: T003-UNIT-001**
- **Description:** Message list renders messages
- **Preconditions:** messageStore contains messages
- **Expected result:** All messages visible in list
- **Pass criteria:** Message count matches store count

**Test ID: T003-UNIT-002**
- **Description:** Text block renders as markdown
- **Preconditions:** Message with text block type
- **Expected result:** Markdown rendered correctly (bold, italic, links)
- **Pass criteria:** HTML output matches expected markdown

**Test ID: T003-UNIT-003**
- **Description:** Code block has syntax highlighting
- **Preconditions:** Message with code block type
- **Expected result:** Code highlighted with correct language
- **Pass criteria:** Syntax classes applied

**Test ID: T003-UNIT-004**
- **Description:** Send message updates store and sends WS
- **Preconditions:** User types message and clicks send
- **Expected result:** messageStore updated, WS message sent
- **Pass criteria:** Message in store, WS send called

**Test ID: T003-UNIT-005**
- **Description:** Auto-scroll on new message
- **Preconditions:** Chat area scrolled up
- **Expected result:** Scroll moves to bottom on new message
- **Pass criteria:** Scroll position at bottom

---

#### Task T-004: Agent Trace View

**Test ID: T004-UNIT-001**
- **Description:** Trace list renders traces
- **Preconditions:** traceStore contains traces
- **Expected result:** All traces visible in chronological order
- **Pass criteria:** Trace count matches store, order correct

**Test ID: T004-UNIT-002**
- **Description:** Expand trace shows params
- **Preconditions:** Trace with collapsed params
- **Expected result:** Clicking expand shows params
- **Pass criteria:** Params visible after click

**Test ID: T004-UNIT-003**
- **Description:** Filter by tool name
- **Preconditions:** Multiple traces with different tools
- **Expected result:** Only traces with selected tool visible
- **Pass criteria:** Filtered count correct

**Test ID: T004-UNIT-004**
- **Description:** Summary stats accurate
- **Preconditions:** Traces with known durations/tokens/costs
- **Expected result:** Summary shows correct totals
- **Pass criteria:** Math matches expected values

---

#### Task T-005: Permission Prompt UI

**Test ID: T005-UNIT-001**
- **Description:** Prompt modal displays request data
- **Preconditions:** permissionStore has pending request
- **Expected result:** Modal shows tool name, action, params, risk level
- **Pass criteria:** All fields visible and correct

**Test ID: T005-UNIT-002**
- **Description:** Approve sends permission_response
- **Preconditions:** Prompt visible
- **Expected result:** Clicking Approve sends WS message with decision="approved"
- **Pass criteria:** WS send called with correct message

**Test ID: T005-UNIT-003**
- **Description:** Deny sends permission_response
- **Preconditions:** Prompt visible
- **Expected result:** Clicking Deny sends WS message with decision="denied"
- **Pass criteria:** WS send called with correct message

**Test ID: T005-UNIT-004**
- **Description:** Keyboard shortcuts work
- **Preconditions:** Prompt visible
- **Expected result:** Pressing 'y' approves, 'n' denies
- **Pass criteria:** Correct action triggered

**Test ID: T005-UNIT-005**
- **Description:** Risk level color coding
- **Preconditions:** Requests with different risk levels
- **Expected result:** Low=green, Medium=yellow, High=red
- **Pass criteria:** Correct colors applied

---

#### Task T-006: Memory Search Panel

**Test ID: T006-UNIT-001**
- **Description:** Search input triggers API call
- **Preconditions:** User types query
- **Expected result:** API GET /api/v1/memory/search?q=query called
- **Pass criteria:** API called with correct params

**Test ID: T006-UNIT-002**
- **Description:** Results render correctly
- **Preconditions:** API returns results
- **Expected result:** Results list shows content, category, tags, score
- **Pass criteria:** All fields visible

**Test ID: T006-UNIT-003**
- **Description:** Category filter works
- **Preconditions:** Multiple results with different categories
- **Expected result:** Only selected category shown
- **Pass criteria:** Filtered results match category

**Test ID: T006-UNIT-004**
- **Description:** Empty state displays
- **Preconditions:** API returns empty results
- **Expected result:** "No results found" message shown
- **Pass criteria:** Empty state visible

---

#### Task T-007: System Status Panel

**Test ID: T007-UNIT-001**
- **Description:** Health indicator shows status
- **Preconditions:** API returns health status
- **Expected result:** Indicator shows healthy/degraded/error with color
- **Pass criteria:** Correct status and color

**Test ID: T007-UNIT-002**
- **Description:** Metrics display correctly
- **Preconditions:** API returns metrics
- **Expected result:** All metrics visible with correct values
- **Pass criteria:** Values match API response

**Test ID: T007-UNIT-003**
- **Description:** Auto-refresh updates data
- **Preconditions:** Panel loaded, data changes on server
- **Expected result:** Panel shows updated data after refresh
- **Pass criteria:** Data updated without page reload

---

#### Task T-008: Settings Page

**Test ID: T008-UNIT-001**
- **Description:** Settings load from LocalStorage
- **Preconditions:** Settings previously saved
- **Expected result:** Form shows saved values
- **Pass criteria:** Values match LocalStorage

**Test ID: T008-UNIT-002**
- **Description:** Save persists to LocalStorage
- **Preconditions:** User changes settings and clicks Save
- **Expected result:** Settings saved to LocalStorage
- **Pass criteria:** LocalStorage updated

**Test ID: T008-UNIT-003**
- **Description:** Reset restores defaults
- **Preconditions:** User clicks Reset
- **Expected result:** Settings return to default values
- **Pass criteria:** Default values in form

---

#### Task T-009: Channel Sidebar

**Test ID: T009-UNIT-001**
- **Description:** Session list renders
- **Preconditions:** sessionStore contains sessions
- **Expected result:** All sessions visible with correct data
- **Pass criteria:** Session count matches store

**Test ID: T009-UNIT-002**
- **Description:** Active session highlighted
- **Preconditions:** Current session set
- **Expected result:** Active session has highlight style
- **Pass criteria:** Correct session highlighted

**Test ID: T009-UNIT-003**
- **Description:** Channel status indicators correct
- **Preconditions:** Channels have different states
- **Expected result:** Each channel shows correct status
- **Pass criteria:** Indicators match channel state

---

#### Task T-010: Integration Tests

**Test ID: T010-INT-001**
- **Description:** Full chat flow E2E
- **Preconditions:** Gateway running, Dashboard loaded
- **Expected result:** User can send message and receive response
- **Pass criteria:** Message sent, response appears

**Test ID: T010-INT-002**
- **Description:** Permission flow E2E
- **Preconditions:** Agent triggers permission request
- **Expected result:** Prompt appears, user can approve/deny
- **Pass criteria:** Response sent, tool executes or cancels

**Test ID: T010-INT-003**
- **Description:** WS reconnection
- **Preconditions:** Dashboard connected, Gateway restarts
- **Expected result:** Dashboard reconnects automatically
- **Pass criteria:** Connection restored within timeout

**Test ID: T010-INT-004**
- **Description:** Responsive layout
- **Preconditions:** Dashboard loaded on different viewport sizes
- **Expected result:** Layout adapts to screen size
- **Pass criteria:** No horizontal scroll, all elements accessible

**Test ID: T010-INT-005**
- **Description:** Navigation between routes
- **Preconditions:** Dashboard loaded
- **Expected result:** All routes accessible via sidebar
- **Pass criteria:** All routes load without errors

---

## 5. Implementation Plan per Task

### Task T-001: SvelteKit Project Setup

**Implementation Steps:**

1. **Initialize SvelteKit project:**
   ```bash
   cd apps
   npm create svelte@latest dashboard
   # Select: Skeleton project, TypeScript, ESLint, Prettier, Playwright
   ```

2. **Install TailwindCSS:**
   ```bash
   npm install -D tailwindcss postcss autoprefixer
   npx tailwindcss init -p
   ```

3. **Configure TailwindCSS:**
   - Update tailwind.config.js with content paths
   - Add @tailwind directives to app.css
   - Configure dark mode: 'class'

4. **Create route structure:**
   - src/routes/+layout.svelte (main layout)
   - src/routes/+page.svelte (home/chat)
   - src/routes/sessions/+page.svelte
   - src/routes/traces/+page.svelte
   - src/routes/memory/+page.svelte
   - src/routes/settings/+page.svelte
   - src/routes/status/+page.svelte

5. **Define TypeScript types:**
   - src/lib/types/ws-messages.ts (import from @osai/types)
   - src/lib/types/session.ts
   - src/lib/types/trace.ts
   - src/lib/types/memory.ts
   - src/lib/types/settings.ts

6. **Configure Vite for SPA:**
   - Set adapter-static with fallback: 'index.html'
   - Disable SSR in routes

**Constraints from Architecture:**
- SPA mode (no SSR)
- Routes: /, /sessions, /traces, /memory, /settings, /status
- TypeScript strict mode
- Dark theme default

**Integration Points:**
- Uses @osai/types for WS message types
- Located in apps/dashboard/

---

### Task T-002: WS Client + State Management

**Implementation Steps:**

1. **Create WS client service:**
   - src/lib/services/ws-client.ts
   - Connection management class
   - Message serialization/deserialization
   - Event emitters

2. **Implement connection logic:**
   - Connect to ws://127.0.0.1:18789
   - Heartbeat/ping-pong (every 30s)
   - Auto-reconnect with exponential backoff
   - Connection state tracking

3. **Create Svelte stores:**
   - src/lib/stores/connection.ts
   - src/lib/stores/session.ts
   - src/lib/stores/message.ts
   - src/lib/stores/trace.ts
   - src/lib/stores/permission.ts
   - src/lib/stores/memory.ts
   - src/lib/stores/status.ts

4. **Implement message handlers:**
   - Map WS message types to store updates
   - block -> messageStore.add
   - tool_stream -> traceStore.update
   - permission_request -> permissionStore.add
   - status -> statusStore.update
   - event -> broadcast to relevant stores

5. **Create message sender:**
   - send(message, session_id)
   - permission_response(request_id, decision)
   - subscribe(events)

**Constraints from Architecture:**
- WS endpoint: ws://127.0.0.1:18789
- Message types from Gateway WS Protocol
- Reconnect delay: 1s, 2s, 4s, 8s, 16s (max 30s)

**Integration Points:**
- Connects to Gateway (F-002)
- Uses @osai/types for message types
- Stores consumed by UI components

---

### Task T-003: Chat Area Component

**Implementation Steps:**

1. **Create message components:**
   - src/lib/components/chat/MessageList.svelte
   - src/lib/components/chat/MessageItem.svelte
   - src/lib/components/chat/MessageInput.svelte

2. **Create block renderers:**
   - src/lib/components/blocks/TextBlock.svelte (markdown)
   - src/lib/components/blocks/CodeBlock.svelte (syntax highlighting)
   - src/lib/components/blocks/ImageBlock.svelte
   - src/lib/components/blocks/CardBlock.svelte
   - src/lib/components/blocks/TableBlock.svelte

3. **Create tool stream component:**
   - src/lib/components/chat/ToolStream.svelte
   - Real-time updates display
   - Progress indicators

4. **Implement main chat page:**
   - src/routes/+page.svelte
   - Session selector
   - Message list + input
   - Subscribe to messageStore

5. **Add features:**
   - Auto-scroll (scrollIntoView)
   - Typing indicator animation
   - Timestamp formatting
   - Message grouping (by time)

6. **Install dependencies:**
   - marked (markdown parsing)
   - highlight.js (syntax highlighting)

**Constraints from Architecture:**
- Block types: text, code, image, card, table
- Real-time via WS tool_stream
- Virtual scrolling for performance

**Integration Points:**
- Uses messageStore from T-002
- Sends messages via WS client

---

### Task T-004: Agent Trace View

**Implementation Steps:**

1. **Create trace components:**
   - src/lib/components/traces/TraceList.svelte
   - src/lib/components/traces/TraceItem.svelte
   - src/lib/components/traces/TraceSummary.svelte

2. **Create filter components:**
   - src/lib/components/traces/ToolFilter.svelte
   - src/lib/components/traces/StatusFilter.svelte
   - src/lib/components/traces/SessionSelector.svelte

3. **Implement trace page:**
   - src/routes/traces/+page.svelte
   - Trace list with filters
   - Summary stats
   - Real-time updates

4. **Add features:**
   - Expand/collapse params
   - Duration formatting (ms, s)
   - Token/cost formatting
   - Status icons

5. **Create trace detail (optional):**
   - src/routes/traces/[id]/+page.svelte

**Constraints from Architecture:**
- Chronological ordering
- Metrics: duration, tokens, cost
- Status: pending, running, success, error

**Integration Points:**
- Uses traceStore from T-002
- Could use REST API for historical traces

---

### Task T-005: Permission Prompt UI

**Implementation Steps:**

1. **Create prompt components:**
   - src/lib/components/permissions/PermissionModal.svelte
   - src/lib/components/permissions/PermissionQueue.svelte

2. **Create modal system:**
   - src/lib/components/ui/Modal.svelte
   - Overlay + focus trap
   - Keyboard handling

3. **Implement prompt logic:**
   - Display current request from permissionStore
   - Format params (JSON pretty-print)
   - Risk level styling
   - Countdown timer (if applicable)

4. **Implement response actions:**
   - Approve button -> send permission_response(approved)
   - Deny button -> send permission_response(denied)
   - Keyboard shortcuts (y/N)

5. **Add to layout:**
   - Include PermissionModal in +layout.svelte
   - Show when permissionStore.hasPending

**Constraints from Architecture:**
- Risk levels: low, medium, high
- Categories: read, write, exec, system
- Timeout handling

**Integration Points:**
- Uses permissionStore from T-002
- Sends via WS client

---

### Task T-006: Memory Search Panel

**Implementation Steps:**

1. **Create search components:**
   - src/lib/components/memory/SearchInput.svelte
   - src/lib/components/memory/FilterChips.svelte
   - src/lib/components/memory/ResultsList.svelte
   - src/lib/components/memory/ResultItem.svelte

2. **Create REST API client:**
   - src/lib/services/api-client.ts
   - GET /api/v1/memory/search
   - Error handling

3. **Implement memory page:**
   - src/routes/memory/+page.svelte
   - Search interface
   - Results display
   - Filters

4. **Add features:**
   - Debounced search (300ms)
   - Category filter (checkboxes)
   - Tag filter (chips)
   - Infinite scroll / pagination
   - Loading/error/empty states

5. **Create memory detail (optional):**
   - src/routes/memory/[id]/+page.svelte

**Constraints from Architecture:**
- REST API: GET /api/v1/memory/search?q=...
- Categories: FACT, PREFERENCE, KNOWLEDGE, ERROR, PATTERN
- Pagination support

**Integration Points:**
- Uses REST API (not WS)
- Could integrate with memoryStore

---

### Task T-007: System Status Panel

**Implementation Steps:**

1. **Create status components:**
   - src/lib/components/status/HealthIndicator.svelte
   - src/lib/components/status/MetricsCard.svelte
   - src/lib/components/status/RecentErrors.svelte

2. **Create metric displays:**
   - Sessions count
   - Clients count
   - Messages/tokens/cost
   - Memory usage
   - Model status

3. **Implement status page:**
   - src/routes/status/+page.svelte
   - Health indicator
   - Metrics grid
   - Recent errors list

4. **Add auto-refresh:**
   - Polling every 5s
   - Or subscribe to WS status events

5. **Implement API integration:**
   - GET /api/v1/observability/metrics

**Constraints from Architecture:**
- Metrics from Observability package
- Health: healthy, degraded, error
- Auto-refresh

**Integration Points:**
- Uses statusStore from T-002
- REST API for metrics

---

### Task T-008: Settings Page

**Implementation Steps:**

1. **Create settings components:**
   - src/lib/components/settings/SettingsForm.svelte
   - src/lib/components/settings/SettingsSection.svelte

2. **Create settings categories:**
   - Connection settings (Gateway URL, reconnect)
   - Display settings (theme, font size)
   - Notification settings (sound, desktop)

3. **Implement persistence:**
   - LocalStorage wrapper
   - Load on mount
   - Save on change

4. **Implement settings page:**
   - src/routes/settings/+page.svelte
   - Form sections
   - Save/Reset buttons

5. **Add validation:**
   - URL format validation
   - Numeric range validation
   - Feedback messages

**Constraints from Architecture:**
- LocalStorage only (no backend)
- Read-only display of openclaw.json settings
- Dark theme default

**Integration Points:**
- Settings affect WS client behavior
- Could expose via settingsStore

---

### Task T-009: Channel Sidebar

**Implementation Steps:**

1. **Create sidebar components:**
   - src/lib/components/sidebar/Sidebar.svelte
   - src/lib/components/sidebar/SessionList.svelte
   - src/lib/components/sidebar/SessionItem.svelte
   - src/lib/components/sidebar/ChannelStatus.svelte

2. **Implement sidebar layout:**
   - Collapsible (hamburger menu)
   - Fixed position
   - Responsive (hidden on mobile)

3. **Implement session list:**
   - Display sessions from sessionStore
   - Active session highlight
   - Click to switch
   - New session button

4. **Implement channel status:**
   - CLI indicator
   - Dashboard indicator
   - Telegram indicator
   - WhatsApp indicator
   - Connected/disconnected states

5. **Add to layout:**
   - Include in +layout.svelte
   - Pass session state

**Constraints from Architecture:**
- Session types: main, group, isolated
- Channel types: CLI, Dashboard, Telegram, WhatsApp
- Status: connected, disconnected, enabled, disabled

**Integration Points:**
- Uses sessionStore from T-002
- Affects current session selection

---

### Task T-010: Integration Tests

**Implementation Steps:**

1. **Setup test infrastructure:**
   - Vitest for unit/integration
   - Playwright for E2E (included in SvelteKit)
   - MSW for API mocking

2. **Write WS connection tests:**
   - Mock WS server
   - Test connect/disconnect/reconnect
   - Test message handling

3. **Write component integration tests:**
   - Chat + messageStore
   - Permissions + WS mock
   - Memory search + API mock

4. **Write E2E tests:**
   - Full chat flow
   - Permission approval flow
   - Navigation
   - Responsive layout

5. **Setup CI:**
   - Add test scripts to package.json
   - GitHub Actions workflow
   - Test coverage reporting

**Constraints from Architecture:**
- vitest for unit/integration
- Playwright for E2E
- MSW for API mocking

**Integration Points:**
- Tests all components together
- Mocks Gateway WS and REST API

---

## 6. Acceptance Criteria per Task

### Task T-001: SvelteKit Project Setup

- [ ] SvelteKit project initialized in apps/dashboard/
- [ ] TailwindCSS configured and working
- [ ] All routes accessible: /, /sessions, /traces, /memory, /settings, /status
- [ ] TypeScript compiles without errors
- [ ] Dark theme applied
- [ ] npm run build succeeds
- [ ] npm run dev starts server on port 5173

### Task T-002: WS Client + State Management

- [ ] WS client connects to Gateway on ws://127.0.0.1:18789
- [ ] Connection state tracked (connecting, connected, disconnected, error)
- [ ] Auto-reconnect with exponential backoff implemented
- [ ] All stores created and exportable
- [ ] Message handlers update correct stores
- [ ] Heartbeat working (ping/pong)
- [ ] Unit tests pass for all stores

### Task T-003: Chat Area Component

- [ ] Message list renders all message types
- [ ] Block renderers work (text, code, image, card, table)
- [ ] Tool stream displays real-time updates
- [ ] Message input sends to WS
- [ ] Auto-scroll on new messages
- [ ] Session selector functional
- [ ] Unit tests pass

### Task T-004: Agent Trace View

- [ ] Trace list displays chronological traces
- [ ] Each trace shows tool, duration, tokens, cost, status
- [ ] Expand/collapse params works
- [ ] Filters work (tool name, status)
- [ ] Summary stats accurate
- [ ] Real-time updates work
- [ ] Unit tests pass

### Task T-005: Permission Prompt UI

- [ ] Modal displays permission request data
- [ ] Risk level color coded
- [ ] Approve button sends permission_response(approved)
- [ ] Deny button sends permission_response(denied)
- [ ] Keyboard shortcuts work (y/N)
- [ ] Queue handles multiple requests
- [ ] Unit tests pass

### Task T-006: Memory Search Panel

- [ ] Search input triggers API call
- [ ] Results display correctly
- [ ] Category filters work
- [ ] Tag filters work
- [ ] Empty state displays
- [ ] Error state handles API failures
- [ ] Unit tests pass

### Task T-007: System Status Panel

- [ ] Health indicator shows correct status
- [ ] All metrics display
- [ ] Auto-refresh works
- [ ] Model status shown
- [ ] Recent errors list populated
- [ ] Unit tests pass

### Task T-008: Settings Page

- [ ] Settings load from LocalStorage
- [ ] Save persists to LocalStorage
- [ ] Reset restores defaults
- [ ] Validation works
- [ ] All sections functional
- [ ] Unit tests pass

### Task T-009: Channel Sidebar

- [ ] Session list renders
- [ ] Active session highlighted
- [ ] Session switch works
- [ ] Channel status indicators correct
- [ ] Sidebar collapses on mobile
- [ ] Unit tests pass

### Task T-010: Integration Tests

- [ ] WS connection tests pass
- [ ] Component integration tests pass
- [ ] E2E tests pass
- [ ] Responsive layout tests pass
- [ ] Build verification passes
- [ ] Test coverage > 70%

---

## 7. Quality Expectations

### 7.1 Coverage Requirements

| Task ID | Unit Test Coverage | Integration Coverage |
|---------|-------------------|---------------------|
| T-001 | 80% (types, config) | N/A |
| T-002 | 90% (stores, WS client) | 80% (connection flow) |
| T-003 | 85% (components) | 75% (store integration) |
| T-004 | 85% (components) | 75% (store integration) |
| T-005 | 90% (modal, handlers) | 80% (WS response) |
| T-006 | 85% (components) | 75% (API mock) |
| T-007 | 85% (components) | 75% (API mock) |
| T-008 | 85% (form, persistence) | 75% (LocalStorage) |
| T-009 | 85% (components) | 75% (store integration) |
| T-010 | N/A | 80% (E2E flows) |

**Overall Target:** 70%+ combined coverage

### 7.2 Task Completion Time

| Task ID | Estimated Time | Max Time |
|---------|---------------|----------|
| T-001 | 3-4 hours | 6 hours |
| T-002 | 3-4 hours | 6 hours |
| T-003 | 3-4 hours | 6 hours |
| T-004 | 3-4 hours | 6 hours |
| T-005 | 2-3 hours | 4 hours |
| T-006 | 3-4 hours | 6 hours |
| T-007 | 2-3 hours | 4 hours |
| T-008 | 2-3 hours | 4 hours |
| T-009 | 2-3 hours | 4 hours |
| T-010 | 3-4 hours | 6 hours |

**Total Estimated:** 26-34 hours

### 7.3 Build and Run Stability

- All builds must complete without errors
- No TypeScript compilation errors
- No console errors in browser (except expected WS connection attempts)
- All routes must load without 404
- Responsive layout must work on mobile/tablet/desktop

---

## 8. Risks and Edge Cases

### 8.1 Technical Risks

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|------------|
| Gateway WS protocol incompatibility | Medium | High | Use @osai/types for message types, test with Gateway early |
| SvelteKit SSR issues | Low | Medium | Use SPA mode with adapter-static |
| TailwindCSS conflicts with SvelteKit | Low | Low | Follow official integration guide |
| WebSocket reconnection issues | Medium | Medium | Implement robust reconnection with backoff |
| Performance with large message lists | Medium | Medium | Use virtual scrolling (svelte-virtual-list) |
| Browser compatibility | Low | Low | Target modern browsers (Chrome, Firefox, Safari) |

### 8.2 Edge Cases

**Chat Area:**
- Empty message (should not send)
- Very long message (scroll/render performance)
- Special characters in markdown
- Malformed code blocks
- Missing block type (fallback to text)
- Rapid tool_stream updates (throttling)

**Permission Prompts:**
- Multiple simultaneous requests (queue)
- Timeout before response (auto-deny)
- Connection loss during prompt (reconnect)
- Invalid request data (error handling)

**Memory Search:**
- Empty query (no search or wildcard)
- Very long query (truncate or error)
- No results (empty state)
- API timeout (error state)
- Large result sets (pagination)

**System Status:**
- Gateway down (error state)
- Partial metrics available (graceful degradation)
- Metrics overflow (formatting)

**WS Connection:**
- Gateway not running (connection refused)
- Network interruption (reconnection)
- Authentication required (not applicable for local)
- Message ordering (sequence handling)

### 8.3 Dependency Risks

| Dependency | Risk | Mitigation |
|------------|------|------------|
| F-002 Gateway | Protocol changes | Pin @osai/types version |
| @osai/types | Missing types | Extend locally if needed |
| SvelteKit | Breaking changes | Pin version, use stable |
| TailwindCSS | Class conflicts | Use consistent naming |
| marked | XSS vulnerabilities | Sanitize HTML output |
| highlight.js | Large bundle | Use subset of languages |

---

## 9. Notes

### 9.1 Profile Alignment

Данный roadmap следует профилю `web` (ts-frontend):
- TypeScript mandatory
- SvelteKit + TailwindCSS stack
- Clear separation: components, stores, services
- Unit + integration tests
- Accessibility and UX focus
- Security: XSS prevention, no secrets in client

### 9.2 Clarifications

1. **REST API vs WS:** Memory search и status используют REST API, чат -- WS. Это следует из архитектуры.

2. **SSR Mode:** Dashboard -- SPA, без SSR. Используется adapter-static с fallback.

3. **Virtualization:** Message list должен использовать virtual scrolling для производительности при большом количестве сообщений.

4. **Error Handling:** Все API/WS ошибки должны быть обработаны и отображены пользователю.

5. **Mobile Support:** Responsive layout обязателен, но mobile-first не требуется. Desktop -- primary.

### 9.3 Assumptions

1. Gateway WS endpoint: ws://127.0.0.1:18789
2. REST API base: http://127.0.0.1:18789/api/v1/
3. Dark theme -- default, light theme optional
4. Single user, no authentication required
5. Modern browsers only (Chrome 90+, Firefox 90+, Safari 14+)

### 9.4 Future Enhancements (Out of Scope)

- Multi-theme support (custom themes)
- Message search
- Export conversations
- Keyboard shortcuts for navigation
- Accessibility improvements (screen reader)
- PWA support (offline)
- Push notifications
- Session sharing

---

*End of Task Roadmap: Web Dashboard v1.0*
