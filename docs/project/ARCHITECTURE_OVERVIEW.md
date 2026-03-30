# Architecture Overview

**Версия документа:** v1.0
**Дата:** 2026-03-30
**Проект:** osaI v3 -- AI Operating System
**Спецификация:** docs/specs/spec_osai_v3_2026-03-28.md
**Профиль:** docs/project/PROJECT_PROFILE.md
**Требования:** docs/project/TECH_REQUIREMENTS.md
**Область видимости:** docs/project/SCOPE.md
**Анализ:** docs/project/ANALYSIS.md

---

## 1. Architectural Goals

### 1.1 Ключевые quality attributes

| Атрибут | Приоритет | Целевое значение |
|---|---|---|
| **Надёжность** | Critical | 5-звенная failover chain, circuit breaker, graceful degradation, SQLite WAL persistence |
| **Безопасность** | Critical | 7-уровневая модель, file sandbox, shell security, audit logging |
| **Модульность** | High | pnpm workspace monorepo, чёткие границы доменов, минимальные cross-dependencies |
| **Масштабируемость (локальная)** | High | До 20 чатов, 50K+ записей в памяти, 500+ документов в KB |
| **Производительность** | Medium | TTFT overhead <= 500ms, RAG query <= 200ms (10K записей), CLI latency <= 50ms |
| **Кроссплатформенность** | High | Linux (primary) + Windows 10/11 (native) |
| **Удобство эксплуатации** | High | `osai init` за 3 шага, CLI + TUI, structured logging |
| **Наблюдаемость** | Should | pino logging, OpenTelemetry traces/metrics (V1), audit log |

### 1.2 Ограничения, влияющие на архитектуру

- **Solo developer**: строгая приоритизация P0 для MVP, минимальная сложность
- **Local-first**: все данные на машине пользователя, никаких облачных бэкендов
- **OpenClaw upstream не существует**: core разрабатывается самостоятельно (AS-01)
- **Z.ai верифицирован**: endpoint `https://api.z.ai/api/paas/v4`, модель `glm-5`, OpenAI-совместимый (AS-02)
- **Ollama не поддерживает STT/TTS**: whisper.cpp + Piper TTS как отдельные процессы (AS-03)
- **Qdrant не имеет embedded mode для Node.js**: sqlite-vec как primary vector storage (AS-04)
- **Node.js 22.16+ LTS / 24**: единый runtime, TypeScript 5.x strict
- **Python dependency (Telethon)**: двухязыковая архитектура, child_process bridge

---

## 2. System Context

### 2.1 Границы системы

osaI v3 -- локально работающий AI-ассистент, полностью размещённый на машине пользователя. Вся обработка данных, хранение, управление чатами и памятью выполняется локально. Внешние API используются только для:

1. LLM inference (Z.ai / Yandex / Anthropic / OpenAI / Ollama)
2. Embedding generation (Ollama / Yandex / ONNX)
3. Voice STT/TTS fallback (Yandex SpeechKit)
4. Telegram Bot API / MTProto

**Данные пользователя никогда не покидают локальную машину**, кроме отправки в LLM API (prompt + контекст) и embedding API.

### 2.2 Внешние системы и акторы

```
+------------------------------------------------------------------+
|                     USER MACHINE (Linux / Windows)                |
|                                                                  |
|  +----------------------------------------------------------+   |
|  |                    osaI SYSTEM                           |   |
|  |                                                          |   |
|  |  +--------+  +--------+  +----------+  +----------+      |   |
|  |  | CLI    |  | TG Bot |  | TG User  |  | Web Dash |      |   |
|  |  | Client |  | (grammY)|  | (Telethon)|  | (V1)    |      |   |
|  |  +---+----+  +---+----+  +----+-----+  +----+-----+      |   |
|  |      |            |             |              |           |   |
|  |  +---v------------v-------------v--------------v--------+   |   |
|  |  |              GATEWAY (WS Control Plane)           |   |   |
|  |  |              ws://127.0.0.1:18789                 |   |   |
|  |  +------------------------+---------------------------+   |   |
|  |                           |                               |   |
|  |  +------------------------v---------------------------+   |   |
|  |  |              AGENT RUNTIME                       |   |   |
|  |  |  (intake -> context -> inference -> tools ->     |   |   |
|  |  |   streaming -> persistence)                       |   |   |
|  |  +--------+----------+-----------+------------------+   |   |
|  |           |          |           |                      |   |
|  |  +--------v--+ +-----v-----+ +--v-----------+ +--------v+|   |
|  |  | Skills    | | LLM       | | Memory       | | KB     ||   |
|  |  | System    | | Providers  | | System       | |        ||   |
|  |  +--------+--+ +-----+-----+ +--+-----------+ +--------+|   |
|  |           |          |           |                      |   |
|  |  +--------v----------v-----------v------------------+   |   |
|  |  |              INFRASTRUCTURE                      |   |   |
|  |  |  SQLite (better-sqlite3) | sqlite-vec           |   |   |
|  |  |  Config (~/.osai/) | pino Logger | Audit Log    |   |   |
|  |  +--------------------------------------------------+   |   |
|  +----------------------------------------------------------+   |
|                                                                  |
|  External Dependencies (runtime):                                |
|  +----------+  +-------+  +-----------+  +-----------+           |
|  | Ollama   |  | Docker|  | whisper.cpp|  | Piper TTS |           |
|  | (local)  |  |(opt.) |  | (child_   |  | (child_   |           |
|  |          |  |       |  |  process) |  |  process) |           |
|  +----------+  +-------+  +-----------+  +-----------+           |
+------------------------------------------------------------------+

  External APIs (cloud):
  +-------+  +--------+  +-----------+  +--------+
  | Z.ai  |  | Yandex |  | Anthropic |  | OpenAI |
  |(glm-5)|  | Found. |  | Claude    |  | GPT    |
  |/api/  |  | Models |  |           |  |        |
  |paas/v4|  |        |  |           |  |        |
  +-------+  +--------+  +-----------+  +--------+
```

### 2.3 Акторы

| Актор | Тип | Взаимодействие |
|---|---|---|
| Пользователь | Человек | CLI, Telegram (bot/userbot), Web Dashboard (V1) |
| osaI Agent | Система | Agent loop, tool execution, memory, KB |
| LLM Providers | Внешний API | Inference (Z.ai, Yandex, Anthropic, OpenAI, Ollama) |
| Telegram | Внешний API | Bot API + MTProto |
| whisper.cpp | Внешний процесс | child_process для STT |
| Piper TTS | Внешний процесс | child_process для TTS |
| Telethon | Внешний процесс | Python microservice через child_process |

---

## 3. High-Level Architecture

### 3.1 Архитектурный стиль

**Модульный монолит (Modular Monolith)** в pnpm workspace monorepo.

Обоснование:
- Solo developer -- микросервисы неоправданны по сложности
- Local-first deployment -- один процесс, нет network overhead
- Чёткие границы модулей через pnpm packages обеспечивают будущую экстракцию
- Shared state (SQLite) естественнее в монолите

Вторичные паттерны:
- **Event-driven (hooks)**: 13 hook points для расширения behaviour
- **Plugin architecture**: SKILL.md формат для декларативных skills
- **Adapter pattern**: LLM providers через unified interface
- **Strategy pattern**: Vector storage, embeddings, STT/TTS -- через interchangeable strategies
- **Bridge pattern**: Telethon userbot через inter-process bridge

### 3.2 Крупномасштабная схема (ASCII)

