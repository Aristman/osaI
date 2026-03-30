# Implementation Report -- T-005: Shell Skill (Bundled)

## Implemented Scope

Реализован bundled skill `shell` с 2 tool'ами: `exec` и `exec_sandbox`.
ShellSkill создаётся программно через функцию `createShellSkill()`, аналогично FilesystemSkill.

**В рамках scope (roadmap T-005):**
- 2 tool handlers (exec, exec_sandbox)
- SKILL.md декларативное определение
- exec через child_process.spawnSync с timeout
- exec_sandbox placeholder (реализация в F-012)
- exec всегда permission level = 'confirm'
- exec_sandbox всегда permission level = 'confirm'
- Default timeout: 30000ms (30s)
- Кроссплатформенная поддержка: cmd.exe (Windows), /bin/sh (Linux/macOS)

**Out of scope:**
- blocked commands list (F-012)
- Docker sandbox реализация (F-012)
- graceful degradation

## Tests Implemented

Все 5 тестовых сценариев из roadmap (TC-005-1..TC-005-5) покрыты.

| ID | Description | Tests | Status |
|----|-------------|-------|--------|
| TC-005-1 | exec выполняет echo | 1 test: stdout содержит "hello", exitCode=0 | PASS |
| TC-005-2 | exec возвращает ошибку для неверной команды | 4 tests: exitCode!=0, error message, missing param, empty param | PASS |
| TC-005-3 | exec timeout убивает процесс | 2 tests: timeout error, non-timeout success | PASS |
| TC-005-4 | exec всегда confirm permission | 4 tests: exec confirm, exec_sandbox confirm, permissions map, tools defined | PASS |
| TC-005-5 | exec_sandbox placeholder | 2 tests: "not implemented" error, idempotent | PASS |

Дополнительно: 6 тестов на metadata (name, version, category, description, JSON Schema) и helper getSleepCommand.

**Итого: 19 тестов, все PASS.**

## Code Changes

### Files Added

1. `packages/skills-core/src/skills/shell/SKILL.md` -- декларативное определение skill (frontmatter + tool definitions)
2. `packages/skills-core/src/skills/shell/ShellSkill.ts` -- основная реализация:
   - `createShellSkill()` -- фабричная функция, возвращающая `SkillDefinition`
   - `execHandler` -- handler для exec tool (spawnSync + timeout)
   - `execSandboxHandler` -- placeholder handler для exec_sandbox tool
   - `getSleepCommand()` -- helper для кроссплатформенного sleep (экспортирован для тестов)
   - Кроссплатформенное определение shell: `cmd.exe /c` (Windows), `/bin/sh -c` (Linux/macOS)
3. `packages/skills-core/src/skills/shell/index.ts` -- barrel export
4. `packages/skills-core/src/skills/shell/__tests__/ShellSkill.test.ts` -- 19 unit tests (TC-005-1..TC-005-5 + metadata)
5. `docs/develop/F-007/T-005/IMPLEMENTATION_REPORT_T-005.md` -- данный отчёт

### Files Modified

1. `packages/skills-core/src/index.ts` -- добавлен экспорт `createShellSkill` и `getSleepCommand`

## Architectural Compliance

- **Профиль:** backend/AGENT_PROFILE_nodejs.md + backend/AGENT_PROFILE_backend-base.md
- **Типы:** используется `SkillDefinition`, `ToolResult`, `ToolHandler` из `types.ts`
- **Permission model:** permissions map `{ exec: 'confirm', exec_sandbox: 'confirm' }` совместим с `PermissionChecker`
- **Barrel exports:** используется паттерн index.ts для чистых импортов
- **ESM modules:** все импорты с `.js` расширениями
- **TypeScript strict mode:** все типы указаны явно, нет `any`
- **Bundled skill pattern:** программное создание через фабричную функцию (как FilesystemSkill)

## Deviations

1. **Default timeout:** Roadmap указывает 120s, но задание пользователя указывает 30000ms (30s). Реализовано 30000ms согласно явной инструкции в задании. Причина: timeout 120s слишком велик для интерактивного использования.

2. **Helper getSleepCommand:** Экспортирован как public API для переиспользования в тестах и интеграционных тестах (T-006). Не входит в scope roadmap, но необходим для кроссплатформенных timeout тестов.

## Known Limitations

1. **Windows timeout behavior:** Команда `timeout /t 10 /nobreak` на Windows может не быть убита по timeout корректно во всех сценариях (аспект F-012).
2. **Process group kill:** Текущая реализация использует `killSignal: 'SIGKILL'`, но не убивает дочерние процессы группы (отмечено как риск R-T007-04 в roadmap, mitigation в F-012).
3. **exec_sandbox:** Полностью placeholder, возвращает фиксированный ответ без анализа параметров.
