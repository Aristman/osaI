# Master Pipeline Prompt

**Version:** v1.0
**Generated:** 2026-03-24
**Source:** PROJECT_PROFILE.md + spec_osai_openclaw_2026-03-24.md
**Pipeline Type:** Fork/Extension Development Pipeline

---

## 1. Purpose of This Pipeline

Данный pipeline управляет процессом разработки **osaI** (Operation System AI) -- AI Operating System, построенной на базе форка OpenClaw.

**Цель pipeline:** Последовательно, с контролем качества иapproval points, реализовать все домены проекта osaI, начиная от форка OpenClaw и настройки monorepo, заканчивая V1-системой с памятью, observability и web-панелью.

**Границы scope:**
- В scope: все 9 доменов (gateway, agent, skills-core, skills-osai, memory, observability, os-integration, cli, dashboard)
- В scope: три этапа -- MVP, V1, V2 (основной фокус -- MVP и V1)
- В scope: upstream-совместимость с OpenClaw
- Out of scope: cloud-hosted backend, mobile native apps, subscription/billing, Windows

**Ключевая специфика:** osaI -- это не разработка с нуля. ~80% кода наследуется от OpenClaw через форк. Pipeline учитывает, что базовые системы (gateway, agent runtime, skills system, session model) уже существуют upstream и требуют адаптации, а не создания.

---

## 2. Interpreted Project Summary

osaI расширяет OpenClaw (open-source personal AI assistant) до полноценного AI Operating System. OpenClaw предоставляет зрелую Gateway-архитектуру (WebSocket control plane), Agent runtime с hook-based extensibility, Skills-систему (SKILL.md), 20+ мессенджер-каналов, session model, Docker sandboxing, model failover.

osaI добавляет:
- **Desktop OS интеграцию** (systemd, tray, file watchers, process management)
- **Структурированную память с RAG** (SQLite + Qdrant, embeddings, fact extraction)
- **OpenTelemetry observability** (traces, metrics, structured logs, audit)
- **CLI-клиент** (oclif/ink) с интерактивным чатом
- **Web Dashboard** (SvelteKit + TailwindCSS)

Платформы: Linux (primary), macOS (secondary). Deployment: local-first, один пользователь. Solo developer.

---

## 3. Pipeline Stages Overview

Pipeline разделён на **3 макро-этапа** (MVP, V1, V2), каждый из которых содержит стадии с quality gates.

### Macro-Stage A: MVP -- Fork + Core

| # | Stage | Goal | Dependencies |
|---|-------|------|-------------|
| A1 | Research & Analysis | Изучить OpenClaw codebase, API, hooks, migration path | None |
| A2 | Monorepo Setup | Форк OpenClaw, настройка workspace, конфигурация | A1 |
| A3 | Gateway Adaptation | Адаптировать WS control plane для osaI | A2 |
| A4 | Agent Runtime Adaptation | Адаптировать agent loop, hooks, model resolver | A2 |
| A5 | Skills: Core (Filesystem + Shell) | Базовые навыки с sandbox | A4 |
| A6 | LLM Integration | Anthropic (primary) + Ollama (fallback) | A4 |
| A7 | CLI Client | oclif-клиент с чатом и базовыми командами | A3 |
| A8 | File Sandbox + Permissions | Allowed dirs, blocked patterns, confirmation | A5 |
| A9 | Logging & Config | pino structured logging, openclaw.json | A3 |

### Macro-Stage B: V1 -- Full System

| # | Stage | Goal | Dependencies |
|---|-------|------|-------------|
| B1 | Skills: Browser + HTTP | CDP browser automation, HTTP/API client | A5 |
| B2 | Memory System | Short-term (SQLite) + Long-term (Qdrant) + RAG | A4 |
| B3 | Embedding Pipeline | Xenova (local) + OpenAI (remote) embeddings | B2 |
| B4 | Fact Extraction | Auto-extract facts from conversations | B2 |
| B5 | osaI-specific Skills | os-integration, memory, knowledge-base skills | B2, os-integration |
| B6 | OS Integration | System tray, notifications, file watcher, processes | None (parallel) |
| B7 | Observability | OpenTelemetry traces, metrics, audit log | A4 |
| B8 | Web Dashboard | SvelteKit chat, trace view, status | A3 |
| B9 | Channels | Telegram + WhatsApp integration | A3 |
| B10 | Integration & E2E | End-to-end testing всех компонентов | B1-B9 |

