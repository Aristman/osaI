# Task Roadmap: Telegram Integration (F-010)

**Version:** v1.0
**Date:** 2026-03-30
**Author:** TDD Planner Agent
**Status:** Active

---

## Feature F-010: Telegram Integration
**Domain:** DOMAIN-006 | **Dependencies:** F-004, F-008, F-009 | **Branch:** feature/telegram-integration

---

### Task T-001: Telegram Manager + Configuration Schema

**Domain:** DOMAIN-006 | **Dependencies:** None | **Estimated:** 2-3h

#### Scope
- **In scope:** TelegramManager (lifecycle координации), конфигурационная схема channels.telegram в osai.json, типов BridgeRequest/BridgeResponse
- **Out scope:** Реализация bot/userbot/mirror -- только интерфейсы и менеджер

#### Checklist
- [ ] CODE: `packages/gateway/src/channels/telegram/types.ts` -- типы BridgeRequest, BridgeResponse, TelegramConfig, MirrorConfig
- [ ] CODE: `packages/gateway/src/channels/telegram/manager.ts` -- TelegramManager (start/stop/status, координация bot + userbot + mirror)
- [ ] CODE: Обновить `osai.json` schema -- секция channels.telegram (bot, userbot, mirrors)
- [ ] TEST: `tests/unit/gateway/telegram/manager.test.ts` -- lifecycle, конфигурация валидация, fallback при отсутствующем userbot
- [ ] BUILD: `pnpm build` -- компиляция без ошибок

#### Acceptance
- TelegramManager создаётся с валидной конфигурацией
- start() и stop() вызываются без ошибок (заглушки для bot/userbot/mirror)
- При enabled.userbot=false -- manager работает в bot-only mode
- Все типы BridgeRequest/BridgeResponse экспортируются и типизированы

---

### Task T-002: Telegram Bot (grammY) -- Commands + Chat + Security

**Domain:** DOMAIN-006 | **Dependencies:** T-001 | **Estimated:** 3-4h

#### Scope
- **In scope:** grammY bot handler: /help, /chat, /memory, /status, обработка текстовых сообщений, allowedUsers whitelist, привязка к osaiI chat, permission requests, notifications
- **Out scope:** Медиа, mirror, userbot

#### Checklist
- [ ] CODE: `packages/gateway/src/channels/telegram/bot.ts` -- TelegramBot (grammY handler)
- [ ] CODE: Команды: /help, /chat, /memory, /status
- [ ] CODE: allowedUsers whitelist middleware
- [ ] CODE: Интеграция с Gateway channel handler (GatewayMessage protocol)
- [ ] TEST: `tests/unit/gateway/telegram/bot.test.ts` -- команды, whitelist (допуск/блокировка), форматирование ответа
- [ ] BUILD: `pnpm build` -- компиляция без ошибок

#### Acceptance
- [AC-014-1] Bot обрабатывает команды: /chat, /memory, /status, /help
- [AC-014-2] Bot отправляет permission requests и notifications
- [AC-014-3] Bot привязан к конкретному osaI-чату
- [AC-014-4] Доступ ограничен allowedUsers whitelist -- неавторизованные пользователи получают отказ
- Graceful degradation: при отсутствии Gateway -- bot отвечает ошибкой

---

### Task T-003: Telethon Userbot Bridge (Node.js side)

**Domain:** DOMAIN-006 | **Dependencies:** T-001 | **Estimated:** 2-3h

#### Scope
- **In scope:** UserbotBridge класс: child_process spawn Python, JSON-over-stdio протокол, методы (start, stop, sendMessage, getChats, healthCheck), обработка сообщений от Python, lifecycle management
- **Out scope:** Python-код Telethon (T-004), сообщения пробрасываются через callback

#### Checklist
- [ ] CODE: `packages/gateway/src/channels/telegram/userbot.ts` -- UserbotBridge (spawn, stdio protocol, lifecycle)
- [ ] CODE: JSON-over-stdio reader/writer (line-delimited JSON, request/response correlation по id)
- [ ] CODE: Health check с таймаутом, auto-restart при краше Python процесса
- [ ] TEST: `tests/unit/gateway/telegram/userbot-bridge.test.ts` -- spawn/stop, протокол, health check, restart, error handling
- [ ] BUILD: `pnpm build` -- компиляция без ошибок

#### Acceptance
- [AC-015-7] Lifecycle: start, stop, restart, health check через Node.js parent process
- Bridge корректно отправляет BridgeRequest и получает BridgeResponse по stdio
- При краше Python процесса -- bridge инициирует auto-restart (с лимитом)
- Таймаут health check -- корректная обработка
- Невалидный JSON от Python -- логирование, без краша Node.js

---

### Task T-004: Telethon Userbot (Python microservice)

**Domain:** DOMAIN-006 | **Dependencies:** T-003 | **Estimated:** 3-4h

#### Scope
- **In scope:** Python-скрипт: Telethon client, JSON-over-stdio протокол, auth (phone + code через stdin/stdout), listen_messages, send_message, wait_reply, get_chats, health. Шифрование session (AES-256)
- **Out scope:** Mirror logic -- только отправка/получение сообщений

