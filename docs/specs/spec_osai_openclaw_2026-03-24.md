# Техническое задание: osaI — Operation System AI v2 (на базе OpenClaw)

## Метаданные

- **Дата создания**: 2026-03-24
- **Автор**: Aristman
- **Статус**: Черновик
- **Версия**: 2.0
- **Тип проекта**: Fork/Extension существующей системы (OpenClaw)
- **Основан на**: [OpenClaw](https://github.com/openclaw/openclaw) by Peter Steinberger

---

## 1. Обзор

### 1.1 Цель

Разработать AI Operating System (osaI) на базе OpenClaw — open-source personal AI assistant. osaI расширяет OpenClaw от персонального ассистента до полноценного AI-слоя управления системой: файлы, браузер, shell, API, приложения, мессенджеры.

OpenClaw предоставляет:
- Зрелую Gateway-архитектуру (WebSocket control plane)
- Agent runtime с hook-based extensibility
- Skills-систему (SKILL.md based)
- Multi-channel messaging (WhatsApp, Telegram, Slack, Discord, Signal, iMessage, 20+)
- Session model с изоляцией и persistence
- Canvas + A2UI (agent-driven visual workspace)
- Device node pairing (macOS/iOS/Android)
- Docker sandboxing
- Voice Wake + Talk Mode
- Model failover

osaI добавляет:
- Desktop OS интеграцию (systemd, tray, file watchers)
- OS-native инструменты (file system deep integration, process management)
- Структурированную память с RAG (SQLite + Qdrant)
- Продвинутое observability (OpenTelemetry)
- Desktop UI (system tray notification, native file dialogs)
- Plugin/extension marketplace

### 1.2 Контекст

OpenClaw уже решает 80% задач персонального AI-ассистента. Вместо reimplement с нуля на Rust (v1 спецификация), мы форкаем OpenClaw и расширяем его до AI OS. Это даёт:

- Готовую agent runtime с hooks
- 20+ мессенджер-каналов из коробки
- Canvas/A2UI визуальную рабочую область
- За проверенное сообщество и экосистему (ClawHub skills registry)
- TypeScript/Node.js стек — быстрая разработка, огромное количество библиотек

### 1.3 Ключевые принципы

| Принцип | Описание | Наследовано от OpenClaw |
|---------|----------|----------------------|
| Intent execution | Агент действует, а не отвечает текстом | + |
| Local-first | Данные и ядро на машине пользователя | + |
| Gateway-centric | Единый WS control plane для всех клиентов | + |
| Hook-based extensibility |before_model_resolve, before_tool_call, after_tool_call | + |
| Skills-first | Все возможности через skills (SKILL.md) | + |
| Multi-channel | Доступ через мессенджеры, CLI, UI | + |
| Observable | Каждый шаг трейсируется | + |
| Secure | Docker sandbox + permission prompts | + |
| OS-integrated | Системные tray, notifications, file watchers | osaI |
| Deep memory | Структурированная долговременная память с RAG | osaI |
| Plugin marketplace | Расширения через ClawHub + osaI plugins | osaI |

### 1.4 Сравнение osaI v1 (Rust) vs osaI v2 (OpenClaw)

| Аспект | v1 (Rust с нуля) | v2 (OpenClaw-based) |
|--------|-------------------|---------------------|
| Стартовая позиция | 0 строк кода | ~50k+ строк проверенного кода |
| Agent loop | Реализовывать с нуля | Готовый (intake → context → inference → tools → stream → persist) |
| Мессенджеры | Нет | 20+ каналов из коробки |
| Skills | Нет | ClawHub registry, bundled/managed/workspace skills |
| Canvas/A2UI | Нет | Готовая визуальная рабочая область |
| Voice | Нет | Wake + Talk Mode (ElevenLabs + system TTS) |
| Device nodes | Нет | macOS/iOS/Android pairing |
| Язык | Rust | TypeScript/Node.js |
| Производительность | Выше (native) | Достаточно (V8 + libuv) |
| Скорость разработки | Медленнее | Значительно быстрее |
| Экосистема | Меньше | Огромная (npm) |
| Desktop интеграция | Нативная | Через Node.js native modules |

---

## 2. Высокоуровневая архитектура

### 2.1 Архитектура на основе OpenClaw Gateway

```
┌─────────────────────────────────────────────────────────────────────┐
│                         osaI / OpenClaw                             │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                    GATEWAY (WS Control Plane)                 │  │
│  │              ws://127.0.0.1:18789 (default)                  │  │
│  │                                                              │  │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌───────────────┐  │  │
│  │  │ Channel   │ │ Channel  │ │ Channel  │ │  CLI Client   │  │  │
│  │  │ WhatsApp │ │ Telegram │ │ Slack    │ │  (osai)       │  │  │
│  │  │ Baileys  │ │ grammY   │ │ Bolt     │ │               │  │  │
│  │  └────┬─────┘ └────┬─────┘ └────┬─────┘ └──────┬────────┘  │  │
│  │       │            │            │               │            │  │
│  │  ┌────┴────────────┴────────────┴───────────────┴────────┐   │  │
│  │  │              Session Router / Queue                    │   │  │
│  │  │  ┌─────────┐  ┌──────────┐  ┌───────────────────┐    │   │  │
│  │  │  │  Main   │  │  Group   │  │  Activation Mode  │    │   │  │
│  │  │  │ Session │  │ Isolated │  │  (wake, passive)  │    │   │  │
│  │  │  └─────────┘  └──────────┘  └───────────────────┘    │   │  │
│  │  └────────────────────────┬──────────────────────────────┘   │  │
│  └───────────────────────────┼──────────────────────────────────┘  │
│                              │                                     │
│  ┌───────────────────────────▼──────────────────────────────────┐  │
│  │                    PI AGENT RUNTIME (RPC)                     │  │
│  │                                                              │  │
│  │  ┌────────────────────────────────────────────────────────┐  │  │
│  │  │                    AGENT LOOP                          │  │  │
│  │  │                                                        │  │  │
│  │  │  intake → context_assembly → model_inference →         │  │  │
│  │  │  tool_execution → streaming → persistence              │  │  │
│  │  │                                                        │  │  │
│  │  │  Hook points:                                          │  │  │
│  │  │  ├─ before_model_resolve                               │  │  │
│  │  │  ├─ before_prompt_build                                │  │  │
│  │  │  ├─ before_agent_start                                 │  │  │
│  │  │  ├─ before_tool_call                                   │  │  │
│  │  │  ├─ after_tool_call                                    │  │  │
│  │  │  ├─ agent_end                                          │  │  │
│  │  │  └─ on_error                                           │  │  │
│  │  └────────────────────────────────────────────────────────┘  │  │
│  │                                                              │  │
│  │  ┌──────────┐ ┌──────────────┐ ┌──────────────────────────┐  │  │
│  │  │  Skills  │ │ Model Config │ │  Session Persistence     │  │  │
│  │  │ Registry │ │ + Failover   │ │  (serialize/deserialize) │  │  │
│  │  └──────────┘ └──────────────┘ └──────────────────────────┘  │  │
│  └───────────────────────────┬──────────────────────────────────┘  │
│                              │                                     │
│  ┌───────────────────────────▼──────────────────────────────────┐  │
│  │                    TOOL / SKILL LAYER                        │  │
│  │                                                              │  │
│  │  ┌─────────────┐ ┌─────────────┐ ┌────────────────────────┐ │  │
│  │  │  Bundled    │ │  Managed    │ │  Workspace Skills      │ │  │
│  │  │  Skills     │ │  (ClawHub)  │ │  (~/.osai/workspace/   │ │  │
│  │  │  (built-in) │ │             │ │   skills/<name>/       │ │  │
│  │  │             │ │             │ │   SKILL.md)            │ │  │
│  │  └─────────────┘ └─────────────┘ └────────────────────────┘ │  │
│  └───────────────────────────┬──────────────────────────────────┘  │
│                              │                                     │
│  ┌───────────────────────────▼──────────────────────────────────┐  │
│  │               osaI EXTENSION LAYERS                          │  │
│  │                                                              │  │
│  │  ┌────────────────┐ ┌──────────────┐ ┌───────────────────┐  │  │
│  │  │ OS Integration │ │ Deep Memory  │ │ OpenTelemetry     │  │  │
│  │  │ ├─ System tray │ │ ├─ SQLite    │ │ ├─ Traces         │  │  │
│  │  │ ├─ File watch  │ │ ├─ Qdrant    │ │ ├─ Metrics        │  │  │
│  │  │ ├─ Desktop notif│ │ ├─ RAG      │ │ ├─ Logs           │  │  │
│  │  │ ├─ Process mgmt│ │ ├─ Embeddings│ │ └─ Dashboards     │  │  │
│  │  │ └─ Native dialogs│ │ └─ Auto-extract│                  │  │
│  │  └────────────────┘ └──────────────┘ └───────────────────┘  │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                    INFRASTRUCTURE                             │  │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌───────────────┐  │  │
│  │  │ SQLite   │ │ Docker   │ │ Tailscale│ │ Config        │  │  │
│  │  │ (data)   │ │ (sandbox)│ │ (remote) │ │ (~/.osai/)   │  │  │
│  │  └──────────┘ └──────────┘ └──────────┘ └───────────────┘  │  │
│  └──────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

### 2.2 Сравнение с альтернативами

| Аспект | Традиционная ОС | AI-ассистент (ChatGPT) | Claude Code | OpenClaw | osaI |
|--------|----------------|------------------------|-------------|----------|------|
| Интерфейс | GUI/CLI | Текстовый чат | CLI | Multi-channel (20+) | Multi-channel + OS-native |
| Действия | Пользователь | Нет | Только код | Файлы, браузер, API | + OS управление, процессы |
| Мессенджеры | Нет | Нет | Нет | WhatsApp, TG, Slack... | Все OpenClaw + |
| Память | FS | Контекст сессии | Контекст сессии | Сессии | + RAG + долгосрочная |
| Voice | Нет | Опционально | Нет | Wake + Talk Mode | Wake + Talk Mode |
| Устройства | Одно | Одно | Одно | Мульти-node pairing | Мульти-node |
| Observability | Системные логи | Нет | Логи CLI | Базовое | OpenTelemetry |

---

## 3. Ядро агента (Agent Core) — наследование OpenClaw

### 3.1 Agent Loop

osaI использует agent loop OpenClaw без изменений:

```
┌──────────────────────────────────────────────────────────────────┐
│                        AGENT LOOP                                │
│                                                                  │
│  ┌────────────┐                                                  │
│  │   INTAKE   │ ← Сообщение от канала (user message)            │
│  └─────┬──────┘                                                  │
│        │                                                         │
│        ▼                                                         │
│  ┌────────────────────┐                                          │
│  │ before_model_resolve│ → Выбор модели, auth profile            │
│  └─────┬──────────────┘                                          │
│        │                                                         │
│        ▼                                                         │
│  ┌────────────────────┐                                          │
│  │  CONTEXT ASSEMBLY  │ ← System prompt + Skills + Memory +      │
│  │                    │   History + Tool schemas                  │
│  └─────┬──────────────┘                                          │
│        │                                                         │
│        ▼                                                         │
│  ┌────────────────────┐                                          │
│  │ before_prompt_build│ → Модификация промпта (hooks)            │
│  └─────┬──────────────┘                                          │
│        │                                                         │
│        ▼                                                         │
│  ┌────────────────────┐                                          │
│  │  MODEL INFERENCE   │ → LLM вызов (streaming)                  │
│  │  (tool_use loop)   │ ← Если tool_calls:                      │
│  │                    │   before_tool_call → execute → after_tool_call │
│  └─────┬──────────────┘                                          │
│        │                                                         │
│        ▼                                                         │
│  ┌────────────────────┐                                          │
│  │   STREAMING        │ → Tool streaming + Block streaming        │
│  │   (WS → clients)   │ → TypeWriter effect в каналы             │
│  └─────┬──────────────┘                                          │
│        │                                                         │
│        ▼                                                         │
│  ┌────────────────────┐                                          │
│  │   PERSISTENCE      │ → Сохранение в SQLite                     │
│  │                    │ → Обновление session state               │
│  │                    │ → Memory extraction (osaI extension)      │
│  └────────────────────┘                                          │
│        │                                                         │
│        ▼                                                         │
│  ┌────────────────────┐                                          │
│  │   agent_end hook   │ → Post-processing, notifications         │
│  └────────────────────┘                                          │
└──────────────────────────────────────────────────────────────────┘
```

### 3.2 Hook Points

osaI наследует все hook points OpenClaw и добавляет osaI-specific:

| Hook | 来源 | Описание |
|------|------|----------|
| `before_model_resolve` | OpenClaw | Выбор модели, rotation auth profiles |
| `before_prompt_build` | OpenClaw | Модификация промпта перед отправкой |
| `before_agent_start` | OpenClaw | Инициализация перед запуском агента |
| `before_tool_call` | OpenClaw | Permission check, logging, sandbox verify |
| `after_tool_call` | OpenClaw | Result processing, metrics, memory store |
| `agent_end` | OpenClaw | Post-processing, cleanup, notifications |
| `on_error` | OpenClaw | Error handling, fallback logic |
| `before_memory_query` | **osaI** | RAG search before context assembly |
| `after_memory_extract` | **osaI** | Post-processing extracted facts |
| `on_file_access` | **osaI** | Audit + sandbox check for file ops |
| `on_desktop_notification` | **osaI** | System tray notification dispatch |

### 3.3 Session Model

osaI использует сессионную модель OpenClaw:

```
┌────────────────────────────────────────────────────┐
│                   SESSION MODEL                     │
│                                                     │
│  ┌─────────────┐                                    │
│  │ Main Session │  ← Direct 1:1 с пользователем     │
│  │ (persistent)│    Полная история, все tools       │
│  └─────────────┘                                    │
│                                                     │
│  ┌─────────────┐  ┌─────────────┐                  │
│  │ Group       │  │ Group       │  ← Изолированные │
│  │ Session A   │  │ Session B   │    сессии для     │
│  │ (isolated)  │  │ (isolated)  │    групп/контекстов│
│  └─────────────┘  └─────────────┘                  │
│                                                     │
│  Activation Modes:                                   │
│  ├─ Always: отвечает на все сообщения                │
│  ├─ Mention: только при @mention                    │
│  ├─ Wake Word: по ключевому слову                   │
│  └─ Passive: мониторит, не отвечает                 │
│                                                     │
│  Queue Modes:                                        │
│  ├─ Sequential: обрабатывает по очереди             │
│  └─ Parallel: параллельная обработка               │
│                                                     │
│  Persistence:                                        │
│  ├─ Sessions сериализуются в SQLite                 │
│  ├─ Session pruning при overflow                    │
│  └─ Resume после restart                            │
└────────────────────────────────────────────────────┘
```

### 3.4 Model Failover

Наследуется от OpenClaw:

```
┌──────────────────────────────────────────────┐
│              MODEL FAILOVER                   │
│                                               │
│  Request → Claude (primary)                   │
│              │                                │
│              ├─ 200 OK → response              │
│              │                                │
│              ├─ 429 Rate Limit → wait+retry   │
│              │                                │
│              ├─ 500 Error → GPT-4o (fallback) │
│              │              │                 │
│              │              ├─ OK → response  │
│              │              └─ Error → Ollama │
│              │                              │
│              └─ Timeout → Ollama (local)     │
│                              │               │
│                              └─ response     │
└──────────────────────────────────────────────┘
```

**Auth Profile Rotation**: несколько API-ключей для одного провайдера, автоматическая ротация при rate limit.

---

## 4. Skills-система

### 4.1 Обзор

osaI наследует skills-систему OpenClaw. Все возможности системы реализуются как skills — описания в формате SKILL.md, которые превращаются в tool_schemas для LLM.

**Типы skills:**

| Тип | Расположение | Описание |
|-----|-------------|----------|
| Bundled | Встроенные в osaI | Файловая система, shell, браузер, HTTP |
| Managed | ClawHub registry | Скачиваются через marketplace |
| Workspace | `~/.osai/workspace/skills/<name>/` | Пользовательские skills |
| osaI System | `~/.osai/skills/` | OS-специфичные (tray, processes, notifications) |

### 4.2 Структура SKILL.md

```markdown
# filesystem

Advanced file system operations: read, write, search, move, delete with sandbox enforcement.

## Tools

### read_file
Read file contents.
- **Parameters**: path (string, required), offset (number, optional), limit (number, optional)
- **Returns**: file content as string
- **Category**: read (auto-approve in sandbox)

### write_file
Write content to file.
- **Parameters**: path (string, required), content (string, required)
- **Returns**: success confirmation
- **Category**: write (requires confirmation)

### list_directory
List directory contents.
- **Parameters**: path (string, required), recursive (boolean, default: false)
- **Returns**: array of file/directory entries

### search_files
Search files by pattern.
- **Parameters**: pattern (string, required), path (string, optional), glob (boolean, default: false)
- **Returns**: matching file paths

### move_file
Move or rename file/directory.
- **Parameters**: from (string, required), to (string, required)
- **Category**: write (requires confirmation)

### delete_file
Delete file or directory.
- **Parameters**: path (string, required), recursive (boolean, default: false)
- **Category**: write (requires confirmation)

## Permissions

- All operations are sandboxed to allowed_dirs
- Read operations: auto-approved within sandbox
- Write/Delete operations: always require user confirmation
- Blocked patterns are never accessible (e.g., ~/.ssh, ~/.gnupg)

## Examples

User: "Read the contents of my notes about project planning"
→ read_file({ path: "~/notes/project-planning.md" })

User: "Move all PDF files from Downloads to Documents/PDFs"
→ list_directory({ path: "~/Downloads", glob: "*.pdf" })
→ [for each file] move_file({ from: "~/Downloads/file.pdf", to: "~/Documents/PDFs/file.pdf" })
```

### 4.3 osaI-specific Skills

#### 4.3.1 OS Integration Skill

```markdown
# os-integration

Desktop OS integration: system tray, desktop notifications, file watchers, process management.

## Tools

### show_notification
Show desktop notification.
- **Parameters**: title (string), body (string), urgency (string: "low"|"normal"|"critical")
- **Category**: system

### watch_directory
Start watching directory for changes.
- **Parameters**: path (string), events (array: "create"|"modify"|"delete")
- **Returns**: watcher_id

### list_processes
List running system processes.
- **Parameters**: filter (string, optional)
- **Returns**: array of process entries

### open_application
Launch desktop application.
- **Parameters**: app_name (string), args (array, optional)
- **Category**: execute (requires confirmation)

### get_system_info
Get system information (CPU, memory, disk).
- **Parameters**: none
- **Returns**: system stats object
```

#### 4.3.2 Memory Skill

```markdown
# memory

Long-term memory management: store, search, and retrieve knowledge across sessions.

## Tools

### remember
Store information in long-term memory.
- **Parameters**: content (string), category (string: "fact"|"preference"|"knowledge"|"error"), tags (array, optional)
- **Returns**: memory_id

### recall
Search long-term memory by semantic similarity.
- **Parameters**: query (string), top_k (number, default: 5), category (string, optional)
- **Returns**: array of relevant memories

### forget
Remove a specific memory entry.
- **Parameters**: memory_id (string)

### summarize_session
Summarize current session for long-term storage.
- **Parameters**: session_id (string, optional)
- **Returns**: summary with extracted facts
```

#### 4.3.3 Knowledge Base Skill

```markdown
# knowledge-base

Build and query personal knowledge bases from documents, notes, and web content.

## Tools

### ingest_document
Add document to knowledge base.
- **Parameters**: path (string), title (string, optional), tags (array, optional)
- **Returns**: document_id, chunks_count

### query_knowledge
Semantic search over knowledge base.
- **Parameters**: query (string), filters (object, optional), top_k (number, default: 10)
- **Returns**: relevant passages with sources

### list_sources
List all ingested sources.
- **Parameters**: tag (string, optional)

### remove_source
Remove document from knowledge base.
- **Parameters**: document_id (string)
```

### 4.4 Конфигурация skills

```jsonc
// ~/.osai/openclaw.json (расширение OpenClaw конфига)
{
  "skills": {
    "allowBundled": true,
    "extraDirs": [
      "~/.osai/workspace/skills",
      "~/.osai/skills"
    ],
    "watch": true,
    "entries": {
      "filesystem": { "enabled": true },
      "os-integration": { "enabled": true },
      "memory": { "enabled": true },
      "knowledge-base": { "enabled": true },
      "browser": { "enabled": true, "sandboxed": true },
      "shell": { "enabled": true, "timeout": 120 }
    }
  }
}
```

---

## 5. Среда выполнения (Execution Layer)

### 5.1 Runtime архитектура (наследование + расширения)

```
┌──────────────────────────────────────────────────────────┐
│                    osaI Runtime                          │
│                                                          │
│  ┌────────────────────────────────────────────────────┐  │
│  │              Gateway Process                        │  │
│  │  ┌──────────────────────────────────────────────┐  │  │
│  │  │  WS Server (127.0.0.1:18789)                │  │  │
│  │  │  ├─ Channel handlers (WhatsApp, TG, Slack...)│  │  │
│  │  │  ├─ Session router                           │  │  │
│  │  │  └─ Client connections (CLI, Canvas, nodes)  │  │  │
│  │  └──────────────────────────────────────────────┘  │  │
│  │                                                    │  │
│  │  ┌──────────────────────────────────────────────┐  │  │
│  │  │  Pi Agent Runtime (RPC)                      │  │  │
│  │  │  ├─ Agent loop engine                        │  │  │
│  │  │  ├─ Skills loader + executor                 │  │  │
│  │  │  ├─ Model resolver + failover               │  │  │
│  │  │  ├─ Tool streaming                           │  │  │
│  │  │  └─ Block streaming                          │  │  │
│  │  └──────────────────────────────────────────────┘  │  │
│  │                                                    │  │
│  │  ┌──────────────────────────────────────────────┐  │  │
│  │  │  osaI Extensions                             │  │  │
│  │  │  ├─ Memory Manager (RAG pipeline)            │  │  │
│  │  │  ├─ OS Integration Layer                     │  │  │
│  │  │  ├─ OpenTelemetry Collector                  │  │  │
│  │  │  └─ Desktop Notifications                    │  │  │
│  │  └──────────────────────────────────────────────┘  │  │
│  └────────────────────────────────────────────────────┘  │
│                                                          │
│  ┌────────────────────────────────────────────────────┐  │
│  │              Sandbox (Docker)                       │  │
│  │  ├─ Non-main sessions → isolated containers        │  │
│  │  ├─ Allowlist/denylist for tool access             │  │
│  │  └─ Resource limits (CPU, memory, network)         │  │
│  └────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
```

### 5.2 Tool Streaming и Block Streaming

Наследуется от OpenClaw Pi Agent Runtime:

- **Tool Streaming**: результаты tool-вызовов стримятся в real-time через WS
- **Block Streaming**: структурированные блоки (текст, код, изображения, карточки) стримятся клиенту

```jsonc
// WS message: tool stream
{
  "type": "tool_stream",
  "session_id": "main",
  "tool": "filesystem",
  "action": "list_directory",
  "chunk": { "file": "photo.jpg", "size": "2.3MB" }
}

// WS message: block stream
{
  "type": "block",
  "session_id": "main",
  "block_type": "code",
  "language": "rust",
  "content": "fn main() { ..."
}
```

### 5.3 Docker Sandboxing

Наследуется от OpenClaw:

- Main session: выполняется на хосте (с permission prompts)
- Остальные сессии: Docker-контейнеры с ограничениями
- Настраиваемый allowlist/denylist для инструментов
- Resource limits: CPU, memory, network access

```jsonc
{
  "sandbox": {
    "enabled": true,
    "image": "osai/sandbox:latest",
    "allowlist": ["filesystem", "shell", "http"],
    "denylist": ["os-integration"],
    "resources": {
      "cpu_limit": "2",
      "memory_limit": "512m",
      "network": false
    }
  }
}
```

### 5.4 Обработка ошибок

```typescript
// osaI error handling (наследование OpenClaw + расширения)
enum ErrorSeverity {
  LOW,      // retry silently
  MEDIUM,   // notify user, retry
  HIGH,     // halt task, ask user
  CRITICAL, // abort session
}

interface ErrorHandler {
  // Retry с exponential backoff
  retryWithBackoff(fn: () => Promise<any>, maxAttempts: number): Promise<any>;

  // Circuit breaker
  circuitBreaker: CircuitBreaker;

  // Model fallback chain
  fallbackChain: ModelFailover;
}
```

---

## 6. Архитектура памяти (osaI extension)

### 6.1 Двухуровневая память

```
┌─────────────────────────────────────────────────────────────┐
│                   osaI MEMORY LAYER                          │
│                                                             │
│  ┌─────────────────────┐    ┌──────────────────────────┐   │
│  │  SESSION MEMORY     │    │  LONG-TERM MEMORY        │   │
│  │  (OpenClaw SQLite)  │    │  (osaI: SQLite + Qdrant) │   │
│  │                     │    │                           │   │
│  │  - messages[]       │    │  - facts (embeddings)     │   │
│  │  - tool results     │    │  - user preferences      │   │
│  │  - session state    │    │  - knowledge base        │   │
│  │  - channel context  │    │  - learned patterns      │   │
│  │                     │    │  - error solutions       │   │
│  │  TTL: session       │    │                           │   │
│  │  auto-pruned        │    │  TTL: permanent          │   │
│  └──────────┬──────────┘    └───────────┬──────────────┘   │
│             │                           │                   │
│             └──────────┬────────────────┘                   │
│                        │                                    │
│             ┌──────────▼──────────┐                         │
│             │  Memory Manager     │                         │
│             │  (before_prompt_    │                         │
│             │   build hook)       │                         │
│             │                     │                         │
│             │  - query(query)     │                         │
│             │  - store(entry)     │                         │
│             │  - extract_facts()  │                         │
│             │  - forget(id)       │                         │
│             │  - summarize()      │                         │
│             └─────────────────────┘                         │
└─────────────────────────────────────────────────────────────┘
```

### 6.2 Short-term Memory

Наследуется от OpenClaw — хранение в SQLite:
- Session messages с историей
- Tool call results
- Session state (serialization/deserialization)
- Session pruning при overflow

### 6.3 Long-term Memory (osaI extension)

```typescript
// SQLite таблицы (дополнение к OpenClaw schema)
// memory_entries: id, content, embedding_id, category, tags, source_session, access_count, created_at
// knowledge_documents: id, title, path, chunks_count, tags, created_at
// knowledge_chunks: id, document_id, content, embedding_id, chunk_index

// Qdrant collection: "osai_memory"
interface MemoryEntry {
  id: string;
  content: string;
  embedding: number[];      // 1536-dim (OpenAI) или 384-dim (local MiniLM)
  category: MemoryCategory;
  tags: string[];
  sourceSession: string;
  accessCount: number;
  createdAt: Date;
  metadata: Record<string, any>;
}

enum MemoryCategory {
  FACT,           // извлечённые факты из диалогов
  PREFERENCE,     // предпочтения пользователя
  KNOWLEDGE,      // знания о проектах/доменах
  ERROR,          // ошибки и решения
  PATTERN,        // изученные паттерны поведения
}

// Knowledge Base
interface KnowledgeDocument {
  id: string;
  title: string;
  path: string;
  tags: string[];
  chunks: KnowledgeChunk[];
}

interface KnowledgeChunk {
  id: string;
  documentId: string;
  content: string;
  embedding: number[];
  chunkIndex: number;
}
```

### 6.4 RAG Pipeline

Интеграция через hook `before_prompt_build`:

```
1. User message received
       │
       ▼
2. before_prompt_build hook triggered
       │
       ▼
3. Memory query (semantic search)
   ├─ Query: user message
   ├─ Qdrant: top_k=5, similarity > 0.7
   └─ Returns: relevant memories
       │
       ▼
4. Inject into system prompt:
   ```
   ## Relevant Memory
   - User prefers dark theme
   - Working on project "osaI" (Rust/TS)
   - Last error: Qdrant connection timeout → fixed by restarting
   ```
       │
       ▼
5. Model inference with enriched context
       │
       ▼
6. after_tool_call → extract facts from response
       │
       ▼
7. Store new facts in long-term memory
```

### 6.5 Embedding Model

| Провайдер | Модель | Размерность | Где используется |
|-----------|--------|------------|-----------------|
| OpenAI | text-embedding-3-small | 1536 | Remote (по умолчанию) |
| Ollama | nomic-embed-text | 768 | Local |
| ONNX | all-MiniLM-L6-v2 | 384 | Offline fallback |

---

## 7. Observability (osaI extension)

### 7.1 OpenTelemetry Integration

osaI расширяет базовое логирование OpenClaw до полной OpenTelemetry реализации:

```
┌──────────────────────────────────────────────────────────┐
│                 osaI OBSERVABILITY                        │
│                                                          │
│  ┌────────────────────────────────────────────────────┐  │
│  │              OpenTelemetry SDK                      │  │
│  │                                                    │  │
│  │  ┌──────────────┐  ┌──────────────────────────┐   │  │
│  │  │  TRACES      │  │  METRICS                  │   │  │
│  │  │              │  │                           │   │  │
│  │  │ agent_loop   │  │ agent.session.duration    │   │  │
│  │  │  ├─ context  │  │ agent.tool_call.duration  │   │  │
│  │  │  ├─ inference│  │ agent.llm.tokens_total   │   │  │
│  │  │  ├─ tool_call│  │ agent.llm.cost_usd       │   │  │
│  │  │  └─ persist  │  │ agent.tool_call.success  │   │  │
│  │  │              │  │ agent.plan.steps_total   │   │  │
│  │  │ span per:    │  │ memory.query.duration    │   │  │
│  │  │  - model call│  │ memory.entries.total     │   │  │
│  │  │  - tool exec │  │ sandbox.violations       │   │  │
│  │  │  - memory    │  │ error.count              │   │  │
│  │  └──────────────┘  └──────────────────────────┘   │  │
│  │                                                    │  │
│  │  ┌──────────────────────────────────────────────┐  │  │
│  │  │  LOGS (structured JSON)                      │  │  │
│  │  │  pino logger с correlation IDs              │  │  │
│  │  │  Уровни: error, warn, info, debug, trace    │  │  │
│  │  └──────────────────────────────────────────────┘  │  │
│  └────────────────────────────────────────────────────┘  │
│                          │                               │
│                          ▼                               │
│  ┌────────────────────────────────────────────────────┐  │
│  │  EXPORTERS                                         │  │
│  │  ├─ Console (dev)                                  │  │
│  │  ├─ File (~/.osai/logs/telemetry.jsonl)            │  │
│  │  ├─ Jaeger/Zipkin (опционально, для debug)         │  │
│  │  └─ Prometheus metrics endpoint (:9090)            │  │
│  └────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
```

### 7.2 Метрики

| Метрика | Тип | Описание |
|---------|-----|----------|
| `osaI.agent.session.duration_ms` | Histogram | Длительность сессии |
| `osaI.agent.tool_call.duration_ms` | Histogram | Длительность tool-вызова |
| `osaI.agent.tool_call.total` | Counter | Общее количество tool-вызовов |
| `osaI.agent.tool_call.errors` | Counter | Ошибки tool-вызовов |
| `osaI.agent.llm.tokens_input` | Counter | Входящие токены |
| `osaI.agent.llm.tokens_output` | Counter | Исходящие токены |
| `osaI.agent.llm.cost_usd` | Counter | Стоимость API вызовов |
| `osaI.agent.llm.duration_ms` | Histogram | Длительность LLM вызова |
| `osaI.agent.iterations` | Histogram | Количество итераций agent loop |
| `osaI.memory.query.duration_ms` | Histogram | Длительность RAG-поиска |
| `osaI.memory.entries.total` | Gauge | Количество записей в памяти |
| `osaI.sandbox.violations` | Counter | Нарушения sandbox |
| `osaI.session.active` | Gauge | Активные сессии |

### 7.3 Audit Log

```sql
-- Расширение к OpenClaw SQLite schema
CREATE TABLE osai_audit_log (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    timestamp TEXT NOT NULL DEFAULT (datetime('now')),
    trace_id TEXT,                          -- correlation с OTel span
    action TEXT NOT NULL,                   -- "tool_call", "permission_request", "file_access"
    tool_name TEXT,
    skill_name TEXT,
    params TEXT,                            -- JSON
    result TEXT,                            -- JSON
    user_decision TEXT,                     -- "approved", "denied", "auto"
    risk_level TEXT,                        -- "low", "medium", "high"
    sandbox_checked INTEGER DEFAULT 0,      -- была ли проверка sandbox
    memory_accessed INTEGER DEFAULT 0       -- была ли запись в память
);
```

---

## 8. Безопасность (Guardrails)

### 8.1 Модель безопасности

Наследование OpenClaw + osaI расширения:

```
┌──────────────────────────────────────────────────────────┐
│                  SECURITY LAYERS                          │
│                                                          │
│  Layer 1: Network (OpenClaw)                             │
│  ├─ WS на localhost (127.0.0.1:18789)                   │
│  ├─ Tailscale для remote access (E2E encryption)         │
│  └─ Device pairing verification                          │
│                                                          │
│  Layer 2: Sandbox (OpenClaw)                             │
│  ├─ Docker containers для non-main sessions             │
│  ├─ Allowlist/denylist для tools                         │
│  └─ Resource limits (CPU, memory, network)               │
│                                                          │
│  Layer 3: Permission Prompts (OpenClaw + osaI)           │
│  ├─ before_tool_call hook → permission check            │
│  ├─ Category-based: read=auto, write=confirm, exec=confirm│
│  └─ Desktop notification для permission requests          │
│                                                          │
│  Layer 4: File Sandbox (osaI extension)                  │
│  ├─ Allowed dirs: ~/projects, ~/documents, /tmp/osai    │
│  ├─ Blocked patterns: ~/.ssh/**, ~/.gnupg/**, /etc/**   │
│  ├─ Symlink resolution (запрет symlink traversal)        │
│  └─ on_file_access hook → audit logging                  │
│                                                          │
│  Layer 5: Shell Security (OpenClaw + osaI)               │
│  ├─ Blocked commands list                                │
│  ├─ Timeout enforcement (default: 120s)                  │
│  ├─ Command logging in audit                             │
│  └─ Dangerous pattern detection                          │
│                                                          │
│  Layer 6: Audit (osaI extension)                         │
│  ├─ All actions logged with trace_id                     │
│  ├─ Permission decisions recorded                        │
│  └─ Queryable via API                                    │
└──────────────────────────────────────────────────────────┘
```

### 8.2 Конфигурация безопасности

```jsonc
{
  "security": {
    "sandbox": {
      "allowedDirs": ["~/projects", "~/documents", "/tmp/osai"],
      "blockedPatterns": ["~/.ssh/**", "~/.gnupg/**", "/etc/**", "/boot/**"],
      "autoApproveRead": true,
      "resolveSymlinks": true
    },
    "shell": {
      "blockedCommands": [
        "rm -rf /", "mkfs", "dd if=/dev/zero",
        "chmod -R 777 /", "> /dev/sda",
        ":(){ :|:& };:"
      ],
      "timeout": 120,
      "logAll": true
    },
    "docker": {
      "image": "osai/sandbox:latest",
      "cpuLimit": "2",
      "memoryLimit": "512m",
      "networkAccess": false
    }
  }
}
```

---

## 9. UI/UX слой

### 9.1 Мультиканальный доступ

osaI наследует все каналы OpenClaw и добавляет desktop-интеграцию:

| Канал | Технология | Статус |
|-------|-----------|--------|
| WhatsApp | Baileys | OpenClaw |
| Telegram | grammY | OpenClaw |
| Slack | Bolt SDK | OpenClaw |
| Discord | discord.js | OpenClaw |
| Signal | signal-cli | OpenClaw |
| iMessage | apple-script | OpenClaw |
| CLI | Node.js (ink/oclif) | osaI |
| Web Dashboard | Next.js / SvelteKit | osaI |
| System Tray | electron-tray / node-tray | osaI |
| Desktop Notifications | node-notifier | osaI |
| Canvas / A2UI | OpenClaw Canvas | OpenClaw |

### 9.2 CLI клиент (osaI)

```bash
# Базовое использование
osai                              # Интерактивный чат
osai "переименуй все фото"        # Быстрая команда
osai session list                 # Список сессий
osai session resume <id>          # Продолжить сессию
osai config                       # Настройки
osai skills list                  # Доступные skills
osai memory search "проект osaI"  # Поиск в памяти
osai status                       # Статус системы

# Пример интерактивной сессии
$ osai
osaI v2.0.0 | session: main | model: claude-sonnet

You> Перемести все .jpg из ~/Downloads в ~/Photos

osaI> Найдено 47 .jpg файлов в ~/Downloads.
[Confirm: переместить 47 файлов в ~/Photos/2026/03/?] (y/N): y
Moving... ██████████████████████ 47/47
Done. 47 files moved to ~/Photos/2026/03/.
```

### 9.3 Web Dashboard

```
┌──────────────────────────────────────────────────────────────┐
│  osaI Dashboard                              [Sessions] [⚙]  │
├──────────┬───────────────────────┬───────────────────────────┤
│          │                       │                           │
│ Channels │     Chat Area         │   Agent Trace              │
│          │                       │                           │
│ ● Main   │  You: ...            │   ┌─ tool: filesystem     │
│   TG     │                      │   │  list_dir ~/Downloads  │
│   Slack  │  osaI: ...           │   │  → 47 .jpg files      │
│   WA     │                      │   ├─ tool: filesystem     │
│          │  [Confirm move?]     │   │  mkdir ~/Photos/...   │
│ Skills   │  [y] [N]             │   │  ✓ created            │
│ ● FS     │                      │   └─ tool: filesystem     │
│   Shell  │                      │      move_file (47 files) │
│   Memory │                      │      ██████ in progress   │
│   Browser│                      │                           │
│          │                      │   Tokens: 2.4k  Cost: $0.03│
│ Memory   │                      │   Steps: 3/3   Time: 12s  │
│ [Search] │                      │                           │
├──────────┴───────────────────────┴───────────────────────────┤
│  > type your message...                           [Send]     │
└──────────────────────────────────────────────────────────────┘
```

### 9.4 System Tray Integration

```
┌──────────────────┐
│  osaI      [🟢]  │  ← Статус (зелёный = активен)
├──────────────────┤
│  Open Chat       │  ← Открывает CLI/Web
│  Sessions...     │
│  Memory          │
│  Skills          │
├──────────────────┤
│  Status: Active  │
│  Model: Claude   │
│  Sessions: 3     │
├──────────────────┤
│  Quit            │
└──────────────────┘
```

---

## 10. Примеры сценариев

### Сценарий 1: Автоматизация файлов через мессенджер

**Канал**: Telegram
**Пользователь**: "Найди все дубликаты фото в ~/Downloads и удали"

**Выполнение:**
1. `[intake]` Message received via Telegram channel
2. `[context_assembly]` Load session history + relevant memory
3. `[before_tool_call]` Permission check → auto (read operation)
4. `[tool: filesystem]` list_dir ~/Downloads --glob "*.jpg"
5. `[tool: filesystem]` list_dir ~/Photos --glob "*.jpg"
6. `[tool: shell]` md5sum для вычисления хешей
7. `[agent]` Сравнить хеши, найти дубликаты
8. `[before_tool_call]` Permission check → confirm (delete operation)
9. **Telegram**: "Найдено 23 дубликата. Удалить?" [Да] [Нет]
10. `[tool: filesystem]` delete_file × 23
11. `[after_tool_call]` Audit log + memory store
12. **Telegram**: "Удалено 23 дубликата. Освобождено 450MB."
13. `[desktop_notification]` "osaI: удалено 23 дубликата фото"

### Сценарий 2: Email-ассистент с памятью

**Канал**: WhatsApp
**Пользователь**: "Проверь почту за неделю, сделай сводку"

**Выполнение:**
1. `[memory.recall]` query="email preferences, client list" → previous context
2. `[tool: http]` GET Gmail API messages
3. `[tool: http]` GET each message content
4. `[agent]` Analyze + summarize
5. `[memory.remember]` Store key facts (new clients, deadlines)
6. `[tool: filesystem]` Save summary to ~/Documents/summaries/
7. **WhatsApp**: Summary text + PDF attachment
8. **Desktop notification**: "Новая сводка почты сохранена"

### Сценарий 3: Voice-управление задачами

**Канал**: Voice (Wake Word)
**Пользователь**: "Hey osaI, запланируй поездку в Токио"

**Выполнение:**
1. `[voice]` Wake word detected → start recording
2. `[voice]` Speech-to-text (system TTS or ElevenLabs)
3. `[intake]` Processed as regular message
4. `[tool: http]` Search flights (Skyscanner API)
5. `[tool: http]` Search hotels (Booking API)
6. `[tool: http]` Search attractions (Google Places)
7. `[agent]` Build itinerary
8. `[tool: filesystem]` Save to ~/Documents/trips/tokyo.md
9. `[voice]` Text-to-speech response: "Готово! План поездки сохранён. Нашёл рейс за $450, отель Shibuya Grand за $90/ночь."
10. `[canvas]` Open trip plan in Canvas for visual editing

### Сценарий 4: Разработка кода (dev-кейс)

**Канал**: CLI + Slack (параллельно)
**Пользователь** (CLI): "Создай REST API для TODO на TypeScript"

**Выполнение:**
1. `[tool: filesystem]` Check ~/projects structure
2. `[tool: shell]` npm init + install dependencies
3. `[tool: filesystem]` Write source files (src/index.ts, src/routes.ts, etc.)
4. `[tool: filesystem]` Write tests
5. `[tool: shell]` npm test → all passing
6. `[memory.remember]` Store project structure for future queries
7. **CLI**: "API создан, тесты проходят. 12 файлов."
8. **Slack** (если настроен): "Проект TODO API готов на ~/projects/todo-api/"

### Сценарий 5: Построение базы знаний

**Канал**: CLI
**Пользователь**: "Проанализируй все markdown в ~/notes и создай базу знаний"

**Выполнение:**
1. `[tool: filesystem]` search_files ~/notes --glob "*.md"
2. `[tool: filesystem]` read_file × N
3. `[tool: knowledge-base]` ingest_document × N (chunk + embed)
4. `[memory.remember]` Store knowledge base metadata
5. **CLI**: "Обработано 47 документов. Создано 1,234 чанков. База готова к запросам."
6. `[later]` User: "Что я писал про архитектуру?"
7. `[tool: knowledge-base]` query_knowledge "архитектура" → relevant passages

### Сценарий 6: Мульти-устройство управление

**Канал**: Telegram (mobile) + Desktop (tray)
**Пользователь** (Telegram, на ходу): "Проверь, что билд прошёл"

**Выполнение:**
1. `[intake]` Message from Telegram on mobile
2. `[before_tool_call]` Verify node capabilities → desktop node has shell access
3. `[tool: shell]` (executed on desktop node) → cd ~/projects/osai && npm test
4. `[tool: shell]` npm run build
5. **Telegram**: "Билд прошёл. 42 теста OK. Время сборки: 23s."
6. `[desktop_notification]` "osaI: билд osai завершён успешно"

---

## 11. API-дизайн

### 11.1 Gateway WebSocket Protocol (наследование OpenClaw)

```typescript
// Client → Gateway
interface GatewayMessage {
  type: "message" | "command" | "permission_response" | "subscribe";
  session_id: string;
  payload: any;
}

// Gateway → Client (tool streaming)
interface ToolStreamMessage {
  type: "tool_stream";
  session_id: string;
  tool: string;
  action: string;
  chunk: any;
  progress?: number;
}

// Gateway → Client (block streaming)
interface BlockStreamMessage {
  type: "block";
  session_id: string;
  block_type: "text" | "code" | "image" | "card" | "table";
  content: string;
  language?: string;
}

// Gateway → Client (permission request)
interface PermissionRequest {
  type: "permission_request";
  request_id: string;
  session_id: string;
  tool: string;
  action: string;
  params: any;
  risk_level: "low" | "medium" | "high";
}
```

### 11.2 osaI REST API (расширение)

```yaml
# osaI-specific endpoints (дополнение к OpenClaw API)

# Memory
POST   /api/v1/memory/store              # Сохранить в память
GET    /api/v1/memory/search?q=...       # Семантический поиск
DELETE /api/v1/memory/:id                # Удалить запись

# Knowledge Base
POST   /api/v1/kb/ingest                 # Загрузить документ
GET    /api/v1/kb/search?q=...           # Поиск по KB
GET    /api/v1/kb/sources                # Список источников
DELETE /api/v1/kb/sources/:id            # Удалить источник

# Observability
GET    /api/v1/observability/traces      # Traces (query params: session, tool, date)
GET    /api/v1/observability/metrics     # Prometheus-compatible
GET    /api/v1/observability/audit       # Audit log

# OS Integration
POST   /api/v1/os/notification            # Desktop notification
GET    /api/v1/os/system-info            # System information
GET    /api/v1/os/processes              # Running processes
POST   /api/v1/os/watch                  # Start file watcher

# Skills (расширение)
GET    /api/v1/skills                    # Все skills
GET    /api/v1/skills/:name              # Skill detail
PUT    /api/v1/skills/:name/enable       # Enable skill
PUT    /api/v1/skills/:name/disable      # Disable skill
```

### 11.3 Модель данных

```typescript
// osaI Core types (дополнение к OpenClaw)
interface OsaISession {
  // наследует OpenClaw Session
  id: string;
  type: "main" | "group" | "isolated";
  channel: string;
  activationMode: "always" | "mention" | "wake_word" | "passive";

  // osaI extensions
  memoryQueryCount: number;
  toolCallSummary: Record<string, number>;
  totalTokensUsed: number;
  totalCostUsd: number;
}

interface MemoryQuery {
  query: string;
  topK: number;
  category?: MemoryCategory;
  similarityThreshold: number;
  sessionId?: string;    // optional: search within session context
}
```

---

## 12. Архитектура деплоя

### 12.1 Local-first (наследование OpenClaw)

```
┌─────────────────────────────────────────────────────────────┐
│                    User Machine                               │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐  │
│  │  osaI Gateway Process (background)                     │  │
│  │  PID managed by systemd (Linux) / launchd (macOS)      │  │
│  │  WS: 127.0.0.1:18789                                   │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐  │
│  │  ~/.osai/                                              │  │
│  │  ├── openclaw.json          # Основной конфиг          │  │
│  │  ├── workspace/             # Workspace                │  │
│  │  │   ├── AGENTS.md          # Agent persona            │  │
│  │  │   ├── SOUL.md            # Agent soul/values        │  │
│  │  │   ├── TOOLS.md           # Tool definitions         │  │
│  │  │   └── skills/            # User skills              │  │
│  │  │       ├── my-skill/      │                          │  │
│  │  │       │   └── SKILL.md   │                          │  │
│  │  │       └── ...            │                          │  │
│  │  ├── data/                  # Data                     │  │
│  │  │   ├── osai.db           # SQLite (sessions+audit)   │  │
│  │  │   └── qdrant/           # Qdrant embedded           │  │
│  │  ├── logs/                  # Logs                     │  │
│  │  │   ├── gateway.log        │                          │  │
│  │  │   └── telemetry.jsonl   │                          │  │
│  │  └── skills/                # osaI system skills        │  │
│  │      ├── os-integration/    │                          │  │
│  │      │   └── SKILL.md       │                          │  │
│  │      └── memory/            │                          │  │
│  │          └── SKILL.md       │                          │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────────┐  │
│  │ osai CLI     │  │ Web Dashboard│  │ System Tray       │  │
│  │ (terminal)   │  │ (browser)    │  │ (desktop)         │  │
│  └──────────────┘  └──────────────┘  └───────────────────┘  │
│                                                              │
│  External:                                                   │
│  ├─ Anthropic / OpenAI API                                   │
│  ├─ Ollama (localhost:11434)                                │
│  ├─ Tailscale (remote access)                               │
│  ├─ Docker (sandbox containers)                             │
│  └─ Chrome/Chromium (browser tool, CDP)                     │
└─────────────────────────────────────────────────────────────┘
```

### 12.2 Установка

```bash
# Через npm
npm install -g @osai/cli

# Или через бинарник
curl -fsSL https://releases.osai.dev/install.sh | bash

# Инициализация
osai init          # создаёт ~/.osai/, openclaw.json, workspace/
osai start         # запускает gateway (или systemctl --user enable osai)
osai               # запускает CLI

# Настройка мессенджеров
osai channel add telegram --token=BOT_TOKEN
osai channel add whatsapp    # QR-код для связывания
```

### 12.3 Remote Access (Tailscale)

Наследуется от OpenClaw:

```
Mobile Phone ──Tailscale──> Desktop (Gateway)
     │                           │
     │  Telegram message         │  Execute tools
     │  ─────────────────────────>  on desktop
     │                           │
     │  Result back              │
     │  <─────────────────────────
```

### 12.4 Масштабирование

| Этап | Что масштабируется | Как |
|------|--------------------|-----|
| MVP | Один пользователь, одна машина | Local-only |
| V1 | Несколько устройств пользователя | Tailscale + device pairing |
| V2 | Team collaboration | Shared knowledge base + memory sync |

---

## 13. Технологический стек

### 13.1 Core (TypeScript/Node.js — наследование OpenClaw)

| Компонент | Технология | Обоснование |
|-----------|-----------|-------------|
| Runtime | Node.js 20+ LTS | Event loop, async/await, огромная экосистема |
| Language | TypeScript 5.x | Type safety, developer experience |
| Gateway WS | ws / uWebSockets | Быстрый WebSocket server |
| CLI | oclif / ink | Зрелый CLI framework с TUI |
| HTTP Client | node-fetch / undici | HTTP requests для external APIs |
| Config | JSON (openclaw.json) | Совместимость с OpenClaw |
| Logging | pino | Быстрый structured JSON logger |
| Testing | vitest | Быстрый, ESM-first |

### 13.2 osaI Extensions

| Компонент | Технология | Обоснование |
|-----------|-----------|-------------|
| Database | better-sqlite3 | Синхронный SQLite (быстрее для local) |
| Vector DB | @qdrant/js-client-rest | Qdrant REST client (embedded mode) |
| Embeddings | @xenova/transformers | ONNX runtime в Node.js для local embeddings |
| Observability | @opentelemetry/sdk-node | Official OpenTelemetry SDK |
| Metrics | prom-client | Prometheus metrics |
| Desktop Tray | node-notifier + systray2 | System tray + notifications |
| File Watch | chokidar | Кроссплатформенный file watcher |
| Process Mgmt | systeminformation | System info (CPU, memory, processes) |

### 13.3 Frontend

| Компонент | Технология | Обоснование |
|-----------|-----------|-------------|
| Web Dashboard | SvelteKit | Лёгкий, быстрый, Svelte реактивность |
| Styling | TailwindCSS | Utility-first, быстрая разработка |
| Canvas / A2UI | OpenClaw Canvas | Готовая визуальная рабочая область |

### 13.4 Infrastructure

| Компонент | Технология |
|-----------|-----------|
| Сборка | tsup / esbuild |
| Пакетинг | pkg / nexe (standalone binary) |
| CI/CD | GitHub Actions |
| Линтинг | ESLint + Biome |
| Форматирование | Prettier |
| Зависимости | npm audit + socket.dev |

---

## 14. Структура проекта

```
osai/
├── package.json                     # Root (workspace)
├── tsconfig.json                    # Shared TS config
├── openclaw.json.example            # Пример конфигурации
├── AGENTS.md                        # Agent persona
├── SOUL.md                          # Agent values
│
├── packages/
│   ├── gateway/                     # OpenClaw Gateway (fork)
│   │   ├── src/
│   │   │   ├── index.ts             # WS server
│   │   │   ├── channels/            # Channel handlers
│   │   │   │   ├── telegram.ts
│   │   │   │   ├── whatsapp.ts
│   │   │   │   ├── slack.ts
│   │   │   │   └── discord.ts
│   │   │   ├── session/             # Session management
│   │   │   │   ├── router.ts
│   │   │   │   ├── persistence.ts
│   │   │   │   └── pruning.ts
│   │   │   └── ws/                  # WS protocol
│   │   └── package.json
│   │
│   ├── agent/                       # Pi Agent Runtime (fork)
│   │   ├── src/
│   │   │   ├── index.ts             # Agent loop
│   │   │   ├── hooks/               # Hook system
│   │   │   │   ├── before-model-resolve.ts
│   │   │   │   ├── before-prompt-build.ts
│   │   │   │   ├── before-tool-call.ts
│   │   │   │   ├── after-tool-call.ts
│   │   │   │   └── agent-end.ts
│   │   │   ├── context/             # Context assembly
│   │   │   ├── model/               # Model resolver + failover
│   │   │   ├── skills/              # Skills loader + executor
│   │   │   └── streaming/           # Tool + block streaming
│   │   └── package.json
│   │
│   ├── skills-core/                 # Bundled skills (osaI)
│   │   ├── src/
│   │   │   ├── filesystem/          # File system operations
│   │   │   │   └── SKILL.md
│   │   │   ├── shell/               # Shell command execution
│   │   │   │   └── SKILL.md
│   │   │   ├── browser/             # CDP browser automation
│   │   │   │   └── SKILL.md
│   │   │   ├── http/                # HTTP/API client
│   │   │   │   └── SKILL.md
│   │   │   └── registry.ts          # Skill loader
│   │   └── package.json
│   │
│   ├── skills-osai/                 # osaI-specific skills
│   │   ├── src/
│   │   │   ├── os-integration/
│   │   │   │   ├── SKILL.md
│   │   │   │   └── index.ts         # Tray, notifications, processes
│   │   │   ├── memory/
│   │   │   │   ├── SKILL.md
│   │   │   │   └── index.ts         # Remember, recall, forget
│   │   │   └── knowledge-base/
│   │   │       ├── SKILL.md
│   │   │       └── index.ts         # Ingest, query, manage KB
│   │   └── package.json
│   │
│   ├── memory/                      # osaI Memory System
│   │   ├── src/
│   │   │   ├── index.ts             # Memory Manager
│   │   │   ├── short-term.ts        # Session memory (SQLite)
│   │   │   ├── long-term.ts         # Long-term memory (SQLite + Qdrant)
│   │   │   ├── embeddings.ts        # Embedding provider
│   │   │   ├── rag.ts               # RAG pipeline
│   │   │   ├── extraction.ts        # Fact extraction from conversations
│   │   │   └── schema.sql           # SQLite schema
│   │   └── package.json
│   │
│   ├── observability/               # osaI OpenTelemetry
│   │   ├── src/
│   │   │   ├── index.ts             # OTel setup
│   │   │   ├── traces.ts            # Trace configuration
│   │   │   ├── metrics.ts           # Custom metrics
│   │   │   ├── audit.ts             # Audit logging
│   │   │   └── exporters.ts         # Console, file, Jaeger, Prometheus
│   │   └── package.json
│   │
│   ├── os-integration/              # OS Desktop Integration
│   │   ├── src/
│   │   │   ├── index.ts             # Integration hub
│   │   │   ├── tray.ts              # System tray
│   │   │   ├── notifications.ts     # Desktop notifications
│   │   │   ├── file-watcher.ts      # File system watcher
│   │   │   ├── process-manager.ts   # Process management
│   │   │   └── system-info.ts       # System information
│   │   └── package.json
│   │
│   └── cli/                         # osai CLI client
│       ├── src/
│       │   ├── index.ts             # CLI entry (oclif)
│       │   ├── commands/
│       │   │   ├── chat.ts          # Interactive chat
│       │   │   ├── session.ts       # Session management
│       │   │   ├── config.ts        # Configuration
│       │   │   ├── skills.ts        # Skills management
│       │   │   ├── memory.ts        # Memory operations
│       │   │   ├── channel.ts       # Channel management
│       │   │   └── status.ts        # System status
│       │   └── ui/                  # TUI components (ink)
│       └── package.json
│
├── apps/
│   └── dashboard/                   # Web Dashboard (SvelteKit)
│       ├── src/
│       │   ├── routes/
│       │   ├── components/
│       │   └── lib/
│       └── package.json
│
├── tests/
│   ├── unit/
│   ├── integration/
│   └── e2e/
│
├── docs/
│   ├── specs/
│   └── research/
│
└── workspace/                       # Default workspace
    ├── AGENTS.md
    ├── SOUL.md
    └── skills/
```

---

## 15. Workspace (AGENTS.md, SOUL.md, TOOLS.md)

osaI наследует workspace концепцию OpenClaw:

### AGENTS.md — Персона агента

```markdown
# osaI Agent

You are osaI, an AI Operating System agent. You execute user intents by using tools and skills.

## Capabilities
- File system management (read, write, search, move, delete)
- Shell command execution (with safety checks)
- Browser automation (navigate, click, fill, screenshot)
- HTTP/API integration
- Desktop OS integration (notifications, processes, file watchers)
- Long-term memory and knowledge base management

## Rules
- Always confirm before destructive operations (write, delete, execute)
- Stay within sandbox boundaries
- Log all actions for audit
- Ask for clarification when intent is ambiguous
- Remember important facts across sessions
```

### SOUL.md — Ценности агента

```markdown
# osaI Soul

## Values
- **Helpfulness**: Execute user intents efficiently and completely
- **Honesty**: Report errors and limitations transparently
- **Safety**: Never bypass sandbox or permission checks
- **Privacy**: Keep user data local, never send to third parties
- **Clarity**: Explain what you're doing and why

## Tone
- Concise and direct
- Show progress for multi-step tasks
- Proactively confirm dangerous operations
```

---

## 16. Roadmap

### 16.1 MVP — Fork + Core

**Цель:** Рабочий osaI на базе OpenClaw с CLI и desktop-интеграцией.

| Задача | Описание |
|--------|----------|
| Fork OpenClaw | Клонирование, настройка workspace |
| Gateway | Запуск WS control plane |
| Agent Runtime | Pi agent runtime с hooks |
| Skills: Filesystem | Базовые файловые операции |
| Skills: Shell | Shell commands с подтверждением |
| LLM: Anthropic | Claude API integration |
| LLM: Ollama | Local model fallback |
| CLI: oclif | Базовый CLI с чатом |
| Memory: SQLite | Session persistence |
| File Sandbox | Allowed dirs + blocked patterns |
| Config | openclaw.json setup |
| Logging | pino structured logs |

### 16.2 V1 — Full System

**Цель:** Production-ready с памятью, observability, мультиканальностью.

| Задача | Описание |
|--------|----------|
| Skills: Browser | CDP automation |
| Skills: HTTP | External API client |
| Skills: Memory | Remember/recall/forget |
| Skills: Knowledge Base | Document ingestion + RAG |
| Skills: OS Integration | Tray, notifications, processes |
| Memory: Qdrant | Long-term vector memory |
| Embeddings | Local (Xenova) + remote (OpenAI) |
| Fact Extraction | Auto-extract from conversations |
| Observability | OpenTelemetry (traces, metrics, logs) |
| Audit Log | Full action audit |
| System Tray | Desktop integration |
| Web Dashboard | SvelteKit |
| Channels | Telegram, WhatsApp (минимум 2) |
| Voice | Basic talk mode |
| Device Pairing | Tailscale remote access |

### 16.3 V2 — Advanced

**Цель:** Продвинутые возможности, marketplace, team features.

| Задача | Описание |
|--------|----------|
| Multi-agent | Специализированные агенты |
| Canvas/A2UI | Визуальная рабочая область |
| Plugin Marketplace | ClawHub + osaI plugins |
| Advanced RAG | Re-ranking, hybrid search |
| Smart Scheduling | Cron-like task scheduling |
| Team Collaboration | Shared memory + KB |
| All Channels | Slack, Discord, Signal, iMessage, 20+ |
| Background Tasks | Long-running task management |
| MCP Integration | Model Context Protocol |
| Desktop App | Electron/Tauri wrapper |

---

## 17. Риски и митигация

| Риск | Вероятность | Влияние | Митигация |
|------|-------------|---------|-----------|
| OpenClaw upstream breaking changes | Средняя | Высокое | Pin version; отдельный fork; минимальные модификации upstream кода; abstraction layer |
| LLM API downtime | Средняя | Высокое | Fallback chain (Claude → GPT → Ollama); auth rotation |
| Агент выполняет разрушительное действие | Средняя | Критичное | Sandbox + Docker + confirmation + audit; on_file_access hook |
| Контекстное окно недостаточно | Высокая | Среднее | Session pruning; RAG вместо полного контекста; summarization |
| Высокая стоимость LLM API | Средняя | Среднее | Token tracking; budget limits; Ollama fallback; cost metrics |
| Qdrant embedded stability | Низкая | Среднее | Fallback на sqlite-vec; интерфейс через абстракцию |
| Node.js performance для heavy tasks | Средняя | Низкое | Worker threads для CPU-bound; Docker sandbox изолирует |
| Solo developer overload | Высокая | Высокое | Форк + расширение вместо написания с нуля; leverage OpenClaw community |
| Безопасность sandbox обход | Низкая | Критичное | Docker isolation; symlink resolution; audit logging; blocked patterns |
| Десктоп-интеграция кроссплатформенность | Средняя | Среднее | Проверить node-tray/node-notifier на Linux/macOS; fallback на CLI |

---

## 18. Компромиссы (Tradeoffs)

### 18.1 Принятые решения

| Решение | Альтернатива | Обоснование |
|---------|-------------|-------------|
| TypeScript/Node.js (не Rust) | Rust — выше производительность, безопасность | OpenClaw уже на TS; 80% кода готово; экосистема npm; быстрее разработка; производительность достаточна для local-first |
| Fork OpenClaw (не писать с нуля) | Custom implementation | Готовый gateway, agent loop, 20+ channels, skills system, voice; экономия месяцев разработки |
| SQLite + Qdrant (не Pinecone/Chroma) | Pinecone — cloud; Chroma — проще | Local-first; Qdrant embedded mode; SQLite для structured data |
| SvelteKit (не Next.js) | Next.js — больше экосистема | Легче, быстрее, меньше bundle; desktop dashboard не нужен SSR |
| pino (не winston) | Winston — больше формatters | Быстрее (6x); structured JSON из коробки; async-friendly |
| Docker sandbox (не nsjail/firecracker) | nsjail — легче; firecracker — безопаснее | OpenClaw уже использует Docker; проверенное решение; sufficient isolation |

### 18.2 Балансы

- **Скорость разработки vs контроль**: В пользу скорости — форк OpenClaw даёт 80% готового кода, но зависимость от upstream
- **Функциональность vs стабильность**: MVP на базе стабильного OpenClaw fork; osaI extensions в отдельных пакетах
- **Безопасность vs UX**: Docker sandbox + confirmation для write/exec; read — auto в sandbox; настраиваемые политики
- **Стоимость API vs качество**: Claude primary (лучшее качество), GPT fallback, Ollama для offline

---

## 19. Приоритеты (MoSCoW)

### 19.1 Must Have (MVP)

- Fork OpenClaw + Gateway running
- Agent Runtime с hooks
- Skills: Filesystem + Shell
- LLM: Anthropic + Ollama
- SQLite session persistence
- CLI (oclif) с чатом
- File sandbox + confirmation
- Structured logging (pino)
- openclaw.json configuration

### 19.2 Should Have (V1)

- Skills: Browser (CDP) + HTTP + Memory + Knowledge Base
- Qdrant long-term memory + RAG
- Local embeddings (Xenova/Transformers.js)
- OpenTelemetry observability
- Audit logging
- System tray + desktop notifications
- Web Dashboard (SvelteKit)
- Telegram + WhatsApp channels
- Device pairing (Tailscale)

### 19.3 Could Have (V2)

- Multi-agent architecture
- Canvas/A2UI
- Plugin marketplace
- Advanced RAG (re-ranking)
- Smart scheduling
- Team collaboration
- All 20+ channels
- MCP integration
- Voice wake + talk mode

### 19.4 Won't Have

- Cloud-hosted backend — нарушает local-first
- Mobile native app — через мессенджеры достаточно
- Subscription/billing — open-source project
- User accounts/auth — local-first, один пользователь
- Custom Rust backend — избыточно при наличии OpenClaw

---

## 20. Следующие шаги

- [ ] Fork OpenClaw repository, создать osaI branch
- [ ] Настроить monorepo workspace (npm/pnpm workspaces)
- [ ] Запустить Gateway + Agent Runtime локально
- [ ] Реализовать osaI Filesystem skill (на базе OpenClaw patterns)
- [ ] Реализовать osaI Shell skill с sandbox
- [ ] Подключить LLM: Anthropic (primary) + Ollama (fallback)
- [ ] Реализовать CLI клиент (oclif): чат + базовые команды
- [ ] Настроить file sandbox (allowed_dirs, blocked_patterns)
- [ ] Настроить structured logging (pino)
- [ ] Реализовать osaI Memory package: SQLite schema + basic memory store
- [ ] Интегрировать Qdrant embedded для long-term memory
- [ ] Реализовать RAG pipeline: query → embed → search → inject
- [ ] Добавить osaI-specific hooks (before_memory_query, on_file_access)
- [ ] Реализовать OS Integration: system tray + notifications
- [ ] Настроить OpenTelemetry: traces + metrics + audit
- [ ] Реализовать Web Dashboard (SvelteKit): чат + trace view
- [ ] Подключить Telegram channel
- [ ] Тесты: unit + integration + e2e

---

**Создано**: Specification Generator Skill (v2)
**Основан на**: [OpenClaw](https://github.com/openclaw/openclaw) by Peter Steinberger
**Исходный запрос**: Разработать спецификацию AI OS на базе OpenClaw как основы агентской системы
