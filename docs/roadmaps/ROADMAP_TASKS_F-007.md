# Task Roadmap: Skills System (F-007)

**Version:** v1.0
**Date:** 2026-03-30
**Author:** TDD Planner Agent
**Status:** Active

---

## 1. Feature Overview

- **Feature ID:** F-007
- **Feature Name:** Skills System
- **Description:** Skills Registry (bundled, managed, workspace, osaI skills), SKILL.md format, bundled skills (Filesystem, Shell), osaI skills (Memory, Knowledge Base, Chat Management, OS Integration), permission model
- **Related Requirements:** FR-005, FR-006
- **Domain:** DOMAIN-003
- **Agent Profile:** backend/AGENT_PROFILE_nodejs.md + backend/AGENT_PROFILE_backend-base.md
- **Git branch:** feature/skills-system

---

## 2. Dependencies

### 2.1 Feature Dependencies

- **F-001:** Core Infrastructure (blocking -- monorepo, TypeScript config, SQLite, pino)
- **F-002:** LLM Provider System (non-blocking -- tool definitions в LLM request)
- **F-003:** Observability Foundation (non-blocking -- audit logging)
- **F-005:** Memory System (blocking -- для Memory skill и KB skill)

### 2.2 Task Dependencies

```
T-001 (Registry Core) -----> T-002 (SKILL.md Parser)
T-001 ----------------------> T-003 (Permission Model)
T-002 ----------------------> T-004 (Filesystem Skill)
T-003 ----------------------> T-004
T-002 ----------------------> T-005 (Shell Skill)
T-003 ----------------------> T-005
T-004, T-005 --------------> T-006 (Integration Test -- Bundled)
T-001 ----------------------> T-007 (Memory Skill)
T-001 ----------------------> T-008 (KB + Chat + OS Skills)
T-007, T-008 --------------> T-009 (Integration Test -- osaI)
```

### 2.3 Development Order

**Параллельные группы:**
- Group A (parallel): T-001 -> T-002 + T-003 (после T-001)
- Group B (parallel, после T-002+T-003): T-004 + T-005
- Group C (после T-001): T-007 + T-008 (parallel)
- Финальные (после групп): T-006 + T-009 (parallel)

---

## 3. Task Breakdown

### Task T-001: Skill Registry Core

**Domain:** DOMAIN-003 | **Dependencies:** None

**Description:**
Базовый реестр навыков: интерфейсы (SkillDefinition, ToolDefinition, ToolResult), регистрация/удаление навыков, получение tool definitions для LLM request, dispatch tool execution. Пакет packages/skills-core/src/registry/.

**Estimated Time:** 3 hours

**Scope:**
- **In scope:** SkillRegistry interface, register(), unregister(), getTools(), execute(), enable(), disable(), reload(), TypeScript interfaces
- **Out scope:** SKILL.md parsing (T-002), permission enforcement (T-003), конкретные skills

#### Checklist
- [ ] CODE: `packages/skills-core/src/types.ts` (SkillDefinition, ToolDefinition, ToolResult, PermissionPolicy)
- [ ] CODE: `packages/skills-core/src/registry/SkillRegistry.ts` (основная реализация)
- [ ] CODE: `packages/skills-core/src/registry/index.ts` (barrel export)
- [ ] CODE: `packages/skills-core/src/index.ts` (package entry)
- [ ] CODE: `packages/skills-core/package.json`
- [ ] CODE: `packages/skills-core/tsconfig.json`
- [ ] TEST: `packages/skills-core/src/registry/__tests__/SkillRegistry.test.ts`
- [ ] BUILD: `pnpm --filter @osai/skills-core build`

#### Acceptance
- SkillRegistry регистрирует skill и возвращает tool definitions
- getTools() возвращает JSON Schema tool definitions для LLM
- execute() dispatch на зарегистрированный handler
- enable/disable переключает доступность skill
- Все unit tests проходят

---

### Task T-002: SKILL.md Parser

**Domain:** DOMAIN-003 | **Dependencies:** T-001

