# Task Roadmap: Security Foundation — Permissions + Docker Sandbox (F-009)

**Version:** v1.0
**Generated:** 2026-03-24
**Author:** TDD Planner Agent
**Status:** Active
**Traceability:** FEATURES_INDEX.md v1.0, ARCHITECTURE_OVERVIEW.md v1.0, PROJECT_PROFILE.md v1.0

---

## 1. Feature Overview

- **Feature ID:** F-009
- **Feature Name:** Security Foundation — Permissions + Docker Sandbox
- **Feature Description:** Централизованная security infrastructure: Permission Manager (category-based: read=auto, write=confirm, exec=confirm, system=auto), Docker sandbox для non-main sessions (container lifecycle, resource limits, network isolation), permission_request/response flow через Gateway, audit trail coordination.
- **Domain:** cross-cutting (agent, skills-core, observability)
- **Related Requirements:** FR-038-FR-044, NFR-012, NFR-016, NFR-017
- **Dependencies:** F-004 (Agent Runtime), F-005 (Skills Core)
- **Priority:** Must Have (MVP) для Permissions; Should Have (V1) для Docker Sandbox
- **Git branch:** feature/security-foundation

### Security Layers Coverage (6-Layer Model)

| Layer | Component | Mechanism | Covered in Feature |
|-------|-----------|-----------|-------------------|
| L1 Network | Gateway | WS bind 127.0.0.1; Tailscale E2E | F-002 (Gateway) |
| L2 Sandbox | Docker | Docker containers для non-main sessions | **F-009 (T-003, T-004)** |
| L3 Permissions | Permission Manager | Category-based: read=auto, write=confirm, exec=confirm | **F-009 (T-001, T-002)** |
| L4 File Sandbox | FileSandbox | Allowed dirs; blocked patterns; symlink resolution | F-005 (Skills Core) |
| L5 Shell Security | ShellSkill | Blocked commands; timeout enforcement | F-005 (Skills Core) |
| L6 Audit | Audit Trail | All actions logged with trace_id | **F-009 (T-005)** |

### Key Interfaces (from Architecture)

```typescript
// packages/agent/src/security/index.ts

// Permission Manager (L3)
interface PermissionManager {
  check(toolCall: ToolCall, context: PermissionContext): Promise<PermissionDecision>;
  getCategory(toolName: string): PermissionCategory;
  requestPermission(request: PermissionRequest): Promise<PermissionResponse>;
}

interface PermissionRequest {
  requestId: string;
  sessionId: string;
  traceId: string;
  tool: string;
  action: string;
  params: Record<string, unknown>;
  category: PermissionCategory;
  riskLevel: RiskLevel;
}

interface PermissionResponse {
  requestId: string;
  decision: 'approved' | 'denied';
  reason?: string;
}

type PermissionCategory = 'read' | 'write' | 'execute' | 'system';
type RiskLevel = 'low' | 'medium' | 'high';

// Docker Sandbox (L2)
interface DockerSandbox {
  createContainer(config: SandboxConfig): Promise<ContainerHandle>;
  executeInContainer(containerId: string, command: string): Promise<CommandResult>;
  destroyContainer(containerId: string): Promise<void>;
  getContainerStatus(containerId: string): Promise<ContainerStatus>;
}

interface SandboxConfig {
  sessionId: string;
  image: string;              // default: 'osai-sandbox:latest'
  resourceLimits: ResourceLimits;
  networkIsolation: boolean;  // default: true (--network none)
  allowedDirs: string[];
}

interface ResourceLimits {
  cpuQuota: number;           // e.g., 50000 = 50% CPU
  memoryBytes: number;        // e.g., 512 * 1024 * 1024 = 512MB
  pidsLimit: number;          // max processes
}

// Tool Validation
interface ToolValidator {
  validateActualCategory(toolName: string, params: Record<string, unknown>): PermissionCategory;
  detectMasquerading(toolCall: ToolCall): boolean;
}

// Audit Coordination
interface AuditCoordinator {
  recordPermissionEvent(event: PermissionEvent): void;
  recordSandboxEvent(event: SandboxEvent): void;
  getTraceId(): string;
}
```

---

## 2. Dependencies

### 2.1 Feature Dependencies

- **F-004:** Agent Runtime — blocking
  - Permission Manager интегрируется через `before_tool_call` hook
  - Docker Sandbox управляет tool execution для non-main sessions
  - Interface: `HookPoint`, `HookContext`, `ToolCall`

