# Technical Requirements

**Version:** v1.0
**Generated:** 2026-03-24
**Source:** ANALYSIS.md + PROJECT_PROFILE.md + spec_osai_openclaw_2026-03-24.md
**Author:** System Analyst Agent

> ВНИМАНИЕ: OpenClaw не найден в публичных источниках. osaI разрабатывается как **самостоятельная реализация**
> по паттернам и архитектуре, описанным в спецификации. Все компоненты, которые в спецификации отмечены
> как "наследуется от OpenClaw", реализуются osaI самостоятельно.

---

## 1. System Overview

### 1.1 Цель системы

osaI (Operation System AI) -- personal AI-система, обеспечивающая AI-слой управления операционной системой пользователя. Система управляет файлами, процессами, приложениями через естественный язык; хранит и извлекает контекст между сессиями (долгосрочная память с RAG); обеспечивает полную observability всех действий AI-агента; предоставляет OS-native взаимодействие (tray, уведомления, file watchers); работает как personal OS assistant, доступный с любого устройства через мессенджеры.

### 1.2 Ключевые обязанности системы

1. **Единая точка управления** через Gateway (WebSocket control plane) для всех клиентских подключений
2. **Agent Runtime** с hook-based extensibility, реализующий цикл intake -> context -> inference -> tools -> stream -> persist
3. **Skills-система** -- все возможности реализуются как декларативные skills (SKILL.md format) с tool schemas для LLM
4. **Двухуровневая память** -- short-term (SQLite, session-scoped) + long-term (SQLite metadata + Qdrant vectors, RAG pipeline)
5. **6-layer security model** -- Network, Sandbox, Permissions, File Sandbox, Shell Security, Audit
6. **Observability** -- OpenTelemetry traces, metrics, structured logs, audit log
7. **Multi-channel доступ** -- CLI, Web Dashboard, мессенджеры (Telegram, WhatsApp и другие)
8. **OS-native интеграция** -- system tray, desktop notifications, file watchers, process management
9. **Local-first** -- все данные на машине пользователя, один пользователь, нет облачного backend

### 1.3 Стратегия реализации (вследствие отсутствия OpenClaw)

osaI реализует все компоненты самостоятельно по описанным в спецификации паттернам:

| Компонент | Стратегия |
|-----------|-----------|
| Gateway | Реализация с нуля по описанной WS architecture |
| Agent Runtime | Реализация с нуля по описанному agent loop pattern |
| Skills System | Реализация с нуля по SKILL.md format из спецификации |
| Session Model | Реализация с нуля по описанной модели |
| Model Failover | Реализация с нуля по описанной fallback chain |
| Docker Sandbox | Реализация с нуля по описанной модели |
| Qdrant | REST клиент + Qdrant server (Docker/systemd), не in-process |

---

## 2. Functional Requirements

### 2.1 Gateway (WS Control Plane)

| FR-ID | Описание | Traceability | Приоритет | Acceptance Criteria |
|-------|----------|--------------|-----------|---------------------|
| FR-001 | Система должна предоставлять WebSocket server на настраиваемом адресе (default: 127.0.0.1:18789) | ANALYSIS 2.2, SPEC 2.1 | Must Have (MVP) | WS server стартует и принимает подключения на заданном host:port |
| FR-002 | Система должна обрабатывать WS-сообщения типов: `message`, `command`, `permission_response`, `subscribe`, `tool_stream`, `block`, `permission_request` | SPEC 11.1, PROJECT_PROFILE | Must Have (MVP) | Каждое WS-сообщение корректно маршрутизируется; неподдерживаемый тип возвращает ошибку |
| FR-003 | Система должна маршрутизировать входящие сообщения к соответствующей сессии (main, group, isolated) через Session Router | SPEC 3.3, PROJECT_PROFILE | Must Have (MVP) | Сообщение от пользователя корректно доставляется в целевую сессию |
| FR-004 | Система должна поддерживать типы сессий: main (persistent, 1:1), group (isolated) с режимами активации: always, mention, wake_word, passive | SPEC 3.3 | Must Have (MVP) | Создание сессии каждого типа; переключение режимов активации; изоляция между сессиями |
| FR-005 | Система должна поддерживать режимы очереди обработки: sequential и parallel | SPEC 3.3 | Should Have (V1) | Сообщения в сессии обрабатываются в соответствии с настроенным режимом очереди |
| FR-006 | Система должна стримить результаты tool-вызовов через WS (tool_stream) и структурированные блоки (block) | SPEC 5.2 | Must Have (MVP) | Клиент получает tool_stream и block сообщения в real-time при выполнении agent loop |
| FR-007 | Система должна поддерживать канал CLI как WS-клиент | PROJECT_PROFILE, SPEC 9.2 | Must Have (MVP) | CLI подключается к Gateway через WS и обменивается сообщениями |
| FR-008 | Система должна поддерживать channel handlers для Telegram и WhatsApp | SPEC 9.1, PROJECT_PROFILE | Should Have (V1) | Сообщения из Telegram/WhatsApp доставляются в Gateway; ответы отправляются обратно |
| FR-009 | Система должна поддерживать channel handlers для Slack, Discord, Signal, iMessage | SPEC 9.1 | Could Have (V2) | Минимум 5 каналов работают одновременно |
| FR-010 | Система должна сериализовать/десериализовать сессии для persistence и resume после restart | SPEC 3.3, ANALYSIS 6.2 | Must Have (MVP) | После restart системы сессия резюмируется с полной историей |