**Description:**
Парсер SKILL.md декларативного формата. Чтение SKILL.md из bundled, workspace (~/.osai/workspace/skills/), osaI (~/.osai/skills/) директорий. Валидация схемы. Конвертация в SkillDefinition.

**Estimated Time:** 3 hours

**Scope:**
- **In scope:** SKILL.md формат (frontmatter + tool definitions), парсер, валидация, сканирование директорий
- **Out scope:** конкретные SKILL.md файлы навыков, permission model

#### Checklist
- [ ] CODE: `packages/skills-core/src/parser/SkillMdParser.ts`
- [ ] CODE: `packages/skills-core/src/parser/SkillMdValidator.ts`
- [ ] CODE: `packages/skills-core/src/parser/index.ts`
- [ ] CODE: `packages/skills-core/src/parser/__tests__/SkillMdParser.test.ts`
- [ ] CODE: `packages/skills-core/src/parser/__tests__/fixtures/` (тестовые SKILL.md файлы)
- [ ] BUILD: `pnpm --filter @osai/skills-core build`

#### Acceptance
- Парсер читает валидный SKILL.md и возвращает SkillDefinition
- Невалидный SKILL.md выбрасывает ошибку с описанием
- Сканер находит все SKILL.md в указанных директориях
- Поддерживаются frontmatter (YAML) + Markdown body

---

### Task T-003: Permission Model

**Domain:** DOMAIN-003 | **Dependencies:** T-001

**Description:**
Category-based permission model: read=auto, write=confirm, exec=confirm. PermissionPolicy для каждого tool. PermissionChecker проверяет и возвращает permission decision. Интеграция с audit logging.

**Estimated Time:** 2 hours

**Scope:**
- **In scope:** PermissionPolicy, PermissionDecision, PermissionChecker, category-based логика
- **Out scope:** UI permission prompts (Gateway), FileSandbox/ShellSecurity (F-012)

#### Checklist
- [ ] CODE: `packages/skills-core/src/permissions/PermissionChecker.ts`
- [ ] CODE: `packages/skills-core/src/permissions/types.ts` (PermissionPolicy, PermissionDecision)
- [ ] CODE: `packages/skills-core/src/permissions/index.ts`
- [ ] CODE: `packages/skills-core/src/permissions/__tests__/PermissionChecker.test.ts`
- [ ] BUILD: `pnpm --filter @osai/skills-core build`

#### Acceptance
- read category автоматически одобряется (auto)
- write category требует подтверждения (confirm decision)
- exec category требует подтверждения (confirm decision)
- PermissionDecision содержит tool name, category, decision, risk_level
- Все unit tests проходят

---

### Task T-004: Filesystem Skill (Bundled)

**Domain:** DOMAIN-003 | **Dependencies:** T-002, T-003

**Description:**
Bundled skill с 7 tool'ами: read_file, write_file, list_dir, search_files, move_file, delete_file, get_file_info. SKILL.md + handler implementation. Интеграция с PermissionChecker (read=auto, write=confirm).

**Estimated Time:** 4 hours

**Scope:**
- **In scope:** 7 tool handlers, SKILL.md для Filesystem skill, permission mapping
- **Out scope:** FileSandbox (allowed_dirs, blocked_patterns -- F-012), symlink resolution

#### Checklist
- [ ] CODE: `packages/skills-core/src/skills/filesystem/SKILL.md`
- [ ] CODE: `packages/skills-core/src/skills/filesystem/FilesystemSkill.ts`
- [ ] CODE: `packages/skills-core/src/skills/filesystem/handlers/` (read_file, write_file, list_dir, search_files, move_file, delete_file, get_file_info)
- [ ] CODE: `packages/skills-core/src/skills/filesystem/__tests__/FilesystemSkill.test.ts`
- [ ] CODE: `packages/skills-core/src/skills/filesystem/__tests__/handlers/__tests__/*.test.ts`
- [ ] BUILD: `pnpm --filter @osai/skills-core build`

#### Acceptance
- read_file корректно читает текстовый файл
- write_file создаёт/перезаписывает файл
- list_dir возвращает содержимое директории
- search_files ищет файлы по glob pattern
- move_file перемещает/переименовывает файл
- delete_file удаляет файл
- get_file_info возвращает metadata (size, mtime, type)
- read operations автоматически одобряются, write -- возвращают confirm
- Все unit tests проходят (с temp directory fixtures)

