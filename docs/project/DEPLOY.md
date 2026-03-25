# Deployment Guide: osaI v1.0.0

**Version:** v1.0
**Date:** 2026-03-25
**Based on:** SYSTEM_VERIFICATION.md v1.0, ARCHITECTURE.md v1.0
**System Quality Score:** 9.31/10

---

## 1. Deployment Overview

osaI (Operation System AI) -- AI Operating System с автономным агентом для desktop Linux/macOS. Система развёртывается локально (local-first), один пользователь на машину.

**Архитектурная модель:**

```
[CLI] --WS--> [Gateway :18789] --WS--> [Dashboard]
                   |
                   +--> Agent Runtime --> Skills --> Memory
                   |
[Telegram/WhatsApp] --WS--> [Gateway]
                   |
[System Tray] <-- [OS Integration]
```

**Компоненты:**
- **Gateway Server** -- WebSocket control plane, единая точка входа (127.0.0.1:18789)
- **CLI Client** -- терминальный интерфейс (`osai`)
- **Web Dashboard** -- SvelteKit SPA (`@osai/dashboard`)
- **SQLite** -- хранилище (sessions, memory, audit)
- **Qdrant** (опционально) -- vector storage для long-term memory (Docker)

---

## 2. Supported Environments

| Платформа | Статус | Примечания |
|-----------|--------|------------|
| Linux (desktop) | Primary | X11 + Wayland, systemd |
| macOS (desktop) | Secondary | launchd, system tray с ограничениями |
| Windows | Не поддерживается | Out of scope |
| Cloud/Server | Не поддерживается | Local-first архитектура |

| Компонент | Требование |
|-----------|------------|
| Node.js | >= 20.0.0 LTS |
| npm | >= 10.0.0 |
| SQLite3 | Встроен (better-sqlite3, native binding) |
| Docker (опционально) | Для Qdrant и non-main session sandbox |
| build-essential / python3 | Для native modules (better-sqlite3, node-gyp) |
| C++ compiler (g++/clang) | Для better-sqlite3 |

---

## 3. Prerequisites

### 3.1 Системные зависимости

```bash
# Ubuntu/Debian
sudo apt-get update
sudo apt-get install -y build-essential python3

# Fedora/RHEL
sudo dnf install -y gcc-c++ python3 make

# macOS (через Xcode Command Line Tools)
xcode-select --install
```

### 3.2 Node.js

```bash
# Рекомендуется через nvm
nvm install 20
nvm use 20
node --version  # >= 20.0.0
npm --version   # >= 10.0.0
```

### 3.3 Docker (опционально)

```bash
# Только для Qdrant (long-term memory) и sandbox
docker --version  # >= 24.0
docker compose version  # >= 2.20
```

---

## 4. Environment Configuration

### 4.1 Инициализация

```bash
# Клонирование репозитория
git clone <repository-url> osai
cd osai

# Установка зависимостей
npm ci

# Сборка всех пакетов
npm run build

# Запуск тестов (верификация)
npm run test
```

### 4.2 Конфигурация системы

```bash
# Инициализация ~/.osai/
npx osai init
```

Команда `osai init` создаёт структуру директорий:

```
~/.osai/
  openclaw.json     # Основной конфиг (permissions: 0600)
  osai.db           # SQLite database (WAL mode)
  workspace/
    AGENTS.md       # Системный промпт агента
    SOUL.md         # Персональность агента
    skills/         # Пользовательские SKILL.md навыки
  logs/             # Structured logs (JSON, pino)
  data/             # Дополнительные данные
```

### 4.3 Формат конфигурационного файла

Файл `~/.osai/openclaw.json` содержит секции:

| Секция | Описание | Обязательна |
|--------|----------|-------------|
| `gateway` | Хост, порт WS server (default: 127.0.0.1:18789) | Нет (дефолтные значения) |
| `model` | LLM провайдеры, API ключи, модель, параметры | Да (минимум один провайдер) |
| `session` | Таймауты, max sessions, pruning | Нет |
| `skills` | Включённые навыки, sandbox rules | Нет |
| `security` | Permission categories, blocked commands, allowed dirs | Нет |
| `memory` | RAG настройки, embedding provider, Qdrant URL | Нет |
| `observability` | OTel, логирование, Prometheus port | Нет |
| `osIntegration` | Tray, notifications, file watcher | Нет |