### 2.2 Agent Runtime

| FR-ID | Описание | Traceability | Приоритет | Acceptance Criteria |
|-------|----------|--------------|-----------|---------------------|
| FR-011 | Система должна реализовать agent loop: intake -> context_assembly -> model_inference -> tool_execution -> streaming -> persistence | SPEC 3.1, ANALYSIS 10.1 | Must Have (MVP) | Полный цикл выполняется для каждого пользовательского сообщения |
| FR-012 | Система должна поддерживать hook points: before_model_resolve, before_prompt_build, before_agent_start, before_tool_call, after_tool_call, agent_end, on_error | SPEC 3.2, ANALYSIS 10.1 | Must Have (MVP) | Каждый hook вызывается в правильный момент цикла; hook может модифицировать данные или прерывать выполнение |
| FR-013 | Система должна поддерживать osaI-specific hook points: before_memory_query, after_memory_extract, on_file_access, on_desktop_notification | SPEC 3.2, ANALYSIS 10.1 | Should Have (V1) | Дополнительные hook'и интегрированы в agent loop; сторонние модули могут регистрировать обработчики |
| FR-014 | Система должна выполнять assembly контекста: system prompt + skills tool schemas + memory context + session history | SPEC 3.1 | Must Have (MVP) | Контекст содержит все необходимые компоненты; tool schemas корректно передаются LLM |
| FR-015 | Система должна реализовать model failover chain: primary (Claude) -> fallback1 (GPT-4o) -> fallback2 (Ollama) | SPEC 3.4, ANALYSIS 3.1 | Must Have (MVP) | При недоступности primary система автоматически переключается на fallback; контекст сохраняется максимально |
| FR-016 | Система должна реализовать auth profile rotation -- несколько API-ключей для одного провайдера, автоматическая ротация при rate limit | SPEC 3.4 | Should Have (V1) | При получении 429 система переключается на следующий API-ключ; после cooldown возвращает первый |
| FR-017 | Система должна реализовать circuit breaker для model provider'ов | SPEC 5.4 | Should Have (V1) | После N последовательных ошибок провайдер временно исключается из chain; автоматическое восстановление |
| FR-018 | Система должна реализовать session pruning при overflow контекстного окна | ANALYSIS 6.1, SPEC 3.3 | Must Have (MVP) | При приближении к лимиту контекста старые сообщения суммаризируются или удаляются; текущий контекст не теряется |
| FR-019 | Система должна загружать и исполнять skills по SKILL.md определениям, конвертируя tool declarations в tool_schemas для LLM | SPEC 4.1, 4.2 | Must Have (MVP) | SKILL.md парсится; tool_schemas генерируются; LLM получает корректные tool definitions; tool calls исполняются |

### 2.3 Skills: Core

| FR-ID | Описание | Traceability | Приоритет | Acceptance Criteria |
|-------|----------|--------------|-----------|---------------------|
| FR-020 | Система должна предоставлять Filesystem skill: read_file, write_file, list_directory, search_files, move_file, delete_file | SPEC 4.2, PROJECT_PROFILE | Must Have (MVP) | Все 6 tools выполняются корректно; ошибки (file not found, permission denied) обрабатываются |
| FR-021 | Система должна предоставлять Shell skill: выполнение shell-команд с настраиваемым timeout (default: 120s) | SPEC 4.2, PROJECT_PROFILE | Must Have (MVP) | Shell-команды выполняются; timeout enforced; stdout/stderr возвращаются |
| FR-022 | Система должна предоставлять Browser skill через Chrome DevTools Protocol (CDP): navigate, click, fill, screenshot | SPEC 4.2 | Should Have (V1) | Базовые операции CDP выполняются в sandboxed Chrome; screenshots сохраняются |
| FR-023 | Система должна предоставлять HTTP skill: HTTP-запросы к external API (GET, POST, PUT, DELETE) | SPEC 4.2 | Should Have (V1) | HTTP-запросы выполняются; response status/body доступны; timeout enforced |
| FR-024 | Система должна поддерживать типы skills: bundled (встроенные), managed (registry), workspace (пользовательские), osaI system | SPEC 4.1 | Must Have (MVP) | Skills загружаются из всех источников; workspace skills hot-reload при изменении SKILL.md |
| FR-025 | Система должна поддерживать include/exclude конфигурацию skills через openclaw.json | SPEC 4.4 | Must Have (MVP) | Disabled skill не загружается; включение/выключение без restart |

### 2.4 Skills: osaI-specific

| FR-ID | Описание | Traceability | Приоритет | Acceptance Criteria |
|-------|----------|--------------|-----------|---------------------|
| FR-026 | Система должна предоставлять OS Integration skill: show_notification, watch_directory, list_processes, open_application, get_system_info | SPEC 4.3.1 | Should Have (V1) | Desktop notification отображается; directory watcher реагирует на изменения; процессы листятся |
| FR-027 | Система должна предоставлять Memory skill: remember, recall, forget, summarize_session | SPEC 4.3.2 | Should Have (V1) | Факт сохраняется в long-term memory; семантический поиск возвращает релевантные записи; forget удаляет |
| FR-028 | Система должна предоставлять Knowledge Base skill: ingest_document, query_knowledge, list_sources, remove_source | SPEC 4.3.3 | Should Have (V1) | Документ разбивается на chunks, встраивается и индексируется; семантический поиск работает |