---

### Task T-005: Shell Skill (Bundled)

**Domain:** DOMAIN-003 | **Dependencies:** T-002, T-003

**Description:**
Bundled skill с 2 tool'ами: exec (direct), exec_sandbox (Docker). SKILL.md + handler implementation. exec всегда требует подтверждения. Timeout enforcement.

**Estimated Time:** 3 hours

**Scope:**
- **In scope:** 2 tool handlers, SKILL.md, timeout, exec=always confirm
- **Out scope:** blocked commands list (F-012), Docker sandbox реализация (F-012), graceful degradation

#### Checklist
- [ ] CODE: `packages/skills-core/src/skills/shell/SKILL.md`
- [ ] CODE: `packages/skills-core/src/skills/shell/ShellSkill.ts`
- [ ] CODE: `packages/skills-core/src/skills/shell/handlers/` (exec, exec_sandbox)
- [ ] CODE: `packages/skills-core/src/skills/shell/__tests__/ShellSkill.test.ts`
- [ ] BUILD: `pnpm --filter @osai/skills-core build`

#### Acceptance
- exec выполняет shell команду через child_process
- exec возвращает stdout, stderr, exit code
- exec_sandbox placeholder возвращает "not implemented" (реализация в F-012)
- exec всегда возвращает permission decision = confirm
- Timeout по умолчанию 120s (настраиваемый)
- Все unit tests проходят

---

### Task T-006: Integration Test -- Bundled Skills

**Domain:** DOMAIN-003 | **Dependencies:** T-004, T-005

**Description:**
Интеграционные тесты: полная цепочка registry -> parse -> permission check -> execute для Filesystem и Shell skills. Тестирование с реальной файловой системой (temp dirs).

**Estimated Time:** 2 hours

**Scope:**
- **In scope:** end-to-end тесты bundled skills через SkillRegistry
- **Out scope:** osaI skills тесты (T-009), gateway integration

#### Checklist
- [ ] TEST: `packages/skills-core/src/__tests__/integration/bundled-skills.test.ts`
- [ ] TEST: `packages/skills-core/src/__tests__/integration/registry-lifecycle.test.ts`
- [ ] BUILD: `pnpm --filter @osai/skills-core build`
- [ ] BUILD: `pnpm --filter @osai/skills-core test`

#### Acceptance
- Registry загружает Filesystem + Shell skills из SKILL.md
- getTools() возвращает 9 tool definitions с корректными JSON Schema
- Permission checker корректно классифицирует все 9 tools
- Full execute cycle: register -> check permission -> execute -> result
- Registry enable/disable корректно исключает tools из getTools()
- reload() перезагружает skills из файловой системы

---

### Task T-007: Memory Skill (osaI)

**Domain:** DOMAIN-003 | **Dependencies:** T-001 (blocking), F-005 Memory System (external)

**Description:**
osaI skill для трёхуровневой памяти. 4 tool'а: remember, recall, forget, summarize_session. Обёртка над packages/memory API. SKILL.md + handler.

**Estimated Time:** 3 hours

**Scope:**
- **In scope:** 4 tool handlers, SKILL.md, адаптация к Memory System API
- **Out scope:** Memory System реализация (F-005), fact extraction (F-008)

#### Checklist
- [ ] CODE: `packages/skills-osai/package.json`
- [ ] CODE: `packages/skills-osai/tsconfig.json`
- [ ] CODE: `packages/skills-osai/src/index.ts`
- [ ] CODE: `packages/skills-osai/src/skills/memory/SKILL.md`
- [ ] CODE: `packages/skills-osai/src/skills/memory/MemorySkill.ts`
- [ ] CODE: `packages/skills-osai/src/skills/memory/handlers/` (remember, recall, forget, summarize_session)
- [ ] CODE: `packages/skills-osai/src/skills/memory/__tests__/MemorySkill.test.ts`
- [ ] BUILD: `pnpm --filter @osai/skills-osai build`

