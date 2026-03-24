# Task Roadmap: Agent Runtime (F-004)

**Version:** v1.0
**Generated:** 2026-03-24
**Author:** TDD Planner Agent
**Status:** Active
**Traceability:** FEATURES_INDEX.md v1.0, ARCHITECTURE_OVERVIEW.md v1.0, PROJECT_PROFILE.md v1.0

---

## 1. Feature Overview

- **Feature ID:** F-004
- **Feature Name:** Agent Runtime
- **Feature Description:** Основной agent loop: intake -> context_assembly -> model_inference -> tool_execution -> streaming -> persistence. Hook system (11 hook points), model resolver + failover chain (Claude -> GPT -> Ollama), skills loader + executor, context assembly (system prompt + tool schemas + session history), session pruning, error handling (severity classification, retry with backoff).
- **Domain:** agent
- **Related Requirements:** FR-011-FR-019, NFR-002, NFR-007, NFR-025
- **Dependencies:** F-002 (Gateway), F-003 (Configuration)
- **Priority:** Must Have (MVP)
- **Git branch:** feature/agent-runtime

### Key Interfaces (from Architecture)

```typescript
// packages/agent/src/index.ts

class AgentRuntime {
  constructor(config: AgentConfig): void;
  processMessage(message: AgentMessage, session: Session): Promise<void>;
  registerHook(hookPoint: HookPoint, handler: HookHandler, priority?: number): void;
  unregisterHook(hookPoint: HookPoint, handlerId: string): void;
  loadSkills(skillsConfig: SkillsConfig): Promise<void>;
  getToolSchemas(): ToolSchema[];
  executeTool(toolName: string, params: Record<string, unknown>, context: ToolContext): Promise<ToolResult>;
  pruneSession(session: Session, maxTokens: number): void;
  getModelConfig(): ModelConfig;
  getActiveModel(): ModelInfo;
}

type HookPoint =
  | "before_model_resolve"
  | "before_prompt_build"
  | "before_agent_start"
  | "before_tool_call"
  | "after_tool_call"
  | "agent_end"
  | "on_error"
  // osaI extensions
  | "before_memory_query"
  | "after_memory_extract"
  | "on_file_access"
  | "on_desktop_notification";
```

---

## 2. Dependencies

### 2.1 Feature Dependencies

- **F-002:** Gateway (WS Control Plane) -- blocking
  - Agent Runtime получает сообщения от Gateway через Session
  - Agent Runtime отправляет streaming responses обратно в Gateway
  - Interface: `Session`, `AgentMessage`, `OutboundMessage`

- **F-003:** Configuration System -- blocking
  - Agent Runtime читает конфигурацию из `openclaw.json`
  - Секции: model, session, skills, security
  - Interface: `ConfigLoader`, `AgentConfig`, `ModelConfig`, `SessionConfig`

### 2.2 Task Dependencies

| Task ID | Task Name | Dependencies | Parallel Group |
|---------|-----------|--------------|----------------|
| T-001 | Agent Types & Interfaces | None | 1 |
| T-002 | Hook System Core | T-001 | 2 |
| T-003 | Model Resolver + Failover | T-001 | 2 |
| T-004 | Skills Loader + Executor | T-001 | 2 |
| T-005 | Context Assembly | T-001, T-004 | 3 |
| T-006 | Agent Loop Core | T-002, T-003, T-004, T-005 | 4 |
| T-007 | Session Persistence | T-001 | 2 |
| T-008 | Session Pruning | T-005, T-007 | 4 |
| T-009 | Error Handling System | T-001 | 2 |
| T-010 | Streaming Output | T-006 | 5 |
| T-011 | Integration Tests | T-006, T-008, T-010 | 6 |

### 2.3 Development Order

**Parallel Groups (могут разрабатываться параллельно):**

1. **Group 1 (Foundation):** T-001 (Types & Interfaces)
2. **Group 2 (Core Components):** T-002 (Hooks), T-003 (Model Resolver), T-004 (Skills), T-007 (Persistence), T-009 (Error Handling)
3. **Group 3 (Assembly):** T-005 (Context Assembly)
4. **Group 4 (Main Loop):** T-006 (Agent Loop Core), T-008 (Session Pruning)
5. **Group 5 (Output):** T-010 (Streaming)
6. **Group 6 (Validation):** T-011 (Integration Tests)

**Критический путь:** T-001 -> T-004 -> T-005 -> T-006 -> T-010 -> T-011

---

## 3. Task Breakdown

### Task T-001: Agent Types & Interfaces

**Description:**
Определение базовых TypeScript типов и интерфейсов для Agent Runtime: AgentMessage, Session, ToolSchema, HookPoint, HookHandler, AgentConfig, ModelConfig и другие.

**Estimated Time:** 2-3 hours

**Dependencies:** None

