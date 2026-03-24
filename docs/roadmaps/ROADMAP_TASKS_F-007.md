# Task Roadmap: F-007 Skills osaI - OS Integration, Memory, Knowledge Base

## 1. Feature Overview

- **Feature ID:** F-007
- **Feature Name:** Skills osaI - OS Integration, Memory, Knowledge Base
- **Feature Description:** osaI-specific skills, которые предоставляют агенту доступ к osaI-функциям: OS Integration skill (show_notification, watch_directory, list_processes, open_application, get_system_info), Memory skill (remember, recall, forget, summarize_session), Knowledge Base skill (ingest_document, query_knowledge, list_sources, remove_source). Эти навыки оборачивают функциональность packages/os-integration и packages/memory в tool-интерфейс для LLM.
- **Related Requirements:** FR-026, FR-027, FR-028
- **Domain:** skills-osai
- **Git branch:** feature/skills-osai
- **Priority:** Should Have (V1)

---

## 2. Dependencies

### 2.1 Feature Dependencies

Данная фича зависит от следующих фич:

- **F-006: Memory System** (blocking) - требуется для Memory skill и Knowledge Base skill (RAG, embeddings, Qdrant)
- **F-011: OS Integration** (blocking) - требуется для OS Integration skill (tray, notifications, file watcher, processes)

### 2.2 Task Dependencies

Зависимости между задачами внутри фичи:

```
T-001 (OS Integration skill - package setup) ----\
                                                  |--> T-005 (Hook integration)
T-002 (Memory skill) ----------------------------/
                                                  |
T-003 (Knowledge Base skill) --------------------/
                                                  |
T-004 (SKILL.md definitions) --------------------/
                                                  |
                                                  \--> T-006 (Integration tests)
```

- **Task T-001:** Не имеет зависимостей (требует только F-011)
- **Task T-002:** Не имеет зависимостей (требует только F-006)
- **Task T-003:** Не имеет зависимостей (требует только F-006)
- **Task T-004:** Не имеет зависимостей
- **Task T-005:** Зависит от T-001, T-002, T-003 (blocking)
- **Task T-006:** Зависит от T-001, T-002, T-003, T-004, T-005 (blocking)

### 2.3 Development Order

**Фичи выполняются последовательно (по dependency level):**
- Feature F-006 (Memory System) -> Feature F-007 (Skills osaI)
- Feature F-011 (OS Integration) -> Feature F-007 (Skills osaI)

**Задачи внутри фичи могут выполняться параллельно:**
- T-001, T-002, T-003, T-004 - до 4 параллельно (нет внутренних зависимостей)
- T-005 - последовательно после T-001..T-003
- T-006 - последовательно после всех задач

---

## 3. Task Breakdown

### Task T-001: OS Integration Skill Implementation

**Description:**
Реализация OS Integration skill с 5 tool-ами: show_notification, watch_directory, list_processes, open_application, get_system_info. Интеграция с packages/os-integration.

**Estimated Time:** 3-4 hours

**Dependencies:** F-011 (OS Integration package готов)

**Scope:**
- **In scope:**
  - Создание packages/skills-osai/src/skills/os-integration/
  - Реализация 5 tools как wrappers над OsIntegrationManager
  - Tool schemas для LLM (name, description, parameters)
  - Category assignment (system для всех tools)
  - Error handling и result formatting
  - Unit tests для каждого tool
- **Out scope:**
  - OsIntegrationManager implementation (в F-011)
  - Hook registration (T-005)
  - Integration tests (T-006)

---

### Task T-002: Memory Skill Implementation

**Description:**
Реализация Memory skill с 4 tool-ами: remember, recall, forget, summarize_session. Интеграция с packages/memory.

**Estimated Time:** 2-3 hours

**Dependencies:** F-006 (Memory package готов)

**Scope:**
- **In scope:**
  - Создание packages/skills-osai/src/skills/memory/
  - Реализация 4 tools как wrappers над MemoryManager
  - Tool schemas для LLM
  - Category assignment (system для remember, recall, summarize_session; write для forget)
  - Error handling и result formatting
  - Unit tests для каждого tool