- **F-005:** Skills Core — blocking
  - Tool Validator использует File Sandbox интерфейсы
  - Permission category mapping для tools
  - Interface: `ToolSchema`, `ToolContext`

- **F-010:** Observability — non-blocking (потребитель)
  - Audit Coordinator отправляет events в ObservabilityManager
  - Audit entries: permission decisions, sandbox events

### 2.2 Task Dependencies

| Task ID | Task Name | Dependencies | Parallel Group |
|---------|-----------|--------------|----------------|
| T-001 | Security Types & Interfaces | None | 1 |
| T-002 | Permission Manager Core | T-001 | 2 |
| T-003 | Permission Request/Response WS Protocol | T-001, T-002 | 3 |
| T-004 | Tool Validation (Masquerading Prevention) | T-001, T-002 | 3 |
| T-005 | Docker Sandbox Infrastructure | T-001 | 2 |
| T-006 | Sandbox Integration with Agent Runtime | T-005 | 3 |
| T-007 | Audit Trail Coordination | T-001 | 2 |
| T-008 | Security Integration Tests | T-002, T-003, T-004, T-005, T-007 | 4 |

### 2.3 Development Order

**Parallel Groups (могут разрабатываться параллельно):**

1. **Group 1 (Foundation):** T-001 (Types & Interfaces)
2. **Group 2 (Core Components):** T-002 (Permission Manager), T-005 (Docker Sandbox), T-007 (Audit Coordination)
3. **Group 3 (Integration):** T-003 (WS Protocol), T-004 (Tool Validation), T-006 (Sandbox Integration)
4. **Group 4 (Validation):** T-008 (Integration Tests)

**Критический путь:** T-001 -> T-002 -> T-003 -> T-008

**Приоритет разработки:**
- MVP: T-001, T-002, T-003, T-004, T-007, T-008 (Permissions + Audit)
- V1: T-005, T-006 (Docker Sandbox — может разрабатываться позже)

---

## 3. Task Breakdown

### Task T-001: Security Types & Interfaces

**Description:**
Определение базовых TypeScript типов и интерфейсов для Security Foundation: PermissionCategory, PermissionRequest/Response, PermissionManager, DockerSandbox, SandboxConfig, ToolValidator, AuditCoordinator.

**Estimated Time:** 2-3 hours

**Dependencies:** None

**Scope:**
- **In scope:**
  - Типы для Permissions: `PermissionCategory`, `PermissionRequest`, `PermissionResponse`, `PermissionDecision`, `RiskLevel`
  - Типы для Permission Manager: `PermissionManager`, `PermissionContext`, `PermissionPolicy`
  - Типы для Docker Sandbox: `DockerSandbox`, `SandboxConfig`, `ContainerHandle`, `ResourceLimits`, `ContainerStatus`
  - Типы для Tool Validation: `ToolValidator`, `ToolValidationResult`, `MasqueradingPattern`
  - Типы для Audit: `PermissionEvent`, `SandboxEvent`, `AuditCoordinator`
  - Error types: `PermissionDeniedError`, `SandboxViolationError`
  - Barrel exports в `index.ts`

- **Out scope:**
  - Реализация классов
  - Integration с Gateway
  - Docker operations

---

### Task T-002: Permission Manager Core

**Description:**
Реализация Permission Manager: category-based checks, policy enforcement, decision caching.

**Estimated Time:** 3-4 hours

**Dependencies:** T-001

**Scope:**
- **In scope:**
  - `PermissionManager` class: `check()`, `getCategory()`, `setPolicy()`
  - Category mapping для tools (read, write, execute, system)
  - Policy configuration (read=auto, write=confirm, exec=confirm, system=auto)
  - Permission decision caching (session-scoped)
  - Desktop notification trigger для confirmation requests
  - Error handling: `PermissionDeniedError`
  - Unit tests: category detection, policy enforcement, caching

- **Out scope:**
  - WS protocol (T-003)
  - Docker sandbox integration
  - Audit logging (T-007)

---

### Task T-003: Permission Request/Response WS Protocol

**Description:**
Реализация permission_request/response flow через Gateway: отправка запросов клиенту, получение ответов, timeout handling.

**Estimated Time:** 3-4 hours

**Dependencies:** T-001, T-002

