# Task Roadmap: Messaging Channels - Telegram, WhatsApp

**Version:** v1.0
**Generated:** 2026-03-24
**Agent:** TDD Planner Agent
**Status:** Ready for Implementation

---

## 1. Feature Overview

- **Feature ID:** F-008
- **Feature Name:** Messaging Channels - Telegram, WhatsApp
- **Feature Description:** Channel handlers для мессенджеров: Telegram (grammY framework, bot token auth, message routing в Gateway), WhatsApp (Baileys, QR-code auth, message routing). Оба channel handler'а реализуют единый ChannelHandler interface из Gateway и преобразуют сообщения мессенджеров в формат WS protocol.
- **Related Requirements:** FR-008, FR-009, NFR-018
- **Domain:** gateway
- **Git branch:** feature/messaging-channels

---

## 2. Dependencies

### 2.1 Feature Dependencies

| Feature | Name | Type | Notes |
|---------|------|------|-------|
| **F-002** | Gateway - WebSocket Control Plane | Blocking | Требуется ChannelHandler interface, ChannelManager, WS protocol types |

Фича F-008 зависит от F-002 (Gateway):
- `ChannelHandler` interface из `@osai/gateway`
- `ChannelManager` для регистрации channel handlers
- WS message types (`InboundMessage`, `OutboundMessage`)
- Session Router для routing сообщений в правильную сессию

### 2.2 Task Dependencies

| Task ID | Depends On | Type |
|---------|------------|------|
| T-001 | None | Independent |
| T-002 | T-001 | Blocking |
| T-003 | T-001 | Blocking |
| T-004 | T-002, T-003 | Blocking |
| T-005 | T-004 | Blocking |
| T-006 | T-005 | Blocking |
| T-007 | T-006 | Blocking |
| T-008 | T-007 | Blocking |

### 2.3 Development Order

**Параллельное выполнение:**
- После T-001 задачи T-002 (Telegram Handler) и T-003 (WhatsApp Handler) могут выполняться параллельно

**Последовательное выполнение:**
- T-001 -> (T-002 || T-003) -> T-004 -> T-005 -> T-006 -> T-007 -> T-008

**Dependency Graph:**
```
T-001 (ChannelHandler Extensions)
   |
   +---> T-002 (Telegram Handler) -----+
   |                                   |
   +---> T-003 (WhatsApp Handler) -----+---> T-004 (Message Converters)
                                       |
                                       +---> T-005 (CLI Commands)
                                              |
                                              +---> T-006 (Integration Tests)
                                                     |
                                                     +---> T-007 (E2E Tests)
                                                            |
                                                            +---> T-008 (Build & Run)
```

---

## 3. Task Breakdown

### Task T-001: ChannelHandler Types and Configuration

**Description:**
Расширение типов и конфигурации для messaging channels: ChannelType enum (telegram, whatsapp), ChannelConfig interface с credential fields, media types definitions.

**Estimated Time:** 2-3 hours

**Dependencies:** None

**Scope:**
- **In scope:**
  - Создание `packages/gateway/src/channel/types.ts` расширения:
    - `ChannelType.TELEGRAM`, `ChannelType.WHATSAPP`
    - `TelegramConfig` interface (botToken, webhookUrl?)
    - `WhatsAppConfig` interface (sessionPath, qrTimeout)
    - `MediaAttachment` type (type, data, mimeType, filename)
    - `MediaMessage` extends `InboundMessage` (media field)
  - Создание `packages/gateway/src/channel/converters.ts`:
    - `convertTelegramMessage()` stub
    - `convertWhatsAppMessage()` stub
  - Обновление `ChannelConfig` type для поддержки messenger-specific configs
  - Unit тесты для type guards и converters

- **Out scope:**
  - Telegram handler implementation (T-002)
  - WhatsApp handler implementation (T-003)
  - Media processing logic

---

### Task T-002: Telegram Channel Handler

**Description:**
Реализация Telegram channel handler на grammY framework: bot token authentication, message receiving/sending, media support (photos, documents), callback query handling, error handling и reconnection.

**Estimated Time:** 3-4 hours

**Dependencies:** T-001 (Blocking)

**Scope:**
- **In scope:**
  - Установка `grammy` dependency
  - Создание `packages/gateway/src/channels/TelegramChannel.ts`:
    - `TelegramChannel implements ChannelHandler`
    - `connect()` - запуск bot polling или webhook setup
    - `disconnect()` - graceful shutdown
    - `send(message: OutboundMessage)` - отправка сообщений
    - `sendMedia(media: MediaAttachment, chatId: string)` - отправка media
    - `getStatus()` - текущий статус connection
    - `onMessage(handler)` - регистрация handler для inbound messages
  - Message converter: Telegram Update -> InboundMessage
  - Callback query handling (inline buttons)
  - Error handling (rate limits, network errors)
  - Reconnection logic с exponential backoff
  - Unit тесты с grammY mocks

- **Out scope:**
  - Webhook mode (V2 - polling only для V1)
  - Inline mode support
  - Group chat management
  - WhatsApp handler (T-003)

---

### Task T-003: WhatsApp Channel Handler

**Description:**
Реализация WhatsApp channel handler на Baileys library: QR-code authentication, multi-device support, message receiving/sending, media support, connection state management.

**Estimated Time:** 3-4 hours

**Dependencies:** T-001 (Blocking)

