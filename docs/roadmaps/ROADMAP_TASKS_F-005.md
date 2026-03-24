# Task Roadmap: Skills Core — Filesystem, Shell, Browser, HTTP (F-005)

**Version:** v1.0
**Generated:** 2026-03-24
**Author:** TDD Planner Agent
**Status:** Active
**Traceability:** FEATURES_INDEX.md v1.0, ARCHITECTURE_OVERVIEW.md v1.0, PROJECT_PROFILE.md v1.0

---

## 1. Feature Overview

- **Feature ID:** F-005
- **Feature Name:** Skills Core — Filesystem, Shell, Browser, HTTP
- **Feature Description:** Встроенные (bundled) skills: Filesystem (6 tools), Shell (execute с timeout, blocked commands), Browser (CDP — V1), HTTP (API client — V1). SKILL.md parser и Skill Registry. File Sandbox (allowed dirs, blocked patterns, symlink resolution). Shell Security.
- **Domain:** skills-core
- **Related Requirements:** FR-020-FR-025, NFR-014, NFR-015, NFR-030
- **Dependencies:** F-004 (Agent Runtime)
- **Priority:** Must Have (MVP) для Filesystem + Shell; Should Have (V1) для Browser + HTTP
- **Git branch:** feature/skills-core

### Key Interfaces (from Architecture)

```typescript
// packages/skills-core/src/index.ts

// SKILL.md Parser
interface SkillParser {
  parse(content: string): Promise<SkillDefinition>;
  validate(skill: SkillDefinition): ValidationResult;
}

interface SkillDefinition {
  name: string;
  version: string;
  description: string;
  tools: ToolDefinition[];
  permissions: PermissionCategory[];
}

// Skill Registry
interface SkillRegistry {
  register(skill: SkillDefinition, executor: SkillExecutor): void;
  unregister(skillName: string): void;
  getToolSchemas(): ToolSchema[];
  getToolExecutor(toolName: string): ToolExecutor | undefined;
  getSkill(skillName: string): SkillDefinition | undefined;
  listSkills(): SkillInfo[];
}

// File Sandbox
interface FileSandbox {
  validatePath(path: string, operation: FileOperation): PathValidationResult;
  isAllowed(path: string): boolean;
  resolveSymlinks(path: string): string;
  isBlockedPattern(path: string): boolean;
}

type FileOperation = 'read' | 'write' | 'delete' | 'list' | 'move';

// Shell Security
interface ShellSecurity {
  validateCommand(command: string): CommandValidationResult;
  isBlocked(command: string): boolean;
  sanitizeCommand(command: string): string;
  getTimeout(): number;
}

// Tool Executor
type ToolExecutor = (
  params: Record<string, unknown>,
  context: ToolContext
) => Promise<ToolResult>;

interface ToolContext {
  sessionId: string;
  workingDirectory: string;
  permissionCallback: PermissionCallback;
  auditLogger: AuditLogger;
}
```

---

## 2. Dependencies

### 2.1 Feature Dependencies

- **F-004:** Agent Runtime — blocking
  - Skills Core предоставляет tool schemas для context assembly
  - Skills Core реализует tool executors для Agent Runtime
  - Interface: `ToolSchema`, `ToolExecutor`, `ToolContext`, `ToolResult`
  - Skill Registry используется Agent Runtime для tool dispatch

### 2.2 Task Dependencies

| Task ID | Task Name | Dependencies | Parallel Group |
|---------|-----------|--------------|----------------|
| T-001 | Skills Core Types & Interfaces | None | 1 |
| T-002 | SKILL.md Parser | T-001 | 2 |
| T-003 | Skill Registry | T-001 | 2 |
| T-004 | File Sandbox Implementation | T-001 | 2 |
| T-005 | Shell Security Implementation | T-001 | 2 |
| T-006 | Filesystem Skill (6 tools) | T-001, T-004 | 3 |
| T-007 | Shell Skill (execute) | T-001, T-005 | 3 |
| T-008 | HTTP Skill (API client V1) | T-001, T-003 | 3 |
| T-009 | Browser Skill (CDP V1) | T-001, T-003 | 3 |
| T-010 | Integration Tests | T-002, T-003, T-006, T-007 | 4 |

### 2.3 Development Order

**Parallel Groups (могут разрабатываться параллельно):**

1. **Group 1 (Foundation):** T-001 (Types & Interfaces)
2. **Group 2 (Core Components):** T-002 (Parser), T-003 (Registry), T-004 (File Sandbox), T-005 (Shell Security)
3. **Group 3 (Skills):** T-006 (Filesystem), T-007 (Shell), T-008 (HTTP), T-009 (Browser)
4. **Group 4 (Validation):** T-010 (Integration Tests)

**Критический путь:** T-001 -> T-004 -> T-006 -> T-010

**Приоритет разработки:**
- MVP: T-001, T-002, T-003, T-004, T-005, T-006, T-007, T-010
- V1: T-008, T-009 (HTTP, Browser — могут разрабатываться позже)

---

## 3. Task Breakdown

