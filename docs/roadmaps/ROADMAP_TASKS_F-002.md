# Task Roadmap: Gateway - WebSocket Control Plane

**Version:** v1.0
**Generated:** 2026-03-24
**Agent:** TDD Planner Agent
**Status:** Ready for Implementation

---

## 1. Feature Overview

- **Feature ID:** F-002
- **Feature Name:** Gateway - WebSocket Control Plane
- **Feature Description:** Единая точка входа для всех клиентских подключений. WebSocket server на localhost, маршрутизация сообщений к сессиям, session router (main, group, isolated), session persistence/resume, streaming результатов (tool_stream, block, permission_request). Включает базовый Channel Handler interface.
- **Related Requirements:** FR-001-FR-010, NFR-006, NFR-008, NFR-011
- **Domain:** gateway
- **Git branch:** feature/gateway-ws-control-plane

---

## 2. Dependencies

### 2.1 Feature Dependencies

| Feature | Name | Type | Notes |
|---------|------|------|-------|
| **F-001** | Monorepo Infrastructure | Blocking | Требуется packages/types с WS message types |

Фича F-002 зависит от F-001 (Monorepo Infrastructure):
- `@osai/types` package с WS message types
- Базовая конфигурация tsconfig, eslint, tsup
- CI/CD pipeline

### 2.2 Task Dependencies

| Task ID | Depends On | Type |
|---------|------------|------|
| T-001 | None | Independent |
| T-002 | T-001 | Blocking |
| T-003 | T-002 | Blocking |
| T-004 | T-003 | Blocking |
| T-005 | T-002 | Blocking |
| T-006 | T-004, T-005 | Blocking |
| T-007 | T-006 | Blocking |
| T-008 | T-007 | Blocking |

### 2.3 Development Order

**Параллельное выполнение:**
- После T-002 задачи T-003 (WS Protocol) и T-005 (Channel Handler Interface) могут выполняться параллельно

**Последовательное выполнение:**
- T-001 -> T-002 -> (T-003 || T-005) -> T-004 -> T-006 -> T-007 -> T-008

```
T-001 (Package Setup)
   |
   v
T-002 (WS Server Core)
   |
   +---> T-003 (WS Protocol) ----+
   |                             |
   +---> T-005 (Channel Handler)-+
   |                             |
   +---> T-004 (Session Router) -+---> T-006 (Session Persistence) ---> T-007 (Integration) ---> T-008 (Verification)
```

---

## 3. Task Breakdown

### Task T-001: Gateway Package Setup

**Description:**
Создание packages/gateway структуры: package.json, tsconfig.json, tsup.config.ts, базовая структура директорий (src/, __tests__/), импорт типов из @osai/types.

**Estimated Time:** 2-3 hours

**Dependencies:** None

**Scope:**
- **In scope:**
  - Создание packages/gateway/package.json
  - Создание packages/gateway/tsconfig.json (extends root)
  - Создание packages/gateway/tsup.config.ts
  - Создание структуры директорий: src/, src/server/, src/session/, src/protocol/, src/channel/, __tests__/
  - Добавление зависимостей: ws, better-sqlite3, pino
  - Добавление devDependencies: vitest, @types/ws, @types/better-sqlite3
  - Создание src/index.ts с базовыми экспортами
  - Проверка импорта типов из @osai/types

- **Out scope:**
  - Реализация WebSocket server (Task T-002)
  - Реализация протокола (Task T-003)
  - Конфигурация CI/CD (уже есть в F-001)

---

### Task T-002: WebSocket Server Core

**Description:**
Реализация WebSocket server на библиотеке ws: создание сервера, привязка к host:port (127.0.0.1:18789), обработка connection lifecycle (connect, disconnect, error), graceful shutdown.

**Estimated Time:** 3-4 hours

**Dependencies:** T-001 (Blocking)

**Scope:**
- **In scope:**
  - Создание src/server/WebSocketServer.ts
  - Создание src/server/Gateway.ts (основной класс Gateway)
  - Реализация start() и stop() методов
  - Обработка connection/disconnection events
  - Connection tracking (Map<WebSocket, ClientInfo>)
  - Error handling (connection errors, invalid messages)
  - Graceful shutdown с закрытием всех соединений
  - Конфигурация host/port из GatewayConfig
  - Логирование через pino

- **Out scope:**
  - Обработка сообщений (Task T-003)
  - Session routing (Task T-004)
  - Channel handlers (Task T-005)

---

### Task T-003: WS Protocol Implementation

**Description:**
Реализация WS протокола: парсинг inbound сообщений (message, command, permission_response, subscribe), отправка outbound сообщений (block, tool_stream, permission_request, error, status, event), message routing к соответствующим обработчикам.

**Estimated Time:** 3-4 hours

**Dependencies:** T-002 (Blocking)

**Scope:**
- **In scope:**
  - Создание src/protocol/MessageParser.ts
  - Создание src/protocol/MessageRouter.ts
  - Создание src/protocol/types.ts (inbound/outbound message types)
  - Парсинг InboundMessage (4 типа)
  - Генерация OutboundMessage (6 типов)
  - Валидация сообщений (JSON schema или zod)
  - Message routing на основе session_id
  - Error responses при невалидных сообщениях
  - Unit тесты для парсинга и валидации

- **Out scope:**
  - Session Router логика (Task T-004)
  - Channel Handler implementations (Task T-005)

---

### Task T-004: Session Router

**Description:**
Реализация Session Router: управление сессиями (main, group, isolated), activation modes (always, mention, wake_word, passive), queue modes (sequential, parallel), создание/получение/удаление сессий.

**Estimated Time:** 3-4 hours

**Dependencies:** T-002 (Blocking)

**Scope:**
- **In scope:**
  - Создание src/session/SessionRouter.ts
  - Создание src/session/Session.ts (interface и implementation)
  - Создание src/session/types.ts (SessionType, ActivationMode, QueueMode, SessionState)
  - Реализация createSession(), getSession(), resumeSession(), deleteSession()
  - Activation mode логика (фильтрация сообщений)
  - Queue mode логика (sequential vs parallel processing)
  - Session state management (idle, processing, waiting_permission, error)
  - Session history tracking (in-memory, ограниченный размер)
  - Unit тесты для Session Router

- **Out scope:**
  - Session persistence в SQLite (Task T-006)
  - Integration с Agent Runtime (F-004)

---

### Task T-005: Channel Handler Interface

**Description:**
Определение базового Channel Handler interface: методы для send/receive сообщений, lifecycle hooks, регистрация/дерегистрация channel handlers в Gateway.

**Estimated Time:** 2-3 hours

**Dependencies:** T-002 (Blocking)

