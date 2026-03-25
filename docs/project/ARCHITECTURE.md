# Architecture: osaI -- Operation System AI

**Version:** v1.0
**Date:** 2026-03-25
**Source:** ARCHITECTURE_OVERVIEW.md v1.0, SYSTEM_VERIFICATION.md v1.0
**System Quality Score:** 9.31/10

---

## 1. Архитектурный обзор

### 1.1 Архитектурный стиль

**Gateway-centric layered architecture** с event-driven internals и plugin-based extensibility.

Ключевые принципы:

- **Gateway-centric** -- единый WebSocket control plane как точка входа для всех клиентов
- **Layered** -- Gateway -> Agent Runtime -> Skills -> Infrastructure
- **Event-driven (hooks)** -- 11 hook points для расширения agent loop
- **Plugin-based (skills)** -- декларативные SKILL.md навыки с runtime tool registration
- **Local-first monolith** -- все компоненты в едином Node.js процессе (за исключением Qdrant и Docker)

### 1.2 Ключевые атрибуты качества

| Атрибут | Приоритет | Целевое значение |
|---------|-----------|-----------------|
| Security | CRITICAL | 6-layer model |
| Reliability | HIGH | Model failover, circuit breaker, session persistence |
| Maintainability | HIGH | TypeScript strict, acyclic deps, 70%+ unit coverage |
| Observability | HIGH | OTel traces/metrics/logs, audit log, Prometheus |
| Performance | MEDIUM | Agent overhead < 50ms, RAG < 200ms, WS < 10ms |
| Extensibility | MEDIUM | Hook system, SKILL.md skills, workspace custom skills |
| Scalability | LOW | Single-user, до 10 concurrent sessions |

### 1.3 Системные границы

```
+------------------------------------------------------------------+
|                    USER MACHINE                                   |
|                                                                   |
|  +------------------------------------------------------------+  |
|  |                      osaI System                            |  |
|  |                                                             |  |
|  |  [CLI] --WS--> [Gateway] --WS--> [Dashboard]               |  |
|  |                  |                                           |  |
|  |                  +--> Agent Runtime --> Skills --> Memory   |  |
|  |                                                             |  |
|  |  [System Tray] <-- [OS Integration]                         |  |
|  +------------------------------------------------------------+  |
|                                                                   |
|  +----------------+  +----------------+  +-------------------+    |
|  | SQLite (osai)  |  | Qdrant Server  |  | Ollama (optional) |    |
|  | (data/osai.db) |  | (Docker/6333)  |  | (localhost:11434) |    |
|  +----------------+  +----------------+  +-------------------+    |
+------------------------------------------------------------------+
         |                    |                     |
  (cloud APIs)       (local server)        (local LLM)
         |
  +-------------+
  | Anthropic   |
  | OpenAI      |
  +-------------+
         |
  +-------------+     +----------------+
  | Telegram    |     | Tailscale      |
  | WhatsApp    |     | (E2E tunnel)  |
  +-------------+     +----------------+
```

**Внутри системы:** Gateway, Agent Runtime, Skills, Memory, Observability, OS Integration, CLI, Dashboard
**Вне системы (external):** LLM API, Qdrant Server, Docker, Tailscale, мессенджеры

---

## 2. Высокоуровневая диаграмма

