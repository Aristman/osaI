# Project Scope

**Version:** v1.0
**Generated:** 2026-03-24
**Source:** ANALYSIS.md + PROJECT_PROFILE.md + TECH_REQUIREMENTS.md
**Author:** System Analyst Agent

---

## 1. In Scope

### 1.1 Must Have (MVP)

| # | Component | Description | Traceability |
|---|-----------|-------------|--------------|
| MVP-1 | Gateway (WS Control Plane) | WebSocket server на localhost, WS protocol (message, command, permission_response, subscribe, tool_stream, block, permission_request), session router (main, group, isolated), session persistence/resume | FR-001 -- FR-007, FR-010 |
| MVP-2 | Agent Runtime | Agent loop (intake -> context -> inference -> tools -> stream -> persist), 7 hook points, model failover chain (Claude -> GPT -> Ollama), session pruning, skills loader | FR-011 -- FR-019 |
| MVP-3 | Skills: Filesystem | read_file, write_file, list_directory, search_files, move_file, delete_file с sandbox enforcement | FR-020 |
| MVP-4 | Skills: Shell | Shell command execution с timeout (120s), blocked commands, command logging | FR-021 |
| MVP-5 | Skills System | SKILL.md parsing, tool_schemas generation, bundled/managed/workspace skill types, include/exclude config | FR-019, FR-024, FR-025 |
| MVP-6 | LLM Integration | Anthropic Claude (primary), Ollama (local fallback), error handling (429, 500, timeout) | FR-015, FR-070 -- FR-072 |
| MVP-7 | Short-term Memory | Session messages + tool results в SQLite, session state persistence | FR-029 |
| MVP-8 | Security: Network | WS server на localhost только, Tailscale для remote | FR-038 |
| MVP-9 | Security: Permissions | Category-based (read=auto, write=confirm, exec=confirm), permission_request/response через WS | FR-040 |
| MVP-10 | Security: File Sandbox | Allowed dirs, blocked patterns, symlink resolution, path traversal prevention | FR-041, FR-044 |
| MVP-11 | Security: Shell Security | Blocked commands list, timeout enforcement, command logging | FR-042 |
| MVP-12 | CLI Client | oclif commands (chat, session, config, skills, memory, channel, status), interactive TUI (ink), permission prompts, quick command mode | FR-056 -- FR-059 |
| MVP-13 | Configuration | ~/.osai/ directory structure, openclaw.json (gateway, model, session, skills, security), `osai init` | FR-064 -- FR-066 |
| MVP-14 | Structured Logging | pino JSON logger, correlation IDs, configurable log levels | FR-049 |
| MVP-15 | Error Handling | Error severity classification, retry с exponential backoff, model failover error strategies | FR-070 -- FR-072 |
| MVP-16 | Installation | `npm install -g @osai/cli` | FR-066 |
| MVP-17 | Graceful Shutdown | Pending operations completion, DB connections close | NFR-011 |

### 1.2 Should Have (V1)