**Scope:**
- **In scope:**
  - Установка `@whiskeysockets/baileys` dependency
  - Создание `packages/gateway/src/channels/WhatsAppChannel.ts`:
    - `WhatsAppChannel implements ChannelHandler`
    - `connect()` - инициация connection, QR display
    - `disconnect()` - logout + graceful shutdown
    - `send(message: OutboundMessage, jid: string)` - отправка сообщений
    - `sendMedia(media: MediaAttachment, jid: string)` - отправка media
    - `getStatus()` - текущий статус connection
    - `onMessage(handler)` - регистрация handler
    - `onQR(qrCallback)` - callback для QR display
  - Session persistence (auth state в файл)
  - Message converter: Baileys message -> InboundMessage
  - Connection state handling (connecting, connected, disconnected)
  - Error handling и reconnection
  - Unit тесты с Baileys mocks

- **Out scope:**
  - Group chat support
  - Business API integration
  - Call handling
  - Telegram handler (T-002)

---

### Task T-004: Message Converters Implementation

**Description:**
Реализация полных message converters между Telegram/WhatsApp форматами и internal WS protocol: text, media, replies, forwarding.

**Estimated Time:** 2-3 hours

**Dependencies:** T-002, T-003 (Blocking)

**Scope:**
- **In scope:**
  - Доработка `converters.ts`:
    - `convertTelegramTextMessage()`
    - `convertTelegramPhotoMessage()`
    - `convertTelegramDocumentMessage()`
    - `convertWhatsAppTextMessage()`
    - `convertWhatsAppMediaMessage()`
  - Reply-to-message mapping (originalMessageId)
  - Sender info extraction (username, displayName, userId)
  - Timestamp normalization
  - Chat/Group ID handling
  - Unit тесты для всех converter functions

- **Out scope:**
  - Message editing
  - Message deletion events
  - Reaction events

---

### Task T-005: Channel Management CLI Commands

**Description:**
CLI команды для управления messaging channels: channel list, channel status, channel enable/disable, QR display для WhatsApp.

**Estimated Time:** 2-3 hours

**Dependencies:** T-004 (Blocking)

**Scope:**
- **In scope:**
  - Создание CLI commands в `packages/cli/src/commands/channel/`:
    - `channel:list` - список всех configured channels
    - `channel:status [channel]` - статус конкретного channel
    - `channel:enable <channel>` - включение channel
    - `channel:disable <channel>` - выключение channel
    - `channel:qr` - показать QR code для WhatsApp (в terminal)
  - Интеграция с ChannelManager API
  - Formatted output (table/json)
  - Unit тесты для commands

- **Out scope:**
  - Channel configuration через CLI (используем openclaw.json)
  - Real-time status updates

---

### Task T-006: Integration Tests

**Description:**
Integration тесты для messaging channels: message flow через channel -> gateway -> session, media handling, reconnection scenarios.

**Estimated Time:** 3-4 hours

**Dependencies:** T-005 (Blocking)

**Scope:**
- **In scope:**
  - Создание `__tests__/integration/channels/telegram.test.ts`
  - Создание `__tests__/integration/channels/whatsapp.test.ts`
  - Создание `__tests__/helpers/mock-telegram-bot.ts`
  - Создание `__tests__/helpers/mock-whatsapp-client.ts`
  - Тесты:
    - Channel registration в ChannelManager
    - Message receive -> InboundMessage conversion
    - OutboundMessage -> channel send
    - Media message handling
    - Connection status transitions
    - Reconnection после disconnect
    - Error handling (rate limit, network error)
  - Integration с Session Router

- **Out scope:**
  - Real Telegram/WhatsApp API calls (mocked)
  - E2E tests с real devices

---

### Task T-007: E2E Tests with Mock Gateway

**Description:**
End-to-end тесты с mock Gateway: полный цикл message processing, multiple channels одновременно, graceful degradation при channel failure.

**Estimated Time:** 2-3 hours

**Dependencies:** T-006 (Blocking)

**Scope:**
- **In scope:**
  - Создание `__tests__/e2e/messaging-channels.test.ts`
  - Mock Gateway server для testing
  - Тесты:
    - Telegram message -> Gateway -> Session
    - WhatsApp message -> Gateway -> Session
    - Response -> Telegram/WhatsApp
    - Both channels active одновременно
    - Channel failure не влияет на другой channel
    - Config reload (enable/disable channels)
  - Test fixtures: sample messages, media files

- **Out scope:**
  - Real network calls
  - Load testing

---

### Task T-008: Build and Run Verification

**Description:**
Финальная верификация messaging channels: сборка всех пакетов, проверка channel handlers load, тестовое подключение.

**Estimated Time:** 2-3 hours

**Dependencies:** T-007 (Blocking)

**Scope:**
- **In scope:**
  - Выполнение `pnpm build` для всех dependent packages
  - Проверка imports и type resolution
  - Создание `scripts/test-channels.ts` (manual testing)
  - Проверка загрузки channels из config
  - Проверка CLI commands
  - Обновление README.md в packages/gateway (channels section)
  - Проверка всех тестов (unit + integration + e2e)

- **Out scope:**
  - Production deployment
  - Real bot token testing

---

## 4. Test Strategy (TDD)

### 4.1 Test Types per Task

| Task ID | Unit Tests | Integration Tests | E2E Tests | Build & Run Verification |
|---------|------------|-------------------|-----------|--------------------------|
| T-001 | REQUIRED | - | - | REQUIRED |
| T-002 | REQUIRED | - | - | REQUIRED |
| T-003 | REQUIRED | - | - | REQUIRED |
| T-004 | REQUIRED | - | - | REQUIRED |
| T-005 | REQUIRED | - | - | REQUIRED |
| T-006 | - | REQUIRED | - | REQUIRED |
| T-007 | - | - | REQUIRED | REQUIRED |
| T-008 | - | - | - | REQUIRED |

