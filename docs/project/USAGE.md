# Usage: osaI -- Operation System AI

**Version:** v1.0
**Date:** 2026-03-25

---

## 1. Установка и настройка

### 1.1 Системные требования

| Требование | Версия | Обязательность |
|-----------|--------|----------------|
| Node.js | 20+ LTS | Обязательно |
| npm | 10+ | Обязательно |
| Git | Any | Обязательно |
| Docker | Any | Опционально (Qdrant, sandbox) |
| Chrome/Chromium | Any | Опционально (Browser skill) |
| Python 3 + build tools | Any | Для better-sqlite3 native compilation |

### 1.2 Установка из исходного кода

```bash
# Клонирование репозитория
git clone <repo-url> osai
cd osai

# Установка зависимостей всех workspace'ов
npm install

# Сборка всех пакетов
npm run build

# Проверка (lint + typecheck + test + build)
npm run ci
```

### 1.3 Инициализация

```bash
# Создание ~/.osai/ директории с конфигурацией по умолчанию
npx osai init
```

После инициализации создаётся следующая структура:

```
~/.osai/
├── openclaw.json          # Основной конфигурационный файл (0600 permissions)
├── workspace/
│   ├── AGENTS.md          # Системный промпт агента
│   ├── SOUL.md            # Персональность агента
│   └── skills/            # Пользовательские SKILL.md навыки
├── data/
│   └── osai.db            # SQLite база данных (WAL mode)
└── logs/
    ├── osai.log           # Structured logs (pino, JSON)
    └── telemetry.jsonl    # OTel telemetry export
```

### 1.4 Внешние зависимости (опционально)

**Qdrant** (для long-term memory и knowledge base):

```bash
# Автозапуск через Docker (если Docker доступен)
# osai автоматически запустит Qdrant при первой необходимости

# Или ручной запуск
docker run -d --name qdrant -p 6333:6333 qdrant/qdrant
```

**Ollama** (для local LLM fallback):

```bash
# Установка Ollama
curl -fsSL https://ollama.com/install.sh | sh

# Запуск модели
ollama pull llama3
ollama serve
```

---

## 2. CLI

### 2.1 Интерактивный чат

```bash
# Запуск интерактивного чата (TUI)
npx osai

# Или явная команда
npx osai chat
```

В интерактивном режиме доступны:
- Ввод сообщений в свободной форме
- Permission prompts для write/exec операций (y/N)
- Status bar с session id, model, token usage
- Streaming отображение ответов (TypeWriter effect)

### 2.2 Quick Command Mode

```bash
# Однократная команда (без интерактивного режима)
npx osai "покажи список процессов"
npx osai "прочитай файл ~/notes/todo.md"
npx osai "выполни git status в ~/projects/myapp"
```

### 2.3 Управление сессиями

```bash
# Список сессий
npx osai session list

# Резюмировать сессию по ID
npx osai session resume <session-id>

# Сессия main создаётся автоматически и персистентна
```

### 2.4 Конфигурация

```bash
# Показать текущую конфигурацию
npx osai config show

# Открыть конфигурационный файл в редакторе
npx osai config
```

### 2.5 Управление навыками

```bash
# Список доступных навыков
npx osai skills list

# Включить навык
npx osai skills enable browser

# Отключить навык
npx osai skills disable http
```

### 2.6 Память

```bash
# Семантический поиск в долгосрочной памяти
npx osai memory search "предпочтения пользователя"

# Статистика памяти
npx osai memory stats
```

### 2.7 Каналы

```bash
# Список каналов и их статус
npx osai channel list
```

### 2.8 Системный статус

```bash
# Общий статус системы
npx osai status
```

### 2.9 Прочие команды

```bash
# Информация о версии
npx osai version
```

---

## 3. Конфигурация (openclaw.json)

Файл: `~/.osai/openclaw.json` (file permissions: 0600)

### 3.1 Полная схема