### Task T-001: Skills Core Types & Interfaces

**Description:**
Определение базовых TypeScript типов и интерфейсов для Skills Core: SkillDefinition, ToolDefinition, ToolSchema, FileSandbox, ShellSecurity, PermissionCategory и другие.

**Estimated Time:** 2-3 hours

**Dependencies:** None

**Scope:**
- **In scope:**
  - Типы для SKILL.md: `SkillDefinition`, `ToolDefinition`, `SkillMetadata`
  - Типы для registry: `SkillRegistry`, `SkillExecutor`, `ToolExecutor`
  - Типы для file sandbox: `FileSandbox`, `PathValidationResult`, `FileOperation`
  - Типы для shell security: `ShellSecurity`, `CommandValidationResult`, `BlockedCommand`
  - Типы для permissions: `PermissionCategory`, `PermissionRequest`, `PermissionResponse`
  - Типы для tool results: `ToolResult`, `ToolError`, `ToolSuccess`
  - Barrel exports в `index.ts`

- **Out scope:**
  - Реализация классов
  - Конкретные skill implementations
  - Integration с Agent Runtime

---

### Task T-002: SKILL.md Parser

**Description:**
Реализация парсера SKILL.md файлов: YAML frontmatter parsing, Markdown body parsing, tool definitions extraction, validation.

**Estimated Time:** 3-4 hours

**Dependencies:** T-001

**Scope:**
- **In scope:**
  - `SkillParser` class: `parse()`, `validate()`, `parseFrontmatter()`, `parseTools()`
  - YAML frontmatter parsing (gray-matter или yaml library)
  - Tool definitions extraction из sections
  - Validation: required fields, tool schema format
  - Error handling с detailed messages
  - Unit tests с sample SKILL.md files

- **Out scope:**
  - File system operations (использует переданный content string)
  - Dynamic skill loading из workspace
  - Skill hot-reload

---

### Task T-003: Skill Registry

**Description:**
Реализация Skill Registry: регистрация skills, управление tool schemas, dispatch tool executors.

**Estimated Time:** 3-4 hours

**Dependencies:** T-001

**Scope:**
- **In scope:**
  - `SkillRegistry` class: `register()`, `unregister()`, `getToolSchemas()`, `getToolExecutor()`
  - Tool schema generation для LLM (JSON Schema format)
  - Executor mapping по tool name
  - Skill lookup и listing
  - Duplicate registration handling
  - Unit tests с mock skills

- **Out scope:**
  - Skill loading из filesystem (T-002 parser)
  - Permission enforcement (F-009 Security)
  - Audit logging (F-010 Observability)

---

### Task T-004: File Sandbox Implementation

**Description:**
Реализация File Sandbox: allowed directories, blocked patterns, symlink resolution, path traversal prevention.

**Estimated Time:** 4 hours

**Dependencies:** T-001

**Scope:**
- **In scope:**
  - `FileSandbox` class: `validatePath()`, `isAllowed()`, `resolveSymlinks()`, `isBlockedPattern()`
  - Allowed directories configuration (из openclaw.json)
  - Blocked patterns: `~/.ssh`, `~/.gnupg`, `/etc`, `*.pem`, `*.key`
  - Symlink resolution (realpath)
  - Path traversal detection (`../`, absolute path outside allowed)
  - Operation-specific checks (read vs write vs delete)
  - Unit tests с various path scenarios

- **Out scope:**
  - Permission prompts (F-009 Security)
  - File operations (T-006 Filesystem Skill)
  - Docker sandbox (F-009 Security)

---

### Task T-005: Shell Security Implementation

**Description:**
Реализация Shell Security: blocked commands list, command validation, dangerous pattern detection, timeout enforcement.

**Estimated Time:** 3-4 hours

**Dependencies:** T-001

**Scope:**
- **In scope:**
  - `ShellSecurity` class: `validateCommand()`, `isBlocked()`, `sanitizeCommand()`, `getTimeout()`
  - Blocked commands list: `rm -rf /`, `mkfs`, `dd`, `sudo`, `su`, `chmod 777`, `curl | bash`
  - Dangerous pattern detection: pipe to shell, background execution, env var access
  - Command timeout configuration (default: 120s)
  - Command logging interface
  - Unit tests с command validation scenarios

- **Out scope:**
  - Shell execution (T-007 Shell Skill)
  - Docker isolation (F-009 Security)
  - Permission prompts (F-009 Security)

---

### Task T-006: Filesystem Skill (6 tools)

**Description:**
Реализация Filesystem skill с 6 tools: read_file, write_file, list_directory, search_files, move_file, delete_file. Все операции через File Sandbox.

**Estimated Time:** 4 hours

**Dependencies:** T-001, T-004

**Scope:**
- **In scope:**
  - `FilesystemSkill` class с 6 tool executors
  - `read_file`: чтение файла с size limits
  - `write_file`: запись файла с sandbox check
  - `list_directory`: листинг директории
  - `search_files`: поиск файлов (glob patterns)
  - `move_file`: перемещение файла
  - `delete_file`: удаление файла с confirmation
  - SKILL.md definition для filesystem skill
  - Integration с FileSandbox для всех операций
  - Unit tests для всех 6 tools