| # | Component | Description | Traceability |
|---|-----------|-------------|--------------|
| V1-1 | Skills: Browser | CDP browser automation (navigate, click, fill, screenshot) в sandboxed Chrome | FR-022 |
| V1-2 | Skills: HTTP | HTTP API client (GET, POST, PUT, DELETE) с timeout | FR-023 |
| V1-3 | Skills: OS Integration | show_notification, watch_directory, list_processes, open_application, get_system_info | FR-026 |
| V1-4 | Skills: Memory | remember, recall, forget, summarize_session | FR-027 |
| V1-5 | Skills: Knowledge Base | ingest_document, query_knowledge, list_sources, remove_source | FR-028 |
| V1-6 | Long-term Memory | SQLite metadata + Qdrant vectors, categories (FACT, PREFERENCE, KNOWLEDGE, ERROR, PATTERN) | FR-030, FR-034 |
| V1-7 | RAG Pipeline | Query -> embed -> Qdrant search -> inject into prompt (before_prompt_build hook) | FR-031 |
| V1-8 | Embedding Pipeline | Fallback chain: OpenAI (1536-dim) -> Ollama (768-dim) -> ONNX (384-dim) | FR-032 |
| V1-9 | Fact Extraction | Автоматическое извлечение фактов из ответов агента | FR-033 |
| V1-10 | Knowledge Base Ingestion | Document -> chunking -> embedding -> store (Qdrant + SQLite) | FR-035 |
| V1-11 | Qdrant Integration | REST client (@qdrant/js-client-rest) + Qdrant server (Docker/systemd) | FR-036 |
| V1-12 | osaI-specific Hooks | before_memory_query, after_memory_extract, on_file_access, on_desktop_notification | FR-013 |
| V1-13 | Security: Docker Sandbox | Non-main sessions в Docker containers, resource limits, network isolation | FR-039 |
| V1-14 | Security: Audit Log | Все действия с trace_id, immutable, queryable через API | FR-043 |
| V1-15 | Auth Profile Rotation | Несколько API-ключей, ротация при rate limit | FR-016 |
| V1-16 | Circuit Breaker | Temporal exclusion of failing providers | FR-017 |
| V1-17 | Session Queue Modes | Sequential и parallel processing | FR-005 |
| V1-18 | OpenTelemetry | Traces (agent loop, inference, tool calls, memory), metrics (tokens, cost, latency, success rate), pino correlation IDs | FR-045 -- FR-047, NFR-031 -- NFR-034 |
| V1-19 | REST API | Memory, KB, Observability, OS Integration, Skills endpoints | FR-068 |
| V1-20 | System Tray | Desktop tray icon с меню (Open Chat, Sessions, Memory, Skills, Status, Quit) | FR-050 |
| V1-21 | Desktop Notifications | node-notifier с urgency levels | FR-051 |
| V1-22 | File Watcher | Directory monitoring (create, modify, delete events) | FR-052 |
| V1-23 | Process Management | list_processes, get_system_info (CPU, memory, disk) | FR-053 |
| V1-24 | Service Management | systemd --user (Linux), launchd (macOS) autostart | FR-054 |
| V1-25 | OS Integration Fallback | CLI-only mode если desktop integration недоступна | FR-055 |
| V1-26 | Web Dashboard | SvelteKit + TailwindCSS: chat area, channel sidebar, agent trace view, permission prompts, memory search, system status | FR-061 -- FR-063 |
| V1-27 | Channel: Telegram | grammY-based Telegram channel handler | FR-008 |
| V1-28 | Channel: WhatsApp | Baileys-based WhatsApp channel handler | FR-008 |
| V1-29 | Workspace | AGENTS.md, SOUL.md, TOOLS.md, user skills (SKILL.md) | FR-069 |
| V1-30 | CLI: Session Info | Status bar с session id, model, token usage | FR-060 |

### 1.3 Could Have (V2)

| # | Component | Description | Traceability |
|---|-----------|-------------|--------------|
| V2-1 | Multi-agent Architecture | Специализированные агенты для разных задач | PROJECT_PROFILE |
| V2-2 | Canvas/A2UI | Agent-driven visual workspace | SPEC |
| V2-3 | Plugin Marketplace | ClawHub + osaI plugins distribution | SPEC |
| V2-4 | Advanced RAG | Re-ranking, hybrid search | PROJECT_PROFILE |
| V2-5 | Smart Scheduling | Cron-like task scheduling | SPEC |
| V2-6 | Team Collaboration | Shared memory + KB, multi-user | SPEC |
| V2-7 | All 20+ Channels | Slack, Discord, Signal, iMessage, и другие | FR-009 |
| V2-8 | MCP Integration | Model Context Protocol | SPEC |
| V2-9 | Voice Wake + Talk Mode | Wake word detection, speech-to-text, text-to-speech | SPEC |
| V2-10 | Embedding Dimension Compatibility | Handling different dimensions across providers | FR-037 |
| V2-11 | Memory Scaling | 100k+ entries без деградации | NFR-019 |
| V2-12 | KB Scaling | 10k+ documents | NFR-020 |
| V2-13 | REPL Mode | CLI REPL для последовательного выполнения | OQ-6 |

---

## 2. Out of Scope