### Macro-Stage C: V2 -- Advanced (future)

| # | Stage | Goal |
|---|-------|------|
| C1 | Multi-agent | Специализированные агенты |
| C2 | Plugin Marketplace | ClawHub + osaI plugins |
| C3 | Advanced RAG | Re-ranking, hybrid search |
| C4 | All Channels | Slack, Discord, Signal, iMessage, 20+ |
| C5 | MCP Integration | Model Context Protocol |

---

## 4. Agent Roles and Responsibilities

### Research Agent
**Ответственность:**
- Анализ OpenClaw codebase (gateway, agent runtime, hooks API, skills system)
- Определение migration path и backward compatibility requirements
- Документирование upstream API контрактов, которые osaI будет использовать/расширять
- Исследование зависимости между пакетами OpenClaw
- Анализ рисков upstream breaking changes

**Выходные артефакты:**
- `docs/research/openclaw-analysis.md` -- анализ архитектуры OpenClaw
- `docs/research/upstream-api-contracts.md` -- контракты API, которые osaI наследует
- `docs/research/migration-path.md` -- план миграции/форка

**Git Commit (ОБЯЗАТЕЛЬНО):**
```bash
git add docs/research/
git commit -m "docs: add OpenClaw analysis and migration path research"
```

**НЕ делает:**
- НЕ пишет production код
- НЕ модифицирует upstream код OpenClaw
- НЕ принимает архитектурные решения -- только исследует и документирует

---

### Solution Architect Agent
**Ответственность:**
- Проектирование архитектуры osaI extensions поверх OpenClaw base
- Определение интерфейсов между osaI-пакетами и OpenClaw
- Проектирование схемы данных (SQLite schema, Qdrant collections)
- Определение hook points для osaI extensions
- Спецификация osaI REST API endpoints
- Проектирование dependency graph между пакетами

**Выходные артефакты:**
- `docs/develop/architecture.md` -- общая архитектура osaI
- `docs/develop/package-interfaces.md` -- интерфейсы между пакетами
- `docs/develop/data-schema.md` -- схемы данных (SQLite + Qdrant)
- `docs/develop/dependency-graph.md` -- граф зависимостей пакетов
- `docs/develop/api-specification.md` -- спецификация osaI REST API

**Git Commit (ОБЯЗАТЕЛЬНО):**
```bash
git add docs/develop/
git commit -m "arch: define osaI architecture and package interfaces"
```

**НЕ делает:**
- НЕ пишет production код
- НЕ модифицирует upstream OpenClaw код
- НЕ создаёт файлы конфигурации (package.json, tsconfig)

---

### TDD Planner Agent
**Ответственность:**
- Формирование тестовых планов для каждого домена/пакета
- Определение test coverage targets
- Создание спецификаций unit, integration, e2e тестов
- Определение тестовых сценариев для backward compatibility с OpenClaw
- Определение тестовых сценариев для security (sandbox, permissions, audit)

**Выходные артефакты:**
- `docs/develop/test-plan.md` -- общий план тестирования
- `docs/develop/test-scenarios-{domain}.md` -- сценарии для каждого домена

**Git Commit (ОБЯЗАТЕЛЬНО):**
```bash
git add docs/develop/test-plan.md docs/develop/test-scenarios-*.md
git commit -m "docs: add test plans and scenarios for all domains"
```

**НЕ делает:**
- НЕ пишет тестовый код
- НЕ запускает тесты
- НЕ определяет тестовые фреймворки (vitest -- задан PROJECT_PROFILE)

---

### Developer Agent (Backend -- ts-backend)
**Ответственность:**
- Разработка всех backend-пакетов: gateway, agent, skills-core, skills-osai, memory, observability
- Адаптация OpenClaw fork кода для osaI needs
- Реализация osaI-specific extensions (memory, observability, hooks)
- Написание production кода в соответствии с архитектурными решениями
- Следование TypeScript strict mode, ESLint + Biome, Prettier

