# Features Index v1.0

**Generated:** 2026-03-24
**Source:** ARCHITECTURE_OVERVIEW.md v1.0, TECH_REQUIREMENTS.md v1.0, SCOPE.md v1.0, PROJECT_PROFILE.md v1.0
**Status:** Active

---

## Quality Pre-Assessment

- **Source Quality Score:** 9/9 (Requirements Clarity: 3 + Architecture Completeness: 3 + Scope Boundary: 3)
- **Complexity Level:** Medium (7+ integration points, известные domain паттерны, solo developer)
- **Risks Identified:**
  - Solo developer: 9 фич значительного объёма
  - Qdrant server -- дополнительное infrastructure requirement для пользователя
  - systray2 ненадёжен на Wayland (fallback на CLI-only)
  - better-sqlite3 требует native compilation (node-gyp)
- **Confidence Level:** High

---

## Quality Metrics

### Cohesion Score: 0.87

Расчёт: средний коэффициент связности по фичам.
- Большинство фич привязаны к одному домену (пакету)
- 2 фичи -- cross-cutting (F-003 Configuration, F-010 Observability), но с чёткими границами
- Среднее: (1.0*8 + 0.8*2 + 0.9*1) / 11 = 0.87

### Coupling Score: 0.74

Расчёт: 1 - (total_dependencies / max_possible_dependencies).
- 11 фич, max_possible = 11*10/2 = 55
- Фактические зависимости: 14 (см. dependency graph)
- Coupling = 1 - (14/55) = 1 - 0.255 = 0.745
- Нижнее -- лучше. 0.74 -- хороший показатель минимального сцепления.

### Balance Score: 0.78

Расчёт: 1 - min(deviation, 1.0) от среднего размера фичи.
- Распределение задач: 4, 5, 7, 6, 7, 7, 5, 8, 6, 5, 6
- Среднее: ~5.9 задач
- Стандартное отклонение: ~1.3
- Коэффициент вариации: 1.3/5.9 = 0.22
- Balance = 1 - 0.22 = 0.78

### Overall Quality: 0.81

Quality = (Cohesion * 0.4) + (Coupling * 0.3) + (Balance * 0.3)
Quality = (0.87 * 0.4) + (0.74 * 0.3) + (0.78 * 0.3) = 0.348 + 0.222 + 0.234 = 0.804

**Overall Quality: Good** (близко к Excellent, threshold 0.8)

---

## Dependency Graph

Features выполняются **строго последовательно** (по dependency level):

```
Level 0:  F-001 Monorepo Infrastructure
Level 1:  F-002 Gateway (WS Control Plane)
Level 1:  F-011 OS Integration (параллельно с F-002)
Level 2:  F-003 Configuration (зависит от F-001)
Level 2:  F-004 Agent Runtime (зависит от F-002)
Level 3:  F-005 Skills Core (зависит от F-004)
Level 3:  F-009 Security Foundation (зависит от F-004, F-005)
Level 4:  F-006 Memory System (зависит от F-004, F-009)
Level 4:  F-010 Observability (зависит от F-002, F-004, параллельно с F-006)
Level 5:  F-007 Skills osaI (зависит от F-006, F-011)
Level 5:  F-008 Messaging Channels (зависит от F-002)
Level 6:  F-012 CLI Client (зависит от F-002, F-003)
Level 6:  F-013 Web Dashboard (зависит от F-002, параллельно с F-012)
```

**Критический путь:** F-001 -> F-002 -> F-004 -> F-005 -> F-006 -> F-007

**Параллелизм:**
- F-002 (Gateway) и F-011 (OS Integration) -- независимы, могут разрабатываться параллельно
- F-006 (Memory) и F-010 (Observability) -- независимы, могут разрабатываться параллельно
- F-008 (Channels) и F-007 (Skills osaI) -- независимы, могут разрабатываться параллельно
- F-012 (CLI) и F-013 (Dashboard) -- независимы, могут разрабатываться параллельно

---

## Notes

