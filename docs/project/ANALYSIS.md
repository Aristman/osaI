# Analysis

**Версия:** v1.0
**Дата:** 2026-03-30
**Проект:** osaI v3 -- AI Operating System
**Спецификация:** docs/specs/spec_osai_v3_2026-03-28.md
**Профиль:** docs/project/PROJECT_PROFILE.md

---

## 1. Problem Statement

### 1.1 Проблема

Пользователю нужен AI-ассистент, который превосходит типичный чат-бот (ChatGPT, Claude) по возможностям взаимодействия с операционной системой: управление файлами, браузером, shell, процессами, мессенджерами. Существующие решения либо ограничены текстовым чатом (ChatGPT, Claude), либо ориентированы только на код (Claude Code), либо требуют облачного бэкенда (OpenAI, Perplexity).

### 1.2 Почему эта проблема существует

- Рынок personal AI assistants не предлагает решения с полной OS-интеграцией при local-first подходе
- Облачные AI-сервисы не могут управлять локальной файловой системой и процессами из соображений безопасности
- Существующие open-source решения (Open Interpreter, AutoGPT) не обеспечивают стабильный multi-channel доступ, глубокую память и OS-native интеграцию

### 1.3 Подход osaI

osaI v3 решает проблему через форк OpenClaw (hypothetical open-source AI assistant) с расширениями: мультичаты, Telegram userbot, глубокая память с RAG, OS-интеграция, локальный голосовой стек. Все данные хранятся локально на машине пользователя (local-first).

---

## 2. Context Overview

### 2.1 Домен

Проект находится на пересечении нескольких доменов:
- **Personal AI Assistants** -- агенты, выполняющие задачи от имени пользователя
- **Operating System Integration** -- взаимодействие AI с файловой системой, процессами, desktop
- **Multi-channel Communication** -- единый AI через мессенджеры, CLI, веб
- **Voice Interfaces** -- локальное распознавание и синтез речи
- **RAG (Retrieval-Augmented Generation)** -- семантический поиск по памяти и базе знаний
- **Multi-provider LLM Orchestration** -- управление несколькими LLM-провайдерами с failover

### 2.2 Стейкхолдеры

| Стейкхолдер | Роль | Интересы |
|---|---|---|
| Конечный пользователь | Пользователь osaI | Стабильность, безопасность, приватность, удобство |
| Разработчик (solo) | Автор и мейнтейнер | Поддерживаемость, модульность, скорость разработки |
| OpenClaw upstream | Базовый проект | Совместимость, возможность мерджа upstream изменений |
| Telegram | Платформа мессенджера | Соблюдение ToS, отсутствие спама |
| LLM провайдеры | Z.ai, Yandex, Anthropic, OpenAI | Корректное использование API, оплата |
| Open-source сообщество | Пользователи и контрибьюторы | MIT License, документация, расширяемость |

### 2.3 Предположения о среде

- Целевые платформы: Linux (основная), Windows 10/11 (нативная)
- macOS НЕ является целевой платформой
- Node.js 22.16+ LTS или 24 установлен на целевых машинах
- Docker доступен для sandbox-изоляции (не на всех машинах)
- Ollama установлен для локальных LLM, embeddings, voice
- Интернет-соединение доступно для cloud LLM провайдеров, но не обязательно (Ollama как фолбэк)

---

## 3. Goals and Success Indicators

### 3.1 Цели (high-level)

- Создать локально работающий AI-ассистент с полным OS-управлением
- Обеспечить multi-channel доступ: CLI, Telegram (bot + userbot), веб
- Реализовать глубокую структурированную память с RAG
- Поддерживать до 20 независимых чатов с общей долговременной памятью
- Обеспечить локальный голосовой стек (STT/TTS) с фолбэком на облако
- Предоставить кроссплатформенную поддержку (Linux + Windows)

### 3.2 Индикаторы успеха