```
+================================================================+
|                    osaI v3 -- MODULE STRUCTURE                   |
+================================================================+
|                                                                 |
|  packages/gateway/          DOMAIN-001                          |
|  +--------------------------------------------------------+    |
|  | WS Server :18789                                      |    |
|  | +----------+  +----------+  +----------+  +--------+   |    |
|  | |Channel:  |  |Channel:  |  |Channel:  |  |Channel |   |    |
|  | | CLI      |  | TG Bot   |  | TG User  |  | (V1)   |   |    |
|  | | Handler  |  | (grammY) |  | Bridge   |  | WA/DC  |   |    |
|  | +----+-----+  +----+-----+  +----+-----+  +--------+   |    |
|  |      |              |              |                      |    |
|  |  +---v--------------v--------------v-----------------+   |    |
|  |  | Chat Router + Session Manager                     |   |    |
|  |  | Chat CRUD | Context Switch | Activation Modes    |   |    |
|  |  +---+----------------------------------------------+   |    |
|  +------+------------------------------------------------+    |
|         |                                                      |
|  packages/agent/             DOMAIN-002                          |
|  +------+------------------------------------------------+    |
|  | AGENT LOOP                                            |    |
|  | intake -> context_assembly -> model_inference ->       |    |
|  | tool_execution -> streaming -> persistence             |    |
|  |                                                       |    |
|  | +---------------------------------------------------+ |    |
|  | | HOOK SYSTEM (13 hook points)                       | |    |
|  | | 7 OpenClaw + 6 osaI hooks                          | |    |
|  | +---------------------------------------------------+ |    |
|  +---+----------+----------+-----------+--------------+--+    |
|      |          |          |           |                     |
|  +---v----+ +---v-------+ +v-----------+ +v-----------------+  |
|  |packages| |packages/  | |packages/   | |packages/          |  |
|  |skills- | |providers/ | |memory/     | |knowledge-base/   |  |
|  |core/   | |DOMAIN-008 | |DOMAIN-004  | |DOMAIN-005        |  |
|  |DOMAIN- | |LLM        | |Three-tier  | |Ingest + Search   |  |
|  |003     | |Failover   | |Memory RAG  | |Source Mgmt       |  |
|  |+skills-| |Circuit Br.| |Embeddings  | |                  |  |
|  |osai/   | |Auth Rot.  | |Context Wnd.| |                  |  |
|  +--------+ +-----------+ +------------+ +------------------+  |
|                                                                 |
|  packages/os-integration/  DOMAIN-009                            |
|  +--------------------------------------------------------+    |
|  | Notifications | System Info | Process List | (Tray V1)  |    |
|  +--------------------------------------------------------+    |
|                                                                 |
|  packages/cli/              DOMAIN-011                          |
|  +--------------------------------------------------------+    |
|  | TUI (ink) | Commands: chat/session/config/skills/memory |    |
|  +--------------------------------------------------------+    |
|                                                                 |
|  packages/voice/            DOMAIN-007 (V1)                     |
|  +--------------------------------------------------------+    |
|  | STT: whisper.cpp (child) -> Yandex fallback             |    |
|  | TTS: Piper TTS (child)    -> Yandex fallback             |    |
|  +--------------------------------------------------------+    |
|                                                                 |
|  packages/observability/    DOMAIN-010 (V1)                     |
|  +--------------------------------------------------------+    |
|  | pino logging | OTel traces | OTel metrics | Audit Log    |    |
|  +--------------------------------------------------------+    |
|                                                                 |
+================================================================+
|                    SHARED INFRASTRUCTURE                         |
+================================================================+
|  better-sqlite3 | sqlite-vec | pino | osai.json config         |
|  ~/.osai/data/osai.db | ~/.osai/logs/ | ~/.osai/channels/     |
+================================================================+
```

### 3.3 Структура monorepo

```
osai/
+-- package.json                    # Root pnpm workspace
+-- pnpm-workspace.yaml             # Workspace configuration
+-- tsconfig.json                   # Shared TypeScript config (strict)
+-- openclaw.json.example           # Configuration template
+-- AGENTS.md                       # Agent persona definition
+-- SOUL.md                         # Agent values definition
|
+-- packages/
|   +-- gateway/                    # DOMAIN-001: WS Control Plane
|   +-- agent/                      # DOMAIN-002: Agent Runtime + Hooks
|   +-- skills-core/                # DOMAIN-003: Bundled Skills (FS, Shell)
|   +-- skills-osai/                # DOMAIN-003: osaI Skills (Memory, KB, Chat, OS)
|   +-- providers/                  # DOMAIN-008: LLM Providers + Failover
|   +-- memory/                     # DOMAIN-004: Three-tier Memory + RAG
|   +-- knowledge-base/             # DOMAIN-005: Document Ingestion + Search
|   +-- os-integration/             # DOMAIN-009: Notifications, System Info
|   +-- voice/                      # DOMAIN-007: STT/TTS (whisper.cpp + Piper)
|   +-- observability/              # DOMAIN-010: Logging + Audit
|   +-- cli/                        # DOMAIN-011: CLI Client + TUI
|
+-- apps/
|   +-- dashboard/                  # DOMAIN-012: SvelteKit (V1)
|
+-- tests/
|   +-- unit/                       # Unit tests (vitest)
|   +-- integration/                # Cross-module integration tests
|   +-- e2e/                        # End-to-end scenario tests
|
+-- docs/
|   +-- specs/                      # Original specification
|   +-- project/                    # Analysis, scope, requirements, architecture
|
+-- workspace/                      # User workspace
    +-- AGENTS.md
    +-- SOUL.md
    +-- skills/                     # User-defined skills (SKILL.md format)
```

---

## 4. Core Components

### 4.1 Gateway (packages/gateway)

**Ответственность:** Единый WebSocket control plane для всех клиентских подключений. Маршрутизация сообщений между каналами и agent runtime. Управление чатами и сессиями.

**Входы:**
- WebSocket подключения от CLI, Telegram Bot, Telegram Userbot
- Конфигурация каналов из osai.json

**Выходы:**
- Маршрутизированные сообщения в Agent Runtime
- tool_stream, block, permission_request -- клиентам
- Статус сессий и чатов

**Зависимости:**
- `packages/agent` -- делегирование обработки
- `packages/os-integration` -- desktop notifications для permission requests
- better-sqlite3 -- persistence чатов и сообщений

**Ключевые submodule:**
- `ws/` -- WebSocket server (127.0.0.1:18789)
- `channels/` -- channel handlers (CLI, Telegram Bot, Telegram Userbot)
- `chat/` -- Chat CRUD, persistence, context management
- `session/` -- Session routing, persistence, pruning

**Контракт (WebSocket Protocol):**

```typescript
// Client -> Gateway
interface GatewayMessage {
  type: "message" | "command" | "permission_response" | "subscribe";
  session_id: string;
  chat_id?: string;
  payload: unknown;
}

// Gateway -> Client
interface ToolStreamMessage {
  type: "tool_stream";
  session_id: string;
  chat_id?: string;
  tool: string;
  action: string;
  chunk: unknown;
  progress?: number;
}

interface BlockStreamMessage {
  type: "block";
  session_id: string;
  chat_id?: string;
  block_type: "text" | "code" | "image" | "card" | "table";
  content: string;
  language?: string;
}

interface PermissionRequest {
  type: "permission_request";
  request_id: string;
  session_id: string;
  chat_id?: string;
  tool: string;
  action: string;
  params: unknown;
  risk_level: "low" | "medium" | "high";
}
```

### 4.2 Agent Runtime (packages/agent)

