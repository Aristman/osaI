# Task Roadmap: Agent Runtime (F-008)

**Version:** v1.0
**Date:** 2026-03-30
**Author:** TDD Planner Agent
**Status:** Active

---

## 1. Feature Overview

- **Feature ID:** F-008
- **Feature Name:** Agent Runtime
- **Description:** Полный agent loop: intake -> context_assembly -> model_inference -> tool_execution -> streaming -> persistence. 13 hook points (7 OpenClaw + 6 osaI). Tool execution loop (повторные вызовы при tool_use). Fact extraction в Long-term Memory.
- **Related Requirements:** FR-002, FR-011 (частично -- hook before_memory_query)
- **Domain:** DOMAIN-002
- **Agent Profile:** backend/AGENT_PROFILE_nodejs.md + backend/AGENT_PROFILE_backend-base.md
- **Git branch:** feature/agent-runtime

---

## 2. Dependencies

### 2.1 Feature Dependencies

- **F-001:** Core Infrastructure (blocking -- monorepo, TypeScript config, SQLite, pino)
- **F-002:** LLM Provider System (blocking -- ProviderChain для model inference)
- **F-003:** Observability Foundation (non-blocking -- audit logging, trace_id)
- **F-005:** Memory System (blocking -- RAG context, fact extraction)
- **F-007:** Skills System (blocking -- tool definitions, tool execution)

### 2.2 Task Dependencies

```
T-001 (Hook System) -------> T-002 (Context Assembly)
T-001 ----------------------> T-004 (Agent Loop Core)
T-002 ----------------------> T-003 (Model Inference)
T-003 ----------------------> T-004
T-004 ----------------------> T-005 (Tool Execution Loop)
T-004 ----------------------> T-006 (Streaming + Persistence)
T-005 ----------------------> T-007 (Fact Extraction)
T-006 ----------------------> T-007
T-005, T-006, T-007 -------> T-008 (Integration Test)
```

### 2.3 Development Order

**Последовательные группы:**
- Phase 1: T-001 (Hook System -- фундамент для всего)
- Phase 2 (parallel): T-002 + T-003 (Context Assembly и Model Inference -- независимы друг от друга, оба зависят от T-001)
- Phase 3: T-004 (Agent Loop Core -- объединяет T-001..T-003)
- Phase 4 (parallel): T-005 + T-006 (Tool Execution и Streaming/Persistence -- независимы)
- Phase 5: T-007 (Fact Extraction -- зависит от T-005, T-006)
- Phase 6: T-008 (Integration Test -- финальная верификация)

---

## 3. Task Breakdown

### Task T-001: Hook System (13 Hook Points)

**Domain:** DOMAIN-002 | **Dependencies:** None

**Description:**
Базовая система хуков: интерфейсы HookContext, HookHandler, HookRegistry. 13 хук-поинтов (7 OpenClaw + 6 osaI). Регистрация/удаление обработчиков. Вызов хуков с контекстом (sync + async). Пакет packages/agent/src/hooks/.

**Estimated Time:** 3 hours

**Scope:**
- **In scope:** HookRegistry, HookContext, 13 hook type definitions, register/unregister/emit (sync + async)
- **Out scope:** конкретные обработчики хуков (определяются в других задачах и фичах)

#### Checklist
- [ ] CODE: `packages/agent/package.json`
- [ ] CODE: `packages/agent/tsconfig.json`
- [ ] CODE: `packages/agent/src/types.ts` (AgentMessage, AgentResponse, ToolCall, AgentConfig)
- [ ] CODE: `packages/agent/src/hooks/types.ts` (HookName -- union 13 хуков, HookContext, HookHandler, HookResult)
- [ ] CODE: `packages/agent/src/hooks/HookRegistry.ts` (register, unregister, emit, emitAsync)
- [ ] CODE: `packages/agent/src/hooks/index.ts`
- [ ] CODE: `packages/agent/src/index.ts`
- [ ] TEST: `packages/agent/src/hooks/__tests__/HookRegistry.test.ts`
- [ ] BUILD: `pnpm --filter @osai/agent build`