- **Note 1 (Configuration):** Конфигурация выделена в отдельную фичу, поскольку она cross-cutting (все пакеты читают openclaw.json), но имеет чёткие границы: конфиг-схема, валидация, defaults, hot-reload. Реализация Distributed -- каждая фича использует конфиг, но фича F-003 определяет схему и инфраструктуру.
- **Note 2 (Security):** Security model (6 слоёв) распределена по нескольким фичам: L1 (Network) -- в Gateway, L2 (Docker Sandbox) -- в Security Foundation, L3 (Permissions) -- в Agent Runtime, L4-L5 -- в Skills Core, L6 (Audit) -- в Observability. Фича F-009 обеспечивает централизованную permission infrastructure + Docker sandbox.
- **Note 3 (OpenClaw):** osaI -- самостоятельная реализация. Все компоненты создаются с нуля по паттернам из спецификации. Никаких upstream dependencies.
- **Note 4 (Qdrant dependency):** Фича F-006 (Memory System) требует Qdrant server. Auto-start через Docker -- часть фичи.
- **Note 5 (Scope alignment):** Фичи F-001-F-005 + F-009 + F-012 покрывают MVP. Фичи F-006-F-008 + F-010-F-011 + F-013 покрывают V1.

---

## Traceability: Requirements -> Features

| Feature | FR-IDs | NFR-IDs |
|---------|--------|---------|
| F-001 Monorepo Infrastructure | FR-066, FR-070-072 | NFR-025, NFR-026, NFR-029 |
| F-002 Gateway | FR-001-FR-010 | NFR-006, NFR-008, NFR-011 |
| F-003 Configuration | FR-064-FR-066 | NFR-013, NFR-021, NFR-024, NFR-037 |
| F-004 Agent Runtime | FR-011-FR-019 | NFR-002, NFR-007, NFR-025 |
| F-005 Skills Core | FR-020-FR-025 | NFR-014, NFR-015, NFR-030 |
| F-006 Memory System | FR-029-FR-037 | NFR-001, NFR-003, NFR-005 |
| F-007 Skills osaI | FR-026-FR-028 | -- |
| F-008 Messaging Channels | FR-008, FR-009 | NFR-018 |
| F-009 Security Foundation | FR-038-FR-044 | NFR-012, NFR-016, NFR-017 |
| F-010 Observability | FR-045-FR-049 | NFR-004, NFR-031-NFR-034 |
| F-011 OS Integration | FR-050-FR-055 | NFR-035, NFR-036 |
| F-012 CLI Client | FR-056-FR-060 | NFR-021-NFR-024 |
| F-013 Web Dashboard | FR-061-FR-063 | -- |

**Покрытие:** Все 72 FR и 37 NFR покрыты. Нулевые пробелы.

---

## Features

### Feature F-001: Monorepo Infrastructure

- **Name:** Monorepo Infrastructure
- **Description:** Базовая инфраструктура monorepo: корневая конфигурация (package.json, tsconfig.json), shared types, CI/CD (GitHub Actions), linting (ESLint + Biome), formatting (Prettier), build pipeline (tsup/esbuild). Фундамент для всех остальных фич.
- **Domain:** (cross-cutting, infrastructure)
- **Related Requirements:** FR-066, FR-070-FR-072, NFR-025, NFR-026, NFR-029
- **Dependencies:** None
- **Dependency Level:** 0
- **Priority:** Must Have (MVP)
- **Status:** COMPLETED
- **Completed:** 2026-03-24
- **Final Score:** 9.44/10
- **Estimated Tasks:** 4 (Backend: 0, Infra: 2, Config: 2, Tests: 0)
- **Task Breakdown:**
  - Root monorepo setup (package.json workspaces, tsconfig.json base)
  - Shared types package (packages/types -- общие интерфейсы, WS message types, error types)
  - CI/CD pipeline (GitHub Actions: lint, type-check, test, build)
  - Linting + formatting config (ESLint, Biome, Prettier, tsup.config base)
- **Notes:** Первая фича. Без неё невозможна разработка остальных пакетов. Shared types -- ключевой артефакт, используемый всеми пакетами.