**Scope:**
- **In scope:**
  - `PermissionRequestHandler` class: `sendRequest()`, `waitForResponse()`
  - Integration с Gateway message routing
  - WS message types: `permission_request`, `permission_response`
  - Request timeout handling (default: 60s)
  - Request queue management (pending requests)
  - Desktop notification fallback (node-notifier)
  - Error handling: timeout, connection loss
  - Unit tests: request flow, timeout, response routing

- **Out scope:**
  - Client UI implementation (F-012 CLI, F-013 Dashboard)
  - Multi-client response coordination

---

### Task T-004: Tool Validation (Masquerading Prevention)

**Description:**
Реализация Tool Validator: проверка реального типа операции, детекция masquerading попыток.

**Estimated Time:** 2-3 hours

**Dependencies:** T-001, T-002

**Scope:**
- **In scope:**
  - `ToolValidator` class: `validateActualCategory()`, `detectMasquerading()`
  - Category validation для каждого tool:
    - Filesystem: read_file=read, write_file=write, delete_file=write
    - Shell: execute=execute
    - HTTP: GET=read, POST/PUT/DELETE=write
  - Masquerading detection patterns:
    - Tool name spoofing
    - Params manipulation (hidden commands)
    - Category mismatch detection
  - Validation logging для audit
  - Unit tests: category validation, masquerading detection

- **Out scope:**
  - File sandbox enforcement (F-005)
  - Shell command blocking (F-005)

---

### Task T-005: Docker Sandbox Infrastructure

**Description:**
Реализация Docker Sandbox: container lifecycle management, resource limits, network isolation.

**Estimated Time:** 4-5 hours

**Dependencies:** T-001

**Scope:**
- **In scope:**
  - `DockerSandbox` class: `createContainer()`, `executeInContainer()`, `destroyContainer()`, `getContainerStatus()`
  - Container lifecycle: create, start, stop, remove
  - Resource limits configuration:
    - CPU quota (default: 50%)
    - Memory limit (default: 512MB)
    - PIDs limit (default: 100)
  - Network isolation (`--network none` default)
  - Volume mounts (allowed dirs only)
  - Container image management (osai-sandbox:latest)
  - Graceful shutdown handling
  - Error handling: Docker unavailable, container errors
  - Unit tests: lifecycle, resource limits, network isolation (mocked Docker)

- **Out scope:**
  - Agent Runtime integration (T-006)
  - Container image building (separate script)

---

### Task T-006: Sandbox Integration with Agent Runtime

**Description:**
Интеграция Docker Sandbox с Agent Runtime: session-based sandbox activation, tool execution routing.

**Estimated Time:** 2-3 hours

**Dependencies:** T-005

**Scope:**
- **In scope:**
  - Session type detection: main=no sandbox, non-main=sandbox
  - `SandboxToolExecutor` class: wraps tool execution в container
  - Tool execution routing: direct vs sandboxed
  - Container per-session lifecycle management
  - Hook integration: `before_tool_call` -> sandbox check
  - Error propagation: sandbox errors -> agent loop
  - Unit tests: routing logic, container lifecycle

- **Out scope:**
  - Permission Manager integration (T-002)
  - Audit coordination (T-007)

---

### Task T-007: Audit Trail Coordination

**Description:**
Реализация Audit Coordinator: coordination security events, integration с ObservabilityManager.

**Estimated Time:** 2-3 hours

**Dependencies:** T-001

**Scope:**
- **In scope:**
  - `AuditCoordinator` class: `recordPermissionEvent()`, `recordSandboxEvent()`, `getTraceId()`
  - Permission events: request, response, decision
  - Sandbox events: container create/destroy, violations
  - Integration с ObservabilityManager (audit entries)
  - Trace ID propagation
  - Event format: id, timestamp, trace_id, session_id, action, params, result, risk_level
  - Unit tests: event recording, trace propagation

- **Out scope:**
  - REST API для audit queries (F-010 Observability)
  - Audit log persistence (F-010)

---

### Task T-008: Security Integration Tests

**Description:**
Комплексные integration tests для Security Foundation: permission flows, sandbox isolation, masquerading prevention.

**Estimated Time:** 3-4 hours

**Dependencies:** T-002, T-003, T-004, T-005, T-007

**Scope:**
- **In scope:**
  - Permission flow tests:
    - Auto-approve read operations
    - Confirm flow for write/exec operations
    - Timeout handling
    - Desktop notification fallback
  - Sandbox isolation tests:
    - Container creation for non-main sessions
    - Resource limits enforcement
    - Network isolation verification
    - Container cleanup on session end
  - Masquerading prevention tests:
    - Tool name spoofing detection
    - Params manipulation detection
    - Category mismatch rejection
  - Audit trail tests:
    - Event recording completeness
    - Trace ID propagation
  - Error scenario tests:
    - Docker unavailable
    - Permission denied
    - Sandbox violation

