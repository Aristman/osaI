# Features Index v1.0

**Дата:** 2026-03-30
**Проект:** osaI v3 -- AI Operating System
**Входные артефакты:**
- docs/project/ARCHITECTURE_OVERVIEW.md
- docs/project/SCOPE.md (S-001..S-057)
- docs/project/TECH_REQUIREMENTS.md (FR-001..FR-029)
- docs/project/PROJECT_PROFILE.md (DOMAIN-001..DOMAIN-012)

---

## Quality Pre-Assessment

- **Source Quality Score:** 9/9 (Requirements Clarity: 3 + Architecture Completeness: 3 + Scope Boundary: 3)
- **Complexity Level:** High (13 доменов, 5 LLM провайдеров, 7-уровневая безопасность, двухязыковая архитектура)
- **Risks Identified:**
  - R-FD-01: Solo developer -- риск перегрузки при 12 фичах MVP
  - R-FD-02: Python microservice (Telethon) -- двухязыковая сложность
  - R-FD-03: Native modules (better-sqlite3, sqlite-vec) -- кроссплатформенные риски сборки
- **Confidence Level:** High

## Quality Metrics

- **Cohesion Score:** 0.84 (каждая фича охватывает 1-2 домена с высокосвязанными компонентами)
- **Coupling Score:** 0.79 (1 - 13/78 = 0.83, скорректировано на обязательные логические зависимости)
- **Balance Score:** 0.72 (std_dev/mean = 0.28, обусловлено разницей инфраструктурной и доменной фич)
- **Overall Quality:** Good (Quality = 0.84*0.4 + 0.79*0.3 + 0.72*0.3 = 0.794)

---

## Dependency Graph

Фичи выполняются **строго последовательно** по dependency level. Фичи одного уровня могут разрабатываться параллельно на уровне задач (внутри фичи).

```
Level 0 (no dependencies):
  F-001: Core Infrastructure

Level 1 (depends on F-001):
  F-002: LLM Provider System
  F-003: Observability Foundation
  F-004: OS Integration

Level 2 (depends on F-001, F-003):
  F-005: Memory System

Level 3 (depends on F-001, F-002, F-003, F-005):
  F-006: Knowledge Base

Level 4 (depends on F-001, F-002, F-003, F-005):
  F-007: Skills System

Level 5 (depends on F-001, F-002, F-003, F-005, F-007):
  F-008: Agent Runtime

Level 6 (depends on F-001):
  F-009: Gateway + Multi-Chat System

Level 7 (depends on F-004, F-008, F-009):
  F-010: Telegram Integration

Level 8 (depends on F-009):
  F-011: CLI Client

Level 9 (depends on F-001, F-007, F-009):
  F-012: Security + File Sandbox

Level 10 (cross-cutting, depends on all):
  F-013: Cross-Platform + Testing
```

---

## Features

### Feature F-001: Core Infrastructure

- **Name:** Core Infrastructure
- **Description:** Базовая инфраструктура monorepo: pnpm workspace, shared TypeScript конфигурация, структура пакетов, osai.json конфигурация, директория ~/.osai/, SQLite инициализация (WAL mode, единая БД osai.db), загрузчик конфигурации
- **Domain:** DOMAIN-001 (Gateway -- shared), DOMAIN-010 (Observability -- shared)
- **Related Requirements:** FR-025, FR-024 (частично -- pino setup), FR-029
- **Dependencies:** None
- **Dependency Level:** 0
- **Estimated Tasks:** 6
- **Task Breakdown:** Backend: 3, Config/Infra: 2, DB: 1, Tests: 0
- **Scope:** MVP
- **Priority:** P0
- **Components:** S-004 (Configuration), S-005 (Structured Logging -- pino setup), S-014 (Chat Persistence -- SQLite schema)
- **Status:** Active
- **Notes:** Фундамент для всех остальных фич. Включает: pnpm-workspace.yaml, root tsconfig.json (strict), package.json для каждого домена, osai.json config loader, SQLite DB init (osai.db, WAL mode, таблицы chats/chat_messages/sessions/osai_audit_log), pino logger setup, ~/.osai/ directory structure