---

### Feature F-002: Gateway (WS Control Plane)

- **Name:** Gateway -- WebSocket Control Plane
- **Description:** Единая точка входа для всех клиентских подключений. WebSocket server на localhost, маршрутизация сообщений к сессиям, session router (main, group, isolated), session persistence/resume, streaming результатов (tool_stream, block, permission_request). Включает базовый Channel Handler interface.
- **Domain:** gateway
- **Related Requirements:** FR-001-FR-010, NFR-006, NFR-008, NFR-011
- **Dependencies:** F-001
- **Dependency Level:** 1
- **Status:** COMPLETED
- **Completed:** 2026-03-24
- **Final Score:** 9.30/10
- **Priority:** Must Have (MVP)
- **Estimated Tasks:** 5 (Backend: 3, DB: 1, Tests: 1)
- **Task Breakdown:**
  - WebSocket server (ws library, host:port binding, connection lifecycle)
  - WS protocol implementation (message routing, 7 message types: message, command, permission_response, subscribe, tool_stream, block, permission_request)
  - Session Router (main, group, isolated sessions; activation modes; queue modes)
  - Session persistence (SQLite, serialize/deserialize, resume after restart)
  - Integration tests (WS message flow, session routing, persistence)
- **Notes:** Фундаментальная фича. Все клиенты (CLI, Dashboard, мессенджеры) подключаются через Gateway. Session persistence -- критично для reliability (NFR-008). WS message processing latency < 10ms (NFR-006).

---

### Feature F-003: Configuration System

- **Name:** Configuration System
- **Description:** Управление конфигурацией osaI: чтение/валидация ~/.osai/openclaw.json, schema definition (gateway, model, session, skills, security, memory, observability секции), defaults, hot-reload, `osai init` (создание ~/.osai/ structure), npm publish конфигурация для @osai/cli.
- **Domain:** (cross-cutting, используется всеми пакетами)
- **Related Requirements:** FR-064-FR-066, NFR-013, NFR-021, NFR-024, NFR-037
- **Dependencies:** F-001
- **Dependency Level:** 2
- **Priority:** Must Have (MVP)
- **Status:** COMPLETED
- **Completed:** 2026-03-25
- **Final Score:** 9.30/10
- **Notes:** Конфигурация -- инфраструктурная фича, используемая всеми пакетами. Определяет schema, валидацию и defaults. Каждый пакет читает свою секцию через API. `osai init` -- часть CLI (F-012), но конфиг-схема и defaults -- здесь.
- **Estimated Tasks:** 4 (Backend: 2, Config: 2, Tests: 0)
- **Task Breakdown:**
  - Configuration schema definition (JSON Schema для openclaw.json, все секции)
  - Config loader (чтение, валидация, defaults, file permissions 0600)
  - Directory structure initialization (~/.osai/ layout)
  - Config hot-reload mechanism (file watcher, notify subscribers)

---

### Feature F-004: Agent Runtime

- **Name:** Agent Runtime
- **Description:** Основной agent loop: intake -> context_assembly -> model_inference -> tool_execution -> streaming -> persistence. Hook system (7 hook points + 4 osaI-specific), model resolver + failover chain (Claude -> GPT -> Ollama), skills loader + executor, context assembly (system prompt + tool schemas + session history), session pruning, error handling (severity classification, retry with backoff).
- **Domain:** agent
- **Related Requirements:** FR-011-FR-019, NFR-002, NFR-007, NFR-025
- **Dependencies:** F-002, F-003
- **Dependency Level:** 2
- **Priority:** Must Have (MVP)
- **Estimated Tasks:** 7 (Backend: 5, DB: 1, Tests: 1)
- **Task Breakdown:**
  - Agent loop implementation (intake -> context -> inference -> tools -> stream -> persist)
  - Hook system (11 hook points, priority ordering, abort chain support)
  - Model resolver + failover (Claude -> GPT -> Ollama, error handling)
  - Skills loader + executor (SKILL.md parsing, tool_schemas generation, tool registration)
  - Context assembly (system prompt, AGENTS.md, SOUL.md, tool schemas, session history)
  - Session pruning (context overflow detection, summarization, safe truncation)
  - Integration tests (full agent loop, hook execution order, model failover scenarios)