### 4.4 Environment Variables

| Переменная | Описание | Default | Обязательна |
|------------|----------|---------|-------------|
| `OSAI_CONFIG_PATH` | Путь к конфигурационному файлу | `~/.osai/openclaw.json` | Нет |
| `OSAI_DATA_DIR` | Путь к каталогу данных | `~/.osai` | Нет |
| `OSAI_LOG_LEVEL` | Уровень логирования | `info` | Нет |
| `ANTHROPIC_API_KEY` | API ключ Anthropic Claude | -- | Да (если Claude primary) |
| `OPENAI_API_KEY` | API ключ OpenAI GPT | -- | Нет (fallback) |
| `OLLAMA_BASE_URL` | URL локального Ollama | `http://localhost:11434` | Нет (local fallback) |
| `QDRANT_URL` | URL Qdrant server | `http://localhost:6333` | Нет (long-term memory) |
| `PROMETHEUS_PORT` | Порт Prometheus exporter | `9090` | Нет |
| `OSAI_WS_PORT` | Порт WebSocket Gateway | `18789` | Нет |
| `OSAI_WS_HOST` | Хост WebSocket Gateway | `127.0.0.1` | Нет |
| `NODE_ENV` | Окружение Node.js | `production` | Нет |

---

## 5. Deployment Steps

### 5.1 Сборка проекта

```bash
# Полная сборка (все 12 пакетов + 2 приложения)
npm run build

# Проверка TypeScript компиляции
npm run typecheck

# Линтинг
npm run lint

# Запуск тестов (1723 теста)
npm run test

# Полный CI pipeline (lint + typecheck + test + build)
npm run ci
```

**Результат сборки:**
- Build time: ~2s (full monorepo)
- Output format: ESM + CJS dual (tsup)
- Target: ES2022
- Все артефакты в `packages/*/dist/` и `apps/*/dist/`

### 5.2 Запуск Gateway Server

Gateway -- основной сервер системы. Все клиенты подключаются через него.

```bash
# Запуск Gateway
node packages/gateway/dist/index.js

# Или через npm workspace
npm run start --workspace=packages/gateway
```

**Проверка запуска:**

```bash
# WebSocket health check (через wscat или curl)
curl -s http://127.0.0.1:18789/health || echo "Gateway health endpoint not available"

# Проверка процесса
ps aux | grep "gateway"
```

Gateway запускается на `ws://127.0.0.1:18789`. При успешном запуске:
1. Загружается конфигурация из `~/.osai/openclaw.json`
2. Инициализируется SQLite (WAL mode)
3. Запускается WS server
4. Активируются channel handlers (Telegram, WhatsApp если настроены)
5. Восстанавливаются сессии из SQLite

### 5.3 Запуск CLI Client

```bash
# Интерактивный чат
npx osai
# или
node apps/cli/dist/index.js

# Быстрая команда
npx osai "перечисли файлы в ~/projects"

# Специфичные команды
npx osai chat                     # Явный вход в чат
npx osai session list             # Список сессий
npx osai session resume <id>      # Возобновление сессии
npx osai config show              # Текущая конфигурация
npx osai skills list              # Список навыков
npx osai memory search <query>    # Поиск в памяти
npx osai channel list             # Список каналов
npx osai status                   # Статус системы
npx osai version                  # Версия
```

CLI подключается к Gateway через WebSocket на `127.0.0.1:18789`. Gateway server должен быть запущен.

### 5.4 Запуск Web Dashboard

```bash
# Dev mode (с hot-reload)
npm run dev --workspace=apps/dashboard

# Production build
npm run build --workspace=apps/dashboard

# Preview production build
npm run preview --workspace=apps/dashboard
```

Dashboard -- SPA на SvelteKit + TailwindCSS. Подключается к Gateway через WebSocket.
Routes:
- `/` -- Chat (основной интерфейс)
- `/sessions` -- Список сессий
- `/sessions/:id` -- Детали сессии
- `/traces` -- Agent trace view
- `/traces/:id` -- Детали трейса
- `/memory` -- Поиск в памяти
- `/settings` -- Настройки
- `/status` -- Системный статус (метрики, health)

### 5.5 Qdrant (опционально, для long-term memory)