**Scope:**
- **In scope:**
  - Создание src/channel/ChannelHandler.ts (interface)
  - Создание src/channel/ChannelManager.ts
  - Создание src/channel/types.ts (ChannelType, ChannelConfig, ChannelStatus)
  - Определение ChannelHandler interface:
    - send(message: OutboundMessage): void
    - onMessage(handler: MessageHandler): void
    - connect(): Promise<void>
    - disconnect(): Promise<void>
    - getStatus(): ChannelStatus
  - Реализация registerChannel(), unregisterChannel()
  - Broadcast events через все активные channels
  - Unit тесты для ChannelManager

- **Out scope:**
  - Telegram channel handler (F-008)
  - WhatsApp channel handler (F-008)
  - Dashboard как channel (F-013)

---

### Task T-006: Session Persistence

**Description:**
Реализация session persistence через SQLite: сериализация/десериализация сессий, сохранение в БД при изменении, восстановление сессий при restart, WAL mode для reliability.

**Estimated Time:** 3-4 hours

**Dependencies:** T-004, T-005 (Blocking)

**Scope:**
- **In scope:**
  - Создание src/persistence/SessionPersistence.ts
  - Создание src/persistence/Database.ts (SQLite connection)
  - SQLite schema для sessions и session_messages
  - serializeSession() - конвертация Session в JSON
  - deserializeSession() - восстановление Session из JSON
  - saveSession() - сохранение в БД
  - loadSession() - загрузка из БД
  - loadAllSessions() - загрузка всех сессий (для resume на startup)
  - deleteSession() - удаление из БД
  - WAL mode включение
  - Integration с SessionRouter

- **Out scope:**
  - Full memory system (F-006)
  - Audit log persistence (F-010)

---

### Task T-007: Integration Tests

**Description:**
Комплексные integration тесты: WS message flow end-to-end, session routing scenarios, persistence + resume flow, multiple concurrent connections.

**Estimated Time:** 3-4 hours

**Dependencies:** T-006 (Blocking)

**Scope:**
- **In scope:**
  - Создание __tests__/integration/gateway.test.ts
  - Создание __tests__/integration/session-router.test.ts
  - Создание __tests__/integration/persistence.test.ts
  - Создание __tests__/helpers/ws-client.ts (test WS client)
  - Тест: full message flow (connect -> send message -> receive response)
  - Тест: session creation и routing
  - Тест: session persistence и resume
  - Тест: multiple concurrent connections
  - Тест: graceful shutdown
  - Тест: error scenarios (invalid messages, unknown sessions)

- **Out scope:**
  - E2E тесты с Agent Runtime (требует F-004)
  - Load testing (V1 scope)

---

### Task T-008: Build and Run Verification

**Description:**
Финальная верификация Gateway пакета: сборка, запуск standalone WS server, подключение test client, проверка всех компонентов.

**Estimated Time:** 2-3 hours

**Dependencies:** T-007 (Blocking)

**Scope:**
- **In scope:**
  - Выполнение pnpm build в packages/gateway
  - Создание scripts/test-gateway.ts (minimal test server)
  - Проверка запуска WS server на 127.0.0.1:18789
  - Проверка подключения WS client
  - Проверка отправки/получения сообщений
  - Проверка session persistence (restart -> resume)
  - Обновление README.md в packages/gateway
  - Проверка всех тестов (unit + integration)

- **Out scope:**
  - Integration с другими пакетами (F-004 Agent Runtime)
  - Production deployment configuration

---

## 4. Test Strategy (TDD)

### 4.1 Test Types per Task

| Task ID | Unit Tests | Integration Tests | Build & Run Verification |
|---------|------------|-------------------|--------------------------|
| T-001 | - | - | REQUIRED |
| T-002 | REQUIRED | - | REQUIRED |
| T-003 | REQUIRED | - | REQUIRED |
| T-004 | REQUIRED | - | REQUIRED |
| T-005 | REQUIRED | - | REQUIRED |
| T-006 | REQUIRED | REQUIRED | REQUIRED |
| T-007 | - | REQUIRED | REQUIRED |
| T-008 | - | - | REQUIRED |

### 4.2 Build and Run Verification

**Build Verification:**

```bash
# Команда установки зависимостей
cd /home/aristman/projects/osai
pnpm install

# Ожидаемый результат
# - Все зависимости установлены
# - @osai/types резолвится как workspace package

# Команда сборки gateway
pnpm --filter @osai/gateway build

# Ожидаемый результат
# - dist/index.mjs создан
# - dist/index.cjs создан
# - dist/index.d.ts создан
# - sourcemaps созданы

# Критерии успешной сборки
# - Exit code: 0
# - No TypeScript errors
# - All exports valid
```

**Run Verification:**

```bash
# Команда тестов
pnpm --filter @osai/gateway test

# Ожидаемый результат
# - vitest run проходит
# - Все unit тесты green
# - Все integration тесты green
# - Coverage report сгенерирован

# Команда type-check
pnpm --filter @osai/gateway type-check

# Ожидаемый результат
# - tsc --noEmit проходит
# - Все типы валидны
```

**Standalone Server Test:**

```typescript
// scripts/test-gateway.ts
import { Gateway } from '../packages/gateway/dist/index.mjs';

const gateway = new Gateway({
  host: '127.0.0.1',
  port: 18789,
  channels: []
});

await gateway.start();
console.log('Gateway started on ws://127.0.0.1:18789');

// Test: connect with WebSocket client
// Test: send message
// Test: verify response

setTimeout(() => gateway.stop(), 5000);
```

### 4.3 Test Cases per Task

---

#### Task T-001: Gateway Package Setup

**Test Strategy:** Build Verification only

| Test ID | Type | Description | Preconditions | Expected Result | Pass/Fail Criteria |
|---------|------|-------------|---------------|-----------------|-------------------|
| T001-01 | Build | package.json валиден | - | pnpm распознаёт пакет | `pnpm install` не падает |
| T001-02 | Build | @osai/types импортируется | types package собран | import from '@osai/types' работает | TypeScript компилируется |
| T001-03 | Build | tsconfig расширяет root | tsconfig.json существует | extends: "../../tsconfig.json" | `grep` показывает extends |
| T001-04 | Build | Директории существуют | - | src/, __tests__/ созданы | `ls -d src __tests__` |
| T001-05 | Build | Зависимости установлены | pnpm install выполнен | ws, better-sqlite3 в node_modules | `pnpm list ws` |

---

#### Task T-002: WebSocket Server Core

**Test Strategy:** Unit Tests + Build Verification

