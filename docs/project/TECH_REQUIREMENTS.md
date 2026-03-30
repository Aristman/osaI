# Technical Requirements

**Версия документа:** v1.0
**Дата:** 2026-03-30
**Проект:** osaI v3 -- AI Operating System
**Спецификация:** docs/specs/spec_osai_v3_2026-03-28.md
**Профиль:** docs/project/PROJECT_PROFILE.md
**Анализ:** docs/project/ANALYSIS.md

---

## 1. System Overview

osaI v3 -- локально работающий AI-ассистент с полным OS-управлением, multi-channel доступом (CLI, Telegram), глубокой структурированной памятью с RAG, системой мультичатов и локальным голосовым стеком. Система построена по принципу local-first: все данные хранятся на машине пользователя, облачные API используются только для LLM и voice fallback.

### Ключевые обязанности системы

1. Принимать запросы пользователя через множество каналов (CLI, Telegram bot, Telegram userbot) и маршрутизировать их в единый agent loop
2. Выполнять intent execution: файловые операции, shell-команды, OS-управление, поиск по памяти и базе знаний
3. Управлять до 20 независимых чатов с изолированным локальным контекстом и общей долговременной памятью
4. Предоставлять failover-цепочку из 5 LLM-провайдеров с circuit breaker
5. Хранить и извлекать долговременную память через RAG (семантический поиск по векторным представлениям)
6. Обеспечивать двустороннюю синхронизацию (mirror) между osaI-чатами и Telegram-чатами/каналами
7. Предоставлять голосовой ввод/вывод (STT/TTS) через локальные процессы
8. Обеспечивать 7-уровневую безопасность и аудит всех действий

---

## 2. Functional Requirements

### FR-001: Gateway -- WebSocket Control Plane

**Описание:** Система должна предоставлять единый WebSocket control plane для всех клиентских подключений. Gateway маршрутизирует сообщения между каналами (CLI, Telegram) и agent runtime.

**Обоснование:** ANALYSIS.md, раздел 2.1 (домен); SPEC, раздел 2.1 (архитектура). Единый control plane обеспечивает унифицированный доступ из любого канала.

**Критерии приёмки:**
- [ ] AC-001-1: Gateway принимает WebSocket-подключения на `ws://127.0.0.1:18789`
- [ ] AC-001-2: Gateway маршрутизирует сообщения от любого канала к agent runtime
- [ ] AC-001-3: Gateway delivers tool_stream, block, permission_request сообщения клиентам
- [ ] AC-001-4: Gateway корректно обрабатывает subscribe и permission_response сообщения от клиентов
- [ ] AC-001-5: Gateway поддерживает одновременные подключения из CLI и Telegram

---

### FR-002: Agent Loop

**Описание:** Система должна реализовать agent loop: intake -> context_assembly -> model_inference -> tool_execution -> streaming -> persistence, с поддержкой hook points для расширения.

**Обоснование:** ANALYSIS.md, раздел 2.1 (домен Agent Runtime); SPEC, раздел 3.1. Agent loop -- основная вычислительная модель системы.

**Критерии приёмки:**
- [ ] AC-002-1: Agent loop выполняет полный цикл для каждого пользовательского запроса
- [ ] AC-002-2: Поддерживаются следующие hook points: before_model_resolve, before_prompt_build, before_agent_start, before_tool_call, after_tool_call, agent_end, on_error
- [ ] AC-002-3: osaI-specific hook points работают: before_memory_query, after_memory_extract, on_file_access, on_desktop_notification, on_chat_switch, on_mirror_message
- [ ] AC-002-4: Tool execution loop корректно обрабатывает tool_use циклы (повторные вызовы)
- [ ] AC-002-5: Streaming ответов доставляется клиентам в реальном времени

---

### FR-003: Multi-Chat System

**Описание:** Система должна поддерживать до 20 независимых чатов с изолированной локальной историей, но общей долговременной памятью, knowledge base и skills.

**Обоснование:** ANALYSIS.md, раздел 3.1 (цель: до 20 чатов); SPEC, раздел 3.3. Ключевое отличие osaI v3 от OpenClaw.

**Критерии приёмки:**
- [ ] AC-003-1: Пользователь может создать до 20 активных чатов
- [ ] AC-003-2: Каждый чат имеет собственную историю сообщений, состояние и контекст
- [ ] AC-003-3: Долгосрочная память, knowledge base и skills доступны из любого чата
- [ ] AC-003-4: Переключение между чатами сохраняет контекст исходного и загружает контекст целевого
- [ ] AC-003-5: Удаление чата удаляет его локальные сообщения, но сохраняет shared memory
- [ ] AC-003-6: Неактивные чаты можно архивировать (освобождая лимит активных)
- [ ] AC-003-7: Каждый чат имеет: id, name, description, tags, icon, color, channel, channelMetadata, isActive

---

### FR-004: Chat Persistence

**Описание:** Чаты и сообщения должны сохраняться в SQLite для устойчивости к перезапускам.

**Обоснование:** SPEC, раздел 3.3.3 (SQLite-схема); ANALYSIS.md, раздел 2.3 (local-first). Данные не должны теряться при перезапуске процесса.

**Критерии приёмки:**
- [ ] AC-004-1: Чаты сохраняются в таблицу `chats` SQLite
- [ ] AC-004-2: Сообщения сохраняются в таблицу `chat_messages` с индексом по chat_id + created_at
- [ ] AC-004-3: При перезапуске системы чаты и сообщения восстанавливаются из SQLite
- [ ] AC-004-4: Сообщения содержат: id, chat_id, role, content, tool_calls (JSON), metadata (JSON), created_at