```jsonc
{
  // ===== Gateway =====
  "gateway": {
    "host": "127.0.0.1",      // Адрес WS сервера
    "port": 18789               // Порт WS сервера
  },

  // ===== Model =====
  "model": {
    // Primary LLM провайдер
    "primary": {
      "provider": "anthropic",
      "model": "claude-sonnet-4-20250514",
      "apiKey": "sk-ant-..."
    },
    // Fallback цепочка
    "fallback": [
      {
        "provider": "openai",
        "model": "gpt-4o",
        "apiKey": "sk-..."
      },
      {
        "provider": "ollama",
        "model": "llama3",
        "endpoint": "http://localhost:11434"
      }
    ],
    // Auth profile rotation (несколько ключей для одного провайдера)
    "authProfiles": [
      { "provider": "anthropic", "apiKey": "sk-ant-key1" },
      { "provider": "anthropic", "apiKey": "sk-ant-key2" }
    ],
    // Circuit breaker
    "circuitBreaker": {
      "failureThreshold": 3,       // Кол-во ошибок до отключения
      "cooldownSeconds": 30        // Время восстановления
    },
    // Бюджет
    "budget": {
      "monthlyUsd": 50,            // Месячный бюджет ($)
      "alertThreshold": 0.8        // Порог предупреждения (80%)
    }
  },

  // ===== Session =====
  "session": {
    "persistence": true,           // Персистентность сессий
    "pruning": true,               // Автоматическое сжатие контекста
    "maxHistoryMessages": 100,     // Макс. сообщений в истории
    "queueMode": "sequential"      // "sequential" | "parallel"
  },

  // ===== Skills =====
  "skills": {
    "allowBundled": true,          // Загружать встроенные навыки
    "extraDirs": [                 // Дополнительные директории навыков
      "~/.osai/workspace/skills",
      "~/.osai/skills"
    ],
    "watch": true,                 // Hot-reload при изменении SKILL.md
    "entries": {
      "filesystem":    { "enabled": true },
      "shell":         { "enabled": true, "timeout": 120 },
      "browser":       { "enabled": false, "sandboxed": true },
      "http":          { "enabled": false, "timeout": 30 },
      "os-integration": { "enabled": true },
      "memory":        { "enabled": true },
      "knowledge-base": { "enabled": true }
    }
  },

  // ===== Security =====
  "security": {
    "sandbox": {
      "allowedDirs": ["~/projects", "~/documents", "/tmp/osai"],
      "blockedPatterns": [
        "~/.ssh/**", "~/.gnupg/**", "/etc/**",
        "/boot/**", "/proc/**", "/dev/**", "/sys/**"
      ],
      "autoApproveRead": true,     // Авто-одобрение read operations
      "resolveSymlinks": true      // Разрешение symlink'ов
    },
    "shell": {
      "blockedCommands": [
        "rm -rf /", "mkfs", "dd if=/dev/zero",
        "chmod -R 777 /", "> /dev/sda",
        ":(){ :|:& };:", "sudo rm -rf /"
      ],
      "timeout": 120,              // Таймаут shell команд (секунды)
      "logAll": true               // Логировать все команды
    },
    "docker": {
      "image": "osai/sandbox:latest",
      "cpuLimit": "2",
      "memoryLimit": "512m",
      "networkAccess": false
    }
  },

  // ===== Memory =====
  "memory": {
    "embeddingProvider": "auto",    // "auto" | "openai" | "ollama" | "onnx"
    "qdrantEndpoint": "http://localhost:6333",
    "ragTopK": 5,                  // Кол-во релевантных записей
    "similarityThreshold": 0.7,    // Порог похожести
    "chunkSize": 512,              // Размер чанка (токены)
    "chunkOverlap": 50,            // Перекрытие чанков (токены)
    "autoExtractFacts": true       // Авто-извлечение фактов
  },

  // ===== Observability =====
  "observability": {
    "tracesEnabled": true,
    "metricsEnabled": true,
    "samplingRate": 1.0,           // 1.0 (dev), 0.1 (prod)
    "exporters": {
      "console": true,
      "file": true,                // ~/.osai/logs/telemetry.jsonl
      "jaeger": { "endpoint": "http://localhost:14268" },
      "otlp": { "endpoint": "http://localhost:4318" }
    },
    "prometheus": {
      "enabled": true,
      "port": 9090
    },
    "logLevel": "info"             // error | warn | info | debug | trace
  },

  // ===== OS Integration =====
  "osIntegration": {
    "tray": true,
    "notifications": true,
    "fileWatcher": {
      "maxWatchedFiles": 100000
    }
  }
}
```