| Test ID | Type | Description | Preconditions | Expected Result | Pass/Fail Criteria |
|---------|------|-------------|---------------|-----------------|-------------------|
| T002-01 | Unit | Gateway создаётся с config | Gateway class существует | Экземпляр создан | `new Gateway(config)` не бросает |
| T002-02 | Unit | start() запускает WS server | Gateway создан | Server слушает на порту | net.connect() успешен |
| T002-03 | Unit | stop() закрывает server | Server запущен | Server закрыт | net.connect() падает |
| T002-04 | Unit | Connection отслеживается | Server запущен | Client добавлен в Map | connectionCount === 1 |
| T002-05 | Unit | Disconnection отслеживается | Client подключён | Client удалён из Map | connectionCount === 0 |
| T002-06 | Unit | Error handling работает | Invalid frame отправлен | Error logged, connection не падает | Error callback вызван |
| T002-07 | Unit | Graceful shutdown | 3 clients подключены | Все получают close frame | Все connections закрыты |
| T002-08 | Build | Пакет собирается | Код написан | dist/ создан | `pnpm build` exit 0 |

**Пример Unit Test (vitest):**

```typescript
// __tests__/unit/WebSocketServer.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { WebSocketServer } from '../../src/server/WebSocketServer';
import WebSocket from 'ws';

describe('WebSocketServer', () => {
  let server: WebSocketServer;

  beforeEach(async () => {
    server = new WebSocketServer({ host: '127.0.0.1', port: 18789 });
    await server.start();
  });

  afterEach(async () => {
    await server.stop();
  });

  it('should accept connections', async () => {
    const client = new WebSocket('ws://127.0.0.1:18789');

    await new Promise((resolve) => {
      client.on('open', resolve);
    });

    expect(server.getConnectionCount()).toBe(1);
    client.close();
  });

  it('should track disconnections', async () => {
    const client = new WebSocket('ws://127.0.0.1:18789');

    await new Promise((resolve) => {
      client.on('open', resolve);
    });

    client.close();

    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(server.getConnectionCount()).toBe(0);
  });
});
```

---

#### Task T-003: WS Protocol Implementation

**Test Strategy:** Unit Tests + Build Verification

| Test ID | Type | Description | Preconditions | Expected Result | Pass/Fail Criteria |
|---------|------|-------------|---------------|-----------------|-------------------|
| T003-01 | Unit | Парсинг message | JSON string | InboundMessage object | type === 'message' |
| T003-02 | Unit | Парсинг command | JSON string | InboundMessage object | type === 'command' |
| T003-03 | Unit | Парсинг permission_response | JSON string | InboundMessage object | type === 'permission_response' |
| T003-04 | Unit | Парсинг subscribe | JSON string | InboundMessage object | type === 'subscribe' |
| T003-05 | Unit | Invalid JSON rejected | Invalid JSON | Error thrown | Error.code === 'PARSE_ERROR' |
| T003-06 | Unit | Unknown type rejected | Unknown message type | Error response | Error.code === 'UNKNOWN_TYPE' |
| T003-07 | Unit | Missing fields rejected | Missing session_id | Validation error | Error.code === 'VALIDATION_ERROR' |
| T003-08 | Unit | Outbound block message | Message data | JSON string | Valid block message |
| T003-09 | Unit | Outbound tool_stream | Stream data | JSON string | Valid tool_stream message |
| T003-10 | Unit | Outbound permission_request | Request data | JSON string | Valid permission_request |
| T003-11 | Unit | Message routing | message с session_id | Routed to session | Router.receive() вызван |

---

#### Task T-004: Session Router

**Test Strategy:** Unit Tests + Build Verification

| Test ID | Type | Description | Preconditions | Expected Result | Pass/Fail Criteria |
|---------|------|-------------|---------------|-----------------|-------------------|
| T004-01 | Unit | createSession main | Router создан | Session с type='main' | session.id определён |
| T004-02 | Unit | createSession group | Router создан | Session с type='group' | session.type === 'group' |
| T004-03 | Unit | createSession isolated | Router создан | Session с type='isolated' | session.type === 'isolated' |
| T004-04 | Unit | getSession возвращает сессию | Session создана | Session object | session.id совпадает |
| T004-05 | Unit | getSession unknown возвращает undefined | Unknown ID | undefined | result === undefined |
| T004-06 | Unit | deleteSession удаляет | Session создана | Session удалена | getSession() === undefined |
| T004-07 | Unit | Activation mode 'always' | Session с always | Все сообщения обрабатываются | processMessage вызван |
| T004-08 | Unit | Activation mode 'mention' | Session с mention | Только @mention обрабатываются | Фильтрация работает |
| T004-09 | Unit | Queue mode sequential | Session sequential | Сообщения в очереди | Порядок сохранён |
| T004-10 | Unit | Queue mode parallel | Session parallel | Сообщения параллельно | Concurrent processing |
| T004-11 | Unit | Session state transitions | Session создан | idle -> processing -> idle | State machine работает |

---

#### Task T-005: Channel Handler Interface

**Test Strategy:** Unit Tests + Build Verification

| Test ID | Type | Description | Preconditions | Expected Result | Pass/Fail Criteria |
|---------|------|-------------|---------------|-----------------|-------------------|
| T005-01 | Unit | ChannelHandler interface | Interface определён | Все методы есть | TypeScript компилируется |
| T005-02 | Unit | registerChannel | Manager создан | Channel добавлен | getChannels().length === 1 |
| T005-03 | Unit | unregisterChannel | Channel зарегистрирован | Channel удалён | getChannels().length === 0 |
| T005-04 | Unit | broadcastEvent | 2 channels активны | Оба получают event | send() вызван 2 раза |
| T005-05 | Unit | Channel status tracking | Channel подключён | status === 'connected' | getStatus().connected |
| T005-06 | Unit | Disconnect propagates | Channel отключён | Status обновлён | status === 'disconnected' |

---

#### Task T-006: Session Persistence

**Test Strategy:** Unit Tests + Integration Tests + Build Verification

| Test ID | Type | Description | Preconditions | Expected Result | Pass/Fail Criteria |
|---------|------|-------------|---------------|-----------------|-------------------|
| T006-01 | Unit | serializeSession | Session создан | JSON object | JSON.parse() работает |
| T006-02 | Unit | deserializeSession | JSON string | Session object | session.id совпадает |
| T006-03 | Unit | saveSession | Session + DB | Row в БД | SELECT возвращает данные |
| T006-04 | Unit | loadSession | Row в БД | Session object | session.id совпадает |
| T006-05 | Unit | loadAllSessions | 3 sessions в БД | 3 Session objects | length === 3 |
| T006-06 | Unit | deleteSession | Row в БД | Row удалён | SELECT пустой |
| T006-07 | Unit | WAL mode enabled | DB создана | journal_mode = 'wal' | PRAGMA query |
| T006-08 | Integration | Persist on update | Session изменён | DB обновлён | Changes persisted |
| T006-09 | Integration | Resume after restart | Sessions в БД | Sessions восстановлены | SessionRouter populated |