- **Out scope:**
  - Performance tests
  - Load tests

---

## 4. Test Strategy (TDD)

### 4.1 Test Types per Task

| Task | Unit Tests | Integration Tests | Build & Run Verification |
|------|------------|-------------------|--------------------------|
| T-001 | Type compilation | -- | TypeScript compile |
| T-002 | Category mapping, policy, caching | -- | Unit test run |
| T-003 | Request flow, timeout, routing | WS mock | Unit test run |
| T-004 | Category validation, masquerading | -- | Unit test run |
| T-005 | Lifecycle, limits, isolation | Docker mock | Unit test run |
| T-006 | Routing, lifecycle | Agent mock | Unit test run |
| T-007 | Event recording, trace | Observability mock | Unit test run |
| T-008 | -- | Full security flow | Integration test run |

### 4.2 Build and Run Verification

**Build Verification:**
```bash
# Команда сборки
pnpm --filter @osai/agent build

# Ожидаемый результат
# - TypeScript compilation successful
# - No type errors
# - Declaration files generated

# Критерии успешной сборки
# - Exit code: 0
# - No compiler errors
# - dist/ directory created with .js and .d.ts files
```

**Run Verification:**
```bash
# Команда запуска тестов
pnpm --filter @osai/agent test

# Ожидаемый результат
# - All unit tests pass
# - Test coverage > 80%

# Базовая проверка работоспособности
pnpm --filter @osai/agent test:security
# - Permission Manager: category checks work
# - Docker Sandbox: mock operations work
# - Audit Coordinator: events recorded
```

### 4.3 Test Cases per Task

#### Task T-001: Security Types & Interfaces

| Test ID | Description | Preconditions | Expected Result | Pass/Fail Criteria |
|---------|-------------|---------------|-----------------|-------------------|
| TC-T001-01 | TypeScript compilation succeeds | Source files exist | No type errors | Exit code 0 |
| TC-T001-02 | PermissionCategory enum correct | Types defined | 'read', 'write', 'execute', 'system' | All values present |
| TC-T001-03 | PermissionRequest interface complete | Types defined | requestId, sessionId, tool, action, params, category, riskLevel | All fields typed |
| TC-T001-04 | SandboxConfig interface complete | Types defined | sessionId, image, resourceLimits, networkIsolation, allowedDirs | All fields typed |
| TC-T001-05 | Error types extend base | Types defined | PermissionDeniedError extends Error | Inheritance correct |

#### Task T-002: Permission Manager Core

| Test ID | Description | Preconditions | Expected Result | Pass/Fail Criteria |
|---------|-------------|---------------|-----------------|-------------------|
| TC-T002-01 | Read category auto-approved | PermissionManager initialized | decision=approved, reason='auto' | No user interaction |
| TC-T002-02 | Write category requires confirm | PermissionManager initialized | decision=pending | Request sent to client |
| TC-T002-03 | Execute category requires confirm | PermissionManager initialized | decision=pending | Request sent to client |
| TC-T002-04 | System category auto-approved | PermissionManager initialized | decision=approved | No user interaction |
| TC-T002-05 | Category mapping correct | Tools registered | read_file=read, write_file=write, shell_execute=execute | Correct mapping |
| TC-T002-06 | Decision cached per session | Same tool, same session | Cache hit | No re-check |
| TC-T002-07 | Cache invalidated on deny | Permission denied | Next check not cached | Fresh decision |
| TC-T002-08 | Policy configurable | Custom policy set | Policy applied | Custom behavior |

#### Task T-003: Permission Request/Response WS Protocol

| Test ID | Description | Preconditions | Expected Result | Pass/Fail Criteria |
|---------|-------------|---------------|-----------------|-------------------|
| TC-T003-01 | Request sent to Gateway | Gateway mock ready | permission_request message sent | Correct format |
| TC-T003-02 | Response received | Request pending | decision populated | Approved or denied |
| TC-T003-03 | Timeout handled | No response | Timeout error | Error after 60s |
| TC-T003-04 | Request ID unique | Multiple requests | Different IDs | UUID format |
| TC-T003-05 | Request queue managed | Multiple pending | All tracked | Correct routing |
| TC-T003-06 | Desktop notification fallback | WS unavailable | Notification sent | node-notifier called |