```bash
# Запуск Qdrant через Docker
docker run -d \
  --name osai-qdrant \
  -p 6333:6333 \
  -p 6334:6334 \
  -v ~/.osai/qdrant_storage:/qdrant/storage \
  qdrant/qdrant:latest

# Проверка
curl http://localhost:6333/health
```

---

## 6. Docker Deployment

### 6.1 Dockerfile (Gateway + Agent)

```dockerfile
FROM node:20-slim AS builder

RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package*.json ./
COPY packages/types/package.json ./packages/types/
COPY packages/config/package.json ./packages/config/
COPY packages/gateway/package.json ./packages/gateway/
COPY packages/agent/package.json ./packages/agent/
COPY packages/skills-core/package.json ./packages/skills-core/
COPY packages/skills-osai/package.json ./packages/skills-osai/
COPY packages/memory/package.json ./packages/memory/
COPY packages/security/package.json ./packages/security/
COPY packages/observability/package.json ./packages/observability/
COPY packages/os-integration/package.json ./packages/os-integration/
COPY packages/channels/package.json ./packages/channels/

RUN npm ci
COPY . .
RUN npm run build

FROM node:20-slim

RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/

WORKDIR /app
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/tsconfig*.json ./

# CLI binary
RUN ln -s /app/apps/cli/dist/index.js /usr/local/bin/osai

ENV OSAI_DATA_DIR=/app/.osai
ENV OSAI_WS_HOST=0.0.0.0
ENV OSAI_WS_PORT=18789

EXPOSE 18789 9090

CMD ["node", "packages/gateway/dist/index.js"]
```

### 6.2 docker-compose.yml

```yaml
version: "3.8"

services:
  osai:
    build:
      context: .
      dockerfile: Dockerfile
    container_name: osai
    restart: unless-stopped
    ports:
      - "127.0.0.1:18789:18789"
      - "127.0.0.1:9090:9090"
    volumes:
      - osai-data:/app/.osai
    environment:
      - OSAI_DATA_DIR=/app/.osai
      - OSAI_WS_HOST=0.0.0.0
      - OSAI_WS_PORT=18789
      - NODE_ENV=production
      - OSAI_LOG_LEVEL=info
      - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
      - OPENAI_API_KEY=${OPENAI_API_KEY}
    depends_on:
      qdrant:
        condition: service_healthy
    networks:
      - osai-net

  qdrant:
    image: qdrant/qdrant:latest
    container_name: osai-qdrant
    restart: unless-stopped
    ports:
      - "127.0.0.1:6333:6333"
    volumes:
      - qdrant-data:/qdrant/storage
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:6333/health"]
      interval: 10s
      timeout: 5s
      retries: 3
    networks:
      - osai-net

volumes:
  osai-data:
    driver: local
  qdrant-data:
    driver: local

networks:
  osai-net:
    driver: bridge
```

### 6.3 Docker команды

```bash
# Сборка и запуск
docker compose up -d

# Просмотр логов
docker compose logs -f osai

# Остановка
docker compose down

# Пересборка после обновления кода
docker compose up -d --build

# Проверка статуса
docker compose ps
```

---

## 7. Systemd Service Configuration

### 7.1 Service unit file

Создать `/etc/systemd/system/osai.service` (system-wide) или `~/.config/systemd/user/osai.service` (user-level):

```ini
[Unit]
Description=osaI - Operation System AI
After=network-online.target docker.service
Wants=network-online.target

[Service]
Type=simple
User=%i
WorkingDirectory=/opt/osai
ExecStart=/usr/bin/node /opt/osai/packages/gateway/dist/index.js
Restart=on-failure
RestartSec=5
TimeoutStopSec=30
StandardOutput=journal
StandardError=journal
SyslogIdentifier=osai

# Environment
Environment=NODE_ENV=production
Environment=OSAI_DATA_DIR=/home/%i/.osai
Environment=OSAI_WS_HOST=127.0.0.1
Environment=OSAI_WS_PORT=18789
Environment=OSAI_LOG_LEVEL=info
# Environment=ANTHROPIC_API_KEY=<key>
# Environment=OPENAI_API_KEY=<key>

# Security
NoNewPrivileges=true
ProtectSystem=strict
ReadWritePaths=/home/%i/.osai

# Resource limits
LimitNOFILE=65535

[Install]
WantedBy=multi-user.target
```