#### Acceptance
- HookRegistry создаётся без ошибок
- register() добавляет обработчик для конкретного хука по имени
- emit() вызывает все обработчики синхронно, передаёт HookContext
- emitAsync() вызывает все обработчики последовательно (await each), поддерживает async handlers
- unregister() удаляет обработчик
- Все 13 хук-поинтов определены как union type HookName
- HookContext содержит trace_id, chat_id, session_id и extensible data
- Все unit tests проходят

---

### Task T-002: Context Assembly

**Domain:** DOMAIN-002 | **Dependencies:** T-001

**Description:**
Модуль сборки контекста для LLM запроса: загрузка истории чата из SQLite, вызов RAG (before_memory_query hook), инъекция RAG результатов в system prompt (before_prompt_build hook), формирование финального messages array. Пакет packages/agent/src/context/.

**Estimated Time:** 3 hours

**Scope:**
- **In scope:** ContextAssembler, messages array construction, hook integration (before_memory_query, before_prompt_build), chat history loading, RAG context injection
- **Out scope:** LLM вызов (T-003), tool results append (T-005)

#### Checklist
- [ ] CODE: `packages/agent/src/context/ContextAssembler.ts`
- [ ] CODE: `packages/agent/src/context/types.ts` (ContextAssemblyInput, ContextAssemblyResult)
- [ ] CODE: `packages/agent/src/context/index.ts`
- [ ] TEST: `packages/agent/src/context/__tests__/ContextAssembler.test.ts`
- [ ] BUILD: `pnpm --filter @osai/agent build`

#### Acceptance
- ContextAssembler загружает историю чата и формирует messages array
- Вызывает before_memory_query hook перед RAG поиском
- Вызывает before_prompt_build hook перед финальной сборкой
- RAG результаты инжектируются в system prompt как ## Relevant Memory section
- Chat history правильно форматируется в [{role, content}] format
- Все external dependencies (SQLite, Memory System) mock'ируются в тестах
- Все unit tests проходят

---

### Task T-003: Model Inference

**Domain:** DOMAIN-002 | **Dependencies:** T-001

**Description:**
Модуль вызова LLM через ProviderChain (F-002). Интеграция с before_model_resolve hook (выбор модели, rotation auth profiles). Поддержка streaming и non-streaming. Обработка tool_use response от LLM. Пакет packages/agent/src/inference/.

**Estimated Time:** 3 hours

**Scope:**
- **In scope:** InferenceService, делегирование в ProviderChain, before_model_resolve hook, streaming/nostreaming, tool_use detection
- **Out scope:** tool execution loop (T-005), response persistence (T-006)

#### Checklist
- [ ] CODE: `packages/agent/src/inference/InferenceService.ts`
- [ ] CODE: `packages/agent/src/inference/types.ts` (InferenceInput, InferenceResult)
- [ ] CODE: `packages/agent/src/inference/index.ts`
- [ ] TEST: `packages/agent/src/inference/__tests__/InferenceService.test.ts`
- [ ] BUILD: `pnpm --filter @osai/agent build`

#### Acceptance
- InferenceService принимает messages array и tools definitions
- Вызывает before_model_resolve hook для разрешения модели
- Делегирует в ProviderChain.execute() / ProviderChain.executeStream()
- Корректно обрабатывает tool_use response (возвращает toolCalls в результате)
- Non-streaming: возвращает полный LLMResponse
- Streaming: возвращает AsyncIterable<LLMChunk>
- ProviderChain mock'ируется в тестах
- Все unit tests проходят

---

### Task T-004: Agent Loop Core

**Domain:** DOMAIN-002 | **Dependencies:** T-001, T-002, T-003

**Description:**
Основной цикл агента: AgentLoop class, объединяющий intake -> context_assembly -> model_inference. Запуск через before_agent_start hook. Координация всех pipeline stages. AgentLoop.run() как точка входа. Обработка on_error hook. Пакет packages/agent/src/loop/.

**Estimated Time:** 4 hours

**Scope:**
- **In scope:** AgentLoop class, pipeline orchestration (intake -> context -> inference), before_agent_start/on_error hooks, agent_end hook, AgentLoop.run() public API
- **Out scope:** tool execution loop (T-005), streaming to client (T-006), persistence (T-006)