---

### FR-005: Skills System -- Bundled Skills

**Описание:** Система должна предоставлять встроенные skills: Filesystem и Shell, с поддержкой sandbox и permission prompts.

**Обоснование:** SPEC, раздел 4.3; ANALYSIS.md, раздел 2.1 (домен Skills System). Файловые и shell-операции -- базовые возможности OS-ассистента.

**Критерии приёмки:**
- [ ] AC-005-1: Filesystem skill поддерживает операции: read_file, write_file, list_dir, search_files, move_file, delete_file, get_file_info
- [ ] AC-005-2: Shell skill поддерживает операции: exec, exec_sandbox с configurable timeout
- [ ] AC-005-3: File sandbox ограничивает файловые операции allowed_dirs и блокирует blocked_patterns
- [ ] AC-005-4: Permission prompts категоризируются: read=auto, write=confirm, exec=confirm
- [ ] AC-005-5: Blocked commands для shell являются hardcoded + конфигурируемыми
- [ ] AC-005-6: Все shell-команды логируются в audit log

---

### FR-006: Skills System -- osaI-specific Skills

**Описание:** Система должна предоставлять osaI-specific skills: Memory, Knowledge Base, Chat Management, OS Integration.

**Обоснование:** SPEC, раздел 4.4; ANALYSIS.md, раздел 5.1 (трёхуровневая память). Ключевые расширения osaI поверх OpenClaw.

**Критерии приёмки:**
- [ ] AC-006-1: Memory skill: remember, recall, forget, summarize_session
- [ ] AC-006-2: Knowledge Base skill: ingest_document, query_knowledge, list_sources, remove_source
- [ ] AC-006-3: Chat Management skill: chat_list, chat_create, chat_switch, chat_archive, chat_delete
- [ ] AC-006-4: OS Integration skill: show_notification, watch_directory, list_processes, open_application, get_system_info
- [ ] AC-006-5: Skills описываются в формате SKILL.md

---

### FR-007: LLM Provider Registry и Failover

**Описание:** Система должна поддерживать 5 LLM-провайдеров с автоматической failover-цепочкой, circuit breaker и auth profile rotation.

**Обоснование:** ANALYSIS.md, раздел 3.1 (цель: 5 провайдеров с failover); SPEC, раздел 3.4. Критическое требование для надёжности.

**Критерии приёмки:**
- [ ] AC-007-1: Поддерживаемые провайдеры: Z.ai (OpenAI-совместимый), Yandex Foundation Models, Anthropic Claude, OpenAI GPT, Ollama (local)
- [ ] AC-007-2: Failover chain: Z.ai -> Yandex -> Anthropic -> OpenAI -> Ollama
- [ ] AC-007-3: Circuit breaker: при N (по умолчанию 5) последовательных ошибках провайдер помечается как unavailable
- [ ] AC-007-4: Circuit breaker reset timeout: 30 секунд по умолчанию
- [ ] AC-007-5: Auth profile rotation: несколько API-ключей для одного провайдера, автоматическая ротация при rate limit
- [ ] AC-007-6: При недоступности всех cloud-провайдеров система переключается на Ollama (local)
- [ ] AC-007-7: Z.ai provider использует OpenAI-совместимый API формат (конфигурируемый base URL)
- [ ] AC-007-8: Каждый провайдер конфигурируется независимо в openclaw.json

---

### FR-008: Memory System -- Three-Tier Architecture

**Описание:** Система должна реализовать трёхуровневую память: Chat Memory (per-chat), Session Memory (OpenClaw SQLite), Long-term Memory (shared, SQLite + vector search).

**Обоснование:** ANALYSIS.md, раздел 5.1 (трёхуровневая память); SPEC, раздел 5.1. RAG-поиск и долговременная память -- ключевые возможности.

**Критерии приёмки:**
- [ ] AC-008-1: Chat Memory хранит историю сообщений для каждого чата изолированно
- [ ] AC-008-2: Session Memory хранит tool results, session state через OpenClaw SQLite persistence
- [ ] AC-008-3: Long-term Memory хранит: facts, preferences, knowledge, errors, patterns
- [ ] AC-008-4: Long-term Memory является общей (shared) для всех чатов
- [ ] AC-008-5: Каждая запись Long-term Memory содержит: id, content, embedding, category, tags, sourceSession, sourceChatId, accessCount, metadata

---

### FR-009: Embeddings

**Описание:** Система должна генерировать векторные представления для RAG-поиска с configurable провайдерами.

**Обоснование:** ANALYSIS.md, раздел 5.6 (модель embeddings); SPEC, раздел 5.6. Необходимы для семантического поиска по памяти и KB.

**Критерии приёмки:**
- [ ] AC-009-1: Embedding по умолчанию: Ollama nomic-embed-text (768-dim)
- [ ] AC-009-2: Fallback embedding: Yandex text-embedding (256-dim)
- [ ] AC-009-3: Offline fallback: ONNX all-MiniLM-L6-v2 (384-dim) через Transformers.js
- [ ] AC-009-4: При недоступности Ollama система автоматически переключается на fallback
- [ ] AC-009-5: Выбор embedding-провайдера конфигурируется в openclaw.json

---

### FR-010: Vector Storage

**Описание:** Система должна хранить и искать векторные представления для RAG. Primary подход -- sqlite-vec (embedded в Node.js через better-sqlite3), optional -- Qdrant server.

**Обоснование:** ANALYSIS.md, раздел 6.2 (R5: Qdrant не имеет embedded mode для Node.js); раздел 9.3 (sqlite-vec как рекомендация). Критическая корректировка спецификации.

