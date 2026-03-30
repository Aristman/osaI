# Project Profile (Internal)

## Project Classification

- Project Type: Fork/Extension существующей системы (OpenClaw)
- Base Project: OpenClaw by Peter Steinberger (MIT License, 100k+ GitHub stars)
- Version: v3.0
- Status: Черновик (Draft)
- Spec Source: docs/specs/spec_osai_v3_2026-03-28.md
- Development Branch: OSAI-DEV-V3

## Domains

### DOMAIN-001: Gateway
- Domain ID: DOMAIN-001
- Responsibility: WebSocket control plane, channel routing, chat routing, session management
- Components: WS server (ws://127.0.0.1:18789), Chat Router, Session Manager, Channel handlers (Telegram, WhatsApp, Discord, CLI)
- Assigned Agent Profile: backend-typescript

### DOMAIN-002: Agent Runtime
- Domain ID: DOMAIN-002
- Responsibility: Agent loop (intake -> context_assembly -> model_inference -> tool_execution -> streaming -> persistence), hook system (13 hook points)
- Components: Agent loop, hooks, context assembly, model inference, tool execution, streaming, persistence
- Assigned Agent Profile: backend-typescript

### DOMAIN-003: Skills System
- Domain ID: DOMAIN-003
- Responsibility: Bundled skills (Filesystem, Shell, Browser, HTTP), osaI-specific skills (OS Integration, Memory, Knowledge Base, Chat Management), SKILL.md format, ClawHub registry
- Components: skills-core (packages/skills-core), skills-osai (packages/skills-osai), Skill registry, SKILL.md parser
- Assigned Agent Profile: backend-typescript

### DOMAIN-004: Memory System
- Domain ID: DOMAIN-004
- Responsibility: Three-tier memory (Chat Memory, Session Memory, Long-term Memory), RAG pipeline, embeddings, context window management, fact extraction
- Components: SQLite persistence, Qdrant vector DB, embedding providers, RAG pipeline, context window manager
- Assigned Agent Profile: backend-typescript

### DOMAIN-005: Knowledge Base
- Domain ID: DOMAIN-005
- Responsibility: Document ingestion (chunk + embed), semantic search, source management
- Components: ingestion pipeline, search engine, source manager, Qdrant integration
- Assigned Agent Profile: backend-typescript

### DOMAIN-006: Telegram Integration
- Domain ID: DOMAIN-006
- Responsibility: Telegram Bot (grammY), Telegram Userbot (Telethon), bidirectional mirror engine
- Components: bot handler, userbot bridge (Python microservice), mirror engine, telegram manager
- Note: Telethon (Python) работает как отдельный microservice через child_process
- Assigned Agent Profile: backend-multi (TypeScript + Python)

### DOMAIN-007: Voice Stack
- Domain ID: DOMAIN-007
- Responsibility: STT (Ollama Whisper -> Yandex SpeechKit fallback), TTS (Ollama Piper -> Yandex SpeechKit fallback), voice manager, wake word
- Components: STT providers, TTS providers, voice manager, audio I/O, VAD
- Assigned Agent Profile: backend-typescript

### DOMAIN-008: LLM Providers
- Domain ID: DOMAIN-008
- Responsibility: Provider registry, failover chain (Z.ai -> Yandex -> Anthropic -> OpenAI -> Ollama), auth profile rotation, circuit breaker
- Components: z-ai provider, yandex provider, anthropic provider, openai provider, ollama provider, failover logic, circuit breaker
- Assigned Agent Profile: backend-typescript

### DOMAIN-009: OS Integration
- Domain ID: DOMAIN-009
- Responsibility: System tray (Linux + Windows), desktop notifications, file watchers, process management, system info, daemon management (systemd / Windows Service)
- Components: tray, notifications, file-watcher, process-manager, system-info, daemon
- Assigned Agent Profile: backend-typescript

### DOMAIN-010: Observability
- Domain ID: DOMAIN-010
- Responsibility: OpenTelemetry traces + metrics, structured logging (pino), audit log, Prometheus endpoint, dashboards
- Components: traces, metrics, audit log, exporters, prometheus endpoint
- Assigned Agent Profile: backend-typescript

### DOMAIN-011: CLI Client
- Domain ID: DOMAIN-011
- Responsibility: Interactive CLI chat, TUI layout (ink), commands (chat, session, config, skills, memory, channel, status)
- Components: CLI commands, TUI components, chat UI
- Assigned Agent Profile: frontend-cli

### DOMAIN-012: Web Dashboard
- Domain ID: DOMAIN-012
- Responsibility: Web-based dashboard для управления osaI
- Components: SvelteKit app, TailwindCSS styling
- Milestone: V1 (не MVP)
- Assigned Agent Profile: frontend-web

## Development Direction

- Primary: Backend (TypeScript/Node.js)
- Secondary: CLI/TUI, System Integration, Python microservice (Telethon)
- Tertiary: Web Dashboard (V1)
- Architecture: Monorepo (pnpm workspace)
- Pattern: Fork + Extension (80% inherited from OpenClaw, 20% osaI-specific)

## Target Platforms

- Linux (primary dev platform)
- Windows 10/11 (native, not WSL-only)
- Note: macOS не является целевой платформой для osaI v3

## Constraints

### Time Constraints
- MVP: не определён конкретный дедлайн
- Roadmap этапы: MVP -> V1 -> V2 (последовательная доставка)
- Solo developer (согласно risk assessment)

### Technical Constraints
- Runtime: Node.js 22.16+ LTS / 24
- Language: TypeScript 5.x
- Package Manager: pnpm (совместимость с OpenClaw)
- Base: Fork OpenClaw (зависимость от upstream)
- Local-first: все данные на машине пользователя
- Gateway: WebSocket на localhost (127.0.0.1:18789)
- Database: SQLite (better-sqlite3) + Qdrant embedded
- Python dependency: Telethon для Telegram Userbot (child_process bridge)
- Sandbox: Docker containers для non-main sessions

### Organizational Constraints
- Solo developer (согласно risk assessment)
- Open-source (MIT License)
- One user per installation (local-first, нет user accounts/auth)
- No cloud-hosted backend
- No subscription/billing system

## Quality Targets

- Target Quality Score: 8/10 (production-ready для MVP)
- Risk Tolerance: Medium
  - Критические риски:破坏ительные действия агента (mitigated by 7-layer security)
  - Средние риски: upstream breaking changes, LLM API downtime, Telethon ban risk
  - Допустимые риски: Qdrant on Windows, Node.js native modules on Windows

## Non-Functional Priorities

- Performance:
  - Priority: Medium
  - Local-first reduces latency
  - Ollama embeddings local (no network for default case)
  - Context window auto-pruning for memory efficiency

- Security:
  - Priority: Critical
  - 7-layer security model (Network, Sandbox, Permissions, File Sandbox, Shell Security, Telegram Security, Audit)
  - Docker sandboxing for non-main sessions
  - Encrypted Telegram userbot session storage
  - Audit logging for all actions with trace_id

- Reliability:
  - Priority: High
  - 5-звенная failover chain для LLM (Z.ai -> Yandex -> Anthropic -> OpenAI -> Ollama)
  - Circuit breaker (failure_threshold: 5, reset_timeout: 30s)
  - Auth profile rotation для rate limit handling
  - Local Ollama fallback для offline scenarios

- Scalability:
  - Priority: Low (single-user system)
  - До 20 одновременных чатов
  - Qdrant для векторного поиска
  - SQLite для structured data
  - V2 target: team collaboration, multi-device

- Maintainability:
  - Priority: High
  - Monorepo с чётким разделением пакетов
  - Hook-based extensibility
  - SKILL.md format для декларативных skills
  - TypeScript strict mode
  - Comprehensive testing (unit + integration + E2E)

## Agent Profiles

### DOMAIN-001: Gateway
- Developer Profile: backend-typescript (Node.js, WebSocket, event-driven architecture)
- Tester Profile: integration-tester (WS protocol testing, channel routing)
- Reviewer Profile: code-reviewer (security review for network layer)
- Release Profile: release-engineer

### DOMAIN-002: Agent Runtime
- Developer Profile: backend-typescript (agent patterns, hook system, streaming)
- Tester Profile: unit-tester + integration-tester
- Reviewer Profile: code-reviewer (architecture review)
- Release Profile: release-engineer

### DOMAIN-003: Skills System
- Developer Profile: backend-typescript (plugin architecture, DSL parsing)
- Tester Profile: unit-tester (skill execution, sandbox verification)
- Reviewer Profile: code-reviewer (security review for permissions)
- Release Profile: release-engineer

### DOMAIN-004: Memory System
- Developer Profile: backend-typescript (SQLite, vector DB, RAG, embeddings)
- Tester Profile: integration-tester (cross-module with Agent Runtime)
- Reviewer Profile: code-reviewer (performance review)
- Release Profile: release-engineer

### DOMAIN-005: Knowledge Base
- Developer Profile: backend-typescript (document processing, vector search)
- Tester Profile: integration-tester
- Reviewer Profile: code-reviewer
- Release Profile: release-engineer

### DOMAIN-006: Telegram Integration
- Developer Profile: backend-multi (TypeScript for bot/manager, Python for Telethon userbot)
- Tester Profile: integration-tester (Telegram API mocking, mirror testing)
- Reviewer Profile: code-reviewer (security review for userbot, rate limiting)
- Release Profile: release-engineer

### DOMAIN-007: Voice Stack
- Developer Profile: backend-typescript (audio processing, API integration)
- Tester Profile: integration-tester (audio pipeline testing)
- Reviewer Profile: code-reviewer
- Release Profile: release-engineer

### DOMAIN-008: LLM Providers
- Developer Profile: backend-typescript (API adapters, failover patterns, circuit breaker)
- Tester Profile: unit-tester + integration-tester (provider mocking)
- Reviewer Profile: code-reviewer (resilience review)
- Release Profile: release-engineer

### DOMAIN-009: OS Integration
- Developer Profile: backend-typescript (system-level APIs, cross-platform)
- Tester Profile: integration-tester (Linux + Windows CI)
- Reviewer Profile: code-reviewer (cross-platform review)
- Release Profile: release-engineer

### DOMAIN-010: Observability
- Developer Profile: backend-typescript (OpenTelemetry, Prometheus, structured logging)
- Tester Profile: unit-tester
- Reviewer Profile: code-reviewer
- Release Profile: release-engineer

### DOMAIN-011: CLI Client
- Developer Profile: frontend-cli (oclif, ink, terminal UI)
- Tester Profile: e2e-tester (CLI command testing)
- Reviewer Profile: code-reviewer (UX review)
- Release Profile: release-engineer

### DOMAIN-012: Web Dashboard
- Developer Profile: frontend-web (SvelteKit, TailwindCSS)
- Tester Profile: e2e-tester (browser testing)
- Reviewer Profile: code-reviewer
- Release Profile: release-engineer

## MVP Scope (P0)

Следующие компоненты входят в MVP:
- DOMAIN-001: Gateway (WS control plane, channel routing)
- DOMAIN-002: Agent Runtime (agent loop, hooks)
- DOMAIN-003: Skills System (Filesystem + Shell bundled skills, Chat Management skill)
- DOMAIN-004: Memory System (SQLite sessions, Qdrant long-term, RAG, embeddings, context window)
- DOMAIN-005: Knowledge Base (ingest + search)
- DOMAIN-006: Telegram Integration (Bot + Userbot + Mirror)
- DOMAIN-008: LLM Providers (Z.ai + Yandex + Anthropic + OpenAI + Ollama)
- DOMAIN-009: OS Integration (notifications + system info)
- DOMAIN-011: CLI Client (TUI + chat commands)
- Infrastructure: structured logging (pino), unit + integration + E2E tests, cross-platform (Linux + Windows)

## V1 Scope (P1)

- DOMAIN-007: Voice Stack
- DOMAIN-009: OS Integration (system tray, file watchers, process mgmt, Windows Service)
- DOMAIN-010: Observability (OpenTelemetry + audit log + Prometheus)
- DOMAIN-012: Web Dashboard (SvelteKit)
- Additional skills: Browser (CDP), HTTP/API
- Additional channels: WhatsApp, Discord, Slack
- Background tasks, Device pairing (Tailscale)

## V2 Scope (P2-P3)

- Multi-agent architecture
- Canvas/A2UI
- Plugin marketplace
- Advanced RAG
- Smart scheduling
- Team collaboration
- All 20+ OpenClaw channels
- MCP integration
- Voice wake word
- Desktop app (Electron/Tauri)

## Assumptions

- [A1] OpenClaw repository доступен для форка (confidence: 90%) -- указано в спецификации как реально существующий проект
- [A2] Z.ai предоставляет OpenAI-совместимый API (confidence: 85%) -- указано в спецификации как primary LLM
- [A3] Yandex Foundation Models API доступен и включает LLM + Embeddings + STT/TTS (confidence: 80%) -- указано в спецификации
- [A4] Qdrant embedded работает на Windows (confidence: 60%) -- указано в рисках как средний риск, fallback на sqlite-vec
- [A5] Telethon userbot не будет заблокирован Telegram при легитимном использовании (confidence: 50%) -- указано в рисках как высокий риск
- [A6] Solo developer -- один разработчик на проекте (confidence: 90%) -- следует из risk assessment
- [A7] Node.js 22.16+ LTS / 24 как runtime (confidence: 95%) -- явно указано в спецификации
- [A8] Docker доступен на целевых машинах для sandbox (confidence: 75%) -- зависит от пользовательских машин
- [A9] Ollama установлен на целевой машине для локальных LLM/embeddings/voice (confidence: 70%) -- требуется для local-first
- [A10] TypeScript/Node.js достаточно для производительности системы (confidence: 80%) -- принятое решение (tradeoff)

## Key Technical Decisions (from spec)

Примечание: эти решения зафиксированы в спецификации и НЕ должны пересматриваться при генерации профиля.

| Decision | Rationale (from spec) |
|----------|-----------------------|
| Z.ai primary LLM | Приоритетный провайдер, OpenAI-совместимый API |
| Yandex in failover chain | Единый провайдер для LLM + Embeddings + STT/TTS |
| Telethon userbot (Python) | Лучший client для userbot, работает как microservice |
| Ollama embeddings default | Local-first, бесплатный, 768-dim |
| TypeScript/Node.js | Совместимость с OpenClaw (80% кода готово) |
| Fork OpenClaw (not from scratch) | Готовый gateway, agent, 20+ channels, skills |
| SQLite + Qdrant | Local-first, Qdrant embedded, SQLite для structured data |
| SvelteKit for dashboard | Легче и быстрее, desktop dashboard не нужен SSR |
| Docker sandbox | Совместимость с OpenClaw, sufficient isolation |
| Native Windows support | Расширение аудитории |

## Security Requirements

- 7-layer security model обязательна для MVP
- File sandbox: allowed_dirs + blocked_patterns
- Shell security: blocked commands + timeout + logging
- Docker sandbox для non-main sessions
- Telegram: allowedUsers whitelist для bot, encrypted session для userbot
- Audit logging для всех действий с trace_id
- Permission prompts: read=auto, write=confirm, exec=confirm

## Data Model (Key Entities)

- Chat: id, name, description, tags, icon, color, channel, channel_metadata, is_active
- ChatMessage: id, chat_id, role, content, tool_calls, metadata
- MemoryEntry: id, content, embedding, category, tags, source_session, source_chat_id, access_count
- KnowledgeDocument: id, title, path, chunks_count, tags
- KnowledgeChunk: id, document_id, content, embedding_id, chunk_index
- AuditLogEntry: id, session_id, chat_id, timestamp, trace_id, action, tool_name, skill_name, params, result, user_decision, risk_level