### 2.5 Memory System

| FR-ID | Описание | Traceability | Приоритет | Acceptance Criteria |
|-------|----------|--------------|-----------|---------------------|
| FR-029 | Система должна реализовать short-term memory -- хранение session messages, tool results, session state в SQLite | SPEC 6.2, ANALYSIS 6.1 | Must Have (MVP) | Сообщения сессии сохраняются; чтение истории из SQLite работает; session resume корректен |
| FR-030 | Система должна реализовать long-term memory -- хранение facts, preferences, knowledge, errors, patterns с embeddings в SQLite (metadata) + Qdrant (vectors) | SPEC 6.3 | Should Have (V1) | Запись сохраняется с embedding; семантический поиск возвращает релевантные записи; metadata доступна через SQLite |
| FR-031 | Система должна реализовать RAG pipeline: query -> embed -> Qdrant search -> inject into prompt | SPEC 6.4, ANALYSIS 10.2 | Should Have (V1) | Перед каждым LLM-вызовом релевантные memories инжектируются в system prompt |
| FR-032 | Система должна реализовать embedding provider с fallback chain: OpenAI (remote, 1536-dim) -> Ollama (local, 768-dim) -> ONNX (offline, 384-dim) | SPEC 6.5, ANALYSIS 8.2 | Should Have (V1) | При недоступности remote провайдера переключается на local; embeddings генерируются |
| FR-033 | Система должна реализовать fact extraction из ответов агента (автоматическое извлечение фактов для long-term memory) | SPEC 6.4, ANALYSIS 10.2 | Should Have (V1) | После каждого agent loop fact extraction выполняется; извлечённые факты сохраняются в long-term memory |
| FR-034 | Система должна поддерживать категории памяти: FACT, PREFERENCE, KNOWLEDGE, ERROR, PATTERN | SPEC 6.3 | Should Have (V1) | Запись создаётся с корректной категорией; фильтрация по категории работает |
| FR-035 | Система должна реализовать knowledge base ingestion: document -> chunking -> embedding -> store в Qdrant + metadata в SQLite | SPEC 6.3, ANALYSIS 10.2 | Should Have (V1) | Документ корректно разбивается на chunks; каждый chunk встраивается; search возвращает source references |
| FR-036 | Система должна поддерживать интеграцию с Qdrant server через REST API (@qdrant/js-client-rest) | ANALYSIS 4.4, F-2 | Should Have (V1) | Qdrant server запускается (Docker/systemd); REST client подключается; CRUD операции работают |
| FR-037 | Система должна определять и обрабатывать разные размерности embeddings при fallback между провайдерами | ANALYSIS OQ-6 | Could Have (V2) | При переключении провайдера embeddings переиндексируются или хранятся в раздельных коллекциях |

### 2.6 Security