**Критерии приёмки:**
- [ ] AC-010-1: Primary vector storage использует sqlite-vec (встроенный в SQLite через better-sqlite3)
- [ ] AC-010-2: Vector search поддерживает cosine similarity
- [ ] AC-010-3: Optional: поддержка Qdrant server как external vector DB через REST client
- [ ] AC-010-4: При отсутствии Qdrant server система работает полноценно через sqlite-vec
- [ ] AC-010-5: Выбор vector storage конфигурируется в openclaw.json (sqlite-vec | qdrant)

---

### FR-011: RAG Pipeline

**Описание:** Система должна реализовать RAG (Retrieval-Augmented Generation) pipeline: query -> embed -> vector search -> inject relevant context into prompt.

**Обоснование:** ANALYSIS.md, раздел 5.4; SPEC, раздел 5.4. RAG -- ключевой механизм обогащения контекста.

**Критерии приёмки:**
- [ ] AC-011-1: RAG query выполняется через hook `before_prompt_build`
- [ ] AC-011-2: Векторный поиск возвращает top-k (по умолчанию 5) записей с similarity > 0.7
- [ ] AC-011-3: Relevant context инжектируется в system prompt перед model inference
- [ ] AC-011-4: После tool execution система извлекает факты из ответа и сохраняет в long-term memory
- [ ] AC-011-5: RAG работает корректно в multi-chat контексте (shared long-term memory)

---

### FR-012: Knowledge Base

**Описание:** Система должна позволять пользователю создавать личную базу знаний через ингест документов и семантический поиск.

**Обоснование:** ANALYSIS.md, раздел 2.1 (домен Knowledge Base); SPEC, раздел 5.5. Расширение возможностей ассистента через пользовательские документы.

**Критерии приёмки:**
- [ ] AC-012-1: Ingest pipeline: документ -> chunking (1024 tokens, overlap 128) -> embedding -> vector storage
- [ ] AC-012-2: Поддерживаемые форматы документов: текстовые файлы, Markdown, PDF (минимум)
- [ ] AC-012-3: Семантический поиск возвращает релевантные passages с указанием sources
- [ ] AC-012-4: Source management: add, remove, list по тегам
- [ ] AC-012-5: Knowledge base доступна из любого чата

---

### FR-013: Context Window Management

**Описание:** Система должна автоматически управлять контекстным окном, чтобы не превышать лимиты модели.

**Обоснование:** ANALYSIS.md, раздел 6.2 (R10: переполнение контекста); SPEC, раздел 5.7. Необходимость для стабильности при мультичатах.

**Критерии приёмки:**
- [ ] AC-013-1: maxTokens конфигурируется в зависимости от модели
- [ ] AC-013-2: reservedForResponse резервирует 1024 токена для ответа
- [ ] AC-013-3: Priority pruning: long-term memory -> KB chunks -> старые tool results -> ранняя история (summarize)
- [ ] AC-013-4: System prompt никогда не обрезается
- [ ] AC-013-5: Summarization вместо удаления при обрезке истории диалога

---

### FR-014: Telegram Integration -- Bot

**Описание:** Система должна предоставлять Telegram Bot (grammY) для команд osaI, уведомлений и чата.

**Обоснование:** ANALYSIS.md, раздел 2.1 (домен Telegram Integration); SPEC, раздел 7.2. MVP-канал для доступа к osaI.

**Критерии приёмки:**
- [ ] AC-014-1: Telegram Bot обрабатывает команды: /chat, /memory, /status, /help
- [ ] AC-014-2: Bot отправляет permission requests, task completion notifications, errors
- [ ] AC-014-3: Bot поддерживает привязку к конкретному osaI-чату
- [ ] AC-014-4: Доступ к боту ограничен allowedUsers whitelist

---

### FR-015: Telegram Integration -- Userbot

**Описание:** Система должна предоставлять Telegram Userbot (Telethon) для работы от имени пользователя: чтение/отправка сообщений, ожидание ответов.

**Обоснование:** ANALYSIS.md, раздел 2.1 (домен Telegram Integration); SPEC, раздел 7.3. Ключевая возможность osaI v3.

**Критерии приёмки:**
- [ ] AC-015-1: Userbot работает как отдельный Python microservice через child_process
- [ ] AC-015-2: Userbot может читать входящие сообщения в личных чатах и группах
- [ ] AC-015-3: Userbot может отправлять сообщения от имени пользователя
- [ ] AC-015-4: Userbot может ожидать ответа конкретного пользователя и реагировать
- [ ] AC-015-5: Session хранения: `~/.osai/channels/telegram/session/` (encrypted)
- [ ] AC-015-6: Инициализация: пользователь вводит phone + code авторизации через CLI
- [ ] AC-015-7: Lifecycle management: start, stop, restart, health check через Node.js parent process

---

### FR-016: Telegram Mirror (двусторонний)

**Описание:** Система должна обеспечивать двустороннюю синхронизацию между osaI-чатом и Telegram-чатом/каналом.

**Обоснование:** ANALYSIS.md, раздел 3.1 (индикатор успеха: двусторонняя синхронизация); SPEC, раздел 7.4. Ключевое требование MVP.

**Критерии приёмки:**
- [ ] AC-016-1: Сообщения из osaI -> Telegram доставляются без потери
- [ ] AC-016-2: Сообщения из Telegram -> osaI доставляются без потери
- [ ] AC-016-3: Mirror привязан к конкретному osaI-чату
- [ ] AC-016-4: Markdown-форматирование сохраняется при зеркалировании
- [ ] AC-016-5: Медиа (изображения, документы, голосовые) зеркалируются
- [ ] AC-016-6: Hook `on_mirror_message` вызывается при каждом зеркалировании
- [ ] AC-016-7: Mirror direction конфигурируется: both | osai-to-tg | tg-to-osai