- **Out scope:**
  - MemoryManager implementation (в F-006)
  - RAG pipeline (в F-006)
  - Hook registration (T-005)

---

### Task T-003: Knowledge Base Skill Implementation

**Description:**
Реализация Knowledge Base skill с 4 tool-ами: ingest_document, query_knowledge, list_sources, remove_source. Интеграция с packages/memory (KB functions).

**Estimated Time:** 2-3 hours

**Dependencies:** F-006 (Memory package готов)

**Scope:**
- **In scope:**
  - Создание packages/skills-osai/src/skills/knowledge-base/
  - Реализация 4 tools как wrappers над MemoryManager KB methods
  - Tool schemas для LLM
  - Category assignment (write для ingest_document, remove_source; system для query_knowledge, list_sources)
  - Error handling и result formatting
  - Unit tests для каждого tool
- **Out scope:**
  - KB implementation (в F-006)
  - Document chunking/embedding (в F-006)

---

### Task T-004: SKILL.md Definitions

**Description:**
Создание SKILL.md файлов для всех 3 skills: os-integration.md, memory.md, knowledge-base.md. Парсинг и регистрация в SkillRegistry.

**Estimated Time:** 2 hours

**Dependencies:** None (только T-001..T-003 для интеграции)

**Scope:**
- **In scope:**
  - Создание SKILL.md файлов по формату из skills-core
  - Описание tool definitions, permissions, examples
  - Регистрация skills в SkillRegistry
  - Экспорт skill definitions через index.ts
- **Out scope:**
  - SkillRegistry implementation (в F-005)
  - SKILL.md parser (в F-005)

---

### Task T-005: Hook Integration

**Description:**
Регистрация osaI-specific hooks: before_memory_query, after_memory_extract, on_file_access, on_desktop_notification. Связывание hooks с skills.

**Estimated Time:** 2-3 hours

**Dependencies:** T-001, T-002, T-003 (blocking)

**Scope:**
- **In scope:**
  - Создание packages/skills-osai/src/hooks/
  - Реализация hook handlers:
    - before_memory_query -> MemorySkill.recall wrapper
    - after_memory_extract -> MemorySkill.remember wrapper
    - on_file_access -> audit logging
    - on_desktop_notification -> OsIntegrationSkill.show_notification wrapper
  - Регистрация hooks в AgentRuntime
  - Unit tests для hooks
- **Out scope:**
  - AgentRuntime hook system (в F-004)
  - Audit logging implementation (в F-010)

---

### Task T-006: Integration Tests

**Description:**
Комплексные integration tests для всех skills и hooks. End-to-end scenarios.

**Estimated Time:** 3-4 hours

**Dependencies:** T-001, T-002, T-003, T-004, T-005 (blocking)

**Scope:**
- **In scope:**
  - Integration tests для каждого skill
  - Hook wiring tests
  - End-to-end scenarios:
    - Agent uses Memory skill to remember fact
    - Agent uses KB skill to ingest and query document
    - Agent uses OS skill to show notification
    - Hook chain execution order
  - Mock OsIntegrationManager и MemoryManager
- **Out scope:**
  - E2E tests с реальными LLM (V2)
  - Performance tests

---

## 4. Test Strategy (TDD)

### 4.1 Test Types per Task

| Task | Unit Tests | Integration Tests | Build & Run Verification |
|------|------------|-------------------|--------------------------|
| T-001 | Required (5 tools) | - | Required |
| T-002 | Required (4 tools) | - | Required |
| T-003 | Required (4 tools) | - | Required |
| T-004 | Required (parsing) | - | Required |
| T-005 | Required (4 hooks) | - | Required |
| T-006 | - | Required | Required |

### 4.2 Build and Run Verification

**Build Verification:**
```bash
# Сборка packages/skills-osai
cd /home/aristman/projects/osai
pnpm --filter @osai/skills-osai build
```
- **Ожидаемый результат:** Успешная компиляция без ошибок
- **Критерии успешной сборки:**
  - TypeScript компиляция без ошибок
  - Все exports корректны
  - dist/ директория создана