#### Acceptance
- remember сохраняет факт в Long-term Memory через Memory System
- recall ищет факты по запросу (делегирует в RAG pipeline)
- forget удаляет конкретный факт
- summarize_session создаёт summary текущей сессии
- Memory System dependency mock'ается в тестах (vi.mock)
- Все unit tests проходят

---

### Task T-008: KB + Chat Management + OS Integration Skills (osaI)

**Domain:** DOMAIN-003 | **Dependencies:** T-001

**Description:**
Три osaI skills в одной задаче (каждый -- thin wrapper): Knowledge Base (4 tools), Chat Management (5 tools), OS Integration (3 tools MVP -- show_notification, list_processes, get_system_info). Пакет packages/skills-osai/.

**Estimated Time:** 4 hours

**Scope:**
- **In scope:** 3 skills, 12 tools, SKILL.md для каждого, handler'ы с mock'ами внешних dependencies
- **Out scope:** watch_directory, open_application (V1), Gateway dependency для Chat Management

#### Checklist
- [ ] CODE: `packages/skills-osai/src/skills/knowledge-base/SKILL.md`
- [ ] CODE: `packages/skills-osai/src/skills/knowledge-base/KnowledgeBaseSkill.ts`
- [ ] CODE: `packages/skills-osai/src/skills/knowledge-base/__tests__/KnowledgeBaseSkill.test.ts`
- [ ] CODE: `packages/skills-osai/src/skills/chat-management/SKILL.md`
- [ ] CODE: `packages/skills-osai/src/skills/chat-management/ChatManagementSkill.ts`
- [ ] CODE: `packages/skills-osai/src/skills/chat-management/__tests__/ChatManagementSkill.test.ts`
- [ ] CODE: `packages/skills-osai/src/skills/os-integration/SKILL.md`
- [ ] CODE: `packages/skills-osai/src/skills/os-integration/OsIntegrationSkill.ts`
- [ ] CODE: `packages/skills-osai/src/skills/os-integration/__tests__/OsIntegrationSkill.test.ts`
- [ ] BUILD: `pnpm --filter @osai/skills-osai build`

#### Acceptance
- KB Skill: ingest_document, query_knowledge, list_sources, remove_source -- все делегируют в packages/knowledge-base
- Chat Management Skill: chat_list, chat_create, chat_switch, chat_archive, chat_delete -- все делегируют в Gateway Chat API
- OS Integration Skill: show_notification, list_processes, get_system_info -- делегируют в packages/os-integration
- Все external dependencies mock'ируются в тестах
- Каждый skill регистрируется в SkillRegistry корректно
- Все unit tests проходят

---

### Task T-009: Integration Test -- Full Skills System

**Domain:** DOMAIN-003 | **Dependencies:** T-006, T-007, T-008

**Description:**
Финальные интеграционные тесты: полная цепочка всех skills (bundled + osaI), registry lifecycle, permission flow, tool definition aggregation для LLM request. Smoke test сборки обоих пакетов.

**Estimated Time:** 3 hours

**Scope:**
- **In scope:** full integration tests, smoke test, verification tool definitions для LLM
- **Out scope:** gateway integration, E2E через agent loop (F-008)

#### Checklist
- [ ] TEST: `packages/skills-osai/src/__tests__/integration/osaI-skills.test.ts`
- [ ] TEST: `packages/skills-core/src/__tests__/integration/full-registry.test.ts`
- [ ] TEST: `tests/integration/skills-system.test.ts` (cross-package)
- [ ] BUILD: `pnpm --filter @osai/skills-core build && pnpm --filter @osai/skills-osai build`
- [ ] BUILD: `pnpm --filter @osai/skills-core test && pnpm --filter @osai/skills-osai test`

#### Acceptance
- Registry загружает все 6 skills (2 bundled + 4 osaI)
- getTools() возвращает 21 tool definition (9 + 4 + 4 + 5 + 3 = 25 tools -- pending chat_management deps)
- Каждый tool definition содержит корректный JSON Schema parameters
- Permission checker классифицирует все tools по categories
- Enable/disable изолирует skills
- reload() корректно перезагружает всё
- Сборка обоих пакетов без ошибок
- Все tests проходят