#### Checklist
- [ ] CODE: `packages/agent/src/loop/AgentLoop.ts`
- [ ] CODE: `packages/agent/src/loop/types.ts` (AgentLoopConfig, AgentLoopInput, AgentLoopOutput)
- [ ] CODE: `packages/agent/src/loop/index.ts`
- [ ] TEST: `packages/agent/src/loop/__tests__/AgentLoop.test.ts`
- [ ] BUILD: `pnpm --filter @osai/agent build`

#### Acceptance
- AgentLoop.run() принимает user message и возвращает agent response
- Pipeline: intake -> context_assembly -> model_inference -> agent_end
- before_agent_start hook вызывается в начале run()
- on_error hook вызывается при ошибке любого этапа
- agent_end hook вызывается при завершении (success или error)
- Ошибка в одном этапе не крашит весь loop (graceful degradation)
- ContextAssembler и InferenceService mock'ируются в тестах
- Все unit tests проходят

---

### Task T-005: Tool Execution Loop

**Domain:** DOMAIN-002 | **Dependencies:** T-004

**Description:**
Цикл выполнения tools: при tool_use response от LLM -> permission check (before_tool_call hook) -> dispatch в SkillRegistry.execute() -> result processing (after_tool_call hook) -> повторный вызов LLM с tool results. Цикл повторяется пока LLM возвращает tool_use. Max iterations guard (default 10).

**Estimated Time:** 4 hours

**Scope:**
- **In scope:** ToolExecutor, before_tool_call/after_tool_call hooks, tool_use loop, max iterations guard, permission check integration, SkillRegistry dispatch
- **Out scope:** permission UI (Gateway), specific tool implementations (F-007)

#### Checklist
- [ ] CODE: `packages/agent/src/loop/ToolExecutor.ts`
- [ ] CODE: `packages/agent/src/loop/__tests__/ToolExecutor.test.ts`
- [ ] BUILD: `pnpm --filter @osai/agent build`

#### Acceptance
- ToolExecutor получает tool_use response от LLM
- Вызывает before_tool_call hook перед каждым tool call
- Диспатчит tool call в SkillRegistry.execute()
- Вызывает after_tool_call hook после каждого tool call
- Appends tool results в messages array и повторяет LLM вызов
- Цикл прерывается когда LLM не возвращает tool_use
- Max iterations guard (default 10) предотвращает бесконечный цикл
- При достижении лимита -- возвращается последний результат с warning
- SkillRegistry и InferenceService mock'ируются в тестах
- Все unit tests проходят

---

### Task T-006: Streaming + Persistence

**Domain:** DOMAIN-002 | **Dependencies:** T-004

**Description:**
Streaming ответа от LLM клиенту (через callback/emitter) и персистенция в SQLite (chat_messages таблица). Интеграция agent_end hook. Сохранение user message + assistant response + tool calls. Пакет packages/agent/src/streaming/ и packages/agent/src/persistence/.

**Estimated Time:** 3 hours

**Scope:**
- **In scope:** StreamManager (streaming callback/emitter), PersistenceService (SQLite save), сохранение полного conversation turn
- **Out scope:** Gateway WebSocket delivery (F-009), fact extraction (T-007)

#### Checklist
- [ ] CODE: `packages/agent/src/streaming/StreamManager.ts`
- [ ] CODE: `packages/agent/src/streaming/types.ts` (StreamChunk, StreamCallback)
- [ ] CODE: `packages/agent/src/streaming/index.ts`
- [ ] CODE: `packages/agent/src/persistence/PersistenceService.ts`
- [ ] CODE: `packages/agent/src/persistence/index.ts`
- [ ] CODE: `packages/agent/src/streaming/__tests__/StreamManager.test.ts`
- [ ] CODE: `packages/agent/src/persistence/__tests__/PersistenceService.test.ts`
- [ ] BUILD: `pnpm --filter @osai/agent build`

#### Acceptance
- StreamManager получает AsyncIterable<LLMChunk> и вызывает callback для каждого chunk
- StreamManager поддерживает emit complete event
- PersistenceService сохраняет user message в SQLite (chat_messages)
- PersistenceService сохраняет assistant response в SQLite
- PersistenceService сохраняет tool calls и tool results
- Все записи содержат chat_id, session_id, trace_id
- SQLite dependency mock'ируется в тестах
- Все unit tests проходят

---

### Task T-007: Fact Extraction

**Domain:** DOMAIN-002 | **Dependencies:** T-005, T-006