```
+====================================================================+
|                        osaI SYSTEM                                   |
|                                                                      |
|  LAYER 1: CLIENT INTERFACES                                         |
|  +----------+  +-----------+  +----------+  +----------+            |
|  |   CLI    |  | Dashboard |  | Telegram |  | WhatsApp |            |
|  +----+-----+  +-----+-----+  +----+-----+  +----+-----+            |
|       |               |              |              |                |
|       +-------+-------+------+-------+------+-------+                |
|               |              |                                    |
|               v              v                                    |
|  LAYER 2: GATEWAY (WS Control Plane)  ws://127.0.0.1:18789        |
|  +-----------------------------------------------------------+     |
|  |  WS Server          Session Router      Channel Handlers  |     |
|  +---------------------------+-----------------------------------+  |
|                              |                                      |
|                              v                                      |
|  LAYER 3: AGENT RUNTIME                                            |
|  +-----------------------------------------------------------+     |
|  |  intake -> context -> inference -> tools -> stream -> persist|   |
|  +-----------------------------------------------------------+     |
|                              |                                      |
|  LAYER 4: SKILLS + EXTENSIONS                                     |
|  +------------+ +------------+ +------------+ +------------------+  |
|  | skills-core| |skills-osai | |   memory   | | observability    |  |
|  | filesystem | |os-integ.   | | +RAG+embed | | +OTel+audit      |  |
|  | shell      | |memory skill| |            | |                  |  |
|  | browser    | |knowledge-b.| |            | |                  |  |
|  | http       | |            | |            | |                  |  |
|  +------------+ +------------+ +------------+ +------------------+  |
|                              |                                      |
|  LAYER 5: INFRASTRUCTURE                                          |
|  +--------+ +--------+ +----------+ +--------+ +----------+         |
|  | SQLite | | Qdrant | |  Docker  | |pino log| | OTel exp.|         |
|  +--------+ +--------+ +----------+ +--------+ +----------+         |
|                                                                      |
|  CROSS-CUTTING: OS Integration (tray, notifications, file watcher)  |
+====================================================================+
```

---

## 3. Подсистемы (домены)

### 3.1 @osai/types (packages/types)

**Ответственность:** Общие типы для всех пакетов. WS protocol types, session types, config types, error types.

**Экспорты:**
- `InboundMessage`, `OutboundMessage` -- WS protocol message types
- `SessionType`, `SessionState`, `ActivationMode` -- session model
- `OsaIConfig` -- конфигурационная схема
- `OsaIError`, `AgentError`, `ModelError`, `SandboxViolationError` -- error hierarchy
- `ToolSchema`, `ToolResult`, `ToolContext` -- tool system types
- `HookPoint`, `HookContext`, `HookHandler` -- hook system types
- `MemoryCategory`, `MemoryEntry` -- memory types
- `AuditEntry` -- audit types

**Зависимости:** Нет (standalone)

---

### 3.2 @osai/gateway (packages/gateway)

**Ответственность:** Единая точка входа для всех клиентских подключений. WebSocket server, маршрутизация сообщений, session router, channel handlers.

**Ключевые классы:**
- `Gateway` -- WS server lifecycle, session management, channel registration
- `Session` -- session state, history, metadata
- `SessionRouter` -- маршрутизация сообщений по session type и activation mode

**WS Protocol (7 типов сообщений):**

| Тип | Направление | Описание |
|-----|-------------|----------|
| `message` | Client -> Gateway | Пользовательское сообщение |
| `command` | Client -> Gateway | Управляющие команды |
| `permission_response` | Client -> Gateway | Подтверждение/отклонение permission request |
| `subscribe` | Client -> Gateway | Подписка на события |
| `block` | Gateway -> Client | Структурированный контент (text, code, image, card, table) |
| `tool_stream` | Gateway -> Client | Реалтайм результаты tool выполнения |
| `permission_request` | Gateway -> Client | Запрос подтверждения на операцию |
| `error` | Gateway -> Client | Ошибка с severity и message |
| `status` | Gateway -> Client | Обновление состояния сессии |
| `event` | Gateway -> Client | Системное событие |

**Session Types:**

| Type | Описание |
|------|----------|
| `main` | Persistent 1:1 сессия |
| `group` | Изолированная сессия с group context |
| `isolated` | Полностью изолированная сессия |

**Зависимости:** @osai/types

---

### 3.3 @osai/config (packages/config)

**Ответственность:** Загрузка, валидация и hot-reload конфигурации. Чтение ~/.osai/openclaw.json.

**Ключевые классы:**
- `ConfigLoader` -- чтение, валидация, defaults
- `ConfigWatcher` -- file watcher для hot-reload

**Секции конфигурации:** gateway, model, session, skills, security, memory, observability, osIntegration

**Зависимости:** @osai/types