**Ответственность:** Полный цикл обработки запроса: intake -> context_assembly -> model_inference -> tool_execution -> streaming -> persistence. Hook-based расширяемость.

**Входы:**
- Маршрутизированные сообщения от Gateway
- Tool definitions от Skills System
- RAG context от Memory System
- Failover chain от LLM Providers

**Выходы:**
- Streaming ответы через Gateway клиентам
- Вызовы tools через Skills System
- Факты для хранения в Long-term Memory
- Audit records в Observability

**Зависимости:**
- `packages/providers` -- LLM inference
- `packages/skills-core` + `packages/skills-osai` -- tool execution
- `packages/memory` -- RAG context assembly
- `packages/observability` -- logging + audit

**Agent Loop Pipeline:**

```
INTAKE -> CONTEXT_ASSEMBLY -> MODEL_INFERENCE -> TOOL_EXECUTION -> STREAMING -> PERSISTENCE
    ^                                                                        |
    +---------------------------- tool_use loop (if needed) ------------------+
```

**Hook Points (13 total):**

| Hook | Источник | Вызывается в |
|---|---|---|
| `before_model_resolve` | OpenClaw | Выбор модели, rotation auth profiles |
| `before_prompt_build` | OpenClaw | Модификация промпта, инъекция RAG контекста |
| `before_agent_start` | OpenClaw | Инициализация перед запуском агента |
| `before_tool_call` | OpenClaw | Permission check, sandbox verify |
| `after_tool_call` | OpenClaw | Result processing, metrics, memory store |
| `agent_end` | OpenClaw | Post-processing, notifications |
| `on_error` | OpenClaw | Error handling, fallback logic |
| `before_memory_query` | osaI | RAG search перед context assembly |
| `after_memory_extract` | osaI | Post-processing extracted facts |
| `on_file_access` | osaI | Audit + sandbox check |
| `on_desktop_notification` | osaI | System tray notification dispatch |
| `on_chat_switch` | osaI v3 | Переключение между мультичатами |
| `on_mirror_message` | osaI v3 | Обработка зеркалирования Telegram сообщений |

### 4.3 Skills System (packages/skills-core + packages/skills-osai)

**Ответственность:** Реестр и выполнение tools (инструментов). Bundled skills (Filesystem, Shell) + osaI-specific skills (Memory, KB, Chat Management, OS Integration). SKILL.md декларативный формат.

**Входы:**
- Tool call requests от Agent Runtime
- SKILL.md файлы из bundled, workspace, osaI директорий

**Выходы:**
- Результаты tool execution в Agent Runtime
- Audit records для file/shell operations

**Зависимости:**
- `packages/os-integration` -- для OS Integration skill
- `packages/memory` -- для Memory skill
- `packages/knowledge-base` -- для KB skill
- `packages/gateway` -- для Chat Management skill

**Bundled Skills (MVP):**

| Skill | Tools | Category | Confirmation |
|---|---|---|---|
| Filesystem | read_file, write_file, list_dir, search_files, move_file, delete_file, get_file_info | read/write | read=auto, write=confirm |
| Shell | exec, exec_sandbox | execute | Always confirm |

**osaI Skills (MVP):**

| Skill | Tools | Description |
|---|---|---|
| Memory | remember, recall, forget, summarize_session | Трёхуровневая память |
| Knowledge Base | ingest_document, query_knowledge, list_sources, remove_source | База знаний |
| Chat Management | chat_list, chat_create, chat_switch, chat_archive, chat_delete | Управление чатами |
| OS Integration | show_notification, watch_directory (V1), list_processes, open_application, get_system_info | OS управление |

**Skill Registry Interface:**

```typescript
interface SkillRegistry {
  // Регистрация skill из SKILL.md
  register(skillDef: SkillDefinition): void;

  // Получить все зарегистрированные tools
  getTools(): ToolDefinition[];

  // Выполнить tool call
  execute(name: string, params: Record<string, unknown>): Promise<ToolResult>;

  // Включить/отключить skill
  enable(name: string): void;
  disable(name: string): void;

  // Перезагрузить skills из файловой системы
  reload(): void;
}

interface SkillDefinition {
  name: string;
  description: string;
  tools: ToolDefinition[];
  permissions: PermissionPolicy[];
}

interface ToolDefinition {
  name: string;
  description: string;
  parameters: JSONSchema;
  category: "read" | "write" | "execute" | "system";
  returns: string;
}

interface ToolResult {
  success: boolean;
  data: unknown;
  error?: string;
  metadata?: Record<string, unknown>;
}
```

### 4.4 LLM Providers (packages/providers)

**Ответственность:** Единый интерфейс для 5 LLM провайдеров. Failover chain с circuit breaker и auth profile rotation.

**Входы:**
- LLM inference запросы от Agent Runtime (prompt, model config, streaming)
- Конфигурация провайдеров из osai.json

**Выходы:**
- Streaming / non-streaming ответы от LLM
- Статус провайдеров для observability

**Зависимости:**
- `packages/observability` -- логирование, метрики вызовов

**Provider Interface:**

```typescript
interface LLMProvider {
  readonly id: string;
  readonly name: string;

  // Проверка доступности
  isAvailable(): Promise<boolean>;

  // Генерация (non-streaming)
  complete(request: LLMRequest): Promise<LLMResponse>;

  // Генерация (streaming)
  stream(request: LLMRequest): AsyncIterable<LLMChunk>;

  // Подсчёт токенов
  countTokens(text: string): number;
}

interface LLMRequest {
  model: string;
  messages: ChatMessage[];
  tools?: ToolDefinition[];
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
}

interface LLMResponse {
  content: string;
  toolCalls?: ToolCall[];
  usage: TokenUsage;
  model: string;
  provider: string;
}

// Failover Chain Manager
interface ProviderChain {
  // Выполнить запрос с failover
  execute(request: LLMRequest): Promise<LLMResponse>;
  executeStream(request: LLMRequest): AsyncIterable<LLMChunk>;

  // Получить статус провайдеров
  getStatus(): ProviderStatus[];
}
```

**Failover Chain:**

```
Request -> Z.ai (https://api.z.ai/api/paas/v4, модель glm-5)
              |
              +-- OK -> response
              +-- 429 Rate Limit -> wait + retry + auth rotation
              +-- Error -> Yandex Foundation Models (fallback 1)
              |                +-- OK -> response
              |                +-- Error -> Anthropic Claude (fallback 2)
              |                            +-- OK -> response
              |                            +-- Error -> OpenAI GPT (fallback 3)
              |                                        +-- OK -> response
              |                                        +-- Error -> Ollama (local)
              +-- Timeout -> Ollama (local)
                               +-- response
```

**Circuit Breaker параметры:**
- `failure_threshold`: 5 последовательных ошибок
- `reset_timeout`: 30 000 ms
- При срабатывании -- провайдер исключается из chain до reset_timeout
- После reset -- пробный запрос; при успехе -- возвращается в chain

**Провайдеры:**

| ID | Провайдер | API формат | Тип |
|---|---|---|---|
| `z-ai` | Z.ai | OpenAI Chat Completions (`https://api.z.ai/api/paas/v4`, модель `glm-5`) | Cloud (primary) |
| `yandex` | Yandex Foundation Models | Yandex API | Cloud (fallback 1) |
| `anthropic` | Anthropic Claude | Anthropic Messages API | Cloud (fallback 2) |
| `openai` | OpenAI GPT | OpenAI Chat Completions | Cloud (fallback 3) |
| `ollama` | Ollama (local) | Ollama API (localhost:11434) | Local (offline fallback) |