---

## 4. Test Strategy (TDD)

### 4.1 Test Types per Task

| Task | Unit Tests | Integration Tests | Build Verification |
|------|-----------|-------------------|--------------------|
| T-001 | SkillRegistry CRUD, getTools, execute dispatch | -- | `pnpm --filter @osai/skills-core build` |
| T-002 | SKILL.md parse/validate, directory scan | -- | `pnpm --filter @osai/skills-core build` |
| T-003 | PermissionChecker category logic | -- | `pnpm --filter @osai/skills-core build` |
| T-004 | 7 filesystem handlers with temp fixtures | -- | `pnpm --filter @osai/skills-core build` |
| T-005 | 2 shell handlers, timeout | -- | `pnpm --filter @osai/skills-core build` |
| T-006 | -- | Full bundled skills lifecycle | `pnpm --filter @osai/skills-core build && test` |
| T-007 | 4 memory handlers (mocked Memory System) | -- | `pnpm --filter @osai/skills-osai build` |
| T-008 | 12 osaI skill handlers (mocked deps) | -- | `pnpm --filter @osai/skills-osai build` |
| T-009 | -- | Full registry lifecycle, cross-package | Full build + test both packages |

### 4.2 Build and Run Verification

**Build Verification (каждая задача):**
```bash
pnpm --filter @osai/skills-core build   # T-001..T-006
pnpm --filter @osai/skills-osai build   # T-007..T-009
```

**Test Verification (каждая задача):**
```bash
pnpm --filter @osai/skills-core test    # vitest
pnpm --filter @osai/skills-osai test    # vitest
```

**Полная сборка (T-009):**
```bash
pnpm build   # корневая сборка monorepo
pnpm test    # все тесты
```

### 4.3 Test Cases per Task

**T-001 SkillRegistry Core:**

| ID | Description | Preconditions | Expected | Pass Criteria |
|----|-------------|---------------|----------|---------------|
| TC-001-1 | register() добавляет skill | Registry пуст | skill зарегистрирован, getTools() возвращает его tools | tools.length > 0 |
| TC-001-2 | register() дубликат выбрасывает ошибку | Skill уже зарегистрирован | Error thrown | Error contains skill name |
| TC-001-3 | getTools() агрегирует все tools | 2 skills зарегистрированы | Массив всех tools | tools.length === sum of skill tools |
| TC-001-4 | execute() dispatch на handler | Skill с handler зарегистрирован | Handler вызван с правильными params | Result от handler |
| TC-001-5 | execute() несуществующий tool | Tool не зарегистрирован | Error thrown | Error contains tool name |
| TC-001-6 | enable/disable переключает | Skill disabled | getTools() не содержит tools этого skill | tools不含该skill |
| TC-001-7 | unregister() удаляет skill | Skill зарегистрирован | Skill удалён из registry | getTools()不含已删tools |

**T-002 SKILL.md Parser:**

| ID | Description | Expected |
|----|-------------|----------|
| TC-002-1 | Парсит валидный SKILL.md с frontmatter | SkillDefinition с name, tools, permissions |
| TC-002-2 | Парсит SKILL.md с несколькими tools | SkillDefinition с N tools |
| TC-002-3 | Выбрасывает при отсутствующем name | Error |
| TC-002-4 | Выбрасывает при невалидном JSON Schema в tool | Error с path |
| TC-002-5 | Сканер находит все SKILL.md в директории | Массив SkillDefinition |
| TC-002-6 | Сканер игнорирует поддиректории без SKILL.md | Пустой массив для пустой директории |

**T-003 Permission Model:**

| ID | Description | Expected |
|----|-------------|----------|
| TC-003-1 | read category = auto | decision.auto === true |
| TC-003-2 | write category = confirm | decision.confirm === true |
| TC-003-3 | exec category = confirm | decision.confirm === true |
| TC-003-4 | system category = auto | decision.auto === true |
| TC-003-5 | PermissionDecision содержит risk_level | risk_level = "low" | "medium" | "high" |

**T-004 Filesystem Skill:**