### 2.1 Won't Have (explicitly excluded)

| # | Excluded | Reason | Source |
|---|----------|--------|--------|
| EX-1 | Cloud-hosted backend | Нарушает local-first принцип | PROJECT_PROFILE, SPEC 19.4 |
| EX-2 | Mobile native apps | Доступ через мессенджеры (Tailscale) достаточен | PROJECT_PROFILE, SPEC 19.4 |
| EX-3 | Subscription / billing system | Open-source проект, нет монетизации | PROJECT_PROFILE, SPEC 19.4 |
| EX-4 | User accounts / authentication | Local-first, один пользователь на машину | PROJECT_PROFILE, SPEC 19.4 |
| EX-5 | Windows support | Целевые платформы: Linux (primary), macOS (secondary) | PROJECT_PROFILE |
| EX-6 | Server deployment mode | Только desktop/workstation deployment | PROJECT_PROFILE |
| EX-7 | Custom Rust backend | osaI -- TypeScript/Node.js | PROJECT_PROFILE |
| EX-8 | Multi-user / multi-tenant | Один пользователь на машину | PROJECT_PROFILE |
| EX-9 | Cloud database (Pinecone, etc.) | Local-first, SQLite + Qdrant на localhost | PROJECT_PROFILE |
| EX-10 | SSR для Web Dashboard | Dashboard -- SPA, подключается к local Gateway | SPEC |

### 2.2 Excluded from MVP (deferred to V1/V2)

| # | Deferred | Reason | Target |
|---|----------|--------|--------|
| DF-1 | Browser skill (CDP) | Требует Chrome/Chromium и дополнительного complex sandboxing | V1 |
| DF-2 | HTTP skill | Полезен, но не критичен для core workflow | V1 |
| DF-3 | Long-term memory + RAG | Сложный subsystem, требует Qdrant + embeddings | V1 |
| DF-4 | OpenTelemetry observability | Улучшает debuggability, но не блокирует core | V1 |
| DF-5 | Audit log | Важен для security, но базовый logging достаточен для MVP | V1 |
| DF-6 | System tray + notifications | Desktop convenience, CLI sufficient для MVP | V1 |
| DF-7 | Web Dashboard | CLI -- primary interface для MVP | V1 |
| DF-8 | Telegram/WhatsApp channels | CLI -- primary interface для MVP | V1 |
| DF-9 | Docker sandbox для non-main sessions | File sandbox достаточен для main session (MVP scope) | V1 |
| DF-10 | Device pairing (Tailscale multi-device) | Single device sufficient для MVP | V1 |

### 2.3 Implicitly Excluded

| # | Excluded | Reason |
|---|----------|--------|
| IE-1 | OpenClaw fork / upstream compatibility | OpenClaw не найден; osaI -- самостоятельная реализация |
| IE-2 | Canvas/A2UI visual workspace | Специфичная feature, deferred |
| IE-3 | Voice wake + talk mode | Complex subsystem, deferred |
| IE-4 | Plugin marketplace infrastructure | Требует backend for plugin distribution, deferred |
| IE-5 | Графический installer | npm/binary install sufficient |
| IE-6 | In-process vector database | Qdrant server (Docker/systemd) выбран как подход |

---

## 3. Constraints

### 3.1 Business Constraints

| # | Constraint | Impact | Source |
|---|-----------|--------|--------|
| BC-1 | Solo developer (single contributor) | Ограниченный темп разработки; нужен приоритизированный roadmap | PROJECT_PROFILE |
| BC-2 | Open-source без monetization | Нет ресурсов на paid infrastructure; всё self-hosted | PROJECT_PROFILE |
| BC-3 | Нет фиксированных дедлайнов | Риск бесконечной разработки; milestone-based подход | PROJECT_PROFILE |

### 3.2 Technical Constraints