**Рабочие домены (по порядку разработки):**
1. `packages/gateway` -- WS control plane (адаптация OpenClaw)
2. `packages/agent` -- Agent runtime (адаптация OpenClaw + osaI hooks)
3. `packages/skills-core` -- Filesystem, Shell, Browser, HTTP skills
4. `packages/skills-osai` -- os-integration, memory, knowledge-base skills
5. `packages/memory` -- SQLite + Qdrant, RAG pipeline, embeddings
6. `packages/observability` -- OpenTelemetry, traces, metrics, audit

**Выходные артефакты (для каждого домена):**
- `packages/{domain}/src/**/*.ts` -- исходный код
- `packages/{domain}/package.json` -- конфигурация пакета
- `packages/{domain}/tsconfig.json` -- TypeScript конфигурация
- `packages/{domain}/README.md` -- документация пакета

**Git Commit (ОБЯЗАТЕЛЬНО):**
Для каждого завершённого домена:
```bash
git add packages/{domain}/
git commit -m "feat({domain}): implement {domain} package for osaI"
```

Примеры:
```bash
git add packages/gateway/
git commit -m "feat(gateway): adapt OpenClaw WS control plane for osaI"

git add packages/memory/
git commit -m "feat(memory): implement two-tier memory system with RAG pipeline"
```

**НЕ делает:**
- НЕ модифицирует upstream OpenClaw код без явного approval от Solution Architect
- НЕ пишет код для доменов cli и dashboard (другие agent profiles)
- НЕ создаёт системные конфигурации (monorepo root, CI/CD)
- НЕ пишет тесты (Test Engineer responsibility)

---

### Developer Agent (System -- ts-system)
**Ответственность:**
- Разработка пакета `packages/os-integration` -- desktop OS integration
- Реализация system tray, desktop notifications, file watcher, process management
- Кроссплатформенная поддержка (Linux + macOS)
- Интеграция с systemd (Linux) и launchd (macOS)

**Выходные артефакты:**
- `packages/os-integration/src/**/*.ts`
- `packages/os-integration/package.json`
- `packages/os-integration/README.md`

**Git Commit (ОБЯЗАТЕЛЬНО):**
```bash
git add packages/os-integration/
git commit -m "feat(os-integration): implement desktop OS integration layer"
```

**НЕ делает:**
- НЕ пишет код для других backend доменов
- НЕ создаёт нативные бинарники (C/Rust bindings)

---

### Developer Agent (CLI -- ts-cli)
**Ответственность:**
- Разработка `packages/cli` -- CLI клиент на oclif/ink
- Реализация интерактивного чата, session management, config, skills management
- Реализация TUI-компонентов (ink)
- Memory operations, channel management, system status commands

**Выходные артефакты:**
- `packages/cli/src/**/*.ts`
- `packages/cli/package.json`
- `packages/cli/README.md`

**Git Commit (ОБЯЗАТЕЛЬНО):**
```bash
git add packages/cli/
git commit -m "feat(cli): implement osaI CLI client with interactive chat"
```

**НЕ делает:**
- НЕ пишет код для backend пакетов
- НЕ реализует UI-логику для Web Dashboard

---

### Developer Agent (Frontend -- ts-frontend)
**Ответственность:**
- Разработка `apps/dashboard` -- Web Dashboard на SvelteKit + TailwindCSS
- Реализация chat area, channel sidebar, agent trace view
- Permission prompts, memory search, system status panels
- WebSocket клиент для real-time обновлений

**Выходные артефакты:**
- `apps/dashboard/src/**/*.{svelte,ts}`
- `apps/dashboard/package.json`
- `apps/dashboard/README.md`

**Git Commit (ОБЯЗАТЕЛЬНО):**
```bash
git add apps/dashboard/
git commit -m "feat(dashboard): implement SvelteKit web dashboard"
```

**НЕ делает:**
- НЕ пишет backend код
- НЕ реализует server-side logic (SSR не требуется -- local-first)

---

### Test Engineer Agent
**Ответственность:**
- Написание unit-тестов для каждого пакета (vitest)
- Написание integration-тестов (межпакетное взаимодействие)
- Написание e2e-тестов (полные сценарии через CLI/gateway)
- Тестирование backward compatibility с OpenClaw WS protocol
- Тестирование security scenarios (sandbox bypass, permission flows, audit)
- Тестирование platform-specific (Linux/macOS)

**Выходные артефакты:**
- `packages/{domain}/src/**/*.test.ts` -- unit тесты
- `tests/integration/**/*.test.ts` -- integration тесты
- `tests/e2e/**/*.test.ts` -- e2e тесты
- `tests/fixtures/` -- тестовые данные и моки

