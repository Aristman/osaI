# Master Pipeline Prompt

**Версия:** v1.0
**Дата генерации:** 2026-03-30
**Источник:** docs/specs/spec_osai_v3_2026-03-28.md (v3.0)
**Проект:** osaI v3 -- AI Operating System
**Профиль проекта:** docs/project/PROJECT_PROFILE.md

---

## 1. Назначение конвейера

Данный конвейер определяет полный процесс разработки проекта **osaI v3** -- AI Operating System, построенной на базе форка OpenClaw. Конвейер покрывает полный жизненный цикл: от анализа требований до верификации готового продукта.

**Область применения:**
- MVP (P0): ядро агента, мультичаты, память, база знаний, Telegram, CLI, безопасность
- V1 (P1): голосовой стек, OS-интеграция, наблюдаемость, веб-панель, дополнительные каналы
- V2 (P2-P3): мультиагентная архитектура, маркетплейс, продвинутый RAG

**Границы:**
- Не включает развёртывание облачной инфраструктуры (local-first)
- Не включает разработку мобильных нативных приложений
- Не включает подписочную систему и биллинг

---

## 2. Интерпретированное резюме проекта

osaI v3 -- это AI Operating System, расширяющая open-source проект OpenClaw (100k+ звёзд на GitHub, MIT License) от персонального чат-ассистента до полноценного AI-слоя управления операционной системой.

**Ключевые расширения относительно OpenClaw:**
- Z.ai как основной LLM-провайдер (OpenAI-совместимый API)
- Мультичаты: до 20 независимых чатов с изолированным контекстом и общей долговременной памятью
- Telegram: бот (grammY) + пользовательский аккаунт (Telethon) + двустороннее зеркалирование (mirror)
- Глубокая память: трёхуровневая система (Chat Memory, Session Memory, Long-term Memory) с RAG
- База знаний: ингест документов, семантический поиск
- OS-интеграция: системный трей, уведомления, мониторинг файловой системы
- Локальный голосовой стек: Ollama-first STT/TTS с фолбэком на Яндекс SpeechKit
- Наблюдаемость: OpenTelemetry (трассировки, метрики, аудит)

**Платформы:** Linux (основная), Windows 10/11 (нативная). macOS -- не является целевой.

**Организационные ограничения:** один разработчик, open-source (MIT), local-first.

**Технические решения (зафиксированы, не подлежат пересмотру):** TypeScript/Node.js 22.16+, pnpm workspace, SQLite + Qdrant, Docker sandbox, SvelteKit для веб-панели, Ollama для локальных моделей.

---

## 3. Обзор этапов конвейера

### Этап 1 -- Research (Исследование)
Анализ upstream (OpenClaw), технологий, API провайдеров, рисков. Сбор информации для принятия архитектурных решений.

### Этап 2 -- System Analysis (Системный анализ)
Декомпозиция спецификации на домены, определение зависимостей между компонентами, составление технического дизайна.

### Этап 3 -- Solution Architecture (Архитектура решений)
Проектирование внутренней архитектуры каждого домена, определение контрактов между модулями, интерфейсов, моделей данных.

### Этап 4 -- TDD Planning (Планирование тестов)
Составление TDD-дорожной карты для каждого домена: модульные, интеграционные, E2E тесты.

### Этап 5 -- Development (Разработка)
Реализация кода по доменам. Каждый домен разрабатывается назначенным агентом в соответствии с архитектурным решением и TDD-планом.

### Этап 6 -- Testing (Тестирование)
Выполнение модульных, интеграционных и E2E тестов. Проверка качества кода и покрытия.

### Этап 7 -- Code Review (Ревью кода)
Анализ кода на соответствие архитектуре, стандартам безопасности, производительности.

### Этап 8 -- Feature Verification (Верификация функциональности)
Проверка реализации соответствия спецификации для каждой функции.

### Этап 9 -- System Verification (Системная верификация)
Сквозная проверка всей системы: интеграция доменов, кроссплатформенность, производительность.

### Этап 10 -- Documentation (Документирование)
Создание пользовательской и технической документации.

### Этап 11 -- Release (Релиз)
Подготовка релизных артефактов, версионирование, публикация.

---

## 4. Роли и ответственности агентов

### Research Agent
**Ответственность:**
- Глубокое исследование upstream (OpenClaw): архитектура, API, зависимости, структура проекта
- Исследование технологий: Z.ai API, Yandex Foundation Models, Qdrant embedded, Telethon
- Анализ рисков и предложение митигаций
- Подготовка отчётов об исследовании