**Run Verification:**
```bash
# Запуск unit tests
pnpm --filter @osai/skills-osai test

# Проверка exports
node -e "const skills = require('@osai/skills-osai'); console.log(Object.keys(skills));"
```
- **Ожидаемый результат:** Все tests pass, exports доступны
- **Критерии успешного запуска:**
  - Все unit tests проходят
  - Нет runtime ошибок при импорте
  - Все tool schemas валидны

### 4.3 Test Cases per Task

---

#### Task T-001: OS Integration Skill Tests

**TC-T001-001: show_notification tool**
- **Test ID:** TC-T001-001
- **Description:** Проверка show_notification tool с корректными параметрами
- **Preconditions:** Mock OsIntegrationManager.notify возвращает success
- **Input:** `{ title: "Test", body: "Message", urgency: "normal" }`
- **Expected result:** ToolResult.success = true, OsIntegrationManager.notify вызван
- **Pass criteria:** success=true, mock вызван с correct params

**TC-T001-002: show_notification invalid urgency**
- **Test ID:** TC-T001-002
- **Description:** Проверка валидации urgency параметра
- **Preconditions:** None
- **Input:** `{ title: "Test", body: "Message", urgency: "invalid" }`
- **Expected result:** ToolResult.success = false, error message о invalid urgency
- **Pass criteria:** success=false, error содержит "urgency"

**TC-T001-003: watch_directory tool**
- **Test ID:** TC-T001-003
- **Description:** Проверка watch_directory tool
- **Preconditions:** Mock OsIntegrationManager.watchDirectory возвращает watcher id
- **Input:** `{ path: "/tmp/test", events: ["create", "modify"] }`
- **Expected result:** ToolResult с watcher_id
- **Pass criteria:** success=true, содержит watcher_id

**TC-T001-004: list_processes tool**
- **Test ID:** TC-T001-004
- **Description:** Проверка list_processes tool
- **Preconditions:** Mock OsIntegrationManager.listProcesses возвращает массив процессов
- **Input:** `{ filter: "node" }`
- **Expected result:** ToolResult с массивом ProcessInfo
- **Pass criteria:** success=true, data.processes - array

**TC-T001-005: open_application tool**
- **Test ID:** TC-T001-005
- **Description:** Проверка open_application tool
- **Preconditions:** Mock OsIntegrationManager.spawnApplication возвращает success
- **Input:** `{ app_name: "code", args: ["/path/to/project"] }`
- **Expected result:** ToolResult.success = true
- **Pass criteria:** success=true

**TC-T001-006: get_system_info tool**
- **Test ID:** TC-T001-006
- **Description:** Проверка get_system_info tool
- **Preconditions:** Mock OsIntegrationManager.getSystemInfo возвращает SystemInfo
- **Input:** `{}`
- **Expected result:** ToolResult с cpu, memory, disk, os info
- **Pass criteria:** success=true, data содержит cpu/memory/disk/os

---

#### Task T-002: Memory Skill Tests

**TC-T002-001: remember tool**
- **Test ID:** TC-T002-001
- **Description:** Проверка remember tool сохраняет memory entry
- **Preconditions:** Mock MemoryManager.store возвращает memory_id
- **Input:** `{ content: "User prefers dark theme", category: "PREFERENCE", tags: ["ui"] }`
- **Expected result:** ToolResult с memory_id
- **Pass criteria:** success=true, data.memory_id существует

**TC-T002-002: recall tool**
- **Test ID:** TC-T002-002
- **Description:** Проверка recall tool возвращает memories
- **Preconditions:** Mock MemoryManager.recall возвращает массив MemoryEntry
- **Input:** `{ query: "theme preferences", top_k: 5, category: "PREFERENCE" }`
- **Expected result:** ToolResult с массивом memories
- **Pass criteria:** success=true, data.memories - array, длина <= top_k

**TC-T002-003: forget tool**
- **Test ID:** TC-T002-003
- **Description:** Проверка forget tool удаляет memory
- **Preconditions:** Mock MemoryManager.forget успешно выполняется
- **Input:** `{ memory_id: "mem_12345" }`
- **Expected result:** ToolResult.success = true
- **Pass criteria:** success=true, MemoryManager.forget вызван с memory_id