**Git Commit (ОБЯЗАТЕЛЬНО):**
Для каждого протестированного домена:
```bash
git add packages/{domain}/src/**/*.test.ts tests/
git commit -m "test({domain}): add unit, integration and e2e tests"
```

**НЕ делает:**
- НЕ пишет production код
- НЕ модифицирует implementation без явного bug report
- НЕ определяет архитектуру тестовой инфраструктуры

---

### Code Reviewer Agent
**Ответственность:**
- Review кода каждого домена перед merge
- Проверка backward compatibility с OpenClaw API
- Проверка TypeScript strict mode compliance
- Проверка security (sandbox policies, permission categories, audit coverage)
- Проверка error handling (circuit breaker, fallback chain)
- Проверка adherence к PROJECT_PROFILE constraints

**Выходные артефакты:**
- `docs/develop/review-{domain}.md` -- результаты code review для каждого домена
- Inline комментарии в PR (при наличии)

**Git Commit (ОБЯЗАТЕЛЬНО):**
```bash
git add docs/develop/review-{domain}.md
git commit -m "review({domain}): code review findings and approval"
```

**НЕ делает:**
- НЕ пишет production код
- НЕ автоматически применяет исправления

---

### Feature Verifier Agent
**Ответственность:**
- Верификация реализации каждого домена против спецификации
- Проверка completeness: все заявленные функции реализованы
- Проверка correctness: поведение соответствует spec
- Проверка integration: пакет корректно интегрируется с другими пакетами
- Запуск smoke tests после каждого домена

**Выходные артефакты:**
- `docs/develop/verification-{domain}.md` -- отчёт верификации

**Git Commit (ОБЯЗАТЕЛЬНО):**
```bash
git add docs/develop/verification-{domain}.md
git commit -m "verify({domain}): verify implementation against specification"
```

**НЕ делает:**
- НЕ пишет код
- НЕ исправляет найденные несоответствия (только отчёт)

---

### System Verifier Agent
**Ответственность:**
- Финальная верификация интеграции всех пакетов
- Проверка end-to-end сценариев из спецификации (Section 10)
- Проверка security model (6 layers)
- Проверка performance (token tracking, latency)
- Проверка reliability (model failover, error handling)

**Выходные артефакты:**
- `docs/develop/system-verification.md` -- итоговый отчёт верификации

**Git Commit (ОБЯЗАТЕЛЬНО):**
```bash
git add docs/develop/system-verification.md
git commit -m "verify: complete system verification for {macro-stage}"
```

**НЕ делает:**
- НЕ пишет production код
- НЕ модифицирует конфигурацию

---

### Documentation Agent
**Ответственность:**
- Создание пользовательской документации
- README для проекта и каждого пакета
- Quick Start Guide
- API Reference
- Configuration Guide

**Выходные артефакты:**
- `README.md` -- проектный README
- `docs/guides/quick-start.md`
- `docs/guides/configuration.md`
- `docs/api-reference.md`

**Git Commit (ОБЯЗАТЕЛЬНО):**
```bash
git add README.md docs/guides/ docs/api-reference.md
git commit -m "docs: add user documentation, guides and API reference"
```

**НЕ делает:**
- НЕ пишет техническую документацию для разработчиков (Solution Architect)
- НЕ пишет тесты

---

### Release/DevOps Agent
**Ответственность:**
- Настройка CI/CD (GitHub Actions)
- Настройка monorepo root (package.json, tsconfig.json)
- Настройка linting (ESLint + Biome) и formatting (Prettier)
- Настройка build pipeline (tsup/esbuild)
- Versioning и changelog
- Подготовка npm publish конфигурации

**Выходные артефакты:**
- `.github/workflows/*.yml` -- CI/CD pipelines
- `package.json` (root) -- monorepo workspace configuration
- `tsconfig.json` (root) -- shared TypeScript configuration
- `.eslintrc.*`, `.prettierrc`, `biome.json` -- линтинг и форматирование
- `CHANGELOG.md`

**Git Commit (ОБЯЗАТЕЛЬНО):**
```bash
git add .github/ package.json tsconfig.json .eslintrc.* .prettierrc biome.json CHANGELOG.md
git commit -m "chore: configure CI/CD, linting, build pipeline and monorepo root"
```