| ID | Description | Expected |
|----|-------------|----------|
| TC-004-1 | read_file читает существующий файл | { success: true, data: file content } |
| TC-004-2 | read_file несуществующий файл | { success: false, error: contains "not found" } |
| TC-004-3 | write_file создаёт новый файл | File exists on disk |
| TC-004-4 | write_file перезаписывает существующий | File content updated |
| TC-004-5 | list_dir возвращает файлы | Array of file entries |
| TC-004-6 | list_dir пустая директория | Empty array |
| TC-004-7 | search_files по glob | Matching files array |
| TC-004-8 | move_file перемещает файл | Old path not exists, new path exists |
| TC-004-9 | delete_file удаляет файл | File not exists after |
| TC-004-10 | get_file_info возвращает metadata | { size, mtime, type: "file"|"dir" } |

**T-005 Shell Skill:**

| ID | Description | Expected |
|----|-------------|----------|
| TC-005-1 | exec выполняет echo | { success: true, data: { stdout: "hello", exitCode: 0 } } |
| TC-005-2 | exec возвращает stderr при ошибке | { success: false, data: { stderr: non-empty } } |
| TC-005-3 | exec timeout убивает процесс | Process killed, error contains "timeout" |
| TC-005-4 | exec всегда confirm permission | PermissionDecision.confirm === true |
| TC-005-5 | exec_sandbox placeholder | { success: false, error: "not implemented" } |

**T-007 Memory Skill:**

| ID | Description | Expected |
|----|-------------|----------|
| TC-007-1 | remember сохраняет факт | Delegates to MemorySystem.store() |
| TC-007-2 | recall ищет факты | Delegates to MemorySystem.query() |
| TC-007-3 | forget удаляет факт | Delegates to MemorySystem.forget() |
| TC-007-4 | summarize_session | Delegates to MemorySystem.summarize() |

**T-008 osaI Skills (KB + Chat + OS):**

| ID | Description | Expected |
|----|-------------|----------|
| TC-008-1 | KB: ingest_document делегирует | KnowledgeBase.ingest() called |
| TC-008-2 | KB: query_knowledge делегирует | KnowledgeBase.search() called |
| TC-008-3 | KB: list_sources делегирует | KnowledgeBase.listSources() called |
| TC-008-4 | Chat: chat_list делегирует | Gateway Chat API called |
| TC-008-5 | Chat: chat_create делегирует | Gateway Chat API called |
| TC-008-6 | OS: show_notification делегирует | OsIntegration.notify() called |
| TC-008-7 | OS: list_processes делегирует | OsIntegration.listProcesses() called |
| TC-008-8 | OS: get_system_info делегирует | OsIntegration.getSystemInfo() called |

**T-009 Integration Tests:**

| ID | Description | Expected |
|----|-------------|----------|
| TC-009-1 | Full registry load (6 skills) | All 6 skills registered |
| TC-009-2 | getTools() для LLM request | Valid JSON Schema tools array |
| TC-009-3 | Permission flow для всех tools | Categories correct for all 21+ tools |
| TC-009-4 | Enable/disable изоляция | Disabled skill tools not in getTools() |
| TC-009-5 | Reload сохраняет state | Skills reloaded from filesystem |

---

## 5. Implementation Plan per Task

### T-001: Skill Registry Core
1. Определить TypeScript interfaces: SkillDefinition, ToolDefinition, ToolResult, PermissionPolicy
2. Реализовать SkillRegistry class с Map<string, SkillDefinition> storage
3. Реализовать register/unregister/getTools/execute/enable/disable/reload
4. Написать unit tests (vitest)
5. Проверить сборку

### T-002: SKILL.md Parser
1. Определить SKILL.md формат: YAML frontmatter (name, version, description, permissions) + Markdown body (tool definitions)
2. Реализовать парсер (frontmatter extraction + tool section parsing)
3. Реализовать валидатор (обязательные поля, JSON Schema валидация для parameters)
4. Реализовать сканер директорий
5. Написать unit tests с fixture SKILL.md файлами
6. Проверить сборку

### T-003: Permission Model
1. Определить PermissionPolicy (tool name -> category mapping)
2. Реализовать PermissionChecker с category-based логикой
3. Категории: read=auto, write=confirm, exec=confirm, system=auto
4. Написать unit tests
5. Проверить сборку