---

### Feature F-002: LLM Provider System

- **Name:** LLM Provider System
- **Description:** Единый интерфейс для 5 LLM-провайдеров (Z.ai, Yandex, Anthropic, OpenAI, Ollama). Автоматическая failover-цепочка с circuit breaker и auth profile rotation. Streaming и non-streaming вызовы. Подсчёт токенов.
- **Domain:** DOMAIN-008
- **Related Requirements:** FR-007, FR-028
- **Dependencies:** F-001 (Core Infrastructure)
- **Dependency Level:** 1
- **Estimated Tasks:** 8
- **Task Breakdown:** Backend: 5, Integration: 1, Tests: 2
- **Scope:** MVP
- **Priority:** P0
- **Components:** S-006 (Z.ai Provider), S-007 (Yandex Provider), S-008 (Anthropic Provider), S-009 (OpenAI Provider), S-010 (Ollama Provider), S-011 (Failover Chain), S-012 (Circuit Breaker)
- **Status:** Active
- **Notes:** LLMProvider interface, 5 adapter-реализаций, ProviderChain (failover manager), CircuitBreaker state machine (closed/open/half-open), AuthProfile rotation для rate limit handling. Z.ai = OpenAI-совместимый adapter с configurable baseURL

---

### Feature F-003: Observability Foundation

- **Name:** Observability Foundation
- **Description:** Базовый уровень наблюдаемости: pino structured JSON logging с correlation IDs, audit logging в SQLite (таблица osai_audit_log), trace_id propagation через все модули
- **Domain:** DOMAIN-010
- **Related Requirements:** FR-023, FR-024
- **Dependencies:** F-001 (Core Infrastructure -- SQLite, pino setup)
- **Dependency Level:** 1
- **Estimated Tasks:** 4
- **Task Breakdown:** Backend: 2, DB: 1, Tests: 1
- **Scope:** MVP
- **Priority:** P0
- **Components:** S-005 (Structured Logging), S-046 (Audit Logging), S-042 (7-Layer Security -- Layer 7: Audit)
- **Status:** Active
- **Notes:** AuditService с методами log(), query(), cleanup(). TraceContext для propagation. Audit records: session_id, chat_id, trace_id, action, tool_name, skill_name, params, result, user_decision, risk_level. V1 расширяется: OpenTelemetry traces/metrics

---

### Feature F-004: OS Integration

- **Name:** OS Integration
- **Description:** Кроссплатформенное (Linux + Windows) интегрирование с ОС: desktop notifications, system info (CPU, memory, disk), process list с фильтрацией
- **Domain:** DOMAIN-009
- **Related Requirements:** FR-020
- **Dependencies:** F-001 (Core Infrastructure)
- **Dependency Level:** 1
- **Estimated Tasks:** 4
- **Task Breakdown:** Backend: 3, Tests: 1
- **Scope:** MVP
- **Priority:** P0
- **Components:** S-039 (Desktop Notifications), S-040 (System Info), S-041 (Process List)
- **Status:** Active
- **Notes:** node-notifier для desktop notifications, systeminformation (pure JS) для system info. Linux: libnotify/D-Bus, Windows: Toast Notifications. Process list через systeminformation.processes()

---

### Feature F-005: Memory System