**TC-T002-004: summarize_session tool**
- **Test ID:** TC-T002-004
- **Description:** Проверка summarize_session tool
- **Preconditions:** Mock MemoryManager.summarizeSession возвращает summary string
- **Input:** `{ session_id: "session_123" }`
- **Expected result:** ToolResult с summary text
- **Pass criteria:** success=true, data.summary - string

**TC-T002-005: remember invalid category**
- **Test ID:** TC-T002-005
- **Description:** Проверка валидации category
- **Preconditions:** None
- **Input:** `{ content: "Test", category: "INVALID_CATEGORY" }`
- **Expected result:** ToolResult.success = false
- **Pass criteria:** success=false, error содержит "category"

---

#### Task T-003: Knowledge Base Skill Tests

**TC-T003-001: ingest_document tool**
- **Test ID:** TC-T003-001
- **Description:** Проверка ingest_document tool
- **Preconditions:** Mock MemoryManager.ingestDocument возвращает document_id
- **Input:** `{ path: "/docs/spec.md", title: "Specification", tags: ["spec", "osai"] }`
- **Expected result:** ToolResult с document_id и chunks_count
- **Pass criteria:** success=true, data.document_id существует, data.chunks_count >= 0

**TC-T003-002: query_knowledge tool**
- **Test ID:** TC-T003-002
- **Description:** Проверка query_knowledge tool
- **Preconditions:** Mock MemoryManager.queryKnowledge возвращает результаты
- **Input:** `{ query: "architecture", top_k: 5, filters: { tag: "spec" } }`
- **Expected result:** ToolResult с массивом KbSearchResult
- **Pass criteria:** success=true, data.results - array

**TC-T003-003: list_sources tool**
- **Test ID:** TC-T003-003
- **Description:** Проверка list_sources tool
- **Preconditions:** Mock MemoryManager.listSources возвращает массив KbSource
- **Input:** `{ tag: "spec" }`
- **Expected result:** ToolResult с массивом sources
- **Pass criteria:** success=true, data.sources - array

**TC-T003-004: remove_source tool**
- **Test ID:** TC-T003-004
- **Description:** Проверка remove_source tool
- **Preconditions:** Mock MemoryManager.removeSource успешно выполняется
- **Input:** `{ document_id: "doc_12345" }`
- **Expected result:** ToolResult.success = true
- **Pass criteria:** success=true

**TC-T003-005: ingest_document file not found**
- **Test ID:** TC-T003-005
- **Description:** Проверка error handling при отсутствующем файле
- **Preconditions:** Mock MemoryManager.ingestDocument выбрасывает FileNotFoundError
- **Input:** `{ path: "/nonexistent/file.md" }`
- **Expected result:** ToolResult.success = false, error message
- **Pass criteria:** success=false, error содержит "not found" или "not exist"

---

#### Task T-004: SKILL.md Definitions Tests

**TC-T004-001: os-integration SKILL.md parsing**
- **Test ID:** TC-T004-001
- **Description:** Проверка парсинга os-integration.md
- **Preconditions:** SKILL.md файл существует
- **Input:** parseSkillMarkdown(os-integration.md)
- **Expected result:** SkillDefinition с 5 tools
- **Pass criteria:** tools.length === 5, name === "os-integration"

**TC-T004-002: memory SKILL.md parsing**
- **Test ID:** TC-T004-002
- **Description:** Проверка парсинга memory.md
- **Preconditions:** SKILL.md файл существует
- **Input:** parseSkillMarkdown(memory.md)
- **Expected result:** SkillDefinition с 4 tools
- **Pass criteria:** tools.length === 4, name === "memory"

**TC-T004-003: knowledge-base SKILL.md parsing**
- **Test ID:** TC-T004-003
- **Description:** Проверка парсинга knowledge-base.md
- **Preconditions:** SKILL.md файл существует
- **Input:** parseSkillMarkdown(knowledge-base.md)
- **Expected result:** SkillDefinition с 4 tools
- **Pass criteria:** tools.length === 4, name === "knowledge-base"