### 4.5 Memory System (packages/memory)

**Ответственность:** Трёхуровневая память (Chat, Session, Long-term). RAG pipeline. Embedding generation. Context window management. Fact extraction.

**Входы:**
- Запросы на поиск из Agent Runtime (hook `before_memory_query`)
- Данные для извлечения фактов (hook `after_memory_extract`)
- Запросы от Memory Skill (remember, recall, forget)

**Выходы:**
- RAG context для инъекции в промпт
- Факты для хранения
- Контекст для Context Window Manager

**Зависимости:**
- `packages/providers` -- embedding generation (Ollama / Yandex / ONNX)
- better-sqlite3 -- structured storage
- sqlite-vec -- vector storage (primary)

**Three-Tier Memory Architecture:**

```
+--------------------------------------------------------------+
|                    MEMORY SYSTEM                               |
|                                                               |
|  +----------------+  +------------------+  +---------------+  |
|  | CHAT MEMORY    |  | SESSION MEMORY   |  | LONG-TERM     |  |
|  | (per-chat)     |  | (per-session)    |  | MEMORY        |  |
|  |                |  |                  |  | (shared)      |  |
|  | messages[]     |  | tool results     |  |               |  |
|  | chat state     |  | session state    |  | facts         |  |
|  | chat context   |  | channel ctx      |  | preferences   |  |
|  |                |  |                  |  | knowledge     |  |
|  | TTL: chat      |  | TTL: session     |  | patterns      |  |
|  | lifecycle      |  |                  |  | errors        |  |
|  +----------------+  +------------------+  +------+--------+  |
|                                                 |             |
|     SQLite: chats/chat_messages    SQLite:      |             |
|                                    sessions/    |             |
|                                    tool_results |             |
|                                                 |             |
|  +----------------------------------------------v--------+   |
|  | MEMORY MANAGER                                           |   |
|  | query() | store() | extract_facts() | forget()           |   |
|  | summarize() | prune_context()                              |   |
|  +----------+-----------+--------------------+---------------+   |
|             |           |                    |                   |
|  +----------v--+ +------v------+ +----------v----------+       |
|  | Embeddings  | | Vector      | | Context Window      |       |
|  | Provider    | | Storage     | | Manager             |       |
|  | (Ollama/    | | (sqlite-vec)| | (auto-pruning +     |       |
|  |  Yandex/    | |             | |  summarization)     |       |
|  |  ONNX)      | | optional:   | |                     |       |
|  |             | | Qdrant REST | |                     |       |
|  +-------------+ +-------------+ +---------------------+       |
+--------------------------------------------------------------+
```

**RAG Pipeline:**

```
1. User message received
2. Hook: before_memory_query
3. Embed user message (Ollama nomic-embed-text, 768-dim)
4. Vector search in sqlite-vec (top_k=5, similarity > 0.7)
5. Return relevant memories + KB chunks
6. Hook: before_prompt_build -- inject context into system prompt
7. After tool execution: extract facts from response
8. Store facts in Long-term Memory (shared across chats)
```

**Embedding Providers (configurable fallback chain):**

| Priority | Provider | Model | Dimension | Type |
|---|---|---|---|---|
| 1 | Ollama | nomic-embed-text | 768 | Local |
| 2 | Yandex | text-embedding | 256 | Cloud |
| 3 | ONNX | all-MiniLM-L6-v2 | 384 | Local offline |

**Context Window Manager:**

Приоритет обрезки (от последнего к первому):
1. Long-term memory RAG results (наименее критичное)
2. Knowledge base chunks
3. История tool-вызовов (оставить последние N)
4. Ранняя история диалога (summarize вместо удаления)
5. System prompt -- **никогда не обрезается**

Параметры:
- `maxTokens`: зависит от модели (из конфигурации)
- `reservedForResponse`: 1024 токена
- `summarizationThreshold`: при превышении 80% лимита

### 4.6 Knowledge Base (packages/knowledge-base)

**Ответственность:** Ингест документов (chunking + embedding), семантический поиск, управление источниками.

**Входы:**
- Документы от пользователя (через KB Skill)
- Запросы на поиск (через KB Skill или RAG pipeline)

**Выходы:**
- Сохранённые chunks с embeddings в sqlite-vec
- Результаты поиска с source attribution

**Зависимости:**
- `packages/memory` -- embeddings provider, vector storage

**Ingest Pipeline:**

```
Document -> Parse (txt/md/pdf) -> Chunking (1024 tokens, overlap 128)
    -> Embedding (Ollama/Yandex/ONNX) -> Store in sqlite-vec + SQLite
```

**Search Pipeline:**

```
Query -> Embedding -> Vector search (cosine similarity) -> Top-K results
    -> Relevance filtering (similarity > 0.7) -> Source attribution
```

### 4.7 Telegram Integration (в рамках packages/gateway)

**Ответственность:** Telegram Bot (grammY), Telegram Userbot (Telethon), bidirectional Mirror Engine.

**Структура внутри gateway:**

```
packages/gateway/src/channels/telegram/
+-- bot.ts          # grammY Telegram Bot handler
+-- userbot.ts      # Telethon userbot bridge (child_process)
+-- mirror.ts       # Bidirectional mirror engine
+-- manager.ts      # Telegram Manager (координация bot + userbot + mirror)
```

**Telegram Userbot Bridge Architecture:**

Userbot работает как Python microservice через child_process. Node.js parent process управляет lifecycle.

```
Node.js (gateway)                      Python (telethon_userbot/)
+------------------+                   +---------------------+
| UserbotBridge    |  <-- stdio -->   | Telethon Process    |
|                  |  (JSON messages) |                     |
| - start()        |                   | - authenticate()    |
| - stop()         |                   | - listen_messages() |
| - sendMessage()  |                   | - send_message()    |
| - onMessage(cb)  |                   | - wait_reply()      |
| - healthCheck()  |                   |                     |
+------------------+                   +---------------------+
```

**Bridge Protocol (JSON over stdio):**

```typescript
// Node -> Python
interface BridgeRequest {
  type: "auth" | "send_message" | "listen" | "get_chats" | "health";
  id: string;
  params: Record<string, unknown>;
}

// Python -> Node
interface BridgeResponse {
  type: "auth_result" | "message" | "send_result" | "error" | "health";
  id: string;
  data: unknown;
}
```

**Mirror Engine:**

```
+--------------+          Mirror Engine          +------------------+
| osaI Chat    | <-----------------------------> | Telegram Chat/   |
| (any channel)|                                | Channel          |
|              |  osai -> TG: send via bot/      |                  |
| User msg     |    userbot, with formatting     | User msg         |
| osaI resp    |                                | Bot/Userbot resp |
|              |  TG -> osaI: inject into        |                  |
|              |    agent loop via Gateway       |                  |
+--------------+                                +------------------+

Config:
- direction: "both" | "osai-to-tg" | "tg-to-osai"
- telegramChannel: "bot" | "userbot"
- formatPreservation: markdown/HTML
- mediaHandling: best-effort
```

### 4.8 Voice Stack (packages/voice) -- V1

**Ответственность:** Speech-to-Text и Text-to-Speech через локальные процессы с cloud fallback.

**Критическая корректировка:** Ollama НЕ поддерживает STT/TTS. Используются отдельные процессы:
- STT: whisper.cpp (child_process) -> Yandex SpeechKit (fallback)
- TTS: Piper TTS (child_process) -> Yandex SpeechKit (fallback)

**Voice Process Architecture:**