- **Notes:** Центральная фича системы. От неё зависят Skills Core, Memory, Observability. Agent loop overhead < 50ms без LLM inference (NFR-002). Model failover < 5s (NFR-007).

---

### Feature F-005: Skills Core

- **Name:** Skills Core -- Filesystem, Shell, Browser, HTTP
- **Description:** Встроенные (bundled) skills: Filesystem (read_file, write_file, list_directory, search_files, move_file, delete_file), Shell (execute с timeout, blocked commands, logging), Browser (CDP: navigate, click, fill, screenshot -- V1), HTTP (GET, POST, PUT, DELETE -- V1). SKILL.md parser и Skill Registry. File Sandbox (allowed dirs, blocked patterns, symlink resolution, path traversal prevention). Shell Security (blocked commands, timeout enforcement, command logging).
- **Domain:** skills-core
- **Related Requirements:** FR-020-FR-025, NFR-014, NFR-015, NFR-030
- **Dependencies:** F-004
- **Dependency Level:** 3
- **Priority:** Must Have (MVP) для Filesystem + Shell; Should Have (V1) для Browser + HTTP
- **Estimated Tasks:** 6 (Backend: 4, Security: 1, Tests: 1)
- **Task Breakdown:**
  - SKILL.md parser (parsing tool definitions, permissions, examples)
  - Skill Registry (register, unregister, getToolSchemas, getToolExecutor)
  - Filesystem skill (6 tools с file sandbox enforcement)
  - Shell skill (execute с timeout, blocked commands, command logging)
  - File Sandbox implementation (allowed dirs, blocked patterns, symlink resolution, path traversal prevention)
  - Browser + HTTP skills (CDP automation, HTTP API client -- V1 scope)
- **Notes:** Filesystem + Shell -- MVP критичны. Browser + HTTP -- V1. File Sandbox (L4) и Shell Security (L5) -- часть 6-layer security model. Tool validation на уровне implementation, а не только по category (FR-044).

---

### Feature F-006: Memory System

- **Name:** Memory System -- Short-term + Long-term + RAG
- **Description:** Двухуровневая система памяти. Short-term: session messages + tool results в SQLite (WAL mode). Long-term: SQLite (metadata) + Qdrant (vectors) для facts, preferences, knowledge, errors, patterns. RAG pipeline: query -> embed -> Qdrant search -> inject into prompt. Embedding provider с fallback chain: OpenAI -> Ollama -> ONNX. Fact extraction из ответов агента. Knowledge base ingestion: document -> chunking -> embedding -> store.
- **Domain:** memory
- **Related Requirements:** FR-029-FR-037, NFR-001, NFR-003, NFR-005
- **Dependencies:** F-004
- **Dependency Level:** 4
- **Priority:** Should Have (V1)
- **Estimated Tasks:** 7 (Backend: 4, DB: 1, Integration: 1, Tests: 1)
- **Task Breakdown:**
  - SQLite schema (sessions, messages, memory entries, knowledge base metadata)
  - Qdrant integration (REST client, collection management, auto-start Docker container)
  - Embedding provider (fallback chain: OpenAI -> Ollama -> ONNX, worker threads)
  - RAG pipeline (query embedding -> Qdrant search -> format context -> inject)
  - Fact extraction (автоматическое извлечение фактов из agent responses)
  - Knowledge base ingestion (document read -> chunking -> embed -> store)
  - Integration tests (memory CRUD, RAG accuracy, embedding fallback, fact extraction quality)
- **Notes:** Short-term memory (SQLite) -- часть MVP, но выделена в эту фичу поскольку long-term memory использует ту же инфраструктуру. Qdrant auto-start через Docker -- часть фичи. RAG query latency < 200ms (NFR-001). CPU-bound задачи (embeddings) в worker threads (NFR-003). Cold start embedding < 5s (NFR-005).