- Система работает полностью локально без интернета (с Ollama)
- Все 5 LLM провайдеров подключены с рабочим failover
- Telegram mirror обеспечивает двустороннюю синхронизацию без потери сообщений
- RAG-поиск возвращает релевантные результаты (similarity > 0.7)
- Security model (7 слоёв) предотвращает несанкционированные действия
- Один пользователь может управлять системой через CLI и Telegram одновременно

---

## 4. Constraints Identified

### 4.1 Бизнес-ограничения

- **Solo developer** -- один разработчик ограничивает скорость и объём работ
- **Open-source (MIT)** -- нет коммерческого бюджета, все затраты на API ложатся на пользователя
- **No cloud backend** -- архитектура строго local-first, все данные на машине пользователя
- **No subscription/billing** -- нет встроенной монетизации
- **One user per installation** -- нет системы аккаунтов и аутентификации

### 4.2 Организационные ограничения

- **Зависимость от upstream (OpenClaw)** -- 80% кода наследуется, breaking changes upstream могут требовать значительной адаптации
- **Python dependency (Telethon)** -- введение второго языка runtime увеличивает сложность деплоя и CI
- **Нет конкретных дедлайнов** -- отсутствие временных рамок может привести к затягиванию

### 4.3 Платформенные ограничения

- **Linux-only primary** -- Linux основная платформа, Windows нативная поддержка требует дополнительного тестирования
- **macOS не поддерживается** -- сужение аудитории
- **Docker required for sandbox** -- не все пользовательские машины имеют Docker
- **Native modules (better-sqlite3, systray2)** -- требуют C++ toolchain для сборки, потенциальные проблемы на Windows
- **Qdrant embedded на Windows** -- рискованная поддержка, нужен фолбэк на sqlite-vec

### 4.4 Технологические ограничения

- **Z.ai -- неизвестный провайдер** -- в открытых источниках нет подтверждённой информации о существовании провайдера "Z.ai" с OpenAI-совместимым API. Это критический риск для проекта, т.к. Z.ai заявлен как primary LLM-провайдер
- **Ollama не поддерживает STT/TTS напрямую** -- Ollama сфокусирован на LLM и embeddings. Whisper и Piper TTS не являются моделями Ollama. Необходима отдельная инфраструктура для STT/TTS (whisper.cpp, Piper как отдельные процессы)
- **Qdrant не имеет embedded mode для Node.js** -- Qdrant core написан на Rust, embedded mode доступен только для Rust и Python. В Node.js используется REST/gRPC клиент, требующий запущенного Qdrant сервера
- **Многоязыковая зависимость** -- Telethon (Python) работает как отдельный microservice через child_process, что усложняет lifecycle management

---

## 5. Existing Solutions and Analogues

### 5.1 OpenClaw (базовый проект)

**Факт:** Поиск по всем доступным источникам (включая GitHub, npm, веб) не обнаружил реального проекта "OpenClaw" от Peter Steinberger. Проект с таким именем, 100k+ звёздами, MIT License, спонсорством OpenAI и Vercel не найден.

**Варианты интерпретации:**
- Проект является вымышленным (fictional) -- создан для спецификации как гипотетический upstream
- Проект существует под другим названием
- Проект ещё не опубликован (stealth mode)

**Влияние на анализ:** Все ссылки на архитектуру OpenClaw (Gateway, Pi Agent Runtime, Skills System, Session Model, Activation Modes, Docker Sandboxing, ClawHub, Canvas/A2UI, Device Nodes, Voice, Config) являются частью спецификации и не могут быть верифицированы через публичные источники.

### 5.2 Аналогичные системы

| Система | Подход | Сходство с osaI | Отличия |
|---|---|---|---|
| **Open Interpreter** | Локальный AI-ассистент с shell/file доступом | OS-интеграция, tool execution | Нет multi-channel, нет памяти, нет мультичатов |
| **AutoGPT** | Автономный AI-агент | Tool execution, loop | Облачный, нестабильный, нет UI |
| **Claude Code** | CLI AI-ассистент для кода | CLI, tool execution | Только код, нет OS-интеграции, нет мультичатов |
| **Jan.ai** | Локальный AI-ассистент | Local-first, Ollama | Нет OS-интеграции, нет мессенджеров |
| **AnythingLLM** | RAG-платформа | База знаний, embeddings | Нет OS-интеграции, нет мультичатов, нет voice |
| **Home Assistant** | Умный дом | Voice (Piper), local-first | Другой домен (IoT, не OS management) |