- **Out scope:**
  - Binary file operations (V1)
  - Large file streaming (V1)
  - Recursive operations optimization (V1)

---

### Task T-007: Shell Skill (execute)

**Description:**
Реализация Shell skill: execute command с timeout, blocked commands check, output streaming, command logging.

**Estimated Time:** 4 hours

**Dependencies:** T-001, T-005

**Scope:**
- **In scope:**
  - `ShellSkill` class с execute tool
  - `execute`: запуск команды с timeout и output capture
  - Integration с ShellSecurity для validation
  - stdout/stderr capture
  - Exit code handling
  - Timeout enforcement (child process kill)
  - Working directory support
  - Environment variables (restricted)
  - SKILL.md definition для shell skill
  - Unit tests с mocked child_process

- **Out scope:**
  - Interactive shell sessions (V1)
  - Background process management (V1)
  - Docker execution (F-009 Security)

---

### Task T-008: HTTP Skill (API client V1)

**Description:**
Реализация HTTP skill: GET, POST, PUT, DELETE requests с timeout, headers, body serialization.

**Estimated Time:** 3-4 hours

**Dependencies:** T-001, T-003

**Scope:**
- **In scope:**
  - `HttpSkill` class с 4 tool executors
  - `http_get`: GET request с query params
  - `http_post`: POST request с JSON body
  - `http_put`: PUT request с JSON body
  - `http_delete`: DELETE request
  - Timeout configuration (default: 30s)
  - Response size limit (default: 10MB)
  - Basic error handling
  - SKILL.md definition для HTTP skill
  - Unit tests с mocked HTTP client

- **Out scope:**
  - Authentication (OAuth, API keys) — V2
  - Retry logic — V2
  - Response caching — V2
  - GraphQL support — V2

---

### Task T-009: Browser Skill (CDP V1)

**Description:**
Реализация Browser skill через Chrome DevTools Protocol: navigate, click, fill, screenshot.

**Estimated Time:** 4 hours

**Dependencies:** T-001, T-003

**Scope:**
- **In scope:**
  - `BrowserSkill` class с 4 tool executors
  - `browser_navigate`: переход на URL
  - `browser_click`: клик по элементу (selector)
  - `browser_fill`: заполнение формы
  - `browser_screenshot`: скриншот страницы
  - CDP connection management (lifecycle)
  - Basic error handling
  - SKILL.md definition для browser skill
  - Unit tests с mocked CDP

- **Out scope:**
  - Full CDP API — V2
  - Multi-tab support — V2
  - Cookie management — V2
  - File download — V2

---

### Task T-010: Integration Tests

**Description:**
Полные integration tests для Skills Core: skill registration, tool execution, sandbox enforcement, security checks.

**Estimated Time:** 4 hours

**Dependencies:** T-002, T-003, T-006, T-007

**Scope:**
- **In scope:**
  - Full skill registration flow
  - Tool schema generation validation
  - Filesystem tool execution с sandbox
  - Shell tool execution с security
  - File sandbox boundary testing
  - Shell command blocking testing
  - Error scenarios coverage
  - Mocked file system для deterministic tests

- **Out scope:**
  - E2E tests с Agent Runtime (F-004)
  - Real HTTP requests (use mocks)
  - Real browser automation (use mocks)

---

## 4. Test Strategy (TDD)

### 4.1 Test Types per Task

| Task | Unit Tests | Integration Tests | Build & Run |
|------|------------|-------------------|-------------|
| T-001 | Yes (type compilation) | No | Yes |
| T-002 | Yes | No | Yes |
| T-003 | Yes | No | Yes |
| T-004 | Yes | No | Yes |
| T-005 | Yes | No | Yes |
| T-006 | Yes | No | Yes |
| T-007 | Yes | No | Yes |
| T-008 | Yes | No | Yes |
| T-009 | Yes | No | Yes |
| T-010 | No | Yes | Yes |

### 4.2 Build and Run Verification

**Build Verification:**

```bash
# Команда сборки
cd /home/aristman/projects/osai
pnpm --filter @osai/skills-core build

# Ожидаемый результат
# - tsup успешно компилирует TypeScript
# - Нет type errors
# - Выходные файлы в dist/

# Критерии успешной сборки
# - Exit code = 0
# - dist/index.js существует
# - dist/index.d.ts существует
```

**Run Verification:**

```bash
# Команда проверки импортов
node -e "const skills = require('./packages/skills-core/dist'); console.log(typeof skills.SkillRegistry);"

# Ожидаемый результат
# "function"

# Базовая проверка работоспособности
pnpm --filter @osai/skills-core test -- --run

# Критерии успешного запуска
# - Все unit tests проходят
# - Нет runtime errors
# - Coverage >= 70%
```

### 4.3 Test Cases per Task

#### Task T-001: Skills Core Types & Interfaces