**TC-T004-004: tool schema generation**
- **Test ID:** TC-T004-004
- **Description:** Проверка генерации JSON Schema из tool definitions
- **Preconditions:** SkillDefinition загружен
- **Input:** getToolSchemas(memorySkill)
- **Expected result:** Массив ToolSchema объектов
- **Pass criteria:** Каждый schema имеет name, description, parameters (JSONSchema), category

---

#### Task T-005: Hook Integration Tests

**TC-T005-001: before_memory_query hook**
- **Test ID:** TC-T005-001
- **Description:** Проверка hook вызывает MemoryManager.recall
- **Preconditions:** Hook зарегистрирован
- **Input:** HookContext { message: { content: "test query" } }
- **Expected result:** HookContext enriched с memory_context
- **Pass criteria:** context.metadata.memory_context существует

**TC-T005-002: after_memory_extract hook**
- **Test ID:** TC-T005-002
- **Description:** Проверка hook извлекает facts и сохраняет в MemoryManager
- **Preconditions:** Hook зарегистрирован, MemoryManager.store mock
- **Input:** HookContext { toolResult: { data: "Important fact extracted" } }
- **Expected result:** MemoryManager.store вызван
- **Pass criteria:** MemoryManager.store вызван хотя бы раз

**TC-T005-003: on_file_access hook**
- **Test ID:** TC-T005-003
- **Description:** Проверка hook логирует file access
- **Preconditions:** Hook зарегистрирован
- **Input:** HookContext { toolCall: { tool: "read_file", params: { path: "/test/file.txt" } } }
- **Expected result:** Audit entry создан
- **Pass criteria:** Audit log содержит file_access action

**TC-T005-004: on_desktop_notification hook**
- **Test ID:** TC-T005-004
- **Description:** Проверка hook отправляет notification
- **Preconditions:** Hook зарегистрирован, OsIntegrationManager.notify mock
- **Input:** HookContext { metadata: { notification: { title: "Test", body: "Body" } } }
- **Expected result:** OsIntegrationManager.notify вызван
- **Pass criteria:** notify вызван с correct title/body

---

#### Task T-006: Integration Tests

**TC-T006-001: End-to-end memory flow**
- **Test ID:** TC-T006-001
- **Description:** Agent использует remember -> recall -> forget
- **Preconditions:** Все skills зарегистрированы, mock dependencies
- **Steps:**
  1. Agent вызывает remember({ content: "Test memory" })
  2. Agent вызывает recall({ query: "Test" })
  3. Agent вызывает forget({ memory_id: ... })
- **Expected result:** Все 3 операции успешны
- **Pass criteria:** remember возвращает id, recall возвращает memory, forget success=true

**TC-T006-002: End-to-end knowledge base flow**
- **Test ID:** TC-T006-002
- **Description:** Agent использует ingest -> query -> list -> remove
- **Preconditions:** Все skills зарегистрированы, mock dependencies
- **Steps:**
  1. Agent вызывает ingest_document({ path: "/test.md" })
  2. Agent вызывает query_knowledge({ query: "test" })
  3. Agent вызывает list_sources({})
  4. Agent вызывает remove_source({ document_id: ... })
- **Expected result:** Все 4 операции успешны
- **Pass criteria:** ingest возвращает id, query возвращает results, list возвращает sources, remove success=true

**TC-T006-003: End-to-end OS integration flow**
- **Test ID:** TC-T006-003
- **Description:** Agent использует show_notification и get_system_info
- **Preconditions:** Все skills зарегистрированы, mock dependencies
- **Steps:**
  1. Agent вызывает get_system_info({})
  2. Agent вызывает show_notification({ title: "Info", body: "..." })
- **Expected result:** Обе операции успешны
- **Pass criteria:** get_system_info возвращает system data, show_notification success=true

**TC-T006-004: Hook chain execution order**
- **Test ID:** TC-T006-004
- **Description:** Проверка order выполнения hooks в agent loop
- **Preconditions:** Hooks зарегистрированы с разными priorities
- **Steps:**
  1. Trigger before_memory_query hook
  2. Verify hook executed in correct order