**Пример Integration Test:**

```typescript
// __tests__/integration/persistence.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SessionPersistence } from '../../src/persistence/SessionPersistence';
import { SessionRouter } from '../../src/session/SessionRouter';
import { tmpdir } from 'os';
import { join } from 'path';
import { rmSync } from 'fs';

describe('SessionPersistence', () => {
  let persistence: SessionPersistence;
  let router: SessionRouter;
  const dbPath = join(tmpdir(), `test-${Date.now()}.db`);

  beforeEach(async () => {
    persistence = new SessionPersistence(dbPath);
    await persistence.initialize();
    router = new SessionRouter(persistence);
  });

  afterEach(() => {
    rmSync(dbPath, { force: true });
  });

  it('should persist and resume sessions', async () => {
    // Create session
    const session = router.createSession('main', { activationMode: 'always' });
    session.addMessage({ role: 'user', content: 'Hello' });

    // Save
    await persistence.saveSession(session);

    // Create new router (simulate restart)
    const newRouter = new SessionRouter(persistence);
    await newRouter.loadSessions();

    // Verify
    const resumed = newRouter.getSession(session.id);
    expect(resumed).toBeDefined();
    expect(resumed?.history.length).toBe(1);
  });
});
```

---

#### Task T-007: Integration Tests

**Test Strategy:** Integration Tests + Build Verification

| Test ID | Type | Description | Preconditions | Expected Result | Pass/Fail Criteria |
|---------|------|-------------|---------------|-----------------|-------------------|
| T007-01 | Integration | Full message flow | Gateway запущен | message -> response | WS client получил ответ |
| T007-02 | Integration | Session creation flow | Client подключён | Session создан | Session существует |
| T007-03 | Integration | Session routing | message с session_id | Routed correctly | Session получила message |
| T007-04 | Integration | Persistence + resume | Sessions сохранены | Resumed on startup | Sessions восстановлены |
| T007-05 | Integration | Multiple connections | 3 clients | All connected | connectionCount === 3 |
| T007-06 | Integration | Broadcast event | 3 clients | All received | All got event |
| T007-07 | Integration | Graceful shutdown | Clients connected | Clean disconnect | All received close |
| T007-08 | Integration | Invalid message handling | Invalid JSON | Error response | Error message sent |
| T007-09 | Integration | Unknown session handling | Unknown session_id | Error response | SESSION_NOT_FOUND |
| T007-10 | Integration | Permission request flow | Permission needed | Request sent | permission_request received |

---

#### Task T-008: Build and Run Verification

**Test Strategy:** Build Verification (Final Integration)

| Test ID | Type | Description | Preconditions | Expected Result | Pass/Fail Criteria |
|---------|------|-------------|---------------|-----------------|-------------------|
| T008-01 | Build | Пакет собирается | Код написан | dist/ создан | `pnpm build` exit 0 |
| T008-02 | Build | Типы экспортируются | dist/ создан | .d.ts файлы | TypeScript может импортировать |
| T008-03 | Run | Server запускается | Build завершён | Server слушает | netstat показывает порт |
| T008-04 | Run | Client подключается | Server запущен | Connection success | WS client on('open') |
| T008-05 | Run | Message отправляется | Client подключён | Response received | on('message') вызван |
| T008-06 | Run | Session persist работает | Session создан | DB file exists | File created |
| T008-07 | Run | Resume работает | DB существует | Sessions loaded | Sessions restored |
| T008-08 | Build | Все тесты проходят | Tests написаны | All green | `pnpm test` exit 0 |

---

## 5. Implementation Plan per Task

### Task T-001: Gateway Package Setup

**Logical Implementation Steps:**

1. Создать packages/gateway/package.json:
   ```json
   {
     "name": "@osai/gateway",
     "version": "0.0.1",
     "type": "module",
     "main": "./dist/index.cjs",
     "module": "./dist/index.mjs",
     "types": "./dist/index.d.ts",
     "exports": {
       ".": {
         "import": "./dist/index.mjs",
         "require": "./dist/index.cjs",
         "types": "./dist/index.d.ts"
       }
     },
     "files": ["dist"],
     "scripts": {
       "build": "tsup",
       "dev": "tsup --watch",
       "test": "vitest run",
       "test:watch": "vitest",
       "type-check": "tsc --noEmit"
     },
     "dependencies": {
       "@osai/types": "workspace:*",
       "ws": "^8.16.0",
       "better-sqlite3": "^9.4.0",
       "pino": "^8.18.0"
     },
     "devDependencies": {
       "@types/ws": "^8.5.10",
       "@types/better-sqlite3": "^7.6.8",
       "tsup": "^8.0.0",
       "typescript": "^5.0.0",
       "vitest": "^1.0.0"
     }
   }
   ```

2. Создать packages/gateway/tsconfig.json:
   ```json
   {
     "extends": "../../tsconfig.json",
     "compilerOptions": {
       "outDir": "./dist",
       "rootDir": "./src"
     },
     "include": ["src/**/*"],
     "exclude": ["node_modules", "dist", "__tests__"]
   }
   ```

3. Создать структуру директорий:
   ```
   packages/gateway/
   ├── src/
   │   ├── index.ts
   │   ├── server/
   │   ├── session/
   │   ├── protocol/
   │   ├── channel/
   │   └── persistence/
   └── __tests__/
       ├── unit/
       └── integration/
   ```

4. Создать базовый src/index.ts:
   ```typescript
   export * from './server/Gateway';
   export * from './session/SessionRouter';
   export * from './protocol/types';
   export * from './channel/ChannelHandler';
   ```

**Constraints from Architecture:**
- Node.js 20 LTS
- TypeScript 5.x strict mode
- ws library для WebSocket server
- better-sqlite3 для persistence
- pino для logging

**Integration Points:**
- @osai/types для message types
- Root tsconfig.json
- Root tsup.config.ts (опционально)

---

### Task T-002: WebSocket Server Core

**Logical Implementation Steps:**