| Test ID | Description | Preconditions | Expected Result | Pass/Fail |
|---------|-------------|---------------|-----------------|-----------|
| T001-01 | SkillDefinition interface валиден | TypeScript compiler | Compilation succeeds | All required fields present |
| T001-02 | ToolDefinition включает category | TypeScript compiler | Compilation succeeds | category: 'read' \| 'write' \| 'execute' \| 'system' |
| T001-03 | FileOperation type корректен | TypeScript compiler | Compilation succeeds | All 5 operations valid |
| T001-04 | PathValidationResult interface | TypeScript compiler | Compilation succeeds | allowed, reason, resolvedPath fields |
| T001-05 | CommandValidationResult interface | TypeScript compiler | Compilation succeeds | allowed, reason, timeout fields |

#### Task T-002: SKILL.md Parser

| Test ID | Description | Preconditions | Expected Result | Pass/Fail |
|---------|-------------|---------------|-----------------|-----------|
| T002-01 | Parse valid SKILL.md | Valid skill content | SkillDefinition parsed | Valid skill object |
| T002-02 | Parse YAML frontmatter | Content with --- | Metadata extracted | name, version, description |
| T002-03 | Parse tool definitions | Tools section | Array of ToolDefinition | Tools parsed |
| T002-04 | Invalid YAML throws error | Malformed YAML | SkillParseError thrown | Error raised |
| T002-05 | Missing required field | Skill without name | ValidationError thrown | Error raised |
| T002-06 | Tool schema validation | Invalid JSON Schema | ValidationError thrown | Error raised |
| T002-07 | Empty file handling | Empty content | Appropriate error | Error handled |

#### Task T-003: Skill Registry

| Test ID | Description | Preconditions | Expected Result | Pass/Fail |
|---------|-------------|---------------|-----------------|-----------|
| T003-01 | Register skill | SkillDefinition + executor | Skill registered | getSkill() returns skill |
| T003-02 | Unregister skill | Registered skill | Skill removed | getSkill() returns undefined |
| T003-03 | Get tool schemas | Multiple skills | Array of ToolSchema | All schemas returned |
| T003-04 | Get tool executor | Registered tool | ToolExecutor function | Executor returned |
| T003-05 | Duplicate registration | Same skill twice | Error or overwrite | Handled gracefully |
| T003-06 | List skills | Multiple registered | Array of SkillInfo | List returned |
| T003-07 | Unknown tool request | Unregistered tool | undefined returned | Graceful handling |

#### Task T-004: File Sandbox Implementation

| Test ID | Description | Preconditions | Expected Result | Pass/Fail |
|---------|-------------|---------------|-----------------|-----------|
| T004-01 | Allowed directory access | Path in allowed dirs | allowed: true | Access granted |
| T004-02 | Blocked directory access | ~/.ssh path | allowed: false | Access denied |
| T004-03 | Blocked pattern match | *.pem file | allowed: false | Pattern blocked |
| T004-04 | Path traversal detection | ../../../etc/passwd | allowed: false | Traversal blocked |
| T004-05 | Symlink resolution | Symlink to allowed | Resolved path | Symlink resolved |
| T004-06 | Symlink to blocked | Symlink to ~/.ssh | allowed: false | Symlink blocked |
| T004-07 | Operation-specific check | Write to read-only dir | allowed: false | Operation denied |
| T004-08 | Absolute path validation | /tmp/file.txt | Depends on config | Correct result |

#### Task T-005: Shell Security Implementation

| Test ID | Description | Preconditions | Expected Result | Pass/Fail |
|---------|-------------|---------------|-----------------|-----------|
| T005-01 | Valid command | ls -la | allowed: true | Command allowed |
| T005-02 | Blocked command | rm -rf / | allowed: false | Command blocked |
| T005-03 | Sudo blocked | sudo apt update | allowed: false | Sudo blocked |
| T005-04 | Pipe to shell blocked | curl url \| bash | allowed: false | Pattern blocked |
| T005-05 | Background execution | sleep 10 & | allowed: false | Background blocked |
| T005-06 | Timeout value | Default config | timeout: 120000 | Correct timeout |
| T005-07 | Command sanitization | Extra whitespace | Trimmed command | Sanitized |
| T005-08 | Env var detection | export FOO=bar | allowed: false | Env access blocked |

#### Task T-006: Filesystem Skill (6 tools)

| Test ID | Description | Preconditions | Expected Result | Pass/Fail |
|---------|-------------|---------------|-----------------|-----------|
| T006-01 | read_file success | Valid file path | File content | Content returned |
| T006-02 | read_file blocked | Path in blocked dir | SandboxError | Error raised |
| T006-03 | write_file success | Valid path, content | File written | Success |
| T006-04 | write_file blocked | Write to /etc | SandboxError | Error raised |
| T006-05 | list_directory success | Valid directory | Array of entries | Entries returned |
| T006-06 | search_files success | Valid pattern | Matching files | Results returned |
| T006-07 | move_file success | Valid src, dest | File moved | Success |
| T006-08 | delete_file success | Valid file | File deleted | Success |
| T006-09 | delete_file requires confirm | Valid file | Confirmation requested | Prompt shown |
| T006-10 | File size limit | Large file | Truncated or error | Limit enforced |