```
Node.js (packages/voice)            External Processes
+-------------------+               +------------------+
| VoiceManager      |               |                  |
|                   |  child_process| whisper.cpp      |
| STT Provider:     | ------------> | (stdin: audio    |
| - transcribe()    |               |  stdout: text)   |
| - detectLanguage()|               |                  |
|                   |               +------------------+
| TTS Provider:     |               +------------------+
| - synthesize()    |  child_process| Piper TTS        |
| - getVoices()     | ------------> | (stdin: text     |
|                   |               |  stdout: audio)  |
+-------------------+               +------------------+
        |
        | cloud fallback
        v
+-------------------+
| Yandex SpeechKit  |
| (REST API)        |
| STT + TTS         |
+-------------------+
```

**STT Provider Interface:**

```typescript
interface STTProvider {
  transcribe(audio: Buffer, options?: STTOptions): Promise<STTResult>;
  isAvailable(): Promise<boolean>;
}

interface STTResult {
  text: string;
  language: string;
  confidence: number;
}
```

**TTS Provider Interface:**

```typescript
interface TTSProvider {
  synthesize(text: string, options?: TTSOptions): Promise<Buffer>;
  getVoices(): Promise<VoiceInfo[]>;
  isAvailable(): Promise<boolean>;
}
```

### 4.9 OS Integration (packages/os-integration)

**Ответственность:** Desktop notifications, system info, process list. (System tray -- V1)

**Входы:**
- Запросы от Agent Runtime (через OS Integration skill)
- Запросы от Gateway (permission notifications)

**Выходы:**
- Desktop notifications (Linux: libnotify/D-Bus, Windows: Toast)
- System info (CPU, memory, disk)
- Process list

**Зависимости:**
- node-notifier -- desktop notifications
- systeminformation -- system info (pure JS)

### 4.10 Observability (packages/observability)

**Ответственность:** Structured logging (pino), audit logging. (OpenTelemetry -- V1)

**Входы:**
- Лог-сообщения от всех пакетов
- Audit records от Agent Runtime, Skills, Gateway

**Выходы:**
- JSON structured logs в stdout + файл (~/.osai/logs/)
- Audit records в SQLite

**Зависимости:**
- better-sqlite3 -- audit log storage
- pino -- structured JSON logging

### 4.11 CLI Client (packages/cli)

**Ответственность:** Интерактивный TUI чат, команды управления, WebSocket client для Gateway.

**Входы:**
- Пользовательский ввод (stdin)
- Streaming ответы от Gateway (WebSocket)

**Выходы:**
- TUI рендеринг (ink)
- Команды в Gateway

**Зависимости:**
- WebSocket client -- подключение к Gateway
- ink -- TUI rendering
- oclif -- CLI commands framework

**CLI Commands (MVP):**

```
osai                              # Interactive chat (current chat)
osai "command"                    # Quick execution
osai chat list|create|switch|delete|archive  # Chat management
osai session list|resume          # Session management
osai config                       # Configuration
osai skills list                  # Skills management
osai memory search "query"        # Memory search
osai status                       # System status
osai channel add telegram         # Channel setup
osai init                         # First-time setup
```

---

## 5. Data Flow

### 5.1 Основные потоки данных

**Поток 1: Обработка пользовательского запроса**

```
[User] --> [Channel Handler] --> [Chat Router] --> [Agent Runtime]
                                                      |
                                                      v
                                              [Context Assembly]
                                              (chat messages +
                                               RAG memory +
                                               KB chunks)
                                                      |
                                                      v
                                              [Model Inference]
                                              (Provider Chain
                                               with failover)
                                                      |
                                                      v
                                              [Tool Execution]
                                              (if tool_use)
                                                      |
                                                      v
                                              [Streaming Response]
                                                      |
                                                      v
                                              [Persistence]
                                              (SQLite: messages,
                                               audit log)
                                                      |
                                                      v
                                              [Fact Extraction]
                                              (long-term memory)
                                                      |
                                                      v
                                              [Delivery to Client]
```

**Поток 2: RAG Query**

```
[User Message] --> [before_memory_query hook]
                          |
                          v
                  [Embed User Message]
                  (Ollama nomic-embed-text)
                          |
                          v
                  [Vector Search]
                  (sqlite-vec, cosine similarity)
                          |
                          v
                  [Filter Results]
                  (top_k=5, similarity > 0.7)
                          |
                          v
                  [Inject into System Prompt]
                  ## Relevant Memory
                  - [fact] ...
                  - [knowledge] ...
                          |
                          v
                  [before_prompt_build hook]
```

**Поток 3: Telegram Mirror**

```
[Telegram Message] --> [Userbot/Bot Handler] --> [Mirror Engine]
                                                      |
                                                      v
                                              [Chat Router]
                                              (resolve osai chat)
                                                      |
                                                      v
                                              [Agent Runtime]
                                              (full agent loop)
                                                      |
                                                      v
                                              [Mirror Engine]
                                              (send response to TG)
                                                      |
                                                      v
                                              [Telegram Delivery]
```

### 5.2 Владение и жизненный цикл данных

| Данные | Хранение | Владелец | TTL | Удаление |
|---|---|---|---|---|
| Chat messages | SQLite (chat_messages) | packages/gateway | Chat lifecycle | При удалении чата |
| Chat metadata | SQLite (chats) | packages/gateway | Permanent | При удалении чата |
| Session state | SQLite (sessions) | packages/agent | Session lifecycle | При завершении сессии |
| Long-term memory | SQLite (memory_entries) + sqlite-vec | packages/memory | Permanent | `forget()` |
| Knowledge chunks | SQLite (knowledge_chunks) + sqlite-vec | packages/knowledge-base | Permanent | `remove_source()` |
| Audit log | SQLite (osai_audit_log) | packages/observability | Permanent (rotatable) | Manual cleanup |
| Config | osai.json (~/.osai/) | System | Permanent | `osai config` |
| TG session | Encrypted files (~/.osai/channels/) | packages/gateway | Permanent | Manual cleanup |

---

## 6. Control Flow

### 6.1 Ключевые последовательности взаимодействия

**Sequence 1: Запуск системы**

```
[User: osai start]
    |
    v
[CLI] --> [Gateway Process Start]
              |
              +-- [Init SQLite DB] (create tables if not exist)
              +-- [Load osai.json Config]
              +-- [Start WS Server] (:18789)
              +-- [Init Memory System] (sqlite-vec, embeddings)
              +-- [Init Skills Registry] (scan SKILL.md files)
              +-- [Init Provider Chain] (health check all providers)
              +-- [Start Channels]
              |     +-- [Telegram Bot Start] (if configured)
              |     +-- [Telegram Userbot Bridge Start] (if configured)
              +-- [Ready]
```

**Sequence 2: Обработка запроса с tool execution**

```
[Channel] --message--> [Gateway]
                           |
                           v
                    [Chat Router: resolve chat_id]
                           |
                           v
                    [Agent Runtime: intake]
                           |
                           v
                    [before_memory_query hook]
                           |-> [Memory: RAG search]
                           |-> [KB: semantic search]
                           v
                    [before_prompt_build hook]
                           |-> [Inject RAG context]
                           v
                    [before_model_resolve hook]
                           |-> [Provider Chain: select available provider]
                           v
                    [Model Inference] --streaming--> [Gateway] --stream--> [Channel]
                           |
                           v (if tool_use)
                    [before_tool_call hook]
                           |-> [Permission Check]
                           |    +-> read: auto-approve
                           |    +-> write/exec: send permission_request
                           |         +-> [User approves]
                           v
                    [Skill Registry: execute tool]
                           |
                           v
                    [after_tool_call hook]
                           |-> [Audit log]
                           |-> [Memory: extract facts]
                           v
                    [Persistence: save to SQLite]
                           |
                           v (loop if more tool_use)
                    [agent_end hook]
```