**Description:**
Извлечение фактов из ответа LLM и tool results для сохранения в Long-term Memory. Интеграция с after_memory_extract hook. Вызов Memory System для хранения фактов. Вызывается после каждого завершённого agent loop iteration.

**Estimated Time:** 2 hours

**Scope:**
- **In scope:** FactExtractor, after_memory_extract hook, delegation в Memory System
- **Out scope:** Memory System internals (F-005), LLM-based fact extraction (может быть simple heuristic для MVP)

#### Checklist
- [ ] CODE: `packages/agent/src/memory/FactExtractor.ts`
- [ ] CODE: `packages/agent/src/memory/types.ts` (Fact, ExtractionResult)
- [ ] CODE: `packages/agent/src/memory/index.ts`
- [ ] CODE: `packages/agent/src/memory/__tests__/FactExtractor.test.ts`
- [ ] BUILD: `pnpm --filter @osai/agent build`

#### Acceptance
- FactExtractor вызывается после завершения agent loop (после agent_end hook)
- Извлекает факты из assistant response и tool results
- Вызывает after_memory_extract hook с extracted facts
- Делегирует сохранение в Memory System (store facts)
- Memory System dependency mock'ируется в тестах
- Ошибки extraction не блокируют agent loop (graceful degradation)
- Все unit tests проходят

---

### Task T-008: Integration Test -- Full Agent Loop

**Domain:** DOMAIN-002 | **Dependencies:** T-005, T-006, T-007

**Description:**
Финальные интеграционные тесты: полный agent loop от intake до persistence с tool execution loop. Все 13 хуков верифицируются. Smoke test сборки пакета. Тестирование error scenarios и graceful degradation.

**Estimated Time:** 4 hours

**Scope:**
- **In scope:** full agent loop integration, hook verification, error scenarios, build + test smoke
- **Out scope:** gateway integration (F-009), E2E через CLI (F-013)

#### Checklist
- [ ] TEST: `packages/agent/src/__tests__/integration/agent-loop.test.ts`
- [ ] TEST: `packages/agent/src/__tests__/integration/tool-execution-loop.test.ts`
- [ ] TEST: `packages/agent/src/__tests__/integration/hook-lifecycle.test.ts`
- [ ] TEST: `packages/agent/src/__tests__/integration/error-handling.test.ts`
- [ ] BUILD: `pnpm --filter @osai/agent build`
- [ ] BUILD: `pnpm --filter @osai/agent test`

#### Acceptance
- Полный loop: user message -> context assembly -> inference -> response -> persistence
- Tool execution loop: LLM возвращает tool_use -> tool executed -> LLM вызван снова -> финальный response
- Все 7 OpenClaw hooks вызываются в правильном порядке
- osaI-specific hooks (before_memory_query, after_memory_extract) вызываются корректно
- on_error hook вызывается при ошибке inference
- Graceful degradation: при ошибке Memory System agent loop продолжает без RAG
- Graceful degradation: при ошибке tool execution возвращается partial result
- Max iterations guard работает в tool execution loop
- Fact extraction вызывается после успешного completion
- Сборка пакета без ошибок
- Все tests проходят

---

## 4. Test Strategy (TDD)

### 4.1 Test Types per Task

| Task | Unit Tests | Integration Tests | Build Verification |
|------|-----------|-------------------|--------------------|
| T-001 | HookRegistry CRUD, emit/emitAsync, 13 hook names | -- | `pnpm --filter @osai/agent build` |
| T-002 | ContextAssembler, hook integration, message formatting | -- | `pnpm --filter @osai/agent build` |
| T-003 | InferenceService, tool_use detection, streaming/nostreaming | -- | `pnpm --filter @osai/agent build` |
| T-004 | AgentLoop pipeline, error handling, hook order | -- | `pnpm --filter @osai/agent build` |
| T-005 | ToolExecutor, iteration loop, max iterations guard | -- | `pnpm --filter @osai/agent build` |
| T-006 | StreamManager chunks, PersistenceService SQLite save | -- | `pnpm --filter @osai/agent build` |
| T-007 | FactExtractor, delegation, graceful degradation | -- | `pnpm --filter @osai/agent build` |
| T-008 | -- | Full agent loop, tool loop, hook lifecycle, errors | `pnpm --filter @osai/agent build && test` |

### 4.2 Build and Run Verification