#### Task T-007: Shell Skill (execute)

| Test ID | Description | Preconditions | Expected Result | Pass/Fail |
|---------|-------------|---------------|-----------------|-----------|
| T007-01 | Execute valid command | echo "hello" | stdout: "hello" | Command executed |
| T007-02 | Execute blocked command | rm -rf / | SecurityError | Command blocked |
| T007-03 | Command timeout | sleep 200 | TimeoutError | Timeout enforced |
| T007-04 | Exit code non-zero | exit 1 | exitCode: 1 | Exit code captured |
| T007-05 | Stderr capture | ls /nonexistent | stderr captured | Stderr returned |
| T007-06 | Working directory | cwd param | Command in cwd | Correct directory |
| T007-07 | Command logging | Any command | Log entry created | Audit logged |

#### Task T-008: HTTP Skill (API client V1)

| Test ID | Description | Preconditions | Expected Result | Pass/Fail |
|---------|-------------|---------------|-----------------|-----------|
| T008-01 | GET request | Valid URL | Response body | Content returned |
| T008-02 | POST request | URL + body | Response body | Content returned |
| T008-03 | PUT request | URL + body | Response body | Content returned |
| T008-04 | DELETE request | Valid URL | Response status | Status returned |
| T008-05 | Request timeout | Slow server | TimeoutError | Timeout enforced |
| T008-06 | Response size limit | Large response | Truncated or error | Limit enforced |
| T008-07 | Error status code | 404 response | Error handled | Error returned |

#### Task T-009: Browser Skill (CDP V1)

| Test ID | Description | Preconditions | Expected Result | Pass/Fail |
|---------|-------------|---------------|-----------------|-----------|
| T009-01 | Navigate to URL | Valid URL | Page loaded | Navigation success |
| T009-02 | Click element | Valid selector | Element clicked | Click success |
| T009-03 | Fill form field | Selector + value | Field filled | Fill success |
| T009-04 | Take screenshot | Page loaded | Image data | Screenshot captured |
| T009-05 | Invalid selector | Nonexistent element | Error handled | Error returned |
| T009-06 | Browser not available | CDP connection fail | ConnectionError | Error raised |

#### Task T-010: Integration Tests

| Test ID | Description | Preconditions | Expected Result | Pass/Fail |
|---------|-------------|---------------|-----------------|-----------|
| T010-01 | Full skill registration | Parser + Registry | Skill available | Registration works |
| T010-02 | Tool schema generation | Registered skills | Valid JSON Schema | Schemas valid |
| T010-03 | Filesystem + sandbox | read_file tool | Sandbox enforced | Security works |
| T010-04 | Shell + security | execute tool | Security enforced | Security works |
| T010-05 | Sandbox bypass attempt | Symlink attack | Access denied | Attack blocked |
| T010-06 | Command injection attempt | Malicious command | Command blocked | Attack blocked |
| T010-07 | Error propagation | Tool error | Proper error type | Error handled |
| T010-08 | Audit logging | Tool execution | Audit entry | Logging works |

---

## 5. Implementation Plan per Task

### Task T-001: Skills Core Types & Interfaces

**Logical Steps:**
1. Создать `packages/skills-core/src/types/` directory
2. Определить `SkillDefinition`, `ToolDefinition`, `SkillMetadata` types
3. Определить `SkillRegistry`, `SkillExecutor`, `ToolExecutor` interfaces
4. Определить `FileSandbox`, `PathValidationResult`, `FileOperation` types
5. Определить `ShellSecurity`, `CommandValidationResult` types
6. Определить `PermissionCategory`, `PermissionRequest`, `PermissionResponse` types
7. Определить `ToolResult`, `ToolError`, `ToolSuccess` types
8. Создать barrel exports в `index.ts`

**Constraints from Architecture:**
- TypeScript strict mode enabled
- Category field: 'read' | 'write' | 'execute' | 'system'
- All types must be exported from `packages/skills-core/src/index.ts`

**Integration Points:**
- Types используются Agent Runtime (F-004)
- Types используются Security Foundation (F-009)

---

### Task T-002: SKILL.md Parser

**Logical Steps:**
1. Создать `packages/skills-core/src/parser/SkillParser.ts`
2. Установить gray-matter или yaml library
3. Реализовать `parse(content)` для full file parsing
4. Реализовать `parseFrontmatter(content)` для YAML extraction
5. Реализовать `parseTools(section)` для tool definitions
6. Реализовать `validate(skill)` для validation
7. Добавить detailed error messages
8. Написать unit tests с sample files

**Constraints from Architecture:**
- SKILL.md format: YAML frontmatter + Markdown body
- Required fields: name, version, description, tools
- Tool schema должна соответствовать JSON Schema

**Integration Points:**
- Parser используется Agent Runtime для skill loading
- Parsed skills регистрируются в SkillRegistry

---

### Task T-003: Skill Registry