**Sequence 3: LLM Failover**

```
[Agent: model_inference]
    |
    v
[Provider Chain: try Z.ai]
    |
    +-- [HTTP call to Z.ai endpoint]
    |       |
    |       +-- 200 OK --> [Return response]
    |       +-- 429 Rate Limit
    |       |       |
    |       |       v
    |       |   [Auth Profile Rotation]
    |       |       |
    |       |       +-- [Try next API key]
    |       |       +-- [Wait + retry]
    |       |       +-- [All keys exhausted -> next provider]
    |       |
    |       +-- 5xx Error / Timeout
    |               |
    |               v
    |           [Circuit Breaker: increment failure count]
    |               |
    |               +-- [failure_count >= threshold?]
    |               |       |
    |               |       v
    |               |   [Open circuit: skip provider for reset_timeout]
    |               |
    |               v
    +-- [Try Yandex Foundation]
    |       +-- OK --> [Return response]
    |       +-- Error --> [Try Anthropic Claude]
    |                       +-- OK --> [Return response]
    |                       +-- Error --> [Try OpenAI GPT]
    |                                       +-- OK --> [Return response]
    |                                       +-- Error --> [Try Ollama (local)]
    |                                                       +-- [Return response]
    v
[All providers failed]
    |
    v
[Return error to user with diagnostics]
```

**Sequence 4: Chat Switch**

```
[User: chat switch <id>]
    |
    v
[Chat Manager: load target chat metadata from SQLite]
    |
    v
[on_chat_switch hook]
    |
    +-- [Save current chat context state]
    +-- [Load target chat context: messages, state]
    +-- [Rebuild session context for target chat]
    v
[Agent Runtime: ready for requests in new chat]
    |
    v
[Notify all connected channels about switch]
```

---

## 7. Cross-Cutting Concerns

### 7.1 Security (7-Layer Model)

```
Layer 1: Network
+-- WS server только на 127.0.0.1:18789
+-- Нет внешнего доступа к Gateway без Tailscale (V1)

Layer 2: Sandbox
+-- Docker containers для non-main sessions (когда Docker доступен)
+-- Graceful degradation: без Docker -- только permission prompts

Layer 3: Permissions
+-- Category-based: read=auto, write=confirm, exec=confirm
+-- Desktop notification для permission requests
+-- Пользовательский контроль через CLI и Telegram

Layer 4: File Sandbox
+-- allowed_dirs whitelist (конфигурируемый)
+-- blocked_patterns: ~/.ssh/**, ~/.gnupg/**, /etc/**, /boot/**
+-- Symlink resolution (предотвращение escape)

Layer 5: Shell Security
+-- Blocked commands list (hardcoded + конфигурируемый)
+-- Timeout enforcement (120s default)
+-- Command logging в audit log

Layer 6: Telegram Security
+-- Bot: allowedUsers whitelist
+-- Userbot: encrypted session storage (AES-256)
+-- Rate limiting для userbot (предотвращение бана)
+-- Никогда не использовать основной аккаунт

Layer 7: Audit
+-- Все действия логируются с trace_id
+-- Хранение в SQLite (osai_audit_log)
+-- 100% tool calls, permission requests, file access
```

### 7.2 Observability

**MVP:**
- pino structured JSON logging (уровни: error, warn, info, debug, trace)
- Correlation ID для связки логов с запросами
- Audit log в SQLite
- Логи в stdout (dev) + файл (~/.osai/logs/)

**V1:**
- OpenTelemetry traces (agent loop, model calls, tool executions)
- OpenTelemetry metrics (histograms, counters, gauges)
- Prometheus metrics endpoint (:9090)

### 7.3 Error Handling

**Стратегия:**

| Тип ошибки | Обработка |
|---|---|
| LLM provider error | Failover chain (провайдер -> следующий) |
| LLM rate limit (429) | Auth rotation + exponential backoff |
| All LLM providers down | Error пользователю + fallback на Ollama |
| Tool execution error | Log + report to user + continue agent loop |
| Permission denied | Skip tool + notify user |
| File sandbox violation | Block + audit log + error |
| Shell timeout | Kill process + audit log + error |
| SQLite error | Log + attempt recovery (WAL mode) |
| Vector storage error | Degrade: work without RAG |
| Telegram API error | Retry with backoff + log |
| Telethon userbot error | Fallback на bot-only mode |
| whisper.cpp/Piper error | Fallback на Yandex SpeechKit |
| Configuration error | Fail fast на startup + clear message |

**Principles:**
- Никогда не блокировать систему из-за одной ошибки
- Graceful degradation при недоступности компонентов
- Все ошибки логируются с контекстом (trace_id, chat_id, tool)
- Пользователь получает понятное сообщение: проблема + причина + рекомендация

### 7.4 Configuration

Единый конфигурационный файл: `~/.osai/osai.json` (или `openclaw.json` для совместимости).

**Структура конфигурации:**

```jsonc
{
  "agent": {
    "model": "z-ai/z-best",
    "failoverChain": ["z-ai/z-best", "yandex/yandexgpt-pro", "anthropic/claude-opus-4-6", "openai/gpt-4o", "ollama/llama3"],
    "circuitBreaker": { "failureThreshold": 5, "resetTimeoutMs": 30000 }
  },
  "providers": {
    "z-ai": { "type": "openai-compat", "baseUrl": "https://api.z.ai/api/paas/v4", "apiKey": "...", "model": "glm-5" },
    "yandex": { "type": "yandex-foundation", "catalogId": "...", "apiKey": "...", "model": "yandexgpt-pro" },
    "anthropic": { "type": "anthropic", "apiKey": "..." },
    "openai": { "type": "openai", "apiKey": "..." },
    "ollama": { "type": "ollama", "baseUrl": "http://localhost:11434", "model": "llama3" }
  },
  "memory": {
    "embeddings": {
      "default": "ollama",
      "ollama": { "model": "nomic-embed-text" },
      "fallback": "yandex"
    },
    "vectorStorage": {
      "default": "sqlite-vec",
      "qdrant": { "url": "http://localhost:6333" }
    },
    "rag": { "topK": 5, "minSimilarity": 0.7 }
  },
  "channels": {
    "telegram": {
      "bot": { "enabled": true, "token": "...", "allowedUsers": ["..."] },
      "userbot": { "enabled": false, "apiId": 12345, "apiHash": "...", "phone": "..." },
      "mirrors": [{ "chatId": "...", "telegramChatId": -100..., "direction": "both" }]
    }
  },
  "security": {
    "sandbox": { "allowedDirs": ["~/projects", "~/documents", "/tmp/osai"], "blockedPatterns": ["~/.ssh/**", "~/.gnupg/**", "/etc/**"] },
    "shell": { "blockedCommands": ["rm -rf /", "mkfs", ...], "timeout": 120 }
  },
  "skills": {
    "allowBundled": true,
    "extraDirs": ["~/.osai/workspace/skills", "~/.osai/skills"],
    "entries": {
      "filesystem": { "enabled": true },
      "shell": { "enabled": true, "timeout": 120 },
      "memory": { "enabled": true },
      "knowledge-base": { "enabled": true },
      "chat-management": { "enabled": true },
      "os-integration": { "enabled": true }
    }
  },
  "voice": {
    "stt": { "primary": "whisper-cpp", "fallback": "yandex" },
    "tts": { "primary": "piper", "fallback": "yandex" }
  }
}
```

