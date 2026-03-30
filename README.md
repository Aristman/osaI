# osaI v3 -- AI Operating System

**Local-first AI-ассистент** с multi-provider LLM, мультичатами, системой навыков, глубокой памятью (RAG) и интеграцией с Telegram. Все данные хранятся на локальной машине пользователя.

## Ключевые возможности

- **Multi-provider LLM** -- 5 провайдеров с автоматическим failover: Z.ai (primary), Yandex, Anthropic, OpenAI, Ollama (local)
- **Multi-chat** -- до 20 независимых чатов с изолированным контекстом и общей долговременной памятью
- **Three-tier Memory** -- Chat Memory, Session Memory, Long-term Memory с RAG (семантический поиск)
- **Knowledge Base** -- ингест документов, семантический поиск с source attribution
- **Skills System** -- файловые операции, shell-команды, управление памятью, чатами, ОС
- **Telegram Integration** -- Bot (grammY), Userbot (Telethon), bidirectional mirror
- **7-layer Security** -- network isolation, sandbox, permissions, file sandbox, shell security, Telegram security, audit
- **Graceful Degradation** -- circuit breaker, fallback на Ollama при недоступности cloud провайдеров
- **Cross-platform** -- Linux (primary) + Windows 10/11 (native)
- **CLI + TUI** -- интерактивный терминальный интерфейс на базе ink

## Quick Start

```bash
# Предварительные требования: Node.js 22.16+, pnpm 9+
# Рекомендуется: Ollama для локального LLM

# Клонировать и установить
git clone <repo-url>
cd osai
pnpm install

# Собрать
pnpm build

# Первоначальная настройка
pnpm --filter @osai/cli start init

# Запустить
pnpm --filter @osai/gateway start start
```

## Tech Stack

| Компонент | Технология |
|---|---|
| Runtime | Node.js 22.16+ LTS |
| Language | TypeScript 5.x (strict) |
| Package Manager | pnpm workspace monorepo |
| Database | better-sqlite3 (WAL mode), sqlite-vec (vector search) |
| WebSocket | ws |
| CLI/TUI | oclif + ink |
| Telegram Bot | grammY |
| Telegram Userbot | Telethon (Python, child_process bridge) |
| Logging | pino (structured JSON) |
| Testing | vitest (unit + integration + e2e) |

## Project Structure

```
packages/
  agent/            -- Agent Runtime + 13 hook points
  cli/              -- CLI Client + TUI (ink)
  gateway/          -- WebSocket Control Plane (ws://127.0.0.1:18789)
  knowledge-base/   -- Document Ingestion + Semantic Search
  memory/           -- Three-tier Memory + RAG + Embeddings
  observability/    -- pino Logging + Audit Log
  os-integration/   -- Desktop Notifications + System Info
  providers/        -- LLM Providers + Failover + Circuit Breaker
  shared/           -- Shared Types + DB Schema + Migrations + Platform
  skills-core/      -- Bundled Skills (Filesystem, Shell)
  skills-osai/      -- osaI Skills (Memory, KB, Chat, OS)
  voice/            -- STT/TTS (V1 milestone)
```

## Команды

```bash
# Сборка
pnpm build              # TypeScript compilation (12 packages)
pnpm clean              # Clean build artifacts
pnpm typecheck          # Type checking without emit

# Тестирование
pnpm test               # Run all tests (vitest)
pnpm test:watch         # Watch mode
pnpm test:coverage      # With coverage report

# Код
pnpm lint               # ESLint
pnpm lint:fix           # ESLint with auto-fix
pnpm format             # Prettier
```

## CLI Commands

```bash
osai                              # Interactive chat
osai "command"                    # Quick execution
osai init                         # First-time setup
osai chat list|create|switch|delete|archive
osai session list|resume
osai config                       # Configuration
osai skills list                  # Skills management
osai memory search "query"        # Memory search
osai status                       # System status
osai channel add telegram         # Channel setup
```

## Documentation

| Документ | Описание |
|---|---|
| [ARCHITECTURE.md](docs/project/ARCHITECTURE.md) | Детальная архитектура системы |
| [USAGE.md](docs/project/USAGE.md) | Руководство пользователя |
| [DEPLOY.md](docs/project/DEPLOY.md) | Руководство по развёртыванию |

## Configuration

Основной конфигурационный файл: `~/.osai/osai.json`. Содержит настройки LLM-провайдеров, failover chain, памяти, безопасности, каналов и навыков.

Подробнее: [USAGE.md](docs/project/USAGE.md)

## LLM Provider Chain

```
Z.ai (OpenAI-совместимый, glm-5)
  -> Yandex Foundation Models
    -> Anthropic Claude
      -> OpenAI GPT
        -> Ollama (local, offline fallback)
```

Circuit Breaker: при 5 последовательных ошибках провайдер исключается из цепочки на 30 секунд.

## License

MIT
