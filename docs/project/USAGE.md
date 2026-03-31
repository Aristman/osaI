# Usage Guide -- osaI v3

**Дата:** 2026-03-31
**Версия:** 3.0.0

---

## Installation

### Предварительные требования

| Зависимость | Версия | Обязательность |
|---|---|---|
| Node.js | 22.16+ LTS / 24 | Обязательно |
| pnpm | 9+ | Обязательно |
| Python | 3.11+ | Для Telegram Userbot |
| Ollama | Последняя | Настоятельно рекомендуется |
| Docker | Последняя | Опционально (sandbox) |

### Установка из исходного кода

```bash
# Клонировать репозиторий
git clone <repo-url> osai
cd osai

# Установить зависимости
pnpm install

# Собрать все пакеты
pnpm build

# Первоначальная настройка (создаёт ~/.osai/)
pnpm --filter @osai/cli start init
```

### Запуск

```bash
# Запустить gateway (WebSocket server + agent runtime)
pnpm --filter @osai/gateway start start

# В другом терминале: запустить CLI
pnpm --filter @osai/cli start -- chat

# Или: интерактивный режим
pnpm --filter @osai/cli start
```

---

## Configuration

### Конфигурационный файл

Основной файл: `~/.osai/osai.json`

Команда `osai init` создаёт директорию `~/.osai/` с конфигурацией по умолчанию.

### Структура конфигурации

```jsonc
{
  "agent": {
    "model": "z-ai/z-best",
    "failoverChain": ["z-ai/z-best", "yandex/yandexgpt-pro", "anthropic/claude-opus-4-6", "openai/gpt-4o", "ollama/llama3"],
    "circuitBreaker": {
      "failureThreshold": 5,
      "resetTimeoutMs": 30000
    }
  },
  "providers": {
    "z-ai": {
      "type": "openai-compat",
      "baseUrl": "https://api.z.ai/api/paas/v4",
      "apiKey": "<YOUR_API_KEY>",
      "model": "glm-5"
    },
    "yandex": {
      "type": "yandex-foundation",
      "catalogId": "<CATALOG_ID>",
      "apiKey": "<YOUR_API_KEY>",
      "model": "yandexgpt-pro"
    },
    "anthropic": {
      "type": "anthropic",
      "apiKey": "<YOUR_API_KEY>"
    },
    "openai": {
      "type": "openai",
      "apiKey": "<YOUR_API_KEY>"
    },
    "ollama": {
      "type": "ollama",
      "baseUrl": "http://localhost:11434",
      "model": "llama3"
    }
  },
  "memory": {
    "embeddings": {
      "default": "ollama",
      "ollama": { "model": "nomic-embed-text" },
      "fallback": "yandex"
    },
    "vectorStorage": {
      "default": "sqlite-vec",
      "qdrant": { "url": "http://localhost:6333" }
    },
    "rag": { "topK": 5, "minSimilarity": 0.7 }
  },
  "security": {
    "sandbox": {
      "allowedDirs": ["~/projects", "~/documents", "/tmp/osai"],
      "blockedPatterns": ["~/.ssh/**", "~/.gnupg/**", "/etc/**", "/boot/**"]
    },
    "shell": {
      "blockedCommands": ["rm -rf /", "mkfs", ...],
      "timeout": 120
    }
  },
  "skills": {
    "allowBundled": true,
    "entries": {
      "filesystem": { "enabled": true },
      "shell": { "enabled": true },
      "memory": { "enabled": true },
      "knowledge-base": { "enabled": true },
      "chat-management": { "enabled": true },
      "os-integration": { "enabled": true }
    }
  }
}
```

### Переменные окружения

| Переменная | Описание |
|---|---|
| `OSAI_HOME` | Путь к директории конфигурации (по умолчанию `~/.osai`) |
| `OSAI_CONFIG` | Путь к конфигурационному файлу (по умолчанию `$OSAI_HOME/osai.json`) |
| `OSAI_LOG_LEVEL` | Уровень логирования pino (по умолчанию `info`) |

---

## CLI Commands

### Основные команды

```bash
osai                              # Интерактивный чат в текущем чате
osai "prompt text"                # Быстрое выполнение запроса
osai init                         # Первоначальная настройка (~/.osai/)
osai config                       # Показать/отредактировать конфигурацию
osai status                       # Системный статус (провайдеры, чаты, память)
```

### Chat Management

