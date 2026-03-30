# Project Scope

**Версия документа:** v1.0
**Дата:** 2026-03-30
**Проект:** osaI v3 -- AI Operating System
**Спецификация:** docs/specs/spec_osai_v3_2026-03-28.md
**Профиль:** docs/project/PROJECT_PROFILE.md
**Анализ:** docs/project/ANALYSIS.md
**Требования:** docs/project/TECH_REQUIREMENTS.md

---

## In Scope

### MVP -- Must Have (P0)

#### Core Infrastructure

| ID | Компонент | Описание | FR |
|---|---|---|---|
| S-001 | Gateway (WS Control Plane) | WebSocket server на localhost:18789, channel routing, session management | FR-001 |
| S-002 | Agent Loop | Полный цикл: intake -> context_assembly -> model_inference -> tool_execution -> streaming -> persistence | FR-002 |
| S-003 | Hook System | 7 OpenClaw hooks + 6 osaI hooks для расширения | FR-002 |
| S-004 | Configuration | openclaw.json (или osai.json) для всех настроек, `osai init` | FR-025 |
| S-005 | Structured Logging | pino JSON logging с уровнями и correlation IDs | FR-024 |

#### LLM Providers

| ID | Компонент | Описание | FR |
|---|---|---|---|
| S-006 | Z.ai Provider | OpenAI-совместимый adapter с configurable base URL (primary) | FR-028 |
| S-007 | Yandex Provider | Yandex Foundation Models: LLM + Embeddings (fallback 1) | FR-007 |
| S-008 | Anthropic Provider | Claude API adapter (fallback 2) | FR-007 |
| S-009 | OpenAI Provider | OpenAI GPT adapter (fallback 3) | FR-007 |
| S-010 | Ollama Provider | Local LLM + embeddings adapter (local fallback) | FR-007 |
| S-011 | Failover Chain | Auto-failover: Z.ai -> Yandex -> Anthropic -> OpenAI -> Ollama | FR-007 |
| S-012 | Circuit Breaker | Isolation недоступных провайдеров (failure_threshold=5, reset_timeout=30s) | FR-007 |

#### Multi-Chat System

| ID | Компонент | Описание | FR |
|---|---|---|---|
| S-013 | Chat CRUD | Создание, чтение, обновление, удаление чатов (до 20 активных) | FR-003 |
| S-014 | Chat Persistence | SQLite-схема для чатов и сообщений | FR-004 |
| S-015 | Chat Context Isolation | Изолированный локальный контекст для каждого чата | FR-003 |
| S-016 | Chat Switching | Переключение между чатами с сохранением/загрузкой контекста | FR-003 |
| S-017 | Chat Archiving | Архивирование неактивных чатов (освобождение лимита) | FR-003 |

#### Memory System

| ID | Компонент | Описание | FR |
|---|---|---|---|
| S-018 | Three-Tier Memory | Chat Memory, Session Memory, Long-term Memory | FR-008 |
| S-019 | Embeddings | Ollama nomic-embed-text (768-dim) default + Yandex fallback + ONNX fallback | FR-009 |
| S-020 | Vector Storage (sqlite-vec) | Embedded vector search через sqlite-vec (primary) | FR-010 |
| S-021 | Qdrant (optional) | External Qdrant server через REST client (optional enhanced mode) | FR-010 |
| S-022 | RAG Pipeline | Query -> embed -> vector search -> inject context into prompt | FR-011 |
| S-023 | Context Window Manager | Auto-pruning + summarization | FR-013 |
| S-024 | Fact Extraction | Автоматическое извлечение фактов из ответов в long-term memory | FR-011 |

#### Knowledge Base

| ID | Компонент | Описание | FR |
|---|---|---|---|
| S-025 | Document Ingestion | Документ -> chunking -> embedding -> vector storage | FR-012 |
| S-026 | Semantic Search | Векторный поиск с source attribution | FR-012 |
| S-027 | Source Management | Add, remove, list источников по тегам | FR-012 |

#### Skills System

| ID | Компонент | Описание | FR |
|---|---|---|---|
| S-028 | Skills Registry | Реестр bundled, managed, workspace, osaI skills | FR-005, FR-006 |
| S-029 | SKILL.md Format | Декларативный формат описания skills | FR-005 |
| S-030 | Filesystem Skill | read_file, write_file, list_dir, search_files, move_file, delete_file, get_file_info | FR-005 |
| S-031 | Shell Skill | exec, exec_sandbox с blocked commands и timeout | FR-005 |
| S-032 | Memory Skill | remember, recall, forget, summarize_session | FR-006 |
| S-033 | Knowledge Base Skill | ingest_document, query_knowledge, list_sources, remove_source | FR-006 |
| S-034 | Chat Management Skill | chat_list, chat_create, chat_switch, chat_archive, chat_delete | FR-006 |
| S-035 | OS Integration Skill | show_notification, watch_directory, list_processes, open_application, get_system_info | FR-006 |