#### Task T-004: Tool Validation (Masquerading Prevention)

| Test ID | Description | Preconditions | Expected Result | Pass/Fail Criteria |
|---------|-------------|---------------|-----------------|-------------------|
| TC-T004-01 | Filesystem read validated | read_file call | category=read | Correct detection |
| TC-T004-02 | Filesystem write validated | write_file call | category=write | Correct detection |
| TC-T004-03 | Shell execute validated | shell_execute call | category=execute | Correct detection |
| TC-T004-04 | HTTP GET validated | http_get call | category=read | Correct detection |
| TC-T004-05 | HTTP POST validated | http_post call | category=write | Correct detection |
| TC-T004-06 | Masquerading detected | Tool name spoofed | detected=true | Rejection |
| TC-T004-07 | Hidden command detected | Params contain command | detected=true | Rejection |
| TC-T004-08 | Category mismatch detected | Declared=read, actual=write | detected=true | Rejection |

#### Task T-005: Docker Sandbox Infrastructure

| Test ID | Description | Preconditions | Expected Result | Pass/Fail Criteria |
|---------|-------------|---------------|-----------------|-------------------|
| TC-T005-01 | Container created | Docker mock ready | Container ID returned | Valid format |
| TC-T005-02 | Resource limits applied | Container created | CPU/memory limits set | Correct values |
| TC-T005-03 | Network isolated | Container created | --network none | No external access |
| TC-T005-04 | Volume mounted | Allowed dir specified | Mount point created | Correct path |
| TC-T005-05 | Command executed | Container running | Exit code 0 | Output returned |
| TC-T005-06 | Container destroyed | Container exists | Container removed | Not found |
| TC-T005-07 | Graceful shutdown | Container running | Container stopped | Clean exit |
| TC-T005-08 | Docker unavailable | Docker not running | Graceful error | Error message |

#### Task T-006: Sandbox Integration with Agent Runtime

| Test ID | Description | Preconditions | Expected Result | Pass/Fail Criteria |
|---------|-------------|---------------|-----------------|-------------------|
| TC-T006-01 | Main session no sandbox | session.type=main | Direct execution | No container |
| TC-T006-02 | Non-main session sandboxed | session.type=isolated | Container created | Sandbox active |
| TC-T006-03 | Tool routed to sandbox | Sandbox active | Executed in container | Container output |
| TC-T006-04 | Container per-session | Multiple sessions | Separate containers | Isolated |
| TC-T006-05 | Container cleanup | Session ended | Container destroyed | No orphan containers |
| TC-T006-06 | Hook integration | before_tool_call | Sandbox check called | Correct flow |

#### Task T-007: Audit Trail Coordination

| Test ID | Description | Preconditions | Expected Result | Pass/Fail Criteria |
|---------|-------------|---------------|-----------------|-------------------|
| TC-T007-01 | Permission event recorded | Permission granted | Audit entry created | Complete record |
| TC-T007-02 | Permission denied recorded | Permission denied | Audit entry with denial | reason logged |
| TC-T007-03 | Sandbox event recorded | Container created | Audit entry created | sessionId, action |
| TC-T007-04 | Trace ID propagated | Trace context active | Same trace_id | Correlation |
| TC-T007-05 | Event format correct | Event recorded | All required fields | Schema valid |
| TC-T007-06 | Integration with Observability | ObservabilityManager mock | recordAudit called | API contract |

#### Task T-008: Security Integration Tests

| Test ID | Description | Preconditions | Expected Result | Pass/Fail Criteria |
|---------|-------------|---------------|-----------------|-------------------|
| TC-T008-01 | Full permission flow (read) | Agent, Gateway ready | Auto-approved, audit logged | Complete flow |
| TC-T008-02 | Full permission flow (write) | Agent, Gateway, Client | User confirms, audit logged | Complete flow |
| TC-T008-03 | Permission timeout | Client not responding | Timeout, audit logged | Error handled |
| TC-T008-04 | Sandbox isolation | Non-main session | Network isolated, resources limited | Isolation verified |
| TC-T008-05 | Masquerading blocked | Spoofed tool call | Rejected, audit logged | Security enforced |
| TC-T008-06 | Audit trail complete | Multiple operations | All events logged | Completeness |
| TC-T008-07 | Docker unavailable fallback | Docker stopped | Graceful degradation | Error logged |
| TC-T008-08 | Sandbox violation | Path outside allowed | Permission denied, audit logged | Security enforced |