**Build Verification (каждая задача):**
```bash
pnpm --filter @osai/agent build
```

**Test Verification (каждая задача):**
```bash
pnpm --filter @osai/agent test    # vitest
```

**Полная сборка (T-008):**
```bash
pnpm build   # корневая сборка monorepo
pnpm test    # все тесты
```

### 4.3 Test Cases per Task

**T-001 Hook System:**

| ID | Description | Expected | Pass Criteria |
|----|-------------|----------|---------------|
| TC-001-1 | register() добавляет sync handler | Handler добавлен | emit вызывает handler |
| TC-001-2 | register() добавляет async handler | Handler добавлен | emitAsync await'ит handler |
| TC-001-3 | emit() вызывает все handlers по порядку | Все handlers вызваны | Call order matches registration |
| TC-001-4 | emitAsync() обрабатывает async handlers | Все handlers await'ены | Results collected in order |
| TC-001-5 | unregister() удаляет handler | Handler не вызывается при emit | Handler count decreased |
| TC-001-6 | emit() без handlers не крашит | No error | Returns empty array |
| TC-001-7 | HookContext содержит trace_id, chat_id | Context fields populated | Fields accessible |
| TC-001-8 | Все 13 хуков определены в HookName type | Type check passes | HookName includes all 13 |

**T-002 Context Assembly:**

| ID | Description | Expected |
|----|-------------|----------|
| TC-002-1 | Формирует messages array из chat history | [{role: "user", content: "..."}, {role: "assistant", content: "..."}] |
| TC-002-2 | Вызывает before_memory_query hook | Hook called with user message |
| TC-002-3 | Инжектирует RAG results в system prompt | System prompt contains ## Relevant Memory |
| TC-002-4 | Вызывает before_prompt_build hook | Hook called before final assembly |
| TC-002-5 | Без RAG results работает корректно | Messages without RAG section |
| TC-002-6 | Пустой chat history -- только system + user | [{role: "system"}, {role: "user"}] |

**T-003 Model Inference:**

| ID | Description | Expected |
|----|-------------|----------|
| TC-003-1 | Non-streaming inference через ProviderChain | LLMResponse returned |
| TC-003-2 | Streaming inference возвращает AsyncIterable | Can iterate chunks |
| TC-003-3 | before_model_resolve hook вызывается | Hook called before ProviderChain |
| TC-003-4 | Tool_use response корректно обрабатывается | Result.toolCalls populated |
| TC-003-5 | Error от ProviderChain пробрасывается | Error with context |
| TC-003-6 | Tools definitions передаются в ProviderChain | LLMRequest.tools matches input |

**T-004 Agent Loop Core:**

| ID | Description | Expected |
|----|-------------|----------|
| TC-004-1 | run() выполняет полный pipeline | AgentLoopOutput returned |
| TC-004-2 | before_agent_start hook вызывается | Hook called at start |
| TC-004-3 | agent_end hook вызывается при success | Hook called with response |
| TC-004-4 | on_error hook вызывается при ошибке inference | Hook called with error context |
| TC-004-5 | Ошибка context assembly не крашит loop | Error returned, no crash |
| TC-004-6 | Ошибка inference не крашит loop | Error returned via on_error |
| TC-004-7 | trace_id сохраняется через весь pipeline | Consistent trace_id in all hooks |

**T-005 Tool Execution Loop:**

| ID | Description | Expected |
|----|-------------|----------|
| TC-005-1 | tool_use -> execute -> result -> re-inference | LLM called twice |
| TC-005-2 | Multiple tool_use в одном response | All tools executed |
| TC-005-3 | before_tool_call hook вызывается | Hook called before each tool |
| TC-005-4 | after_tool_call hook вызывается | Hook called after each tool |
| TC-005-5 | Tool result appended в messages | messages contains tool role message |
| TC-005-6 | Max iterations guard (10) прерывает цикл | Loop stops, warning returned |
| TC-005-7 | Нет tool_use -> цикл не запускается | Single inference pass |
| TC-005-8 | Ошибка tool execution -> logged, loop continues | Error in after_tool_call, next inference |

**T-006 Streaming + Persistence:**