#### Telegram Integration

| ID | Компонент | Описание | FR |
|---|---|---|---|
| S-036 | Telegram Bot (grammY) | Команды, чат, notifications, allowedUsers whitelist | FR-014 |
| S-037 | Telegram Userbot (Telethon) | Python microservice через child_process, чтение/отправка сообщений, ожидание ответов | FR-015 |
| S-038 | Telegram Mirror Engine | Двусторонняя синхронизация osaI-чат <-> Telegram-чат/канал | FR-016 |

#### OS Integration (MVP subset)

| ID | Компонент | Описание | FR |
|---|---|---|---|
| S-039 | Desktop Notifications | Кроссплатформенные (Linux + Windows) | FR-020 |
| S-040 | System Info | CPU, memory, disk информация (Linux + Windows) | FR-020 |
| S-041 | Process List | Список запущенных процессов с фильтрацией | FR-020 |

#### Security

| ID | Компонент | Описание | FR |
|---|---|---|---|
| S-042 | 7-Layer Security | Network, Sandbox, Permissions, File Sandbox, Shell Security, Telegram Security, Audit | FR-022 |
| S-043 | File Sandbox | allowed_dirs + blocked_patterns + symlink resolution | FR-022 |
| S-044 | Shell Security | Blocked commands + timeout + logging | FR-022 |
| S-045 | Permission Prompts | Category-based: read=auto, write=confirm, exec=confirm | FR-022 |
| S-046 | Audit Logging | Все действия с trace_id в SQLite | FR-023 |

#### CLI Client

| ID | Компонент | Описание | FR |
|---|---|---|---|
| S-047 | Interactive CLI | `osai` -- интерактивный чат в текущем чате | FR-019 |
| S-048 | Quick Command | `osai "команда"` -- быстрое выполнение | FR-019 |
| S-049 | Chat Commands | chat list, create, switch, delete | FR-019 |
| S-050 | Management Commands | session, config, skills, memory, channel, status | FR-019 |
| S-051 | TUI Layout | Список чатов, область чата, статус-бар | FR-019 |

#### Testing

| ID | Компонент | Описание | FR |
|---|---|---|---|
| S-052 | Unit Tests | Unit тесты для всех packages (vitest) | NFR-M02 |
| S-053 | Integration Tests | Cross-module integration тесты | NFR-M02 |
| S-054 | E2E Tests | E2E тесты критичных сценариев | NFR-M02 |
| S-055 | Cross-Platform CI | GitHub Actions: Linux + Windows | NFR-M02 |

#### Cross-Platform

| ID | Компонент | Описание | FR |
|---|---|---|---|
| S-056 | Linux Support | Все MVP функции работают на Linux | FR-029 |
| S-057 | Windows Support | Все MVP функции работают на Windows 10/11 (native) | FR-029 |

---

### V1 -- Should Have (P1)

| ID | Компонент | Описание | Milestone |
|---|---|---|---|
| S-101 | Voice Stack (STT) | whisper.cpp + Yandex SpeechKit fallback | DOMAIN-007 |
| S-102 | Voice Stack (TTS) | Piper TTS + Yandex SpeechKit fallback | DOMAIN-007 |
| S-103 | System Tray | Linux (libappindicator) + Windows (native) | DOMAIN-009 |
| S-104 | File Watchers | Мониторинг директорий через chokidar | DOMAIN-009 |
| S-105 | Process Management | Детальное управление процессами | DOMAIN-009 |
| S-106 | Windows Service | Демон через node-windows | DOMAIN-009 |
| S-107 | OpenTelemetry Traces | Traces для agent loop, model calls, tools | DOMAIN-010 |
| S-108 | OpenTelemetry Metrics | Счётчики, гистограммы, gauge | DOMAIN-010 |
| S-109 | Prometheus Endpoint | Prometheus-compatible metrics endpoint | DOMAIN-010 |
| S-110 | Browser Skill | CDP-based browser automation | DOMAIN-003 |
| S-111 | HTTP/API Skill | HTTP запросы к внешним API | DOMAIN-003 |
| S-112 | Background Tasks | Stop, resume, monitor задач | DOMAIN-002 |
| S-113 | Web Dashboard | SvelteKit web interface | DOMAIN-012 |
| S-114 | WhatsApp Channel | Baileys integration | DOMAIN-001 |
| S-115 | Discord Channel | discord.js integration | DOMAIN-001 |
| S-116 | Slack Channel | Slack integration | DOMAIN-001 |
| S-117 | Device Pairing | Tailscale remote access | DOMAIN-009 |
| S-118 | Native Dialogs | Файловые и confirm диалоги | DOMAIN-009 |
| S-119 | OS Integration Skill (full) | Все инструменты OS Integration в skill-формате | DOMAIN-009 |
| S-120 | Daemon (systemd) | systemd --user service для Linux | DOMAIN-009 |

