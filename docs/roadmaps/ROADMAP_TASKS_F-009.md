# Task Roadmap: Gateway + Multi-Chat System (F-009)

**Version:** v1.0
**Date:** 2026-03-30
**Author:** TDD Planner Agent
**Status:** Active

---

## 1. Feature Overview

- **Feature ID:** F-009
- **Feature Name:** Gateway + Multi-Chat System
- **Description:** WebSocket control plane на localhost:18789, channel routing, session management, Chat CRUD (до 20 активных), Chat Persistence, Chat Context Isolation, Chat Switching, Chat Archiving
- **Related Requirements:** FR-001 (Gateway WS Control Plane), FR-003 (Multi-Chat System), FR-004 (Chat Persistence)
- **Domain:** DOMAIN-001 (Gateway)
- **Agent Profile:** backend/AGENT_PROFILE_nodejs.md + backend/AGENT_PROFILE_backend-base.md
- **Git branch:** feature/gateway-multi-chat

---

## 2. Dependencies

### 2.1 Feature Dependencies

- **F-001:** Core Infrastructure (blocking) -- pnpm workspace, SQLite DB (osai.db), tables chats/chat_messages, pino logger, osai.json config loader

### 2.2 Task Dependencies

```
T-001 (WS Server :18789)
  |
  +---> T-002 (Chat CRUD + Persistence) -- параллельно с T-003
  +---> T-003 (WebSocket Protocol)      -- параллельно с T-002
         |
         +---> T-004 (Channel Router)    -- зависит от T-001, T-003
         |
T-002 --+
         +---> T-005 (Chat Context Isolation + Switching) -- зависит от T-002
         |
         +---> T-006 (Chat Archiving + 20 Active Limit)   -- зависит от T-002
```

### 2.3 Development Order

- **Wave 1:** T-001
- **Wave 2 (parallel):** T-002, T-003
- **Wave 3 (parallel):** T-004, T-005, T-006

---

## 3. Task Breakdown

### Task T-001: WebSocket Server on :18789

**Domain:** DOMAIN-001 | **Dependencies:** None (F-001)
**Estimated Time:** 3-4 hours

**Description:**
Создание WebSocket сервера на 127.0.0.1:18789 с использованием библиотеки `ws`. Базовый lifecycle: start, stop, graceful shutdown. Обработка подключений/отключений клиентов с heartbeat. Регистрация через pino logger.

**Scope:**
- **In scope:** WS server bind 127.0.0.1:18789, start/stop lifecycle, connection management, heartbeat, graceful shutdown, pino logging всех событий
- **Out scope:** Channel routing (T-004), message protocol (T-003), chat CRUD (T-002)

---

### Task T-002: Chat CRUD + Persistence

**Domain:** DOMAIN-001 | **Dependencies:** T-001
**Estimated Time:** 3-4 hours

**Description:**
CRUD операции для чатов: create, read, update, delete, list. Персистенция через SQLite таблицы chats и chat_messages (созданные в F-001 T-005). Создание чата с metadata (id, name, description, tags, icon, color, channel, channelMetadata, isActive). Добавление и загрузка сообщений чата.

**Scope:**
- **In scope:** ChatService (createChat, getChat, updateChat, deleteChat, listChats, addMessage, getMessages), SQLite persistence через F-001 DB singleton, ChatMessage model (id, chat_id, role, content, tool_calls, metadata, created_at)
- **Out scope:** Context isolation (T-005), archiving (T-006), лимит 20 активных (T-006)

---

### Task T-003: WebSocket Protocol (Gateway <-> Client)

**Domain:** DOMAIN-001 | **Dependencies:** T-001
**Estimated Time:** 3-4 hours

**Description:**
Определение и реализация WebSocket протокола между Gateway и клиентами. Сообщения Client->Gateway: message, command, permission_response, subscribe. Сообщения Gateway->Client: tool_stream, block, permission_request. Парсинг, валидация, маршрутизация по типу сообщения.

**Scope:**
- **In scope:** GatewayMessage/ToolStreamMessage/BlockStreamMessage/PermissionRequest type definitions, message parser/validator, routing по type, отправка streaming ответов клиентам, permission_response обработка
- **Out scope:** Channel handlers (T-004), agent runtime integration (F-008)

---

### Task T-004: Channel Router

