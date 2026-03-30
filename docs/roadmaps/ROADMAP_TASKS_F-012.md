# Task Roadmap: Security + File Sandbox (F-012)

**Version:** v1.0
**Date:** 2026-03-30
**Author:** TDD Planner Agent
**Status:** Active

---

## Feature F-012: Security + File Sandbox

**Domain:** DOMAIN-001, DOMAIN-003, DOMAIN-006, DOMAIN-010 | **Dependencies:** F-001, F-007, F-009

---

### Task T-001: File Sandbox Core
**Domain:** DOMAIN-003 | **Dependencies:** None

#### Checklist
- [ ] CODE: `packages/skills-core/src/security/file-sandbox/types.ts` (FileSandboxConfig, SandboxResult)
- [ ] CODE: `packages/skills-core/src/security/file-sandbox/FileSandbox.ts` (allowed_dirs, blocked_patterns, validate)
- [ ] CODE: `packages/skills-core/src/security/file-sandbox/SymlinkResolver.ts` (realpath resolution, escape prevention)
- [ ] CODE: `packages/skills-core/src/security/file-sandbox/index.ts`
- [ ] TEST: `packages/skills-core/src/security/file-sandbox/__tests__/FileSandbox.test.ts`
- [ ] TEST: `packages/skills-core/src/security/file-sandbox/__tests__/SymlinkResolver.test.ts`
- [ ] BUILD: `pnpm --filter @osai/skills-core build`

