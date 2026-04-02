# osaI v3 -- AI Operating System

**Local-first AI-ассистент** с multi-provider LLM, мультичатами, системой навыков, глубокой памятью (RAG) и интеграцией с Telegram. Все данные хранятся на локальной машине пользователя.

## Ключевые возможности

- **Multi-provider LLM** -- 5 провайдеров с автоматическим failover: Z.ai (primary), Yandex, Anthropic, OpenAI, Ollama (local)
- **Per-client Provider Isolation** -- каждый CLI-клиент пушит свой конфиг в Gateway, создавая изолированную ProviderChain
- **Config Push Protocol** -- CLI при подключении отправляет `osai.json` (agent + providers) в Gateway через WebSocket (`config.push` / `config.ack`)
- **Auto-detection Endpoint Type** -- Z.ai с Anthropic-совместимым эндпоинтом (`/api/anthropic`) автоматически использует Anthropic SDK вместо OpenAI SDK
- **Configurable Timeouts** -- настраиваемый таймаут провайдеров (`callTimeoutMs` в конфиге), пробрасывается до Ollama
- **Circuit Breaker** -- при 5 последовательных ошибках провайдер исключается на 30 секунд, затем автоматически восстанавливается
- **Docker Deployment** -- Gateway + Ollama + Qdrant в Docker Compose с GPU passthrough
- **CLI + TUI** -- интерактивный терминальный интерфейс на базе ink с WebSocket-подключением к Gateway
- **Model Failover Chain** -- Z.ai -> Yandex -> Anthropic -> OpenAI -> Ollama (local)

## Quick Start (Docker)

```bash
# Клонировать
git clone <repo-url>
cd osai

# Настроить конфиг
cp osai.json.example ~/.osai/osai.json
# Заполните API-ключи провайдеров

# Запустить через Docker Compose (GPU)
docker compose up -d

# Подтянуть модель для Ollama (один раз)
docker compose --profile setup up ollama-pull

# CLI-клиент (на хосте)
pnpm --filter @osai/cli build
pnpm --filter @osai/cli start
```

## Quick Start (Local)

```bash
# Предварительные требования: Node.js 22.16+, pnpm 9+

# Установить
pnpm install

# Собрать
pnpm build

# Первоначальная настройка
pnpm --filter @osai/cli start init

# Запустить Gateway
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
| LLM SDKs | @anthropic-ai/sdk, openai, ollama (REST) |
| Containerization | Docker Compose + GPU passthrough (NVIDIA) |
| Logging | pino (structured JSON) |
| Testing | vitest (786+ tests) |

## Project Structure

```
packages/
  agent/            -- Agent Runtime + AgentLoop + Hook Points
  cli/              -- CLI Client + TUI (ink) + WebSocket gateway client
  gateway/          -- WebSocket Control Plane + per-client sessions + Provider Factory
  knowledge-base/   -- Document Ingestion + Semantic Search
  memory/           -- Three-tier Memory + RAG + Embeddings
  observability/    -- pino Logging + Audit Log
  os-integration/   -- Desktop Notifications + System Info
  providers/        -- LLM Providers + Failover Chain + Circuit Breaker
  shared/           -- Shared Types + DB Schema + Migrations + Platform
  skills-core/      -- Bundled Skills (Filesystem, Shell)
  skills-osai/      -- osaI Skills (Memory, KB, Chat, OS)
  voice/            -- STT/TTS (future milestone)
```

## Команды

```bash
# Сборка
pnpm build              # TypeScript compilation (12 packages)
pnpm clean              # Clean build artifacts
pnpm typecheck          # Type checking without emit

# Тестирование
pnpm test               # Run all tests (vitest, 786+ tests)
pnpm test:watch         # Watch mode
pnpm test:coverage      # With coverage report

# Docker
docker compose up -d                    # Запустить все сервисы
docker compose --profile setup up       # Запустить + подтянуть модели Ollama
docker compose build gateway            # Пересобрать Gateway
docker compose logs -f gateway          # Логи Gateway
```

## Architecture

### Gateway-centric Design

```
CLI Client (host)                    Docker
  |                                    |
  |  WebSocket ws://localhost:18790    |
  |--- config.push (osai.json) ------->|  Gateway
  |<--- config.ack -------------------|    |
  |                                    |    +-- ProviderChain (per-client)
  |--- message ----------------------->|    |     Z.ai (Anthropic/OpenAI SDK)
  |<--- block_stream -----------------|    |     Yandex Foundation
  |<--- tool_stream ------------------|    |     Anthropic Claude
  |                                    |    |     OpenAI GPT
  |                                    |    |     Ollama (GPU)
  |                                    |    |
  |                                    |    +-- AgentLoop
  |                                    |    +-- InferenceService
  |                                    |    +-- HookRegistry
  |                                    |
  |                              Ollama (GPU passthrough)
  |                              Qdrant (vector DB)