---

### 3.4 @osai/agent (packages/agent)

**Ответственность:** Agent loop, hook system, model resolver + failover, skills loader + executor, context assembly, session pruning.

**Ключевые классы:**
- `AgentRuntime` -- основной агент, processMessage(), registerHook(), loadSkills()
- `HookManager` -- управление hook handlers (register, unregister, execute)
- `ModelResolver` -- выбор модели, failover chain, circuit breaker
- `SkillLoader` -- загрузка SKILL.md, registration в SkillRegistry
- `ContextAssembler` -- сборка контекста для LLM

**Agent Loop Flow:**

```
[intake] --> [before_model_resolve]
      --> [context_assembly] --> [before_prompt_build]
      --> [model_inference (streaming)]
          +-> [before_tool_call] -> [execute] -> [after_tool_call]
      --> [streaming to clients]
      --> [persistence] --> [agent_end]
```

**Hook Points (11):**

| Hook | Момент вызова | Описание |
|------|---------------|----------|
| `before_model_resolve` | Перед выбором модели | Модификация выбора модели |
| `before_prompt_build` | Перед сборкой промпта | Инъекция memory context |
| `before_agent_start` | Перед началом agent loop | Инициализация |
| `before_tool_call` | Перед вызовом tool | Permission check, sandbox verification |
| `after_tool_call` | После вызова tool | Metrics, audit, fact extraction |
| `agent_end` | Завершение agent loop | Cleanup, notifications |
| `on_error` | При ошибке | Error handling, fallback |
| `before_memory_query` | Перед memory RAG query | Модификация query |
| `after_memory_extract` | После извлечения фактов | Обработка результатов |
| `on_file_access` | При доступе к файлу | Audit logging |
| `on_desktop_notification` | При отправке уведомления | Logging |

**Model Failover Chain:**
```
Claude (anthropic) -> GPT-4o (openai) -> Ollama (local)
```

**Зависимости:** @osai/types, @osai/config

---

### 3.5 @osai/skills-core (packages/skills-core)

**Ответственность:** Встроенные (bundled) skills: Filesystem, Shell, Browser, HTTP. SKILL.md parser, Skill Registry, File Sandbox, Shell Security.

**Ключевые классы:**
- `SkillRegistry` -- register, unregister, getToolSchemas, getToolExecutor
- `SkillParser` -- парсинг SKILL.md файлов
- `FileSandbox` -- allowed dirs, blocked patterns, symlink resolution
- `ShellSecurity` -- blocked commands, timeout, logging

**Bundled Skills:**

| Skill | Tools | Category |
|-------|-------|----------|
| Filesystem | read_file, write_file, list_directory, search_files, move_file, delete_file | read/write |
| Shell | execute | execute |
| Browser | navigate, click, fill, screenshot | read/execute |
| HTTP | GET, POST, PUT, DELETE | execute |

**SKILL.md Format:**
```markdown
# Skill Name
Description of the skill.

## Tools
### tool_name
- Description
- Category: read|write|execute|system
- Parameters: JSON Schema

## Examples
...
```

**Зависимости:** @osai/types, @osai/agent

---

### 3.6 @osai/skills-osai (packages/skills-osai)

**Ответственность:** osaI-specific skills: OS Integration, Memory, Knowledge Base.

**Skills:**

| Skill | Tools | Описание |
|-------|-------|----------|
| OS Integration | show_notification, watch_directory, list_processes, open_application, get_system_info | Desktop OS операции |
| Memory | remember, recall, forget, summarize_session | Долгосрочная память |
| Knowledge Base | ingest_document, query_knowledge, list_sources, remove_source | База знаний |

**Hook регистрации:**
- `before_memory_query` -> MemoryManager.queryForContext
- `after_tool_call` -> Metrics + Audit
- `on_file_access` -> Audit logging
- `on_desktop_notification` -> OsIntegrationManager.notify

**Зависимости:** @osai/types, @osai/agent, @osai/memory, @osai/os-integration

---

### 3.7 @osai/memory (packages/memory)