### 5.3 LLM провайдеры -- аналоги

| Провайдер | Статус | Комментариий |
|---|---|---|
| **Z.ai** | Не найден в открытых источниках | Критический неопределённый провайдер. Возможные альтернативы: xAI (Grok), OpenRouter, Groq, Fireworks AI |
| **Yandex Foundation Models** | Реальный сервис | YandexGPT Pro/Lite, Embeddings, SpeechKit STT/TTS. Документация преимущественно на русском языке |
| **Anthropic Claude** | Реальный сервис | Зрелый API, но не OpenAI-совместимый. Требуется адаптер для унификации |
| **OpenAI GPT** | Реальный сервис | Стандарт de-facto, OpenAI-совместимый API. GPT-4o как модель |
| **Ollama** | Реальный проект | Локальный LLM runtime. Поддерживает embeddings (nomic-embed-text). НЕ поддерживает STT/TTS напрямую |

### 5.4 Векторные БД -- аналоги

| Система | Embedded для Node.js | Комментарий |
|---|---|---|
| **Qdrant** | Нет (REST client только) | Требует запущенный сервер. Embedded mode есть для Rust/Python |
| **sqlite-vec** | Да (через better-sqlite3) | Векторный поиск прямо в SQLite. Поддерживает float32, cosine/L2/IP |
| **LanceDB** | Да (нативная поддержка) | Rust-based, есть Node.js binding |
| **Vectra** | Да (SQLite-based) | Написан на TypeScript, простой API |
| **Orama** | Да (in-process) | Full-text + vector, полностью in-memory или persistent |

### 5.5 Telegram фреймворки -- аналоги

| Фреймворк | Язык | Тип | Комментарий |
|---|---|---|---|
| **grammY** | TypeScript | Bot | Зрелый, типобезопасный, plugin-архитектура, Bot API 8.x |
| **Telethon** | Python | Userbot | MTProto API, full user capabilities, asyncio, MIT License |
| **Pyrogram** | Python | Userbot/Bot | Альтернатива Telethon, менее активно развивается |
| **Baileys** | TypeScript | Userbot (WhatsApp) | Для WhatsApp, не для Telegram |

### 5.6 Voice стек -- аналоги

| Компонент | Решение | Статус |
|---|---|---|
| **STT** | Whisper (openai-whisper, whisper.cpp, faster-whisper) | Зрелый, 99+ языков, работает локально |
| **TTS** | Piper (ONNX runtime) | Зрелый, 30+ языков, CPU-friendly, используется в Home Assistant |
| **STT via Ollama** | НЕ поддерживается | Ollama не имеет audio endpoint. Требуется отдельный процесс |
| **TTS via Ollama** | НЕ поддерживается | Piper не интегрирован в Ollama. Требуется отдельный процесс |
| **SpeechKit** (Yandex) | Cloud STT/TTS | Реальный сервис, RU + EN, высокая стоимость |

---

## 6. Risks and Uncertainties

### 6.1 Критические риски

#### R1: Z.ai -- несуществующий или недоступный провайдер

- **Описание:** Z.ai заявлен как primary LLM-провайдер, но не найден в открытых источниках. Если провайдер не существует или недоступен, это разрушает основную цепочку failover
- **Вероятность:** Высокая (80%)
- **Влияние:** Критическое -- основной провайдер недоступен
- **Митигация (для анализа, не решение):** Необходимо верифицировать существование Z.ai до начала разработки. Если Z.ai не существует, требуется выбор альтернативного primary провайдера из: xAI/Grok, OpenRouter, Groq, Fireworks AI, DeepInfra

#### R2: OpenClaw -- несуществующий upstream