```

### Config Push Protocol

При подключении CLI отправляет свой `~/.osai/osai.json` (секции `agent` + `providers`) в Gateway:

```typescript
// CLI -> Gateway
{ type: "config.push", session_id: "...", payload: { agent: {...}, providers: {...} } }

// Gateway -> CLI
{ type: "config.ack", payload: { status: "ok", providersLoaded: 3, model: "z-ai/glm-5-turbo" } }
```

Gateway создаёт изолированную сессию: `ClientSession { providerChain, inferenceService, agentLoop }` для каждого клиента. При disconnect сессия disposed.

### Provider Chain + Auto-detection

```
z-ai/glm-5-turbo (primary)
  baseUrl содержит "/anthropic"?
    да -> AnthropicProvider (@anthropic-ai/sdk)
    нет -> ZAiProvider (openai SDK, OpenAI-совместимый)
  |
  v (error / 429 / timeout)
yandex/yandexgpt-pro (fallback 1)
  |
  v
anthropic/claude-opus-4-6 (fallback 2)
  |
  v
openai/gpt-4o (fallback 3)
  |
  v
ollama/llama3 (local GPU fallback, 120s timeout)
```

## Configuration

Основной конфигурационный файл: `~/.osai/osai.json`

```jsonc
{
  "agent": {
    "model": "z-ai/glm-5-turbo",
    "callTimeoutMs": 120000,        // Таймаут провайдеров (мс), default 120s
    "failoverChain": [
      "z-ai/glm-5-turbo",          // Z.ai (auto-detect: Anthropic или OpenAI SDK)
      "yandex/yandexgpt-pro",
      "anthropic/claude-opus-4-6",
      "openai/gpt-4o",
      "ollama/llama3"
    ],
    "circuitBreaker": {
      "failureThreshold": 5,
      "resetTimeoutMs": 30000
    }
  },
  "providers": {
    "z-ai": {
      "type": "openai-compat",
      "baseUrl": "https://api.z.ai/api/anthropic",  // /anthropic -> AnthropicProvider
      "apiKey": "...",
      "model": "glm-5-turbo"
    },
    "ollama": {
      "type": "ollama",
      "baseUrl": "http://localhost:11434",
      "model": "llama3"
    }
    // ... yandex, anthropic, openai
  }
}
```

## Documentation

| Документ | Описание |
|---|---|
| [ARCHITECTURE.md](docs/project/ARCHITECTURE.md) | Детальная архитектура системы |
| [USAGE.md](docs/project/USAGE.md) | Руководство пользователя |
| [DEPLOY.md](docs/project/DEPLOY.md) | Руководство по развёртыванию |
| [spec_osai_v3](docs/specs/spec_osai_v3_2026-03-28.md) | Техническое задание |

## Implemented MVP Features

### LLM Providers (DOMAIN-008)
- Z.ai provider (OpenAI-compatible + Anthropic-compatible auto-detection)
- Yandex Foundation Models provider
- Anthropic Claude provider
- OpenAI GPT provider
- Ollama local provider (GPU passthrough in Docker)
- Provider Chain with 5-provider failover
- Circuit Breaker (configurable threshold + reset timeout)
- Configurable call timeout per provider

### Gateway
- WebSocket Control Plane (ws://0.0.0.0:18790)
- Per-client session isolation (ProviderChain + InferenceService + AgentLoop)
- Config Push Protocol (`config.push` / `config.ack`)
- Client session lifecycle (create on connect, dispose on disconnect)
- Default fallback chain when no config pushed
- Docker Compose deployment (Gateway + Ollama + Qdrant)

### Agent Runtime
- Agent Loop (intake -> context_assembly -> model_inference -> tool_execution -> streaming -> persistence)
- InferenceService with streaming + non-streaming support
- Hook Registry (BEFORE/AFTER_MODEL_INFERENCE)
- Context Assembler

### CLI + TUI
- Interactive terminal UI (ink)
- WebSocket gateway client with auto-reconnect
- Config push on connect
- Message routing (block_stream, tool_stream, error, config_ack)
- Multi-chat support (chat switching)

### Infrastructure
- 786+ unit/integration tests passing
- Structured logging (pino)
- Cross-platform (Linux + Windows)
- GPU passthrough for Ollama in Docker

## License

MIT