### 3.2 Приоритет конфигурации

1. CLI flags (highest priority)
2. Environment variables (`OSAI_GATEWAY_PORT`, `OSAI_MODEL_PRIMARY_PROVIDER`, etc.)
3. `~/.osai/openclaw.json`
4. Built-in defaults (lowest priority)

### 3.3 Hot Reload

| Секция | Hot Reload |
|--------|-----------|
| skills | Да (file watcher на SKILL.md) |
| observability | Да (sampling rate, log level) |
| session | Нет (требуется restart) |
| model | Нет (требуется restart) |
| gateway | Нет (требуется restart) |
| security | Нет (требуется restart) |

---

## 4. WebSocket Protocol

### 4.1 Подключение

```
ws://127.0.0.1:18789
```

### 4.2 Входящие сообщения (Client -> Gateway)

```typescript
// Пользовательское сообщение
{ type: "message", session_id: "main", content: "Привет, что ты умеешь?" }

// Управляющая команда
{ type: "command", command: "status" }

// Ответ на permission request
{ type: "permission_response", request_id: "req-123", decision: "approved" }

// Подписка на события
{ type: "subscribe", events: ["tool_call", "session_update"] }
```

### 4.3 Исходящие сообщения (Gateway -> Client)

```typescript
// Структурированный контент
{ type: "block", session_id: "main", block_type: "text", content: "Привет! Я osaI..." }

// Код-блок
{ type: "block", session_id: "main", block_type: "code", content: "console.log('hi')", language: "javascript" }

// Tool execution streaming
{ type: "tool_stream", session_id: "main", tool: "filesystem", action: "read_file", chunk: { "status": "reading", "path": "~/file.md" } }

// Permission request
{ type: "permission_request", request_id: "req-123", session_id: "main", tool: "filesystem", action: "write_file", params: { "path": "~/notes/test.md" }, risk_level: "medium" }

// Ошибка
{ type: "error", code: "MODEL_UNAVAILABLE", message: "Claude unavailable, switching to GPT-4o", severity: "medium" }

// Статус сессии
{ type: "status", session_id: "main", state: "processing" }
```

---

## 5. Web Dashboard

### 5.1 Доступ

Dashboard -- SPA (Single Page Application), подключается к Gateway через WebSocket.

```
http://localhost:18789 (или настраиваемый порт)
```

### 5.2 Routes

| Route | Описание |
|-------|----------|
| `/` | Chat area (основной интерфейс) |
| `/sessions` | Список сессий |
| `/sessions/:id` | Детали сессии (история сообщений) |
| `/traces` | Список agent traces |
| `/traces/:id` | Детали trace (tool calls, durations, tokens) |
| `/memory` | Поиск в долгосрочной памяти |
| `/memory/:id` | Детали записи памяти |
| `/settings` | Настройки конфигурации |
| `/status` | Системный статус (metrics, health) |

### 5.3 Функциональность

- **Chat Area** -- real-time чат с streaming ответами, отображение tool calls
- **Channel Sidebar** -- список сессий, индикаторы статуса каналов
- **Agent Trace View** -- хронологический список tool calls с длительностью, token usage, стоимостью
- **Permission Prompts** -- approve/deny для write/exec операций
- **Memory Search** -- семантический поиск с фильтрами по категориям
- **System Status** -- метрики (Prometheus), health indicators

---

## 6. Messaging Channels

### 6.1 Telegram

**Настройка:**

1. Создать бота через @BotFather и получить токен
2. Добавить токен в конфигурацию:

```json
{
  "channels": {
    "telegram": {
      "enabled": true,
      "botToken": "123456:ABC-DEF..."
    }
  }
}
```

3. Переслать сообщение боту для создания сессии

**Возможности:**
- Текстовые сообщения
- Медиа (фото, документы)
- Callback buttons
- Reconnection при обрыве соединения

### 6.2 WhatsApp

**Настройка:**

1. Добавить конфигурацию:

```json
{
  "channels": {
    "whatsapp": {
      "enabled": true
    }
  }
}
```

2. При первом запуске отобразится QR-code для авторизации

**Авторизация:**
- Сканировать QR-code через WhatsApp Web
- Сессия сохраняется для последующих подключений