---

## 5. Implementation Plan per Task

### Task T-001: Security Types & Interfaces

**Implementation Steps:**
1. Create `packages/agent/src/security/types.ts` — core type definitions
2. Define `PermissionCategory`, `RiskLevel`, `PermissionDecision` enums
3. Define `PermissionRequest`, `PermissionResponse`, `PermissionContext` interfaces
4. Define `SandboxConfig`, `ResourceLimits`, `ContainerHandle`, `ContainerStatus` interfaces
5. Define `ToolValidationResult`, `MasqueradingPattern` interfaces
6. Define `PermissionEvent`, `SandboxEvent` interfaces
7. Create error classes: `PermissionDeniedError`, `SandboxViolationError`
8. Create `packages/agent/src/security/index.ts` — barrel exports
9. Run TypeScript compilation to verify types

**Constraints from Architecture:**
- All types must align with ARCHITECTURE_OVERVIEW.md section 7.1 Security
- Error types must extend `OsaError` base class
- Trace ID must be string (UUID format)

### Task T-002: Permission Manager Core

**Implementation Steps:**
1. Create `packages/agent/src/security/PermissionManager.ts`
2. Implement `PermissionManager` class with constructor accepting `PermissionConfig`
3. Implement `getCategory(toolName: string)` with tool-to-category mapping
4. Implement `check(toolCall, context)` with policy enforcement
5. Implement decision caching (Map<sessionId, Map<toolKey, decision>>)
6. Implement desktop notification trigger integration
7. Create unit tests for all methods
8. Run tests and verify coverage > 80%

**Constraints from Architecture:**
- Category mapping must be configurable
- Default policy: read=auto, write=confirm, exec=confirm, system=auto
- Cache must be session-scoped

### Task T-003: Permission Request/Response WS Protocol

**Implementation Steps:**
1. Create `packages/agent/src/security/PermissionRequestHandler.ts`
2. Implement `sendRequest(request)` — send via Gateway
3. Implement `waitForResponse(requestId, timeout)` — Promise-based wait
4. Implement request queue (Map<requestId, PendingRequest>)
5. Implement timeout handling with cleanup
6. Implement desktop notification fallback (node-notifier)
7. Integrate with Permission Manager (T-002)
8. Create unit tests with Gateway mock

**Constraints from Architecture:**
- Default timeout: 60 seconds
- Request ID must be UUID
- Desktop notification must include: tool, action, risk level

### Task T-004: Tool Validation (Masquerading Prevention)

**Implementation Steps:**
1. Create `packages/agent/src/security/ToolValidator.ts`
2. Implement `validateActualCategory(toolName, params)` — analyze actual operation
3. Define category detection rules per tool type
4. Implement `detectMasquerading(toolCall)` — pattern detection
5. Define masquerading patterns: tool name spoofing, params manipulation
6. Log validation results for audit
7. Integrate with Permission Manager (T-002)
8. Create unit tests for all patterns

**Constraints from Architecture:**
- Validation must occur at tool implementation level (not only SKILL.md category)
- Category mismatch must result in rejection
- All validation failures must be logged

### Task T-005: Docker Sandbox Infrastructure

**Implementation Steps:**
1. Create `packages/agent/src/security/DockerSandbox.ts`
2. Implement `createContainer(config)` — Docker API call
3. Implement resource limits: CPU, memory, PIDs
4. Implement network isolation (`--network none`)
5. Implement volume mounts (allowed dirs only)
6. Implement `executeInContainer(containerId, command)`
7. Implement `destroyContainer(containerId)`
8. Implement graceful shutdown handling
9. Create unit tests with Docker mock
10. Document fallback when Docker unavailable

**Constraints from Architecture:**
- Default image: osai-sandbox:latest
- Default limits: CPU 50%, Memory 512MB, PIDs 100
- Network isolation required (NFR-016)

### Task T-006: Sandbox Integration with Agent Runtime

**Implementation Steps:**
1. Create `packages/agent/src/security/SandboxToolExecutor.ts`
2. Implement session type detection (main vs non-main)
3. Implement `SandboxToolExecutor` wrapping tool execution
4. Implement tool execution routing (direct vs sandboxed)
5. Implement container per-session lifecycle
6. Register hook: `before_tool_call` -> sandbox check
7. Handle sandbox errors in agent loop
8. Create unit tests with Agent mock

**Constraints from Architecture:**
- Main session: no sandbox (direct execution)
- Non-main sessions: sandboxed execution
- Container must be cleaned up on session end

