# osaI -- Operation System AI

**AI Operating System with autonomous agent** -- personal AI-assistant для desktop Linux/macOS.

osaI предоставляет AI-слой управления операционной системой: файлы, процессы, приложения через естественный язык. Система управляется через единый WebSocket control plane (Gateway) и доступна из CLI, Web Dashboard и мессенджеров (Telegram, WhatsApp).

---

## Обзор

osaI -- локальная (local-first) AI-система с 6-layer security model, двухуровневой памятью (short-term + long-term RAG) и полноценной observability (OpenTelemetry).

Ключевые возможности:

- **Agent Runtime** с hook-based extensibility (11 hook points)
- **Skills System** -- декларативные навыки в формате SKILL.md (Filesystem, Shell, Browser, HTTP, OS Integration, Memory, Knowledge Base)
- **Model Failover Chain** -- Claude (primary) -> GPT-4o (fallback) -> Ollama (local fallback)
- **6-Layer Security** -- Network, Sandbox, Permissions, File Sandbox, Shell Security, Audit
- **Two-Tier Memory** -- short-term (SQLite, session-scoped) + long-term (SQLite + Qdrant, RAG pipeline)
- **Observability** -- OpenTelemetry traces/metrics, pino structured logging, Prometheus, immutable audit log
- **Multi-Channel** -- CLI (primary), Web Dashboard (SvelteKit), Telegram, WhatsApp

## Поддерживаемые платформы

| Платформа | Статус |
|-----------|--------|
| Linux (desktop) | Primary |
| macOS (desktop) | Secondary |

Remote access -- через Tailscale (мобильные устройства через мессенджеры).

## Версия и статус

- **Версия:** 0.1.0 (V1)
- **System Quality Score:** 9.31/10
- **Тесты:** 1723 теста, 103 файла, 100% pass rate
- **TypeScript:** strict mode, 0 compilation errors
- **Покрытие требований:** 72/72 FR (100%), 35/37 NFR (95%)

---

## Архитектура

Gateway-centric layered architecture с event-driven internals и plugin-based extensibility.

```
+====================================================================+
|                        osaI SYSTEM                                   |
|                                                                      |
|  CLIENTS:  CLI  |  Dashboard  |  Telegram  |  WhatsApp              |
|       |               |              |              |                |
|       +-------+-------+------+-------+------+-------+                |
|               |              |                                    |
|               v              v                                    |
|  GATEWAY (WS Control Plane)  ws://127.0.0.1:18789                |
|  WS Server | Session Router | Channel Handlers                   |
|               |                                                    |
|               v                                                    |
|  AGENT RUNTIME                                                      |
|  intake -> context -> inference -> tools -> stream -> persist       |
|               |                                                    |
|  SKILLS + EXTENSIONS                                                |
|  skills-core | skills-osai | memory | observability                |
|               |                                                    |
|  INFRASTRUCTURE                                                     |
|  SQLite | Qdrant | Docker | pino | OTel                            |
|                                                                      |
|  CROSS-CUTTING: OS Integration (tray, notifications, watcher)      |
+====================================================================+
```

### Структура монорепозитория

```
osai/
├── packages/
│   ├── types/              # Shared types (WS protocol, session, config, errors)
│   ├── gateway/            # WebSocket control plane, session router, channels
│   ├── config/             # Configuration loader, validation, hot-reload
│   ├── agent/              # Agent loop, hooks, model resolver/failover
│   ├── skills-core/        # Filesystem, Shell, Browser (CDP), HTTP skills
│   ├── skills-osai/        # OS Integration, Memory, Knowledge Base skills
│   ├── memory/             # Short-term + long-term memory, RAG, embeddings
│   ├── security/           # Permission Manager, Docker sandbox, audit coordination
│   ├── observability/      # OpenTelemetry, traces, metrics, structured logs
│   ├── os-integration/     # System tray, notifications, file watcher, processes
│   └── channels/           # Telegram (grammY), WhatsApp (Baileys) handlers
├── apps/
│   ├── cli/                # CLI клиент (readline + ANSI, WS client)
│   └── dashboard/          # Web Dashboard (SvelteKit + TailwindCSS)
├── docs/                   # Спецификации, архитектура, верификация
└── tests/                  # Unit, integration, e2e
```

