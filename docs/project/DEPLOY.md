# Deployment Guide -- osaI v3

**Дата:** 2026-03-31
**Версия:** 3.0.0

---

## Prerequisites

| Зависимость | Минимальная версия | Назначение |
|---|---|---|
| Node.js | 22.16+ LTS / 24 | Runtime |
| pnpm | 9+ | Package manager |
| Python | 3.11+ | Telegram Userbot (Telethon) |
| Ollama | Последняя | Local LLM + embeddings (настоятельно рекомендуется) |
| Docker | Последняя | Sandbox для non-main sessions (опционально) |
| C++ toolchain | -- | Сборка native modules (better-sqlite3) |

### Установка runtime

```bash
# Node.js (рекомендуется через nvm)
nvm install 22
nvm use 22

# pnpm
corepack enable
corepack prepare pnpm@9 --activate

# Проверка
node --version   # >= 22.16.0
pnpm --version   # >= 9.0.0
```

### C++ toolchain (для native modules)

**Linux:**
```bash
sudo apt install build-essential python3
```

**Windows:**
Установить [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) с компонентом "Desktop development with C++".

---

## Build from Source

```bash
# 1. Клонировать
git clone <repo-url> osai
cd osai

# 2. Установить зависимости
pnpm install

# 3. Собрать (TypeScript compilation, 12 packages)
pnpm build

# 4. Запустить тесты (опционально)
pnpm test

# 5. Первоначальная настройка
pnpm --filter @osai/cli start init

# 6. Настроить провайдеры в ~/.osai/osai.json
# 7. Запустить
pnpm --filter @osai/gateway start start
```

### Структура сборки

```
pnpm build -> tsc --build
  Корневой tsconfig.json -> project references -> 12 пакетов
  Выход: packages/*/dist/ (ESM, .js extensions)
```

Сборка: 0 ошибок, TypeScript strict mode, ~239 .ts файлов.

---

## CI/CD (GitHub Actions)

CI конфигурация: `.github/workflows/ci.yml`

### Matrix build

```yaml
jobs:
  build:
    strategy:
      matrix:
        os: [ubuntu-latest, windows-latest]
        node-version: [22]
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node-version }}
          cache: pnpm
      - run: pnpm install
      - run: pnpm build
      - run: pnpm test
```

### Что проверяет CI

- `pnpm build` -- сборка всех 12 пакетов (0 ошибок)
- `pnpm test` -- unit + integration + E2E тесты (vitest)
- `pnpm lint` -- ESLint
- `pnpm typecheck` -- типизация без emit

---

## Cross-Platform Notes

### Linux (primary)

```bash
# Системные зависимости для desktop notifications
sudo apt install libnotify-bin

# Системные зависимости для system tray (V1)
sudo apt install libayatana-appindicator3-1

# Python для Telethon
sudo apt install python3 python3-pip python3-venv
pip install telethon
```

### Windows 10/11 (native)

Windows поддерживается нативно (не через WSL). Специфические замечания:

- **Native modules:** better-sqlite3 использует prebuild binaries. При отсутствии -- требуется Visual Studio Build Tools.
- **Notifications:** через Windows Toast Notifications API (node-notifier).
- **Paths:** все пути обрабатываются через `@osai/shared/platform.ts` (cross-platform утилиты).
- **SQLite:** WAL mode работает на Windows без ограничений.

### macOS

macOS **не является** целевой платформой для osaI v3. Поддержка не планируется.

---

## Environment Variables

| Переменная | По умолчанию | Описание |
|---|---|---|
| `OSAI_HOME` | `~/.osai` | Корневая директория osaI |
| `OSAI_CONFIG` | `$OSAI_HOME/osai.json` | Путь к конфигурационному файлу |
| `OSAI_LOG_LEVEL` | `info` | Уровень логирования (trace/debug/info/warn/error) |
| `OSAI_DB_PATH` | `$OSAI_HOME/data/osai.db` | Путь к SQLite базе данных |
| `OSAI_LOG_DIR` | `$OSAI_HOME/logs` | Директория для файлов логов |

---

## Directory Structure After Setup

```
~/.osai/
  osai.json                     # Конфигурация
  data/
    osai.db                     # SQLite БД (WAL mode)
  logs/
    osai.log                    # Ротируемые логи (pino JSON)
  channels/
    telegram/
      session/                  # Encrypted Telethon session (AES-256)
  workspace/
    AGENTS.md                   # Persona definition
    SOUL.md                     # Values definition
    skills/                     # Пользовательские SKILL.md файлы
```

---

## API Keys Configuration

API ключи настраиваются в `~/.osai/osai.json` в секции `providers`. Рекомендуется установить права доступа `600` на файл конфигурации:

```bash
chmod 600 ~/.osai/osai.json
```

API ключи **не логируются** (audit log и pino их исключают).

### Минимальная конфигурация для начала работы

```jsonc
{
  "providers": {
    "ollama": {
      "type": "ollama",
      "baseUrl": "http://localhost:11434",
      "model": "llama3"
    }
  },
  "memory": {
    "embeddings": {
      "default": "ollama",
      "ollama": { "model": "nomic-embed-text" }
    },
    "vectorStorage": {
      "default": "sqlite-vec"
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

Эта конфигурация требует только Ollama, запущенную локально. Все данные обрабатываются на машине пользователя (полностью offline).

---

## Testing

### Запуск тестов

```bash
pnpm test               # Все тесты (145 файлов, ~2498 tests)
pnpm test:watch         # Watch mode
pnpm test:coverage      # С отчётом о покрытии (v8)
```

### Уровни тестирования

| Уровень | Количество | Описание |
|---|---|---|
| Unit | 168+ | Изолированные тесты каждого модуля |
| Integration | 79 | Cross-module взаимодействие |
| E2E | 25 | Критичные сценарии (full request flow, failover, chat lifecycle) |

### Mock-сервер для тестов

E2E тесты используют in-memory SQLite и mock LLM server. Внешние зависимости не требуются.

---

## Monitoring (V1)

Мониторинг доступен начиная с V1 milestone:

- **OpenTelemetry traces** -- agent loop, model calls, tool executions
- **OpenTelemetry metrics** -- counters, histograms, gauges
- **Prometheus endpoint** -- `:9090`

В MVP доступен только pino structured logging и audit log.

---

**Версия документа:** v1.0
**Источник:** SYSTEM_VERIFICATION.md, SCOPE.md, TECH_REQUIREMENTS.md, package.json