---

### Feature F-007: Skills osaI

- **Name:** Skills osaI -- OS Integration, Memory, Knowledge Base
- **Description:** osaI-specific skills, которые предоставляют агенту доступ к osaI-функциям: OS Integration skill (show_notification, watch_directory, list_processes, open_application, get_system_info), Memory skill (remember, recall, forget, summarize_session), Knowledge Base skill (ingest_document, query_knowledge, list_sources, remove_source). Эти навыки оборачивают функциональность packages/os-integration и packages/memory в tool-интерфейс для LLM.
- **Domain:** skills-osai
- **Related Requirements:** FR-026-FR-028
- **Dependencies:** F-006, F-011
- **Dependency Level:** 5
- **Priority:** Should Have (V1)
- **Estimated Tasks:** 5 (Backend: 4, Tests: 1)
- **Task Breakdown:**
  - OS Integration skill (5 tools: notification, file watcher, processes, app launch, system info)
  - Memory skill (4 tools: remember, recall, forget, summarize_session)
  - Knowledge Base skill (4 tools: ingest, query, list, remove)
  - Hook integration (before_memory_query, after_memory_extract, on_file_access, on_desktop_notification)
  - Integration tests (skill tool execution, hook wiring, end-to-end scenarios)
- **Notes:** Фича является "связующим звеном" между agent runtime и нижележащими пакетами (memory, os-integration). Фактически это SKILL.md definitions + tool executor wrappers. Hook points -- часть agent runtime (F-004), но регистрации -- здесь.

---

### Feature F-008: Messaging Channels

- **Name:** Messaging Channels -- Telegram, WhatsApp
- **Description:** Channel handlers для мессенджеров: Telegram (grammY framework, bot token auth, message routing в Gateway), WhatsApp (Baileys, QR-code auth, message routing). Оба channel handler'а реализуют единый ChannelHandler interface из Gateway и преобразуют сообщения мессенджеров в формат WS protocol.
- **Domain:** gateway
- **Related Requirements:** FR-008, FR-009, NFR-018
- **Dependencies:** F-002
- **Dependency Level:** 5
- **Priority:** Should Have (V1)
- **Estimated Tasks:** 5 (Backend: 3, Integration: 1, Tests: 1)
- **Task Breakdown:**
  - ChannelHandler interface (единый интерфейс для всех channel implementations)
  - Telegram channel handler (grammY, message in/out, media, callbacks)
  - WhatsApp channel handler (Baileys, QR-code auth, message in/out, media)
  - Channel management CLI commands (channel list, enable, disable)
  - Integration tests (message routing, media handling, reconnection scenarios)
- **Notes:** ChannelHandler interface -- часть Gateway (F-002), но конкретные implementations -- здесь. Slack, Discord, Signal, iMessage -- V2 (FR-009). Telegram/WhatsApp -- V1 приоритет. Channels являются "клиентами" Gateway, аналогично CLI и Dashboard.

---

### Feature F-009: Security Foundation

- **Name:** Security Foundation -- Permissions + Docker Sandbox
- **Description:** Централизованная security infrastructure: Permission Manager (category-based: read=auto, write=confirm, exec=confirm, system=auto, desktop notification для permission requests), Docker sandbox для non-main sessions (container lifecycle, resource limits, network isolation), permission_request/response flow через Gateway. Cross-cutting audit trail coordination (audit entries -> ObservabilityManager).
- **Domain:** (cross-cutting: agent, skills-core, observability)
- **Related Requirements:** FR-038-FR-044, NFR-012, NFR-016, NFR-017
- **Dependencies:** F-004, F-005
- **Dependency Level:** 3
- **Priority:** Must Have (MVP) для Permissions; Should Have (V1) для Docker Sandbox
- **Estimated Tasks:** 6 (Backend: 3, Security: 2, Tests: 1)
- **Task Breakdown:**
  - Permission Manager (category-based checks, permission_request/response flow, desktop notifications)
  - Permission request/response WS protocol (integration с Gateway messaging)
  - Docker sandbox infrastructure (container lifecycle, resource limits, network isolation)
  - Tool-level validation (проверка реального типа операции, masquerading prevention)
  - Audit trail coordination (все security-related actions -> ObservabilityManager)
  - Security tests (sandbox bypass attempts, permission flow edge cases, Docker isolation)