1. Создать src/server/WebSocketServer.ts:
   ```typescript
   import { WebSocketServer as WSServer, WebSocket, RawData } from 'ws';
   import { Logger } from 'pino';

   interface WebSocketServerConfig {
     host: string;
     port: number;
   }

   interface ClientInfo {
     id: string;
     socket: WebSocket;
     connectedAt: Date;
     subscriptions: string[];
   }

   export class WebSocketServer {
     private server: WSServer | null = null;
     private clients: Map<WebSocket, ClientInfo> = new Map();
     private logger: Logger;

     constructor(config: WebSocketServerConfig, logger: Logger) {
       // ...
     }

     async start(): Promise<void> {
       this.server = new WSServer({
         host: this.config.host,
         port: this.config.port
       });

       this.server.on('connection', (socket, request) => {
         this.handleConnection(socket, request);
       });

       this.server.on('error', (error) => {
         this.handleError(error);
       });
     }

     async stop(): Promise<void> {
       // Close all connections
       for (const [socket] of this.clients) {
         socket.close(1001, 'Server shutting down');
       }
       this.clients.clear();

       // Close server
       return new Promise((resolve) => {
         this.server?.close(() => resolve());
       });
     }

     getConnectionCount(): number {
       return this.clients.size;
     }

     private handleConnection(socket: WebSocket, request: IncomingMessage): void {
       // ...
     }

     private handleDisconnection(socket: WebSocket): void {
       // ...
     }
   }
   ```

2. Создать src/server/Gateway.ts:
   ```typescript
   import { WebSocketServer } from './WebSocketServer';
   import { SessionRouter } from '../session/SessionRouter';
   import { ChannelManager } from '../channel/ChannelManager';
   import { MessageRouter } from '../protocol/MessageRouter';

   export interface GatewayConfig {
     host: string;
     port: number;
     channels: ChannelConfig[];
   }

   export class Gateway {
     private wsServer: WebSocketServer;
     private sessionRouter: SessionRouter;
     private channelManager: ChannelManager;
     private messageRouter: MessageRouter;

     constructor(config: GatewayConfig) {
       // Initialize components
     }

     async start(): Promise<void> {
       // Start WS server
       // Load persisted sessions
       // Register channels
     }

     async stop(): Promise<void> {
       // Persist sessions
       // Stop WS server
     }

     getSession(sessionId: string): Session | undefined {
       return this.sessionRouter.getSession(sessionId);
     }

     createSession(type: SessionType, config?: SessionConfig): Session {
       return this.sessionRouter.createSession(type, config);
     }
   }
   ```

**Constraints from Architecture:**
- WS server на 127.0.0.1:18789 (default)
- Connection tracking required
- Graceful shutdown required (NFR-008)

**Integration Points:**
- SessionRouter (Task T-004)
- MessageRouter (Task T-003)
- ChannelManager (Task T-005)

---

### Task T-003: WS Protocol Implementation

**Logical Implementation Steps:**

1. Создать src/protocol/types.ts:
   ```typescript
   // Inbound messages (Client -> Server)
   export type InboundMessage =
     | { type: 'message'; session_id: string; content: string; channel?: string }
     | { type: 'command'; command: string; params?: Record<string, unknown> }
     | { type: 'permission_response'; request_id: string; decision: 'approved' | 'denied' }
     | { type: 'subscribe'; events: string[] };

   // Outbound messages (Server -> Client)
   export type OutboundMessage =
     | { type: 'block'; session_id: string; block_type: 'text' | 'code' | 'image' | 'card' | 'table'; content: string; language?: string }
     | { type: 'tool_stream'; session_id: string; tool: string; action: string; chunk: Record<string, unknown> }
     | { type: 'permission_request'; request_id: string; session_id: string; tool: string; action: string; params: Record<string, unknown>; risk_level: string }
     | { type: 'error'; code: string; message: string; severity: string }
     | { type: 'status'; session_id: string; state: SessionState }
     | { type: 'event'; event: string; data: Record<string, unknown> };
   ```

2. Создать src/protocol/MessageParser.ts:
   ```typescript
   import { z } from 'zod';
   import { InboundMessage } from './types';

   const messageSchema = z.object({
     type: z.literal('message'),
     session_id: z.string().min(1),
     content: z.string(),
     channel: z.string().optional()
   });

   const commandSchema = z.object({
     type: z.literal('command'),
     command: z.string().min(1),
     params: z.record(z.unknown()).optional()
   });

   // ... other schemas

   export class MessageParser {
     parse(data: string): InboundMessage {
       let json: unknown;
       try {
         json = JSON.parse(data);
       } catch (e) {
         throw new ParseError('Invalid JSON');
       }

       // Validate and return
       return this.validate(json);
     }

     private validate(json: unknown): InboundMessage {
       // Use discriminated union for validation
       // ...
     }
   }
   ```

3. Создать src/protocol/MessageRouter.ts:
   ```typescript
   export class MessageRouter {
     constructor(
       private sessionRouter: SessionRouter,
       private channelManager: ChannelManager
     ) {}

     route(message: InboundMessage, clientId: string): void {
       switch (message.type) {
         case 'message':
           this.routeToSession(message.session_id, message);
           break;
         case 'command':
           this.handleCommand(message);
           break;
         case 'permission_response':
           this.handlePermissionResponse(message);
           break;
         case 'subscribe':
           this.handleSubscribe(message, clientId);
           break;
       }
     }
   }
   ```

**Constraints from Architecture:**
- 4 inbound message types
- 6 outbound message types
- Message processing latency < 10ms (NFR-006)

**Integration Points:**
- SessionRouter для routing
- ChannelManager для subscriptions

---

### Task T-004: Session Router

**Logical Implementation Steps:**

1. Создать src/session/types.ts:
   ```typescript
   export type SessionType = 'main' | 'group' | 'isolated';
   export type ActivationMode = 'always' | 'mention' | 'wake_word' | 'passive';
   export type QueueMode = 'sequential' | 'parallel';
   export type SessionState = 'idle' | 'processing' | 'waiting_permission' | 'error';

   export interface SessionConfig {
     activationMode: ActivationMode;
     queueMode: QueueMode;
     maxHistorySize?: number;
   }

   export interface Message {
     role: 'user' | 'assistant' | 'system';
     content: string;
     timestamp: Date;
   }
   ```

2. Создать src/session/Session.ts:
   ```typescript
   export class Session {
     id: string;
     type: SessionType;
     activationMode: ActivationMode;
     queueMode: QueueMode;
     state: SessionState = 'idle';
     history: Message[] = [];
     createdAt: Date;
     lastActiveAt: Date;

     constructor(id: string, type: SessionType, config: SessionConfig) {
       // Initialize
     }

     addMessage(message: Omit<Message, 'timestamp'>): void {
       this.history.push({
         ...message,
         timestamp: new Date()
       });
       this.lastActiveAt = new Date();
     }

     shouldProcess(content: string): boolean {
       switch (this.activationMode) {
         case 'always': return true;
         case 'mention': return content.includes('@osai');
         case 'wake_word': return this.checkWakeWord(content);
         case 'passive': return false;
       }
     }
   }
   ```