### 4.2 Build and Run Verification

**Build Verification:**

```bash
# Команда установки зависимостей
cd /home/aristman/projects/osai
pnpm install

# Ожидаемый результат
# - grammy dependency установлена
# - @whiskeysockets/baileys dependency установлена
# - Все workspace packages резолвятся

# Команда сборки gateway (с channels)
pnpm --filter @osai/gateway build

# Ожидаемый результат
# - dist/index.mjs создан
# - dist/index.cjs создан
# - dist/index.d.ts создан
# - TelegramChannel exported
# - WhatsAppChannel exported

# Критерии успешной сборки
# - Нет TypeScript errors
# - Нет unresolved imports
# - Bundle size < 500KB (без node_modules)
```

**Run Verification:**

```bash
# Команда запуска тестов
pnpm --filter @osai/gateway test

# Ожидаемый результат
# - Все unit тесты проходят
# - Все integration тесты проходят
# - Coverage >= 70%

# Команда запуска CLI (channel list)
pnpm --filter @osai/cli start channel:list

# Ожидаемый результат
# - Список channels отображается
# - Telegram/WhatsApp status показан

# Базовая проверка работоспособности
# - TypeScript компилируется без errors
# - Imports резолвятся корректно
# - ChannelManager регистрирует channels
```

### 4.3 Test Cases per Task

#### Task T-001: ChannelHandler Types and Configuration

**Test Strategy:** Unit Tests + Build Verification

| Test ID | Type | Description | Preconditions | Expected Result | Pass/Fail Criteria |
|---------|------|-------------|---------------|-----------------|-------------------|
| T001-01 | Unit | ChannelType enum | Types определены | TELEGRAM, WHATSAPP существуют | Enum values корректны |
| T001-02 | Unit | TelegramConfig interface | Interface определён | botToken: string | TypeScript компилируется |
| T001-03 | Unit | WhatsAppConfig interface | Interface определён | sessionPath: string | TypeScript компилируется |
| T001-04 | Unit | MediaAttachment type | Type определён | type, data, mimeType fields | Type guard работает |
| T001-05 | Unit | MediaMessage extends InboundMessage | Type определён | media field добавлен | TypeScript компилируется |
| T001-06 | Unit | convertTelegramMessage stub | Converter определён | Returns InboundMessage | Function exists |
| T001-07 | Unit | convertWhatsAppMessage stub | Converter определён | Returns InboundMessage | Function exists |

#### Task T-002: Telegram Channel Handler

**Test Strategy:** Unit Tests + Build Verification

| Test ID | Type | Description | Preconditions | Expected Result | Pass/Fail Criteria |
|---------|------|-------------|---------------|-----------------|-------------------|
| T002-01 | Unit | TelegramChannel implements ChannelHandler | Interface существует | Все методы реализованы | TypeScript компилируется |
| T002-02 | Unit | connect() success | Mock bot | Status = CONNECTED | connect() resolves |
| T002-03 | Unit | connect() failure | Invalid token | Status = ERROR | Error thrown |
| T002-04 | Unit | disconnect() | Connected channel | Status = DISCONNECTED | disconnect() resolves |
| T002-05 | Unit | send() text message | Connected channel | Bot sendMessage called | Message delivered |
| T002-06 | Unit | send() media message | Connected channel | Bot sendPhoto called | Media delivered |
| T002-07 | Unit | onMessage() handler | Message received | Handler called | InboundMessage emitted |
| T002-08 | Unit | Reconnection | Network error | Reconnect attempted | Backoff applied |
| T002-09 | Unit | Rate limit handling | 429 error | Retry with backoff | No crash |
| T002-10 | Unit | Callback query | Button pressed | Handler called | InboundMessage with callback data |

#### Task T-003: WhatsApp Channel Handler

**Test Strategy:** Unit Tests + Build Verification

| Test ID | Type | Description | Preconditions | Expected Result | Pass/Fail Criteria |
|---------|------|-------------|---------------|-----------------|-------------------|
| T003-01 | Unit | WhatsAppChannel implements ChannelHandler | Interface существует | Все методы реализованы | TypeScript компилируется |
| T003-02 | Unit | connect() generates QR | New session | QR callback called | QR string returned |
| T003-03 | Unit | connect() with saved session | Existing auth | Status = CONNECTED | No QR generated |
| T003-04 | Unit | disconnect() | Connected channel | Logout + status update | disconnect() resolves |
| T003-05 | Unit | send() text message | Connected channel | Message sent | Ack received |
| T003-06 | Unit | send() media message | Connected channel | Media sent | Ack received |
| T003-07 | Unit | onMessage() handler | Message received | Handler called | InboundMessage emitted |
| T003-08 | Unit | Connection state | State change | Status updated | Event emitted |
| T003-09 | Unit | Reconnection | Disconnect | Reconnect attempted | Backoff applied |
| T003-10 | Unit | Session persistence | Connect/disconnect | Auth state saved | Reconnect without QR |

#### Task T-004: Message Converters Implementation

**Test Strategy:** Unit Tests + Build Verification