---

### FR-017: Voice Stack -- STT

**Описание:** Система должна предоставлять Speech-to-Text через отдельные локальные процессы (whisper.cpp) с fallback на Yandex SpeechKit.

**Обоснование:** ANALYSIS.md, раздел 6.1 (R3: Ollama НЕ поддерживает STT/TTS напрямую); раздел 9.3 (whisper.cpp как отдельный процесс). Критическая корректировка спецификации.

**Критерии приёмки:**
- [ ] AC-017-1: Primary STT: whisper.cpp запускается как отдельный процесс, вызывается через child_process
- [ ] AC-017-2: Fallback STT: Yandex SpeechKit (cloud, требует интернета)
- [ ] AC-017-3: STT поддерживает русский и английский языки
- [ ] AC-017-4: Auto-detection языка при STT
- [ ] AC-017-5: При недоступности whisper.cpp система переключается на Yandex

---

### FR-018: Voice Stack -- TTS

**Описание:** Система должна предоставлять Text-to-Speech через отдельные локальные процессы (Piper TTS) с fallback на Yandex SpeechKit.

**Обоснование:** ANALYSIS.md, раздел 6.1 (R3: Ollama НЕ поддерживает STT/TTS напрямую); раздел 9.3 (Piper как отдельный процесс). Критическая корректировка спецификации.

**Критерии приёмки:**
- [ ] AC-018-1: Primary TTS: Piper TTS запускается как отдельный процесс, вызывается через child_process
- [ ] AC-018-2: Fallback TTS: Yandex SpeechKit (cloud, требует интернета)
- [ ] AC-018-3: TTS поддерживает русский язык
- [ ] AC-018-4: Выбор TTS-провайдера конфигурируется в openclaw.json

---

### FR-019: CLI Client

**Описание:** Система должна предоставлять интерактивный CLI-клиент с TUI (terminal UI) и набором команд для управления.

**Обоснование:** ANALYSIS.md, раздел 2.1 (домен CLI Client); SPEC, раздел 11.2. Primary интерфейс для MVP.

**Критерии приёмки:**
- [ ] AC-019-1: `osai` -- запускает интерактивный чат в текущем чате
- [ ] AC-019-2: `osai "команда"` -- быстрое выполнение команды
- [ ] AC-019-3: Chat management: chat list, chat create, chat switch, chat delete
- [ ] AC-019-4: Session commands: session list, session resume
- [ ] AC-019-5: Config, skills, memory, channel, status команды
- [ ] AC-019-6: TUI отображает: список чатов, область чата, статус-бар с текущим чатом, моделью, tokens, cost

---

### FR-020: OS Integration -- Notifications и System Info

**Описание:** Система должна отправлять desktop notifications и предоставлять системную информацию. Linux и Windows.

**Обоснование:** ANALYSIS.md, раздел 2.1 (домен OS Integration); SPEC, раздел 6.1. MVP-требование для osaI-specific интеграции.

**Критерии приёмки:**
- [ ] AC-020-1: Desktop notifications работают на Linux (libnotify / D-Bus)
- [ ] AC-020-2: Desktop notifications работают на Windows (Toast Notifications)
- [ ] AC-020-3: Notifications используются для permission requests, task completion, errors
- [ ] AC-020-4: get_system_info возвращает CPU, memory, disk информацию на Linux и Windows
- [ ] AC-020-5: list_processes возвращает список запущенных процессов с фильтрацией

---

### FR-021: OS Integration -- System Tray

**Описание:** Система должна предоставлять system tray иконку со статусом и меню на Linux и Windows.

**Обоснование:** SPEC, раздел 6.2; PROJECT_PROFILE.md, V1 scope. Требуется для удобства управления.

**Критерии приёмки:**
- [ ] AC-021-1: System tray иконка отображается на Linux (libappindicator/ayatana)
- [ ] AC-021-2: System tray иконка отображается на Windows (native)
- [ ] AC-021-3: Tray меню содержит: Open Chat, Chats..., Memory, Skills, Status, Quit
- [ ] AC-021-4: Tray показывает текущий статус: Active/Error, текущую модель, количество чатов

---

### FR-022: Security -- 7-Layer Model

**Описание:** Система должна реализовать 7-уровневую модель безопасности: Network, Sandbox, Permissions, File Sandbox, Shell Security, Telegram Security, Audit.

**Обоснование:** ANALYSIS.md, раздел 3.1 (индикатор успеха: 7 слоёв); SPEC, раздел 10.1. Критическое требование для безопасного OS-ассистента.

**Критерии приёмки:**
- [ ] AC-022-1: Layer 1 (Network): WS только на localhost (127.0.0.1:18789)
- [ ] AC-022-2: Layer 2 (Sandbox): Docker containers для non-main sessions (когда Docker доступен)
- [ ] AC-022-3: Layer 3 (Permissions): category-based permission prompts (read=auto, write=confirm, exec=confirm)
- [ ] AC-022-4: Layer 4 (File Sandbox): allowed_dirs whitelist + blocked_patterns + symlink resolution
- [ ] AC-022-5: Layer 5 (Shell Security): blocked commands + timeout (120s) + command logging
- [ ] AC-022-6: Layer 6 (Telegram): allowedUsers whitelist для bot, encrypted session для userbot
- [ ] AC-022-7: Layer 7 (Audit): все действия логируются с trace_id