**НЕ делает:**
- НЕ пишет production код пакетов
- НЕ управляет релизами без approval от разработчика

---

## 5. Artifact Flow

### Фаза 0: Infrastructure (prerequisite)
```
Release/DevOps --> [monorepo root config, CI/CD, linting, build]
```

### Фаза 1: Research & Architecture (MVP prep)
```
Research Agent --> openclaw-analysis.md
                 --> upstream-api-contracts.md
                 --> migration-path.md
                        |
                        v
Solution Architect --> architecture.md
                   --> package-interfaces.md
                   --> data-schema.md
                   --> dependency-graph.md
                   --> api-specification.md
                        |
                        v
TDD Planner --> test-plan.md
             --> test-scenarios-*.md
```

### Фаза 2: MVP Development
```
Developer (ts-backend) --> packages/gateway/
                        --> packages/agent/
                        --> packages/skills-core/ (filesystem, shell)
                        |
                        +--> [parallel] Developer (ts-cli) --> packages/cli/
                        |
                        v
Test Engineer --> unit tests for gateway, agent, skills-core
              --> integration tests
              --> e2e smoke tests
                        |
                        v
Code Reviewer --> review-gateway.md, review-agent.md, review-skills-core.md
                        |
                        v
Feature Verifier --> verification-gateway.md, verification-agent.md, verification-skills-core.md
```

### Фаза 3: V1 Extensions
```
Developer (ts-backend) --> packages/memory/ --> packages/skills-osai/
                        --> packages/observability/
                        |
                        +--> [parallel] Developer (ts-system) --> packages/os-integration/
                        |
                        +--> [parallel] Developer (ts-frontend) --> apps/dashboard/
                        |
                        v
Test Engineer --> tests for all new packages
                        |
                        v
Code Reviewer --> review for all new packages
                        |
                        v
Feature Verifier --> verification for all new packages
                        |
                        v
System Verifier --> system-verification.md (full integration test)
                        |
                        v
Documentation Agent --> user documentation
```

### Порядок разработки пакетов (с учётом зависимостей)

```
Level 0 (no deps):  monorepo root config
Level 1 (no deps):  os-integration (standalone OS integration)
Level 2 (OpenClaw): gateway (fork+adapt)
Level 3 (OpenClaw): agent (fork+adapt, depends on gateway)
Level 4 (agent):    skills-core (depends on agent skills loader)
Level 5 (agent):    memory (depends on agent hooks)
Level 6 (memory):   skills-osai (depends on memory package)
Level 7 (gateway):  observability (cross-cutting, depends on gateway+agent)
Level 8 (gateway):  cli (depends on gateway WS client)
Level 9 (gateway):  dashboard (depends on gateway WS client)
```

**Параллелизация возможна:**
- Level 1 (os-integration) параллельно с Level 2-3 (gateway, agent)
- Level 7 (observability) параллельно с Level 6 (skills-osai)
- Level 8 (cli) параллельно с Level 9 (dashboard)

---

## 6. Human-in-the-Loop Control Points

### Mandatory Approval Points

| # | Control Point | Когда | Что показывается | Возможные решения |
|---|--------------|-------|-----------------|-------------------|
| H1 | **Research Approval** | После стадии A1 (Research) | openclaw-analysis.md, migration-path.md | Approve / Request additional research / Adjust scope |
| H2 | **Architecture Approval** | После стадии A2+Solution Architect | architecture.md, package-interfaces.md, data-schema.md, dependency-graph.md | Approve / Request changes / Redesign specific parts |
| H3 | **MVP Gate** | После завершения всех MVP стадий (A1-A9) | Smoke test results, CLI demo, working chat | Approve MVP / Request fixes / Pivot |
| H4 | **Domain Approval** | Перед началом каждого V1 домена | Доменный план, estimated scope | Approve / Defer / Modify scope |
| H5 | **V1 Gate** | После завершения всех V1 стадий (B1-B10) | Full system verification report, e2e test results | Approve V1 / Request fixes / Mark as beta |
| H6 | **V2 Planning** | После V1 approval | V2 roadmap proposal | Approve / Prioritize / Defer |

### Optional Review Points