**Выходные артефакты:**
- docs/research/research-openclaw.md
- docs/research/research-llm-providers.md
- docs/research/research-vector-db.md
- docs/research/research-telegram-integration.md
- docs/research/research-voice-stack.md
- docs/research/research-os-integration.md
- docs/research/research-risks.md

**Git Commit (ОБЯЗАТЕЛЬНО):**
```bash
git add docs/research/
git commit -m "docs: complete research phase for osaI v3 domains"
```

**НЕ делает:**
- Архитектурные решения
- Написание кода
- Оценку стоимости

---

### System Analyst Agent
**Ответственность:**
- Декомпозиция спецификации на домены (DOMAIN-001 -- DOMAIN-012)
- Определение зависимостей между доменами и компонентов
- Составление технического дизайна: интерфейсы, контракты, модели данных
- Маппинг требований из спецификации на конкретные домены и задачи

**Выходные артефакты:**
- docs/design/system-design.md
- docs/design/domain-map.md
- docs/design/dependency-graph.md
- docs/design/data-model.md
- docs/design/api-contracts.md

**Git Commit (ОБЯЗАТЕЛЬНО):**
```bash
git add docs/design/
git commit -m "docs: system analysis and technical design for osaI v3"
```

**НЕ делает:**
- Написание кода
- Исследование технологий
- Тестирование

---