---

### FR-023: Audit Logging

**Описание:** Система должна логировать все действия агента (tool calls, permission requests, file access) в audit log с trace_id.

**Обоснование:** SPEC, раздел 9.3; ANALYSIS.md, раздел 3.1. Необходим для безопасности и отладки.

**Критерии приёмки:**
- [ ] AC-023-1: Audit log хранится в SQLite таблице `osai_audit_log`
- [ ] AC-023-2: Каждая запись содержит: session_id, chat_id, timestamp, trace_id, action, tool_name, skill_name, params, result, user_decision, risk_level
- [ ] AC-023-3: Audit log доступен через CLI и REST API
- [ ] AC-023-4: Trace ID связывает audit записи с OpenTelemetry traces

---

### FR-024: Structured Logging

**Описание:** Система должна использовать structured JSON logging (pino) с поддержкой лог-уровней и correlation IDs.

**Обоснование:** SPEC, раздел 9.1; PROJECT_PROFILE.md (Infrastructure). Стандарт observability.

**Критерии приёмки:**
- [ ] AC-024-1: Логи выводятся в формате structured JSON
- [ ] AC-024-2: Поддерживаются уровни: error, warn, info, debug, trace
- [ ] AC-024-3: Correlation ID связывает логи с traces
- [ ] AC-024-4: Логи пишутся в stdout (dev) и файл (~/.osai/logs/)

---

### FR-025: Configuration

**Описание:** Система должна конфигурироваться через единичный JSON-файл (openclaw.json) с поддержкой всех компонентов.

**Обоснование:** SPEC, раздел 15.1 (структура ~/.osai/); PROJECT_PROFILE.md. Local-first -- конфигурация на машине пользователя.

**Критерии приёмки:**
- [ ] AC-025-1: Все настройки хранятся в openclaw.json (или osai.json)
- [ ] AC-025-2: Пример конфигурационного файла предоставляется (openclaw.json.example)
- [ ] AC-025-3: Конфигурация покрывает: LLM providers, failover chain, channels, skills, memory, security, voice
- [ ] AC-025-4: `osai init` создаёт ~/.osai/ с конфигурацией по умолчанию

---

### FR-026: Daemon Management

**Описание:** Система должна запускаться как фоновый daemon (service) на Linux и Windows.

**Обоснование:** SPEC, раздел 15.3. Необходим для постоянного доступа через Telegram и background tasks.

**Критерии приёмки:**
- [ ] AC-026-1: На Linux: systemd --user service для управления демоном
- [ ] AC-026-2: На Windows: Windows Service через node-windows для управления демоном
- [ ] AC-026-3: `osai start` запускает daemon, `osai stop` останавливает
- [ ] AC-026-4: Daemon автоматически перезапускается при крахе

---

### FR-027: OpenClaw Upstream Compatibility

**Описание:** Система должна быть совместимой с OpenClaw upstream, если таковой существует и доступен для форка.

**Обоснование:** ANALYSIS.md, раздел 6.1 (R2: OpenClaw не найден); SPEC, раздел 1.3 (наследование). Критическое предположение проекта.

**Критерии приёмки:**
- [ ] AC-027-1: Если OpenClaw upstream существует -- форк создаётся из его репозитория
- [ ] AC-027-2: Если OpenClaw upstream НЕ существует -- core разрабатывается самостоятельно с совместимым API
- [ ] AC-027-3: Upstream изменения интегрируются через отдельную fork branch
- [ ] AC-027-4: Pin version upstream для предотвращения breaking changes

---

### FR-028: Z.ai Provider Compatibility

**Описание:** Система должна поддерживать Z.ai как primary LLM-провайдер через OpenAI-совместимый API, с configurable base URL.

**Обоснование:** ANALYSIS.md, раздел 6.1 (R1: Z.ai не найден); SPEC, раздел 13.2. Поскольку Z.ai использует OpenAI-совместимый API, требование может быть удовлетворено через конфигурируемый OpenAI adapter.

**Критерии приёмки:**
- [ ] AC-028-1: Z.ai provider использует OpenAI-совместимый API adapter с configurable base URL
- [ ] AC-028-2: Если Z.ai не существует -- пользователь может указать любой OpenAI-совместимый endpoint
- [ ] AC-028-3: Поддерживаются: model inference, streaming, tool/function calling
- [ ] AC-028-4: Auth: API key через конфигурацию

---

### FR-029: Cross-Platform Support

**Описание:** Система должна работать на Linux (primary) и Windows 10/11 (native, не только WSL).

**Обоснование:** ANALYSIS.md, раздел 2.3 (целевые платформы); PROJECT_PROFILE.md. Расширение аудитории.

**Критерии приёмки:**
- [ ] AC-029-1: Все MVP-функции работают на Linux
- [ ] AC-029-2: Все MVP-функции работают на Windows 10/11 (native)
- [ ] AC-029-3: Native modules (better-sqlite3, systray2) собираются и работают на обеих платформах
- [ ] AC-029-4: macOS НЕ является целевой платформой

---

---

## 3. Non-Functional Requirements

### 3.1 Performance

**NFR-P01:** Время отклика LLM в agent loop
- **Описание:** Задержка от отправки запроса пользователем до начала streaming ответа должна быть минимальной и зависеть только от LLM-провайдера
- **Измерение:** Time-to-first-token (TTFT) <= 500ms overhead сверх LLM latency
- **Приоритет:** Should