| Test ID | Type | Description | Preconditions | Expected Result | Pass/Fail Criteria |
|---------|------|-------------|---------------|-----------------|-------------------|
| T004-01 | Unit | convertTelegramTextMessage | Text update | InboundMessage with text | Content matches |
| T004-02 | Unit | convertTelegramPhotoMessage | Photo update | InboundMessage with media | MediaAttachment created |
| T004-03 | Unit | convertTelegramDocumentMessage | Document update | InboundMessage with media | File info extracted |
| T004-04 | Unit | convertWhatsAppTextMessage | Text message | InboundMessage with text | Content matches |
| T004-05 | Unit | convertWhatsAppMediaMessage | Media message | InboundMessage with media | MediaAttachment created |
| T004-06 | Unit | Reply-to mapping | Reply message | originalMessageId set | ID matches original |
| T004-07 | Unit | Sender info extraction | Message with sender | userId, displayName set | Info extracted |
| T004-08 | Unit | Timestamp normalization | Unix timestamp | ISO string | Format correct |
| T004-09 | Unit | Chat ID extraction | Group message | chatId set | ID extracted |
| T004-10 | Unit | Edge case: empty message | Empty text | Graceful handling | No crash |

#### Task T-005: Channel Management CLI Commands

**Test Strategy:** Unit Tests + Build Verification

| Test ID | Type | Description | Preconditions | Expected Result | Pass/Fail Criteria |
|---------|------|-------------|---------------|-----------------|-------------------|
| T005-01 | Unit | channel:list command | Channels configured | Table output | All channels listed |
| T005-02 | Unit | channel:status telegram | Telegram channel | Status displayed | Connection state shown |
| T005-03 | Unit | channel:status whatsapp | WhatsApp channel | Status displayed | Connection state shown |
| T005-04 | Unit | channel:enable telegram | Disabled channel | Channel enabled | Status = enabled |
| T005-05 | Unit | channel:disable telegram | Enabled channel | Channel disabled | Status = disabled |
| T005-06 | Unit | channel:qr command | WhatsApp not connected | QR displayed | QR string output |
| T005-07 | Unit | channel:qr (already connected) | WhatsApp connected | Message shown | "Already connected" |
| T005-08 | Unit | JSON output format | --json flag | JSON output | Valid JSON |
| T005-09 | Unit | Unknown channel | Invalid channel name | Error message | Non-zero exit code |
| T005-10 | Unit | No channels configured | Empty config | Message shown | "No channels" |

#### Task T-006: Integration Tests

**Test Strategy:** Integration Tests + Build Verification

| Test ID | Type | Description | Preconditions | Expected Result | Pass/Fail Criteria |
|---------|------|-------------|---------------|-----------------|-------------------|
| T006-01 | Integration | Channel registration | ChannelManager ready | Channel registered | getChannels() includes it |
| T006-02 | Integration | Telegram message flow | Mock bot + Gateway | Message routed | Session receives message |
| T006-03 | Integration | WhatsApp message flow | Mock client + Gateway | Message routed | Session receives message |
| T006-04 | Integration | Outbound to Telegram | OutboundMessage | Bot send called | Telegram receives |
| T006-05 | Integration | Outbound to WhatsApp | OutboundMessage | Client send called | WhatsApp receives |
| T006-06 | Integration | Media handling Telegram | Photo message | Media processed | MediaAttachment valid |
| T006-07 | Integration | Media handling WhatsApp | Image message | Media processed | MediaAttachment valid |
| T006-08 | Integration | Connection status | Connect/disconnect | Status transitions | Events emitted |
| T006-09 | Integration | Reconnection Telegram | Simulate disconnect | Reconnect | Status = CONNECTED |
| T006-10 | Integration | Reconnection WhatsApp | Simulate disconnect | Reconnect | Status = CONNECTED |
| T006-11 | Integration | Rate limit handling | 429 from Telegram | Retry | Eventually succeeds |
| T006-12 | Integration | Network error | Connection lost | Reconnect attempted | No crash |

#### Task T-007: E2E Tests with Mock Gateway

**Test Strategy:** E2E Tests + Build Verification

| Test ID | Type | Description | Preconditions | Expected Result | Pass/Fail Criteria |
|---------|------|-------------|---------------|-----------------|-------------------|
| T007-01 | E2E | Full Telegram flow | Mock Gateway | End-to-end message | Session -> Response -> TG |
| T007-02 | E2E | Full WhatsApp flow | Mock Gateway | End-to-end message | Session -> Response -> WA |
| T007-03 | E2E | Both channels active | Both enabled | Both work | Independent operation |
| T007-04 | E2E | Telegram failure | TG crashes | WhatsApp works | Graceful degradation |
| T007-05 | E2E | WhatsApp failure | WA crashes | Telegram works | Graceful degradation |
| T007-06 | E2E | Config reload | Enable/disable | Channels update | No restart needed |
| T007-07 | E2E | Multiple messages | Queue of messages | All processed | Order preserved |
| T007-08 | E2E | Media end-to-end | Photo message | Full cycle | Media delivered |
| T007-09 | E2E | Reply chain | Reply to message | Context preserved | originalMessageId set |
| T007-10 | E2E | Graceful shutdown | SIGTERM | Clean disconnect | No message loss |

#### Task T-008: Build and Run Verification

**Test Strategy:** Build & Run Verification