**Ответственность:** Двухуровневая память: short-term (SQLite) + long-term (SQLite + Qdrant), RAG pipeline, embedding generation, fact extraction, knowledge base.

**Ключевые классы:**
- `MemoryManager` -- store, recall, forget, queryForContext, ingestDocument
- `EmbeddingProvider` -- fallback chain: OpenAI -> Ollama -> ONNX
- `RagPipeline` -- query -> embed -> search -> format
- `FactExtractor` -- извлечение фактов из ответов агента

**Memory Categories:**

| Category | Описание |
|----------|----------|
| FACT | Факты извлечённые из разговоров |
| PREFERENCE | Пользовательские предпочтения |
| KNOWLEDGE | Знания о предметных областях |
| ERROR | Записи об ошибках и их решениях |
| PATTERN | Выявленные паттерны поведения |

**Embedding Fallback Chain:**
```
OpenAI (text-embedding-3-small, 1536-dim)
  -> Ollama (nomic-embed-text, 768-dim)
    -> ONNX (all-MiniLM-L6-v2, 384-dim)
```

**Зависимости:** @osai/types

---

### 3.8 @osai/security (packages/security)

**Ответственность:** Permission Manager, Docker sandbox infrastructure, audit trail coordination.

**Ключевые классы:**
- `PermissionManager` -- category-based checks, permission_request/response flow
- `DockerSandbox` -- container lifecycle, resource limits, network isolation

**Permission Categories:**

| Category | Поведение | Примеры |
|----------|-----------|---------|
| `read` | AUTO APPROVE | read_file, list_directory, get_system_info |
| `write` | CONFIRM REQUIRED | write_file, move_file, delete_file |
| `execute` | CONFIRM REQUIRED | shell execute, browser actions |
| `system` | AUTO APPROVE | get_system_info, list_processes |

**Зависимости:** @osai/types, @osai/agent

---

### 3.9 @osai/observability (packages/observability)

**Ответственность:** OpenTelemetry integration, structured logging (pino), audit log, Prometheus exporter.

**Ключевые классы:**
- `ObservabilityManager` -- spans, metrics, audit
- Metrics: counters, histograms, gauges

**Traces (span hierarchy):**
```
agent.loop
  +-- agent.context_assembly
  +-- agent.inference
  +-- agent.tool_call
  |     +-- filesystem.read_file
  |     +-- shell.execute
  +-- memory.rag_query
  +-- memory.extract
```

**Key Metrics:**
- Counters: `osai.agent.llm.tokens_input`, `osai.agent.llm.tokens_output`, `osai.agent.llm.cost_usd`, `osai.agent.tool_call.total`
- Histograms: `osai.agent.session.duration_ms`, `osai.agent.tool_call.duration_ms`, `osai.memory.query.duration_ms`
- Gauges: `osai.memory.entries.total`, `osai.session.active`

**Зависимости:** @osai/types

---

### 3.10 @osai/os-integration (packages/os-integration)

**Ответственность:** Desktop OS integration: system tray, desktop notifications, file watcher, process management, service management.

**Ключевые классы:**
- `OsIntegrationManager` -- createTray, notify, watchDirectory, listProcesses, getSystemInfo
- Capability detection: X11 vs Wayland, desktop availability

**Зависимости:** @osai/types (standalone от остальных osai пакетов)

---

### 3.11 @osai/channels (packages/channels)

**Ответственность:** Channel handlers для мессенджеров: Telegram (grammY), WhatsApp (Baileys).

**Ключевые классы:**
- `TelegramChannelHandler` -- бот через grammY framework
- `WhatsAppChannelHandler` -- клиент через Baileys (QR-code auth)
- Оба реализуют единый `ChannelHandler` interface из Gateway

**Зависимости:** @osai/types, @osai/gateway

---

### 3.12 @osai/cli (apps/cli)

**Ответственность:** CLI клиент с интерактивным чатом, session management, конфигурацией.