**NFR-P02:** Время RAG-запроса
- **Описание:** Семантический поиск по памяти и KB должен выполняться быстро
- **Измерение:** RAG query duration <= 200ms для до 10 000 записей (sqlite-vec)
- **Приоритет:** Should

**NFR-P03:** Context window management overhead
- **Описание:** Управление контекстом не должно значительно увеличивать задержку
- **Измерение:** Context pruning + summarization overhead <= 100ms
- **Приоритет:** Nice

### 3.2 Reliability and Availability

**NFR-R01:** LLM Failover reliability
- **Описание:** При недоступности одного провайдера система должна автоматически переключиться на следующего в цепочке
- **Измерение:** Time to failover <= 10s (включая таймаут текущего провайдера)
- **Приоритет:** Must

**NFR-R02:** Data persistence
- **Описание:** Все пользовательские данные (чаты, память, KB) должны сохраняться и восстанавливаться после перезапуска
- **Измерение:** Zero data loss при graceful shutdown; < 1s data loss при crash (SQLite WAL mode)
- **Приоритет:** Must

**NFR-R03:** Graceful degradation
- **Описание:** При недоступности внешних зависимостей система должна деградировать корректно
- **Измерение:** При недоступности всех cloud LLM -- Ollama работает; при недоступности Ollama -- CLI и чаты доступны (без LLM); при недоступности vector storage -- система работает без RAG
- **Приоритет:** Must

**NFR-R04:** Telegram mirror reliability
- **Описание:** Mirror не должен терять сообщения при нормальных условиях
- **Измерение:** 100% delivery для текстовых сообщений; best-effort для медиа
- **Приоритет:** Should

**NFR-R05:** Circuit breaker correctness
- **Описание:** Circuit breaker должен корректно изолировать недоступные провайдеры и восстанавливать их после reset timeout
- **Измерение:** После reset_timeout провайдер проверяется пробным запросом; при успехе -- возвращается в цепочку
- **Приоритет:** Must

### 3.3 Security and Privacy

**NFR-S01:** Data locality
- **Описание:** Все пользовательские данные хранятся исключительно на локальной машине
- **Измерение:** Аудит сетевого трафика: никакие пользовательские данные (чаты, память, KB) не отправляются, кроме: (a) запросов к LLM API, (b) embedding API, (c) voice API
- **Приоритет:** Must

**NFR-S02:** Telegram userbot session security
- **Описание:** Session данные Telethon (string session, auth keys) должны храниться в зашифрованном виде
- **Измерение:** Файлы в ~/.osai/channels/telegram/session/ зашифрованы (AES-256 или эквивалент)
- **Приоритет:** Must

**NFR-S03:** API key protection
- **Описание:** API ключи LLM-провайдеров хранятся в конфигурационном файле с ограниченными правами доступа
- **Измерение:** openclaw.json имеет права доступа 600 (owner read/write only)
- **Приоритет:** Must

**NFR-S04:** Sandbox isolation
- **Описание:** Код, выполняемый в Docker sandbox, не должен иметь доступа к host-системе
- **Измерение:** Docker container не имеет доступа к host filesystem, network (кроме configured), privileged operations
- **Приоритет:** Must

### 3.4 Scalability

**NFR-SC01:** Chat limit
- **Описание:** Система поддерживает до 20 активных чатов
- **Измерение:** 20 активных чатов с ~100 сообщениями каждый работают без деградации производительности
- **Приоритет:** Must

**NFR-SC02:** Memory storage
- **Описание:** Long-term memory должна масштабироваться до десятков тысяч записей
- **Измерение:** 50 000 записей в vector storage; RAG query <= 500ms
- **Приоритет:** Should

**NFR-SC03:** Knowledge Base size
- **Описание:** Knowledge base должна обрабатывать сотни документов
- **Измерение:** 500 документов по 100KB каждый; ingest pipeline <= 30s; search <= 500ms
- **Приоритет:** Should

### 3.5 Usability

**NFR-U01:** Installation simplicity
- **Описание:** Установка системы должна быть максимально простой
- **Измерение:** Установка через npm + `osai init` -- не более 3 шагов для базовой настройки
- **Приоритет:** Should

**NFR-U02:** CLI responsiveness
- **Описание:** CLI должен отзываться мгновенно на пользовательский ввод
- **Измерение:** CLI input latency <= 50ms; TUI rendering без видимых задержек (>= 30 FPS)
- **Приоритет:** Should

**NFR-U03:** Error clarity
- **Описание:** Ошибки системы должны быть понятны пользователю
- **Измерение:** Каждая ошибка содержит: описание проблемы, возможную причину, рекомендуемое действие
- **Приоритет:** Should

### 3.6 Maintainability

**NFR-M01:** TypeScript strict mode
- **Описание:** Весь код написан в TypeScript strict mode
- **Измерение:** tsconfig.json содержит `"strict": true`; CI не пропускает ts-ошибки
- **Приоритет:** Must

**NFR-M02:** Testing coverage
- **Описание:** Критичные модули покрыты unit + integration тестами
- **Измерение:** Unit tests для всех packages; integration tests для cross-module взаимодействия; E2E tests для критичных сценариев
- **Приоритет:** Must

**NFR-M03:** Modularity
- **Описание:** Каждый домен реализован в отдельном package monorepo
- **Измерение:** pnpm workspace structure; каждый package имеет свой package.json, tsconfig.json; минимальные cross-package зависимости
- **Приоритет:** Must

**NFR-M04:** Hook extensibility
- **Описание:** Поведение системы расширяемо через hook points без модификации core кода
- **Измерение:** Новые hooks могут быть зарегистрированы через конфигурацию; не требуется изменение core пакетов для добавления кастомных hooks
- **Приоритет:** Should