| Test ID | Type | Description | Preconditions | Expected Result | Pass/Fail Criteria |
|---------|------|-------------|---------------|-----------------|-------------------|
| T008-01 | Build | pnpm install | package.json | Dependencies installed | No errors |
| T008-02 | Build | pnpm build gateway | Source code | dist/ created | All files present |
| T008-03 | Build | Type resolution | Built packages | Imports work | No TS errors |
| T008-04 | Run | pnpm test | All tests | Tests pass | Exit code 0 |
| T008-05 | Run | CLI channel:list | Built CLI | Output shown | Channels listed |
| T008-06 | Run | Test script | test-channels.ts | Runs successfully | No runtime errors |
| T008-07 | Run | Coverage report | Tests complete | >= 70% | Coverage meets target |
| T008-08 | Run | Import verification | Built packages | Exports work | All symbols exported |

---

## 5. Implementation Plan per Task

### Task T-001: ChannelHandler Types and Configuration

**Logical Implementation Steps:**

1. Расширить `src/channel/types.ts`:
   ```typescript
   export enum ChannelType {
     CLI = 'cli',
     DASHBOARD = 'dashboard',
     TELEGRAM = 'telegram',  // NEW
     WHATSAPP = 'whatsapp',  // NEW
   }

   export interface TelegramConfig {
     botToken: string;
     webhookUrl?: string;  // V2
   }

   export interface WhatsAppConfig {
     sessionPath: string;
     qrTimeout?: number;
   }

   export type ChannelConfig = BaseChannelConfig | TelegramConfig | WhatsAppConfig;
   ```

2. Создать `src/channel/media.ts`:
   ```typescript
   export interface MediaAttachment {
     type: 'photo' | 'video' | 'audio' | 'document' | 'voice';
     data: Buffer;
     mimeType: string;
     filename?: string;
     size?: number;
   }
   ```

3. Создать `src/channel/converters.ts` stub functions

**Constraints from Architecture:**
- Все типы в `@osai/types` или `@osai/gateway` - no external type deps
- MediaAttachment должен работать с Buffer (Node.js)

**Integration Points:**
- `InboundMessage` из `@osai/types` - расширить для media
- `OutboundMessage` - добавить media support

---

### Task T-002: Telegram Channel Handler

**Logical Implementation Steps:**

1. Установить dependencies:
   ```bash
   pnpm --filter @osai/gateway add grammy
   ```

2. Создать `src/channels/TelegramChannel.ts`:
   ```typescript
   import { Bot, Context } from 'grammy';
   import { ChannelHandler, ChannelType, ChannelStatus } from '../channel/types';

   export class TelegramChannel implements ChannelHandler {
     readonly type = ChannelType.TELEGRAM;
     private bot: Bot;
     private status: ChannelStatus = ChannelStatus.DISCONNECTED;
     private messageHandlers: MessageHandler[] = [];

     constructor(config: TelegramConfig) {
       this.bot = new Bot(config.botToken);
       this.setupHandlers();
     }

     async connect(): Promise<void> { ... }
     async disconnect(): Promise<void> { ... }
     async send(message: OutboundMessage): Promise<void> { ... }
     onMessage(handler: MessageHandler): void { ... }
     getStatus(): ChannelStatus { ... }
   }
   ```

3. Реализовать message handlers:
   - `bot.on('message:text')` -> text messages
   - `bot.on('message:photo')` -> photos
   - `bot.on('message:document')` -> documents
   - `bot.on('callback_query')` -> inline button clicks

4. Реализовать error handling:
   - Rate limit (429) -> exponential backoff
   - Network errors -> reconnect
   - Invalid token -> throw on connect

**Constraints from Architecture:**
- Polling mode only для V1 (webhook в V2)
- Не блокировать Gateway при ошибке channel

**Integration Points:**
- ChannelManager.registerChannel()
- MessageHandler callback -> Session Router

---

### Task T-003: WhatsApp Channel Handler

**Logical Implementation Steps:**

1. Установить dependencies:
   ```bash
   pnpm --filter @osai/gateway add @whiskeysockets/baileys pino
   ```

2. Создать `src/channels/WhatsAppChannel.ts`:
   ```typescript
   import makeWASocket, { DisconnectReason, useMultiFileAuthState } from '@whiskeysockets/baileys';
   import { ChannelHandler, ChannelType, ChannelStatus } from '../channel/types';

   export class WhatsAppChannel implements ChannelHandler {
     readonly type = ChannelType.WHATSAPP;
     private socket: any;
     private status: ChannelStatus = ChannelStatus.DISCONNECTED;
     private messageHandlers: MessageHandler[] = [];
     private qrCallbacks: QRCallback[] = [];

     constructor(config: WhatsAppConfig) { ... }

     async connect(): Promise<void> {
       const { state, saveCreds } = await useMultiFileAuthState(this.config.sessionPath);
       this.socket = makeWASocket({ auth: state });
       this.setupEventHandlers();
     }

     onQR(callback: QRCallback): void { ... }
     async disconnect(): Promise<void> { ... }
     async send(message: OutboundMessage, jid: string): Promise<void> { ... }
     onMessage(handler: MessageHandler): void { ... }
     getStatus(): ChannelStatus { ... }
   }
   ```

3. Реализовать event handlers:
   - `connection.update` -> QR code, connection state
   - `messages.upsert` -> new messages
   - `creds.update` -> save auth state

4. Реализовать QR display через callback

**Constraints from Architecture:**
- Multi-device support (Baileys default)
- Session persistence в файловую систему
- QR timeout = 60 seconds default

**Integration Points:**
- ChannelManager.registerChannel()
- CLI для QR display (channel:qr command)

---

### Task T-004: Message Converters Implementation