### Task T-007: Audit Trail Coordination

**Implementation Steps:**
1. Create `packages/agent/src/security/AuditCoordinator.ts`
2. Implement `recordPermissionEvent(event)` — format and forward
3. Implement `recordSandboxEvent(event)` — format and forward
4. Implement `getTraceId()` — get current trace context
5. Define event formats (aligned with ObservabilityManager)
6. Integrate with ObservabilityManager (recordAudit API)
7. Implement trace ID propagation
8. Create unit tests with Observability mock

**Constraints from Architecture:**
- Event format must include: id, timestamp, trace_id, session_id, action, params, result, risk_level
- Audit records must be immutable (NFR-017)
- Trace ID must correlate with OTel spans

### Task T-008: Security Integration Tests

**Implementation Steps:**
1. Create `tests/integration/security/` directory
2. Create `permission-flow.test.ts` — full permission flows
3. Create `sandbox-isolation.test.ts` — Docker isolation tests
4. Create `masquerading-prevention.test.ts` — validation tests
5. Create `audit-trail.test.ts` — audit completeness tests
6. Create `error-scenarios.test.ts` — failure handling tests
7. Set up test fixtures (mock Gateway, mock Docker, mock Observability)
8. Run all integration tests
9. Verify all test cases pass

**Constraints from Architecture:**
- All tests must use mock Docker (not real containers)
- Tests must be deterministic (no flaky tests)
- Coverage must include edge cases

---

## 6. Acceptance Criteria per Task

### Task T-001: Security Types & Interfaces
- [ ] All type definitions compile without errors
- [ ] `PermissionCategory` enum has: read, write, execute, system
- [ ] `PermissionRequest` interface has all required fields
- [ ] `SandboxConfig` interface has all required fields
- [ ] Error classes extend base `OsaError`
- [ ] Barrel exports in `index.ts`

### Task T-002: Permission Manager Core
- [ ] `getCategory()` returns correct category for known tools
- [ ] `check()` auto-approves read and system categories
- [ ] `check()` returns pending for write and execute categories
- [ ] Decision caching works per-session
- [ ] Desktop notification triggered for confirm requests
- [ ] Unit test coverage > 80%

### Task T-003: Permission Request/Response WS Protocol
- [ ] Request sent to Gateway with correct format
- [ ] Response received and decision populated
- [ ] Timeout handled after 60 seconds
- [ ] Request IDs are unique (UUID)
- [ ] Desktop notification fallback works
- [ ] Unit test coverage > 80%

### Task T-004: Tool Validation (Masquerading Prevention)
- [ ] Category validation works for all tool types
- [ ] Masquerading detection works for tool name spoofing
- [ ] Masquerading detection works for params manipulation
- [ ] Category mismatch detected
- [ ] Validation results logged
- [ ] Unit test coverage > 80%

### Task T-005: Docker Sandbox Infrastructure
- [ ] Container created with correct config
- [ ] Resource limits applied (CPU, memory, PIDs)
- [ ] Network isolation enforced (`--network none`)
- [ ] Volume mounts work for allowed dirs
- [ ] Command execution works in container
- [ ] Container destroyed on request
- [ ] Graceful shutdown handled
- [ ] Docker unavailable handled gracefully
- [ ] Unit test coverage > 80%

### Task T-006: Sandbox Integration with Agent Runtime
- [ ] Main session uses direct execution (no sandbox)
- [ ] Non-main session uses sandboxed execution
- [ ] Tool execution routed correctly
- [ ] Container created per non-main session
- [ ] Container cleaned up on session end
- [ ] Hook integration works
- [ ] Unit test coverage > 80%

### Task T-007: Audit Trail Coordination
- [ ] Permission events recorded with complete data
- [ ] Sandbox events recorded with complete data
- [ ] Trace ID propagated correctly
- [ ] Event format matches ObservabilityManager schema
- [ ] Integration with ObservabilityManager works
- [ ] Unit test coverage > 80%

### Task T-008: Security Integration Tests
- [ ] All permission flow tests pass
- [ ] All sandbox isolation tests pass
- [ ] All masquerading prevention tests pass
- [ ] All audit trail tests pass
- [ ] All error scenario tests pass
- [ ] No flaky tests
- [ ] Total test coverage > 70%

---

## 7. Quality Expectations

### Coverage Requirements per Task