- **Name:** Memory System
- **Description:** Трёхуровневая память (Chat, Session, Long-term), RAG pipeline, embedding generation (Ollama/Yandex/ONNX fallback), sqlite-vec vector storage, context window manager с auto-pruning + summarization, fact extraction
- **Domain:** DOMAIN-004
- **Related Requirements:** FR-008, FR-009, FR-010, FR-011, FR-013
- **Dependencies:** F-001 (Core Infrastructure), F-003 (Observability -- audit)
- **Dependency Level:** 2
- **Estimated Tasks:** 10
- **Task Breakdown:** Backend: 5, DB: 2, Integration: 1, Tests: 2
- **Scope:** MVP
- **Priority:** P0
- **Components:** S-018 (Three-Tier Memory), S-019 (Embeddings), S-020 (Vector Storage -- sqlite-vec), S-021 (Qdrant optional), S-022 (RAG Pipeline), S-023 (Context Window Manager), S-024 (Fact Extraction)
- **Status:** Active
- **Notes:** Крупная фича на границе optimal/max. Ключевые submodule: EmbeddingProvider (Ollama nomic-embed-text 768-dim / Yandex 256-dim / ONNX 384-dim), VectorStorage (sqlite-vec primary, Qdrant REST optional), RAGPipeline (embed query -> vector search top_k=5, min_similarity=0.7 -> inject into system prompt), ContextWindowManager (priority pruning, summarization at 80% threshold). Long-term Memory shared across all chats

---

### Feature F-006: Knowledge Base

- **Name:** Knowledge Base
- **Description:** Ингест документов (parse + chunking + embedding + vector storage), семантический поиск с source attribution, управление источниками (add, remove, list по тегам)
- **Domain:** DOMAIN-005
- **Related Requirements:** FR-012
- **Dependencies:** F-001 (Core Infrastructure), F-002 (LLM Provider System -- embeddings от Ollama), F-003 (Observability), F-005 (Memory System -- embeddings provider, vector storage)
- **Dependency Level:** 3
- **Estimated Tasks:** 5
- **Task Breakdown:** Backend: 3, Integration: 1, Tests: 1
- **Scope:** MVP
- **Priority:** P0
- **Components:** S-025 (Document Ingestion), S-026 (Semantic Search), S-027 (Source Management)
- **Status:** Active
- **Notes:** Ingest pipeline: Document -> Parse (txt/md/pdf) -> Chunking (1024 tokens, overlap 128) -> Embedding -> Store in sqlite-vec + SQLite. Search pipeline: Query -> Embedding -> Vector search -> Filter (similarity > 0.7) -> Source attribution. Форматы MVP: txt, md, pdf (минимум). Knowledge base доступна из любого чата (shared)

---

### Feature F-007: Skills System

- **Name:** Skills System
- **Description:** Skills Registry (реестр bundled, managed, workspace, osaI skills), SKILL.md формат, bundled skills (Filesystem, Shell), osaI skills (Memory, Knowledge Base, Chat Management, OS Integration), permission model
- **Domain:** DOMAIN-003
- **Related Requirements:** FR-005, FR-006
- **Dependencies:** F-001 (Core Infrastructure), F-002 (LLM Provider System), F-003 (Observability -- audit), F-005 (Memory System -- для Memory skill)
- **Dependency Level:** 4
- **Estimated Tasks:** 9
- **Task Breakdown:** Backend: 5, Integration: 1, Tests: 3
- **Scope:** MVP
- **Priority:** P0
- **Components:** S-028 (Skills Registry), S-029 (SKILL.md Format), S-030 (Filesystem Skill), S-031 (Shell Skill), S-032 (Memory Skill), S-033 (Knowledge Base Skill), S-034 (Chat Management Skill), S-035 (OS Integration Skill)
- **Status:** Active
- **Notes:** SkillRegistry: register(), getTools(), execute(), enable(), disable(), reload(). Bundled Skills: Filesystem (7 tools: read_file, write_file, list_dir, search_files, move_file, delete_file, get_file_info), Shell (2 tools: exec, exec_sandbox). osaI Skills: Memory (4 tools), Knowledge Base (4 tools), Chat Management (5 tools), OS Integration (5 tools). Категории permission: read=auto, write=confirm, exec=confirm. SKILL.md -- декларативный формат описания skills

---

### Feature F-008: Agent Runtime