| FR-ID | Описание | Traceability | Приоритет | Acceptance Criteria |
|-------|----------|--------------|-----------|---------------------|
| FR-038 | Система должна реализовать Layer 1 (Network): WS server только на localhost (127.0.0.1); remote access через Tailscale с E2E encryption | SPEC 8.1, PROJECT_PROFILE | Must Have (MVP) | WS не доступен извне без Tailscale; Tailscale tunnel работает |
| FR-039 | Система должна реализовать Layer 2 (Sandbox): Docker containers для non-main sessions с настраиваемыми resource limits (CPU, memory, network) | SPEC 5.3, 8.1 | Should Have (V1) | Non-main session выполняется в Docker; resource limits enforced; network isolation работает |
| FR-040 | Система должна реализовать Layer 3 (Permissions): category-based permission system -- read=auto, write=confirm, execute=confirm, system=auto | SPEC 8.1, ANALYSIS 11.3 | Must Have (MVP) | Read operations auto-approve в sandbox; write/exec требуют пользовательского подтверждения; permission_request отправляется клиенту |
| FR-041 | Система должна реализовать Layer 4 (File Sandbox): allowed dirs (~/projects, ~/documents, /tmp/osai); blocked patterns (~/.ssh/**, ~/.gnupg/**, /etc/**, /boot/**, /proc/**, /dev/**, /sys/**); symlink resolution через fs.realpathSync(); path traversal prevention | SPEC 8.1, ANALYSIS 11.2 | Must Have (MVP) | Доступ за пределы allowed dirs заблокирован; symlink traversal предотвращён; path traversal (../../etc/passwd) заблокирован |
| FR-042 | Система должна реализовать Layer 5 (Shell Security): blocked commands list; timeout enforcement (default: 120s); command logging; dangerous pattern detection | SPEC 8.1, 8.2 | Must Have (MVP) | Заблокированные команды не выполняются; timeout срабатывает; все shell-команды логируются |
| FR-043 | Система должна реализовать Layer 6 (Audit): все действия логируются с trace_id, action, user_decision, risk_level, sandbox_checked, timestamp | SPEC 8.1, ANALYSIS 11.4 | Should Have (V1) | Каждое action записывается в audit_log SQLite; лог доступен через API; корреляция с OTel trace_id |
| FR-044 | Система должна выполнять validation на уровне tool implementation (не только по category declaration в SKILL.md) для предотвращения masquerading write operations как read | ANALYSIS 11.3 | Must Have (MVP) | Tool implementation проверяет реальный тип операции; попытка обхода через category mismatch блокируется |

### 2.7 Observability

| FR-ID | Описание | Traceability | Приоритет | Acceptance Criteria |
|-------|----------|--------------|-----------|---------------------|
| FR-045 | Система должна интегрировать OpenTelemetry SDK: traces (agent loop, model inference, tool calls, memory queries), metrics, structured logs (pino) | SPEC 7.1, PROJECT_PROFILE | Should Have (V1) | OTel SDK инициализируется; traces создаются для key spans; pino логи содержат correlation IDs |
| FR-046 | Система должна собирать метрики: session duration, tool call duration/total/errors, LLM tokens input/output/cost, memory query duration, sandbox violations, active sessions | SPEC 7.2 | Should Have (V1) | Каждая метрика корректно инкрементируется/записывается; Prometheus exporter доступен |
| FR-047 | Система должна предоставлять exporters: Console (dev), File (~/.osai/logs/telemetry.jsonl), Prometheus metrics endpoint, опционально Jaeger/Zipkin | SPEC 7.1 | Should Have (V1) | Каждый exporter работает; переключение через конфигурацию |
| FR-048 | Система должна предоставлять REST API для query traces, metrics (Prometheus-compatible), audit log | SPEC 11.2 | Should Have (V1) | GET /api/v1/observability/traces возвращает traces по фильтрам; metrics endpoint совместим с Prometheus format |
| FR-049 | Система должна вести structured logging через pino с уровнями: error, warn, info, debug, trace | SPEC 7.1, PROJECT_PROFILE | Must Have (MVP) | Логи в structured JSON format; уровень настраивается; correlation ID связывает логи с traces |

### 2.8 OS Integration

| FR-ID | Описание | Traceability | Приоритет | Acceptance Criteria |
|-------|----------|--------------|-----------|---------------------|
| FR-050 | Система должна предоставлять system tray с меню: Open Chat, Sessions, Memory, Skills, Status, Quit | SPEC 9.4 | Should Have (V1) | Tray icon отображается; menu items кликабельны; статус отображается (active/inactive) |
| FR-051 | Система должна отправлять desktop notifications через node-notifier с уровнями urgency: low, normal, critical | SPEC 9.1, 4.3.1 | Should Have (V1) | Notification отображается на desktop; urgency уровень respected; click на notification открывает osaI |
| FR-052 | Система должна реализовать file system watcher для мониторинга изменений в директориях | SPEC 4.3.1 | Should Have (V1) | Watcher стартует; события create/modify/delete детектируются; watcher_id управляется |
| FR-053 | Система должна предоставлять process management: list_processes, get_system_info (CPU, memory, disk) | SPEC 4.3.1 | Should Have (V1) | Список процессов возвращается; system info корректна |
| FR-054 | Система должна интегрироваться с systemd (Linux) и launchd (macOS) для autostart | SPEC 12.3 | Should Have (V1) | `systemctl --user enable osai` запускает gateway; autostart после login работает |
| FR-055 | Система должна предоставлять fallback на CLI-only режим если desktop integration недоступна (Wayland, headless) | ANALYSIS 9.6 | Should Have (V1) | Система работает без tray/notifications; функциональность доступна через CLI |

### 2.9 CLI Client

| FR-ID | Описание | Traceability | Приоритет | Acceptance Criteria |
|-------|----------|--------------|-----------|---------------------|
| FR-056 | Система должна предоставлять CLI на основе oclif с командами: chat (interactive), session (list/resume), config, skills, memory, channel, status | SPEC 9.2, PROJECT_PROFILE | Must Have (MVP) | Все команды выполняются; автодополнение работает; help текст корректен |
| FR-057 | CLI должен предоставлять интерактивный чат с TUI на основе ink | SPEC 9.2 | Must Have (MVP) | Интерактивная сессия запускается; сообщения отправляются/принимаются; tool_stream отображается |
| FR-058 | CLI должен отображать permission prompts для write/exec operations | SPEC 9.2 | Must Have (MVP) | При write/exec операции CLI показывает детали и ожидает y/N |
| FR-059 | CLI должен поддерживать режим quick command: `osai "command text"` | SPEC 9.2 | Must Have (MVP) | Команда выполняется, результат выводится в stdout, CLI завершается |
| FR-060 | CLI должен показывать session info: session id, model, status, token usage | SPEC 9.2 | Should Have (V1) | Status bar показывает актуальную информацию |

### 2.10 Web Dashboard

| FR-ID | Описание | Traceability | Приоритет | Acceptance Criteria |
|-------|----------|--------------|-----------|---------------------|
| FR-061 | Система должна предоставлять Web Dashboard на SvelteKit + TailwindCSS с областями: chat area, channel sidebar, agent trace view, permission prompts, memory search, system status | SPEC 9.3, PROJECT_PROFILE | Should Have (V1) | Dashboard рендерится; чат работает; trace view показывает agent loop steps |
| FR-062 | Dashboard должен подключаться к Gateway через WebSocket для real-time обновлений | SPEC 9.3 | Should Have (V1) | WS connection устанавливается; tool_stream и block сообщения отображаются в real-time |
| FR-063 | Dashboard должен отображать agent trace: tool calls, durations, token usage, cost | SPEC 9.3 | Should Have (V1) | Trace panel показывает chronological list of agent actions с timing и metrics |

### 2.11 Configuration & Deployment

| FR-ID | Описание | Traceability | Приоритет | Acceptance Criteria |
|-------|----------|--------------|-----------|---------------------|
| FR-064 | Система должна читать конфигурацию из ~/.osai/openclaw.json (gateway, model, session, skills, security, memory, observability) | SPEC 12.1, 12.2 | Must Have (MVP) | Конфиг парсится; изменения в конфиге применяются (hot reload или restart); отсутствующие поля используют defaults |
| FR-065 | Система должна инициализироваться через `osai init` -- создание ~/.osai/ directory structure, default config, workspace | SPEC 12.2 | Must Have (MVP) | `osai init` создаёт полную структуру директорий; default openclaw.json генерируется |
| FR-066 | Система должна поддерживать установку через `npm install -g @osai/cli` | SPEC 12.2 | Must Have (MVP) | После установки `osai` команда доступна в PATH |
| FR-067 | Система должна поддерживать запуск как systemd --user service (Linux) и launchd (macOS) | SPEC 12.3 | Should Have (V1) | Сервис автостартует; логи доступны через journalctl/Console |
| FR-068 | Система должна предоставлять REST API для osaI extensions: memory, knowledge base, observability, os integration, skills | SPEC 11.2, PROJECT_PROFILE | Should Have (V1) | Все endpoint'ы из спецификации работают; request/response format соответствует API spec |
| FR-069 | Система должна предоставлять workspace с AGENTS.md (agent persona), SOUL.md (agent values), TOOLS.md (tool definitions), skills/ (user skills) | SPEC 15 | Should Have (V1) | Workspace файлы читаются и используются в context assembly; пользовательские skills загружаются |

### 2.12 Error Handling

| FR-ID | Описание | Traceability | Приоритет | Acceptance Criteria |
|-------|----------|--------------|-----------|---------------------|
| FR-070 | Система должна классифицировать ошибки по severity: LOW (retry silently), MEDIUM (notify, retry), HIGH (halt task, ask user), CRITICAL (abort session) | SPEC 5.4 | Must Have (MVP) | Ошибка каждого severity обрабатывается по соответствующей стратегии |
| FR-071 | Система должна реализовать retry с exponential backoff для transient errors | SPEC 5.4 | Must Have (MVP) | Retry до maxAttempts с увеличивающейся задержкой; логирование каждой попытки |
| FR-072 | Система должен корректно обрабатывать LLM API errors: 429 rate limit (wait+retry), 500 error (fallback to next provider), timeout (fallback) | SPEC 3.4 | Must Have (MVP) | Каждая ошибка обрабатывается по стратегии; пользователь информируется при fallback |

---

## 3. Non-Functional Requirements

### 3.1 Performance

| NFR-ID | Описание | Measurement / Verification | Priority |
|--------|----------|---------------------------|----------|
| NFR-001 | RAG query latency (Qdrant search) не должна превышать 200ms для top_k=5 | Benchmark: 100 queries, p95 latency < 200ms | Should Have (V1) |
| NFR-002 | Agent loop overhead (без LLM inference) не должен превышать 50ms | Benchmark: time from intake to model call start < 50ms | Must Have (MVP) |
| NFR-003 | CPU-bound задачи (embeddings, chunking) должны выполняться в worker threads, не блокируя event loop | Verification: main thread event loop lag < 10ms при одновременной embedding генерации | Should Have (V1) |
| NFR-004 | OpenTelemetry overhead не должен превышать 5% CPU/memory | Benchmark: CPU/memory usage с OTel включённым vs выключенным, delta < 5% | Should Have (V1) |
| NFR-005 | cold start embedding модели (all-MiniLM-L6-v2) не должен превышать 5 секунд | Benchmark: время от первого запроса до готовности модели < 5s | Should Have (V1) |
| NFR-006 | Gateway WS message processing latency не должен превышать 10ms | Benchmark: time from WS receive to queue dispatch < 10ms | Must Have (MVP) |

### 3.2 Reliability & Availability

| NFR-ID | Описание | Measurement / Verification | Priority |
|--------|----------|---------------------------|----------|
| NFR-007 | Model failover chain должен обеспечивать доступность LLM: при недоступности primary, fallback активируется менее чем за 5 секунд | Test: primary returns 500, verify fallback response within 5s | Must Have (MVP) |
| NFR-008 | Система должна корректно восстанавливаться после crash: session state восстанавливается из SQLite persistence | Test: kill process, restart, verify session resume with full history | Must Have (MVP) |
| NFR-009 | Circuit breaker должен временно исключать неработающий provider (default: 30s cooldown) | Test: provider returns 500x3, verify exclusion; after cooldown, verify recovery | Should Have (V1) |
| NFR-010 | SQLite WAL mode для concurrent read/write без блокировок | Verification: SQLite configured with WAL; concurrent read during write does not block | Must Have (MVP) |
| NFR-011 | Graceful shutdown: все pending operations завершаются, OTel data flushed, DB connections закрыты | Test: SIGTERM -> verify pending operations completed, data persisted | Must Have (MVP) |

### 3.3 Security & Privacy

| NFR-ID | Описание | Measurement / Verification | Priority |
|--------|----------|---------------------------|----------|
| NFR-012 | Система не должна отправлять пользовательские данные третьим сторонам (кроме LLM API провайдерам по запросу) | Code review: проверка всех outbound connections; audit log verification | Must Have (MVP) |
| NFR-013 | API ключи LLM провайдеров должны храниться в openclaw.json с file permissions 0600 | Verification: `ls -la ~/.osai/openclaw.json` permissions = 0600 | Must Have (MVP) |
| NFR-014 | Shell commands из blocked list не должны выполняться при любых обстоятельствах (включая alias, escaped variants) | Test: attempt blocked commands via various encodings/aliases; all blocked | Must Have (MVP) |
| NFR-015 | Symlink resolution должна применяться к каждому path перед проверкой sandbox | Test: create symlink outside sandbox pointing inside, verify access denied | Must Have (MVP) |
| NFR-016 | Docker containers для non-main sessions не должны иметь network access по умолчанию | Test: from within container, verify no outbound network connectivity | Should Have (V1) |
| NFR-017 | Audit log должен быть immutable: записи не могут быть изменены или удалены через API | Test: DELETE /api/v1/observability/audit/:id returns 403 | Should Have (V1) |

### 3.4 Scalability

| NFR-ID | Описание | Measurement / Verification | Priority |
|--------|----------|---------------------------|----------|
| NFR-018 | Система должна поддерживать до 10 одновременных сессий | Load test: 10 concurrent sessions with messages, verify no degradation | Should Have (V1) |
| NFR-019 | Long-term memory должна масштабироваться до 100,000 записей без деградации поиска | Benchmark: insert 100k entries, verify p95 search latency < 500ms | Could Have (V2) |
| NFR-020 | Knowledge base должна поддерживать ingest до 10,000 документов | Benchmark: ingest 10k docs, verify no OOM, search works | Could Have (V2) |

### 3.5 Usability

| NFR-ID | Описание | Measurement / Verification | Priority |
|--------|----------|---------------------------|----------|
| NFR-021 | `osai init` должен настраивать систему за один шаг, без дополнительных ручных действий | Test: fresh system, `osai init` -> `osai` -> chat works | Must Have (MVP) |
| NFR-022 | Permission prompts должны содержать достаточно информации для принятия решения: tool name, action, params, risk level | Verification: prompt includes all required fields per SPEC 11.1 | Must Have (MVP) |
| NFR-023 | Error messages должны быть понятными пользователю и содержать предлагаемое действие | Code review: all user-facing error messages include actionable suggestion | Must Have (MVP) |
| NFR-024 | CLI help text должен быть полным для всех команд | Verification: `osai <command> --help` для каждой команды содержит описание, usage, examples | Must Have (MVP) |

### 3.6 Maintainability

| NFR-ID | Описание | Measurement / Verification | Priority |
|--------|----------|---------------------------|----------|
| NFR-025 | TypeScript strict mode: no `any`, no `// @ts-ignore`, 100% strict compliance | CI: `tsc --strict` passes with no errors | Must Have (MVP) |
| NFR-026 | ESLint + Biome: 0 errors, 0 warnings | CI: lint check passes | Must Have (MVP) |
| NFR-027 | Unit test coverage >= 70% для backend пакетов | CI: vitest --coverage, threshold check | Should Have (V1) |
| NFR-028 | Integration test coverage >= 50% для межпакетного взаимодействия | CI: integration test suite passes | Should Have (V1) |
| NFR-029 | Monorepo dependency graph должен быть acyclic | CI: `madge --circular` passes | Must Have (MVP) |
| NFR-030 | Каждая skill должна иметь corresponding SKILL.md с полным описанием tools | Verification: grep skill registry vs SKILL.md files | Must Have (MVP) |

### 3.7 Observability

| NFR-ID | Описание | Measurement / Verification | Priority |
|--------|----------|---------------------------|----------|
| NFR-031 | Все agent loop iterations должны создавать OTel span с именами: agent.loop, agent.inference, agent.tool_call, memory.rag_query, memory.extract | Verification: при выполнении agent loop trace содержит все expected spans | Should Have (V1) |
| NFR-032 | Structured logs должны содержать correlation ID (trace_id) для связи с OTel spans | Verification: pino log entry содержит `trace_id` field | Should Have (V1) |
| NFR-033 | Audit log должен покрывать: все tool_call, все permission_request/response, все file_access, все shell command execution | Test: execute representative scenario, verify audit log contains entries for each action | Should Have (V1) |
| NFR-034 | Sampling rate настраивается: 100% в dev, configurable в prod (default: 10%) | Verification: config `observability.samplingRate` controls trace sampling | Should Have (V1) |

### 3.8 Compatibility

| NFR-ID | Описание | Measurement / Verification | Priority |
|--------|----------|---------------------------|----------|
| NFR-035 | Система работает на Linux (desktop, systemd) -- primary target | Test: install + run on Ubuntu 22.04+ | Must Have (MVP) |
| NFR-036 | Система работает на macOS (desktop, launchd) -- secondary target | Test: install + run on macOS 14+ | Should Have (V1) |
| NFR-037 | Система не зависит от облачных сервисов для core functionality (local-first) | Test: run fully offline with Ollama, verify all core features work | Must Have (MVP) |

---

## 4. External Interfaces

### 4.1 LLM Providers

| Interface | Protocol | Direction | Notes |
|-----------|----------|-----------|-------|
| Anthropic Claude API | HTTPS REST | Outbound | Primary LLM provider; streaming responses |
| OpenAI GPT API | HTTPS REST | Outbound | Fallback LLM provider; fallback embeddings |
| Ollama API | HTTP REST (localhost:11434) | Outbound | Local LLM fallback; local embeddings |

### 4.2 Vector Database

| Interface | Protocol | Direction | Notes |
|-----------|----------|-----------|-------|
| Qdrant Server | HTTP REST (localhost:6333) | Outbound | REST client @qdrant/js-client-rest; Docker or systemd deployment |

### 4.3 Messaging Platforms

| Interface | Protocol | Direction | Notes |
|-----------|----------|-----------|-------|
| Telegram Bot API | HTTPS REST + webhook/polling | Bidirectional | grammY framework |
| WhatsApp | Baileys (WebSocket to WhatsApp servers) | Bidirectional | Unofficial API, QR-code auth |
| Slack | Bolt SDK (WebSocket + Events API) | Bidirectional | Slack App required |
| Discord | discord.js (WebSocket Gateway) | Bidirectional | Discord Bot required |

### 4.4 Desktop OS

| Interface | Protocol | Direction | Notes |
|-----------|----------|-----------|-------|
| System Tray | Native (libappindicator/ayatana-appindicator on Linux, NSStatusBar on macOS) | Outbound | systray2 |
| Desktop Notifications | notify-send (Linux), terminal-notifier (macOS) | Outbound | node-notifier |
| File System | Native FS | Inbound/Outbound | fs, fs-extra |
| Process Management | /proc, systeminformation | Inbound | systeminformation |

### 4.5 User-Facing Interfaces

| Interface | Protocol | Direction | Notes |
|-----------|----------|-----------|-------|
| CLI | Terminal (stdin/stdout) | Bidirectional | oclif + ink |
| Web Dashboard | HTTP + WebSocket | Bidirectional | SvelteKit (localhost) |
| Remote Access | Tailscale tunnel | Bidirectional | E2E encryption |

### 4.6 Browser (Tool)

| Interface | Protocol | Direction | Notes |
|-----------|----------|-----------|-------|
| Chrome/Chromium | Chrome DevTools Protocol (WebSocket) | Outbound | puppeteer-core or direct CDP |

---

## 5. Data Considerations

### 5.1 Типы данных

| Data Type | Storage | Sensitivity | Retention |
|-----------|---------|-------------|-----------|
| Session messages | SQLite (osai.db) | Medium | Until session pruning or manual delete |
| Session state | SQLite (osai.db) | Medium | Until session delete |
| Long-term memory (metadata) | SQLite (osai.db) | High (user facts, preferences) | Permanent (until explicit forget) |
| Long-term memory (embeddings) | Qdrant (vectors) | High | Permanent (until explicit forget or re-index) |
| Knowledge base (metadata) | SQLite (osai.db) | Medium | Until source removal |
| Knowledge base (chunks+embeddings) | Qdrant | Medium | Until source removal |
| Audit log | SQLite (osai.db) | High (action history) | Permanent, immutable |
| Configuration | openclaw.json | High (API keys) | Until user modifies |
| LLM API keys | openclaw.json | Critical | Encrypted or 0600 permissions |
| Workspace files (AGENTS.md, SOUL.md) | File system | Low | Until user modifies |
| Logs (pino) | File system (~/.osai/logs/) | Low | Rotated, 7-day retention |
| Telemetry | File (~/.osai/logs/telemetry.jsonl) | Low | Rotated, 30-day retention |

### 5.2 Compliance Notes

- Все данные хранятся локально на машине пользователя (local-first)
- Нет передачи персональных данных третьим сторонам (кроме LLM API при запросе)
- Audit log обеспечивает ретроспективную прослеживаемость всех действий агента
- API ключи хранятся с ограниченными file permissions (0600)

### 5.3 Data Lifecycle

1. **Ingestion:** User message -> session memory (SQLite) -> agent processing
2. **Processing:** Agent response -> fact extraction -> long-term memory (SQLite + Qdrant)
3. **Query:** User message -> embedding -> Qdrant search -> inject into prompt
4. **Retention:** Session messages pruned on context overflow; long-term memory permanent; audit log immutable; logs rotated
5. **Deletion:** `forget` removes specific memory entry; source removal deletes KB chunks; no automatic data deletion

---

## 6. Assumptions

| # | Assumption | Confidence | Impact if Incorrect | Source |
|---|-----------|------------|---------------------|--------|
| AS-1 | osaI реализуется с нуля по паттернам из спецификации (OpenClaw недоступен) | **CONFIRMED** | Больше объём разработки, но устранена блокирующая зависимость | ANALYSIS 1.3, User prompt |
| AS-2 | Node.js 20+ LTS производительность достаточна для local-first AI OS | HIGH | Worker threads для CPU-bound; в целом достаточно | ANALYSIS A-4, PROJECT_PROFILE |
| AS-3 | Docker доступен на целевых машинах (Linux, macOS) | HIGH | Sandbox ограничится file-level без Docker isolation для non-main sessions | ANALYSIS A-5 |
| AS-4 | Qdrant server может быть запущен как Docker container или systemd service | HIGH | Требуется in-process vector DB альтернатива (hnswlib-node, LanceDB) | ANALYSIS A-6, F-2 |
| AS-5 | @huggingface/transformers v3 (бывший @xenova/transformers) используется для local embeddings | **CONFIRMED** | Используется устаревший пакет; миграция straightforward | ANALYSIS F-1 |
| AS-6 | Ollama предоставляет достаточное качество для offline fallback | MEDIUM | Ограниченная функциональность при offline режиме; пользователю будет предложено | ANALYSIS A-7 |
| AS-7 | LLM API стоимость приемлема для personal use | MEDIUM | Budget limits в конфигурации; Ollama fallback; cost metrics | ANALYSIS A-8 |
| AS-8 | Solo developer может поддерживать monorepo из 8+ пакетов | MEDIUM | Риск технического долга; чёткий CI/CD и модульная архитектура mitigate | ANALYSIS 6.3 |
| AS-9 | better-sqlite3 синхронный API не создаёт проблем для local workload | HIGH | WAL mode; для тяжёлых запросов -- worker threads | ANALYSIS 6.1 |
| AS-10 | oclif + ink совместимы в одном CLI приложении | MEDIUM | Аккуратная интеграция; ink rendering внутри oclif command | ANALYSIS A-16 |
| AS-11 | Desktop tray (systray2) работает на X11; на Wayland -- fallback на CLI-only | MEDIUM | Linux desktop fragmentation; explicit fallback requirement | ANALYSIS 9.6 |
| AS-12 | Session model поддерживает metadata extension для osaI (memoryQueryCount, totalTokensUsed) | MEDIUM | Отдельная таблица для osaI session metadata | ANALYSIS A-13 |
| AS-13 | RAG pipeline latency (< 200ms для Qdrant query) приемлема в agent loop | MEDIUM | Если нет -- async pre-fetch на основе user typing | ANALYSIS A-14 |
| AS-14 | pino достаточно для structured logging | HIGH | Могут потребоваться дополнительные appenders для file rotation | ANALYSIS A-9 |
| AS-15 | vitest подходит для unit/integration/e2e тестирования | HIGH | Могут потребоваться дополнительные инструменты для e2e (Playwright для dashboard) | ANALYSIS A-10 |

---

## 7. Open Questions

| # | Question | Why Important | Status |
|---|----------|--------------|--------|
| OQ-1 | Какая стратегия запуска Qdrant для local-first deployment: Docker container, systemd service, или in-process alternative? | Влияет на user experience установки и infrastructure requirements | Open (рекомендация: Docker container с auto-start через osai) |
| OQ-2 | Как обрабатывать разные размерности embeddings при fallback между провайдерами (1536/768/384)? | Breaks similarity search при переключении провайдера | Open (рекомендация: раздельные коллекции по провайдеру) |
| OQ-3 | Какой размер chunk'ов оптимален для RAG pipeline? | Влияет на качество поиска и latency | Open (рекомендация: 512 tokens, overlap 50 tokens) |
| OQ-4 | Требуется ли графический installer или достаточно npm/binary? | Влияет на onboarding пользователей | Open (рекомендация: npm + standalone binary для V1) |
| OQ-5 | Какой максимальный размер monitored directories для file watcher? | chokidar has known issues на больших директориях | Open (рекомендация: configurable limit, warning при > 100k files) |
| OQ-6 | Нужен ли REPL-режим в CLI или только интерактивный чат? | Влияет на CLI UX | Open (рекомендация: интерактивный чат для V1, REPL для V2) |
| OQ-7 | Как синхронизировать память между устройствами (Tailscale multi-device)? | V1 -- single device; V2 требует архитектурного решения | Deferred to V2 planning |

---

## 8. Traceability Matrix

### Requirements -> Domains

| Domain | FR-IDs | NFR-IDs | Priority |
|--------|--------|---------|----------|
| Gateway | FR-001 -- FR-010 | NFR-006 | MVP + V1 |
| Agent | FR-011 -- FR-019 | NFR-002, NFR-007 | MVP + V1 |
| Skills Core | FR-020 -- FR-025 | NFR-030 | MVP + V1 |
| Skills osaI | FR-026 -- FR-028 | -- | V1 |
| Memory | FR-029 -- FR-037 | NFR-001, NFR-003, NFR-005, NFR-019 | MVP + V1 + V2 |
| Security | FR-038 -- FR-044 | NFR-012 -- NFR-017 | MVP + V1 |
| Observability | FR-045 -- FR-049 | NFR-004, NFR-031 -- NFR-034 | MVP + V1 |
| OS Integration | FR-050 -- FR-055 | NFR-011, NFR-035, NFR-036 | V1 |
| CLI | FR-056 -- FR-060 | NFR-021 -- NFR-024 | MVP + V1 |
| Dashboard | FR-061 -- FR-063 | -- | V1 |
| Config & Deploy | FR-064 -- FR-069 | NFR-037 | MVP + V1 |
| Error Handling | FR-070 -- FR-072 | NFR-008, NFR-011 | MVP |

### Requirements -> ANALYSIS.md Sections

| ANALYSIS Section | Derived FR-IDs |
|-----------------|----------------|
| 1. Problem Statement | FR-011, FR-029, FR-030, FR-045, FR-050, FR-056 |
| 3. Goals and Success Indicators | FR-031, FR-035, FR-038, FR-061 |
| 4. Constraints | FR-041, FR-044, NFR-037 |
| 6. Risks | FR-015, FR-018, FR-039, FR-040, FR-042, FR-043 |
| 10. Integration Points | FR-012, FR-013, FR-031, FR-033 |
| 11. Security Model | FR-038, FR-039, FR-040, FR-041, FR-042, FR-043, FR-044 |

---

*End of Technical Requirements Document v1.0*