| ID | Description | Expected |
|----|-------------|----------|
| TC-006-1 | StreamManager вызывает callback для каждого chunk | Callback called N times |
| TC-006-2 | StreamManager emit complete event | Complete event fired |
| TC-006-3 | PersistenceService сохраняет user message | SQLite insert called |
| TC-006-4 | PersistenceService сохраняет assistant response | SQLite insert called |
| TC-006-5 | PersistenceService сохраняет tool calls | Tool calls stored in metadata |
| TC-006-6 | Все записи содержат chat_id + trace_id | Fields populated |

**T-007 Fact Extraction:**

| ID | Description | Expected |
|----|-------------|----------|
| TC-007-1 | Извлекает факты из assistant response | Facts extracted |
| TC-007-2 | Вызывает after_memory_extract hook | Hook called with facts |
| TC-007-3 | Делегирует сохранение в Memory System | MemorySystem.store() called |
| TC-007-4 | Ошибка extraction не блокирует loop | Error logged, loop continues |
| TC-007-5 | Пустой response -- факты не извлекаются | No facts extracted |

**T-008 Integration Tests:**

| ID | Description | Expected |
|----|-------------|----------|
| TC-008-1 | Полный loop без tools | User msg -> context -> inference -> persist |
| TC-008-2 | Полный loop с tool execution | User msg -> inference (tool_use) -> tool -> inference -> persist |
| TC-008-3 | Все 7 OpenClaw hooks вызваны в порядке | Hook call sequence verified |
| TC-008-4 | osaI hooks (before_memory_query, after_memory_extract) | Both called correctly |
| TC-008-5 | Graceful degradation при ошибке Memory System | Loop completes without RAG |
| TC-008-6 | Graceful degradation при ошибке ProviderChain | Error returned to user |
| TC-008-7 | Tool execution max iterations | Loop stops at limit |
| TC-008-8 | Fact extraction после успешного loop | Facts stored in Memory |

---

## 5. Implementation Plan per Task

### T-001: Hook System
1. Создать packages/agent/ package structure (package.json, tsconfig.json)
2. Определить HookName union type (13 хуков из ARCHITECTURE_OVERVIEW)
3. Определить HookContext interface (trace_id, chat_id, session_id, data)
4. Реализовать HookRegistry: register, unregister, emit (sync), emitAsync (sequential await)
5. Написать unit tests: регистрация, вызов, порядок, async, empty state
6. Проверить сборку

### T-002: Context Assembly
1. Определить ContextAssemblyInput (user message, chat_id, session_id, memory system ref)
2. Определить ContextAssemblyResult (messages array, metadata)
3. Реализовать ContextAssembler.assemble(): загрузка истории -> hook before_memory_query -> RAG -> hook before_prompt_build -> финальный messages
4. Mock'ировать SQLite и Memory System dependencies
5. Написать unit tests
6. Проверить сборку

### T-003: Model Inference
1. Определить InferenceInput (messages, tools, config)
2. Определить InferenceResult (content, toolCalls, usage, streamed)
3. Реализовать InferenceService: hook before_model_resolve -> ProviderChain.execute/executeStream -> parse response
4. Обработать tool_use: проверить response.toolCalls, вернуть флаг
5. Mock'ировать ProviderChain
6. Написать unit tests
7. Проверить сборку

### T-004: Agent Loop Core
1. Определить AgentLoopConfig (maxToolIterations, timeout)
2. Реализовать AgentLoop.run(): hook before_agent_start -> contextAssembly.assemble() -> inferenceService.infer() -> hook agent_end
3. Обработать ошибки через hook on_error
4. Возвратить AgentLoopOutput (response, toolCalls, usage, trace_id)
5. Mock'ировать ContextAssembler и InferenceService
6. Написать unit tests
7. Проверить сборку

### T-005: Tool Execution Loop
1. Реализовать ToolExecutor.executeTools(): loop { detect tool_use -> hook before_tool_call -> SkillRegistry.execute() -> hook after_tool_call -> re-inference }
2. Добавить max iterations guard (default 10)
3. Обработать ошибки tool execution (log + continue)
4. Интегрировать в AgentLoop (вызывается после inference если tool_use detected)
5. Mock'ировать SkillRegistry и InferenceService
6. Написать unit tests: single tool, multiple tools, max iterations, error handling
7. Проверить сборку