- **Описание:** Проект "OpenClaw" от Peter Steinberger не найден в публичных источниках (GitHub, npm, веб). Если upstream не существует, стратегия "форк 80% кода" невозможна
- **Вероятность:** Высокая (75%)
- **Влияние:** Критическое -- необходимо разрабатывать с нуля или найти реальный upstream
- **Митигация:** Необходимо верифицировать существование OpenClaw. Если не существует -- пересмотр стратегии: (a) найти реальный аналог для форка, (b) разработать core с нуля, (c) использовать комбинацию существующих open-source компонентов

#### R3: Ollama не поддерживает STT/TTS напрямую

- **Описание:** Спецификация заявляет Ollama Whisper и Ollama Piper TTS как primary STT/TTS провайдеров. Ollama не имеет API endpoints для аудио и не поддерживает Whisper/Piper модели
- **Вероятность:** Определённая (95%)
- **Влияние:** Высокое -- пересмотр архитектуры voice stack
- **Митигация:** Voice stack должен использовать отдельные процессы/микросервисы для Whisper (whisper.cpp) и Piper TTS, управляемые через child_process или HTTP API. Ollama используется только для LLM и embeddings

### 6.2 Высокие риски

#### R4: Telethon userbot -- бан аккаунта Telegram

- **Описание:** Telegram ToS технически запрещает автоматизацию user-аккаунтов. Улучшение ML-детекции спама (2024-2025) увеличивает риск
- **Вероятность:** Высокая (60-70% для активного использования)
- **Влияние:** Среднее -- потеря Telegram-доступа, необходимость создания нового аккаунта
- **Митигация:** Rate limiting, случайные задержки, обработка FloodWait, ограничение ежедневных действий, fallback на bot-only mode. Никогда не использовать основной/незаменимый аккаунт

#### R5: Qdrant не имеет embedded mode для Node.js

- **Описание:** Спецификация предполагает Qdrant embedded. В реальности @qdrant/js-client-rest -- REST клиент к запущенному серверу Qdrant
- **Вероятность:** Определённая (95%)
- **Влияние:** Среднее -- требуется запуск Qdrant сервера рядом с osaI или переключение на sqlite-vec
- **Митигация:** Варианты: (a) управлять Qdrant сервером как дочерним процессом через Docker или binary, (b) использовать sqlite-vec как основной векторный движок (проще, но менее производительный), (c) гибридный подход -- sqlite-vec по умолчанию, Qdrant server как опция

#### R6: Solo developer overload

- **Описание:** Объём MVP включает 12 доменов с unit/integration/E2E тестами, кроссплатформенной поддержкой и Python microservice
- **Вероятность:** Высокая
- **Влияние:** Высокое -- задержки, технический долг, выгорание
- **Митигация:** Строгая приоритизация (P0 только для MVP), leveraging open-source библиотек, использование AI-ассистентов для разработки

### 6.3 Средние риски

#### R7: Breaking changes от upstream (если upstream существует)

- **Описание:** Если OpenClaw существует, его обновления могут ломать совместимость
- **Вероятность:** Средняя (40%)
- **Влияние:** Высокое
- **Митигация:** Pin version, abstraction layer, separate fork branch, minimal upstream syncing

#### R8: Node.js native modules на Windows

- **Описание:** better-sqlite3, systray2 используют native C++ bindings, потенциальные проблемы сборки на Windows
- **Вероятность:** Средняя (40%)
- **Влияние:** Среднее
- **Митигация:** prebuild binaries, CI на Windows, alternative pure-JS где возможно

#### R9: Yandex API изменения и ограничения

- **Описание:** Yandex Foundation Models API может изменять endpoint'ы, модели, pricing
- **Вероятность:** Средняя (35%)
- **Влияние:** Среднее
- **Митигация:** Abstraction layer, version pinning, fallback на других провайдеров

#### R10: Контекстное окно переполнение при мультичатах