---

### V2 -- Could Have (P2-P3)

| ID | Компонент | Описание | Приоритет |
|---|---|---|---|
| S-201 | Multi-Agent Architecture | Несколько агентов с распределением задач | P2 |
| S-202 | Canvas / A2UI | Agent-driven визуальное рабочее пространство | P2 |
| S-203 | Plugin Marketplace | ClawHub + osaI marketplace для skills | P2 |
| S-204 | Advanced RAG | Re-ranking, hybrid search | P2 |
| S-205 | Smart Scheduling | Cron-like планирование задач | P2 |
| S-206 | Team Collaboration | Shared KB + memory sync | P2 |
| S-207 | All 20+ Channels | Все OpenClaw каналы | P2 |
| S-208 | MCP Integration | Model Context Protocol | P2 |
| S-209 | Voice Wake Word | Активация по голосу ("osai") | P2 |
| S-210 | Desktop App | Electron/Tauri wrapper | P3 |

---

## Out of Scope

### Explicitly Excluded (Won't Have)

| ID | Исключение | Обоснование |
|---|---|---|
| X-001 | Cloud-hosted backend | Нарушает принцип local-first. Все данные на машине пользователя |
| X-002 | Mobile native app | Мессенджеры (Telegram, WhatsApp) обеспечивают мобильный доступ |
| X-003 | Subscription / billing system | Open-source (MIT License), нет коммерческой модели |
| X-004 | User accounts / authentication | Local-first, один пользователь на установку |
| X-005 | Rust backend | Избыточно. TypeScript/Node.js обеспечивает достаточную производительность |
| X-006 | WSL-only Windows support | Требуется нативная Windows поддержка, не только через WSL |
| X-007 | macOS support | Не является целевой платформой для osaI v3 |
| X-008 | Multi-user / multi-tenant | Одно installation = один пользователь |
| X-009 | Bot-only Telegram mode без userbot | Userbot -- часть ядра v3. Если userbot недоступен -- используется fallback mode |
| X-010 | OpenClaw-specific inherited features (до верификации) | Все ссылки на OpenClaw architecture не верифицированы. Реальный scope зависит от существования upstream |
| X-011 | Voice через Ollama API | Ollama НЕ поддерживает STT/TTS. Voice реализуется через whisper.cpp + Piper TTS |
| X-012 | Qdrant embedded mode | Qdrant НЕ имеет embedded mode для Node.js. Primary -- sqlite-vec |

---

## Constraints

### Business Constraints

| # | Ограничение | Влияние |
|---|---|---|
| BC-01 | Solo developer | Ограниченная пропускная способность. Требует строгой приоритизации MVP |
| BC-02 | Open-source (MIT License) | Нет бюджета на платные инструменты и сервисы. Все затраты API -- на пользователе |
| BC-03 | No commercial budget | Нет возможности нанять дополнительных разработчиков или купить enterprise решения |
| BC-04 | No specific deadlines | Риск затягивания разработки. Требует self-imposed milestones |

### Technical Constraints

| # | Ограничение | Влияние |
|---|---|---|
| TC-01 | Node.js 22.16+ LTS / 24 runtime | Ограничивает выбор библиотек до совместимых с данной версией |
| TC-02 | TypeScript 5.x | Требует type safety во всём коде |
| TC-03 | pnpm workspace monorepo | Зависимости от pnpm-specific features (workspace protocol) |
| TC-04 | OpenClaw upstream НЕ существует | Требует самостоятельной разработки core. "Форк 80% кода" невозможен |
| TC-05 | Z.ai НЕ существует | Требует конфигурируемого OpenAI-совместимого adapter |
| TC-06 | Qdrant НЕ имеет embedded mode | Требует sqlite-vec как primary vector storage |
| TC-07 | Ollama НЕ поддерживает STT/TTS | Требует whisper.cpp + Piper TTS как отдельные процессы |
| TC-08 | Telethon требует Python runtime | Двухязыковая архитектура (TypeScript + Python), усложняет lifecycle management |
| TC-09 | Native modules (better-sqlite3, systray2) | Требуют C++ toolchain для сборки. Риск на Windows |
| TC-10 | Docker не гарантирован | Sandbox mode может быть недоступен на некоторых машинах |