### 3.7 Observability

**NFR-O01:** Structured logging
- **Описание:** Все логи в structured JSON формате (pino) с корреляционными ID
- **Измерение:** Каждый log entry содержит timestamp, level, message, trace_id (при наличии), module
- **Приоритет:** Must

**NFR-O02:** OpenTelemetry traces
- **Описание:** Ключевые операции трассируются через OpenTelemetry
- **Измерение:** Agent loop, model calls, tool executions, memory queries, chat switches -- как отдельные spans с parent-child связями
- **Приоритет:** Should

**NFR-O03:** Metrics
- **Описание:** Система собирает ключевые метрики для мониторинга
- **Измерение:** Счётчики: tool calls, tokens, errors; гистограммы: durations; gauge: active chats, memory entries
- **Приоритет:** Should

**NFR-O04:** Audit completeness
- **Описание:** Все действия агента логируются в audit log
- **Измерение:** 100% tool calls, permission requests, file access operations записываются в audit log
- **Приоритет:** Must

---

## 4. External Interfaces

### 4.1 Внешние системы

| Система | Тип взаимодействия | Назначение | Критичность |
|---|---|---|---|
| Z.ai (OpenAI-совместимый) | REST API (HTTPS) | Primary LLM-провайдер | High -- primary |
| Yandex Foundation Models | REST API (HTTPS) | LLM + Embeddings + STT/TTS fallback | High -- fallback 1 |
| Anthropic Claude | REST API (HTTPS) | LLM fallback 2 | Medium |
| OpenAI GPT | REST API (HTTPS) | LLM fallback 3 | Medium |
| Ollama | REST API (HTTP, localhost) | Local LLM + embeddings | High -- local fallback |
| Telegram Bot API | HTTPS (polling/webhook) | Бот | High -- MVP |
| Telegram MTProto | MTProto (TCP) | Userbot | High -- MVP |
| whisper.cpp | child_process (CLI) | Local STT | Medium -- voice |
| Piper TTS | child_process (CLI) | Local TTS | Medium -- voice |
| Docker Engine | REST API (Unix socket) | Sandbox для non-main sessions | Medium |

### 4.2 Концептуальные API

**WebSocket Protocol (Gateway):**
- Client -> Gateway: message, command, permission_response, subscribe
- Gateway -> Client: tool_stream, block, permission_request

**REST API (osaI extensions):**
- /api/v1/chats -- CRUD для чатов
- /api/v1/memory -- store, search, delete
- /api/v1/kb -- ingest, search, sources
- /api/v1/observability -- traces, metrics, audit
- /api/v1/os -- notification, system-info, processes, watch
- /api/v1/telegram -- status, mirror
- /api/v1/voice -- stt, tts
- /api/v1/skills -- list, detail, enable, disable

### 4.3 User Interaction Points

| Точка | Тип | Платформа |
|---|---|---|
| CLI + TUI | Terminal interface | Linux, Windows |
| Telegram Bot | Messenger bot | Любой (через Telegram) |
| Telegram Userbot | Acting as user in Telegram | Любой (через Telegram) |
| System Tray | Desktop tray icon | Linux, Windows |
| Desktop Notifications | OS notifications | Linux, Windows |
| Web Dashboard (V1) | Browser | Любой |

---

## 5. Data Considerations

### 5.1 Типы данных

| Тип данных | Чувствительность | Хранение | Комментарий |
|---|---|---|---|
| Chat messages | Medium | SQLite, local | Пользовательские диалоги |
| Long-term memory | Medium | SQLite + vector storage, local | Факты, предпочтения, знания |
| Knowledge base | Low-Medium | SQLite + vector storage, local | Пользовательские документы |
| Telegram session | High | Encrypted file, local | Auth keys для userbot |
| API keys | High | Config file (600 perms), local | Ключи LLM-провайдеров |
| Audit log | Medium | SQLite, local | Все действия агента |
| System config | Medium | JSON file, local | Конфигурация системы |

### 5.2 Compliance

- Нет целевых compliance-требований (GDPR, HIPAA и т.д.) для MVP
- Данные не покидают локальную машину (за исключением LLM API запросов)
- Пользователь несёт ответственность за содержание отправляемых LLM-запросов

### 5.3 Data Lifecycle

- **Создание:** Пользовательские данные создаются при взаимодействии с osaI
- **Хранение:** Постоянное хранение в ~/.osai/ (SQLite + файлы)
- **Обновление:** При каждом взаимодействии (новые сообщения, факты, память)
- **Удаление:** Удаление чата удаляет его локальные данные; forget() для long-term memory; remove_source для KB
- **Архивирование:** Неактивные чаты архивируются (освобождая лимит активных)

---

## 6. Assumptions