| # | Constraint | Impact | Source |
|---|-----------|--------|--------|
| TC-1 | TypeScript 5.x, Node.js 20+ LTS | Runtime limitations; no Rust/C++ components (except native addons) | PROJECT_PROFILE |
| TC-2 | Monorepo из 8+ пакетов + 1 app | Сложность управления зависимостями; нужна чёткая modular architecture | PROJECT_PROFILE |
| TC-3 | better-sqlite3 -- native compilation | Требует node-gyp, python3, make, gcc; ARM/Apple Silicon могут потребовать доп. шагов | ANALYSIS 9.1 |
| TC-4 | Qdrant -- REST client, не in-process | Требуется запущенный Qdrant server (Docker or systemd) | ANALYSIS 4.4, F-2 |
| TC-5 | Docker обязателен для sandbox non-main sessions | Дополнительное infrastructure requirement | PROJECT_PROFILE |
| TC-6 | systray2 ненадёжен на Wayland | Linux desktop fragmentation; fallback на CLI | ANALYSIS 9.6 |
| TC-7 | @xenova/transformers переименован в @huggingface/transformers | Необходима миграция; v3 -- текущая версия | ANALYSIS F-1 |
| TC-8 | Local-first -- все данные на машине пользователя | Нет облачного бэкапа; данные теряются при loss of machine | PROJECT_PROFILE |

### 3.3 Organizational Constraints

| # | Constraint | Impact | Source |
|---|-----------|--------|--------|
| OC-1 | TypeScript strict mode | Более медленная разработка, но выше качество кода | PROJECT_PROFILE |
| OC-2 | 9 доменов, 8+ пакетов, frontend + backend + CLI | Significant scope для solo developer | PROJECT_PROFILE |
| OC-3 | Нет upstream dependency (OpenClaw недоступен) | Полная ответственность за реализацию всех компонентов | ANALYSIS 1.3, User prompt |

---

## 4. Dependencies

### 4.1 External Dependencies (Runtime)

| # | Dependency | Type | Required for | Risk if Unavailable | Mitigation |
|---|-----------|------|-------------|---------------------|------------|
| ED-1 | Node.js 20+ LTS | Runtime | All components | **Critical** -- system inoperable | N/A |
| ED-2 | Anthropic Claude API | External API (paid) | Primary LLM | Degraded: fallback to GPT/Ollama | Model failover chain |
| ED-3 | OpenAI GPT API | External API (paid) | Fallback LLM, embeddings | Degraded: fallback to Ollama | Local fallback |
| ED-4 | Ollama | Local service | Offline LLM fallback, local embeddings | Degraded: no offline capability | Document requirement |
| ED-5 | Qdrant Server | Local service | Long-term memory vectors | Degraded: no long-term memory | In-process alternative (V2) |
| ED-6 | Docker | Local service | Sandbox for non-main sessions | Degraded: file-level sandbox only | Document limitation |
| ED-7 | Chrome/Chromium | Local application | Browser skill (CDP) | Browser skill unavailable | Document limitation |
| ED-8 | Tailscale (optional) | Network tunnel | Remote access | Remote access unavailable | Localhost-only mode |

### 4.2 External Dependencies (Build/Dev)

| # | Dependency | Type | Required for | Risk if Unavailable |
|---|-----------|------|-------------|---------------------|
| BD-1 | npm/pnpm | Package manager | Build, install | Low -- standard tooling |
| BD-2 | node-gyp + build tools | Native compilation | better-sqlite3 | Medium -- install guide |
| BD-3 | git | Version control | Development workflow | Low |

### 4.3 Internal Dependencies (Package Graph)

```
Level 0:  monorepo root config
          |
Level 1:  os-integration (standalone, no deps)
          |
Level 2:  gateway (no deps on other osai packages)
          |
Level 3:  agent (depends on gateway for WS protocol)
          |
Level 4:  skills-core (depends on agent skills loader)
          |
Level 5:  memory (depends on agent hooks system)
          |
Level 6:  skills-osai (depends on memory package)
          |
Level 7:  observability (cross-cutting, depends on gateway + agent)
          |
Level 8:  cli (depends on gateway WS client)
          |
Level 9:  dashboard (depends on gateway WS client)
```

### 4.4 Development Dependencies