- **Описание:** 20 чатов с активными диалогами могут создавать большую нагрузку на контекст при переключении
- **Вероятность:** Средняя (45%)
- **Влияние:** Среднее
- **Митигация:** Auto-pruning, summarization, RAG вместо полного контекста, per-chat isolation

### 6.4 Низкие риски

#### R11: Qdrant на Windows

- **Описание:** Qdrant server может работать нестабильно на Windows
- **Вероятность:** Средняя (30%)
- **Влияние:** Среднее (mitigated sqlite-vec fallback)
- **Митигация:** sqlite-vec как fallback, Qdrant только как optional enhanced mode

#### R12: Ollama недоступен

- **Описание:** Пользователь не установил Ollama
- **Вероятность:** Низкая (20%)
- **Влияние:** Среднее
- **Митигация:** ONNX fallback для embeddings (Transformers.js), Yandex fallback для STT/TTS, cloud LLM провайдеры

---

## 7. Open Questions

### 7.1 Критические вопросы (блокирующие)

**Q1: Существует ли Z.ai как реальный LLM-провайдер?**
- Спецификация заявляет Z.ai как primary провайдер с OpenAI-совместимым API
- В открытых источниках (Google, GitHub, npm, web search) информация о "Z.ai" как LLM-провайдере не найдена
- Требуется: верификация существования, URL, документация, pricing, доступные модели
- Если Z.ai не существует -- требуется выбор альтернативного primary провайдера

**Q2: Существует ли OpenClaw как реальный open-source проект?**
- Спецификация ссылается на GitHub репозиторий openclaw/openclaw от Peter Steinberger
- Проект не найден в GitHub, npm, веб-поиске
- Требуется: верификация существования, URL, license, архитектура
- Если OpenClaw не существует -- требуется полная пересмотр стратегии разработки

**Q3: Какой реальный upstream для форка?**
- Если OpenClaw не существует, какие реальные проекты могут служить базой?
- Кандидаты: Open Interpreter, Claude Code,之间存在 ли аналоги с подобной архитектурой

### 7.2 Важные вопросы (влияют на архитектуру)

**Q4: Какой реальный подход к voice stack?**
- Ollama не поддерживает STT/TTS. Требуется уточнение:
  - Использовать whisper.cpp как отдельный процесс для STT?
  - Использовать Piper как отдельный процесс для TTS?
  - Или использовать другие подходы (ONNX Runtime, Transformers.js)?

**Q5: Какой реальный подход к Qdrant embedded?**
- Qdrant не имеет embedded mode для Node.js. Требуется уточнение:
  - Управлять Qdrant server как дочерним процессом (Docker или binary)?
  - Использовать sqlite-vec как основной векторный движок?
  - Гибридный подход?

**Q6: Требования к качеству голоса?**
- Piper TTS -- среднее качество, зато быстрый и локальный
- Yandex SpeechKit -- высокое качество, но платный и требует интернета
- Требуется ли поддержка русского языка для TTS/STT в MVP?

**Q7: Как управлять Python microservice для Telethon?**
- Версия Python (3.11+? 3.12+?)
- Управление зависимостями (pip, venv, Poetry?)
- Лifecycle: start, stop, restart, health check
- Взаимодействие: stdio (child_process) или HTTP API?

**Q8: Какова реальная структура OpenClaw (если существует)?**
- Package names, module structure, API interfaces
- Hook system implementation details
- Session model specifics
- Config format specifics

### 7.3 Уточняющие вопросы

**Q9: Конкретные модели для Z.ai?**
- Какие модели доступны? (аналоги GPT-4o, Claude Opus)
- Контекстное окно?
- Поддержка tool calling / function calling?
- Streaming support?

**Q10: Yandex Foundation Models -- конкретные endpoints?**
- REST API endpoint для YandexGPT
- REST API endpoint для embeddings
- REST API endpoint для SpeechKit STT/TTS
- Authentication method (IAM token, API key)

**Q11: Формат данных Telegram mirror?**
- Как обрабатывать медиа (фото, видео, документы)?
- Как обрабатывать форматирование (Markdown, HTML)?
- Как обрабатывать редактирование и удаление сообщений?