**Domain:** DOMAIN-001 | **Dependencies:** T-001, T-003
**Estimated Time:** 2-3 hours

**Description:**
Маршрутизация сообщений от клиентов к соответствующим channel handlers. Базовый CLI channel handler. Channel handler interface: onMessage, send, subscribe. Расширяемая архитектура для добавления Telegram и других каналов (F-010).

**Scope:**
- **In scope:** ChannelRouter (register, route, dispatch), ChannelHandler interface, CLI channel handler (базовый), message dispatch от WS client к handler
- **Out scope:** Telegram bot/userbot handlers (F-010), mirror engine (F-010)

---

### Task T-005: Chat Context Isolation + Switching

**Domain:** DOMAIN-001 | **Dependencies:** T-002
**Estimated Time:** 2-3 hours

**Description:**
Изоляция контекста между чатами. Каждый чат имеет собственную историю сообщений и состояние. Переключение между чатами (on_chat_switch hook): сохранение контекста текущего чата, загрузка контекста целевого чата. Уведомление подключённых клиентов о переключении.

**Scope:**
- **In scope:** ChatContextManager (switchChat, getCurrentChat, getContextForChat), контекстная изоляция (сообщения, state), on_chat_switch hook trigger, уведомление клиентов через WS
- **Out scope:** Session-level контекст (F-008), shared memory доступ (F-005)

---

### Task T-006: Chat Archiving + 20 Active Limit

**Domain:** DOMAIN-001 | **Dependencies:** T-002
**Estimated Time:** 2-3 hours

**Description:**
Архивирование неактивных чатов (isActive = false) для освобождения лимита в 20 активных чатов. Проверка лимита при создании/разархивировании чата. Список архивированных чатов, разархивирование, удаление.

**Scope:**
- **In scope:** archiveChat, unarchiveChat, limit enforcement (max 20 active), listArchived, deleteChat с проверкой лимита, isActive toggle
- **Out scope:** Автоархивирование по timeout (V1), chat templates

---

## 4. Test Strategy (TDD)

### 4.1 Test Types per Task

| Task | Unit Tests | Integration Tests | Build + Run |
|------|-----------|-------------------|-------------|
| T-001 | WS server start/stop, heartbeat, connection events | Real WS client connect to :18789 | `pnpm -C packages/gateway build` |
| T-002 | Chat CRUD ops, message persistence, validation | Real SQLite read/write чатов | `pnpm -C packages/gateway build` |
| T-003 | Message parsing, type routing, validation errors | WS client send/receive protocol messages | `pnpm -C packages/gateway build` |
| T-004 | Channel registration, routing, dispatch | WS connect -> channel handler -> response | `pnpm -C packages/gateway build` |
| T-005 | Context isolation, switch logic, state preservation | Multi-chat switch scenario end-to-end | `pnpm -C packages/gateway build` |
| T-006 | Archive/unarchive, limit enforcement, boundary | Create 20 chats -> archive -> create more | `pnpm -C packages/gateway build` |

### 4.2 Build and Run Verification

**Build Verification:**
```bash
pnpm -C packages/gateway build
```

**Ожидаемый результат:**
- exit code 0
- dist/ в packages/gateway/
- Нет TypeScript ошибок (strict mode)

**Run Verification:**
```bash
# Запуск gateway (потребует реальной БД из F-001)
pnpm -C packages/gateway start
# В другом терминале: wscat -c ws://127.0.0.1:18789
```

**Ожидаемый результат:**
- Gateway стартует, логирует через pino
- WS клиент подключается
- Heartbeat работает

### 4.3 Test Cases per Task

#### T-001 Tests

| ID | Description | Preconditions | Expected Result | Pass Criteria |
|----|-------------|---------------|-----------------|---------------|
| TT-009-01 | WS server стартует на 127.0.0.1:18789 | F-001 complete, ws installed | Server listening | netstat shows :18789 bound to 127.0.0.1 |
| TT-009-02 | Клиент подключается и отключается | Server running | connect + disconnect events | Connection count = 0 после disconnect |
| TT-009-03 | Heartbeat отправляется | Client connected | ping/pong frames | Server не закрывает idle connection |
| TT-009-04 | Graceful shutdown | Clients connected | Сервер закрывает все connection | Все WS connections closed cleanly |
| TT-009-05 | Не принимает внешние подключения | Server on 127.0.0.1 | Connect from 0.0.0.0 fails | Connection refused (ECONNREFUSED) |
| TT-009-06 | Логирование событий через pino | Server started | Connect/disconnect/error logged | JSON log entries с event type |