- **Notes:** File Sandbox (L4) и Shell Security (L5) реализуются в Skills Core (F-005). Данная фича обеспечивает L2 (Docker) и L3 (Permissions) из 6-layer security model. НFR-012 (нет передачи данных третьим), NFR-016 (Docker network isolation), NFR-017 (audit immutability).

---

### Feature F-010: Observability

- **Name:** Observability -- OpenTelemetry + Audit + Prometheus
- **Description:** Полная observability система: OpenTelemetry SDK integration (traces для agent loop, model inference, tool calls, memory queries; metrics: tokens, cost, latency, success rate), structured logging (pino с correlation IDs), audit log (SQLite, immutable, queryable via REST API), Prometheus exporter, exporters (Console, File, Jaeger/Zipkin). REST API для query traces, metrics, audit.
- **Domain:** observability
- **Related Requirements:** FR-045-FR-049, NFR-004, NFR-031-NFR-034
- **Dependencies:** F-002, F-004
- **Dependency Level:** 4
- **Priority:** Should Have (V1)
- **Estimated Tasks:** 7 (Backend: 3, Integration: 2, API: 1, Tests: 1)
- **Task Breakdown:**
  - OpenTelemetry SDK setup (traces, resource attributes, span hierarchy)
  - Structured logging (pino, JSON format, correlation IDs, log rotation)
  - Metrics system (counters, histograms, gauges для agent/skills/memory/session)
  - Prometheus exporter (metrics endpoint на настраиваемом порту)
  - Audit log (SQLite, immutable records, REST API GET /api/v1/observability/audit)
  - Trace/metric exporters (Console, File, Jaeger/Zipkin, OTLP)
  - Integration tests (trace propagation, metric accuracy, audit completeness)
- **Notes:** pino structured logging -- MVP (FR-049), но выделена в V1 фичу поскольку полная OTel интеграция -- V1 scope. OTel overhead < 5% CPU/memory (NFR-004). Audit log -- L6 security model (immutable records, no DELETE via API).

---

### Feature F-011: OS Integration

- **Name:** OS Integration -- Tray, Notifications, File Watcher, Processes
- **Description:** Desktop OS integration: system tray с меню (Open Chat, Sessions, Memory, Skills, Status, Quit), desktop notifications (node-notifier с urgency levels), file system watcher (chokidar, create/modify/delete events), process management (list_processes, get_system_info), service management (systemd --user / launchd). Capability detection (X11 vs Wayland) и fallback на CLI-only.
- **Domain:** os-integration
- **Related Requirements:** FR-050-FR-055, NFR-035, NFR-036
- **Dependencies:** None
- **Dependency Level:** 1
- **Priority:** Should Have (V1)
- **Status:** COMPLETED
- **Completed:** 2026-03-25
- **Final Score:** 9.30/10
- **Estimated Tasks:** 5 (Backend: 3, System: 1, Tests: 1)
- **Task Breakdown:**
  - System tray (systray2, menu items, status indicator, capability detection)
  - Desktop notifications (node-notifier, urgency levels, click actions)
  - File watcher (chokidar, event types, watcher lifecycle management)
  - Process management + system info (systeminformation, CPU/memory/disk metrics)
  - Service management (systemd --user unit file, launchd plist, install/uninstall)
- **Notes:** Единственная фича на уровне 1, которая полностью standalone (нет зависимостей от Gateway или Agent). Может разрабатываться параллельно с Gateway. systray2 ненадёжен на Wayland -- fallback на CLI-only (FR-055). Capability detection позволяет системе работать на headless/Wayland без desktop features.

---