### Organizational Constraints

| # | Ограничение | Влияние |
|---|---|---|
| OC-01 | Solo developer | Риск перегрузки. Строгая приоритизация P0 только для MVP |
| OC-02 | One user per installation | Нет необходимости в аутентификации, авторизации, RBAC |
| OC-03 | No QA team | Требуется автоматизация тестирования (unit + integration + E2E) |
| OC-04 | No DevOps | Требуется простота деплоя и эксплуатации (npm install + osai init) |

### Platform Constraints

| # | Ограничение | Влияние |
|---|---|---|
| PC-01 | Linux primary | Все новые функции тестируются сначала на Linux |
| PC-02 | Windows 10/11 native | Дополнительные усилия для кроссплатформенности |
| PC-03 | macOS excluded | Сужение потенциальной аудитории |
| PC-04 | Desktop-only | Нет server-side компонента. Все вычисления на клиентской машине |

---

## Dependencies

### External Dependencies (Runtime)

| Зависимость | Тип | Обязательность | Комментарий |
|---|---|---|---|
| Node.js 22.16+ / 24 | Runtime | Обязательна | Основной runtime |
| Ollama | LLM + Embeddings | Настоятельно рекомендуется | Требуется для local-first и offline режима |
| Docker | Sandbox | Опциональна | Требуется для sandbox изоляции non-main sessions |
| Python 3.11+ | Telethon runtime | Обязательна для userbot | Требуется для Telegram Userbot |
| whisper.cpp binary | STT | Требуется для voice | Отдельный процесс для Speech-to-Text |
| Piper TTS binary | TTS | Требуется для voice | Отдельный процесс для Text-to-Speech |
| libnotify (Linux) | Notifications | Требуется на Linux | Системный пакет для desktop notifications |
| libappindicator (Linux) | System tray | Требуется на Linux | Системный пакет для tray иконки |

### External Dependencies (Cloud API)

| Зависимость | Тип | Обязательность | Комментарий |
|---|---|---|---|
| Z.ai (OpenAI-совместимый) | LLM API | Настоятельно рекомендуется | Primary провайдер. Любой OpenAI-совместимый endpoint |
| Yandex Foundation Models | LLM + Embeddings + STT/TTS | Опциональна | Fallback 1 + voice fallback |
| Anthropic Claude API | LLM API | Опциональна | Fallback 2 |
| OpenAI GPT API | LLM API | Опциональна | Fallback 3 |
| Telegram Bot API | Messaging | Требуется для Telegram | Для Telegram Bot |
| Telegram MTProto | Messaging | Требуется для Userbot | Для Telegram Userbot (через Telethon) |

### Internal Dependencies

| Зависимость | От | К | Комментарий |
|---|---|---|---|
| Gateway | Все клиенты | Agent Runtime | Роутинг сообщений |
| Agent Runtime | Gateway | Skills, Memory, KB, Providers | Обработка запросов |
| Memory System | Agent Runtime | Vector Storage, SQLite | RAG pipeline |
| Knowledge Base | Agent Runtime | Memory System (embeddings) | Semantic search |
| Telegram Bot | Gateway | Agent Runtime | Чат через бота |
| Telegram Userbot | Gateway (child_process) | Agent Runtime | Userbot через Python microservice |
| Mirror Engine | Telegram Bot + Userbot | Chat Router | Bidirectional sync |
| CLI Client | -- | Gateway (WS client) | Terminal UI |

### Preconditions

| # | Условие | Необходимость |
|---|---|---|
| PR-01 | Node.js 22.16+ LTS или 24 установлен | Обязательна |
| PR-02 | pnpm установлен | Обязательна |
| PR-03 | Python 3.11+ установлен (для Telethon) | Обязательна для Telegram Userbot |
| PR-04 | Telegram Bot Token получен | Требуется для Telegram Bot |
| PR-05 | Telegram API ID + Hash получены | Требуется для Telegram Userbot |
| PR-06 | Ollama запущена и至少 одна модель загружена | Настоятельно рекомендуется |
| PR-07 | Docker установлен и запущен | Опционально, для sandbox |
| PR-08 | API ключи LLM провайдеров сконфигурированы | Требуется для cloud LLM |