| # | Review Point | Когда | Формат |
|---|-------------|-------|--------|
| R1 | Code Review | После каждого домена | review-{domain}.md |
| R2 | Test Results | После тестирования каждого домена | Test report (vitest output) |
| R3 | Security Review | После security-critical доменов (sandbox, permissions, audit) | Security findings report |

---

## 7. Quality Gates and Scoring

### Quality Gate Framework

Для каждого домена/пакета рассчитывается composite quality score.

### Критерии оценки

| Критерий | Вес | Минимум | Измерение |
|----------|------|---------|-----------|
| **Test Coverage** | 25% | 70% unit, 50% integration | vitest --coverage |
| **TypeScript Strictness** | 15% | 100% no `any`, no `// @ts-ignore` | tsc --strict |
| **Lint Compliance** | 10% | 0 errors, 0 warnings | eslint + biome |
| **Spec Compliance** | 20% | 100% Must Have features | Feature Verifier checklist |
| **Backward Compatibility** | 15% | No breaking changes to OpenClaw API | Integration tests against OpenClaw contract |
| **Security Compliance** | 15% | 0 critical, 0 high findings | Security review + audit log coverage |

### Composite Score Thresholds

| Score Range | Результат | Действие |
|-------------|-----------|----------|
| 90-100 | PASS -- Excellent | Продолжить к следующей стадии |
| 80-89 | PASS -- Acceptable | Продолжить с minor improvements |
| 70-79 | CONDITIONAL -- Needs Work | Исправить критические замечания, повторная проверка |
| 60-69 | FAIL -- Significant Issues | Вернуться к разработке, повторный review |
| < 60 | FAIL -- Critical Issues | Остановка, пересмотр архитектуры |

### Специфические gates для доменов

**Security-critical домены** (skills-core, memory, observability):
- Минимальный composite score: 85
- Security compliance: минимум 90
- Mandatory penetration test scenarios для sandbox

**Upstream-critical домены** (gateway, agent):
- Минимальный composite score: 85
- Backward compatibility: минимум 95
- Все OpenClaw WS protocol messages должны работать без изменений

**osaI-extension домены** (memory, skills-osai, observability, os-integration):
- Минимальный composite score: 75
- Допустимы экспериментальные extensions с пониженным стандартом (но security = минимум 80)

**UI домены** (cli, dashboard):
- Минимальный composite score: 70
- UX review required перед approval

---

## 8. Parallel Execution Rules

### Разрешённая параллельная работа

| Группа | Домены/Стадии | Условие параллелизма |
|--------|--------------|---------------------|
| **Infrastructure + Research** | Release/DevOps + Research Agent | Независимые -- monorepo setup не зависит от анализа OpenClaw |
| **OS Integration** | os-integration | Полностью standalone, нет зависимостей от OpenClaw |
| **Core Backend** | gateway + agent | Последовательно (agent зависит от gateway) |
| **Skills + CLI** | skills-core + cli | CLI зависит от gateway (WS client), но можно разрабатывать параллельно если gateway API стабилизирован |
| **V1 Extensions** | memory + observability + os-integration | Пакеты независимы, могут разрабатываться параллельно |
| **UI Layer** | cli + dashboard | Оба зависят от gateway WS client, но между собой независимы |
| **Testing** | Unit tests (per package) параллельно с разработкой следующего пакета | Тесты пакета N могут писаться параллельно с разработкой пакета N+1 |

### Запрещённая параллельная работа

| Ограничение | Причина |
|------------|---------|
| agent НЕ может разрабатываться параллельно с gateway | Agent runtime зависит от gateway WS protocol |
| skills-osai НЕ может разрабатываться без memory | Skills-osai использует memory package для remember/recall |
| dashboard НЕ может разрабатываться без gateway | Dashboard подключается к gateway WS |
| Test Engineer НЕ может тестировать до завершения Developer | Тесты пишутся по готовому API |

### Synchronization Points

| Sync Point | Что ждёт | Перед чем продолжить |
|------------|---------|---------------------|
| SP1: Gateway Stable | gateway package passes quality gate | Начало agent, cli, dashboard |
| SP2: Agent Stable | agent package passes quality gate | Начало skills-core, memory, observability |
| SP3: Memory Stable | memory package passes quality gate | Начало skills-osai |
| SP4: All V1 Packages Stable | Все V1 пакеты проходят quality gate | System Verifier, Integration testing |