### T-004: Filesystem Skill
1. Создать SKILL.md с определениями 7 tools и JSON Schema parameters
2. Реализовать handler'ы с использованием fs/promises
3. Использовать path.resolve() для нормализации путей
4. Обернуть каждый handler в permission check (категории из SKILL.md)
5. Написать unit tests с temp directory fixtures (beforeEach/afterEach)
6. Проверить сборку

### T-005: Shell Skill
1. Создать SKILL.md с 2 tools
2. Реализовать exec handler через child_process.execFile() с timeout
3. Реализовать exec_sandbox как placeholder (F-012)
4. Все exec operations = confirm permission
5. Написать unit tests
6. Проверить сборку

### T-006: Integration Test -- Bundled
1. Загрузить Filesystem + Shell skills через parser
2. Зарегистрировать в SkillRegistry
3. Проверить getTools()完整性 (9 tools)
4. Проверить permission flow
5. Проверить execute cycle
6. Проверить enable/disable/reload

### T-007: Memory Skill
1. Создать packages/skills-osai/ package structure
2. Создать SKILL.md для Memory skill (4 tools)
3. Реализовать handler'ы, делегирующие в Memory System API
4. Mock'ировать Memory System dependency в тестах (vi.mock)
5. Проверить сборку

### T-008: KB + Chat + OS Skills
1. Создать SKILL.md для каждого skill
2. Реализовать handler'ы как thin wrappers над domain packages
3. Mock'ировать все external dependencies
4. Написать unit tests для каждого skill
5. Проверить сборку

### T-009: Integration Test -- Full System
1. Загрузить все 6 skills через parser
2. Зарегистрировать в SkillRegistry
3. Верифицировать полный tool definitions для LLM
4. Верифицировать permission model для всех tools
5. Cross-package integration test
6. Полная сборка monorepo + все тесты

---

## 6. Quality Expectations

- **Unit test coverage:** >= 85% для skills-core, >= 80% для skills-osai
- **Build stability:** оба пакета собираются без ошибок после каждой задачи
- **TypeScript strict mode:** все файлы проходят tsc --strict
- **No circular dependencies:** между skills-core и skills-osai
- **Mock strategy:** vi.mock() для external dependencies (Memory, KB, Gateway, OS Integration)
- **Fixture strategy:** temp directories для filesystem tests, fixture SKILL.md files

---

## 7. Risks and Edge Cases

| Risk | Impact | Mitigation |
|------|--------|------------|
| R-T007-01 | Memory System API ещё не стабилен (F-005 может быть незавершён) | Memory Skill использует vi.mock -- реализация независима от F-005 |
| R-T007-02 | JSON Schema для tool parameters может не совпадать с LLM provider expectations | Использовать OpenAI function calling format как standard |
| R-T007-03 | Filesystem skill на Windows (path separator differences) | Использовать path module, избегать hardcoded "/" |
| R-T007-04 | Shell exec timeout может не корректно убивать дочерние процессы | Использовать process.kill(-pid) для process group |
| R-T007-05 | SKILL.md формат ещё не финализирован | T-002 определяет формат -- changes propagated через version bump |

---

## 8. Notes

1. **Пакетная структура:** packages/skills-core/ (bundled skills) и packages/skills-osai/ (osaI-specific skills) -- разделение следует из ARCHITECTURE_OVERVIEW
2. **Bundled vs osaI:** bundled skills = самодостаточные (FS, Shell), osaI skills = зависят от других domain packages
3. **Chat Management skill** зависит от Gateway API, которого может ещё не быть -- handler'ы пишутся с vi.mock, реальная интеграция в F-009
4. **exec_sandbox** реализуется как placeholder -- полная Docker integration в F-012
5. **watch_directory и open_application** -- V1 scope, не входят в MVP
6. **Total: 9 задач, ~27 часов** -- в рамках допустимого диапазона для feature данного размера

---

**Версия документа:** v1.0
**Дата создания:** 2026-03-30
**Автор:** TDD Planner Agent
**Статус:** Завершён