- **Expected result:** Hooks выполняются по priority (lower first)
- **Pass criteria:** Execution log соответствует expected order

---

## 5. Implementation Plan per Task

### Task T-001: OS Integration Skill Implementation

**Logical Steps:**
1. Создать директорию `packages/skills-osai/src/skills/os-integration/`
2. Создать interfaces для tool parameters и results
3. Реализовать OsIntegrationSkill class с 5 methods:
   - `showNotification(params, ctx) -> ToolResult`
   - `watchDirectory(params, ctx) -> ToolResult`
   - `listProcesses(params, ctx) -> ToolResult`
   - `openApplication(params, ctx) -> ToolResult`
   - `getSystemInfo(params, ctx) -> ToolResult`
4. Создать tool schemas для каждого method
5. Добавить error handling и validation
6. Написать unit tests
7. Экспортировать через barrel file

**Constraints from Architecture:**
- Category для всех OS tools = "system"
- Все tools delegates to OsIntegrationManager из F-011
- ToolResult format: `{ success: boolean, data?: unknown, error?: string }`
- Dependency injection через constructor (OsIntegrationManager)

**Integration Points:**
- OsIntegrationManager из packages/os-integration
- ToolContext interface из packages/agent
- SkillRegistry из packages/skills-core

---

### Task T-002: Memory Skill Implementation

**Logical Steps:**
1. Создать директорию `packages/skills-osai/src/skills/memory/`
2. Создать interfaces для tool parameters и results
3. Реализовать MemorySkill class с 4 methods:
   - `remember(params, ctx) -> ToolResult`
   - `recall(params, ctx) -> ToolResult`
   - `forget(params, ctx) -> ToolResult`
   - `summarizeSession(params, ctx) -> ToolResult`
4. Создать tool schemas для каждого method
5. Добавить category assignments:
   - remember: system
   - recall: system
   - forget: write (требует confirmation)
   - summarizeSession: system
6. Написать unit tests
7. Экспортировать через barrel file

**Constraints from Architecture:**
- MemoryCategory enum: FACT | PREFERENCE | KNOWLEDGE | ERROR | PATTERN
- Dependency injection через constructor (MemoryManager)
- Session ID из ToolContext

**Integration Points:**
- MemoryManager из packages/memory
- ToolContext interface из packages/agent

---

### Task T-003: Knowledge Base Skill Implementation

**Logical Steps:**
1. Создать директорию `packages/skills-osai/src/skills/knowledge-base/`
2. Создать interfaces для tool parameters и results
3. Реализовать KnowledgeBaseSkill class с 4 methods:
   - `ingestDocument(params, ctx) -> ToolResult`
   - `queryKnowledge(params, ctx) -> ToolResult`
   - `listSources(params, ctx) -> ToolResult`
   - `removeSource(params, ctx) -> ToolResult`
4. Создать tool schemas
5. Category assignments:
   - ingestDocument: write (требует confirmation)
   - queryKnowledge: system
   - listSources: system
   - removeSource: write (требует confirmation)
6. Написать unit tests
7. Экспортировать через barrel file

**Constraints from Architecture:**
- Document ingestion uses chunking (512 tokens, 50 overlap)
- Embedding provider fallback chain
- Qdrant collection: osai_kb

**Integration Points:**
- MemoryManager KB methods из packages/memory

---

### Task T-004: SKILL.md Definitions

**Logical Steps:**
1. Создать директорию `packages/skills-osai/skills/`
2. Создать `os-integration.md`:
   - Name, description
   - 5 tool definitions с parameters
   - Permission config (system category)
   - Examples
3. Создать `memory.md`:
   - Name, description
   - 4 tool definitions
   - Permission config
   - Examples
4. Создать `knowledge-base.md`:
   - Name, description
   - 4 tool definitions
   - Permission config
   - Examples
5. Создать skill loader для регистрации в SkillRegistry
6. Экспортировать skill definitions
7. Написать tests для парсинга