**Logical Steps:**
1. Создать `packages/skills-core/src/registry/SkillRegistry.ts`
2. Реализовать internal Map для skill storage
3. Реализовать `register(skill, executor)`
4. Реализовать `unregister(skillName)`
5. Реализовать `getToolSchemas()` — collect from all skills
6. Реализовать `getToolExecutor(toolName)` — lookup by name
7. Реализовать `getSkill()` и `listSkills()`
8. Написать unit tests

**Constraints from Architecture:**
- Tool names должны быть уникальными across all skills
- Tool schema format: JSON Schema compatible
- Executor должен возвращать Promise<ToolResult>

**Integration Points:**
- Registry используется Agent Runtime для tool dispatch
- Registry предоставляет schemas для Context Assembly

---

### Task T-004: File Sandbox Implementation

**Logical Steps:**
1. Создать `packages/skills-core/src/sandbox/FileSandbox.ts`
2. Загрузить configuration для allowed dirs
3. Определить blocked patterns list
4. Реализовать `resolveSymlinks(path)` с fs.realpath
5. Реализовать `isBlockedPattern(path)` с regex matching
6. Реализовать `isAllowed(path)` — composition of checks
7. Реализовать `validatePath(path, operation)` — main API
8. Написать unit tests

**Constraints from Architecture:**
- Blocked patterns: ~/.ssh, ~/.gnupg, /etc, *.pem, *.key
- Symlink resolution обязателен (L4 security)
- Path traversal detection: ../, absolute outside allowed

**Integration Points:**
- FileSandbox используется FilesystemSkill
- Configuration из F-003 (security.fileSandbox section)

---

### Task T-005: Shell Security Implementation

**Logical Steps:**
1. Создать `packages/skills-core/src/security/ShellSecurity.ts`
2. Определить blocked commands list
3. Определить dangerous patterns list
4. Реализовать `isBlocked(command)` — exact + pattern match
5. Реализовать `validateCommand(command)` — main API
6. Реализовать `sanitizeCommand(command)` — trim, normalize
7. Реализовать `getTimeout()` — from config
8. Написать unit tests

**Constraints from Architecture:**
- Blocked: rm -rf /, mkfs, dd, sudo, su, chmod 777, curl | bash
- Dangerous patterns: pipe to shell, background, env access
- Default timeout: 120s (configurable)

**Integration Points:**
- ShellSecurity используется ShellSkill
- Configuration из F-003 (security.shell section)

---

### Task T-006: Filesystem Skill (6 tools)

**Logical Steps:**
1. Создать `packages/skills-core/src/skills/filesystem/` directory
2. Создать `FilesystemSkill.ts` с executor implementations
3. Реализовать `read_file` executor
4. Реализовать `write_file` executor
5. Реализовать `list_directory` executor
6. Реализовать `search_files` executor (glob)
7. Реализовать `move_file` executor
8. Реализовать `delete_file` executor
9. Создать SKILL.md definition
10. Написать unit tests

**Constraints from Architecture:**
- Все операции через FileSandbox validation
- Category: 'read' для read/list/search, 'write' для write/move/delete
- File size limits enforced

**Integration Points:**
- Регистрируется в SkillRegistry при initialization
- Использует FileSandbox для security
- Permission callback для write/delete operations

---

### Task T-007: Shell Skill (execute)

**Logical Steps:**
1. Создать `packages/skills-core/src/skills/shell/` directory
2. Создать `ShellSkill.ts` с executor implementation
3. Реализовать `execute` executor с child_process.spawn
4. Интегрировать ShellSecurity validation
5. Реализовать timeout с timer + process kill
6. Реализовать stdout/stderr capture
7. Реализовать exit code handling
8. Создать SKILL.md definition
9. Написать unit tests с mocked spawn

**Constraints from Architecture:**
- ShellSecurity validation перед execution
- Default timeout: 120s
- Environment variables restricted
- Category: 'execute'

**Integration Points:**
- Регистрируется в SkillRegistry
- Использует ShellSecurity для validation
- Permission callback для confirmation

---

### Task T-008: HTTP Skill (API client V1)

**Logical Steps:**
1. Создать `packages/skills-core/src/skills/http/` directory
2. Создать `HttpSkill.ts` с executor implementations
3. Реализовать `http_get` executor (fetch или axios)
4. Реализовать `http_post` executor
5. Реализовать `http_put` executor
6. Реализовать `http_delete` executor
7. Добавить timeout handling
8. Добавить response size limits
9. Создать SKILL.md definition
10. Написать unit tests с mocked HTTP

**Constraints from Architecture:**
- Default timeout: 30s
- Response size limit: 10MB
- Category: 'read' (GET) / 'write' (POST/PUT/DELETE)

**Integration Points:**
- Регистрируется в SkillRegistry
- V1 scope — basic functionality

---

### Task T-009: Browser Skill (CDP V1)

**Logical Steps:**
1. Создать `packages/skills-core/src/skills/browser/` directory
2. Установить CDP client library (chrome-remote-interface или puppeteer)
3. Создать `BrowserSkill.ts` с executor implementations
4. Реализовать `browser_navigate` executor
5. Реализовать `browser_click` executor
6. Реализовать `browser_fill` executor
7. Реализовать `browser_screenshot` executor
8. Добавить connection management
9. Создать SKILL.md definition
10. Написать unit tests с mocked CDP