### 7.2 Управление сервисом

```bash
# Перезагрузка systemd daemon
systemctl --user daemon-reload

# Включение автозапуска
systemctl --user enable osai

# Запуск
systemctl --user start osai

# Статус
systemctl --user status osai

# Логи
journalctl --user -u osai -f

# Остановка
systemctl --user stop osai

# Перезапуск
systemctl --user restart osai
```

---

## 8. Version Update

### 8.1 Обновление версии

```bash
# 1. Перейти на новую ветку
git checkout OSAI-DEV
git pull origin OSAI-DEV

# 2. Обновить зависимости
npm ci

# 3. Пересборка
npm run build

# 4. Проверка
npm run ci

# 5. Перезапуск сервиса
systemctl --user restart osai

# 6. Верификация
systemctl --user status osai
npx osai version
```

### 8.2 Обновление версий пакетов

Версии пакетов в monorepo синхронизируются вручную или через скрипт:

```bash
# Обновление версии всех пакетов
NEW_VERSION="1.1.0"
find packages apps -name "package.json" -exec sed -i "s/\"version\": \"0.0.1\"/\"version\": \"$NEW_VERSION\"/" {} \;

# Обновление корневого package.json
sed -i "s/\"version\": \"0.1.0\"/\"version\": \"$NEW_VERSION\"/" package.json
```

---

## 9. Rollback Strategy

### 9.1 Процедура отката

```bash
# 1. Остановить текущий сервис
systemctl --user stop osai

# 2. Откатить код к предыдущей версии
cd /opt/osai
git fetch --all
git checkout <previous-tag>

# 3. Переустановка зависимостей
npm ci

# 4. Пересборка
npm run build

# 5. Проверка
npm run test

# 6. Запуск
systemctl --user start osai

# 7. Верификация
npx osai status
npx osai version
```

### 9.2 Откат базы данных

SQLite WAL mode обеспечивает crash recovery. При необходимости:

```bash
# Бэкап перед обновлением
cp ~/.osai/osai.db ~/.osai/osai.db.backup.$(date +%Y%m%d%H%M%S)

# Откат бэкапа
systemctl --user stop osai
cp ~/.osai/osai.db.backup.<timestamp> ~/.osai/osai.db
systemctl --user start osai
```

### 9.3 Docker rollback

```bash
# Откат к предыдущему образу
docker compose down
docker tag osai-osai:latest osai-osai:rollback
docker compose up -d

# Или откат к конкретному тегу
docker pull <registry>/osai:<previous-version>
docker compose up -d
```

---

## 10. Operational Checks

### 10.1 Post-deployment checklist

| Проверка | Команда | Ожидаемый результат |
|----------|---------|---------------------|
| Gateway запущен | `ps aux \| grep gateway` | Процесс active |
| WS порт открыт | `ss -tlnp \| grep 18789` | LISTEN на 127.0.0.1:18789 |
| CLI подключается | `npx osai status` | Статус: running |
| Dashboard доступен | `curl http://localhost:4173` | HTML response |
| SQLite работает | `sqlite3 ~/.osai/osai.db "SELECT 1"` | 1 |
| Qdrant работает | `curl http://localhost:6333/health` | ok (если настроен) |
| Prometheus | `curl http://localhost:9090/metrics` | Metrics output |
| Тесты проходят | `npm run test` | 1723 passed |

### 10.2 Health checks

```bash
# Проверка Gateway WS подключения
node -e "
  const ws = require('ws');
  const c = new ws('ws://127.0.0.1:18789');
  c.on('open', () => { console.log('Gateway: OK'); c.close(); });
  c.on('error', (e) => { console.error('Gateway: FAIL', e.message); process.exit(1); });
"

# Проверка SQLite
node -e "
  const Database = require('better-sqlite3');
  const db = new Database(process.env.HOME + '/.osai/osai.db');
  const r = db.prepare('SELECT 1 as ok').get();
  console.log('SQLite:', r.ok === 1 ? 'OK' : 'FAIL');
  db.close();
"
```

---

## 11. Monitoring and Observability

### 11.1 Structured Logging

osaI использует pino (JSON structured logging). Логи хранятся в `~/.osai/logs/` с автоматической ротацией (7 дней).