**Constraints from Architecture:**
- Формат SKILL.md совместим с skills-core parser
- Tool definitions должны включать JSON Schema для parameters
- Examples помогают LLM понять usage patterns

---

### Task T-005: Hook Integration

**Logical Steps:**
1. Создать директорию `packages/skills-osai/src/hooks/`
2. Реализовать `beforeMemoryQueryHook`:
   - Extract query from context
   - Call MemoryManager.recall
   - Inject results into context.metadata.memory_context
3. Реализовать `afterMemoryExtractHook`:
   - Extract facts from toolResult
   - Call MemoryManager.store для каждого fact
4. Реализовать `onFileAccessHook`:
   - Log file access action to audit
   - Include path, tool, timestamp
5. Реализовать `onDesktopNotificationHook`:
   - Extract notification from context
   - Call OsIntegrationManager.notify
6. Создать hook registration function
7. Написать unit tests

**Constraints from Architecture:**
- Hook priority ordering (lower = earlier execution)
- Hooks могут abort chain (return null)
- Error handling: hooks не должны crash agent loop

**Integration Points:**
- AgentRuntime.registerHook из packages/agent
- HookPoint enum из packages/agent
- Audit logging через ObservabilityManager

---

### Task T-006: Integration Tests

**Logical Steps:**
1. Создать `packages/skills-osai/tests/integration/`
2. Настроить test fixtures и mocks:
   - Mock OsIntegrationManager
   - Mock MemoryManager
   - Mock AgentRuntime (for hooks)
3. Реализовать `memory-flow.test.ts`:
   - Test remember -> recall -> forget
   - Verify data flow и state
4. Реализовать `knowledge-base-flow.test.ts`:
   - Test ingest -> query -> list -> remove
   - Verify document lifecycle
5. Реализовать `os-integration-flow.test.ts`:
   - Test notification and system info
6. Реализовать `hooks-flow.test.ts`:
   - Test hook execution order
   - Test context enrichment
7. Запустить все integration tests

**Constraints from Architecture:**
- Use vitest для testing
- Mock external dependencies
- Tests должны быть deterministic

---

## 6. Acceptance Criteria per Task

### Task T-001: OS Integration Skill

- [ ] 5 tools реализованы: show_notification, watch_directory, list_processes, open_application, get_system_info
- [ ] Каждый tool имеет корректный JSON Schema для parameters
- [ ] Все tools имеют category="system"
- [ ] Unit tests покрывают все 5 tools (>=90% coverage)
- [ ] Build успешен без ошибок
- [ ] Exports корректны через index.ts

### Task T-002: Memory Skill

- [ ] 4 tools реализованы: remember, recall, forget, summarize_session
- [ ] Category assignments корректны (forget=write)
- [ ] Unit tests покрывают все 4 tools (>=90% coverage)
- [ ] Build успешен без ошибок

### Task T-003: Knowledge Base Skill

- [ ] 4 tools реализованы: ingest_document, query_knowledge, list_sources, remove_source
- [ ] Category assignments корректны (ingest=write, remove=write)
- [ ] Unit tests покрывают все 4 tools (>=90% coverage)
- [ ] Build успешен без ошибок

### Task T-004: SKILL.md Definitions

- [ ] 3 SKILL.md файла созданы
- [ ] Каждый файл содержит tool definitions с parameters
- [ ] SKILL.md parser корректно парсит все 3 файла
- [ ] Skill registration в SkillRegistry работает
- [ ] Build успешен без ошибок

### Task T-005: Hook Integration

- [ ] 4 hooks реализованы: before_memory_query, after_memory_extract, on_file_access, on_desktop_notification
- [ ] Hooks корректно регистрируются в AgentRuntime
- [ ] Unit tests покрывают все 4 hooks (>=90% coverage)
- [ ] Build успешен без ошибок

### Task T-006: Integration Tests

- [ ] Integration tests для memory flow проходят
- [ ] Integration tests для knowledge base flow проходят
- [ ] Integration tests для OS integration flow проходят
- [ ] Hook execution tests проходят
- [ ] Все tests проходят без flakiness
- [ ] Build успешен без ошибок