#### T-002 Tests

| ID | Description | Preconditions | Expected Result | Pass Criteria |
|----|-------------|---------------|-----------------|---------------|
| TT-009-07 | createChat сохраняет в SQLite | DB initialized | INSERT в chats table | getChat(id) возвращает созданный чат |
| TT-009-08 | getChat возвращает null для несуществующего | DB initialized | SELECT возвращает null | null, не exception |
| TT-009-09 | updateChat обновляет metadata | Chat exists | UPDATE chats SET ... | getChat(id) возвращает обновлённые данные |
| TT-009-10 | deleteChat удаляет чат и сообщения | Chat + messages exist | DELETE FROM chats, chat_messages | getChat returns null, messages deleted |
| TT-009-11 | listChats возвращает все чаты | 3 chats created | SELECT FROM chats | Массив из 3 элементов |
| TT-009-12 | addMessage сохраняет с правильными полями | Chat exists | INSERT INTO chat_messages | id, chat_id, role, content, created_at корректны |
| TT-009-13 | getMessages с пагинацией | 50 messages in chat | LIMIT + OFFSET | Правильный срез, порядок по created_at |
| TT-009-14 | Chat metadata: id, name, tags, icon, color | createChat с полными данными | Все поля сохранены | Все поля читаются обратно |

#### T-003 Tests

| ID | Description | Preconditions | Expected Result | Pass Criteria |
|----|-------------|---------------|-----------------|---------------|
| TT-009-15 | Парсинг GatewayMessage (type=message) | WS connected | Message parsed, chat_id extracted | Validated object с type и payload |
| TT-009-16 | Парсинг permission_response | WS connected, request_id | Response routed к pending request | Permission resolved |
| TT-009-17 | Отправка tool_stream клиенту | Agent sends tool result | Client receives tool_stream msg | type=tool_stream, tool field present |
| TT-009-18 | Отправка block клиенту | Agent sends text block | Client receives block msg | type=block, block_type=text |
| TT-009-19 | Невалидное сообщение отклоняется | WS connected, malformed JSON | Error response, connection alive | Error type в ответе, 400-like handling |
| TT-009-20 | subscribe тип обрабатывается | Client sends subscribe | Subscription registered | Events доставляются подписчику |

#### T-004 Tests

| ID | Description | Preconditions | Expected Result | Pass Criteria |
|----|-------------|---------------|-----------------|---------------|
| TT-009-21 | Регистрация channel handler | Server started | Handler в registry | getChannels() включает handler |
| TT-009-22 | Маршрутизация сообщения к CLI handler | WS message, channel=cli | CLI handler.onMessage вызван | Handler получил payload |
| TT-009-23 | Неизвестный channel возвращает ошибку | WS message, channel=unknown | Error response | Error с описанием неизвестного канала |
| TT-009-24 | Dispatch к handler отправляет ответ клиенту | Handler возвращает result | Client收到 response | WS client receives result |

#### T-005 Tests

| ID | Description | Preconditions | Expected Result | Pass Criteria |
|----|-------------|---------------|-----------------|---------------|
| TT-009-25 | Контекст чатов изолирован | 2 chats с сообщениями | getMessages(chatA) != getMessages(chatB) | Разные наборы сообщений |
| TT-009-26 | switchChat загружает целевой контекст | Chat A active, switch to B | Chat B context loaded | currentChat = B, сообщения B загружены |
| TT-009-27 | switchChat сохраняет контекст исходного | Switch A -> B | Chat A context preserved | getMessages(A) содержит старые сообщения |
| TT-009-28 | Клиент уведомляется о переключении | switchChat выполнен | WS notification sent | Клиент получил on_chat_switch event |
| TT-009-29 | Попытка switch на несуществующий чат | chat_id не существует | Error | Исключение или error response, текущий чат не изменён |

#### T-006 Tests