```bash
osai chat list                    # Список всех чатов
osai chat create "name"           # Создать новый чат
osai chat switch <id>             # Переключиться на чат
osai chat delete <id>             # Удалить чат (удаляет локальные сообщения)
osai chat archive <id>            # Архивировать чат (освобождает лимит активных)
```

До 20 активных чатов. Переключение сохраняет контекст исходного и загружает контекст целевого чата.

### Session Management

```bash
osai session list                 # Список сессий
osai session resume <id>          # Возобновить сессию
```

### Skills Management

```bash
osai skills list                  # Список зарегистрированных навыков
```

Навыки включаются/отключаются через конфигурационный файл (`osai.json` -> `skills.entries`).

### Memory Search

```bash
osai memory search "query"        # Семантический поиск по долговременной памяти
```

### Channel Management

```bash
osai channel add telegram         # Настройка Telegram канала
```

---

## Chat Management

### Создание чата

Чат создаётся через CLI или автоматически при первом сообщении в новом контексте. Каждый чат имеет:

- `id` -- уникальный идентификатор
- `name` -- название
- `description` -- описание
- `tags` -- теги
- `icon`, `color` -- визуальные параметры
- `channel` -- канал подключения
- `channelMetadata` -- метаданные канала
- `isActive` -- флаг активности

### Переключение чатов

При переключении (`osai chat switch <id>`):
1. Сохраняется контекст текущего чата
2. Загружается история сообщений целевого чата
3. Восстанавливается состояние сессии
4. Hook `on_chat_switch` уведомляет все подключённые каналы

### Архивирование

Неактивные чаты можно архивировать. Это освобождает лимит активных чатов (20). Сообщения архивированного чата сохраняются в SQLite и могут быть восстановлены.

---

## Skills Usage

### Filesystem

Агент автоматически использует Filesystem skill при необходимости работы с файлами. Разрешения:

- **read** (read_file, list_dir, search_files, get_file_info) -- выполняется автоматически
- **write** (write_file, move_file, delete_file) -- требует подтверждения пользователя

Файлы ограничены `allowed_dirs` из конфигурации. Блокируются пути по `blockedPatterns` (`~/.ssh/**`, `~/.gnupg/**`, `/etc/**`, `/boot/**`).

### Shell

Shell-команды всегда требуют подтверждения. Блокируются опасные команды (`rm -rf /`, `mkfs` и т.д.). Таймаут выполнения: 120 секунд.

### Memory

Агент может запоминать, извлекать и забывать факты через Memory skill:

- **remember** -- сохранить факт в долговременную память
- **recall** -- найти релевантные записи по запросу
- **forget** -- удалить запись из памяти
- **summarize_session** -- суммировать текущую сессию

Факты хранятся в Long-term Memory (shared для всех чатов).

### Knowledge Base

- **ingest_document** -- загрузить документ в базу знаний (txt, md, pdf)
- **query_knowledge** -- семантический поиск по базе знаний
- **list_sources** -- список загруженных источников
- **remove_source** -- удалить источник и его чанки

База знаний доступна из любого чата (shared). Документы разбиваются на чанки (1024 tokens, overlap 128), эмбеддятся и сохраняются в sqlite-vec.

---

## Memory Commands

### Через CLI

```bash
osai memory search "query"        # Поиск по долговременной памяти
```

### Через чат (агент)

Агент автоматически использует RAG при обработке запросов:

1. Пользовательское сообщение эмбеддится
2. Векторный поиск в sqlite-vec (top_k=5, similarity > 0.7)
3. Релевантные записи инжектируются в system prompt
4. После ответа агента -- автоматическое извлечение фактов в Long-term Memory

Три уровня памяти:

| Уровень | Область | Время жизни |
|---|---|---|
| Chat Memory | Per-chat сообщения и контекст | Жизненный цикл чата |
| Session Memory | Tool results, session state | Жизненный цикл сессии |
| Long-term Memory | Факты, предпочтения, знания (shared) | Постоянно (до `forget()`) |

---

## Telegram Integration

### Настройка Telegram Bot

1. Создать бота через @BotFather в Telegram
2. Получить API token
3. Настроить в `osai.json`:

```jsonc
{
  "channels": {
    "telegram": {
      "bot": {
        "enabled": true,
        "token": "<BOT_TOKEN>",
        "allowedUsers": ["<YOUR_TELEGRAM_ID>"]
      }
    }
  }
}
```

Команды бота: `/chat`, `/memory`, `/status`, `/help`

### Настройка Telegram Userbot

Требуется Python 3.11+, библиотека Telethon.

1. Получить API ID и Hash на https://my.telegram.org
2. Настроить в `osai.json`:

```jsonc
{
  "channels": {
    "telegram": {
      "userbot": {
        "enabled": true,
        "apiId": 12345,
        "apiHash": "<API_HASH>",
        "phone": "+79991234567"
      }
    }
  }
}
```

3. При первом запуске -- ввести код авторизации через CLI

Userbot работает как Python microservice через child_process. Session хранится в зашифрованном виде (AES-256) в `~/.osai/channels/telegram/session/`.

### Mirror (bidirectional sync)

```jsonc
{
  "channels": {
    "telegram": {
      "mirrors": [
        {
          "chatId": "<osai_chat_id>",
          "telegramChatId": -1001234567890,
          "direction": "both"
        }
      ]
    }
  }
}
```

Направления: `both` | `osai-to-tg` | `tg-to-osai`. Markdown-форматирование сохраняется. Медиа -- best-effort.

---

## Operational Notes

### Данные

Все данные хранятся в `~/.osai/`:

| Путь | Содержимое |
|---|---|
| `~/.osai/osai.json` | Конфигурация |
| `~/.osai/data/osai.db` | SQLite БД (чаты, сообщения, память, аудит) |
| `~/.osai/logs/` | Логи (pino JSON) |
| `~/.osai/channels/telegram/session/` | Telegram session (encrypted) |
| `~/.osai/workspace/skills/` | Пользовательские SKILL.md |

### Graceful Degradation

При недоступности компонентов система деградирует корректно:

| Сценарий | Поведение |
|---|---|
| Все cloud LLM недоступны | Переключение на Ollama (local) |
| Ollama недоступна | Чаты и CLI доступны, без LLM ответов |
| Vector storage недоступна | Система работает без RAG |
| Docker недоступен | Sandbox mode отключён, только permission prompts |
| Telegram userbot ошибка | Fallback на bot-only mode |

---

## Docker

### Сервисы

| Сервис | Порт | Назначение |
|---|---|---|
| ollama | 11434 | Локальный LLM (llama3) + эмбеддинги (nomic-embed-text) |
| qdrant | 6333 | Векторная БД (опционально, альтернатива sqlite-vec) |
| gateway | 18789 | osai WebSocket сервер + Agent Runtime |

### Команды

```bash
pnpm docker:build     # Собрать образ gateway
pnpm docker:up       # Запустить все сервисы (ollama + qdrant + gateway)
pnpm docker:setup    # Загрузить модели LLM (llama3, nomic-embed-text)
pnpm docker:logs     # Логи gateway
pnpm docker:down     # Остановить сервисы
pnpm docker:clean    # Остановить + удалить volumes (сброс данных)
```

### Первый запуск

```bash
# 1. Убедитесь что Docker Desktop запущен
# 2. Собрать и запустить
pnpm docker:build
pnpm docker:up

# 3. Загрузить модели (один раз, ~8 ГБ)
pnpm docker:setup

# 4. Инициализация конфигурации (локально)
pnpm --filter @osai/cli init

# 5. Запуск CLI (локально, подключается к gateway в Docker)
pnpm --filter @osai/cli start
```

Данные сервисов хранятся в Docker volumes: `ollama-data`, `qdrant-data`, `osai-data`. Для GPU passthrough раскомментируйте блок `deploy.resources` в `docker-compose.yml`.

---

## Troubleshooting

### Сборка

```bash
# Ошибка: не найден модуль better-sqlite3
# Решение: убедитесь в наличии C++ toolchain
# Linux: sudo apt install build-essential python3
# Windows: Visual Studio Build Tools

pnpm build                  # Полная пересборка
pnpm clean && pnpm build    # Сборка с очисткой
```

### Тесты

```bash
pnpm test                   # Запуск всех тестов
pnpm test:watch             # Watch mode (разработка)
pnpm test:coverage          # С отчётом о покрытии
```

### Запуск Ollama

```bash
# Установить Ollama (https://ollama.ai)
ollama serve                # Запустить сервер
ollama pull llama3          # Загрузить модель LLM
ollama pull nomic-embed-text  # Загрузить модель эмбеддингов
```

### Логи

Логи выводятся в stdout (structured JSON, pino) и в файл `~/.osai/logs/`. Уровень логирования настраивается через переменную окружения `OSAI_LOG_LEVEL`.

---

**Версия документа:** v1.0
**Источник:** ARCHITECTURE_OVERVIEW.md, TECH_REQUIREMENTS.md, SCOPE.md, SYSTEM_VERIFICATION.md