3. Создать src/session/SessionRouter.ts:
   ```typescript
   export class SessionRouter {
     private sessions: Map<string, Session> = new Map();
     private persistence?: SessionPersistence;

     constructor(persistence?: SessionPersistence) {
       this.persistence = persistence;
     }

     createSession(type: SessionType, config?: SessionConfig): Session {
       const id = this.generateId();
       const session = new Session(id, type, config || this.getDefaultConfig(type));
       this.sessions.set(id, session);
       return session;
     }

     getSession(id: string): Session | undefined {
       return this.sessions.get(id);
     }

     deleteSession(id: string): boolean {
       return this.sessions.delete(id);
     }

     getAllSessions(): Session[] {
       return Array.from(this.sessions.values());
     }

     async loadSessions(): Promise<void> {
       if (!this.persistence) return;
       const sessions = await this.persistence.loadAllSessions();
       sessions.forEach(s => this.sessions.set(s.id, s));
     }
   }
   ```

**Constraints from Architecture:**
- 3 session types: main, group, isolated
- 4 activation modes
- 2 queue modes

**Integration Points:**
- SessionPersistence (Task T-006)
- MessageRouter (Task T-003)

---

### Task T-005: Channel Handler Interface

**Logical Implementation Steps:**

1. Создать src/channel/types.ts:
   ```typescript
   export type ChannelType = 'cli' | 'telegram' | 'whatsapp' | 'dashboard';
   export type ChannelStatus = 'connected' | 'disconnected' | 'error';

   export interface ChannelConfig {
     type: ChannelType;
     enabled: boolean;
     options: Record<string, unknown>;
   }
   ```

2. Создать src/channel/ChannelHandler.ts:
   ```typescript
   import { OutboundMessage, InboundMessage } from '../protocol/types';

   export interface ChannelHandler {
     readonly type: ChannelType;

     // Lifecycle
     connect(): Promise<void>;
     disconnect(): Promise<void>;
     getStatus(): ChannelStatus;

     // Messaging
     send(message: OutboundMessage): void;
     onMessage(handler: (message: InboundMessage) => void): void;
   }
   ```

3. Создать src/channel/ChannelManager.ts:
   ```typescript
   export class ChannelManager {
     private channels: Map<ChannelType, ChannelHandler> = new Map();
     private messageHandlers: ((message: InboundMessage) => void)[] = [];

     registerChannel(handler: ChannelHandler): void {
       this.channels.set(handler.type, handler);
       handler.onMessage((msg) => this.handleChannelMessage(handler.type, msg));
     }

     unregisterChannel(type: ChannelType): void {
       const handler = this.channels.get(type);
       if (handler) {
         handler.disconnect();
         this.channels.delete(type);
       }
     }

     broadcast(message: OutboundMessage): void {
       for (const handler of this.channels.values()) {
         if (handler.getStatus() === 'connected') {
           handler.send(message);
         }
       }
     }

     private handleChannelMessage(type: ChannelType, message: InboundMessage): void {
       for (const handler of this.messageHandlers) {
         handler(message);
       }
     }
   }
   ```

**Constraints from Architecture:**
- Channel types: cli, telegram, whatsapp, dashboard
- Broadcast capability required

**Integration Points:**
- Gateway (main orchestrator)
- MessageRouter (message handling)

---

### Task T-006: Session Persistence

**Logical Implementation Steps:**

1. Создать src/persistence/Database.ts:
   ```typescript
   import Database from 'better-sqlite3';
   import { join } from 'path';

   export class Database {
     private db: Database.Database;

     constructor(dbPath: string) {
       this.db = new Database(dbPath);
       this.db.pragma('journal_mode = WAL');
       this.initializeSchema();
     }

     private initializeSchema(): void {
       this.db.exec(`
         CREATE TABLE IF NOT EXISTS sessions (
           id TEXT PRIMARY KEY,
           type TEXT NOT NULL,
           activation_mode TEXT NOT NULL,
           queue_mode TEXT NOT NULL,
           state TEXT NOT NULL,
           history TEXT NOT NULL,
           created_at TEXT NOT NULL,
           last_active_at TEXT NOT NULL
         );

         CREATE INDEX IF NOT EXISTS idx_sessions_created ON sessions(created_at);
       `);
     }

     getDb(): Database.Database {
       return this.db;
     }

     close(): void {
       this.db.close();
     }
   }
   ```