| # | Предположение | Уровень доверия | Влияние при ошибке |
|---|---|---|---|
| AS-01 | OpenClaw upstream НЕ существует как реальный проект (верифицировано ANALYSIS.md) | **85%** | Core система должна разрабатываться самостоятельно. Стратегия форка заменяется на самостоятельную разработку с совместимым API |
| AS-02 | Z.ai НЕ существует как реальный LLM-провайдер (верифицировано ANALYSIS.md) | **85%** | Z.ai provider реализуется как OpenAI-совместимый adapter с configurable base URL. Пользователь может указать любой OpenAI-совместимый endpoint (OpenRouter, Groq и т.д.) |
| AS-03 | Ollama НЕ поддерживает STT/TTS напрямую (верифицировано ANALYSIS.md) | **95%** | Voice stack использует whisper.cpp + Piper TTS как отдельные процессы через child_process. Ollama используется только для LLM и embeddings |
| AS-04 | Qdrant НЕ имеет embedded mode для Node.js (верифицировано ANALYSIS.md) | **95%** | Primary vector storage -- sqlite-vec (embedded). Qdrant -- optional external server через REST client |
| AS-05 | Yandex Foundation Models API доступен и включает LLM + Embeddings + STT/TTS | **80%** | При недоступности Yandex -- удаление из failover chain. Cloud voice fallback недоступен |
| AS-06 | Anthropic Claude API стабилен и имеет TypeScript SDK | **95%** | Минимальное влияние -- fallback 2, легко заменяемый |
| AS-07 | OpenAI GPT API стабилен и OpenAI-совместимый | **98%** | Минимальное влияние -- fallback 3, стандарт de-facto |
| AS-08 | Ollama поддерживает nomic-embed-text для embeddings | **90%** | При отсутствии -- fallback на Yandex embeddings или ONNX |
| AS-09 | better-sqlite3 работает стабильно на Linux и Windows | **85%** | Критическое влияние -- основная БД. Prebuild binaries доступны для обеих платформ |
| AS-10 | sqlite-vec работает с better-sqlite3 на Linux и Windows | **70%** | При отсутствии -- fallback на Qdrant server или Orama (in-process vector search) |
| AS-11 | whisper.cpp можно вызвать через child_process из Node.js | **85%** | При отсутствии -- ONNX whisper.js через Transformers.js (медленнее) |
| AS-12 | Piper TTS можно вызвать через child_process из Node.js | **80%** | При отсутствии -- Yandex SpeechKit как единственный TTS-провайдер |
| AS-13 | Solo developer -- один разработчик на проекте | **90%** | Влияет на скорость разработки, но не на требования |
| AS-14 | Node.js 22.16+ LTS / 24 установлен на целевых машинах | **95%** | Требуется для запуска osaI. Указано в документации |
| AS-15 | Docker доступен на целевых машинах для sandbox | **70%** | При отсутствии -- sandbox режим недоступен. Система работает без Docker, но без изоляции |
| AS-16 | Ollama установлен на целевой машине для локальных LLM/embeddings | **65%** | При отсутствии -- cloud LLM провайдеры обязательны. Offline-режим невозможен |
| AS-17 | grammY -- зрелый TypeScript Telegram Bot фреймворк | **95%** | Минимальное влияние -- подтверждённый проект |
| AS-18 | Telethon -- лучший Python клиент для Telegram userbot | **90%** | При запрете Telegram -- userbot недоступен. Bot mode работает |
| AS-19 | Модель данных OpenClaw (если существует) совместима с описанной в спецификации | **20%** | При несовместимости -- адаптация модели данных |
| AS-20 | Пользователь не будет использовать osaI для критических производственных задач в MVP | **75%** | MVP не предназначен для production-critical сценариев |

---

## 7. Open Questions

| # | Вопрос | Статус | Примечание |
|---|---|---|---|
| OQ-01 | Какой конкретный OpenAI-совместимый endpoint использовать как Z.ai placeholder? | Открыт | Требуется решение архитектора. Варианты: OpenRouter, Groq, Fireworks AI, или любой custom endpoint |
| OQ-02 | Требуется ли поддержка русского языка для STT/TTS в MVP? | Открыт | Whisper.cpp поддерживает RU. Piper TTS имеет модели для RU. Yandex SpeechKit -- RU + EN нативно |
| OQ-03 | Какие конкретные модели Ollama использовать по умолчанию для LLM? | Открыт | Спецификация указывает "llama3", но не конкретную версию. Требуется выбор: llama3, llama3.1, llama3.2, mistral, qwen |
| OQ-04 | Как управлять Python microservice для Telethon (версия Python, venv, lifecycle)? | Открыт | Требуется решение: Python 3.11+/3.12+, venv/pip, stdio/HTTP bridge, health check |
| OQ-05 | Какова политика обработки медиа в Telegram mirror (фото, видео, документы)? | Открыт | Требуется уточнение: размер лимиты, формат конвертации, кэширование |
| OQ-06 | Требуется ли поддержка Voice Activity Detection (VAD) в MVP? | Открыт | Спецификация упоминает VAD в Voice Manager, но это V1-scope |
| OQ-07 | Каков целевой порог производительности для RAG-запросов на больших объёмах? | Открыт | NFR-P02 задаёт <= 200ms для 10K записей. Для 50K+ требуется измерение |

---

## 8. Corrections to Specification

Следующие корректировки внесены на основе результатов ANALYSIS.md (раздел 9.2 -- расхождения между спецификацией и реальностью):

| Аспект в спецификации | Реальность | Корректировка в требованиях |
|---|---|---|
| "Ollama Whisper" для STT | Ollama НЕ поддерживает Whisper | FR-017: whisper.cpp как отдельный процесс |
| "Ollama Piper TTS" для TTS | Ollama НЕ поддерживает Piper | FR-018: Piper TTS как отдельный процесс |
| "Qdrant embedded" для Node.js | Qdrant НЕ имеет embedded mode | FR-010: sqlite-vec primary, Qdrant optional |
| "Z.ai primary LLM" | Z.ai НЕ найден | FR-028: OpenAI-совместимый adapter с configurable URL |
| "OpenClaw 100k+ stars" | OpenClaw НЕ найден | FR-027: условная совместимость, самостоятельная разработка |

---

**Версия документа:** v1.0
**Дата создания:** 2026-03-30
**Автор:** System Analyst Agent
**Статус:** Завершён