**Scope:**
- **In scope:**
  - Типы для agent loop: `AgentMessage`, `AgentResponse`, `SessionState`
  - Типы для hook system: `HookPoint`, `HookHandler`, `HookContext`
  - Типы для model resolver: `ModelProvider`, `ModelConfig`, `ModelInfo`
  - Типы для tools: `ToolSchema`, `ToolContext`, `ToolResult`
  - Типы для configuration: `AgentConfig`, `SkillsConfig`, `SessionConfig`
  - Barrel exports в `index.ts`

- **Out scope:**
  - Реализация классов
  - LLM client implementations
  - Skills implementations

---

### Task T-002: Hook System Core

**Description:**
Реализация hook system: регистрация handlers, priority ordering, execution chain, abort chain support (возврат null для прерывания), error handling в hooks.

**Estimated Time:** 3-4 hours

**Dependencies:** T-001

**Scope:**
- **In scope:**
  - `HookManager` class: `registerHook`, `unregisterHook`, `executeHooks`
  - Priority ordering (lower = earlier execution)
  - Abort chain support (handler возвращает null)
  - Error handling с `on_error` hook
  - Unit tests для всех 11 hook points

- **Out scope:**
  - Конкретные hook implementations (memory, observability)
  - Integration с Agent Runtime (T-006)

---

### Task T-003: Model Resolver + Failover Chain

**Description:**
Реализация model resolver с failover chain: Claude (primary) -> GPT (fallback) -> Ollama (local fallback). Circuit breaker pattern, exponential backoff, error classification.

**Estimated Time:** 4 hours

**Dependencies:** T-001

**Scope:**
- **In scope:**
  - `ModelResolver` class: `resolve()`, `getActiveModel()`, `failover()`
  - `ModelProvider` interface для LLM clients
  - `ClaudeProvider` implementation (streaming support)
  - `OpenAIProvider` implementation (streaming support)
  - `OllamaProvider` implementation (streaming support)
  - Failover chain logic с error classification
  - Circuit breaker pattern (V1 scope: basic implementation)
  - Unit tests с mocked LLM clients

- **Out scope:**
  - Auth profile rotation (V1)
  - Advanced circuit breaker (V1)
  - Integration tests с реальными API (T-011)

---

### Task T-004: Skills Loader + Executor

**Description:**
Реализация skills loader: SKILL.md parsing, tool_schemas generation, tool registration, skill executor interface. Integration с bundled skills (filesystem, shell).

**Estimated Time:** 4 hours

**Dependencies:** T-001

**Scope:**
- **In scope:**
  - `SkillLoader` class: `loadSkills()`, `parseSkillMd()`
  - `SkillRegistry` class: `register()`, `unregister()`, `getToolSchemas()`, `getExecutor()`
  - `SkillExecutor` interface
  - SKILL.md parser (frontmatter + sections)
  - Tool schema generation для LLM
  - Unit tests с test skills

- **Out scope:**
  - Конкретные skill implementations (F-005 Skills Core)
  - Workspace skills loading (V1)
  - Permission checks (F-009 Security)

---

### Task T-005: Context Assembly

**Description:**
Реализация context assembly: system prompt loading (AGENTS.md, SOUL.md), tool schemas injection, session history loading, memory context injection через hooks.

**Estimated Time:** 3-4 hours

**Dependencies:** T-001, T-004

**Scope:**
- **In scope:**
  - `ContextAssembler` class: `assemble()`, `loadSystemPrompt()`, `loadToolSchemas()`, `loadHistory()`
  - System prompt composition: AGENTS.md + SOUL.md + tool schemas
  - Session history integration
  - Context size estimation (token counting)
  - Unit tests с mock data

- **Out scope:**
  - Memory RAG integration (F-006 Memory)
  - Actual file loading (использует mock fs)
  - Token counting library integration (V1)

---

### Task T-006: Agent Loop Core

**Description:**
Реализация основного agent loop: intake -> before_agent_start -> context_assembly -> before_prompt_build -> model_inference -> tool_execution -> streaming -> persistence -> agent_end.

**Estimated Time:** 4 hours

**Dependencies:** T-002, T-003, T-004, T-005

**Scope:**
- **In scope:**
  - `AgentRuntime.processMessage()` implementation
  - Agent loop state machine
  - Hook execution integration (all 7 core hooks)
  - Tool execution loop (multi-turn)
  - Streaming response handling
  - Session state updates
  - Unit tests с mocked dependencies

- **Out scope:**
  - Real LLM calls (mocked)
  - Real skill execution (mocked)
  - Full integration tests (T-011)

---

### Task T-007: Session Persistence

**Description:**
Реализация session persistence: SQLite schema, session serialize/deserialize, message storage, session resume.

**Estimated Time:** 3-4 hours

**Dependencies:** T-001

**Scope:**
- **In scope:**
  - SQLite schema для sessions и messages
  - `SessionRepository` class: `save()`, `load()`, `list()`, `delete()`
  - Session serialization/deserialization
  - Message storage с metadata
  - Session resume logic
  - Unit tests с in-memory SQLite

- **Out scope:**
  - Long-term memory storage (F-006 Memory)
  - Session backup/restore (V2)
  - Multi-session management (Gateway)

---

### Task T-008: Session Pruning