**Q12: Требования к offline-режиму?**
- Какие функции должны работать полностью offline?
- Минимальный набор: LLM (Ollama), embeddings (Ollama), память (SQLite), CLI
- Voice offline -- требуется whisper.cpp + Piper (не Ollama)

---

## 8. Assumptions

### 8.1 Критические предположения

| # | Предположение | Уровень доверия | Обоснование |
|---|---|---|---|
| A1 | OpenClaw существует как реальный проект на GitHub | **15%** | Не найден в публичных источниках при множестве поисковых запросов |
| A2 | Z.ai существует как реальный LLM-провайдер | **10%** | Не найден ни в одном источнике. Возможная путаница с xAI (Grok) |
| A3 | Ollama поддерживает Whisper и Piper TTS | **5%** | Ollama сфокусирован на LLM, не имеет audio endpoints. Это подтверждённый факт |

### 8.2 Технологические предположения

| # | Предположение | Уровень доверия | Обоснование |
|---|---|---|---|
| A4 | Qdrant имеет embedded mode для Node.js | **10%** | Подтверждено: @qdrant/js-client-rest -- REST client, не embedded |
| A5 | Yandex Foundation Models API доступен и включает LLM + Embeddings + STT/TTS | **80%** | Реальный сервис Yandex Cloud, документация существует |
| A6 | Anthropic Claude API стабилен и имеет TypeScript SDK | **95%** | Реальный сервис, @anthropic-ai/sdk активно поддерживается |
| A7 | OpenAI GPT API стабилен и OpenAI-совместимый | **98%** | Стандарт de-facto, используется повсеместно |
| A8 | Ollama поддерживает nomic-embed-text для embeddings | **90%** | Подтверждённая функциональность Ollama API |
| A9 | grammY -- зрелый TypeScript-фреймворк для Telegram Bot | **95%** | Реальный проект, активно развивается |
| A10 | Telethon -- лучший Python-клиент для Telegram userbot | **90%** | Реальный проект, MTProto, MIT License |
| A11 | better-sqlite3 работает стабильно на Linux и Windows | **85%** | Зрелый пакет, prebuild binaries доступны |
| A12 | chokidar обеспечивает кроссплатформенный file watching | **95%** | Стандарт де-факто, используется в Webpack, Vite, Next.js |
| A13 | node-notifier поддерживает Linux и Windows | **85%** | Зрелый пакет, требует libnotify на Linux |
| A14 | systeminformation -- pure JS, без native dependencies | **95%** | Зрелый пакет, 1M+ недельных загрузок |
| A15 | systray2 поддерживает Linux и Windows | **60%** | Менее известный пакет, native addon, требует C++ toolchain |
| A16 | sqlite-vec работает с better-sqlite3 на Linux и Windows | **70%** | Относительно новый проект, prebuild binaries могут быть ограничены |
| A17 | whisper.cpp можно вызвать через child_process из Node.js | **85%** | C++ бинарник, CLI интерфейс, стандартный подход |
| A18 | Piper TTS можно вызвать через child_process из Node.js | **80%** | C++ бинарник с CLI, использован в Home Assistant |

### 8.3 Организационные предположения

| # | Предположение | Уровень доверия | Обоснование |
|---|---|---|---|
| A19 | Solo developer -- один разработчик на проекте | **90%** | Указано в risk assessment |
| A20 | MIT License для osaI | **95%** | Совместимость с OpenClaw (заявлено MIT) |
| A21 | Node.js 22.16+ LTS / 24 как runtime | **95%** | Явно указано в спецификации |
| A22 | TypeScript/Node.js достаточно для производительности | **75%** | Tradeoff: скорость разработки vs производительность |
| A23 | Docker доступен на целевых машинах | **70%** | Зависит от пользовательских машин |
| A24 | Ollama установлен на целевой машине | **65%** | Требуется для local-first подхода |

### 8.4 Архитектурные предположения

