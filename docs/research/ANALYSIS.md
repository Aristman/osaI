# Analysis

**Версия:** v1.0
**Дата:** 2026-03-27
**Предмет:** Исследование OpenClaw как основы проекта osaI

---

## 1. Problem Statement

### 1.1 Задача исследования

Запрошено глубокое исследование документации OpenClaw по 10 тематическим направлениям (Gateway, Agent Runtime, Skills, Canvas/A2UI, Configuration, Browser Control, Docker Sandbox, Nodes, Model Failover, Plugin System) для создания технической спецификации проекта osaI на базе OpenClaw.

### 1.2 Критическая находка: OpenClaw не найден в публичных источниках

Проведено более 30 поисковых запросов с различными вариациями:
- Прямые запросы: "openclaw", "OpenClaw", "open-claw"
- С указанием автора: "Peter Steinberger openclaw", "steipete openclaw"
- С указанием файлов: "openclaw.json", "SKILL.md", "ClawHub"
- С указанием домена: "docs.openclaw.ai", "github.com/openclaw"
- С поиском по ключевым терминам: "A2UI", "Pi Agent", "ClawHub"
- Поиск по социальным платформам: Reddit, Hacker News, Twitter
- Поиск с ограничением по GitHub: site:github.com

**Результат: ноль совпадений.** Ни один из запросов не вернул результатов, относящихся к проекту "OpenClaw".

### 1.3 Что это означает

Существует несколько возможных объяснений:

1. **Проект является гипотетическим/планируемым.** Вся информация об OpenClaw в текущем проекте osaI (спецификация `spec_osai_openclaw_2026-03-24.md`) могла быть сгенерирована AI-агентом (Specification Generator Skill v2, как указано в конце спецификации) как концептуальная основа, а не как описание реально существующего проекта.

2. **Проект находится в закрытом/приватном доступе.** Возможна приватная разработка, недоступная через поисковые движки.

3. **Проект не существует.** Наименование "OpenClaw", авторство "Peter Steinberger", URL `https://github.com/openclaw/openclaw` и `https://docs.openclaw.ai` -- всё это не имеет подтверждений в реальности на момент исследования (март 2026).

---

## 2. Context Overview

### 2.1 Источники информации внутри проекта

Единственным источником сведений об OpenClaw является файл спецификации проекта:
- `/home/aristman/projects/osai/docs/specs/spec_osai_openclaw_2026-03-24.md` -- создан 2026-03-24, автор "Aristman", статус "Черновик"
- В конце файла указано: "Создано: Specification Generator Skill (v2)"
- Начальный промпт для генерации: `/home/aristman/projects/osai/docs/research/start_prompt.md`

### 2.2 Характер информации об OpenClaw в спецификации

Вся информация об OpenClaw в спецификации носит характер **описания архитектуры и возможностей**, а не ссылок на конкретную документацию, API reference, или исходный код. Ключевые наблюдения:

- Нет прямых цитат из документации OpenClaw
- Нет ссылок на конкретные файлы/коммиты в репозитории
- Нет версионирования OpenClaw (указание конкретной версии)
- Архитектурные решения описаны на концептуальном уровне
- Технические детали (формат SKILL.md, openclaw.json схема, WS protocol) -- выглядят как **проектируемые**, а не документированные

### 2.3 Стейкхолдеры

- Разработчик проекта (Aristman) -- один человек, solo developer
- Целевая аудитория -- не определена (указан local-first, один пользователь)

---

## 3. Goals and Success Indicators

### 3.1 Чего ожидалось

Получить конкретные технические детали по 10 разделам архитектуры OpenClaw на основе:
- Официальной документации (docs.openclaw.ai)
- README GitHub репозитория (github.com/openclaw/openclaw)
- GitHub docs папок (architecture, security, skills и т.д.)

### 3.2 Что получено

Нулевое количество подтверждённых фактов об OpenClaw. Вся информация, которая могла бы быть использована, содержится только в сгенерированной спецификации проекта osaI и является **вторичной/производной**.

---

## 4. Constraints Identified

### 4.1 Информационные ограничения