**Description:**
Реализация session pruning: context overflow detection, summarization strategy, safe truncation, message prioritization.

**Estimated Time:** 3 hours

**Dependencies:** T-005, T-007

**Scope:**
- **In scope:**
  - `SessionPruner` class: `prune()`, `estimateTokens()`, `selectMessagesToRemove()`
  - Context overflow detection (threshold: configured max tokens)
  - Safe truncation strategy (preserve system messages, recent context)
  - Message prioritization (tool results vs chat messages)
  - Unit tests с various overflow scenarios

- **Out scope:**
  - Summarization с LLM (V1)
  - Archive removed messages (V2)
  - RAG-based context compression (V2)

---

### Task T-009: Error Handling System

**Description:**
Реализация error handling system: error classification (transient, permanent, critical), retry with exponential backoff, severity levels, error recovery strategies.

**Estimated Time:** 3 hours

**Dependencies:** T-001

**Scope:**
- **In scope:**
  - `AgentError` class hierarchy: `TransientError`, `PermanentError`, `CriticalError`
  - `ErrorHandler` class: `classify()`, `shouldRetry()`, `getBackoffDelay()`
  - Exponential backoff implementation
  - Error severity levels: low, medium, high, critical
  - `on_error` hook integration
  - Unit tests для error scenarios

- **Out scope:**
  - Circuit breaker (в Model Resolver)
  - Graceful degradation strategies (V1)
  - Error reporting (Observability F-010)

---

### Task T-010: Streaming Output

**Description:**
Реализация streaming output: streaming response parsing, tool_stream messages, block messages (text, code, image), Gateway integration.

**Estimated Time:** 3-4 hours

**Dependencies:** T-006

**Scope:**
- **In scope:**
  - `StreamProcessor` class: `processChunk()`, `parseToolCall()`, `formatBlock()`
  - Streaming response parser для LLM outputs
  - Tool stream message formatting
  - Block message types: text, code, image, card, table
  - Gateway output interface integration
  - Unit tests с mock stream data

- **Out scope:**
  - Real LLM streaming (mocked)
  - WebSocket transmission (Gateway)
  - UI rendering (CLI/Dashboard)

---

### Task T-011: Integration Tests

**Description:**
Полные integration tests для Agent Runtime: full agent loop, hook execution order, model failover scenarios, tool execution flow, error recovery.

**Estimated Time:** 4 hours

**Dependencies:** T-006, T-008, T-010

**Scope:**
- **In scope:**
  - Full agent loop test (message -> response)
  - Hook execution order verification
  - Model failover scenarios (primary -> fallback -> local)
  - Tool execution flow (single + multi-turn)
  - Error recovery scenarios
  - Session persistence + resume
  - Session pruning scenarios
  - Mocked external dependencies

- **Out scope:**
  - E2E tests с реальными LLM APIs
  - Performance benchmarks
  - Load testing

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
| T-010 | Yes | No | Yes |
| T-011 | No | Yes | Yes |

### 4.2 Build and Run Verification

**Build Verification:**

```bash
# Команда сборки
cd /home/aristman/projects/osai
pnpm --filter @osai/agent build

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
node -e "const agent = require('./packages/agent/dist'); console.log(typeof agent.AgentRuntime);"

# Ожидаемый результат
# "function"

# Базовая проверка работоспособности
pnpm --filter @osai/agent test -- --run

# Критерии успешного запуска
# - Все unit tests проходят
# - Нет runtime errors
# - Coverage >= 70%
```

### 4.3 Test Cases per Task

#### Task T-001: Agent Types & Interfaces

| Test ID | Description | Preconditions | Expected Result | Pass/Fail |
|---------|-------------|---------------|-----------------|-----------|
| T001-01 | HookPoint type включает все 11 points | TypeScript compiler | Compilation succeeds | All 11 values valid |
| T001-02 | AgentConfig interface валиден | TypeScript compiler | Compilation succeeds | All required fields present |
| T001-03 | ToolSchema соответствует JSON Schema | TypeScript compiler | Compilation succeeds | parameters field is JSONSchema |
| T001-04 | HookHandler interface корректен | TypeScript compiler | Compilation succeeds | execute() returns Promise<HookContext \| null> |
| T001-05 | ModelConfig включает failover chain | TypeScript compiler | Compilation succeeds | fallback: ModelProviderConfig[] |

#### Task T-002: Hook System Core

| Test ID | Description | Preconditions | Expected Result | Pass/Fail |
|---------|-------------|---------------|-----------------|-----------|
| T002-01 | Регистрация hook handler | HookManager instance | Handler added, count = 1 | Handler registered |
| T002-02 | Unregister hook handler | Registered handler | Handler removed, count = 0 | Handler unregistered |
| T002-03 | Priority ordering | 3 handlers with priorities 3, 1, 2 | Execution order: 1, 2, 3 | Correct order |
| T002-04 | Abort chain on null return | Handler returns null | Subsequent handlers not called | Chain aborted |
| T002-05 | Error in handler triggers on_error | Handler throws error | on_error hook called | Error handled |
| T002-06 | Empty hook point returns original context | No handlers registered | Context unchanged | Pass-through |
| T002-07 | Multiple handlers same priority | 2 handlers priority 5 | Both executed (order undefined) | Both called |