#### Test Cases
| ID | Description | Expected |
|----|-------------|----------|
| TC-001-1 | Путь внутри allowed_dirs разрешён | SandboxResult.allowed = true |
| TC-001-2 | Путь вне allowed_dirs запрещён | SandboxResult.allowed = false, error contains path |
| TC-001-3 | Путь совпадает с blocked_patterns (~/.ssh/**) | SandboxResult.allowed = false |
| TC-001-4 | Symlink внутри allowed_dirs -- real path разрешён | realpath() корректно резолвит |
| TC-001-5 | Symlink escape (symlink -> /etc/passwd) заблокирован | SandboxResult.allowed = false |
| TC-001-6 | Конфигурация из osai.json загружается корректно | Config merged: default + user |
| TC-001-7 | Пустой allowed_dirs -- все пути запрещены | SandboxResult.allowed = false для любого пути |

#### Acceptance
- FileSandbox.validate() проверяет путь по allowed_dirs whitelist и blocked_patterns
- SymlinkResolver резолвит симлинки через fs.realpath() и проверяет, что реальный путь не выходит за allowed_dirs
- Hardcoded blocked_patterns: ~/.ssh/**, ~/.gnupg/**, /etc/**, /boot/**
- Конфигурируемые allowed_dirs из osai.json (security.sandbox.allowedDirs)
- Все unit tests проходят
- Сборка без ошибок

---

### Task T-002: File Sandbox Integration with Skills
**Domain:** DOMAIN-003 | **Dependencies:** T-001

#### Checklist
- [ ] CODE: `packages/skills-core/src/security/file-sandbox/SandboxAwareFilesystemSkill.ts` (wrapper/patch для FilesystemSkill)
- [ ] CODE: `packages/skills-core/src/security/file-sandbox/__tests__/SandboxAwareFilesystemSkill.test.ts`
- [ ] BUILD: `pnpm --filter @osai/skills-core build`

#### Test Cases
| ID | Description | Expected |
|----|-------------|----------|
| TC-002-1 | read_file внутри allowed_dirs -- OK | ToolResult.success = true |
| TC-002-2 | write_file вне allowed_dirs -- BLOCKED | ToolResult.success = false, error = "sandbox violation" |
| TC-002-3 | delete_file совпадает с blocked_pattern -- BLOCKED | ToolResult.success = false |
| TC-002-4 | list_dir внутри allowed_dirs -- OK | ToolResult.success = true |
| TC-002-5 | symlink escape через move_file -- BLOCKED | Symlink resolved, target checked |

#### Acceptance
- Все 7 tool'ов FilesystemSkill проходят через FileSandbox.validate() перед выполнением
- Sandbox violation возвращает ToolResult с success=false и описательным error
- Audit record создаётся при каждой sandbox check (delegated to T-007)
- Сборка и тесты без ошибок

---

### Task T-003: Shell Security
**Domain:** DOMAIN-003 | **Dependencies:** None

#### Checklist
- [ ] CODE: `packages/skills-core/src/security/shell/types.ts` (ShellSecurityConfig, BlockedCommand)
- [ ] CODE: `packages/skills-core/src/security/shell/ShellSecurity.ts` (blocked commands, timeout, logging)
- [ ] CODE: `packages/skills-core/src/security/shell/CommandValidator.ts` (parse, match blocked patterns, prefix check)
- [ ] CODE: `packages/skills-core/src/security/shell/index.ts`
- [ ] TEST: `packages/skills-core/src/security/shell/__tests__/CommandValidator.test.ts`
- [ ] TEST: `packages/skills-core/src/security/shell/__tests__/ShellSecurity.test.ts`
- [ ] BUILD: `pnpm --filter @osai/skills-core build`

#### Test Cases
| ID | Description | Expected |
|----|-------------|----------|
| TC-003-1 | Обычная команда (ls -la) -- разрешена | AllowedResult.allowed = true |
| TC-003-2 | "rm -rf /" -- заблокирована | AllowedResult.allowed = false |
| TC-003-3 | "mkfs.ext4" -- заблокирована | AllowedResult.allowed = false |
| TC-003-4 | "sudo rm -rf /" -- заблокирована (sudo prefix strip) | AllowedResult.allowed = false |
| TC-003-5 | Timeout enforcement -- процесс убит через 120s | Process killed, error = "timeout" |
| TC-003-6 | Timeout configurable из osai.json | Custom timeout respected |
| TC-003-7 | Команда логируется (command, cwd, exit_code, timestamp) | Log entry created |
| TC-003-8 | Конфигурируемый blocked_commands из osai.json | Merged with hardcoded list |

#### Acceptance
- CommandValidator парсит команду и проверяет по blocked_commands list
- Hardcoded blocked: rm -rf /, mkfs.*, dd if=/dev/zero, :(){ :|:& };:, chmod -R 777 /
- Timeout enforcement через child_process с kill signal
- Каждое shell execution логируется в audit
- Конфигурация из osai.json (security.shell.blockedCommands, security.shell.timeout)
- Все unit tests проходят

---

### Task T-004: Shell Security Integration with Shell Skill
**Domain:** DOMAIN-003 | **Dependencies:** T-003

#### Checklist
- [ ] CODE: `packages/skills-core/src/security/shell/SecureShellExecutor.ts` (обёртка для ShellSkill exec)
- [ ] CODE: `packages/skills-core/src/security/shell/__tests__/SecureShellExecutor.test.ts`
- [ ] BUILD: `pnpm --filter @osai/skills-core build`

#### Test Cases
| ID | Description | Expected |
|----|-------------|----------|
| TC-004-1 | exec с разрешённой командой -- выполняется | ToolResult с stdout |
| TC-004-2 | exec с заблокированной командой -- BLOCKED | ToolResult.success = false, error = "blocked command" |
| TC-004-3 | exec с timeout -- убит вовремя | ToolResult.success = false, error = "timeout" |
| TC-004-4 | Audit log entry создаётся для каждого exec | Audit record present |

#### Acceptance
- ShellSkill exec() проходит через CommandValidator перед выполнением
- Blocked command возвращает ToolResult с success=false без выполнения
- Timeout убивает процесс и его дочерние процессы (process group)
- Сборка и тесты без ошибок

---

### Task T-005: Docker Sandbox (Graceful Degradation)
**Domain:** DOMAIN-001 | **Dependencies:** None

#### Checklist
- [ ] CODE: `packages/gateway/src/security/sandbox/types.ts` (SandboxMode, DockerConfig)
- [ ] CODE: `packages/gateway/src/security/sandbox/DockerSandbox.ts` (Docker container lifecycle)
- [ ] CODE: `packages/gateway/src/security/sandbox/SandboxManager.ts` (mode detection, graceful degradation)
- [ ] CODE: `packages/gateway/src/security/sandbox/__tests__/SandboxManager.test.ts`
- [ ] CODE: `packages/gateway/src/security/sandbox/__tests__/DockerSandbox.test.ts`
- [ ] BUILD: `pnpm --filter @osai/gateway build`

#### Test Cases
| ID | Description | Expected |
|----|-------------|----------|
| TC-005-1 | Docker доступен -- mode = docker | SandboxMode.DOCKER |
| TC-005-2 | Docker НЕ доступен -- graceful degradation | SandboxMode.PERMISSION_ONLY |
| TC-005-3 | Docker container создаётся с ограничениями (no-network, cpu, memory) | Container started with correct flags |
| TC-005-4 | Docker container cleanup после завершения | Container removed |
| TC-005-5 | Команда выполняется внутри Docker container | Isolated execution, correct result |
| TC-006-6 | Docker healthcheck при старте | docker info / docker ps не выбрасывает |

#### Acceptance
- SandboxManager.detectMode() проверяет наличие Docker (docker info)
- При наличии Docker: exec_sandbox запускает команду в изолированном container
- При отсутствии Docker: graceful degradation на permission-only mode (permission prompts)
- Docker container имеет ограничения: --network=none, --memory, --cpus
- Все unit tests проходят (Docker presence mock'ируется)

---

### Task T-006: Telegram Security
**Domain:** DOMAIN-006 | **Dependencies:** None

#### Checklist
- [ ] CODE: `packages/gateway/src/security/telegram/types.ts` (TelegramSecurityConfig, AllowedUsersList)
- [ ] CODE: `packages/gateway/src/security/telegram/TelegramSecurity.ts` (whitelist, session encryption)
- [ ] CODE: `packages/gateway/src/security/telegram/SessionEncryption.ts` (AES-256 encrypt/decrypt session files)
- [ ] CODE: `packages/gateway/src/security/telegram/RateLimiter.ts` (rate limiting для userbot)
- [ ] CODE: `packages/gateway/src/security/telegram/__tests__/TelegramSecurity.test.ts`
- [ ] CODE: `packages/gateway/src/security/telegram/__tests__/SessionEncryption.test.ts`
- [ ] CODE: `packages/gateway/src/security/telegram/__tests__/RateLimiter.test.ts`
- [ ] BUILD: `pnpm --filter @osai/gateway build`

#### Test Cases
| ID | Description | Expected |
|----|-------------|----------|
| TC-006-1 | allowedUsers whitelist -- разрешённый пользователь | AccessResult.allowed = true |
| TC-006-2 | allowedUsers whitelist -- неразрешённый пользователь | AccessResult.allowed = false |
| TC-006-3 | Пустой whitelist -- все заблокированы | AccessResult.allowed = false для любого |
| TC-006-4 | Session encryption -- encrypt + decrypt roundtrip | Original data === decrypted data |
| TC-006-5 | Session encryption -- неправильный ключ | Error thrown |
| TC-006-6 | Rate limiter -- в пределах лимита | Allowed |
| TC-006-7 | Rate limiter -- превышение лимита | Blocked, retry_after в ответе |

#### Acceptance
- Bot: allowedUsers whitelist из osai.json (channels.telegram.bot.allowedUsers)
- Userbot: AES-256-GCM шифрование session файлов (~/.osai/channels/telegram/session/)
- Rate limiter: настраиваемый лимит запросов (default: 30 req/min)
- Все unit tests проходят

---

### Task T-007: Audit Service Enhancement
**Domain:** DOMAIN-010 | **Dependencies:** None

#### Checklist
- [ ] CODE: `packages/observability/src/audit/types.ts` (AuditEventType, AuditRecordExtended)
- [ ] CODE: `packages/observability/src/audit/AuditService.ts` (log(), query(), cleanup())
- [ ] CODE: `packages/observability/src/audit/AuditFilters.ts` (filter by trace_id, tool, skill, risk_level)
- [ ] CODE: `packages/observability/src/audit/__tests__/AuditService.test.ts`
- [ ] CODE: `packages/observability/src/audit/__tests__/AuditFilters.test.ts`
- [ ] BUILD: `pnpm --filter @osai/observability build`

#### Test Cases
| ID | Description | Expected |
|----|-------------|----------|
| TC-007-1 | Audit record для file access | Record with action="file_access", tool_name, path |
| TC-007-2 | Audit record для shell exec | Record with action="shell_exec", command, exit_code |
| TC-007-3 | Audit record для permission decision | Record with action="permission_decision", user_decision |
| TC-007-4 | Audit record для sandbox violation | Record with action="sandbox_violation", details |
| TC-007-5 | trace_id propagation | Все записи одного request содержат один trace_id |
| TC-007-6 | Query by trace_id | Returns all records for given trace_id |
| TC-007-7 | Query by time range | Returns records within range |
| TC-007-8 | Query by risk_level | Filters correctly (low/medium/high) |

#### Acceptance
- AuditService.log() создаёт запись в SQLite (osai_audit_log) со всеми обязательными полями
- Поддерживаемые event types: file_access, shell_exec, permission_request, permission_decision, sandbox_violation, tool_call, telegram_access
- AuditFilters для query по trace_id, session_id, chat_id, action, risk_level, time range
- cleanup() удаляет записи старше N дней (настраиваемый retention)
- Все unit tests проходят (SQLite in-memory для тестов)

---

### Task T-008: Security Integration -- Hooks + Wire-Up
**Domain:** DOMAIN-001, DOMAIN-003 | **Dependencies:** T-001, T-003, T-005, T-006, T-007

#### Checklist
- [ ] CODE: `packages/agent/src/hooks/security/BeforeToolCallSecurity.ts` (hook: sandbox + permission check)
- [ ] CODE: `packages/agent/src/hooks/security/OnFileAccessAudit.ts` (hook: audit file access)
- [ ] CODE: `packages/agent/src/hooks/security/AfterToolCallAudit.ts` (hook: audit tool result)
- [ ] CODE: `packages/skills-core/src/security/index.ts` (barrel export всего security модуля)
- [ ] CODE: `packages/gateway/src/security/index.ts` (barrel export)
- [ ] TEST: `tests/integration/security-pipeline.test.ts` (full security chain)
- [ ] BUILD: `pnpm build`
- [ ] BUILD: `pnpm test`

#### Test Cases
| ID | Description | Expected |
|----|-------------|----------|
| TC-008-1 | before_tool_call: file op в sandbox -- OK | Hook passes, tool executes |
| TC-008-2 | before_tool_call: file op вне sandbox -- BLOCKED | Hook blocks, permission_request sent |
| TC-008-3 | before_tool_call: blocked shell command -- BLOCKED | Hook blocks, audit logged |
| TC-008-4 | on_file_access: audit record создаётся | AuditService.log() called |
| TC-008-5 | after_tool_call: shell exec result logged | Audit record with exit_code |
| TC-008-6 | Full pipeline: request -> sandbox check -> exec -> audit | End-to-end security flow works |

#### Acceptance
- Hook before_tool_call интегрирует FileSandbox + CommandValidator + PermissionChecker
- Hook on_file_access создаёт audit record для каждого file operation
- Hook after_tool_call создаёт audit record для shell execution results
- AuditService логирует 100% tool calls, file access, permission decisions
- Полная сборка monorepo без ошибок
- Все unit + integration tests проходят

---

## Dependencies

```
T-001 (File Sandbox Core) -----> T-002 (File Sandbox + Skills)
T-003 (Shell Security) ---------> T-004 (Shell Security + Shell Skill)
T-001, T-003, T-005, T-006, T-007 --> T-008 (Integration + Hooks)
```

**Parallel groups:**
- Group A (parallel): T-001 + T-003 + T-005 + T-006 + T-007
- Group B (after T-001): T-002
- Group C (after T-003): T-004
- Group D (after all): T-008

---

## Build Verification

```bash
# Per-task build
pnpm --filter @osai/skills-core build    # T-001..T-004
pnpm --filter @osai/gateway build        # T-005..T-006
pnpm --filter @osai/observability build  # T-007

# Final full build
pnpm build
pnpm test
```

---

## Quality Expectations

- **Unit test coverage:** >= 85% для security модулей
- **Build stability:** все пакеты собираются без ошибок после каждой задачи
- **TypeScript strict mode:** все файлы проходят tsc --strict
- **Security-critical:** sandbox и blocked commands -- 100% branch coverage
- **Audit completeness:** все 7 event types покрыты тестами

---

## Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Symlink race condition (TOCTOU) | Sandbox bypass | Use fs.realpath() + validate AFTER resolution |
| Docker API version mismatch | Container creation fails | Try-catch with graceful degradation |
| AES-256 key management | Session files not encrypted | Key derived from user config, stored in osai.json (chmod 600) |
| Windows path handling in sandbox | False positives on allowed_dirs | Use path.resolve() + path.normalize() consistently |
| Shell command obfuscation | Bypass blocked_commands | Validate stripped command (aliases, env vars removed) |

---

## Notes

1. **Total: 8 задач, ~23 часа** -- в рамках допустимого диапазона
2. **Cross-domain:** T-005, T-006 в gateway, T-001..T-004 в skills-core, T-007 в observability, T-008 -- integration across all
3. **Docker sandbox** -- graceful degradation обязателен: A-ARCH-10 (70% confidence Docker available)
4. **Audit** (Layer 7) является cross-cutting -- интегрируется со всеми security layers через T-008
5. **Network layer (Layer 1)** уже реализован в F-009 (127.0.0.1:18789 binding) -- не дублируется
6. **Permission prompts (Layer 3)** базовая модель реализована в F-007 (T-003 PermissionChecker) -- F-012 расширяет через hooks

---

**Версия документа:** v1.0
**Дата создания:** 2026-03-30
**Автор:** TDD Planner Agent
**Статус:** Завершён