**CLI Commands:**
```
osai                          # Interactive chat
osai "command text"           # Quick command mode
osai chat                     # Explicit chat command
osai session list             # List sessions
osai session resume <id>      # Resume session
osai config                   # Edit configuration
osai config show              # Display config
osai skills list              # List skills
osai skills enable <name>     # Enable skill
osai skills disable <name>    # Disable skill
osai memory search <query>    # Search long-term memory
osai memory stats             # Memory statistics
osai channel list             # List channels
osai status                   # System status
osai init                     # Initialize ~/.osai/
osai version                  # Version info
```

**Зависимости:** @osai/types, @osai/gateway (WS client)

---

### 3.13 @osai/dashboard (apps/dashboard)

**Ответственность:** Web Dashboard на SvelteKit + TailwindCSS.

**Routes:**
```
/                   # Chat area (main)
/sessions           # Session list
/sessions/:id       # Session detail
/traces             # Agent trace view
/traces/:id         # Trace detail
/memory             # Memory search
/memory/:id         # Memory detail
/settings           # Configuration
/status             # System status (metrics, health)
```

**Зависимости:** @osai/types (WS client для Gateway)

---

## 4. Граф зависимостей пакетов

```
                    +---------+
                    | @osai/  |
                    |  types  |
                    +----+----+
                         |
        +--------+-------+-------+--------+--------+---------+
        |        |               |        |        |         |
        v        v               v        v        v         v
  +----------+ +--------+ +-----------+ +--------+ +------+ +----------+
  | gateway  | | config | | os-integ. | |security| |memory| |observab. |
  +----+-----+ +--------+ +-----------+ +----+---+ +------+ +----------+
       |                                           |
       v                                           v
  +----------+                              +-------------+
  | channels |                              | skills-osai |
  +----------+                              +------+------+----+
                                                  |         |
                                                  v         v
                                           +--------+ +---------+
                                           |  agent | |skills-  |
                                           |        | |core     |
                                           +--------+ +---------+
                                                  |
                                                  v
                                           +----------+
                                           |   cli    |
                                           +----------+
                                                  v
                                           +-----------+
                                           | dashboard |
                                           +-----------+
```

**Порядок сборки (dependency levels):**

```
Level 0:  @osai/types
Level 1:  @osai/config, @osai/os-integration, @osai/memory, @osai/observability
Level 2:  @osai/gateway, @osai/security
Level 3:  @osai/agent, @osai/channels
Level 4:  @osai/skills-core, @osai/skills-osai
Level 5:  @osai/cli, @osai/dashboard
```

**Критический путь сборки:** types -> config -> gateway -> agent -> skills-core -> skills-osai -> cli

---

## 5. Security Model (6 слоёв)

Последовательная проверка при каждом tool call:

```
User message -> Agent -> Tool Call Request
    |
    v
[L1: Network]  WS server на 127.0.0.1; Tailscale для remote
    |
    v
[L2: Docker]   Non-main sessions в Docker containers; resource limits; network isolation
    |
    v
[L3: Permissions]  read=auto, write=confirm, exec=confirm, system=auto
    |
    v
[L4: File Sandbox]  Allowed dirs, blocked patterns, symlink resolution, path traversal prevention
    |
    v
[L5: Shell Security]  Blocked commands, timeout (120s), command logging, pattern detection
    |
    v
[L6: Audit]  All actions logged with trace_id, immutable records, queryable via API
    |
    v
Tool Execution
```

| Слой | Компонент | Механизм | Пакет |
|------|-----------|----------|-------|
| L1 Network | Gateway | WS bind 127.0.0.1; Tailscale E2E | gateway |
| L2 Sandbox | Docker | Containers для non-main sessions; resource limits | security |
| L3 Permissions | PermissionManager | Category-based; desktop notifications | security |
| L4 File Sandbox | FileSandbox | Allowed dirs, blocked patterns, symlink resolution | skills-core |
| L5 Shell Security | ShellSkill | Blocked commands, timeout, logging | skills-core |
| L6 Audit | ObservabilityManager | Immutable log, trace_id correlation | observability |