---

## 9. Change and Regeneration Policy

### Запрос изменений

Изменения вносятся через Pipeline Orchestrator по запросу человека.

**Типы изменений:**
1. **Scope change** -- добавление/удаление домена или functionality
2. **Priority change** -- изменение порядка разработки
3. **Architecture change** -- изменение интерфейсов между пакетами
4. **Quality gate adjustment** -- изменение порогов качества
5. **Bug fix** -- исправление найденных дефектов

### Процесс внесения изменений

1. Pipeline Orchestrator получает запрос на изменение
2. Определяет affected agents и stages
3. Перезапускает затронутых агентов с обновлённым контекстом
4. Запускает верификацию затронутых пакетов

### Правила перегенерации

| Тип изменения | Затронутые агенты | Перезапуск |
|--------------|-------------------|-----------|
| Изменение PROJECT_PROFILE.md | Все агенты | Полная перегенерация pipeline |
| Изменение доменной спецификации | Solution Architect + Developer (domain) + Test Engineer | Частичная перегенерация |
| Добавление нового домена | Solution Architect + TDD Planner + Developer + Test Engineer + Code Reviewer | Частичная, новая ветка pipeline |
| Исправление бага | Developer (domain) + Test Engineer | Минимальная |
| Изменение quality gates | Все агенты (следующие запуски) | Без перегенерации, новые пороги |

### Versioning

- PIPELINE_PROMPT.md получает semantic version (vX.Y)
- X (major) -- структурные изменения в pipeline stages
- Y (minor) -- добавление/удаление агентов, изменение quality gates
- Предыдущие версии сохраняются в `docs/project/pipeline-prompts/`

---

## 10. Termination Conditions

### Успешное завершение

Pipeline считается успешно завершённым когда:

**Для MVP:**
- Все MVP стадии (A1-A9) завершены
- Gateway + Agent + Skills (filesystem, shell) + CLI работают
- LLM integration (Claude + Ollama) функционирует
- File sandbox + permissions работают
- Quality gate для каждого домена >= 80
- Human approval H3 получен

**Для V1:**
- Все V1 стадии (B1-B10) завершены
- Memory system (SQLite + Qdrant + RAG) работает
- Observability (OpenTelemetry) интегрировано
- OS Integration (tray, notifications) работает
- Web Dashboard функционален
- Минимум 2 мессенджер-канала подключены
- System verification пройден (score >= 80)
- Human approval H5 получен

**Для V2:**
- По аналогии с V1, но extended scope
- Human approval на V2 roadmap получен

### Принудительная остановка

Pipeline останавливается при:

1. **Critical security vulnerability** в любом домене -- немедленная остановка до исправления
2. **Breaking change от OpenClaw upstream** -- остановка, анализ impact, планирование адаптации
3. **Quality gate failure (< 60)** -- остановка, пересмотр подхода к домену
4. **Human request** -- остановка по запросу через Pipeline Orchestrator
5. **Unresolvable dependency** -- пакет не может быть реализован из-за внешних ограничений
6. **Repeated quality gate failure** (3 попытки) -- эскалация к человеку для принятия решения

---

## 11. Final Outputs

### Документация

| Артефакт | Расположение | Этап |
|----------|-------------|------|
| PROJECT_PROFILE.md | `docs/project/` | Input (уже создан) |
| PIPELINE_PROMPT.md | `docs/project/` | Input (этот документ) |
| OpenClaw Analysis | `docs/research/openclaw-analysis.md` | A1 |
| Architecture | `docs/develop/architecture.md` | A2 |
| Package Interfaces | `docs/develop/package-interfaces.md` | A2 |
| Data Schema | `docs/develop/data-schema.md` | A2 |
| Dependency Graph | `docs/develop/dependency-graph.md` | A2 |
| API Specification | `docs/develop/api-specification.md` | A2 |
| Test Plan | `docs/develop/test-plan.md` | A2 |
| Code Reviews | `docs/develop/review-{domain}.md` | Per domain |
| Verifications | `docs/develop/verification-{domain}.md` | Per domain |
| System Verification | `docs/develop/system-verification.md` | Macro-stage end |
| User Documentation | `docs/guides/`, `README.md` | Post-development |

### Исходный код