---

## 8. Non-Functional Requirement Mapping

### 8.1 NFR -> Архитектурные элементы

| NFR ID | Требование | Архитектурное решение |
|---|---|---|
| NFR-P01 | TTFT overhead <= 500ms | Прямой вызов LLM без промежуточных прокси; embedding query выполняется параллельно с prompt building |
| NFR-P02 | RAG query <= 200ms (10K) | sqlite-vec (embedded, no network); cosine similarity в SQLite extension |
| NFR-P03 | Context pruning overhead <= 100ms | Priority-based pruning без LLM вызовов для summarization (только при overflow) |
| NFR-R01 | Failover time <= 10s | Circuit breaker с пробным запросом; timeout на LLM call (настраиваемый) |
| NFR-R02 | Zero data loss (graceful) | SQLite WAL mode; persistence после каждого шага agent loop |
| NFR-R03 | Graceful degradation | Каждый компонент имеет fallback: LLM -> Ollama, RAG -> без RAG, voice -> cloud |
| NFR-R04 | Mirror 100% delivery (text) | Persistent queue для mirror; retry на ошибке доставки; idempotency |
| NFR-R05 | Circuit breaker correctness | State machine: closed -> open -> half-open; пробный запрос в half-open |
| NFR-S01 | Data locality | Все данные в ~/.osai/; сетевой трафик только к LLM/embedding/voice API |
| NFR-S02 | TG session security | AES-256 encrypted session files; права доступа 600 |
| NFR-S03 | API key protection | osai.json права 600; API ключи не логируются |
| NFR-S04 | Sandbox isolation | Docker containers; resource limits (CPU, memory, no network) |
| NFR-SC01 | 20 active chats | SQLite schema с индексами; in-memory cache активных чатов |
| NFR-SC02 | 50K memory entries | sqlite-vec handles millions of vectors; RAG query <= 500ms |
| NFR-SC03 | 500 KB docs | Batch ingestion; chunking pipeline; progress reporting |
| NFR-U01 | Install <= 3 steps | `npm install -g @osai/cli` + `osai init` + configure API keys |
| NFR-U02 | CLI latency <= 50ms | ink TUI (React-like rendering); WebSocket connection pre-established |
| NFR-U03 | Error clarity | Structured error: description + cause + recommendation |
| NFR-M01 | TypeScript strict | tsconfig.json: `"strict": true`; CI enforced |
| NFR-M02 | Unit + Integration + E2E | vitest; GitHub Actions (Linux + Windows) |
| NFR-M03 | Monorepo modularity | pnpm workspace; каждый domain в отдельном package |
| NFR-M04 | Hook extensibility | 13 hook points; registration через конфигурацию |
| NFR-O01 | Structured logging | pino JSON; correlation IDs |
| NFR-O02 | OTel traces (V1) | @opentelemetry/sdk-node; spans для agent loop, model, tools |
| NFR-O03 | Metrics (V1) | prom-client; Prometheus-compatible endpoint |
| NFR-O04 | Audit completeness | 100% tool calls, permissions, file access в SQLite audit log |

---

## 9. Architectural Decisions & Trade-offs

### AD-001: Самостоятельная разработка core (не форк OpenClaw)

**Решение:** Core система (Gateway, Agent Runtime, Skills System) разрабатывается самостоятельно. Ссылки на OpenClaw сохраняются как архитектурные ориентиры.

**Альтернативы:**
- (A) Форк несуществующего OpenClaw -- невозможен (AS-01)
- (B) Использовать реальный аналог (Open Interpreter, Claude Code) -- не соответствует архитектурным требованиям
- (C) Самостоятельная разработка с нуля -- **выбрано**

**Обоснование:** OpenClaw upstream не верифицирован. Архитектурные концепции (gateway-centric, hook-based, skills-first) сохраняются как design principles. Увеличение объёма работ компенсируется отсутствием зависимости от несуществующего upstream и полной свободой в проектировании.

### AD-002: sqlite-vec как primary vector storage (не Qdrant embedded)

**Решение:** sqlite-vec (embedded vector search через better-sqlite3 extension) используется как primary vector storage. Qdrant -- optional external server через REST client.

**Альтернативы:**
- (A) Qdrant embedded -- невозможен для Node.js (AS-04)
- (B) Qdrant server как child_process -- дополнительные расходы на управление
- (C) sqlite-vec primary, Qdrant optional -- **выбрано**
- (D) Orama (in-process) -- fallback при проблемах sqlite-vec

**Обоснование:** sqlite-vec работает напрямую в SQLite через extension, что обеспечивает:
- Zero-config deployment (нет внешних процессов)
- Единая БД для structured + vector data
- Транзакционная целостность
- Sufficient performance для 50K+ записей (NFR-SC02)
Qdrant сохранён как optional для scenarios с >100K записей или повышенными требованиями к search quality.

**Trade-off:** sqlite-vec медленнее Qdrant server на очень больших объёмах. Для MVP (до 50K записей) разница несущественна.

### AD-003: whisper.cpp + Piper TTS как отдельные процессы

**Решение:** STT/TTS реализуются через whisper.cpp и Piper TTS, запускаемые как дочерние процессы (child_process). Ollama используется только для LLM и embeddings.

**Альтернативы:**
- (A) Ollama Whisper/Piper -- невозможен (AS-03)
- (B) ONNX whisper.js (Transformers.js) -- медленнее, выше потребление RAM
- (C) whisper.cpp + Piper TTS через child_process -- **выбрано**
- (D) Только cloud (Yandex SpeechKit) -- нарушает local-first

**Обоснование:**
- whisper.cpp -- быстрый C++ бинарник, CLI интерфейс, 99+ языков
- Piper TTS -- быстрый ONNX runtime, 30+ языков, CPU-friendly (используется в Home Assistant)
- child_process -- стандартный Node.js паттерн для бинарников
- Fallback на Yandex SpeechKit при недоступности

**Trade-off:** Требуется установка whisper.cpp и Piper TTS на целевой машине. Увеличивает footprint при установке.

### AD-004: Z.ai как primary LLM-провайдер (OpenAI-совместимый)

**Решение:** Z.ai используется как primary LLM-провайдер. Верифицирован 2026-03-30: endpoint `https://api.z.ai/api/paas/v4`, модель `glm-5`, OpenAI-совместимый API. Работает через OpenAI Node.js SDK с кастомным `baseURL`. Base URL остаётся конфигурируемым для совместимости.

**Альтернативы:**
- (A) Hardcoded Z.ai endpoint -- ограничивает гибкость
- (B) OpenRouter как primary -- привязка к конкретному сервису
- (C) Z.ai с конфигурируемым base URL -- **выбрано**

**Обоснование:** Z.ai верифицирован как реальный провайдер. OpenAI-совместимый API позволяет использовать OpenAI Node.js SDK напрямую. Конфигурируемый `baseURL` обеспечивает гибкость -- при необходимости можно переключиться на любой другой OpenAI-совместимый провайдер (OpenRouter, Groq, Fireworks AI и т.д.).

**Trade-off:** Пользователь должен самостоятельно выбрать и сконфигурировать primary провайдер. Нет "из коробки" лучшего качества -- зависит от выбранного endpoint.

### AD-005: Модульный монолит (не микросервисы)

**Решение:** Все компоненты в одном Node.js процессе, разделённые на pnpm workspace packages.

**Альтернативы:**
- (A) Микросервисы (отдельные процессы) -- избыточная сложность для solo developer
- (B) Монолит без модулей -- плохая поддерживаемость
- (C) Модульный монолит в monorepo -- **выбрано**