```bash
# Просмотр логов в реальном времени
journalctl --user -u osai -f

# Фильтрация по уровню
journalctl --user -u osai | grep '"level":30'  # info
journalctl --user -u osai | grep '"level":40'  # warn
journalctl --user -u osai | grep '"level":50'  # error
```

### 11.2 Prometheus Metrics

Метрики доступны на `http://127.0.0.1:9090/metrics` (конфигурируемый порт).

**Key metrics:**

| Метрика | Тип | Описание |
|---------|-----|----------|
| `osai_agent_llm_tokens_input` | Counter | Входящие токены LLM |
| `osai_agent_llm_tokens_output` | Counter | Исходящие токены LLM |
| `osai_agent_llm_cost_usd` | Counter | Стоимость API вызовов (USD) |
| `osai_agent_tool_call_total` | Counter | Количество tool вызовов |
| `osai_agent_tool_call_duration_ms` | Histogram | Длительность tool вызовов |
| `osai_agent_session_duration_ms` | Histogram | Длительность сессий |
| `osai_memory_query_duration_ms` | Histogram | Длительность RAG запросов |
| `osai_memory_entries_total` | Gauge | Количество записей в памяти |
| `osai_session_active` | Gauge | Активные сессии |

### 11.3 OpenTelemetry Traces

Traces покрывают agent loop, model inference, tool calls, memory queries.

Span hierarchy:
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

Экспортеры: Console, File, Jaeger/Zipkin, OTLP (конфигурируются в секции `observability` конфигурации).

### 11.4 Audit Log

Audit log -- иммутабельный (no DELETE/UPDATE), хранится в SQLite, доступен через REST API:

```bash
# Запрос audit log
curl http://127.0.0.1:18789/api/v1/observability/audit
```

### 11.5 Графический мониторинг (рекомендуемый стек)

Для production мониторинга рекомендуется:

```yaml
# Prometheus scrape config
scrape_configs:
  - job_name: 'osai'
    static_configs:
      - targets: ['127.0.0.1:9090']
    scrape_interval: 15s
```

---

## 12. Security Considerations for Deployment

### 12.1 API Keys

- API ключи хранятся в `~/.osai/openclaw.json` с permissions `0600`
- Никогда не логируются и не передаются третьим лицам
- Рекомендуется задавать через environment variables

### 12.2 Network Security

- Gateway WS server привязан к `127.0.0.1` (localhost only)
- Для удалённого доступа использовать Tailscale (E2E encryption)
- Не рекомендуется пробрасывать порт 18789 в публичную сеть

### 12.3 File Permissions

```bash
# Убедиться в корректных правах доступа
chmod 600 ~/.osai/openclaw.json
chmod 700 ~/.osai
ls -la ~/.osai/openclaw.json  # -rw-------
```

---

## 13. Troubleshooting

| Проблема | Возможная причина | Решение |
|----------|-------------------|---------|
| Gateway не запускается | Порт 18789 занят | `ss -tlnp \| grep 18789`, kill process |
| SQLite ошибки | Повреждение БД | Восстановить из бэкапа, WAL checkpoint |
| CLI не подключается | Gateway не запущен | Запустить Gateway первым |
| better-sqlite3 ошибка сборки | Нет C++ компилятора | `sudo apt install build-essential python3` |
| Qdrant unavailable | Docker не запущен | `docker start osai-qdrant` |
| Модель недоступна | API ключ невалиден / rate limit | Проверить ключ, проверить лимиты, Ollama fallback |
| Permission denied | Неверные права на ~/.osai | `chmod 700 ~/.osai && chmod 600 ~/.osai/openclaw.json` |

---

## 14. CI/CD Pipeline

### 14.1 GitHub Actions CI

Файл: `.github/workflows/ci.yml`

**Триггеры:** push на `main`, `OSAI-DEV`; pull_request на `main`, `OSAI-DEV`

**Matrix:** Node.js 20, 22

**Steps:** checkout -> setup node -> npm ci -> lint -> typecheck -> test -> build

### 14.2 GitHub Actions Release

Файл: `.github/workflows/release.yml`

**Триггеры:** push tag `v*`

**Steps:** checkout -> setup node -> npm ci -> lint -> typecheck -> test -> build -> npm publish

---

*End of Deployment Guide v1.0*
*Generated: 2026-03-25*
*Based on verified system: System Quality Score 9.31/10*