---

## Быстрый старт

### Требования

- **Node.js** 20+ LTS
- **npm** 10+
- **Git**
- (Опционально) Docker -- для Qdrant и non-main session sandbox
- (Опционально) Chrome/Chromium -- для Browser skill

### Установка и сборка

```bash
# Клонирование
git clone <repo-url> osai
cd osai

# Установка зависимостей
npm install

# Сборка всех пакетов
npm run build

# Запуск тестов
npm test
```

### Инициализация

```bash
# Создание ~/.osai/ с конфигурацией по умолчанию
npx osai init
```

### Запуск

```bash
# Интерактивный чат
npx osai

# Quick command mode
npx osai "покажи список процессов"
```

### Конфигурация

После `osai init` создаётся `~/.osai/openclaw.json` с конфигурацией всех подсистем:

- **gateway** -- хост и порт WS сервера (default: 127.0.0.1:18789)
- **model** -- primary/fallback LLM провайдеры, API ключи, budget
- **session** -- persistence, pruning, queue mode
- **skills** -- включение/выключение навыков, timeout'ы
- **security** -- sandbox директории, blocked patterns, shell security
- **memory** -- embedding provider, RAG параметры
- **observability** -- traces, metrics, Prometheus, log level

Подробнее см. [docs/project/USAGE.md](docs/project/USAGE.md).

---

## Скрипты

| Команда | Описание |
|---------|----------|
| `npm run build` | Сборка всех пакетов и приложений (tsup) |
| `npm run test` | Запуск всех тестов (vitest) |
| `npm run lint` | Линтинг (ESLint) |
| `npm run format` | Форматирование (Prettier) |
| `npm run format:check` | Проверка форматирования |
| `npm run typecheck` | Проверка типов (tsc --build) |
| `npm run ci` | Полный CI пайплайн (lint + typecheck + test + build) |

---

## Документация

| Документ | Путь | Описание |
|----------|------|----------|
| Архитектура | [docs/project/ARCHITECTURE.md](docs/project/ARCHITECTURE.md) | Подробная архитектура всех пакетов, data flow, security model |
| Использование | [docs/project/USAGE.md](docs/project/USAGE.md) | CLI, конфигурация, API, Dashboard, Channels |
| Спецификация | docs/project/TECH_REQUIREMENTS.md | 72 FR, 37 NFR, acceptance criteria |
| Верификация | docs/project/SYSTEM_VERIFICATION.md | System verification report, score 9.31/10 |
| Features Index | docs/project/FEATURES_INDEX.md | 13 фич, dependency graph, quality metrics |
| Project Profile | docs/project/PROJECT_PROFILE.md | Домены, профили, tech stack |
| Scope | docs/project/SCOPE.md | In/out of scope, constraints |
| Архитектурный обзор | docs/project/ARCHITECTURE_OVERVIEW.md | Полный архитектурный дизайн |

---

## Технологический стек

| Категория | Технология |
|-----------|------------|
| Runtime | Node.js 20+ LTS |
| Язык | TypeScript 5.x (strict) |
| WS Server | ws |
| База данных | better-sqlite3 (WAL mode) |
| Vector DB | Qdrant (Docker, REST client) |
| Embeddings | OpenAI / Ollama / ONNX (fallback chain) |
| Observability | OpenTelemetry, pino, prom-client |
| Frontend | SvelteKit + TailwindCSS |
| Build | tsup / esbuild |
| Testing | vitest |
| Linting | ESLint + Biome + Prettier |
| CI/CD | GitHub Actions |
| LLM | Anthropic Claude (primary), OpenAI GPT (fallback), Ollama (local) |

---

## Лицензия

Private project. UNLICENSED.