#### Task T-003: Model Resolver + Failover Chain

| Test ID | Description | Preconditions | Expected Result | Pass/Fail |
|---------|-------------|---------------|-----------------|-----------|
| T003-01 | Primary model selection | ModelResolver instance | Claude provider selected | Claude active |
| T003-02 | Failover to GPT on Claude error | Claude returns error | GPT provider selected | Failover executed |
| T003-03 | Failover to Ollama on GPT error | GPT returns error | Ollama provider selected | Failover executed |
| T003-04 | All providers fail raises error | All providers error | ModelResolutionError thrown | Error raised |
| T003-05 | Exponential backoff calculation | 3 consecutive failures | Backoff: 1s, 2s, 4s | Correct delays |
| T003-06 | Get active model info | ModelResolver instance | ModelInfo with name, provider | Info returned |
| T003-07 | Streaming support in provider | ClaudeProvider instance | Stream method exists | Method available |

#### Task T-004: Skills Loader + Executor

| Test ID | Description | Preconditions | Expected Result | Pass/Fail |
|---------|-------------|---------------|-----------------|-----------|
| T004-01 | Parse valid SKILL.md | SKILL.md content | SkillDefinition parsed | Valid skill |
| T004-02 | Register skill in registry | SkillDefinition | Skill available via getSkill() | Skill registered |
| T004-03 | Unregister skill | Registered skill | Skill not in registry | Skill removed |
| T004-04 | Get all tool schemas | Multiple skills registered | Array of ToolSchema | All schemas returned |
| T004-05 | Get tool executor | Registered tool | SkillExecutor function | Executor returned |
| T004-06 | Invalid SKILL.md throws error | Malformed content | SkillParseError thrown | Error raised |
| T004-07 | Tool schema includes category | Parsed skill | category field present | Category included |

#### Task T-005: Context Assembly

| Test ID | Description | Preconditions | Expected Result | Pass/Fail |
|---------|-------------|---------------|-----------------|-----------|
| T005-01 | Load system prompt | AGENTS.md exists | System prompt string | Content loaded |
| T005-02 | Load SOUL.md | SOUL.md exists | Soul content appended | Content merged |
| T005-03 | Load tool schemas | Skills registered | Tool schemas formatted | Schemas included |
| T005-04 | Load session history | Session with messages | Messages formatted | History included |
| T005-05 | Estimate context tokens | Context assembled | Token count > 0 | Count returned |
| T005-06 | Empty session returns minimal context | New session | System prompt + tools only | Minimal context |
| T005-07 | Context order correct | All components | System -> Soul -> Tools -> History | Correct order |

#### Task T-006: Agent Loop Core

| Test ID | Description | Preconditions | Expected Result | Pass/Fail |
|---------|-------------|---------------|-----------------|-----------|
| T006-01 | Process message returns response | AgentRuntime instance | AgentResponse generated | Response valid |
| T006-02 | before_agent_start hook called | Message processing | Hook executed | Hook called |
| T006-03 | before_prompt_build hook called | Message processing | Hook executed | Hook called |
| T006-04 | Tool execution loop | Model returns tool_call | Tool executed, result sent | Tool handled |
| T006-05 | Multi-turn tool execution | Multiple tool_calls | All tools executed | Loop works |
| T006-06 | agent_end hook called | Processing complete | Hook executed | Hook called |
| T006-07 | Session state updated | Message processed | Session.lastActiveAt updated | State changed |
| T006-08 | Streaming chunks emitted | Model streams response | Chunks received | Streaming works |

#### Task T-007: Session Persistence

| Test ID | Description | Preconditions | Expected Result | Pass/Fail |
|---------|-------------|---------------|-----------------|-----------|
| T007-01 | Save session | Session instance | Session in database | Record exists |
| T007-02 | Load session | Saved session | Session deserialized | Session loaded |
| T007-03 | List sessions | Multiple sessions | Array of sessions | List returned |
| T007-04 | Delete session | Saved session | Session removed | Record deleted |
| T007-05 | Save message | Session with message | Message in database | Message stored |
| T007-06 | Resume session | Saved session | Session restored with history | Resume works |
| T007-07 | Session persistence after restart | Restart simulation | Session recoverable | Data persisted |

#### Task T-008: Session Pruning

| Test ID | Description | Preconditions | Expected Result | Pass/Fail |
|---------|-------------|---------------|-----------------|-----------|
| T008-01 | No pruning under threshold | Tokens < max | Session unchanged | No pruning |
| T008-02 | Pruning on overflow | Tokens > max | Messages removed | Session pruned |
| T008-03 | System messages preserved | Pruning triggered | System messages kept | Preservation works |
| T008-04 | Recent context preserved | Pruning triggered | Last N messages kept | Recent preserved |
| T008-05 | Token estimation accurate | Context assembled | Estimation within 10% | Accurate estimate |
| T008-06 | Pruning reduces tokens | Pruning triggered | Tokens < max after pruning | Target met |