**Logical Implementation Steps:**

1. Реализовать `convertTelegramMessage()`:
   ```typescript
   export function convertTelegramMessage(ctx: Context): InboundMessage {
     const msg = ctx.message!;
     return {
       id: msg.message_id.toString(),
       sessionId: msg.chat.id.toString(),
       type: 'message',
       content: msg.text || '',
       userId: msg.from?.id.toString(),
       displayName: msg.from?.username || msg.from?.first_name,
       timestamp: new Date(msg.date * 1000).toISOString(),
       media: extractTelegramMedia(msg),
       originalMessageId: msg.reply_to_message?.message_id?.toString(),
     };
   }
   ```

2. Реализовать `convertWhatsAppMessage()`:
   ```typescript
   export function convertWhatsAppMessage(msg: WAMessage): InboundMessage {
     return {
       id: msg.key.id!,
       sessionId: msg.key.remoteJid!,
       type: 'message',
       content: msg.message?.conversation || '',
       userId: msg.key.participant || msg.key.remoteJid!,
       timestamp: new Date(msg.messageTimestamp! * 1000).toISOString(),
       media: extractWhatsAppMedia(msg),
       originalMessageId: msg.message?.extendedTextMessage?.contextInfo?.stanzaId,
     };
   }
   ```

3. Реализовать media extractors для обоих platforms

**Constraints from Architecture:**
- Timestamp всегда ISO 8601
- userId всегда string (для consistency)
- Media data как Buffer

**Integration Points:**
- TelegramChannel.onMessage() -> converter -> ChannelManager
- WhatsAppChannel.onMessage() -> converter -> ChannelManager

---

### Task T-005: Channel Management CLI Commands

**Logical Implementation Steps:**

1. Создать `packages/cli/src/commands/channel/list.ts`:
   ```typescript
   export default class ChannelList extends Command {
     static description = 'List all configured messaging channels';
     static flags = {
       json: Flags.boolean({ description: 'Output as JSON' }),
     };

     async run() {
       const channels = channelManager.getChannels();
       // Format and display
     }
   }
   ```

2. Создать `packages/cli/src/commands/channel/status.ts`:
   ```typescript
   export default class ChannelStatus extends Command {
     static description = 'Show channel connection status';
     static args = [{ name: 'channel', required: true }];

     async run() {
       const { args } = await this.parse(ChannelStatus);
       // Get and display status
     }
   }
   ```

3. Создать `packages/cli/src/commands/channel/enable.ts`, `disable.ts`

4. Создать `packages/cli/src/commands/channel/qr.ts`:
   ```typescript
   export default class ChannelQR extends Command {
     static description = 'Display WhatsApp QR code for authentication';

     async run() {
       // Listen for QR and display in terminal
       // Use qrcode-terminal or similar
     }
   }
   ```

**Constraints from Architecture:**
- Команды не блокируют основной Gateway process
- QR display в terminal (ASCII art)

**Integration Points:**
- GatewayClient для communication с Gateway
- ChannelManager API

---

### Task T-006: Integration Tests

**Logical Implementation Steps:**

1. Создать mock helpers:
   ```typescript
   // __tests__/helpers/mock-telegram-bot.ts
   export function createMockTelegramBot() {
     return {
       on: vi.fn(),
       start: vi.fn(),
       stop: vi.fn(),
       sendMessage: vi.fn(),
       sendPhoto: vi.fn(),
     };
   }
   ```

2. Создать integration test suite:
   ```typescript
   // __tests__/integration/channels/telegram.test.ts
   describe('TelegramChannel', () => {
     it('should register with ChannelManager', async () => {
       const channel = new TelegramChannel(config);
       channelManager.registerChannel(channel);
       expect(channelManager.getChannels()).toContain('telegram');
     });

     it('should route message to session', async () => {
       // Mock bot emits message
       // Verify InboundMessage emitted
       // Verify Session Router receives it
     });
   });
   ```

3. Аналогично для WhatsApp

**Constraints from Architecture:**
- No real API calls
- Fast execution (< 5 seconds per test)

**Integration Points:**
- ChannelManager
- Session Router (mocked)
- Gateway (mocked)

---

### Task T-007: E2E Tests with Mock Gateway

**Logical Implementation Steps:**

1. Создать mock Gateway server:
   ```typescript
   // __tests__/e2e/mock-gateway.ts
   export class MockGateway {
     private channels: ChannelHandler[] = [];
     private sessionRouter: MockSessionRouter;

     registerChannel(channel: ChannelHandler) { ... }
     handleMessage(channel: ChannelType, msg: InboundMessage) { ... }
   }
   ```

2. Создать E2E test suite:
   ```typescript
   // __tests__/e2e/messaging-channels.test.ts
   describe('Messaging Channels E2E', () => {
     let gateway: MockGateway;
     let telegramChannel: TelegramChannel;
     let whatsappChannel: WhatsAppChannel;

     beforeEach(() => {
       gateway = new MockGateway();
       telegramChannel = new TelegramChannel(mockConfig);
       whatsappChannel = new WhatsAppChannel(mockConfig);
       gateway.registerChannel(telegramChannel);
       gateway.registerChannel(whatsappChannel);
     });

     it('should handle full message cycle', async () => {
       // Simulate TG message
       // Verify processing
       // Verify response sent back
     });
   });
   ```

**Constraints from Architecture:**
- Complete isolation (no external dependencies)
- Deterministic results

**Integration Points:**
- All channel components together
- Full message flow