**File Sandbox Rules:**
- Allowed dirs: `~/projects`, `~/documents`, `/tmp/osai`
- Blocked patterns: `~/.ssh/**`, `~/.gnupg/**`, `/etc/**`, `/boot/**`, `/proc/**`, `/dev/**`, `/sys/**`
- Symlink resolution через `fs.realpathSync()`
- Path traversal prevention

**API Key Security:**
- Хранение: `~/.osai/openclaw.json`
- File permissions: `0600` (owner read/write only)
- No logging, no transmission except to respective API endpoints

---

## 6. Data Flow

### 6.1 Primary Data Flow: User Message -> Agent Response

```
User types message
    |
    v
[Gateway] receives WS message { type: "message" }
    |
    v
[Session Router] resolves session, checks activation mode
    |
    v
[Agent Runtime] agent.processMessage()
    |
    +--> [before_model_resolve] hook
    |        - Select model (Claude primary)
    |
    +--> [Context Assembly]
    |        - System prompt (AGENTS.md, SOUL.md)
    |        - Tool schemas (from SkillRegistry)
    |        - Session history (SQLite short-term)
    |        - [before_memory_query] -> RAG query
    |             -> Embed user message
    |             -> Qdrant search (top_k=5)
    |             -> Format relevant memories
    |
    +--> [before_prompt_build] hook
    |        - Inject memory context
    |
    +--> [Model Inference] (streaming)
    |        - Send to Claude API
    |        - Parse: text blocks + tool_call requests
    |
    +--> [Tool Execution Loop]
    |        For each tool_call:
    |        +--> [before_tool_call] hook
    |        |     - Permission check (read=auto, write/exec=confirm)
    |        |     - Sandbox verification
    |        |     - If confirm: send permission_request -> Client
    |        +--> [Skill Executor] executes tool
    |        +--> Stream tool_stream to Clients
    |        +--> [after_tool_call] hook (metrics, audit)
    |
    +--> [Streaming] text blocks to Clients
    |
    +--> [Persistence] messages + tool results to SQLite
    |        - Session pruning if context overflow
    |
    +--> [agent_end] hook
    |        - Desktop notification
    |        - Metrics flush
    |        - Fact extraction
    |
    v
[Gateway] sends final status to clients
```

### 6.2 RAG Pipeline Data Flow

```
User message (text)
    |
    v
[EmbeddingProvider.embed(text)]
    +--> Try OpenAI (1536-dim)
    +--> Try Ollama (768-dim)
    +--> Try ONNX (384-dim)
    |
    v
[QdrantClient.search("osai_memory", vector, top_k=5, threshold=0.7)]
    |
    v
[Format results] -> "Relevant Memory" section
    |
    v
[Inject into system prompt before model inference]
```

### 6.3 Permission Request Flow

```
Agent requests write/exec tool call
    |
    v
[before_tool_call hook]
    |
    v
[PermissionManager.check(toolCall)]
    +--> category == "read"     --> AUTO APPROVE
    +--> category == "write/exec" --> CONFIRM REQUIRED
             |
             v
         [Gateway] sends permission_request to client
             |
             v
         [Client] displays: "osaI wants to write to: ~/file.md" [y/N]
             |
             v
         [Client] sends permission_response (approved/denied)
             |
             v
         [Agent] execute or abort tool call
             |
             v
         [Audit log] record decision
```

### 6.4 Data Ownership

| Тип данных | Пакет-владелец | Хранилище | TTL | Политика удаления |
|-----------|----------------|-----------|-----|-------------------|
| Session messages | agent | SQLite | Session lifetime | Auto-pruned, manual delete |
| Long-term memory | memory | SQLite + Qdrant | Permanent | Explicit `forget` |
| Knowledge base | memory | SQLite + Qdrant | Until removal | Explicit `remove_source` |
| Audit log | observability | SQLite | Permanent, immutable | Never deleted |
| Structured logs | observability | File (~/.osai/logs/) | 7 дней | Auto-rotation |
| Configuration | config | File (~/.osai/openclaw.json) | Until modified | Manual |
| Workspace files | agent | File system (~/.osai/workspace/) | Until modified | Manual |