| # | Предположение | Уровень доверия | Обоснование |
|---|---|---|---|
| A25 | OpenClaw использует WebSocket control plane на localhost | **20%** | Заявлено в спецификации, не верифицировано |
| A26 | OpenClaw использует Pi Agent Runtime с 7 hook points | **15%** | Заявлено в спецификации, не верифицировано |
| A27 | OpenClaw использует SKILL.md формат для skills | **15%** | Заявлено в спецификации, не верифицировано |
| A28 | OpenClaw использует Docker для sandbox | **15%** | Заявлено в спецификации, не верифицировано |
| A29 | OpenClaw использует pnpm workspace monorepo | **15%** | Заявлено в спецификации, не верифицировано |

---

## 9. Ключевые выводы

### 9.1 Критические проблемы для разрешения перед разработкой

1. **Верификация Z.ai** -- если провайдер не существует, необходимо выбрать альтернативу. Без primary провайдера архитектура failover лишается смысла

2. **Верификация OpenClaw** -- если upstream не существует, стратегия "форк 80% кода" нереализуема. Необходимо пересмотреть подход к разработке: либо найти реальный аналог, либо разрабатывать core самостоятельно

3. **Пересмотр voice stack** -- Ollama не поддерживает STT/TTS. Архитектура должна использовать whisper.cpp + Piper TTS как отдельные процессы, не через Ollama API

4. **Пересмотр Qdrant approach** -- Qdrant не имеет embedded mode для Node.js. Рекомендуется sqlite-vec как основной векторный движок, Qdrant server как optional enhanced mode

### 9.2 Расхождения между спецификацией и реальностью

| Аспект в спецификации | Реальность |
|---|---|
| "Ollama Whisper" для STT | Ollama НЕ поддерживает Whisper. Нужен whisper.cpp или аналоги |
| "Ollama Piper TTS" для TTS | Ollama НЕ поддерживает Piper. Нужен отдельный Piper процесс |
| "Qdrant embedded" для Node.js | Qdrant НЕ имеет embedded mode для Node.js. Нужен REST client к серверу или sqlite-vec |
| "Z.ai primary LLM" | Z.ai НЕ найден в открытых источниках. Требуется верификация |
| "OpenClaw 100k+ stars" | OpenClaw НЕ найден в GitHub. Требуется верификация |
| "@qdrant/js-client-rest" для Qdrant | Корректно -- это REST client, не embedded |

### 9.3 Технологии с подтверждённой доступностью

- **grammY** -- зрелый TypeScript Telegram Bot фреймворк
- **Telethon** -- зрелый Python Telegram userbot клиент (MTProto)
- **better-sqlite3** -- зрелый синхронный SQLite клиент для Node.js
- **chokidar** -- стандарт де-факто для file watching в Node.js
- **node-notifier** -- кроссплатформенные desktop notifications
- **systeminformation** -- comprehensive system info, pure JS
- **pino** -- быстрый structured JSON logger
- **Ollama** -- локальный LLM runtime (для LLM и embeddings, НЕ для STT/TTS)
- **whisper.cpp** -- быстрый локальный STT (отдельный процесс)
- **Piper TTS** -- быстрый локальный TTS (отдельный процесс)
- **sqlite-vec** -- векторный поиск в SQLite (альтернатива Qdrant embedded)
- **@anthropic-ai/sdk** -- Anthropic Claude TypeScript SDK
- **openai** -- OpenAI Node.js SDK

---

## 10. Приоритетные направления дальнейшего исследования

1. **Верификация Z.ai** -- критический блокер
2. **Верификация OpenClaw** -- критический блокер
3. **Детальное исследование Qdrant vs sqlite-vec** -- архитектурное решение
4. **Детальное исследование voice stack (whisper.cpp + Piper)** -- архитектурное решение
5. **Исследование Telethon lifecycle management** -- операционное решение
6. **Исследование Yandex Foundation Models API** -- интеграционное решение

---

**Версия документа:** v1.0
**Дата создания:** 2026-03-30
**Автор:** Research Agent
**Статус:** Завершён