#### Task T-009: Error Handling System

| Test ID | Description | Preconditions | Expected Result | Pass/Fail |
|---------|-------------|---------------|-----------------|-----------|
| T009-01 | Classify transient error | Network error | TransientError | Classified correctly |
| T009-02 | Classify permanent error | Auth error | PermanentError | Classified correctly |
| T009-03 | Should retry transient | TransientError | true | Retry allowed |
| T009-04 | Should not retry permanent | PermanentError | false | No retry |
| T009-05 | Exponential backoff delay | Retry count = 3 | Delay = base * 2^3 | Correct delay |
| T009-06 | Critical error raises alert | CriticalError | on_error hook called | Hook triggered |
| T009-07 | Error severity classification | Various errors | Correct severity level | Classification works |

#### Task T-010: Streaming Output

| Test ID | Description | Preconditions | Expected Result | Pass/Fail |
|---------|-------------|---------------|-----------------|-----------|
| T010-01 | Process text chunk | Text stream chunk | Block message formatted | Block created |
| T010-02 | Parse tool call | Tool call chunk | ToolCallData parsed | Tool call parsed |
| T010-03 | Format code block | Code content | code block message | Block formatted |
| T010-04 | Tool stream message | Tool execution | tool_stream message | Stream message created |
| T010-05 | Multiple chunks in sequence | Stream of chunks | All chunks processed | Sequence handled |
| T010-06 | Empty chunk handling | Empty chunk | Graceful handling | No error |
| T010-07 | Malformed chunk handling | Invalid chunk | Error caught, logged | Error handled |

#### Task T-011: Integration Tests

| Test ID | Description | Preconditions | Expected Result | Pass/Fail |
|---------|-------------|---------------|-----------------|-----------|
| T011-01 | Full agent loop | AgentRuntime, mocked deps | Response generated | Loop completes |
| T011-02 | Hook execution order | All hooks registered | Correct order verified | Order correct |
| T011-03 | Model failover scenario | Primary fails | Fallback provider used | Failover works |
| T011-04 | Tool execution flow | Tool call from model | Tool executed, result returned | Flow works |
| T011-05 | Error recovery | Transient error | Retry successful | Recovery works |
| T011-06 | Session persistence + resume | Save + load session | Session recovered | Resume works |
| T011-07 | Session pruning integration | Context overflow | Pruning triggered, loop continues | Pruning works |
| T011-08 | Multi-turn conversation | Multiple messages | Context maintained | Conversation works |

---

## 5. Implementation Plan per Task

### Task T-001: Agent Types & Interfaces

**Logical Steps:**
1. Создать `packages/agent/src/types/` directory
2. Определить `HookPoint` type (11 values)
3. Определить `HookHandler`, `HookContext` interfaces
4. Определить `AgentMessage`, `AgentResponse`, `SessionState` types
5. Определить `ModelProvider`, `ModelConfig`, `ModelInfo` types
6. Определить `ToolSchema`, `ToolContext`, `ToolResult` types
7. Определить `AgentConfig`, `SkillsConfig`, `SessionConfig` types
8. Создать barrel exports в `index.ts`

**Constraints from Architecture:**
- TypeScript strict mode enabled
- All types must be exported from `packages/agent/src/index.ts`
- HookPoint включает 7 core + 4 osaI-specific points

**Integration Points:**
- Types используются Gateway (Session, AgentMessage)
- Types используются Config (AgentConfig, ModelConfig)

---

### Task T-002: Hook System Core

**Logical Steps:**
1. Создать `packages/agent/src/hooks/HookManager.ts`
2. Реализовать `registerHook(hookPoint, handler, priority)`
3. Реализовать `unregisterHook(hookPoint, handlerId)`
4. Реализовать `executeHooks(hookPoint, context)` с priority ordering
5. Реализовать abort chain logic (null return)
6. Добавить error handling с `on_error` hook
7. Написать unit tests

**Constraints from Architecture:**
- Priority: lower number = earlier execution
- Abort chain: handler returning null stops execution
- Errors in hooks trigger `on_error` hook

**Integration Points:**
- Вызывается из AgentRuntime на каждой фазе loop
- Позволяет внешним модулям (memory, observability) регистрировать handlers

---

### Task T-003: Model Resolver + Failover Chain

**Logical Steps:**
1. Создать `packages/agent/src/model/ModelResolver.ts`
2. Определить `ModelProvider` interface
3. Создать `packages/agent/src/model/providers/ClaudeProvider.ts`
4. Создать `packages/agent/src/model/providers/OpenAIProvider.ts`
5. Создать `packages/agent/src/model/providers/OllamaProvider.ts`
6. Реализовать failover chain logic
7. Реализовать exponential backoff
8. Написать unit tests с mocked providers

**Constraints from Architecture:**
- Failover order: Claude -> GPT -> Ollama
- Circuit breaker: после 5 failures provider отключается на 60s
- Streaming support обязателен