---

## 7. Quality Expectations

### Coverage Requirements

| Task | Target Coverage | Tools |
|------|-----------------|-------|
| T-001 | >= 90% | vitest, c8 |
| T-002 | >= 90% | vitest, c8 |
| T-003 | >= 90% | vitest, c8 |
| T-004 | >= 85% | vitest, c8 |
| T-005 | >= 90% | vitest, c8 |
| T-006 | N/A (integration) | vitest |

### Task Completion Time

| Task | Estimated Time | Max Time |
|------|----------------|----------|
| T-001 | 3-4 hours | 6 hours |
| T-002 | 2-3 hours | 5 hours |
| T-003 | 2-3 hours | 5 hours |
| T-004 | 2 hours | 4 hours |
| T-005 | 2-3 hours | 5 hours |
| T-006 | 3-4 hours | 6 hours |

**Total Estimated:** 14-19 hours
**Total Max:** 31 hours

### Build and Run Stability

- Build должен завершаться успешно на каждом коммите
- Tests должны проходить на каждом коммите
- Нет runtime errors при импорте пакета
- Все exports корректны

---

## 8. Risks and Edge Cases

### Known Edge Cases

1. **OS Integration на Wayland:**
   - systray2 может не работать
   - Fallback на CLI-only режим
   - Необходимость capability detection

2. **Memory Manager недоступен:**
   - Qdrant server не запущен
   - Graceful degradation
   - Возврат empty results вместо error

3. **File Watcher limits:**
   - inotify limits на Linux
   - Слишком много watchers
   - Необходимость cleanup

4. **Knowledge Base large files:**
   - Большие документы (>10MB)
   - Long chunking time
   - Timeout handling

### Risky Scenarios

1. **Hook execution blocking:**
   - Hook выполняется слишком долго
   - Блокирует agent loop
   - Mitigation: timeout для hooks

2. **Memory leak в file watchers:**
   - Watchers не cleanup
   - Resource exhaustion
   - Mitigation: explicit unwatch methods

3. **Concurrent memory operations:**
   - Multiple agents используют memory
   - Race conditions
   - Mitigation: SQLite WAL mode, proper transactions

### Dependency-Related Risks

1. **F-006 (Memory) delays:**
   - Memory package не готов
   - Блокирует T-002, T-003, T-005
   - Mitigation: использовать mocks для ранней разработки

2. **F-011 (OS Integration) delays:**
   - OS Integration package не готов
   - Блокирует T-001, T-005
   - Mitigation: использовать mocks для ранней разработки

3. **SkillRegistry API changes:**
   - Interface изменяется в F-005
   - Breaking changes
   - Mitigation: синхронизация с F-005 разработкой

---

## 9. Notes

### Clarifications

1. **Tool Categories:**
   - "system" = auto-approve (без confirmation)
   - "write" = требует user confirmation
   - Decision based on risk assessment

2. **Hook Priorities:**
   - before_memory_query: priority 10 (early execution)
   - after_memory_extract: priority 50 (late execution)
   - on_file_access: priority 20
   - on_desktop_notification: priority 90 (last)

3. **SKILL.md Location:**
   - В packages/skills-osai/skills/ directory
   - Загружаются при skills initialization
   - Можно переопределить через config

4. **Error Handling Strategy:**
   - Все tools возвращают ToolResult с success boolean
   - Errors логируются с trace_id
   - User-friendly error messages

### Assumptions

1. F-006 Memory System полностью реализован и stable
2. F-011 OS Integration полностью реализован
3. SkillRegistry interface из F-005 не изменится
4. Hook system из F-004 поддерживает все необходимые hook points

### Dependencies Summary

```
F-006 (Memory) ----\
                    --> T-002, T-003 --\
F-011 (OS Int.) ---/                    \
                                         --> T-005 --> T-006
F-005 (Skills Core - SkillRegistry) ----/
```

---

## Version

- **Version:** v1.0
- **Created:** 2026-03-24
- **Author:** TDD Planner Agent
- **Status:** Ready for implementation

---

*End of Task Roadmap: F-007 Skills osaI*