| Ограничение | Влияние |
|---|---|
| OpenClaw не найден ни в одном публичном источнике | Невозможно верифицировать архитектурные решения, API, форматы данных |
| Единственный источник -- AI-сгенерированная спецификация | Риск галлюцинаций в описании OpenClaw |
| Нет доступа к исходному коду OpenClaw | Невозможно оценить реальную сложность форка |
| Нет открытого сообщества/экосистемы | "Проверенное сообщество и экосистема ClawHub" -- недоказуемо |

### 4.2 Архитектурные риски, вытекающие из ситуации

| Риск | Описание |
|---|---|
| Зависимость от несуществующего upstream | Fork проекта, который не существует или недоступен |
| Невозможность оценить объём форка | "~50k+ строк проверенного кода" -- неподтверждённая цифра |
| "20+ каналов из коробки" -- неподтверждено | Нет способа проверить наличие мессенджер-интеграций |
| ClawHub registry -- не существует | Marketplace для skills является частью проекта-фантазии |

---

## 5. Existing Solutions and Analogues

Хотя OpenClaw не найден, концепции, описанные в спецификации, имеют реальные аналоги:

### 5.1 Agent Runtime с hook-based extensibility

| Концепция в OpenClaw | Реальный аналог | Примечание |
|---|---|---|
| Agent loop (intake -> context -> inference -> tools -> stream -> persist) | Claude Code, Cline, Aider | Стандартный паттерн agentic loop |
| Hook points (before_model_resolve, before_tool_call, after_tool_call) | Claude Code hooks, LangGraph checkpoints | Жизненный цикл с hook points -- стандарт |
| Tool streaming + Block streaming | Claude Code streaming protocol, MCP | Streaming tool results через WS |

### 5.2 Skills System

| Концепция | Реальный аналог |
|---|---|
| SKILL.md -- markdown-описание, превращающееся в tool_schemas | Claude Code CLAUDE.md/skills, MCP tool definitions |
| Bundled / Managed / Workspace skills | NPM packages, VS Code extensions |
| ClawHub registry | NPM registry, VS Code Marketplace, Homebrew |
| Категории permissions (read=auto, write=confirm) | Claude Code permission system |

### 5.3 Gateway Architecture