---

### Task T-008: Build and Run Verification

**Logical Implementation Steps:**

1. Выполнить build:
   ```bash
   pnpm build
   ```

2. Запустить все тесты:
   ```bash
   pnpm test
   pnpm test:integration
   pnpm test:e2e
   ```

3. Создать test script:
   ```typescript
   // scripts/test-channels.ts
   import { ChannelManager } from '@osai/gateway';
   import { TelegramChannel, WhatsAppChannel } from '@osai/gateway/channels';

   const manager = new ChannelManager();
   console.log('Channels:', manager.getChannels());
   ```

4. Проверить CLI commands:
   ```bash
   pnpm cli channel:list
   pnpm cli channel:status telegram
   ```

5. Обновить documentation

**Constraints from Architecture:**
- Все тесты должны проходить
- Coverage >= 70%
- No TypeScript errors

**Integration Points:**
- Full system integration

---

## 6. Acceptance Criteria per Task

### Task T-001: ChannelHandler Types and Configuration

- [ ] `ChannelType.TELEGRAM` и `ChannelType.WHATSAPP` существуют
- [ ] `TelegramConfig` interface определён с botToken
- [ ] `WhatsAppConfig` interface определён с sessionPath
- [ ] `MediaAttachment` type определён
- [ ] `MediaMessage` расширяет `InboundMessage`
- [ ] Converter stubs созданы
- [ ] Unit тесты проходят
- [ ] TypeScript компилируется без errors

### Task T-002: Telegram Channel Handler

- [ ] `TelegramChannel implements ChannelHandler`
- [ ] `connect()` успешно подключается к Telegram Bot API
- [ ] `disconnect()` корректно завершает connection
- [ ] `send()` отправляет text messages
- [ ] `send()` отправляет media (photos, documents)
- [ ] `onMessage()` получает inbound messages
- [ ] Callback queries обрабатываются
- [ ] Rate limit handling реализован
- [ ] Reconnection logic работает
- [ ] Unit тесты проходят

### Task T-003: WhatsApp Channel Handler

- [ ] `WhatsAppChannel implements ChannelHandler`
- [ ] `connect()` генерирует QR code
- [ ] `connect()` с saved session подключается без QR
- [ ] `disconnect()` делает logout
- [ ] `send()` отправляет text messages
- [ ] `send()` отправляет media
- [ ] `onMessage()` получает inbound messages
- [ ] `onQR()` callback работает
- [ ] Session persistence работает
- [ ] Connection state handling работает
- [ ] Unit тесты проходят

### Task T-004: Message Converters Implementation

- [ ] `convertTelegramTextMessage()` работает
- [ ] `convertTelegramPhotoMessage()` работает
- [ ] `convertTelegramDocumentMessage()` работает
- [ ] `convertWhatsAppTextMessage()` работает
- [ ] `convertWhatsAppMediaMessage()` работает
- [ ] Reply-to mapping работает
- [ ] Sender info extraction работает
- [ ] Timestamp normalization работает
- [ ] Edge cases обрабатываются
- [ ] Unit тесты проходят

### Task T-005: Channel Management CLI Commands

- [ ] `channel:list` отображает все channels
- [ ] `channel:status telegram` показывает статус
- [ ] `channel:status whatsapp` показывает статус
- [ ] `channel:enable` включает channel
- [ ] `channel:disable` выключает channel
- [ ] `channel:qr` отображает QR code
- [ ] JSON output format работает
- [ ] Error handling работает
- [ ] Unit тесты проходят

### Task T-006: Integration Tests

- [ ] Channel registration test проходит
- [ ] Telegram message flow test проходит
- [ ] WhatsApp message flow test проходит
- [ ] Outbound to Telegram test проходит
- [ ] Outbound to WhatsApp test проходит
- [ ] Media handling tests проходят
- [ ] Connection status test проходит
- [ ] Reconnection tests проходят
- [ ] Error handling tests проходят
- [ ] Integration с Session Router работает

### Task T-007: E2E Tests with Mock Gateway

- [ ] Full Telegram flow test проходит
- [ ] Full WhatsApp flow test проходит
- [ ] Both channels active test проходит
- [ ] Graceful degradation tests проходят
- [ ] Config reload test проходит
- [ ] Multiple messages test проходит
- [ ] Media E2E test проходит
- [ ] Reply chain test проходит
- [ ] Graceful shutdown test проходит

### Task T-008: Build and Run Verification

- [ ] `pnpm install` завершается без errors
- [ ] `pnpm build` создаёт dist/
- [ ] TypeScript компилируется без errors
- [ ] Все unit тесты проходят
- [ ] Все integration тесты проходят
- [ ] Все E2E тесты проходят
- [ ] Coverage >= 70%
- [ ] CLI commands работают
- [ ] Test script выполняется
- [ ] README.md обновлён

---

## 7. Quality Expectations

### Coverage Requirements per Task

| Task ID | Unit Test Coverage | Integration Coverage | Notes |
|---------|-------------------|---------------------|-------|
| T-001 | >= 80% | - | Type guards, converters |
| T-002 | >= 75% | - | All methods, error paths |
| T-003 | >= 75% | - | All methods, error paths |
| T-004 | >= 90% | - | Pure functions |
| T-005 | >= 70% | - | CLI commands |
| T-006 | - | >= 70% | Message flows |
| T-007 | - | >= 60% (E2E) | Full scenarios |
| T-008 | - | - | Build verification |

### Task Completion Time