**Обоснование:** Solo developer, single-user desktop system, local-first. Микросервисы добавляют overhead (process management, inter-process communication, deployment complexity) без выигрыша. Модульность через pnpm packages обеспечивает чистые границы и потенциальную экстракцию в будущем.

### AD-006: Python microservice для Telethon userbot

**Решение:** Telethon работает как Python microservice, управляемый через child_process с JSON-over-stdio протоколом.

**Альтернативы:**
- (A) gram.js (TypeScript MTProto) -- менее зрелый, несовместим с Telethon
- (B) Telegram Bot API only -- ограничивает возможности (нет отправки от имени пользователя)
- (C) Telethon через HTTP API -- дополнительный порт, безопасность
- (D) Telethon через child_process stdio -- **выбрано**

**Обоснование:** stdio bridge -- самый простой и безопасный вариант: нет открытых портов, lifecycle управляется parent process, JSON протокол прост в отладке.

**Trade-off:** Двухязыковая архитектура. Требует Python 3.11+ на целевой машине. Усложняет CI и деплой.

### AD-007: SQLite WAL mode для всех данных

**Решение:** Все SQLite базы работают в WAL (Write-Ahead Logging) mode.

**Обоснование:** WAL обеспечивает:
- Concurrent reads во время writes ( Gateway читает, agent пишет)
- Crash recovery без data loss (< 1s, NFR-R02)
- Better performance для read-heavy workload (типично для osaI)

### AD-008: Единственная SQLite БД (или минимальное количество)

**Решение:** Все structured данные в одной SQLite БД (`~/.osai/data/osai.db`). Векторные данные -- в sqlite-vec extension той же БД.

**Альтернативы:**
- (A) Отдельные БД для каждого домена -- проще партиционирование, сложнее backup
- (B) Единая БД -- **выбрано**

**Обоснование:** Упрощает backup (один файл), транзакции между доменами, совместное использование sqlite-vec extension.

---

## 10. Assumptions & Risks

### 10.1 Архитектурные предположения

| # | Предположение | Уровень доверия | Влияние при ошибке |
|---|---|---|---|
| A-ARCH-01 | sqlite-vec стабильно работает с better-sqlite3 на Linux и Windows | 70% | Fallback на Orama (in-process vector search) или Qdrant server |
| A-ARCH-02 | whisper.cpp binary доступен и работает через child_process | 85% | Fallback на ONNX whisper.js (медленнее) или Yandex SpeechKit |
| A-ARCH-03 | Piper TTS binary доступен и работает через child_process | 80% | Fallback на Yandex SpeechKit (cloud only) |
| A-ARCH-04 | better-sqlite3 prebuild binaries доступны для Linux + Windows | 85% | Ручная сборка native modules (требует C++ toolchain) |
| A-ARCH-05 | grammY стабилен для Telegram Bot API 8.x | 95% | Минимальное влияние, зрелый фреймворк |
| A-ARCH-06 | Telethon может работать через child_process stdio bridge | 85% | Рефакторинг на HTTP bridge |
| A-ARCH-07 | Node.js event loop не блокируется синхронными операциями | 90% | Performance degradation; требуются async wrappers |
| A-ARCH-08 | 20 активных чатов не вызывают memory/performance проблем | 80% | Снижение лимита; оптимизация в SQLite queries |
| A-ARCH-09 | Ollama REST API стабильный и достаточно быстрый | 90% | Увеличение timeout; fallback на cloud провайдеры |
| A-ARCH-10 | Docker доступен на целевых машинах для sandbox | 70% | Graceful degradation: sandbox mode недоступен, permission prompts только |

### 10.2 Риски архитектуры

| ID | Риск | Вероятность | Влияние | Митигация |
|---|---|---|---|---|
| R-ARCH-01 | sqlite-vec не работает на Windows | 30% | Medium | Fallback на Orama; Qdrant server как опция |
| R-ARCH-02 | Python microservice (Telethon) сложен в управлении | 40% | Medium | Чёткий lifecycle manager; health check; graceful restart |
| R-ARCH-03 | Solo developer не успевает реализовать полный MVP | 70% | High | Строгая приоритизация: CLI + 1 LLM + basic memory + FS skill |
| R-ARCH-04 | Agent loop слишком сложен для MVP | 30% | High | Итеративная реализация: сначала simple loop, потом hooks + tools |
| R-ARCH-05 | Native modules (better-sqlite3) не собираются | 20% | Medium | Prebuild binaries; CI на Windows; fallback на alternatives |
| R-ARCH-06 | Telegram userbot бан аккаунта | 60% | Medium | Rate limiting; fallback на bot-only; отдельный аккаунт |

---

## 11. Open Questions

| # | Вопрос | Статус | Критичность |
|---|---|---|---|
| OQ-ARCH-01 | Z.ai endpoint -- верифицирован (RESOLVED) | Решён | Low -- Z.ai endpoint: `https://api.z.ai/api/paas/v4`, модель `glm-5` |
| OQ-ARCH-02 | Требуется ли поддержка русского языка для STT/TTS в MVP? | Открыт | Low -- whisper.cpp + Piper поддерживают RU |
| OQ-ARCH-03 | Как управлять Python microservice (venv vs Poetry, версия Python)? | Открыт | Medium -- влияет на деплой |
| OQ-ARCH-04 | Медиа в Telegram mirror: размер лимиты, формат конвертации, кэширование? | Открыт | Medium -- влияет на UX mirror |
| OQ-ARCH-05 | Какова политика обработки редактирования/удаления сообщений в mirror? | Открыт | Low -- edge case |
| OQ-ARCH-06 | Требуется ли VAD (Voice Activity Detection) в MVP или только V1? | Открыт | Low -- voice V1 |
| OQ-ARCH-07 | Максимальный размер документа для KB ingest pipeline? | Открыт | Low -- влияет на memory consumption |

---

## 12. Dependency Graph (Packages)

```
                    +-------+
                    |  cli  |  (entry point for user)
                    +---+---+
                        |
                   (WebSocket client)
                        |
+--------+       +------v------+       +---------------+
| os-    |<------|  gateway    |------>|   agent       |
| integ. |       |  (DOMAIN-   |       | (DOMAIN-002)  |
|        |       |   001)      |       +-------+-------+
+--------+       +------+------+               |
                        |                      |
                  (Chat CRUD)        +---------+---------+
                        |              |         |         |
                   +----v----+  +-----v---+ +---v----+ +--v----------+
                   | memory/ |  | knowl-  | |skills- | | providers/  |
                   | (DOMAIN-|  | edge-   | |core/   | | (DOMAIN-    |
                   |  004)   |  | base/   | |+skills-| |  008)      |
                   |         |  | (DOMAIN-| | osai/  | |             |
                   | [sqlite |  |  005)   | |(DOMAIN-| | [LLM chain |
                   |  -vec]  |  |         | | 003)  | |  + failover|
                   +---------+  +---------+ +--------+ |  + CB]     |
                                                              +--------+

+---------------+       +---------------+
| observability/|<------|    voice/     |  (V1 milestone)
| (DOMAIN-010)  |       | (DOMAIN-007)  |
+---------------+       +---------------+

External:
  better-sqlite3, sqlite-vec, pino, ws, grammY, ink, oclif, undici
  (child_process): whisper.cpp, Piper TTS, Telethon (Python)
```

---

**Версия документа:** v1.0
**Дата создания:** 2026-03-30
**Автор:** Solution Architect Agent
**Статус:** Завершён