2. Создать src/persistence/SessionPersistence.ts:
   ```typescript
   export class SessionPersistence {
     constructor(private db: Database) {}

     async saveSession(session: Session): Promise<void> {
       const stmt = this.db.getDb().prepare(`
         INSERT OR REPLACE INTO sessions
         (id, type, activation_mode, queue_mode, state, history, created_at, last_active_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       `);

       stmt.run(
         session.id,
         session.type,
         session.activationMode,
         session.queueMode,
         session.state,
         JSON.stringify(session.history),
         session.createdAt.toISOString(),
         session.lastActiveAt.toISOString()
       );
     }

     async loadSession(id: string): Promise<Session | null> {
       const stmt = this.db.getDb().prepare('SELECT * FROM sessions WHERE id = ?');
       const row = stmt.get(id) as any;
       return row ? this.deserializeRow(row) : null;
     }

     async loadAllSessions(): Promise<Session[]> {
       const stmt = this.db.getDb().prepare('SELECT * FROM sessions');
       const rows = stmt.all() as any[];
       return rows.map(row => this.deserializeRow(row));
     }

     async deleteSession(id: string): Promise<void> {
       const stmt = this.db.getDb().prepare('DELETE FROM sessions WHERE id = ?');
       stmt.run(id);
     }

     private deserializeRow(row: any): Session {
       // Convert DB row to Session object
     }
   }
   ```

**Constraints from Architecture:**
- SQLite with WAL mode (NFR-008)
- Session serialization format: JSON
- Resume on startup required

**Integration Points:**
- SessionRouter (load/save sessions)
- Gateway (startup initialization)

---

### Task T-007: Integration Tests

**Logical Implementation Steps:**

1. Создать __tests__/helpers/ws-client.ts:
   ```typescript
   import WebSocket from 'ws';

   export class TestWSClient {
     private ws: WebSocket;
     private messages: any[] = [];

     constructor(url: string) {
       this.ws = new WebSocket(url);
       this.ws.on('message', (data) => {
         this.messages.push(JSON.parse(data.toString()));
       });
     }

     async connect(): Promise<void> {
       return new Promise((resolve) => {
         this.ws.on('open', resolve);
       });
     }

     async send(message: any): Promise<void> {
       this.ws.send(JSON.stringify(message));
     }

     getMessages(): any[] {
       return this.messages;
     }

     async waitForMessage(predicate: (msg: any) => boolean, timeout = 5000): Promise<any> {
       return new Promise((resolve, reject) => {
         const timer = setTimeout(() => reject(new Error('Timeout')), timeout);

         const check = () => {
           const msg = this.messages.find(predicate);
           if (msg) {
             clearTimeout(timer);
             resolve(msg);
           }
         };

         this.ws.on('message', check);
         check();
       });
     }

     close(): void {
       this.ws.close();
     }
   }
   ```

2. Создать __tests__/integration/gateway.test.ts:
   ```typescript
   import { describe, it, expect, beforeAll, afterAll } from 'vitest';
   import { Gateway } from '../../src/server/Gateway';
   import { TestWSClient } from '../helpers/ws-client';

   describe('Gateway Integration', () => {
     let gateway: Gateway;
     let client: TestWSClient;

     beforeAll(async () => {
       gateway = new Gateway({ host: '127.0.0.1', port: 18790, channels: [] });
       await gateway.start();
     });

     afterAll(async () => {
       await gateway.stop();
     });

     it('should accept client connections', async () => {
       client = new TestWSClient('ws://127.0.0.1:18790');
       await client.connect();
       // Connection successful if no error
     });

     it('should create session on message', async () => {
       await client.send({
         type: 'message',
         session_id: 'test-main',
         content: 'Hello'
       });

       // Wait for session to be created
       const session = gateway.getSession('test-main');
       expect(session).toBeDefined();
     });
   });
   ```

**Constraints from Architecture:**
- Integration tests must pass
- Test database in temp directory

**Integration Points:**
- All Gateway components

---

### Task T-008: Build and Run Verification

**Logical Implementation Steps:**

1. Выполнить сборку:
   ```bash
   cd /home/aristman/projects/osai
   pnpm --filter @osai/gateway build
   ```

2. Запустить тесты:
   ```bash
   pnpm --filter @osai/gateway test
   ```

3. Создать scripts/test-gateway.ts:
   ```typescript
   import { Gateway } from '../packages/gateway';

   async function main() {
     const gateway = new Gateway({
       host: '127.0.0.1',
       port: 18789,
       channels: []
     });

     console.log('Starting Gateway...');
     await gateway.start();
     console.log('Gateway started on ws://127.0.0.1:18789');

     // Test session creation
     const session = gateway.createSession('main', { activationMode: 'always' });
     console.log(`Session created: ${session.id}`);

     // Keep running for manual testing
     console.log('Press Ctrl+C to stop');
   }

   main().catch(console.error);
   ```

4. Обновить packages/gateway/README.md с документацией

**Constraints from Architecture:**
- All tests must pass
- Build must succeed
- Manual verification required

**Integration Points:**
- None (final verification)

---

## 6. Acceptance Criteria per Task

### Task T-001: Gateway Package Setup

- [ ] packages/gateway/package.json существует
- [ ] packages/gateway/tsconfig.json существует и extends root config
- [ ] Зависимости ws, better-sqlite3, pino установлены
- [ ] devDependencies vitest, @types/* установлены
- [ ] Структура директорий src/, __tests__/ создана
- [ ] src/index.ts экспортирует базовые компоненты
- [ ] `@osai/types` импортируется без ошибок
- [ ] `pnpm install` завершается успешно

### Task T-002: WebSocket Server Core

- [ ] src/server/WebSocketServer.ts существует
- [ ] src/server/Gateway.ts существует
- [ ] start() запускает WS server на указанном host:port
- [ ] stop() корректно закрывает server и все connections
- [ ] Connection/disconnection events отслеживаются
- [ ] Error handling реализован
- [ ] Graceful shutdown работает
- [ ] Unit тесты проходят

### Task T-003: WS Protocol Implementation

- [ ] src/protocol/types.ts содержит InboundMessage и OutboundMessage types
- [ ] src/protocol/MessageParser.ts существует
- [ ] src/protocol/MessageRouter.ts существует
- [ ] Все 4 inbound message types парсятся корректно
- [ ] Все 6 outbound message types генерируются корректно
- [ ] Валидация сообщений работает (invalid JSON, unknown type)
- [ ] Message routing к sessions работает
- [ ] Unit тесты проходят

### Task T-004: Session Router

- [ ] src/session/SessionRouter.ts существует
- [ ] src/session/Session.ts существует
- [ ] createSession() создаёт session с указанным type
- [ ] getSession() возвращает session или undefined
- [ ] deleteSession() удаляет session
- [ ] Activation modes (always, mention, wake_word, passive) работают
- [ ] Queue modes (sequential, parallel) работают
- [ ] Session state transitions корректны
- [ ] Unit тесты проходят

### Task T-005: Channel Handler Interface

- [ ] src/channel/ChannelHandler.ts содержит interface
- [ ] src/channel/ChannelManager.ts существует
- [ ] ChannelHandler interface определяет все методы
- [ ] registerChannel() добавляет channel
- [ ] unregisterChannel() удаляет channel
- [ ] broadcast() отправляет сообщение во все channels
- [ ] Unit тесты проходят

### Task T-006: Session Persistence

- [ ] src/persistence/Database.ts существует
- [ ] src/persistence/SessionPersistence.ts существует
- [ ] SQLite schema создана (sessions table)
- [ ] WAL mode включён
- [ ] serializeSession() работает корректно
- [ ] deserializeSession() работает корректно
- [ ] saveSession() сохраняет в БД
- [ ] loadSession() загружает из БД
- [ ] loadAllSessions() возвращает все sessions
- [ ] deleteSession() удаляет из БД
- [ ] Unit и Integration тесты проходят

### Task T-007: Integration Tests

- [ ] __tests__/integration/gateway.test.ts существует
- [ ] __tests__/integration/session-router.test.ts существует
- [ ] __tests__/integration/persistence.test.ts существует
- [ ] __tests__/helpers/ws-client.ts существует
- [ ] Full message flow тест проходит
- [ ] Session routing тест проходит
- [ ] Persistence + resume тест проходит
- [ ] Multiple connections тест проходит
- [ ] Graceful shutdown тест проходит
- [ ] Error scenarios тесты проходят
- [ ] Все integration тесты green

### Task T-008: Build and Run Verification

- [ ] `pnpm --filter @osai/gateway build` завершается успешно
- [ ] dist/ содержит .mjs, .cjs, .d.ts файлы
- [ ] `pnpm --filter @osai/gateway test` завершается успешно
- [ ] Standalone server запускается на 127.0.0.1:18789
- [ ] WS client может подключиться
- [ ] WS client может отправить и получить сообщение
- [ ] Session persistence работает (restart -> resume)
- [ ] README.md содержит документацию по использованию

---

## 7. Quality Expectations

### Coverage Requirements

| Task ID | Unit Coverage | Integration Coverage |
|---------|---------------|---------------------|
| T-001 | N/A | N/A |
| T-002 | 80%+ | N/A |
| T-003 | 90%+ | N/A |
| T-004 | 85%+ | N/A |
| T-005 | 80%+ | N/A |
| T-006 | 85%+ | 80%+ |
| T-007 | N/A | 90%+ |
| T-008 | N/A | N/A |

### Task Completion Time

| Task ID | Estimated | Target |
|---------|-----------|--------|
| T-001 | 2-3 hours | 3 hours max |
| T-002 | 3-4 hours | 4 hours max |
| T-003 | 3-4 hours | 4 hours max |
| T-004 | 3-4 hours | 4 hours max |
| T-005 | 2-3 hours | 3 hours max |
| T-006 | 3-4 hours | 4 hours max |
| T-007 | 3-4 hours | 4 hours max |
| T-008 | 2-3 hours | 3 hours max |

**Total Estimated:** 21-29 hours (3-4 working days)

### Build and Run Stability

- Build должен быть детерминированным
- Все npm scripts должны возвращать корректный exit code
- No silent failures
- WS server должен стабильно обрабатывать connections/disconnections
- Session persistence не должна терять данные при crash

### Performance Targets (NFR-006)

- WS message processing latency < 10ms
- Message parsing < 1ms
- Session lookup < 1ms

---

## 8. Risks and Edge Cases

### Known Edge Cases

| Edge Case | Risk Level | Mitigation |
|-----------|------------|------------|
| better-sqlite3 native compilation | Medium | Pre-built binaries в package; fallback documentation |
| WS connection flood | Low | Rate limiting на connection level (V1) |
| Large session history | Medium | History size limits; pruning strategy |
| Malformed messages | Medium | Strict validation; error responses |
| Concurrent session access | Low | Session-level locks if needed |
| DB corruption | Low | WAL mode; regular backups (V1) |

### Risky Scenarios

| Scenario | Impact | Probability | Mitigation |
|----------|--------|-------------|------------|
| WS library incompatibility | High | Low | Use stable ws version; test on target Node.js |
| SQLite locking issues | Medium | Low | WAL mode; proper connection management |
| Memory leak in long-running server | High | Medium | Connection cleanup; periodic restart option |
| Session state inconsistency | High | Low | Atomic updates; proper serialization |
| Channel handler crash affects gateway | High | Low | Error boundaries; channel isolation |

### Dependency-Related Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| ws breaking changes | High | Pin version; lockfile |
| better-sqlite3 node-gyp failures | High | Pre-built binaries; alternative (sql.js) |
| pino API changes | Medium | Pin version; abstraction layer |
| @osai/types contract change | High | Version coordination; breaking change process |

---

## 9. Notes

### Assumptions

1. **WebSocket library:** ws выбран как stable и широко используемая библиотека
2. **Database:** SQLite (better-sqlite3) для session persistence (local-first)
3. **Default port:** 18789 используется для WS server (localhost only)
4. **Message format:** JSON-based protocol (7 message types)
5. **Session types:** main, group, isolated - только эти типы в MVP

### Clarifications

1. **Agent Runtime integration:** Отложено до F-004, пока использую mock/stub
2. **Channel implementations:** Telegram/WhatsApp в F-008, пока только interface
3. **Authentication:** Не требуется для localhost-only (local-first)
4. **TLS/SSL:** Не требуется для localhost (127.0.0.1)

### Planning Notes

1. **Parallel Development:** T-003 и T-005 могут разрабатываться параллельно после T-002
2. **Critical Path:** T-001 -> T-002 -> T-004 -> T-006 -> T-007 -> T-008
3. **Testing:** Integration tests критически важны для WebSocket functionality
4. **Persistence:** Session persistence должна быть протестирована с restart scenarios

---

## Appendix A: File Structure After F-002

```
packages/gateway/
├── src/
│   ├── index.ts
│   ├── server/
│   │   ├── Gateway.ts
│   │   └── WebSocketServer.ts
│   ├── session/
│   │   ├── Session.ts
│   │   ├── SessionRouter.ts
│   │   └── types.ts
│   ├── protocol/
│   │   ├── MessageParser.ts
│   │   ├── MessageRouter.ts
│   │   └── types.ts
│   ├── channel/
│   │   ├── ChannelHandler.ts
│   │   ├── ChannelManager.ts
│   │   └── types.ts
│   └── persistence/
│       ├── Database.ts
│       └── SessionPersistence.ts
├── __tests__/
│   ├── unit/
│   │   ├── WebSocketServer.test.ts
│   │   ├── MessageParser.test.ts
│   │   ├── SessionRouter.test.ts
│   │   ├── ChannelManager.test.ts
│   │   └── SessionPersistence.test.ts
│   ├── integration/
│   │   ├── gateway.test.ts
│   │   ├── session-router.test.ts
│   │   └── persistence.test.ts
│   └── helpers/
│       └── ws-client.ts
├── package.json
├── tsconfig.json
├── tsup.config.ts
└── README.md
```

---

## Appendix B: WS Protocol Message Types

### Inbound Messages (Client -> Server)

| Type | Fields | Description |
|------|--------|-------------|
| `message` | session_id, content, channel? | User message to agent |
| `command` | command, params? | Control command |
| `permission_response` | request_id, decision | User approval/denial |
| `subscribe` | events[] | Event subscription |

### Outbound Messages (Server -> Client)

| Type | Fields | Description |
|------|--------|-------------|
| `block` | session_id, block_type, content, language? | Structured content |
| `tool_stream` | session_id, tool, action, chunk | Tool execution chunk |
| `permission_request` | request_id, session_id, tool, action, params, risk_level | Permission prompt |
| `error` | code, message, severity | Error response |
| `status` | session_id, state | Session status |
| `event` | event, data | Broadcast event |

---

## Appendix C: npm scripts Summary

| Script | Command | Description |
|--------|---------|-------------|
| `build` | `tsup` | Build package |
| `dev` | `tsup --watch` | Build in watch mode |
| `test` | `vitest run` | Run all tests |
| `test:watch` | `vitest` | Run tests in watch mode |
| `type-check` | `tsc --noEmit` | Run TypeScript type check |

---

*End of Task Roadmap: Gateway - WebSocket Control Plane v1.0*