### Feature F-012: CLI Client

- **Name:** CLI Client -- oclif + ink
- **Description:** CLI клиент на базе oclif: интерактивный чат с TUI (ink), session management (list, resume), конфигурация (config show/edit), skills management (list, enable, disable), memory operations (search, stats), channel management (list), system status. Permission prompts для write/exec operations. Quick command mode (`osai "command text"`). Status bar с session info (id, model, token usage).
- **Domain:** cli
- **Related Requirements:** FR-056-FR-060, NFR-021-NFR-024
- **Dependencies:** F-002, F-003
- **Dependency Level:** 6
- **Priority:** Must Have (MVP)
- **Estimated Tasks:** 6 (Backend: 3, Frontend-TUI: 2, Tests: 1)
- **Task Breakdown:**
  - oclif base setup (commands: chat, session, config, skills, memory, channel, status, init, version)
  - Interactive chat TUI (ink, message rendering, tool_stream display, permission prompts)
  - Gateway client (WS connection, message send/receive, reconnection)
  - Permission prompt UI (tool name, action, params, risk level, y/N input)
  - Session management + status bar (session info, model, token usage display)
  - Integration tests (command execution, interactive session simulation, edge cases)
- **Notes:** CLI -- primary interface для MVP. `osai init` -- часть этой фичи (создаёт ~/.osai/ через config API из F-003). Quick command mode для scripting. oclif + ink integration -- потенциальный риск (AS-10).

---

### Feature F-013: Web Dashboard

- **Name:** Web Dashboard -- SvelteKit + TailwindCSS
- **Description:** Web Dashboard на SvelteKit + TailwindCSS: chat area (real-time через WS), channel sidebar, agent trace view (tool calls, durations, token usage, cost), permission prompts ( approve/deny), memory search, system status (metrics, health). SPA, подключается к Gateway через WebSocket. Routes: /, /sessions, /traces, /memory, /settings, /status.
- **Domain:** dashboard
- **Related Requirements:** FR-061-FR-063
- **Dependencies:** F-002
- **Dependency Level:** 6
- **Priority:** Should Have (V1)
- **Estimated Tasks:** 8 (Frontend: 5, Integration: 2, Tests: 1)
- **Task Breakdown:**
  - SvelteKit project setup (routes, layout, TailwindCSS config)
  - Chat area (message rendering, tool_stream display, block types)
  - Channel sidebar (session list, channel status indicators)
  - Agent trace view (chronological tool calls, durations, token usage, cost)
  - Permission prompt UI (approve/deny, tool details display)
  - Memory search panel (semantic search, category filters)
  - System status panel (metrics display, health indicators)
  - Integration tests (WS reconnection, component rendering, responsive layout)
- **Notes:** Dashboard -- SPA, нет SSR (local-first). Подключается к Gateway WS как обычный клиент. Читает данные из REST API (memory, observability, os-integration endpoints). Может разрабатываться параллельно с CLI (F-012).

---

## Validation Checklist

- [x] Все 72 FR покрыты хотя бы одной фичей
- [x] Все 37 NFR покрыты хотя бы одной фичей
- [x] Ни одна фича не пересекается с другой по функционалу
- [x] Фичи независимы (минимальные зависимости, acyclic dependency graph)
- [x] Фичи допускают последовательное выполнение
- [x] Каждая фича содержит 3-10 задач (min: 4, max: 8)
- [x] Все фичи имеют Domain
- [x] Все фичи привязаны к требованиям (FR + NFR)
- [x] MVP фичи: F-001, F-002, F-003, F-004, F-005, F-009, F-012 (покрывают все MVP requirements из SCOPE.md)
- [x] V1 фичи: F-006, F-007, F-008, F-010, F-011, F-013 (покрывают все V1 requirements)
- [x] V2 requirements (multi-agent, canvas, marketplace, advanced RAG) не включены в текущие фичи -- out of scope
- [x] Dependency graph acyclic (проверено)
- [x] Quality metrics рассчитаны

---

*End of Features Index v1.0*
