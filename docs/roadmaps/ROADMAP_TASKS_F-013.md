# Task Roadmap: Cross-Platform + Testing (F-013)

**Version:** v1.0
**Date:** 2026-03-30
**Author:** TDD Planner Agent
**Status:** Active

---

## Feature F-013: Cross-Platform + Testing
**Domain:** Cross-cutting (все домены) | **Dependencies:** F-001..F-012 | **Branch:** feature/cross-platform-testing

---

### Task T-001: Vitest Configuration + Unit Test Infrastructure

**Domain:** Cross-cutting | **Dependencies:** None | **Estimated:** 2-3h

#### Scope
- **In scope:** Настройка vitest для monorepo: root vitest.config.ts, workspace-resolved тесты, coverage (v8), test helpers, mock patterns для SQLite/WebSocket/child_process, скрипты в package.json
- **Out scope:** Написание самих unit tests -- только инфраструктура и примеры

#### Checklist
- [ ] CODE: `vitest.config.ts` (root) -- workspace resolver, coverage (v8), reporters, test timeout, setup files
- [ ] CODE: `vitest.workspace.ts` -- включение всех packages/*/vitest.config.ts
- [ ] CODE: `tests/helpers/mock-fs.ts` -- утилиты для temporary directories и cleanup
- [ ] CODE: `tests/helpers/mock-sqlite.ts` -- in-memory SQLite фабрика для тестов
- [ ] CODE: `tests/helpers/mock-ws.ts` -- WS server/client тестовые утилиты
- [ ] CODE: `tests/setup.ts` -- глобальный setup (env variables, cleanup)
- [ ] CODE: Обновить `package.json` -- скрипты: `test`, `test:unit`, `test:coverage`, `test:ci`
- [ ] CODE: `.nvmrc` или `.node-version` -- pin Node.js 22.16+ LTS
- [ ] TEST: `tests/unit/examples/config-smoke.test.ts` -- базовый smoke test, подтверждающий работу конфигурации
- [ ] BUILD: `pnpm install` + `pnpm test:unit` -- vitest запускается и находит тесты

#### Acceptance
- `pnpm test:unit` запускается и выполняет smoke test
- Coverage reporter генерирует отчёт (v8 provider)
- `tests/helpers/` содержит переиспользуемые mock-утилиты
- Все workspace packages включены в vitest workspace resolver
- Тесты изолированы: temp directories очищаются после каждого test suite

---

### Task T-002: Unit Tests -- Core Packages (gateway, agent, providers)

**Domain:** DOMAIN-001, DOMAIN-002, DOMAIN-008 | **Dependencies:** T-001 | **Estimated:** 3-4h

#### Scope
- **In scope:** Unit tests для критических модулей: Gateway WS server, Chat Router, Agent Loop pipeline, Provider Chain + Circuit Breaker. Mocking внешних зависимостей (SQLite, LLM API, WebSocket)
- **Out scope:** Integration tests между пакетами -- только изолированные unit tests

#### Checklist
- [ ] TEST: `tests/unit/gateway/ws-server.test.ts` -- WS handshake, message routing, connection lifecycle, error handling
- [ ] TEST: `tests/unit/gateway/chat-router.test.ts` -- chat_id resolution, context isolation, switch
- [ ] TEST: `tests/unit/agent/agent-loop.test.ts` -- pipeline: intake -> context -> inference -> tools -> persistence, tool_use loop
- [ ] TEST: `tests/unit/agent/hooks.test.ts` -- hook registration, before/after execution, error propagation
- [ ] TEST: `tests/unit/providers/provider-chain.test.ts` -- failover (Z.ai -> Yandex -> Anthropic -> OpenAI -> Ollama), circuit breaker state transitions (closed/open/half-open), auth rotation при 429
- [ ] TEST: `tests/unit/providers/circuit-breaker.test.ts` -- failure counting, threshold, reset_timeout, half-open probe
- [ ] BUILD: `pnpm build` + `pnpm test:unit` -- все тесты проходят

#### Acceptance
- Gateway WS: подключение, отправка сообщения, routing -- все покрываются
- Agent Loop: корректный pipeline execution, tool_use loop (повторный вызов)
- Provider Chain: failover по цепочке, circuit breaker открыт/закрыт/половинчатый
- Все unit tests изолированы от внешних сервисов (mock SQLite, mock HTTP)
- Coverage >= 80% для тестируемых модулей

---

### Task T-003: Unit Tests -- Data Packages (memory, knowledge-base, skills)

**Domain:** DOMAIN-003, DOMAIN-004, DOMAIN-005 | **Dependencies:** T-001 | **Estimated:** 3-4h

#### Scope
- **In scope:** Unit tests для Memory System (трёхуровневая память, context window manager), Knowledge Base (ingest pipeline, semantic search), Skills System (registry, execution, permissions). Mocking sqlite-vec, embedding providers
- **Out scope:** Интеграционные тесты между пакетами

#### Checklist
- [ ] TEST: `tests/unit/memory/memory-manager.test.ts` -- query/store/forget, chat/session/long-term разделение
- [ ] TEST: `tests/unit/memory/context-window.test.ts` -- pruning priority, summarization threshold, reserved tokens
- [ ] TEST: `tests/unit/memory/rag-pipeline.test.ts` -- embed -> vector search -> filter -> inject (mock embeddings)
- [ ] TEST: `tests/unit/knowledge-base/ingest.test.ts` -- parse -> chunk -> embed -> store (mock vector storage)
- [ ] TEST: `tests/unit/knowledge-base/search.test.ts` -- query -> embed -> vector search -> source attribution
- [ ] TEST: `tests/unit/skills/registry.test.ts` -- register/getTools/execute/enable/disable/reload
- [ ] TEST: `tests/unit/skills/filesystem-skill.test.ts` -- read_file, write_file, list_dir, sandbox check
- [ ] TEST: `tests/unit/skills/shell-skill.test.ts` -- exec, blocked commands, timeout enforcement
- [ ] BUILD: `pnpm build` + `pnpm test:unit` -- все тесты проходят

#### Acceptance
- Memory: трёхуровневое разделение работает корректно, context pruning по приоритету
- Knowledge Base: ingest pipeline обрабатывает txt/md, chunking с overlap, search возвращает результаты с source attribution
- Skills: registry управляет lifecycle, Filesystem skill проверяет sandbox, Shell skill блокирует опасные команды
- Coverage >= 80% для тестируемых модулей

---

### Task T-004: Integration Tests -- Cross-Module Scenarios

**Domain:** Cross-cutting | **Dependencies:** T-002, T-003 | **Estimated:** 3-4h

#### Scope
- **In scope:** Интеграционные тесты для критических cross-module взаимодействий: Gateway <-> Agent <-> Provider (полный запрос), Memory <-> Agent (RAG context injection), Skills <-> Agent (tool execution loop), Circuit Breaker <-> Provider Chain (failover под нагрузкой)
- **Out scope:** E2E с реальными LLM API (используются mocks), Telegram integration (тестируется в F-010)

#### Checklist
- [ ] TEST: `tests/integration/full-request.test.ts` -- WS message -> Gateway -> Agent -> Provider (mock) -> response -> WS delivery
- [ ] TEST: `tests/integration/tool-execution.test.ts` -- Agent loop: request -> tool_use -> skill execution -> tool_result -> final response
- [ ] TEST: `tests/integration/rag-context.test.ts` -- Agent с RAG: message -> memory query -> context injection -> LLM call
- [ ] TEST: `tests/integration/failover-scenario.test.ts` -- Provider A down -> circuit breaker opens -> failover to Provider B -> recovery
- [ ] TEST: `tests/integration/chat-lifecycle.test.ts` -- create -> switch -> archive -> delete чата через Gateway
- [ ] TEST: `tests/integration/permission-flow.test.ts` -- write tool call -> permission_request -> user approve -> execution
- [ ] CODE: `tests/integration/setup.ts` -- интеграционный setup: in-memory SQLite, mock LLM server, test fixtures
- [ ] BUILD: `pnpm build` + `pnpm test:unit` + `pnpm test:integration` -- все тесты проходят

#### Acceptance
- Полный запрос через систему (Gateway -> Agent -> LLM mock -> response) работает
- Tool execution loop: tool_use -> execution -> result -> continuation -> final answer
- RAG: контекст из memory инжектируется в промпт перед LLM вызовом
- Failover: при падении провайдера -- переключение на следующего, circuit breaker корректен
- Chat lifecycle: CRUD + switch + archive без потери данных
- Permission flow: write/exec операции требуют подтверждения

---

### Task T-005: E2E Tests -- Critical User Scenarios

**Domain:** Cross-cutting | **Dependencies:** T-004 | **Estimated:** 3-4h

#### Scope
- **In scope:** E2E тесты критичных пользовательских сценариев с реальными процессами (child_process, SQLite на диске, WS соединения). Запуск Gateway + Agent + mock LLM. CLI команды через child_process
- **Out scope:** Тестирование с реальными LLM API, Telegram E2E (требует реальные credenrials)

#### Checklist
- [ ] CODE: `tests/e2e/setup.ts` -- E2E test environment: запуск Gateway, Agent, mock LLM server, cleanup
- [ ] TEST: `tests/e2e/chat-basic.test.ts` -- CLI connect -> send message -> receive response -> verify in SQLite
- [ ] TEST: `tests/e2e/file-operation.test.ts` -- create file via agent -> permission prompt -> approve -> verify file exists
- [ ] TEST: `tests/e2e/chat-switch.test.ts` -- create 2 chats -> switch between -> verify context isolation
- [ ] TEST: `tests/e2e/memory-persistence.test.ts` -- chat with facts -> new chat -> recall facts from long-term memory
- [ ] TEST: `tests/e2e/provider-failover.test.ts` -- primary LLM down -> automatic failover -> response received
- [ ] CODE: `tests/e2e/mock-llm-server.ts` -- HTTP mock server (OpenAI-compatible) для E2E
- [ ] BUILD: `pnpm build` + `pnpm test` (unit + integration + e2e) -- все тесты проходят

#### Acceptance
- [NFR-M02] E2E тесты покрывают критичные сценарии (chat, file ops, chat switch, memory, failover)
- E2E: пользователь отправляет сообщение через CLI -> получает ответ -> данные сохранены в SQLite
- E2E: file operation с permission prompt -- approve -> файл создан
- E2E: переключение чатов -- контекст изолирован
- E2E: провайдер недоступен -- failover на следующего -- ответ получен
- E2E mock LLM server корректно эмулирует OpenAI-compatible API

---

### Task T-006: Cross-Platform Support (Linux + Windows)

**Domain:** Cross-cutting | **Dependencies:** None (можно параллельно с T-001..T-005) | **Estimated:** 2-3h

#### Scope
- **In scope:** Платформенно-зависимый код: path resolution (POSIX vs Windows), file permissions, child_process spawn (shell: true vs cmd.exe), native modules prebuild (better-sqlite3, sqlite-vec), platform detection utility, .github/workflows CI matrix
- **Out scope:** macOS support, system tray, voice (V1)

#### Checklist
- [ ] CODE: `packages/shared/src/platform.ts` -- утилита: isLinux, isWindows, pathSeparator, shell, env, homeDir
- [ ] CODE: Обновить все `path.join()` / `fs` вызовы -- использование `path.join()`, `os.homedir()`, `os.tmpdir()` (никаких hardcoded `/` или `\`)
- [ ] CODE: Обновить child_process spawn -- shell option зависит от platform (Linux: `/bin/sh`, Windows: `cmd.exe`)
- [ ] CODE: `scripts/check-native-modules.ts` -- скрипт проверки native module prebuild binaries
- [ ] CODE: Обновить `package.json` -- optionalDependencies для платформенно-специфичных пакетов
- [ ] TEST: `tests/unit/shared/platform.test.ts` -- detection, path resolution, shell selection
- [ ] BUILD: `pnpm build` -- компиляция без ошибок
- [ ] BUILD: Verify native modules собираются (или prebuild binaries доступны) на текущей платформе

#### Acceptance
- Все path operations используют `path.join()` -- никаких hardcoded разделителей
- child_process spawn корректно работает на обеих платформах
- better-sqlite3 и sqlite-vec собираются или загружают prebuild binaries
- Platform detection utility корректно определяет ОС
- CI matrix (T-007) проходит на обеих платформах

---

### Task T-007: GitHub Actions CI -- Linux + Windows Matrix

**Domain:** Cross-cutting | **Dependencies:** T-001, T-005, T-006 | **Estimated:** 2-3h

#### Scope
- **In scope:** GitHub Actions workflow: matrix (ubuntu-latest, windows-latest), install deps (pnpm + Node.js 22), build, test (unit + integration + e2e), coverage upload, native modules verification. Trigger на push/PR к main branch
- **Out scope:** Release pipeline, Docker build, deployment

#### Checklist
- [ ] CODE: `.github/workflows/ci.yml` -- matrix: ubuntu-latest + windows-latest
- [ ] CODE: CI steps: checkout -> setup Node 22 -> setup pnpm -> install -> build -> test:unit -> test:integration -> test:e2e -> coverage report
- [ ] CODE: Native modules step: verify better-sqlite3 + sqlite-vec загрузились корректно
- [ ] CODE: Coverage artifact upload (GitHub Actions artifacts)
- [ ] CODE: `.github/dependabot.yml` -- автоматические обновления зависимостей (weekly)
- [ ] CODE: Обновить `package.json` -- скрипт `test:ci` для CI-среды (без interactive TUI)
- [ ] BUILD: Локально: `pnpm build && pnpm test:ci` -- все тесты проходят
- [ ] RUN: Verify CI workflow syntax: `actionlint .github/workflows/ci.yml` (опционально)

#### Acceptance
- [FR-029] CI запускается на каждом push/PR к OSAI-DEV
- [NFR-M02] Matrix: ubuntu-latest и windows-latest -- обе платформы проходят
- Сборка (`pnpm build`) успешна на обеих платформах
- Все тесты (unit + integration + e2e) проходят на обеих платформах
- Coverage report загружается как artifact
- CI завершается за <= 15 минут (цель)

---

## Dependencies Summary

```
T-001 (Vitest Config + Infrastructure)
  |
  +-- T-002 (Unit: gateway/agent/providers)
  |
  +-- T-003 (Unit: memory/kb/skills)
  |
  +-- T-004 (Integration Tests) ---- depends: T-002, T-003
  |    |
  |    +-- T-005 (E2E Tests) ---- depends: T-004
  |
  +-- T-007 (CI GitHub Actions) ---- depends: T-001, T-005, T-006

T-006 (Cross-Platform) ---- independent, parallel with T-001..T-005
```

**Parallel groups:**
- Group 1: T-001, T-006 (parallel)
- Group 2: T-002, T-003 (parallel after T-001)
- Group 3: T-004 (after T-002, T-003)
- Group 4: T-005 (after T-004)
- Group 5: T-007 (after T-005, T-006)

## Quality Expectations

- Unit tests: >= 80% coverage для core modules (gateway, agent, providers, memory, skills)
- Integration tests: все critical cross-module interactions покрыты
- E2E tests: >= 5 критичных пользовательских сценариев
- Build stability: `pnpm build` и `pnpm test` проходят на Linux и Windows
- CI: green на обоих платформах
- Test isolation: каждый test suite независим, temp directories очищаются
- Test speed: unit < 30s, integration < 2min, e2e < 5min (цель)

## Risks

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|------------|
| better-sqlite3/sqlite-vec prebuild недоступен на Windows (R-ARCH-05) | 20% | Medium | CI ранняя проверка; fallback на manual build; документация |
| E2E тесты нестабильны (flaky) | 30% | Medium | Retry mechanism в CI, timeout management, isolated test DB |
| child_process spawn различия Linux vs Windows | 25% | Low | T-006: platform detection utility, shell option, CI на обеих платформах |
| vitest workspace resolver конфликты с pnpm | 15% | Low | Ранний прототип в T-001, fallback на отдельные vitest runs |
| E2E mock LLM server нестабилен | 20% | Low | Минимальный mock (только OpenAI chat completions), хост: random port |

---

**Version:** v1.0
**Author:** TDD Planner Agent
