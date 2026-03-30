# Implementation Report -- T-004

## Implemented Scope

Реализован Python-микросервис Telethon Userbot для интеграции с Telegram через JSON-over-stdio протокол. Скрипт работает как child_process, управляемый из Node.js (UserbotBridge из T-003).

**Реализованные компоненты:**
- `main.py` -- точка входа, JSON-over-stdio loop, lifecycle management, signal handling (SIGTERM/SIGINT)
- `auth.py` -- авторизация через Telethon: phone code request, verification code submission, 2FA password support
- `handlers.py` -- обработка команд: send_message, listen, wait_reply, get_chats, health
- `session.py` -- зашифрованное хранение session файлов (AES-256-GCM, PBKDF2 key derivation)
- `requirements.txt` -- зависимости (telethon, cryptography)
- `tests/test_protocol.py` -- 57 pytest тестов

**В scope:**
- JSON-over-stdio протокол (line-delimited JSON, request/response correlation по id)
- Авторизация: phone + code (+ 2FA) через протокол
- Отправка/получение сообщений
- Ожидание ответа конкретного пользователя (wait_reply)
- Получение списка чатов (get_chats)
- Health check
- Прослушивание входящих сообщений (listen)
- Шифрование session (AES-256-GCM)
- Graceful shutdown (SIGTERM/SIGINT)

**Out scope:** Mirror logic -- только отправка/получение сообщений (согласно roadmap)

## Tests Implemented

Всего **57 тестов**, разделённых на 8 тестовых классов:

### TestJsonProtocol (7 тестов)
- Создание базового/минимального ответа
- Однострочность JSON (no newlines in payload)
- Unicode/русский текст
- Невалидный JSON -> error response
- Валидный JSON -> парсинг
- Пустые строки игнорируются

### TestCommandHandlers (16 тестов)
- Health check: connected/disconnected
- Unknown command -> error
- send_message: success, missing params, failure
- get_chats: success, failure
- listen: start, stop, idempotent start
- wait_reply: timeout, missing params
- auth_code: ack, missing code
- auth_2fa_password: ack
- Exception handling -> error response

### TestSessionEncryption (12 тестов)
- Encrypt/decrypt roundtrip
- Разные ciphertext при одинаковых данных (random nonce/salt)
- Неверный passphrase -> exception
- Пустой passphrase -> ValueError
- SessionStore: save/load, nonexistent -> None, exists, delete, delete nonexistent
- Создание директории
- Санитизация phone в имени файла
- JSON формат файла session

### TestAuthFlow (7 тестов)
- AuthConfig/AuthResult creation
- AuthError иерархия (AuthCodeRequired, Auth2FARequired, AuthInvalidCode)
- AuthManager creation
- authenticate без client -> AuthError
- authenticate с существующей session -> success

### TestMessageEvent (2 теста)
- MessageEvent creation со всеми полями
- Optional username

### TestEntityTypeDetection (2 теста)
- User entity type
- Unknown entity type

### TestTelethonUserbot (5 тесты)
- Environment config reading
- Session path sanitization
- TELETHON_SESSION_DIR env override
- Initial running state
- _process_line dispatches health command

### TestSignalHandling (2 теста)
- SIGTERM -> running = False
- SIGINT -> running = False

### TestResponseFormat (3 теста)
- Все response types имеют type, id, data
- Correlation ID сохраняется
- write_response добавляет newline

**Результат:** 57/57 passed, 0 failed

## Code Changes

### Файлы добавлены

| Файл | Назначение |
|------|------------|
| `packages/gateway/src/channels/telegram/telethon_userbot/__init__.py` | Пакетный файл, версия 0.1.0 |
| `packages/gateway/src/channels/telegram/telethon_userbot/main.py` | Точка входа, JSON-over-stdio loop |
| `packages/gateway/src/channels/telegram/telethon_userbot/auth.py` | Авторизация (phone + code + 2FA) |
| `packages/gateway/src/channels/telegram/telethon_userbot/handlers.py` | Обработка команд |
| `packages/gateway/src/channels/telegram/telethon_userbot/session.py` | AES-256-GCM шифрование session |
| `packages/gateway/src/channels/telegram/telethon_userbot/requirements.txt` | Зависимости |
| `packages/gateway/src/channels/telegram/telethon_userbot/tests/__init__.py` | Пакет тестов |
| `packages/gateway/src/channels/telegram/telethon_userbot/tests/test_protocol.py` | 57 pytest тестов |
| `docs/develop/F-010/T-004/IMPLEMENTATION_REPORT_T-004.md` | Данный отчёт |

### Файлы изменены

Нет. Все существующие файлы не затронуты.

## Architectural Compliance

**Протокол:**
- JSON-over-stdio протокол полностью совместим с `BridgeRequest`/`BridgeResponse` типами из `types.ts`
- Line-delimited JSON (newline terminator)
- Корреляция запросов по `id`
- Response format: `{type, id, data}`

**Архитектура:**
- Bridge pattern: Python микросервис управляется через child_process из Node.js
- Структура модулей соответствует layered pattern: main (transport) -> handlers (logic) -> session (data)
- Logging через stderr (stdout зарезервирован для протокола)
- Environment variables для конфигурации (TELETHON_API_ID, TELETHON_API_HASH, TELETHON_PHONE)

**Безопасность:**
- AES-256-GCM зашифрованное хранение session
- PBKDF2-HMAC-SHA256 (600 000 итераций) для деривации ключа
- Random salt (32 bytes) и nonce (12 bytes) при каждом шифровании
- Session stored at `~/.osai/channels/telegram/session/`
- Никакие креденшелы не логируются

**Signal handling:**
- SIGTERM/SIGINT -> graceful shutdown
- Windows fallback (signal.signal) т.к. add_signal_handler не поддерживается

## Deviations

1. **Профиль:** Задача DOMAIN-006 с профилем `backend-multi`, но подходящий профиль `backend/python.py` ориентирован на Django/FastAPI веб-приложения. Данная задача -- standalone микросервис с JSON-over-stdio протоколом, не веб-сервер. Python base профиль соблюдён (layered architecture, error handling, testing, logging).

2. **pyproject.toml:** Вместо Poetry/uv используется `requirements.txt` для простоты -- микросервис не является Python пакетом, а выполняется как скрипт через `child_process.spawn`.

3. **Telethon session:** Помимо зашифрованного session через `session.py`, Telethon использует собственный `.session` файл для хранения MTProto state. Путь к этому файлу задаётся через `session_path` в `main.py` и хранится в `~/.osai/channels/telegram/session/<phone>`.

## Known Limitations

1. **Telethon не установлен в CI:** Тесты требуют установленных пакетов `telethon` и `cryptography`. Для CI pipeline необходимо добавить шаг установки зависимостей.
2. **Rate limiting:** Rate limiting для Telegram API реализуется на стороне Node.js (UserbotBridge), а не в Python коде -- согласно roadmap T-003.
3. **Media handling:** Текущая реализация поддерживает только текстовые сообщения. Media handling -- best-effort, согласно roadmap.
4. **Python 3.11+ required:** Используется `from __future__ import annotations` и type hints нового стиля.