| Артефакт | Расположение | Домен |
|----------|-------------|-------|
| Gateway Package | `packages/gateway/` | gateway |
| Agent Package | `packages/agent/` | agent |
| Skills Core | `packages/skills-core/` | skills-core |
| Skills osaI | `packages/skills-osai/` | skills-osai |
| Memory System | `packages/memory/` | memory |
| Observability | `packages/observability/` | observability |
| OS Integration | `packages/os-integration/` | os-integration |
| CLI Client | `packages/cli/` | cli |
| Web Dashboard | `apps/dashboard/` | dashboard |

### Тесты

| Артефакт | Расположение |
|----------|-------------|
| Unit Tests | `packages/{domain}/src/**/*.test.ts` |
| Integration Tests | `tests/integration/**/*.test.ts` |
| E2E Tests | `tests/e2e/**/*.test.ts` |
| Test Fixtures | `tests/fixtures/` |

### Инфраструктура

| Артефакт | Расположение |
|----------|-------------|
| CI/CD Pipelines | `.github/workflows/*.yml` |
| Root Config | `package.json`, `tsconfig.json` |
| Linting Config | `.eslintrc.*`, `biome.json`, `.prettierrc` |
| Build Config | `tsup.config.ts` (per package) |
| Changelog | `CHANGELOG.md` |

---

## Приложение A: Специфика Fork/Extension Pipeline

### Принципы работы с upstream (OpenClaw)

1. **Minimal modification:** Код OpenClaw модифицируется минимально. osaI extensions реализуются в отдельных пакетах, которые подключаются через hook points.

2. **Abstraction layer:** Все точки интеграции с OpenClaw оборачиваются в abstraction interfaces. Если OpenClaw изменит API, потребуется изменить только адаптерный слой.

3. **Pin version:** OpenClaw фиксируется на конкретной версии (semver). Upstream updates проходят через отдельный процесс адаптации.

4. **Fork isolation:** Модификации upstream кода (если необходимы) чётко отделяются комментариями `// osaI: modification reason`.

5. **Compatibility testing:** Каждый release osaI тестируется на совместимость с текущей pinned версией OpenClaw.

### Стратегия разделения ответственности

| Компонент | Источник | Стратегия |
|-----------|---------|-----------|
| Gateway (WS protocol) | OpenClaw | Fork + minimal adaptation |
| Agent Runtime (loop, hooks) | OpenClaw | Fork + osaI-specific hooks |
| Skills System (loader, registry) | OpenClaw | Fork + osaI skill directories |
| Session Model | OpenClaw | Fork as-is |
| Docker Sandbox | OpenClaw | Fork as-is |
| Model Failover | OpenClaw | Fork + osaI embedding model |
| Memory (short-term) | OpenClaw | Fork + osaI extensions |
| Memory (long-term, RAG) | osaI | New package |
| Observability (OTel) | osaI | New package |
| OS Integration | osaI | New package |
| CLI Client | osaI | New package |
| Web Dashboard | osaI | New app |
| osaI Skills | osaI | New package |

---

## Приложение B: Dependency Graph (Порядок разработки)

```
                    +--------+
                    |  Root  | (monorepo config)
                    +---+----+
                        |
            +-----------+-----------+
            |                       |
    +-------v------+       +--------v-------+
    |   Research   |       |   DevOps/CI    |
    +-------+------+       +----------------+
            |
    +-------v------+
    |  Architecture |
    +-------+------+
            |
    +-------v------+
    |   TDD Plan   |
    +-------+------+
            |
    +-------v------+
    |   Gateway    | (OpenClaw fork)
    +---+----+-----+
        |    |
        |    +-----------------+
        |                      |
+-------v------+      +--------v------+
|    Agent     |      |  OS-Integr.   | (parallel, standalone)
+---+----+-----+      +---------------+
    |
+---v-----------+
|  Skills-Core  | (filesystem, shell)
+---+-----------+
    |
+---v-----------+
|    Memory     | (SQLite + Qdrant + RAG)
+---+-----------+
    |
+---v-----------+
|  Skills-osaI  | (memory, kb, os skills)
+---+-----------+
    |
+---v-----------------+
|   Observability     | (cross-cutting)
+---+-----------------+
    |
    +----+--------+
         |        |
  +------v--+  +--v---------+
  |   CLI   |  | Dashboard  | (parallel)
  +---------+  +------------+
```