| # | Dependency | Description |
|---|-----------|-------------|
| DD-1 | Gateway stable | Agent, CLI, Dashboard не могут разрабатываться без стабильного Gateway |
| DD-2 | Agent stable | Skills-core, Memory, Observability зависят от agent runtime |
| DD-3 | Memory stable | Skills-osai зависит от memory package |

---

## 5. Scope Risks

### 5.1 Scope Creep Risks

| # | Risk | Probability | Impact | Mitigation |
|---|------|------------|--------|------------|
| SR-1 | V2 features "spill" into V1 (multi-agent, marketplace, voice) | High | High | Strict MoSCoW classification; H4 approval gate before each V1 domain |
| SR-2 | Additional channels requested before V1 complete | Medium | Medium | MVP/V1 разделение чёткое; каналы -- V1 optional |
| SR-3 | Browser skill scope expands to full web automation | Medium | Medium | CDP scope ограничен spec; additional features deferred to V2 |
| SR-4 | Knowledge base scope expands to full document management | Medium | Medium | Focus on ingestion + search; editing/management deferred |
| SR-5 | Dashboard scope expands to full admin panel | Medium | Medium | Dashboard -- read-only view; management through CLI |

### 5.2 Dependency Risks

| # | Risk | Probability | Impact | Mitigation |
|---|------|------------|--------|------------|
| DR-1 | Qdrant server setup complexity repels users | Medium | Medium | Auto-start Qdrant with osai; bundled Docker Compose; clear docs |
| DR-2 | Docker requirement excludes some users | Medium | Medium | File-level sandbox для main session; document Docker requirement clearly |
| DR-3 | better-sqlite3 build fails on some platforms | Low | Medium | Pre-built binaries; fallback на sql.js (pure JS); install guide |
| DR-4 | Node.js native addon compatibility issues | Low | Medium | Pin Node.js version; test on CI (Linux + macOS) |
| DR-5 | Chrome/Chromium not available for browser skill | Medium | Low | Browser skill -- V1 optional; graceful degradation |

### 5.3 Technical Scope Risks

| # | Risk | Probability | Impact | Mitigation |
|---|------|------------|--------|------------|
| TR-1 | RAG pipeline quality insufficient for useful memory recall | Medium | Medium | Tunable parameters (top_k, threshold, chunk size); user feedback loop |
| TR-2 | Fact extraction produces false positives | Medium | Low | Confidence scoring; user review mechanism |
| TR-3 | Context window overflow despite pruning | High | Medium | Session summarization; RAG for relevant context instead of full history |
| TR-4 | Model failover loses context (different providers, different formats) | Medium | Medium | Standardized context format; graceful degradation message |
| TR-5 | Embedding quality gap between OpenAI (1536-dim) and local (384-dim) | Medium | Medium | Configurable provider; user choice; quality metrics |
| TR-6 | File watcher unreliable on large directories | Medium | Low | Configurable limits; alternative: @parcel/watcher |

### 5.4 Resource Risks

| # | Risk | Probability | Impact | Mitigation |
|---|------|------------|--------|------------|
| RR-1 | Solo developer cannot complete V1 in reasonable timeframe | High | High | MVP-first approach; incremental delivery; regular scope reviews |
| RR-2 | Technical debt accumulates across 8+ packages | Medium | High | Strict linting/testing CI; refactoring sprints; clear interfaces |
| RR-3 | LLM API costs exceed budget during development | Medium | Medium | Budget limits in config; Ollama for dev/testing; cost metrics |

---

## 6. Scope Boundaries Summary

### What osaI IS

- Local-first personal AI assistant для desktop Linux/macOS
- AI-слой управления ОС: файлы, процессы, приложения
- Система с двухуровневой памятью и RAG
- Multi-channel доступ (CLI, Dashboard, мессенджеры)
- Система с 6-layer security model
- Observable система с OpenTelemetry
- Extensible через SKILL.md skill format
- Самостоятельная реализация (не fork)

### What osaiI is NOT

- Cloud service или SaaS
- Multi-user или multi-tenant system
- Mobile application
- Windows application
- Browser-only application
- AI chatbot без tool execution
- Fork of OpenClaw
- Billing or subscription system

---

*End of Scope Document v1.0*