| ID | Description | Preconditions | Expected Result | Pass Criteria |
|----|-------------|---------------|-----------------|---------------|
| TT-009-30 | archiveChat ставит isActive=false | Active chat exists | UPDATE chats SET isActive=0 | listChats(activeOnly=true) не содержит |
| TT-009-31 | unarchiveChat восстанавливает isActive | Archived chat | UPDATE chats SET isActive=1 | Чат снова в активных |
| TT-009-32 | Создание 21-го активного чата отклоняется | 20 active chats | Error thrown | "Max 20 active chats" error |
| TT-009-33 | Архивирование + создание = успех | 20 active -> archive 1 -> create | 20 active (19 old + 1 new) | Новый чат создан успешно |
| TT-009-34 | deleteChat архивированного чата | Archived chat | DELETE, messages deleted | Чат и сообщения удалены |
| TT-009-35 | listArchived возвращает только архивированные | Mix of active + archived | Filter by isActive=false | Только архивированные |

---

## 5. Implementation Plan per Task

### T-001: WebSocket Server on :18789
1. Создать `packages/gateway/src/ws/server.ts` -- WSServer class
2. Инициализировать `ws.WebSocketServer` на 127.0.0.1:18789
3. Реализовать connection/disconnect/error event handlers с pino logging
4. Реализовать heartbeat (ping interval, client pong timeout)
5. Реализовать graceful shutdown (SIGTERM/SIGINT -> close all connections)
6. Экспортировать из `packages/gateway/src/index.ts`

**Constraints:** 127.0.0.1 only (Layer 1 security), pino structured logging

### T-002: Chat CRUD + Persistence
1. Создать `packages/gateway/src/chat/chat-service.ts`
2. Реализовать CRUD: createChat, getChat, updateChat, deleteChat, listChats
3. Реализовать message ops: addMessage, getMessages (с пагинацией)
4. Использовать F-001 DB singleton (`packages/shared/src/db.ts`)
5. Создать `packages/gateway/src/chat/models.ts` (Chat, ChatMessage type definitions)
6. Валидация: обязательные поля, уникальность name (или id-based uniqueness)

**Constraints:** Параметризованные запросы, SQLite tables из F-001 T-005

### T-003: WebSocket Protocol
1. Создать `packages/gateway/src/ws/protocol.ts` -- type definitions (GatewayMessage, ToolStreamMessage, BlockStreamMessage, PermissionRequest)
2. Создать `packages/gateway/src/ws/message-handler.ts` -- parse, validate, route
3. Реализовать dispatch по type (message -> agent, command -> router, permission_response -> pending)
4. Реализовать отправку streaming сообщений клиентам (tool_stream, block, permission_request)

**Constraints:** JSON protocol, type discrimination, graceful error handling

### T-004: Channel Router
1. Создать `packages/gateway/src/channels/router.ts` -- ChannelRouter class
2. Определить `ChannelHandler` interface (onMessage, send, subscribe, destroy)
3. Создать `packages/gateway/src/channels/cli-handler.ts` -- базовый CLI handler
4. Интегрировать ChannelRouter в message-handler (T-003)

**Constraints:** Расширяемая архитектура для F-010 (Telegram handlers)

### T-005: Chat Context Isolation + Switching
1. Создать `packages/gateway/src/chat/context-manager.ts` -- ChatContextManager
2. Реализовать switchChat(chatId): сохранить текущий контекст -> загрузить целевой
3. Реализовать getContextForChat(chatId): возвращает сообщения и state конкретного чата
4. Trigger on_chat_switch hook (для будущей интеграции с F-008)
5. Отправлять WS уведомление клиентам о переключении

**Constraints:** Контекст каждого чата строго изолирован, shared memory (F-005) доступна из всех чатов

### T-006: Chat Archiving + 20 Active Limit
1. Реализовать archiveChat(chatId): isActive = false
2. Реализовать unarchiveChat(chatId): isActive = true (с проверкой лимита)
3. Реализовать enforcement в createChat: count active chats, reject if >= 20
4. Реализовать listArchived() и deleteChat() (каскадное удаление сообщений)
5. Добавить в updateChat проверку лимита при isActive toggle

**Constraints:** Максимально 20 активных чатов (NFR-SC01), архивирование освобождает слот

---

## 6. Acceptance Criteria per Task

### T-001
- [ ] WS server запускается на `ws://127.0.0.1:18789`
- [ ] Клиент подключается и отключается без ошибок
- [ ] Heartbeat поддерживает idle connections
- [ ] Graceful shutdown закрывает все connections
- [ ] Все события логируются через pino в structured JSON