---

## Scope Risks

### Critical Risks

| ID | Риск | Вероятность | Влияние | Митигация |
|---|---|---|---|---|
| SR-01 | OpenClaw upstream не существует -- стратегия форка невозможна | 85% | Critical | Самостоятельная разработка core. Переход от "форк 80%" к "разработка с нуля с нулевым наследованием". Увеличение объёма MVP работ на 4-5x |
| SR-02 | Z.ai не существует -- нет primary провайдера | 85% | High | OpenAI-совместимый adapter с configurable URL. Пользователь указывает endpoint. Риск минимален архитектурно, но требует UI для настройки |
| SR-03 | Ollama не поддерживает STT/TTS -- voice stack требует redesign | 95% | High | whisper.cpp + Piper TTS через child_process. Дополнительная инфраструктура, но технически решаемо |
| SR-04 | Qdrant не имеет embedded mode -- vector storage требует альтернативу | 95% | Medium | sqlite-vec как primary. Потенциально хуже производительность при больших объёмах, но достаточна для MVP |

### High Risks

| ID | Риск | Вероятность | Влияние | Митигация |
|---|---|---|---|---|
| SR-05 | Solo developer overload при увеличении объёма MVP (из-за SR-01) | 70% | High | Строгая приоритизация. Минимальный MVP: CLI + 1 LLM + basic memory + filesystem skill. Постепенное расширение |
| SR-06 | Telethon userbot бан аккаунта | 60-70% | Medium | Rate limiting, fallback на bot-only mode. Никогда не использовать основной аккаунт |
| SR-07 | Node.js native modules не собираются на Windows | 40% | Medium | Prebuild binaries, CI на Windows, fallback на pure-JS alternatives |

### Medium Risks

| ID | Риск | Вероятность | Влияние | Митигация |
|---|---|---|---|---|
| SR-08 | sqlite-vec нестабилен или не работает на Windows | 30% | Medium | Fallback на Orama (in-process) или LanceDB |
| SR-09 | Контекстное окно переполнение при мультичатах | 45% | Medium | Auto-pruning + summarization (FR-013) |
| SR-10 | Yandex API изменения | 35% | Medium | Abstraction layer, version pinning |
| SR-11 | Voice quality (Piper) недостаточно для RU | 40% | Low | Yandex SpeechKit как fallback (высокое качество, но платный и cloud) |

### Scope-Specific Risks

| ID | Риск | Описание | Митигация |
|---|---|---|---|
| SR-12 | Scope creep | Количество MVP компонентов (55+) может привести к затягиванию | Жёсткий MVP definition: только P0. V1 и V2 -- отдельные milestones |
| SR-13 | Dependency scope | Большое количество внешних зависимостей (Ollama, Docker, Python, whisper, Piper) | Минимальная установка: только Node.js + pnpm + Ollama. Остальное -- опционально |
| SR-14 | Platform scope | Dual-platform (Linux + Windows) увеличивает объём тестирования и поддержки | Linux primary, Windows -- best-effort для MVP. Полная паритетность -- V1 |

---

## Scope Boundaries Summary

### Что делает osaI v3 (MVP):

- Принимает текстовые запросы через CLI и Telegram (bot + userbot)
- Выполняет intent execution через agent loop с tool calling
- Работает с файлами и shell (в sandbox)
- Хранит трёхуровневую память с RAG
- Управляет до 20 чатов с изолированным контекстом
- Подключается к 5 LLM-провайдерам с failover
- Зеркалирует чаты в Telegram (bidirectional)
- Показывает системную информацию и desktop notifications
- Аудитирует все действия

### Что НЕ делает osaI v3 (MVP):

- НЕ работает с голосом (voice -- V1)
- НЕ работает через веб-интерфейс (web dashboard -- V1)
- НЕ работает через WhatsApp/Discord/Slack (V1)
- НЕ работает как системный tray-демон (system tray -- V1)
- НЕ работает как multi-agent система (V2)
- НЕ работает на macOS
- НЕ хранит данные в облаке
- НЕ требует аутентификации пользователей
- НЕ использует Ollama для STT/TTS (отдельные процессы)
- НЕ использует Qdrant embedded (sqlite-vec primary)

---

**Версия документа:** v1.0
**Дата создания:** 2026-03-30
**Автор:** System Analyst Agent
**Статус:** Завершён