---

## 7. Error Handling

### Error Hierarchy

```
OsaIError (base)
  +-- AgentError
  |     +-- ModelError
  |     |     +-- ModelUnavailableError   -> fallback to next provider
  |     |     +-- RateLimitError          -> wait + retry with backoff
  |     |     +-- AuthError               -> rotate auth profile
  |     +-- ContextOverflowError          -> session pruning
  |     +-- ToolExecutionError
  |           +-- PermissionDeniedError    -> notify user, halt task
  |           +-- SandboxViolationError    -> audit log, deny access
  |           +-- TimeoutError             -> retry or abort
  +-- GatewayError
  |     +-- SessionNotFoundError
  |     +-- ChannelError
  +-- MemoryError
  |     +-- QdrantUnavailableError        -> degrade (no memory context)
  |     +-- EmbeddingError                 -> skip memory injection
  +-- SkillError
  |     +-- SkillLoadError
  |     +-- ToolNotFoundError
  +-- OsIntegrationError
        +-- TrayUnavailableError          -> fallback CLI-only
        +-- NotificationError             -> log warning, continue
```

### Error Severity Strategies

| Severity | Strategy | Пример |
|----------|----------|--------|
| LOW | Retry silently (max 3, exponential backoff) | Transient network error |
| MEDIUM | Notify user, retry (max 3) | Embedding provider failure |
| HIGH | Halt task, ask user | Sandbox violation |
| CRITICAL | Abort session, log full context | Model failover exhausted |

**Retry:** base delay 1s, max delay 30s, jitter +/-25%
**Circuit Breaker:** 3 consecutive errors -> 30s cooldown -> auto-recovery

---

## 8. Startup / Shutdown

### Startup Sequence

```
1. Load config (~/.osai/openclaw.json)
2. Initialize ObservabilityManager (OTel, pino, Prometheus)
3. Initialize SQLite (osai.db, WAL mode, migrations)
4. Start Qdrant (if not running, Docker)
5. Initialize MemoryManager (Qdrant client, collections, lazy embedding)
6. Initialize AgentRuntime (load skills, register hooks)
7. Initialize Gateway (WS server, channel handlers, resume sessions)
8. Initialize OS Integration (tray, notifications, capability detection)
9. System Ready (status bar, SPA, tray active)
```

### Graceful Shutdown Sequence

```
1. SIGTERM / SIGINT
2. Gateway: stop accepting new connections
3. Agent Runtime: complete pending iterations
4. Memory Manager: flush writes to SQLite + Qdrant
5. Observability: flush OTel traces/metrics
6. SQLite: close (WAL checkpoint)
7. OS Integration: destroy tray, stop watchers
8. Gateway: close WS server
9. Process exit
```

---

## 9. Non-Functional Considerations

### Performance

| Метрика | Целевое значение | Реализация |
|---------|-----------------|------------|
| Agent loop overhead | < 50ms | In-memory processing, no blocking I/O |
| RAG query latency | < 200ms | Qdrant local (Docker), connection pooling |
| WS message processing | < 10ms | Direct dispatch, parsing < 1ms |
| OTel overhead | < 5% CPU | Sampling (10% prod), async exporters |
| Cold start embedding | < 5s | Lazy loading, quantized INT8 models |

### Reliability

| Метрика | Реализация |
|---------|------------|
| Model failover | Chain with immediate switch, circuit breaker |
| Crash recovery | SQLite WAL, session serialization |
| Graceful shutdown | Signal handlers, pending op completion |
| Retry | Exponential backoff, max 3 attempts, jitter |

### Build Metrics

| Метрика | Значение |
|---------|----------|
| Build time | ~2s (full monorepo) |
| Packages built | 12 packages + 2 apps |
| TypeScript errors | 0 (strict mode) |
| Test files | 103 |
| Total tests | 1723 |
| Test pass rate | 100% |
| Output format | ESM + CJS dual (tsup) |

---

*End of Architecture Document v1.0*
*Generated: 2026-03-25*