| Task ID | Estimated Time | Max Time |
|---------|---------------|----------|
| T-001 | 2-3 hours | 4 hours |
| T-002 | 3-4 hours | 5 hours |
| T-003 | 3-4 hours | 5 hours |
| T-004 | 2-3 hours | 4 hours |
| T-005 | 2-3 hours | 4 hours |
| T-006 | 3-4 hours | 5 hours |
| T-007 | 2-3 hours | 4 hours |
| T-008 | 2-3 hours | 4 hours |

**Total Estimated Time:** 19-27 hours (3-4 days solo development)

### Build and Run Stability

- TypeScript strict mode включён
- No `any` types без explicit justification
- ESLint проходит без warnings
- Prettier formatting применён
- All imports резолвятся

---

## 8. Risks and Edge Cases

### Known Edge Cases

| Edge Case | Handling Strategy |
|-----------|------------------|
| Empty message text | Graceful handling, return empty content |
| Very large media (50MB+) | Reject with size limit error |
| Message without sender | Use "Unknown" as displayName |
| Reply to deleted message | Set originalMessageId but log warning |
| Rate limit (429) | Exponential backoff, max 3 retries |
| Network disconnect | Auto-reconnect with backoff |
| Invalid bot token | Throw on connect(), log error |
| WhatsApp session expired | Re-generate QR, notify user |
| Concurrent messages | Queue processing, preserve order |
| Media download failure | Return error, don't crash channel |

### Risky Scenarios

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|------------|
| Telegram API breaking change | Low | High | Pin grammY version, monitor changelog |
| Baileys library issues | Medium | High | Fork-friendly architecture, abstraction layer |
| QR code timeout | Medium | Low | Configurable timeout, retry mechanism |
| Media storage growth | High | Medium | Size limits, cleanup policy |
| Rate limiting on both channels | Low | Medium | Queue system, priority handling |
| Session corruption | Low | High | Backup auth state, recovery flow |

### Dependency-Related Risks

| Dependency | Risk | Mitigation |
|------------|------|------------|
| grammY | API changes, bugs | Pin version, test thoroughly |
| Baileys | Less stable, frequent changes | Abstraction layer, monitoring |
| F-002 Gateway | Interface changes | Review F-002 roadmap, coordinate |

---

## 9. Notes

### Clarifications

1. **ChannelHandler interface** определён в F-002 (Gateway). Данная фича реализует конкретные implementations для Telegram и WhatsApp.

2. **Media handling** - базовая поддержка (photos, documents для Telegram; images, documents для WhatsApp). Video/audio - V2 scope.

3. **Webhook mode** для Telegram - не включён в V1. Polling mode достаточно для single-user local-first.

4. **Group chats** - не поддерживаются в V1. Только direct messages (1:1).

5. **WhatsApp Business API** - не включён. Baileys работает с regular WhatsApp accounts.

6. **Real device testing** - требует manual testing с реальным Telegram bot и WhatsApp account. Automated tests используют mocks.

### Planning Notes

1. T-002 и T-003 могут разрабатываться параллельно после завершения T-001. Это ускорит delivery на 3-4 часа.

2. Integration tests (T-006) требуют стабильного mock framework для grammY и Baileys. Время на mock setup включено в estimate.

3. CLI commands (T-005) зависят от T-004 из-за необходимости converter functions для status display.

4. Coverage target 70% - realistic для integration-heavy фичи. Unit tests фокусируются на converters и error handling.

5. Фича зависит от F-002 (Gateway). Рекомендуется начать разработку после завершения F-002 Task T-005 (Channel Handler Interface).

---

## 10. Package Structure

```
packages/gateway/
├── src/
│   ├── channel/
│   │   ├── ChannelHandler.ts      # Interface (from F-002)
│   │   ├── ChannelManager.ts      # Manager (from F-002)
│   │   ├── types.ts               # Extended types (T-001)
│   │   ├── media.ts               # Media types (T-001)
│   │   └── converters.ts          # Message converters (T-001, T-004)
│   ├── channels/
│   │   ├── TelegramChannel.ts     # Telegram implementation (T-002)
│   │   └── WhatsAppChannel.ts     # WhatsApp implementation (T-003)
│   └── index.ts                   # Exports
├── __tests__/
│   ├── unit/
│   │   ├── channel/
│   │   │   ├── types.test.ts
│   │   │   ├── media.test.ts
│   │   │   └── converters.test.ts
│   │   ├── TelegramChannel.test.ts
│   │   └── WhatsAppChannel.test.ts
│   ├── integration/
│   │   └── channels/
│   │       ├── telegram.test.ts
│   │       └── whatsapp.test.ts
│   ├── e2e/
│   │   └── messaging-channels.test.ts
│   └── helpers/
│       ├── mock-telegram-bot.ts
│       └── mock-whatsapp-client.ts
└── package.json

packages/cli/
├── src/
│   └── commands/
│       └── channel/
│           ├── list.ts            # channel:list (T-005)
│           ├── status.ts          # channel:status (T-005)
│           ├── enable.ts          # channel:enable (T-005)
│           ├── disable.ts         # channel:disable (T-005)
│           └── qr.ts              # channel:qr (T-005)
└── __tests__/
    └── commands/
        └── channel/
            ├── list.test.ts
            ├── status.test.ts
            ├── enable.test.ts
            ├── disable.test.ts
            └── qr.test.ts
```

---

*End of Task Roadmap: Messaging Channels - Telegram, WhatsApp v1.0*