### T-002
- [ ] createChat сохраняет чат в SQLite со всеми metadata полями
- [ ] getChat, updateChat, deleteChat, listChats работают корректно
- [ ] addMessage / getMessages работают с пагинацией
- [ ] ChatMessage содержит: id, chat_id, role, content, tool_calls, metadata, created_at
- [ ] deleteChat каскадно удаляет сообщения

### T-003
- [ ] GatewayMessage парсится и валидируется (message, command, permission_response, subscribe)
- [ ] tool_stream, block, permission_request отправляются клиентам
- [ ] Невалидные сообщения отклоняются без обрыва connection
- [ ] subscribe регистрирует клиента для получения events

### T-004
- [ ] ChannelHandler interface определён и реализован (CLI handler)
- [ ] ChannelRouter маршрутизирует сообщения по channel
- [ ] Неизвестный channel возвращает понятную ошибку
- [ ] Ответы от handler доставляются клиенту через WS

### T-005
- [ ] Сообщения разных чатов полностью изолированы
- [ ] switchChat сохраняет контекст исходного и загружает целевого
- [ ] on_chat_switch event отправляется подключённым клиентам
- [ ] Switch на несуществующий чат не изменяет текущий контекст

### T-006
- [ ] archiveChat / unarchiveChat корректно переключают isActive
- [ ] Создание 21-го активного чата отклоняется с ошибкой
- [ ] Архивирование освобождает слот для нового чата
- [ ] deleteChat удаляет чат и все сообщения из SQLite
- [ ] listArchived возвращает только архивированные чаты

---

## 7. Quality Expectations

- **TypeScript strict mode** -- обязательно (NFR-M01)
- **Test coverage** -- > 80% для каждого модуля
- **Build stability** -- `pnpm -C packages/gateway build` exit code 0
- **No any type** -- без веских оснований
- **No console.log** -- pino logger только
- **Network security** -- 127.0.0.1 bind only (Layer 1)
- **Parameterized queries** -- все SQL через placeholders (защита от injection)

---

## 8. Risks and Edge Cases

| Risk | Impact | Mitigation |
|------|--------|------------|
| Порт :18789 занят другим процессом | Medium | Fail fast на startup с понятным error message |
| WS connection drop без close frame | Medium | Heartbeat timeout + reconnect логика на клиенте |
| SQLite concurrent write contention | Medium | WAL mode (AD-007), write serialization |
| 20 active chats limit критичен для UX | Low | Понятное error message с подсказкой архивировать |
| Chat name uniqueness не требуется (id-based) | Low | Уникальность по UUID id, name не уникален |
| Порядок сообщений при switch back | Low | Сортировка по created_at ASC |
| Permission_request timeout | Medium | Configurable timeout, default response deny |
| Channel handler exception | Medium | try-catch в dispatch, error to client, не крашить gateway |

---

## 9. Notes

1. **FR-001 AC:** Gateway принимает WS на :18789 (AC-001-1), маршрутизирует сообщения (AC-001-2), delivers tool_stream/block/permission_request (AC-001-3), обрабатывает subscribe и permission_response (AC-001-4), поддерживает simultaneous connections (AC-001-5).
2. **FR-003 AC:** До 20 активных чатов (AC-003-1), изолированная история (AC-003-2), shared memory/KB/skills (AC-003-3), switch сохраняет контекст (AC-003-4), удаление чата сохраняет shared memory (AC-003-5), архивирование (AC-003-6), metadata поля (AC-003-7).
3. **FR-004 AC:** Чаты в таблице chats (AC-004-1), сообщения в chat_messages с индексом (AC-004-2), восстановление после restart (AC-004-3), message fields (AC-004-4).
4. **DATABASE:** Таблицы chats и chat_messages уже созданы в F-001 T-005. T-002 использует существующий DB singleton.
5. **AGENT RUNTIME INTEGRATION:** Фактическая интеграция с Agent Runtime (F-008) -- в рамках T-003 message routing. Для MVP достаточно отправлять сообщения в agent direction; реальная agent loop dispatch -- при реализации F-008.
6. **SESSION MANAGEMENT:** Базовая сессия (session_id в GatewayMessage) обрабатывается в T-003. Полный Session Manager с persistence -- в F-008 (Agent Runtime).
7. **CHANNEL EXTENSIBILITY:** ChannelRouter спроектирован для расширения. F-010 добавит Telegram bot/userbot handlers без изменения core router.