**Integration Points:**
- Вызывается из AgentRuntime для model inference
- Конфигурация из F-003 (model section)

---

### Task T-004: Skills Loader + Executor

**Logical Steps:**
1. Создать `packages/agent/src/skills/SkillLoader.ts`
2. Создать `packages/agent/src/skills/SkillRegistry.ts`
3. Реализовать SKILL.md parser (frontmatter parsing)
4. Реализовать tool schema generation
5. Реализовать `register()`, `unregister()`, `getToolSchemas()`, `getExecutor()`
6. Написать unit tests с test skills

**Constraints from Architecture:**
- SKILL.md format: YAML frontmatter + Markdown body
- Tool schema должна соответствовать JSON Schema
- Category field обязателен: read | write | execute | system

**Integration Points:**
- Skills регистрируются при загрузке из F-003 config
- Tool schemas передаются в Context Assembly

---

### Task T-005: Context Assembly

**Logical Steps:**
1. Создать `packages/agent/src/context/ContextAssembler.ts`
2. Реализовать `loadSystemPrompt()` (AGENTS.md + SOUL.md)
3. Реализовать `loadToolSchemas()` из SkillRegistry
4. Реализовать `loadHistory()` из Session
5. Реализовать `assemble()` - compose all components
6. Реализовать `estimateTokens()` для context size
7. Написать unit tests

**Constraints from Architecture:**
- Context order: system -> soul -> tools -> history
- Token estimation нужна для pruning decisions
- Max tokens из configuration

**Integration Points:**
- Вызывается из AgentLoop перед model inference
- Использует SkillRegistry для tool schemas
- Использует Session для history

---

### Task T-006: Agent Loop Core

**Logical Steps:**
1. Создать `packages/agent/src/AgentRuntime.ts`
2. Реализовать constructor с dependency injection
3. Реализовать `processMessage()`:
   - before_agent_start hook
   - Context assembly
   - before_prompt_build hook
   - Model inference (streaming)
   - Tool execution loop
   - Streaming output
   - Persistence
   - agent_end hook
4. Интегрировать HookManager
5. Интегрировать ModelResolver
6. Интегрировать ContextAssembler
7. Написать unit tests

**Constraints from Architecture:**
- Agent loop overhead < 50ms без LLM inference (NFR-002)
- Поддержка multi-turn tool execution
- Streaming обязателен

**Integration Points:**
- Вызывается из Gateway (через Session)
- Координирует все компоненты Agent Runtime

---

### Task T-007: Session Persistence

**Logical Steps:**
1. Создать `packages/agent/src/persistence/SessionRepository.ts`
2. Определить SQLite schema (sessions, messages tables)
3. Реализовать `save(session)`
4. Реализовать `load(sessionId)`
5. Реализовать `list()`, `delete(sessionId)`
6. Реализовать message storage
7. Реализовать session resume
8. Написать unit tests с in-memory SQLite

**Constraints from Architecture:**
- SQLite с better-sqlite3 (synchronous API)
- WAL mode для reliability
- Session resume должен восстанавливать complete history

**Integration Points:**
- Вызывается из AgentRuntime для persistence
- Интеграция с F-002 Gateway для session management

---

### Task T-008: Session Pruning

**Logical Steps:**
1. Создать `packages/agent/src/pruning/SessionPruner.ts`
2. Реализовать `estimateTokens(context)`
3. Реализовать `detectOverflow(session, maxTokens)`
4. Реализовать `selectMessagesToRemove(session, tokensToRemove)`
5. Реализовать `prune(session, maxTokens)`
6. Определить prioritization rules
7. Написать unit tests

**Constraints from Architecture:**
- Preserve system messages always
- Preserve recent N messages
- Tool results могут быть более важны чем chat messages

**Integration Points:**
- Вызывается из AgentRuntime при context overflow
- После pruning context пересобирается через ContextAssembler

---

### Task T-009: Error Handling System

**Logical Steps:**
1. Создать `packages/agent/src/errors/AgentError.ts`
2. Определить error hierarchy (Transient, Permanent, Critical)
3. Создать `packages/agent/src/errors/ErrorHandler.ts`
4. Реализовать `classify(error)`
5. Реализовать `shouldRetry(error, attemptCount)`
6. Реализовать `getBackoffDelay(attemptCount)`
7. Интегрировать с `on_error` hook
8. Написать unit tests

**Constraints from Architecture:**
- Severity levels: low, medium, high, critical
- Exponential backoff: base_delay * 2^attempt
- Max retry count из configuration

**Integration Points:**
- Используется во всех Agent Runtime компонентах
- Интеграция с HookManager для `on_error` hook

---

### Task T-010: Streaming Output

**Logical Steps:**
1. Создать `packages/agent/src/streaming/StreamProcessor.ts`
2. Реализовать `processChunk(chunk)` для LLM stream parsing
3. Реализовать `parseToolCall(chunk)` для tool call detection
4. Реализовать `formatBlock(type, content)` для block messages
5. Реализовать `formatToolStream(tool, action, chunk)`
6. Определить interface для Gateway output
7. Написать unit tests