### Solution Architect Agent
**Ответственность:**
- Проектирование внутренней архитектуры каждого домена
- Определение паттернов проектирования для каждого модуля
- Проектирование интерфейсов между пакетами (packages/*)
- Определение стратегий: failover, caching, error handling, logging
- Архитектурный дизайн для каждого из 12 доменов

**Выходные артефакты:**
- docs/architecture/architecture-overview.md
- docs/architecture/domain-001-gateway.md
- docs/architecture/domain-002-agent-runtime.md
- docs/architecture/domain-003-skills.md
- docs/architecture/domain-004-memory.md
- docs/architecture/domain-005-knowledge-base.md
- docs/architecture/domain-006-telegram.md
- docs/architecture/domain-007-voice.md
- docs/architecture/domain-008-llm-providers.md
- docs/architecture/domain-009-os-integration.md
- docs/architecture/domain-010-observability.md
- docs/architecture/domain-011-cli.md
- docs/architecture/domain-012-web-dashboard.md

**Git Commit (ОБЯЗАТЕЛЬНО):**
```bash
git add docs/architecture/
git commit -m "arch: design architecture for all 12 osaI v3 domains"
```

**НЕ делает:**
- Написание production-кода
- Тестирование
- Исследование

---

### TDD Planner Agent
**Ответственность:**
- Составление TDD-дорожной карты для каждого домена
- Определение модульных тестов для каждого компонента
- Определение интеграционных тестов для взаимодействия между доменами
- Определение E2E тестов для критичных пользовательских сценариев
- Определение минимально допустимого покрытия тестами

**Выходные артефакты:**
- docs/testing/tdd-roadmap.md
- docs/testing/test-plan-mvp.md
- docs/testing/test-plan-v1.md
- docs/testing/test-scenarios.md

**Git Commit (ОБЯЗАТЕЛЬНО):**
```bash
git add docs/testing/
git commit -m "docs: TDD roadmap and test plans for osaI v3"
```

**НЕ делает:**
- Написание production-кода
- Архитектурное проектирование
- Запуск тестов

---

### Developer Agent
**Ответственность:**
- Реализация production-кода по доменам в соответствии с архитектурными решениями
- Реализация кода в рамках TDD: тесты先行 (сначала тесты, потом код)
- Каждый домен реализуется отдельным агентом с назначенным профилем (backend-typescript, backend-multi, frontend-cli, frontend-web)
- Строгое следование структуре проекта: packages/*

**Профили разработчиков по доменам:**

| Домен | Профиль | Пакет |
|-------|---------|-------|
| DOMAIN-001: Gateway | backend-typescript | packages/gateway |
| DOMAIN-002: Agent Runtime | backend-typescript | packages/agent |
| DOMAIN-003: Skills System | backend-typescript | packages/skills-core, packages/skills-osai |
| DOMAIN-004: Memory System | backend-typescript | packages/memory |
| DOMAIN-005: Knowledge Base | backend-typescript | packages/knowledge-base |
| DOMAIN-006: Telegram Integration | backend-multi (TS + Python) | packages/gateway/src/channels/telegram |
| DOMAIN-007: Voice Stack | backend-typescript | packages/voice |
| DOMAIN-008: LLM Providers | backend-typescript | packages/providers |
| DOMAIN-009: OS Integration | backend-typescript | packages/os-integration |
| DOMAIN-010: Observability | backend-typescript | packages/observability |
| DOMAIN-011: CLI Client | frontend-cli | packages/cli |
| DOMAIN-012: Web Dashboard | frontend-web | apps/dashboard |

**Выходные артефакты:**
- packages/*/src/** -- исходный код
- packages/*/test/** -- модульные тесты
- tests/integration/** -- интеграционные тесты
- tests/e2e/** -- E2E тесты
- package.json, tsconfig.json -- конфигурация

**Git Commit (ОБЯЗАТЕЛЬНО):**
```bash
git add packages/<domain>/
git commit -m "feat: implement <DOMAIN_NAME> for osaI v3"
```

**НЕ делает:**
- Изменение архитектурных решений
- Пропуск тестов
- Реализация доменов, не входящих в назначенный scope

---

### Test Engineer Agent
**Ответственность:**
- Запуск модульных тестов для каждого пакета
- Запуск интеграционных тестов для взаимодействия между доменами
- Запуск E2E тестов для критичных сценариев
- Анализ покрытия кода тестами
- Отчёт о результатах тестирования

**Критичные сценарии для E2E тестирования (MVP):**
- Мультичаты: создание, переключение, архивация, удаление
- Telegram mirror: двусторонняя синхронизация сообщений
- Z.ai primary + Yandex failover: переключение провайдеров
- Память: RAG-поиск через Qdrant, извлечение фактов
- Файловый sandbox: ограничение доступа к заблокированным директориям
- Контекстное окно: auto-pruning + суммаризация

**Выходные артефакты:**
- docs/testing/test-report-mvp.md
- docs/testing/test-report-v1.md
- docs/testing/coverage-report.md
- test-results/ -- результаты выполнения тестов

**Git Commit (ОБЯЗАТЕЛЬНО):**
```bash
git add docs/testing/ test-results/
git commit -m "test: complete testing phase for osaI v3 <MVP|V1>"
```

**НЕ делает:**
- Исправление багов (только отчёт)
- Написание production-кода
- Архитектурные изменения

---

### Code Reviewer Agent
**Ответственность:**
- Ревью кода на соответствие архитектурным решениям
- Проверка безопасности: 7-уровневая модель, sandbox, permission prompts
- Проверка производительности: N+1 запросы, утечки памяти, неэффективные алгоритмы
- Проверка соответствия TypeScript strict mode и стандартам кодирования
- Проверка кроссплатформенности (Linux + Windows)
- Формирование отчёта о ревью с конкретными замечаниями

**Выходные артефакты:**
- docs/review/code-review-mvp.md
- docs/review/code-review-v1.md
- docs/review/security-review.md

**Git Commit (ОБЯЗАТЕЛЬНО):**
```bash
git add docs/review/
git commit -m "review: code review for osaI v3 <MVP|V1>"
```

**НЕ делает:**
- Исправление кода
- Написание нового кода
- Архитектурные изменения

---

### Feature Verifier Agent
**Ответственность:**
- Проверка каждой реализованной функции на соответствие спецификации (spec_osai_v3_2026-03-28.md)
- Верификация по чек-листу из раздела 22 (MoSCoW) спецификации
- Проверка completeness: все заявленные в MVP функции реализованы
- Формирование отчёта о соответствии (compliance report)

**Выходные артефакты:**
- docs/verification/feature-compliance-mvp.md
- docs/verification/feature-compliance-v1.md

**Git Commit (ОБЯЗАТЕЛЬНО):**
```bash
git add docs/verification/
git commit -m "verify: feature compliance verification for osaI v3 <MVP|V1>"
```

**НЕ делает:**
- Производительное тестирование (нагрузка)
- Исследование безопасности (пентест)
- Написание кода

---

### System Verifier Agent
**Ответственность:**
- Сквозная верификация всей системы
- Проверка интеграции между доменами
- Проверка кроссплатформенности: Linux + Windows
- Проверка failover-цепочки LLM-провайдеров
- Проверка работы системы при отсутствии сети (offline с Ollama)
- Формирование итогового отчёта о готовности к релизу

**Выходные артефакты:**
- docs/verification/system-verification-report.md

**Git Commit (ОБЯЗАТЕЛЬНО):**
```bash
git add docs/verification/
git commit -m "verify: system verification complete for osaI v3"
```

**НЕ делает:**
- Исправление багов
- Написание кода
- Архитектурные изменения

---

### Documentation Agent
**Ответственность:**
- Создание пользовательской документации
- Создание технической документации (API reference, configuration guide)
- Документация по установке и начальной настройке
- Документация по CLI-командам
- Документация по настройке каналов (Telegram, WhatsApp, Discord)

**Выходные артефакты:**
- docs/user-guide/installation.md
- docs/user-guide/configuration.md
- docs/user-guide/cli-reference.md
- docs/user-guide/telegram-setup.md
- docs/user-guide/memory-and-kb.md
- docs/user-guide/security.md
- docs/api/REST-API.md
- docs/api/WebSocket-Protocol.md

**Git Commit (ОБЯЗАТЕЛЬНО):**
```bash
git add docs/user-guide/ docs/api/
git commit -m "docs: user and API documentation for osaI v3"
```

**НЕ делает:**
- Написание кода
- Изменение функциональности
- Ревью кода

---

### Release / DevOps Agent
**Ответственность:**
- Подготовка релизных артефактов
- Настройка CI/CD (GitHub Actions): Linux + Windows
- Версионирование (semantic versioning)
- Подготовка npm-пакетов для публикации
- Создание release notes

**Выходные артефакты:**
- .github/workflows/ci.yml
- .github/workflows/release.yml
- CHANGELOG.md
- dist/ -- собранные артефакты

**Git Commit (ОБЯЗАТЕЛЬНО):**
```bash
git add .github/workflows/ CHANGELOG.md
git commit -m "chore: configure CI/CD and prepare release artifacts for osaI v3"
```

**НЕ делает:**
- Разработку функциональности
- Тестирование
- Документирование (кроме release notes)

---

## 5. Поток артефактов

### Этап 1 (Research) -> Этап 2 (System Analysis)
- Исследовательские отчёты (docs/research/*) используются системным аналитиком для понимания ограничений и возможностей upstream

### Этап 2 (System Analysis) -> Этап 3 (Solution Architecture)
- Системный дизайн (docs/design/*) является входом для архитектора: домены, зависимости, модели данных, API-контракты

### Этап 3 (Solution Architecture) -> Этап 4 (TDD Planning)
- Архитектурные документы (docs/architecture/*) используются TDD-планером для определения тестов: модульные (по компонентам), интеграционные (по границам доменов), E2E (по сценариям)

### Этап 4 (TDD Planning) + Этап 3 (Solution Architecture) -> Этап 5 (Development)
- Архитектура + TDD-план являются входом для разработчика: реализация по TDD (тест -> код -> рефакторинг)
- Каждый домен разрабатывается независимо в рамках назначенного пакета

### Этап 5 (Development) -> Этап 6 (Testing)
- Реализованный код + тесты передаются инженеру по тестированию для выполнения и анализа

### Этап 6 (Testing) -> Этап 7 (Code Review)
- Отчёт о тестировании + исходный код передаются ревьюеру

### Этап 7 (Code Review) -> Этап 8 (Feature Verification)
- Отревьюенный код передаётся на верификацию соответствия спецификации

### Этап 8 (Feature Verification) -> Этап 9 (System Verification)
- При успешной верификации функций -- системная верификация всей системы

### Этап 9 (System Verification) -> Этап 10 (Documentation)
- При успешной системной верификации -- создание документации

### Этап 10 (Documentation) -> Этап 11 (Release)
- Документация + код передаются релиз-инженеру

---

## 6. Точки контроля (Human-in-the-Loop)

### Точка 1 -- Утверждение исследования
**После этапа 1 (Research).**
**Представляемые документы:** все исследовательские отчёты (docs/research/*).
**Возможные решения:**
- Утверждение -- переход к системному анализу
- Запрос дополнительного исследования по конкретным темам
- Корректировка scope проекта

### Точка 2 -- Утверждение архитектуры
**После этапа 3 (Solution Architecture).**
**Представляемые документы:** архитектурный обзор + документы по каждому домену (docs/architecture/*).
**Возможные решения:**
- Утверждение -- переход к TDD-планированию
- Корректировка архитектурных решений
- Изменение приоритетов доменов

### Точка 3 -- Утверждение к разработке
**После этапа 4 (TDD Planning).**
**Представляемые документы:** TDD-дорожная карта + планы тестирования (docs/testing/*).
**Возможные решения:**
- Утверждение -- начало разработки
- Корректировка тестовых планов
- Изменение scope MVP

### Точка 4 -- Приёмка MVP
**После этапа 9 (System Verification) для MVP.**
**Представляемые документы:** отчёты о тестировании, ревью, верификации функций, системной верификации.
**Возможные решения:**
- Утверждение MVP -- переход к V1
- Возврат на этап 5 (Development) для исправления замечаний
- Корректировка scope

### Точка 5 -- Приёмка V1
**После этапа 9 (System Verification) для V1.**
**Представляемые документы:** полный комплект отчётов для V1.
**Возможные решения:**
- Утверждение V1 -- подготовка к релизу
- Возврат на доработку

### Точка 6 -- Финальное утверждение релиза
**После этапа 10 (Documentation).**
**Представляемые документы:** CHANGELOG.md, документация, релизные артефакты.
**Возможные решения:**
- Утверждение релиза
- Возврат на доработку

---

## 7. Качественные ворота и скоринг

### Правила оценки

Каждый этап (кроме Research) оценивается по шкале от 0 до 10.

**Критерии оценки по этапам:**

| Этап | Критерии | Минимальный балл |
|------|----------|-----------------|
| System Analysis | Полнота декомпозиции, корректность зависимостей | 7/10 |
| Solution Architecture | Корректность паттернов, полнота интерфейсов, учёт ограничений | 7/10 |
| TDD Planning | Покрытие критичных сценариев, полнота тест-кейсов | 7/10 |
| Development | Прохождение всех тестов, соответствие архитектуре, TypeScript strict | 8/10 |
| Testing | Покрытие кода >= 70%, все критичные сценарии пройдены | 8/10 |
| Code Review | Соответствие архитектуре, безопасность, кроссплатформенность | 7/10 |
| Feature Verification | Соответствие спецификации >= 95% | 8/10 |
| System Verification | Все интеграционные сценарии пройдены | 8/10 |
| Documentation | Полнота, точность, понятность | 7/10 |

### Целевой скоринг проекта

- **Целевой балл качества:** 8/10 (production-ready для MVP)
- **Допустимый уровень риска:** Medium

### Последствия провала ворота

- **Балл ниже минимума:** возврат на предыдущий этап для исправления
- **Повторный провал:** эскалация человеку с описанием проблемы и предложений по решению
- **Критические замечания по безопасности:** немедленная остановка, исправление обязательно

---

## 8. Правила параллельного выполнения

### Параллельная разработка доменов (Этап 5)

Следующие группы доменов могут разрабатываться параллельно, поскольку они не имеют взаимных зависимостей на уровне кода:

**Группа A (Core -- обязательна первой):**
- DOMAIN-001: Gateway
- DOMAIN-002: Agent Runtime

**Группа B (Core extensions -- после Группы A):**
- DOMAIN-003: Skills System
- DOMAIN-008: LLM Providers

**Группа C (Data layer -- после Группы A):**
- DOMAIN-004: Memory System
- DOMAIN-005: Knowledge Base

**Группа D (Channels -- после Группы A + DOMAIN-003):**
- DOMAIN-006: Telegram Integration
- DOMAIN-011: CLI Client

**Группа E (OS + Observability -- после Группы A):**
- DOMAIN-009: OS Integration
- DOMAIN-010: Observability

**Группа F (V1 -- после MVP):**
- DOMAIN-007: Voice Stack
- DOMAIN-012: Web Dashboard

### Ограничения параллелизма

- Группа A должна быть завершена до начала всех остальных групп
- Группа B и Группа C могут выполняться параллельно
- Группа D зависит от Группы A и DOMAIN-003 (Skills)
- Группа E может выполняться параллельно с Группами B, C, D
- Группа F начинается только после успешной верификации MVP

### Точки синхронизации

1. **После Группы A:** интеграционное тестирование Gateway + Agent Runtime
2. **После Групп B+C:** интеграционное тестирование Skills + LLM + Memory + KB
3. **После всех групп MVP:** полная интеграционная верификация MVP
4. **После Группы F:** полная интеграционная верификация V1

---

## 9. Политика изменений и перегенерации

### Запрос изменений

Изменения вносятся только через обновление PROJECT_PROFILE.md (через Pipeline Orchestrator) или напрямую пользователем.

### Правила перегенерации

| Что изменилось | Какие агенты перезапускаются |
|---------------|------------------------------|
| Изменение спецификации (spec) | Полная перегенерация: Research -> System Analysis -> ... |
| Изменение профиля проекта (PROJECT_PROFILE.md) | System Analysis -> Solution Architecture -> ... (пересчёт downstream) |
| Изменение архитектуры одного домена | Solution Architect (только домен) -> TDD Planner (домен) -> Developer (домен) |
| Добавление нового домена | System Analyst -> Solution Architect -> TDD Planner -> Developer |
| Исправление бага | Developer (домен) -> Test Engineer -> Code Reviewer |

### Версионирование артефактов

- **PIPELINE_PROMPT.md:** семантическая версия vX.Y, инкремент при каждой перегенерации
- **Архитектурные документы:** версионируются через git
- **Код:** семантическое версионирование npm-пакетов

---

## 10. Условия завершения

### Успешное завершение

Конвейер считается успешно завершённым, когда:

1. Все MVP-домены (DOMAIN-001, 002, 003, 004, 005, 006, 008, 009, 011) реализованы и прошли все ворота
2. Все модульные тесты пройдены
3. Все интеграционные тесты пройдены
4. Все E2E тесты для критичных сценариев пройдены
5. Code Review завершён без критических замечаний
6. Feature Verification: соответствие спецификации >= 95%
7. System Verification: все интеграционные сценарии пройдены
8. Пользовательская документация создана
9. CI/CD настроен (Linux + Windows)
10. Человек утвердил релиз

### Принудительная остановка

Конвейер останавливается, если:

1. Обнаружено критическое противоречие в спецификации -- эскалация человеку
2. Критическая уязвимость безопасности -- немедленная остановка
3. Upstream (OpenClaw) выпустил breaking changes -- остановка для оценки влияния
4. Человек инициировал остановку
5. Три последовательных провала одного и того же качественного ворота

---

## 11. Финальные выходы

### Документация
- docs/specs/spec_osai_v3_2026-03-28.md -- исходная спецификация
- docs/project/PROJECT_PROFILE.md -- профиль проекта
- docs/project/PROJECT_PROFILE_HUMAN.md -- человекочитаемое резюме
- docs/project/PIPELINE_PROMPT.md -- данный документ
- docs/research/* -- исследовательские отчёты
- docs/design/* -- системный дизайн
- docs/architecture/* -- архитектурные документы (12 доменов)
- docs/testing/* -- тестовые планы и отчёты
- docs/review/* -- отчёты о ревью
- docs/verification/* -- отчёты о верификации
- docs/user-guide/* -- пользовательская документация
- docs/api/* -- API документация
- CHANGELOG.md -- история изменений

### Исходный код (MVP)
- packages/gateway/ -- WebSocket control plane, channel routing, multi-chat, Telegram
- packages/agent/ -- Pi Agent Runtime, hooks (13 hook points)
- packages/skills-core/ -- bundled skills (Filesystem, Shell)
- packages/skills-osai/ -- osaI skills (OS Integration, Memory, KB, Chat Management)
- packages/providers/ -- LLM providers (Z.ai, Yandex, Anthropic, OpenAI, Ollama)
- packages/memory/ -- трёхуровневая память, RAG, embeddings, context window
- packages/knowledge-base/ -- ингест документов, семантический поиск
- packages/os-integration/ -- уведомления, системная информация
- packages/cli/ -- CLI клиент (oclif/ink), TUI
- packages/observability/ -- OpenTelemetry, audit log (V1)

### Тесты
- packages/*/test/ -- модульные тесты для каждого пакета
- tests/integration/ -- интеграционные тесты
- tests/e2e/ -- E2E тесты для критичных сценариев

### Инфраструктура
- .github/workflows/ci.yml -- CI pipeline (Linux + Windows)
- .github/workflows/release.yml -- Release pipeline
- package.json -- корневая конфигурация pnpm workspace
- openclaw.json.example -- пример конфигурации osaI
- AGENTS.md -- persona агента
- SOUL.md -- ценности агента

---

**Версия конвейера:** v1.0
**Дата:** 2026-03-30
**Статус:** Активен