| Task | Unit Coverage | Integration Coverage | Total |
|------|---------------|---------------------|-------|
| T-001 | 100% (types) | -- | 100% |
| T-002 | > 80% | -- | > 80% |
| T-003 | > 80% | > 70% | > 75% |
| T-004 | > 80% | -- | > 80% |
| T-005 | > 80% | > 70% | > 75% |
| T-006 | > 80% | > 70% | > 75% |
| T-007 | > 80% | -- | > 80% |
| T-008 | -- | > 80% | > 80% |

### Task Completion Time

| Task | Estimated | Target |
|------|-----------|--------|
| T-001 | 2-3 hours | < 3 hours |
| T-002 | 3-4 hours | < 4 hours |
| T-003 | 3-4 hours | < 4 hours |
| T-004 | 2-3 hours | < 3 hours |
| T-005 | 4-5 hours | < 5 hours |
| T-006 | 2-3 hours | < 3 hours |
| T-007 | 2-3 hours | < 3 hours |
| T-008 | 3-4 hours | < 4 hours |
| **Total** | **21-29 hours** | **< 29 hours** |

### Build and Run Stability

- Build must succeed on first try (no type errors)
- All unit tests must pass on first run
- Integration tests may require environment setup (Docker mock)
- No memory leaks in container lifecycle
- No orphan containers after tests

---

## 8. Risks and Edge Cases

### Known Edge Cases

| Edge Case | Impact | Mitigation |
|-----------|--------|------------|
| Docker not installed | Sandbox unavailable | Graceful degradation, file sandbox only |
| Container image missing | Sandbox creation fails | Auto-pull image, error message |
| Permission request timeout | User not responding | Desktop notification fallback, log warning |
| Multiple permission requests | Concurrent requests | Queue management, per-request timeout |
| Session crash during request | Pending request orphaned | Cleanup on session end |
| Malformed tool call | Category detection fails | Default to highest risk category |
| Symlink in sandbox path | Path traversal | Resolve before mount (T-004 in F-005) |

### Risky Scenarios

| Scenario | Risk Level | Mitigation |
|----------|------------|------------|
| Sandbox bypass attempt | CRITICAL | Multi-layer validation, audit logging |
| Permission spoofing | HIGH | Tool validation (T-004), category mismatch detection |
| Docker API abuse | HIGH | Resource limits, network isolation |
| Audit log tampering | MEDIUM | Immutable records (NFR-017), no DELETE API |
| Container escape | CRITICAL | Minimal container, seccomp profile |

### Dependency-Related Risks

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|------------|
| F-004 not ready | Low | Blocking | T-001 can start independently |
| F-005 not ready | Low | Partial | T-004 can use mock tool schemas |
| Docker API changes | Low | Medium | Version pinning, abstraction layer |
| Observability API changes | Low | Medium | Interface abstraction |

---

## 9. Notes

### MVP vs V1 Scope

**MVP (Must Have):**
- T-001, T-002, T-003, T-004, T-007, T-008
- Permission Manager with category-based checks
- Permission request/response flow
- Tool validation (masquerading prevention)
- Audit trail coordination

**V1 (Should Have):**
- T-005, T-006 (Docker Sandbox)
- Full Docker isolation for non-main sessions
- Resource limits enforcement

### Security Model Alignment

This feature implements **L2 (Docker Sandbox)** and **L3 (Permissions)** of the 6-layer security model:
- **L1 Network** — F-002 Gateway
- **L2 Sandbox** — F-009 Docker Sandbox (T-005, T-006)
- **L3 Permissions** — F-009 Permission Manager (T-001, T-002, T-003, T-004)
- **L4 File Sandbox** — F-005 Skills Core
- **L5 Shell Security** — F-005 Skills Core
- **L6 Audit** — F-009 Audit Coordination (T-007) + F-010 Observability

### Testing Strategy Notes

- Docker-related tests use mocked Docker API (not real containers)
- Integration tests require Gateway mock and Observability mock
- Desktop notification tests use node-notifier mock
- All tests must be deterministic (no network calls in unit tests)

### Desktop Notification Integration

Permission requests for write/exec operations trigger desktop notifications:
- Uses `node-notifier` package
- Notification includes: tool name, action, params, risk level
- Click action: open CLI/Dashboard for response
- Fallback: log message if notifications unavailable

---

## 10. Version History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| v1.0 | 2026-03-24 | TDD Planner Agent | Initial roadmap |

---

*End of Task Roadmap: Security Foundation — Permissions + Docker Sandbox (F-009) v1.0*