**Constraints from Architecture:**
- Block types: text, code, image, card, table
- Tool stream messages должны включать session_id
- Streaming должен быть non-blocking

**Integration Points:**
- Получает chunks от ModelResolver (LLM providers)
- Отправляет formatted messages в Gateway

---

### Task T-011: Integration Tests

**Logical Steps:**
1. Создать `tests/integration/agent/` directory
2. Настроить test fixtures (mock LLM, mock skills)
3. Написать test для full agent loop
4. Написать test для hook execution order
5. Написать test для model failover scenarios
6. Написать test для tool execution flow
7. Написать test для error recovery
8. Написать test для session persistence + resume
9. Написать test для session pruning
10. Настроить coverage reporting

**Constraints from Architecture:**
- Все внешние dependencies mocked
- Tests должны быть deterministic
- Coverage target: 70%+

**Integration Points:**
- Проверяет интеграцию всех Agent Runtime компонентов
- Валидирует интерфейсы с Gateway и Config

---

## 6. Acceptance Criteria per Task

### Task T-001: Agent Types & Interfaces
- [ ] Все типы определены в `packages/agent/src/types/`
- [ ] TypeScript компиляция без errors
- [ ] Barrel exports работают корректно
- [ ] HookPoint включает все 11 values
- [ ] Build проходит успешно

### Task T-002: Hook System Core
- [ ] HookManager реализован
- [ ] Регистрация/unregistration работает
- [ ] Priority ordering корректен
- [ ] Abort chain поддерживается
- [ ] Error handling работает
- [ ] Unit tests проходят (coverage >= 80%)
- [ ] Build проходит успешно

### Task T-003: Model Resolver + Failover Chain
- [ ] ModelResolver реализован
- [ ] 3 provider implementations (Claude, GPT, Ollama)
- [ ] Failover chain работает
- [ ] Exponential backoff реализован
- [ ] Unit tests проходят (coverage >= 80%)
- [ ] Build проходит успешно

### Task T-004: Skills Loader + Executor
- [ ] SkillLoader реализован
- [ ] SkillRegistry реализован
- [ ] SKILL.md parser работает
- [ ] Tool schema generation корректна
- [ ] Unit tests проходят (coverage >= 80%)
- [ ] Build проходит успешно

### Task T-005: Context Assembly
- [ ] ContextAssembler реализован
- [ ] System prompt loading работает
- [ ] Tool schemas integration работает
- [ ] History loading работает
- [ ] Token estimation реализована
- [ ] Unit tests проходят (coverage >= 80%)
- [ ] Build проходит успешно

### Task T-006: Agent Loop Core
- [ ] AgentRuntime.processMessage() реализован
- [ ] Все hook points интегрированы
- [ ] Tool execution loop работает
- [ ] Streaming работает
- [ ] Session state обновляется
- [ ] Unit tests проходят (coverage >= 75%)
- [ ] Build проходит успешно

### Task T-007: Session Persistence
- [ ] SessionRepository реализован
- [ ] SQLite schema создана
- [ ] CRUD operations работают
- [ ] Session resume работает
- [ ] Unit tests проходят (coverage >= 80%)
- [ ] Build проходит успешно

### Task T-008: Session Pruning
- [ ] SessionPruner реализован
- [ ] Overflow detection работает
- [ ] Safe truncation корректна
- [ ] System messages preserved
- [ ] Unit tests проходят (coverage >= 80%)
- [ ] Build проходит успешно

### Task T-009: Error Handling System
- [ ] Error hierarchy реализована
- [ ] ErrorHandler реализован
- [ ] Classification работает
- [ ] Backoff calculation корректна
- [ ] on_error hook integration работает
- [ ] Unit tests проходят (coverage >= 80%)
- [ ] Build проходит успешно

### Task T-010: Streaming Output
- [ ] StreamProcessor реализован
- [ ] Chunk parsing работает
- [ ] Tool call parsing работает
- [ ] Block formatting корректна
- [ ] Tool stream formatting работает
- [ ] Unit tests проходят (coverage >= 80%)
- [ ] Build проходит успешно

### Task T-011: Integration Tests
- [ ] All 8 integration tests проходят
- [ ] Full agent loop test проходит
- [ ] Hook order verification проходит
- [ ] Model failover test проходит
- [ ] Tool execution test проходит
- [ ] Error recovery test проходит
- [ ] Session persistence test проходит
- [ ] Session pruning test проходит
- [ ] Overall coverage >= 70%

---

## 7. Quality Expectations

### Coverage Requirements

| Task | Unit Test Coverage | Integration Coverage |
|------|-------------------|----------------------|
| T-001 | N/A (types only) | N/A |
| T-002 | >= 80% | N/A |
| T-003 | >= 80% | N/A |
| T-004 | >= 80% | N/A |
| T-005 | >= 80% | N/A |
| T-006 | >= 75% | N/A |
| T-007 | >= 80% | N/A |
| T-008 | >= 80% | N/A |
| T-009 | >= 80% | N/A |
| T-010 | >= 80% | N/A |
| T-011 | N/A | All scenarios |