| Концепция | Реальный аналог |
|---|---|
| WS Control Plane (ws://127.0.0.1:18789) | Claude Code daemon, MCP servers |
| Session Router / Queue | LangGraph session management |
| Multi-channel messaging | Mattermost, n8n webhook channels |

### 5.4 Docker Sandboxing

| Концепция | Реальный аналог |
|---|---|
| Docker containers для non-main sessions | OpenHands (OpenDevin) sandbox, E2B |
| Allowlist/denylist для tools | Claude Code permission settings |
| Resource limits (CPU, memory, network) | Docker resource constraints |

### 5.5 Model Failover

| Концепция | Реальный аналог |
|---|---|
| Chain: Claude -> GPT-4o -> Ollama | LiteLLM, OpenRouter, multiple LLM provider patterns |
| Auth Profile Rotation | API key rotation, load balancing |
| Circuit breaker pattern | Resilience4j, standard microservice pattern |

---

## 6. Risks and Uncertainties

### 6.1 Критические риски

| # | Риск | Вероятность | Влияние | Обоснование |
|---|---|---|---|---|
| R1 | **OpenClaw не существует как реальный проект** | **Высокая (85%)** | **Критичное** | 30+ поисковых запросов не дали результатов. URL github.com/openclaw/openclaw не найден. docs.openclaw.ai не найден. "Peter Steinberger openclaw" -- ноль результатов. Спецификация сгенерирована AI. |
| R2 | **Вся архитектура osaI базируется на несуществующей основе** | **Высокая (80%)** | **Критичное** | Если R1 подтверждён, спецификация osaI v2 требует полной переработки |
| R3 | **Инвестиции времени в форк несуществующего проекта** | **Высокая (75%)** | **Высокое** | Roadmap начинается с "Fork OpenClaw repository" |

### 6.2 Средние риски

| # | Риск | Вероятность | Влияние |
|---|---|---|---|
| R4 | Peter Steinberger действительно работает над приватным проектом с таким названием | Низкая (15%) | Среднее -- может быть доступен позже |
| R5 | Проект существует под другим названием | Средняя (30%) | Среднее -- потребуется идентификация и повторное исследование |
| R6 | Проект был удалён/переименован | Низкая (10%) | Среднее |

### 6.3 Риски, связанные с osaI (независимо от OpenClaw)

| # | Риск | Описание |
|---|---|---|
| R7 | Solo developer overload | Один разработчик для проекта такого масштаба |
| R8 | LLM API dependence | Зависимость от внешних API (Claude, GPT) |
| R9 | Security sandbox bypass | Агент может выполнить разрушительное действие |

---

## 7. Open Questions

### 7.1 Критические вопросы (требуют ответа ПЕРЕД продолжением работы)

| # | Вопрос | Почему критичен |
|---|---|---|
| Q1 | **Существует ли OpenClaw как реальный проект?** | От этого зависит вся стратегия разработки |
| Q2 | Если да, где находится исходный код и документация? | Необходимо для форка и изучения |
| Q3 | Если нет, была ли информация об OpenClaw получена из внешнего источника (кроме AI-генерации)? | Определяет уровень доверия к архитектуре |
| Q4 | Была ли предоставлена конкретная ссылка на OpenClaw внешним источником (статья, Tweet, рекомендация)? | Поможет найти реальный проект или подтвердить его отсутствие |
| Q5 | **Должен ли osaI базироваться на реальном форке, или допустимо построение с нуля по концепции?** | Стратегическое решение |

### 7.2 Технические вопросы (после разрешения критических)

| # | Вопрос |
|---|---|
| Q6 | Реальный объём работы по форку vs построению с нуля? |
| Q7 | Какие конкретно функции OpenClaw являются уникальными и отсутствуют в других open-source решениях? |
| Q8 | Обоснован ли выбор TypeScript/Node.js (vs Rust, Go, Python)? |
| Q9 | Обоснован ли выбор Qdrant (vs ChromaDB, sqlite-vec, LanceDB)? |
| Q10 | Какой реальный опыт команды с перечисленными технологиями? |

---

## 8. Assumptions

### 8.1 Подтверждённые факты

| # | Факт | Источник | Уверенность |
|---|---|---|---|
| F1 | В проекте osaI существует спецификация, описывающая OpenClaw как основу | Файл `spec_osai_openclaw_2026-03-24.md` | 100% |
| F2 | Спецификация была сгенерирована AI-агентом (Specification Generator Skill v2) | Указано в конце спецификации | 100% |
| F3 | Начальный промпт упоминает Claude Code / OpenClaw как "вдохновение", не как обязательную основу | Файл `start_prompt.md` строка 5 | 100% |
| F4 | Проект osaI находится на ветке OSAI-001, имеет два коммита | git log | 100% |

### 8.2 Рабочие гипотезы (требуют проверки)

| # | Гипотеза | Уверенность | Обоснование |
|---|---|---|---|
| H1 | OpenClaw не существует как публично доступный проект | **85%** | 30+ поисковых запросов без результатов. Аналогичные проекты (Claude Code, Cline) легко находятся по имени |
| H2 | Информация об архитектуре OpenClaw в спецификации является продуктом AI-генерации (галлюцинацией) | **75%** | Спецификация сгенерирована AI. Детали выглядят как проектирование, а не документация. Нет ссылок на конкретные файлы/коммиты |
| H3 | Название "OpenClaw" и авторство "Peter Steinberger" -- вымышленные атрибуты | **70%** | Peter Steinberger (steipete) -- реальный разработчик, но его проекты легко индексируются. Связи с "OpenClaw" не обнаружено |
| H4 | Концепции, описанные как "OpenClaw features", являются стандартными паттернами agentic AI | **90%** | Все описанные механизмы (agent loop, hooks, tool streaming, sandbox, failover) имеют реальные аналоги в Claude Code, LangChain/LangGraph, OpenHands |
| H5 | Проект может быть успешным без OpenClaw, используя реальные open-source компоненты | **80%** | Экосистема agentic AI (2025-2026) предоставляет все необходимые компоненты |

### 8.3 Предположения о намерениях

| # | Предположение | Уверенность |
|---|---|---|
| I1 | Разработчик (Aristman) верит, что OpenClaw -- реальный проект, на который можно опереться | **Низкая (30%)** -- если бы это было так, была бы предоставлена конкретная ссылка |
| I2 | Разработчик использует "OpenClaw" как концептуальную рамку для проектирования osaI | **Средняя (50%)** |
| I3 | Запрос на исследование подразумевал, что OpenClaw существует и документирован | **Высокая (80%)** -- формулировка вопроса предполагает наличие конкретных источников |

---

## 9. Детализация по запрошенным темам (на основе спецификации osaI)

Важно: все данные ниже взяты исключительно из AI-сгенерированной спецификации и **не верифицированы** по первичным источникам.

### 9.1 Gateway Architecture

Из спецификации:
- WS Control Plane на `ws://127.0.0.1:18789`
- Channel handlers: WhatsApp (Baileys), Telegram (grammY), Slack (Bolt SDK), Discord (discord.js), Signal (signal-cli), iMessage (apple-script)
- Session Router с поддержкой: Main Session (persistent), Group Sessions (isolated), Activation Modes (always, mention, wake word, passive)
- Queue Modes: Sequential, Parallel

**Статус:** Не верифицировано. Концептуально соответствует стандартным паттернам (MCP, Claude Code daemon).

### 9.2 Agent Runtime (Pi Agent)

Из спецификации:
- Agent Loop: intake -> context_assembly -> model_inference -> tool_execution -> streaming -> persistence
- 7 hook points: before_model_resolve, before_prompt_build, before_agent_start, before_tool_call, after_tool_call, agent_end, on_error
- tool_use loop с streaming
- Session persistence в SQLite

**Статус:** Не верифицировано. Паттерн agent loop с hooks -- стандартный в Claude Code и LangGraph.

### 9.3 Skills System

Из спецификации:
- Формат: SKILL.md (Markdown с секциями Tools, Permissions, Examples)
- 4 типа: Bundled (built-in), Managed (ClawHub), Workspace (~/.osai/workspace/skills/), osaI System (~/.osai/skills/)
- Skills преобразуются в tool_schemas для LLM
- Конфигурация в openclaw.json (skills section)

**Статус:** Не верифицировано. Формат SKILL.md не найден ни в одном проекте. Концептуально похоже на MCP tool definitions и Claude Code skill files.

### 9.4 Canvas / A2UI

Из спецификации:
- "Agent-driven visual workspace"
- Готовая визуальная рабочая область, наследуемая от OpenClaw
- Отнесено к V2 roadmap (Could Have)

**Статус:** Не верифицировано. Термин "A2UI" не найден ни в одном публичном источнике. Описание минимально -- невозможно оценить реальную функциональность.

### 9.5 Configuration (openclaw.json)

Из спецификации (фрагменты):
```json
{
  "skills": {
    "allowBundled": true,
    "extraDirs": ["~/.osai/workspace/skills", "~/.osai/skills"],
    "watch": true,
    "entries": { "filesystem": { "enabled": true }, ... }
  },
  "sandbox": {
    "enabled": true,
    "image": "osai/sandbox:latest",
    "allowlist": ["filesystem", "shell", "http"],
    "denylist": ["os-integration"],
    "resources": { "cpu_limit": "2", "memory_limit": "512m", "network": false }
  },
  "security": {
    "sandbox": { "allowedDirs": [...], "blockedPatterns": [...], ... },
    "shell": { "blockedCommands": [...], "timeout": 120, "logAll": true },
    "docker": { "image": "osai/sandbox:latest", ... }
  }
}
```

**Статус:** Не верифицировано. "Полная схема" openclaw.json неизвестна. Представлены только фрагменты.

### 9.6 Browser Control

Из спецификации:
- CDP (Chrome DevTools Protocol) для browser automation
- Chrome/Chromium как внешний компонент
- Skill "browser" с CDP automation
- Отнесено к V1 roadmap (Should Have)

**Статус:** Не верифицировано. CDP -- стандартный протокол, используемый в Playwright, Puppeteer, и других инструментах. Нет деталей интеграции.

### 9.7 Docker Sandboxing

Из спецификации:
- Main session выполняется на хосте с permission prompts
- Остальные сессии -- Docker-контейнеры
- Настройки: image, allowlist/denylist, resource limits (CPU, memory, network)
- Стандартная изоляция через Docker

**Статус:** Не верифицировано. Паттерн Docker sandbox -- стандартный (OpenHands/E2B используют аналогичный подход).

### 9.8 Nodes (Device Pairing)

Из спецификации:
- macOS/iOS/Android device pairing
- Tailscale для remote access (E2E encryption)
- Mobile -> Desktop через Tailscale

**Статус:** Не верифицировано. Детали pairing mechanism не описаны. Tailscale -- реальный продукт, но его интеграция с OpenClaw не подтверждена.

### 9.9 Model Failover

Из спецификации:
- Chain: Claude (primary) -> GPT-4o (fallback) -> Ollama (local)
- Обработка: 200 OK, 429 Rate Limit (wait+retry), 500 Error (fallback), Timeout (local fallback)
- Auth Profile Rotation: несколько API-ключей для одного провайдера
- Circuit breaker + exponential backoff

**Статус:** Не верифицировано. Стандартный паттерн multi-provider failover (аналоги: LiteLLM, OpenRouter).

### 9.10 Plugin System

Из спецификации:
- ClawHub -- registry для managed skills
- Plugin marketplace -- отнесено к V2 roadmap
- osaI plugins + ClawHub

**Статус:** Не верифицировано. ClawHub не найден ни в одном источнике. Детали plugin API не описаны.

---

## 10. Рекомендуемые следующие шаги

### 10.1 Критическое: разрешить статус OpenClaw

Перед продолжением работы над osaI необходимо:

1. **Подтвердить или опровергнуть существование OpenClaw** через:
   - Прямой доступ к `github.com/openclaw/openclaw` в браузере
   - Прямой доступ к `docs.openclaw.ai` в браузере
   - Связь с предполагаемым автором (Peter Steinberger / @steipete)

2. **Если OpenClaw не существует**, пересмотреть стратегию:
   - Вариант A: Построить osaI с нуля, заимствуя паттерны из реальных open-source проектов
   - Вариант B: Использовать реально существующий open-source agent framework (Cline, OpenHands, LangGraph)
   - Вариант C: Комбинировать несколько реальных проектов

3. **Если OpenClaw существует в приватном доступе**, получить доступ к коду и документации перед проектированием

### 10.2 Если строить без OpenClaw: реальный ландшафт

| Категория | Реальные проекты | Что можно заимствовать |
|---|---|---|
| Agent Loop + Hooks | Claude Code (Anthropic), LangGraph (LangChain) | Жизненный цикл агента, hook system, tool use protocol |
| Skills/Tools | MCP (Model Context Protocol), LangChain Tools | Формат определения tools, registry pattern |
| Browser Automation | Playwright, Puppeteer, Browser Use | CDP integration, action abstractions |
| Sandboxing | OpenHands/E2B, Docker SDK | Container lifecycle, resource limits |
| Multi-channel | n8n, Botpress | Мессенджер-интеграции |
| Memory + RAG | MemGPT, LangChain Memory, LlamaIndex | Vector storage, RAG pipeline |
| Observability | OpenTelemetry, LangSmith, Weave | Traces, metrics, evaluation |
| Configuration | cosmiconfig, convict | Config file parsing, validation |
| Model Failover | LiteLLM, OpenRouter | Multi-provider routing, key rotation |

---

## Вывод

Исследование OpenClaw не может быть завершено в запрошенном объёме, поскольку проект не найден ни в одном из 30+ поисковых запросов во всех доступных источниках. Все знания об архитектуре OpenClaw в текущем проекте являются производными от AI-сгенерированной спецификации, достоверность которой невозможно верифицировать.

**Рекомендуется**: прежде чем продолжать разработку osaI, критически важно установить реальный статус OpenClaw и, в случае его отсутствия, пересмотреть архитектурную стратегию проекта.