**Возможности:**
- Текстовые сообщения
- Медиа (фото, документы, голосовые)
- Reconnection при обрыве

### 6.3 Channel Management

```bash
# Список каналов
npx osai channel list

# Управление через конфигурацию (channels секция в openclaw.json)
```

---

## 7. Skills System

### 7.1 Встроенные навыки (Bundled)

**Filesystem:**

| Tool | Category | Описание |
|------|----------|----------|
| `read_file` | read | Чтение файла с поддержкой offset/limit |
| `write_file` | write | Запись содержимого в файл |
| `list_directory` | read | Листинг директории (с рекурсией) |
| `search_files` | read | Поиск файлов по паттерну/glob |
| `move_file` | write | Перемещение/переименование файла |
| `delete_file` | write | Удаление файла/директории |

**Shell:**

| Tool | Category | Описание |
|------|----------|----------|
| `execute` | execute | Выполнение shell команды с timeout |

**Browser (CDP):**

| Tool | Category | Описание |
|------|----------|----------|
| `navigate` | execute | Переход по URL |
| `click` | execute | Клик по элементу |
| `fill` | write | Заполнение формы |
| `screenshot` | read | Скриншот страницы |

**HTTP:**

| Tool | Category | Описание |
|------|----------|----------|
| `GET/POST/PUT/DELETE` | execute | HTTP запросы к external API |

### 7.2 osaI-навыки

**OS Integration:**

| Tool | Описание |
|------|----------|
| `show_notification` | Desktop notification с urgency level |
| `watch_directory` | Мониторинг директории на изменения |
| `list_processes` | Список запущенных процессов |
| `open_application` | Запуск приложения |
| `get_system_info` | CPU, memory, disk информация |

**Memory:**

| Tool | Описание |
|------|----------|
| `remember` | Сохранить факт в долгосрочную память |
| `recall` | Семантический поиск по памяти |
| `forget` | Удалить запись из памяти |
| `summarize_session` | Суммаризировать текущую сессию |

**Knowledge Base:**

| Tool | Описание |
|------|----------|
| `ingest_document` | Индексация документа (chunking + embedding) |
| `query_knowledge` | Семантический поиск по базе знаний |
| `list_sources` | Список индексированных документов |
| `remove_source` | Удаление документа из базы знаний |

### 7.3 Пользовательские навыки (Workspace Skills)

Пользовательские навыки создаются в формате SKILL.md в `~/.osai/workspace/skills/`:

```markdown
# My Custom Skill
Краткое описание навыка.

## Tools

### my_tool
- Description: Что делает этот инструмент
- Category: read
- Parameters:
    - input: { type: "string", description: "Входные данные" }
- Returns: Результат выполнения

## Examples
User: "выполни мою кастомную операцию"
Assistant: [calls my_tool with input="..."]
```

Hot-reload: изменения в SKILL.md файлах автоматически подхватываются без restart.

### 7.4 Управление навыками

```bash
# Список всех навыков с статусом
npx osai skills list

# Включить навык
npx osai skills enable browser

# Отключить навык
npx osai skills disable http
```

---

## 8. Workspace

### 8.1 Файлы workspace

| Файл | Описание |
|------|----------|
| `~/.osai/workspace/AGENTS.md` | Системный промпт, определяющий поведение агента |
| `~/.osai/workspace/SOUL.md` | Персональность агента (имя, стиль общения) |
| `~/.osai/workspace/TOOLS.md` | Описание доступных инструментов |
| `~/.osai/workspace/skills/` | Пользовательские SKILL.md навыки |

### 8.2 AGENTS.md

Определяет системный промпт агента. Используется при context assembly. Может включать:
- Инструкции по поведению
- Правила использования инструментов
- Ограничения и предпочтения

### 8.3 SOUL.md

Определяет личность агента:
- Имя и роль
- Стиль общения
- Специфические знания и экспертиза

---

## 9. Observability

### 9.1 Structured Logging

Логи выводятся в JSON-формате (pino):

```json
{
  "level": "info",
  "time": 1709640000000,
  "trace_id": "abc-123",
  "session_id": "main",
  "component": "agent",
  "msg": "Agent loop completed",
  "duration_ms": 2450,
  "tokens_used": 320
}
```