### Performance Targets

| Metric | Target | Verification |
|--------|--------|--------------|
| Agent loop overhead | < 50ms | Benchmark test |
| Hook execution (single) | < 5ms | Benchmark test |
| Context assembly | < 100ms | Benchmark test |
| Session save | < 50ms | Benchmark test |
| Session load | < 50ms | Benchmark test |

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
| T-003 | 4h | 6h |
| T-004 | 4h | 6h |
| T-005 | 3-4h | 5h |
| T-006 | 4h | 6h |
| T-007 | 3-4h | 5h |
| T-008 | 3h | 4h |
| T-009 | 3h | 4h |
| T-010 | 3-4h | 5h |
| T-011 | 4h | 6h |

---

## 8. Risks and Edge Cases

### Known Edge Cases

1. **Empty message handling**
   - User sends empty message
   - Agent should respond appropriately or skip
   - Mitigation: Input validation in AgentRuntime

2. **Tool call with missing skill**
   - Model returns tool_call for unregistered tool
   - Agent should report error gracefully
   - Mitigation: Tool existence check before execution

3. **Context overflow with all system messages**
   - System prompt exceeds max tokens
   - Pruning cannot reduce context
   - Mitigation: Warn and truncate system prompt

4. **All model providers fail**
   - Claude, GPT, Ollama all unavailable
   - Agent should report error to user
   - Mitigation: Clear error message, suggest retry

5. **Session with no history**
   - New session, no previous messages
   - Context assembly should handle gracefully
   - Mitigation: Return minimal context

6. **Hook throws unhandled error**
   - Hook handler throws unexpected error
   - Should not crash agent loop
   - Mitigation: Try-catch in executeHooks, trigger on_error

7. **Streaming interrupted**
   - LLM connection drops mid-stream
   - Partial response should be preserved
   - Mitigation: Buffer chunks, handle disconnect

8. **Concurrent session access**
   - Multiple requests for same session
   - State consistency
   - Mitigation: Session locking or queue (V1)

### Risky Scenarios

1. **Model failover during active streaming**
   - Claude drops during streaming
   - Need to restart with GPT
   - Risk: Lost context, confused user
   - Mitigation: Retry same request with fallback

2. **Tool execution timeout**
   - Shell command hangs
   - Agent loop blocked
   - Risk: User experience degraded
   - Mitigation: Timeout enforcement (120s default)

3. **Session persistence corruption**
   - SQLite write fails
   - Session state lost
   - Risk: User loses conversation
   - Mitigation: WAL mode, backup before write

4. **Hook chain infinite loop**
   - Hook triggers another hook call
   - Infinite recursion
   - Risk: Stack overflow
   - Mitigation: Max depth limit, cycle detection

### Dependency-Related Risks

1. **F-002 Gateway not available**
   - Agent Runtime initialized before Gateway
   - Cannot send streaming responses
   - Mitigation: Dependency injection, lazy Gateway reference

2. **F-003 Configuration invalid**
   - openclaw.json malformed
   - AgentConfig parsing fails
   - Mitigation: Schema validation, sensible defaults

3. **SQLite not available**
   - better-sqlite3 native module fails
   - Session persistence unavailable
   - Mitigation: In-memory fallback, clear error message

---

## 9. Notes

### Clarifications

1. **Hook execution order for same priority**
   - When multiple hooks have same priority, execution order is undefined
   - Tests should not assume specific order
   - Consider adding secondary sort by registration time (V1)

2. **Token counting method**
   - Initial implementation uses simple character-based estimation
   - Accurate token counting requires tiktoken or similar (V1)
   - Estimation should be within 10% accuracy

3. **Skill loading timing**
   - Skills loaded at AgentRuntime initialization
   - Hot-reload of skills not supported in MVP
   - Workspace skills (custom) loaded from ~/.osai/workspace/skills/ (V1)

4. **Session concurrency**
   - MVP assumes single-threaded access per session
   - Concurrent requests to same session may cause issues
   - Session locking planned for V1

5. **Streaming to multiple clients**
   - Gateway handles broadcasting to multiple clients
   - Agent Runtime streams to single Gateway interface
   - Multiple Dashboard/CLI connections handled by Gateway

### Planning Assumptions

1. Solo developer, sequential task execution within parallel groups
2. External dependencies (LLM APIs) mocked in unit tests
3. Integration tests use in-memory SQLite
4. No real LLM API calls in automated tests (cost, latency, non-determinism)
5. Profile: `ts-backend` (Node.js/TypeScript backend developer)

### Dependencies on Future Features

1. **F-005 Skills Core** - Concrete skill implementations
2. **F-006 Memory** - before_memory_query, after_memory_extract hooks
3. **F-009 Security** - Permission checks in tool execution
4. **F-010 Observability** - Tracing, metrics, audit logging

---

## 10. Changelog

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| v1.0 | 2026-03-24 | TDD Planner Agent | Initial roadmap creation |

---

*End of Task Roadmap: Agent Runtime (F-004) v1.0*