- **Name:** Agent Runtime
- **Description:** Полный agent loop: intake -> context_assembly -> model_inference -> tool_execution -> streaming -> persistence. 13 hook points (7 OpenClaw + 6 osaI). Tool execution loop (повторные вызовы при tool_use). Fact extraction в Long-term Memory.
- **Domain:** DOMAIN-002
- **Related Requirements:** FR-002, FR-011 (частично -- hook before_memory_query)
- **Dependencies:** F-001 (Core Infrastructure), F-002 (LLM Provider System), F-003 (Observability), F-005 (Memory System -- RAG context), F-007 (Skills System -- tool execution)
- **Dependency Level:** 5
- **Estimated Tasks:** 8
- **Task Breakdown:** Backend: 5, Integration: 2, Tests: 1
- **Scope:** MVP
- **Priority:** P0
- **Components:** S-002 (Agent Loop), S-003 (Hook System)
- **Status:** Active
- **Notes:** Agent loop pipeline: INTAKE -> CONTEXT_ASSEMBLY -> MODEL_INFERENCE -> TOOL_EXECUTION -> STREAMING -> PERSISTENCE. Hook points: before_model_resolve, before_prompt_build, before_agent_start, before_tool_call, after_tool_call, agent_end, on_error, before_memory_query, after_memory_extract, on_file_access, on_desktop_notification, on_chat_switch, on_mirror_message. Tool execution loop: при tool_use response -> повторный вызов с tool results

---

### Feature F-009: Gateway + Multi-Chat System

- **Name:** Gateway + Multi-Chat System
- **Description:** WebSocket control plane на localhost:18789, channel routing, session management, Chat CRUD (до 20 активных), Chat Persistence, Chat Context Isolation, Chat Switching, Chat Archiving
- **Domain:** DOMAIN-001
- **Related Requirements:** FR-001, FR-003, FR-004
- **Dependencies:** F-001 (Core Infrastructure)
- **Dependency Level:** 6
- **Estimated Tasks:** 8
- **Task Breakdown:** Backend: 5, DB: 1, Integration: 1, Tests: 1
- **Scope:** MVP
- **Priority:** P0
- **Components:** S-001 (Gateway WS Control Plane), S-013 (Chat CRUD), S-014 (Chat Persistence), S-015 (Chat Context Isolation), S-016 (Chat Switching), S-017 (Chat Archiving)
- **Status:** Active
- **Notes:** WS Server на ws://127.0.0.1:18789. WebSocket Protocol: Client->Gateway (message, command, permission_response, subscribe), Gateway->Client (tool_stream, block, permission_request). Chat Router: маршрутизация сообщений по chat_id. Session Manager: session routing, persistence, pruning. Chat metadata: id, name, description, tags, icon, color, channel, channelMetadata, isActive. До 20 активных чатов. Архивирование неактивных чатов освобождает лимит

---

### Feature F-010: Telegram Integration

- **Name:** Telegram Integration
- **Description:** Telegram Bot (grammY) -- команды, чат, notifications, allowedUsers whitelist. Telegram Userbot (Telethon) -- Python microservice через child_process, чтение/отправка сообщений, ожидание ответов. Mirror Engine -- двусторонняя синхронизация osaI-чат <-> Telegram-чат/канал.
- **Domain:** DOMAIN-006
- **Related Requirements:** FR-014, FR-015, FR-016
- **Dependencies:** F-004 (OS Integration -- notifications для permission requests), F-008 (Agent Runtime -- обработка запросов), F-009 (Gateway -- channel handler)
- **Dependency Level:** 7
- **Estimated Tasks:** 9
- **Task Breakdown:** Backend: 4, Integration: 3 (Python microservice + bridge + mirror), Tests: 2
- **Scope:** MVP
- **Priority:** P0
- **Components:** S-036 (Telegram Bot), S-037 (Telegram Userbot), S-038 (Telegram Mirror Engine)
- **Status:** Active
- **Notes:** Telethon userbot работает как Python microservice через child_process с JSON-over-stdio протоколом. Bridge interface: Node->Python (auth, send_message, listen, get_chats, health), Python->Node (auth_result, message, send_result, error, health). Mirror Engine: bidirectional sync, configurable direction (both/osai-to-tg/tg-to-osai), markdown/HTML format preservation, media handling best-effort. Telegram security: allowedUsers whitelist для bot, AES-256 encrypted session для userbot, rate limiting