#### Checklist
- [ ] CODE: `packages/gateway/src/channels/telegram/telethon_userbot/main.py` -- точка входа
- [ ] CODE: `packages/gateway/src/channels/telegram/telethon_userbot/auth.py` -- авторизация (phone + code)
- [ ] CODE: `packages/gateway/src/channels/telegram/telethon_userbot/handlers.py` -- обработка команд
- [ ] CODE: `packages/gateway/src/channels/telegram/telethon_userbot/session.py` -- зашифрованное хранение session
- [ ] CODE: `packages/gateway/src/channels/telegram/telethon_userbot/requirements.txt` -- зависимости
- [ ] TEST: `packages/gateway/src/channels/telegram/telethon_userbot/tests/test_protocol.py` -- JSON protocol, auth flow, message handling
- [ ] BUILD: `pnpm build` (TS side) + `python -m pytest telethon_userbot/tests/` (Python side)

#### Acceptance
- [AC-015-1] Userbot работает как Python microservice через child_process
- [AC-015-2] Чтение входящих сообщений (личные чаты + группы)
- [AC-015-3] Отправка сообщений от имени пользователя
- [AC-015-4] Ожидание ответа конкретного пользователя
- [AC-015-5] Session: `~/.osai/channels/telegram/session/` (AES-256 encrypted)
- [AC-015-6] Инициализация: phone + code авторизации через CLI
- Python-скрипт корректно обрабатывает SIGTERM/SIGINT

---

### Task T-005: Userbot Auth Flow (CLI Integration)

**Domain:** DOMAIN-006 | **Dependencies:** T-003, T-004 | **Estimated:** 2h

#### Scope
- **In scope:** CLI-команда `osai channel add telegram` -- интерактивный flow: ввод phone, получение code, запись session. Интеграция с osai.json
- **Out scope:** Bot token setup (опционально в рамках этой задачи)

#### Checklist
- [ ] CODE: `packages/cli/src/commands/channel/add-telegram.ts` -- CLI команда
- [ ] CODE: Интеграция с UserbotBridge для interactive auth
- [ ] TEST: `tests/unit/gateway/telegram/auth-flow.test.ts` -- mock bridge, auth sequence, error cases
- [ ] BUILD: `pnpm build` -- компиляция без ошибок

#### Acceptance
- [AC-015-6] Пользователь проходит авторизацию через CLI: ввод phone -> ожидание code -> подтверждение
- Session сохраняется в `~/.osai/channels/telegram/session/`
- Креденшелы записываются в osai.json
- Повторная авторизация -- переиспользование session (без повторного ввода code)

---

### Task T-006: Mirror Engine -- osaiI-to-Telegram

**Domain:** DOMAIN-006 | **Dependencies:** T-002 | **Estimated:** 2-3h

#### Scope
- **In scope:** Однонаправленный mirror: ответ osaI -> отправка в Telegram (bot или userbot). Markdown -> HTML конвертация. Hook on_mirror_message
- **Out scope:** Обратный mirror (T-007), двусторонний sync (T-008)

#### Checklist
- [ ] CODE: `packages/gateway/src/channels/telegram/mirror.ts` -- MirrorEngine (класс)
- [ ] CODE: osaiI-to-TG направление: подписка на agent responses, отправка через bot/userbot
- [ ] CODE: Markdown -> Telegram HTML конвертация
- [ ] CODE: Вызов hook `on_mirror_message`
- [ ] TEST: `tests/unit/gateway/telegram/mirror-osai-to-tg.test.ts` -- отправка, форматирование, hook вызов, error handling
- [ ] BUILD: `pnpm build` -- компиляция без ошибок

#### Acceptance
- [AC-016-1] Сообщения osaI -> Telegram доставляются
- [AC-016-4] Markdown форматирование сохраняется при зеркалировании
- [AC-016-6] Hook `on_mirror_message` вызывается при каждом зеркалировании
- При ошибке отправки -- логирование, retry (1 попытка)

---

### Task T-007: Mirror Engine -- Telegram-to-osaiI

**Domain:** DOMAIN-006 | **Dependencies:** T-006, T-003 | **Estimated:** 2-3h

#### Scope
- **In scope:** Обратный mirror: входящее Telegram сообщение -> инъекция в Agent Runtime через Gateway. Дедупликация, форматирование
- **Out scope:** Двусторонняя координация (T-008)

#### Checklist
- [ ] CODE: Обновить `mirror.ts` -- TG-to-osaiI направление
- [ ] CODE: Получение сообщения от bot/userbot, маппинг в GatewayMessage
- [ ] CODE: Дедупликация по message_id (предотвращение циклов)
- [ ] CODE: Telegram HTML -> Markdown конвертация
- [ ] TEST: `tests/unit/gateway/telegram/mirror-tg-to-osai.test.ts` -- получение, дедупликация, форматирование, injection
- [ ] BUILD: `pnpm build` -- компиляция без ошибок