**Constraints from Architecture:**
- CDP connection lifecycle management
- Category: 'execute'
- V1 scope — basic automation

**Integration Points:**
- Регистрируется в SkillRegistry
- Requires Chrome/Chromium installed

---

### Task T-010: Integration Tests

**Logical Steps:**
1. Создать `tests/integration/skills-core/` directory
2. Настроить test fixtures (mock fs, mock spawn, mock http)
3. Написать test для skill registration flow
4. Написать test для tool schema generation
5. Написать test для filesystem + sandbox integration
6. Написать test для shell + security integration
7. Написать test для sandbox bypass attempts
8. Написать test для command injection attempts
9. Написать test для error propagation
10. Настроить coverage reporting

**Constraints from Architecture:**
- Все external dependencies mocked
- Tests deterministic
- Coverage target: 70%+

**Integration Points:**
- Проверяет интеграцию всех Skills Core компонентов
- Валидирует interfaces с Agent Runtime

---

## 6. Acceptance Criteria per Task

### Task T-001: Skills Core Types & Interfaces
- [ ] Все типы определены в `packages/skills-core/src/types/`
- [ ] TypeScript компиляция без errors
- [ ] Barrel exports работают корректно
- [ ] PermissionCategory включает все 4 values
- [ ] Build проходит успешно

### Task T-002: SKILL.md Parser
- [ ] SkillParser реализован
- [ ] YAML frontmatter parsing работает
- [ ] Tool definitions parsing работает
- [ ] Validation корректна
- [ ] Error handling comprehensive
- [ ] Unit tests проходят (coverage >= 80%)
- [ ] Build проходит успешно

### Task T-003: Skill Registry
- [ ] SkillRegistry реализован
- [ ] Register/unregister работает
- [ ] Tool schema generation корректна
- [ ] Executor dispatch работает
- [ ] Unit tests проходят (coverage >= 80%)
- [ ] Build проходит успешно

### Task T-004: File Sandbox Implementation
- [ ] FileSandbox реализован
- [ ] Allowed dirs проверка работает
- [ ] Blocked patterns проверка работает
- [ ] Symlink resolution работает
- [ ] Path traversal prevention работает
- [ ] Unit tests проходят (coverage >= 85%)
- [ ] Build проходит успешно

### Task T-005: Shell Security Implementation
- [ ] ShellSecurity реализован
- [ ] Blocked commands list работает
- [ ] Dangerous patterns detection работает
- [ ] Timeout configuration работает
- [ ] Unit tests проходят (coverage >= 85%)
- [ ] Build проходит успешно

### Task T-006: Filesystem Skill (6 tools)
- [ ] Все 6 tools реализованы
- [ ] FileSandbox integration работает
- [ ] SKILL.md создан
- [ ] Unit tests проходят (coverage >= 80%)
- [ ] Build проходит успешно

### Task T-007: Shell Skill (execute)
- [ ] Execute tool реализован
- [ ] ShellSecurity integration работает
- [ ] Timeout enforcement работает
- [ ] Output capture работает
- [ ] SKILL.md создан
- [ ] Unit tests проходят (coverage >= 80%)
- [ ] Build проходит успешно

### Task T-008: HTTP Skill (API client V1)
- [ ] 4 HTTP methods реализованы
- [ ] Timeout handling работает
- [ ] Response size limits работают
- [ ] SKILL.md создан
- [ ] Unit tests проходят (coverage >= 80%)
- [ ] Build проходит успешно

### Task T-009: Browser Skill (CDP V1)
- [ ] 4 browser tools реализованы
- [ ] CDP connection management работает
- [ ] SKILL.md создан
- [ ] Unit tests проходят (coverage >= 80%)
- [ ] Build проходит успешно

### Task T-010: Integration Tests
- [ ] All 8 integration tests проходят
- [ ] Skill registration flow test проходит
- [ ] Tool schema validation test проходит
- [ ] Filesystem + sandbox test проходит
- [ ] Shell + security test проходит
- [ ] Security bypass tests проходят
- [ ] Overall coverage >= 70%

---

## 7. Quality Expectations

### Coverage Requirements

| Task | Unit Test Coverage | Integration Coverage |
|------|-------------------|----------------------|
| T-001 | N/A (types only) | N/A |
| T-002 | >= 80% | N/A |
| T-003 | >= 80% | N/A |
| T-004 | >= 85% (security critical) | N/A |
| T-005 | >= 85% (security critical) | N/A |
| T-006 | >= 80% | N/A |
| T-007 | >= 80% | N/A |
| T-008 | >= 80% | N/A |
| T-009 | >= 80% | N/A |
| T-010 | N/A | All scenarios |

### Performance Targets

| Metric | Target | Verification |
|--------|--------|--------------|
| SKILL.md parsing | < 50ms | Benchmark test |
| Skill registration | < 10ms | Benchmark test |
| Path validation | < 5ms | Benchmark test |
| Command validation | < 2ms | Benchmark test |
| Tool executor dispatch | < 1ms | Benchmark test |