### 9.2 Prometheus Metrics

Доступны на `http://localhost:9090/metrics` (если включено в конфигурации):

**Key Metrics:**
- `osai_agent_llm_tokens_input_total` -- суммарное число input токенов
- `osai_agent_llm_tokens_output_total` -- суммарное число output токенов
- `osai_agent_llm_cost_usd_total` -- суммарная стоимость ($)
- `osai_agent_tool_call_total` -- суммарное число tool вызовов
- `osai_agent_tool_call_errors_total` -- ошибки tool вызовов
- `osai_agent_session_duration_ms` -- длительность сессий (histogram)
- `osai_memory_entries_total` -- количество записей в памяти (gauge)
- `osai_session_active` -- количество активных сессий (gauge)

### 9.3 Audit Log

Иммутабельный журнал всех действий агента. Доступен через REST API:

```
GET /api/v1/observability/audit
```

Поля: id, session_id, timestamp, trace_id, action, tool_name, skill_name, params, result, user_decision, risk_level, sandbox_checked

**Audit log не имеет DELETE/UPDATE API** -- записи постоянны.

---

## 10. Операционные заметки

### 10.1 Системные сервисы

**Linux (systemd --user):**

```bash
# Установка автозапуска
npx osai service install

# Удаление
npx osai service uninstall
```

**macOS (launchd):**

```bash
# Установка автозапуска
npx osai service install
```

### 10.2 Graceful Shutdown

При получении SIGTERM/SIGINT система:
1. Прекращает принимать новые подключения
2. Завершает текущие agent loop итерации
3. Флушит данные в SQLite и Qdrant
4. Флушит OTel traces/metrics
5. Закрывает базу данных (WAL checkpoint)
6. Уничтожает tray icon, останавливает watchers
7. Закрывает WS сервер

### 10.3 Capability Detection

Система автоматически определяет доступные возможности:

| Capability | X11 Linux | Wayland Linux | macOS |
|-----------|-----------|---------------|-------|
| System Tray | Да | Нет (CLI-only) | Да |
| Notifications | Да | Ограниченно | Да |
| File Watcher | Да | Да | Да |
| Process Management | Да | Да | Да |

---

## 11. Troubleshooting

### 11.1 Частые проблемы

**better-sqlite3 build failure:**

```bash
# Убедитесь что установлены build tools
sudo apt install build-essential python3  # Debian/Ubuntu
sudo dnf install gcc gcc-c++ python3      # Fedora
xcode-select --install                    # macOS
```

**Qdrant unavailable:**

- Проверьте: `curl http://localhost:6333/collections`
- Убедитесь Docker запущен: `docker ps`
- Long-term memory будет недоступна (graceful degradation)

**Model API errors (429, 500):**

- Проверьте API ключи в `~/.osai/openclaw.json`
- Система автоматически переключается на fallback провайдер
- Проверьте бюджет: `osai status`
- Circuit breaker: при 3+ ошибках подряд провайдер отключается на 30с

**WebSocket connection refused:**

- Проверьте что Gateway запущен: `curl http://127.0.0.1:18789`
- Проверьте конфигурацию порта в openclaw.json
- Проверьте что порт не занят: `ss -tlnp | grep 18789`

**Systray не работает (Wayland):**

- systray2 поддерживает только X11
- Fallback: CLI-only режим (функциональность сохраняется)
- Проверьте: `echo $XDG_SESSION_TYPE`

**Permission prompt не отображается:**

- Убедитесь клиент подключён и активен
- Permission request отправляется всем подключённым клиентам
- Если ни один клиент не отвечает, операция таймаутится

### 11.2 Логи

| Тип | Путь | Формат |
|-----|------|--------|
| Application logs | `~/.osai/logs/osai.log` | JSON (pino) |
| OTel telemetry | `~/.osai/logs/telemetry.jsonl` | JSONL |
| SQLite DB | `~/.osai/data/osai.db` | Binary |

### 11.3 Полный CI пайплайн

```bash
# Запуск полной проверки (как в CI)
npm run ci
# Эквивалентно:
npm run lint && npm run typecheck && npm run test && npm run build
```

---

*End of Usage Document v1.0*
*Generated: 2026-03-25*