### T-006: Streaming + Persistence
1. Реализовать StreamManager: принимают AsyncIterable<LLMChunk>, вызывают callback для каждого chunk, emit complete
2. Реализовать PersistenceService: saveUserMessage(), saveAssistantMessage(), saveToolCalls()
3. Все сохранения в SQLite с chat_id, session_id, trace_id
4. Mock'ировать SQLite (better-sqlite3)
5. Написать unit tests для обоих модулей
6. Проверить сборку

### T-007: Fact Extraction
1. Реализовать FactExtractor: извлечение фактов из assistant response (simple keyword/pattern extraction для MVP)
2. Вызвать after_memory_extract hook
3. Делегировать MemorySystem.store() для сохранения
4. Обработать ошибки gracefully (try/catch, log)
5. Mock'ировать Memory System
6. Написать unit tests
7. Проверить сборку

### T-008: Integration Test
1. Собрать полный agent loop с mock'ами (ProviderChain, SkillRegistry, Memory System, SQLite)
2. Написать тест: полный loop без tools
3. Написать тест: loop с tool execution (1-2 итерации)
4. Написать тест: верификация порядка вызова всех 13 хуков
5. Написать тест: error scenarios (provider error, memory error, tool error)
6. Написать тест: max iterations guard
7. Smoke test: полная сборка + все тесты пакета

---

## 6. Quality Expectations

- **Unit test coverage:** >= 85% для packages/agent
- **Build stability:** пакет собирается без ошибок после каждой задачи
- **TypeScript strict mode:** все файлы проходят tsc --strict
- **No circular dependencies:** внутри packages/agent
- **Mock strategy:** vi.mock() для ProviderChain, SkillRegistry, Memory System, SQLite
- **Hook coverage:** все 13 хуков покрыты тестами (вызов, порядок, контекст)
- **Error resilience:** все error paths протестированы, graceful degradation верифицирован

---

## 7. Risks and Edge Cases

| Risk | Impact | Mitigation |
|------|--------|------------|
| R-F008-01 | Tool execution loop может уйти в бесконечный цикл (LLM постоянно возвращает tool_use) | Max iterations guard (default 10), configurable |
| R-F008-02 | ProviderChain (F-002) API может не совпадать с ожиданиями InferenceService | T-003 использует mock'ы -- реальная интеграция при merge |
| R-F008-03 | SkillRegistry (F-007) execute() API может отличаться | ToolExecutor использует интерфейс ToolResult -- адаптация при merge |
| R-F008-04 | Streaming + tool execution loop -- сложная координация | T-005 и T-006 независимы, интеграция в T-008 |
| R-F008-05 | Fact extraction качество (MVP -- simple heuristic) | Можно улучшить в V1 (LLM-based extraction), текущий подход sufficient |
| R-F008-06 | 13 хуков -- высокий overhead на синхронизацию | Хуки вызываются последовательно (await), нет параллелизма внутри loop |

---

## 8. Notes

1. **Пакет:** packages/agent/ -- единый пакет для всего Agent Runtime (DOMAIN-002)
2. **13 хуков:** 7 OpenClaw (before_model_resolve, before_prompt_build, before_agent_start, before_tool_call, after_tool_call, agent_end, on_error) + 6 osaI (before_memory_query, after_memory_extract, on_file_access, on_desktop_notification, on_chat_switch, on_mirror_message)
3. **osaI-specific hooks (on_file_access, on_desktop_notification, on_chat_switch, on_mirror_message)** определяются в T-001 но конкретные обработчики реализуются в других фичах (F-009, F-010, F-012)
4. **Tool execution loop** -- ключевая особенность: LLM может запрашивать tools многократно в рамках одного user request
5. **Fact extraction MVP** -- simple heuristic (keyword extraction из response), LLM-based extraction в V1
6. **Streaming** -- через callback/emitter pattern, реальная доставка через Gateway WebSocket (F-009)
7. **Persistence** -- делегирование в SQLite через PersistenceService, chat_messages таблица (F-001 schema)
8. **Total: 8 задач, ~26 часов** -- в рамках допустимого диапазона
9. **Parallel execution:** Phase 2 (T-002 + T-003) и Phase 4 (T-005 + T-006) могут выполняться параллельно

---

**Версия документа:** v1.0
**Дата создания:** 2026-03-30
**Автор:** TDD Planner Agent
**Статус:** Завершён