---

### Feature F-011: CLI Client

- **Name:** CLI Client
- **Description:** Интерактивный CLI чат с TUI (ink), набор команд управления (chat, session, config, skills, memory, channel, status), WebSocket client для Gateway
- **Domain:** DOMAIN-011
- **Related Requirements:** FR-019
- **Dependencies:** F-009 (Gateway -- WS client)
- **Dependency Level:** 8
- **Estimated Tasks:** 6
- **Task Breakdown:** Frontend: 4, Backend: 1, Tests: 1
- **Scope:** MVP
- **Priority:** P0
- **Components:** S-047 (Interactive CLI), S-048 (Quick Command), S-049 (Chat Commands), S-050 (Management Commands), S-051 (TUI Layout)
- **Status:** Active
- **Notes:** Framework: oclif (commands) + ink (TUI rendering). Команды: osai (interactive chat), osai "command" (quick execution), osai chat list|create|switch|delete|archive, osai session list|resume, osai config, osai skills list, osai memory search "query", osai status, osai channel add telegram, osai init. TUI: список чатов (sidebar), область чата (main), статус-бар (текущий чат, модель, tokens). WebSocket client для подключения к Gateway

---

### Feature F-012: Security + File Sandbox

- **Name:** Security + File Sandbox
- **Description:** 7-уровневая модель безопасности: Network (localhost-only), Sandbox (Docker containers, graceful degradation), Permissions (category-based prompts), File Sandbox (allowed_dirs, blocked_patterns, symlink resolution), Shell Security (blocked commands, timeout, logging), Telegram Security (whitelist, encrypted session), Audit (все действия с trace_id)
- **Domain:** DOMAIN-001 (Gateway -- Network), DOMAIN-003 (Skills -- File/Shell Sandbox), DOMAIN-006 (Telegram -- TG Security), DOMAIN-010 (Observability -- Audit)
- **Related Requirements:** FR-022
- **Dependencies:** F-001 (Core Infrastructure), F-007 (Skills System -- Filesystem/Shell skills), F-009 (Gateway -- Network layer)
- **Dependency Level:** 9
- **Estimated Tasks:** 7
- **Task Breakdown:** Backend: 4, Integration: 2, Tests: 1
- **Scope:** MVP
- **Priority:** P0
- **Components:** S-042 (7-Layer Security), S-043 (File Sandbox), S-044 (Shell Security), S-045 (Permission Prompts), S-046 (Audit Logging)
- **Status:** Active
- **Notes:** PermissionSystem: category-based (read=auto, write=confirm, exec=confirm), permission_request через Gateway. FileSandbox: allowed_dirs whitelist, blocked_patterns (hardcoded: ~/.ssh/**, ~/.gnupg/**, /etc/**, /boot/** + configurable), symlink resolution для предотвращения escape. ShellSecurity: blocked commands list, timeout enforcement (120s default), command logging. Docker sandbox для non-main sessions (graceful degradation при отсутствии Docker)

---

### Feature F-013: Cross-Platform + Testing

- **Name:** Cross-Platform + Testing
- **Description:** Кроссплатформенная поддержка (Linux primary + Windows native), unit tests (vitest), integration tests, E2E tests критичных сценариев, GitHub Actions CI для Linux + Windows
- **Domain:** Все домены (cross-cutting)
- **Related Requirements:** FR-029, NFR-M02
- **Dependencies:** Все предыдущие фичи (F-001..F-012)
- **Dependency Level:** 10
- **Estimated Tasks:** 5
- **Task Breakdown:** Tests: 3, CI/CD: 1, Cross-platform: 1
- **Scope:** MVP
- **Priority:** P0
- **Components:** S-052 (Unit Tests), S-053 (Integration Tests), S-054 (E2E Tests), S-055 (Cross-Platform CI), S-056 (Linux Support), S-057 (Windows Support)
- **Status:** Active
- **Notes:** Финальная фича -- перекрёстное тестирование всех компонентов. Unit tests для всех packages (vitest). Integration tests: cross-module (Gateway <-> Agent, Memory <-> RAG, Provider <-> Failover). E2E tests: критичные сценарarii (запрос через CLI -> agent loop -> LLM -> response; file operation with permission prompt; chat switch). GitHub Actions: matrix build (ubuntu-latest, windows-latest). Фича может частично развиваться параллельно с другими (unit tests пишутся по мере реализации)

---

## Traceability Matrix

| FR-ID | Feature |
|-------|---------|
| FR-001 | F-009 |
| FR-002 | F-008 |
| FR-003 | F-009 |
| FR-004 | F-009 |
| FR-005 | F-007 |
| FR-006 | F-007 |
| FR-007 | F-002 |
| FR-008 | F-005 |
| FR-009 | F-005 |
| FR-010 | F-005 |
| FR-011 | F-005, F-008 |
| FR-012 | F-006 |
| FR-013 | F-005 |
| FR-014 | F-010 |
| FR-015 | F-010 |
| FR-016 | F-010 |
| FR-019 | F-011 |
| FR-020 | F-004 |
| FR-022 | F-012 |
| FR-023 | F-003, F-012 |
| FR-024 | F-001, F-003 |
| FR-025 | F-001 |
| FR-028 | F-002 |
| FR-029 | F-013 |
| NFR-M02 | F-013 |

---

## Notes

1. **Фича F-013 (Cross-Platform + Testing)** -- unit tests могут разрабатываться параллельно с каждой фичей, но E2E и cross-platform CI требуют завершения всех основных фич
2. **Фича F-005 (Memory System)** -- 10 задач, на верхней границе optimal range. sqlite-vec и RAG pipeline -- наиболее сложные submodule
3. **Фича F-010 (Telegram Integration)** -- 9 задач, включает двухязыковую сложность (TypeScript + Python microservice)
4. **Фича F-007 (Skills System)** -- 9 задач, охватывает 6 skills с различной сложностью
5. **Фичи V1/V2 не включены** в данный индекс -- будут декомпозированы после завершения MVP
6. **FR-017, FR-018 (Voice STT/TTS)**, **FR-021 (System Tray)**, **FR-026 (Daemon)** -- V1 scope, не вошли в MVP decomposition
7. **FR-027 (OpenClaw Compatibility)** -- условная, не формирует отдельную фичу (учитывается при проектировании API)

---

## Risks

| ID | Риск | Митигация |
|----|------|-----------|
| R-FD-01 | Solo developer -- 12 фич MVP, суммарно ~89 задач (~180-360 часов) | Строгая приоритизация P0. Минимальный runnable MVP после F-001 + F-002 + F-008 + F-011 |
| R-FD-02 | Python microservice (Telethon) -- двухязыковая сложность | Изолированная фича F-010, fallback на bot-only mode |
| R-FD-03 | Native modules (better-sqlite3, sqlite-vec) на Windows | Prebuild binaries, CI на Windows, fallback на pure-JS |
| R-FD-04 | Кроссплатформенные различия в OS Integration (F-004) | systeminformation (pure JS), node-notifier (кроссплатформенный) |
| R-FD-05 | Фича F-005 (Memory System) -- 10 задач, риск затягивания | Итеративная реализация: SQLite schema -> embeddings -> vector storage -> RAG -> context window |

---

**Версия документа:** v1.0
**Дата создания:** 2026-03-30
**Автор:** Feature Decomposition Agent
**Статус:** Завершён