#### Acceptance
- [AC-016-2] Сообщения Telegram -> osaiI доставляются
- Дедупликация: одно сообщение не обрабатывается дважды
- Сообщения корректно инжектируются в Agent Runtime
- При ошибке инжекции -- логирование

---

### Task T-008: Mirror Engine -- Bidirectional Sync + Config

**Domain:** DOMAIN-006 | **Dependencies:** T-006, T-007 | **Estimated:** 2-3h

#### Scope
- **In scope:** Полная двусторонняя синхронизация. Конфигурируемое direction (both/osai-to-tg/tg-to-osai). Медиа handling (best-effort). Привязка mirror к конкретному osaiI-чату. Множественные mirrors
- **Out scope:** Видео/голосовые (best-effort, fallback)

#### Checklist
- [ ] CODE: Обновить `mirror.ts` -- bidirectional mode, direction config, multi-mirror support
- [ ] CODE: Медиа handling: download -> передать в osaI (best-effort)
- [ ] CODE: Привязка mirror к osaiI chat_id через конфигурацию
- [ ] TEST: `tests/unit/gateway/telegram/mirror-bidi.test.ts` -- bidirectional sync, direction filtering, media handling
- [ ] BUILD: `pnpm build` -- компиляция без ошибок

#### Acceptance
- [AC-016-1] osaiI -> TG доставка без потери (text)
- [AC-016-2] TG -> osaiI доставка без потери (text)
- [AC-016-3] Mirror привязан к конкретному osaiI-чату
- [AC-016-5] Медиа зеркалируется (best-effort)
- [AC-016-7] direction конфигурируется: both | osai-to-tg | tg-to-osai
- Циклы зеркалирования исключены (dedup по message_id)

---

### Task T-009: Integration Test + End-to-End Verification

**Domain:** DOMAIN-006 | **Dependencies:** T-002, T-005, T-008 | **Estimated:** 3-4h

#### Scope
- **In scope:** Интеграционные тесты: Manager -> Bot, Manager -> UserbotBridge, Manager -> MirrorEngine. E2E сценарии с mock Telegram API. Rate limiting проверка. Общая сборка и запуск
- **Out scope:** Нагрузочное тестирование

#### Checklist
- [ ] TEST: `tests/integration/telegram/manager-bot.test.ts` -- Manager стартует bot, обрабатывает сообщения
- [ ] TEST: `tests/integration/telegram/manager-userbot.test.ts` -- Manager стартует userbot bridge, lifecycle
- [ ] TEST: `tests/integration/telegram/mirror-e2e.test.ts` -- полная цепочка TG msg -> agent -> TG response
- [ ] TEST: `tests/integration/telegram/rate-limiting.test.ts` -- rate limiting для userbot
- [ ] BUILD: `pnpm build` -- полная сборка проекта
- [ ] RUN: `pnpm test` -- все тесты проходят

#### Acceptance
- TelegramManager корректно координирует bot + userbot + mirror
- E2E: сообщение в TG -> agent response -> ответ в TG (mock)
- Bot-only mode работает без userbot
- Rate limiting: userbot не превышает лимит запросов
- Все тесты проходят: `pnpm test`
- Сборка проходит: `pnpm build`

---

## Dependencies Summary

```
T-001 (Manager + Types)
  |
  +-- T-002 (Bot) ------+
  |                      |
  +-- T-003 (Bridge) --+|
  |    |                ||
  |    +-- T-004 (Python Telethon)
  |    |
  |    +-- T-005 (Auth CLI) --+--- T-009 (Integration)
  |                           |
  +-- T-006 (Mirror osai->TG)|
         |                    |
         +-- T-007 (Mirror TG->osai)
                |
                +-- T-008 (Mirror Bidi)
```

**Parallel groups:**
- Group 1: T-001
- Group 2: T-002, T-003 (parallel after T-001)
- Group 3: T-004 (after T-003)
- Group 4: T-005 (after T-003, T-004), T-006 (after T-002)
- Group 5: T-007 (after T-006, T-003)
- Group 6: T-008 (after T-006, T-007)
- Group 7: T-009 (after T-002, T-005, T-008)

## Quality Expectations

- Unit tests: mocking Telegram API, child_process, Gateway
- Integration tests: mock JSON-over-stdio protocol, mock Telegram API server
- Coverage: >= 80% для bot.ts, userbot.ts, mirror.ts, manager.ts
- Python tests: pytest, mock Telethon client
- Build stability: `pnpm build` и `pnpm test` проходят без ошибок

## Risks

| Risk | Probability | Mitigation |
|------|------------|------------|
| Telethon ban аккаунта (R-ARCH-06) | Medium | Rate limiting, отдельный аккаунт, bot-only fallback |
| Python на целевой машине не установлен | Medium | T-001: detect Python, fallback на bot-only с warning |
| JSON-over-stdio протокол нестабилен | Low | Надёжный line-delimited парсер, correlation ID, timeout |
| Медиа в mirror: размер/формат (OQ-ARCH-04) | Medium | Best-effort, fallback на text-only |

---

**Version:** v1.0
**Author:** TDD Planner Agent