### Code Quality

- TypeScript strict mode enabled
- No `any` types without justification
- ESLint + Biome passing
- Prettier formatting applied
- All imports absolute (no relative paths)

### Task Completion Time

| Task | Estimated | Max Allowed |
|------|-----------|-------------|
| T-001 | 2-3h | 4h |
| T-002 | 3-4h | 5h |
| T-003 | 3-4h | 5h |
| T-004 | 4h | 6h |
| T-005 | 3-4h | 5h |
| T-006 | 4h | 6h |
| T-007 | 4h | 6h |
| T-008 | 3-4h | 5h |
| T-009 | 4h | 6h |
| T-010 | 4h | 6h |

---

## 8. Risks and Edge Cases

### Known Edge Cases

1. **Symlink chains**
   - Multiple levels of symlinks pointing to blocked directory
   - FileSandbox должен resolve все уровни
   - Mitigation: fs.realpath with max depth check

2. **Command obfuscation**
   - Commands with encoded characters, escaping
   - ShellSecurity должен detect obfuscation
   - Mitigation: Normalize command before checking

3. **Race conditions in file operations**
   - File deleted between sandbox check and operation
   - Should handle gracefully
   - Mitigation: Error handling в executors

4. **Large file reading**
   - File exceeds size limit
   - Should truncate or error
   - Mitigation: Stream with size check

5. **Long-running shell commands**
   - Command hangs indefinitely
   - Timeout должен kill process
   - Mitigation: SIGKILL after SIGTERM

6. **Invalid SKILL.md format**
   - Malformed YAML, missing sections
   - Parser должен throw detailed error
   - Mitigation: Comprehensive validation

7. **Tool name collisions**
   - Two skills define same tool name
   - Registry должен handle
   - Mitigation: Error on duplicate or namespacing

8. **Network failures in HTTP skill**
   - Request fails, timeout, DNS error
   - Should return proper error
   - Mitigation: Error classification

### Risky Scenarios

1. **Sandbox bypass via TOCTOU**
   - Time-of-check-time-of-use attack
   - File replaced after validation
   - Risk: Access to blocked file
   - Mitigation: Validate on open, use file descriptors

2. **Command injection via parameters**
   - User input contains shell metacharacters
   - Command injection
   - Risk: Arbitrary command execution
   - Mitigation: Parameter escaping, no shell interpolation

3. **Browser skill XSS**
   - Malicious page executes script
   - CDP vulnerability
   - Risk: Browser compromise
   - Mitigation: Sandboxed browser profile, disable features

4. **HTTP skill SSRF**
   - Request to internal network
   - Server-side request forgery
   - Risk: Internal service access
   - Mitigation: Block private IP ranges

### Dependency-Related Risks

1. **F-004 Agent Runtime not ready**
   - Skills Core cannot integrate
   - Cannot test tool dispatch
   - Mitigation: Mock Agent Runtime interfaces

2. **F-003 Configuration invalid**
   - Sandbox config malformed
   - Default to restrictive mode
   - Mitigation: Config validation, safe defaults

3. **Node.js native modules**
   - fs.realpath, child_process platform differences
   - Behavior varies on different OS
   - Mitigation: Cross-platform testing

---

## 9. Notes

### Clarifications

1. **SKILL.md vs hardcoded skills**
   - Bundled skills (filesystem, shell) могут быть определены в code или SKILL.md
   - Рекомендация: SKILL.md для consistency и documentation
   - Parser должен поддерживать оба варианта

2. **Permission callback interface**
   - Permission callback приходит из Agent Runtime
   - Interface: `(request: PermissionRequest) => Promise<PermissionResponse>`
   - Timeout на user response: configurable

3. **Audit logging interface**
   - Audit logging через Agent Runtime (F-010)
   - Interface: `(event: AuditEvent) => void`
   - Events: tool_call, sandbox_violation, security_violation

4. **CDP vs Puppeteer**
   - CDP более низкоуровневый, лучше control
   - Puppeteer проще в использовании
   - Рекомендация: Puppeteer для V1, CDP для V2 optimization

5. **HTTP client library**
   - node-fetch, axios, или native fetch (Node 18+)
   - Рекомендация: Native fetch для simplicity, axios если нужны features

### Planning Assumptions

1. Solo developer, sequential task execution within parallel groups
2. File system operations mocked in unit tests
3. Shell commands mocked with child_process mock
4. HTTP requests mocked with nock или similar
5. Browser CDP mocked for unit tests
6. Profile: `ts-backend` (Node.js/TypeScript backend developer)

### Dependencies on Future Features

1. **F-009 Security Foundation** — Permission Manager integration
2. **F-010 Observability** — Audit logging integration
3. **F-006 Memory** — Potential skill for memory access

---

## 10. Changelog

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| v1.0 | 2026-03-24 | TDD Planner Agent | Initial roadmap creation |

---

*End of Task Roadmap: Skills Core (F-005) v1.0*
