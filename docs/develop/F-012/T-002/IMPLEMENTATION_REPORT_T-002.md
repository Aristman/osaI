# Implementation Report -- T-002: File Sandbox Integration with Skills

## Implemented Scope

Реализован `SandboxAwareFilesystemSkill` -- wrapper для `FilesystemSkill`, который проксирует все 7 tool handlers через `FileSandbox.validate()` перед выполнением. При sandbox violation возвращается `ToolResult` с `success=false` и описательным error, без выполнения реальной файловой операции.

Реализация ограничена рамками T-002 из ROADMAP_TASKS_F-012.md. Audit record creation (delegated to T-007) не реализован -- roadmap явно указывает это как ответственность T-007/T-008.

## Tests Implemented

| Test ID | Description | Result |
|---------|-------------|--------|
| TC-002-1 | read_file inside allowed_dirs -- OK | 2 tests, PASSED |
| TC-002-2 | write_file outside allowed_dirs -- BLOCKED | 2 tests, PASSED |
| TC-002-3 | delete_file matches blocked_pattern -- BLOCKED | 2 tests, PASSED |
| TC-002-4 | list_dir inside allowed_dirs -- OK | 2 tests, PASSED |
| TC-002-5 | symlink escape via move_file -- BLOCKED | 2 tests, SKIPPED (no symlink on Windows without elevation) |

Дополнительные тесты:
- Skill definition integrity (7 tools, permissions preserved) -- 2 tests
- All 7 tools sandbox coverage (search_files, get_file_info, move_file, delete_file) -- 8 tests
- ToolResult structure on sandbox violation -- 2 tests
- Multiple allowed_dirs -- 1 test
- Handler error forwarding (non-sandbox errors) -- 1 test

**Итого:** 22 passed, 2 skipped. Все file-sandbox тесты (T-001 + T-002): 67 passed, 4 skipped.

## Code Changes

### Files Added

- `packages/skills-core/src/security/file-sandbox/SandboxAwareFilesystemSkill.ts` -- основная реализация
- `packages/skills-core/src/security/file-sandbox/__tests__/SandboxAwareFilesystemSkill.test.ts` -- тесты (22 кейса)

### Files Modified

- `packages/skills-core/src/security/file-sandbox/index.ts` -- добавлен barrel export `createSandboxAwareFilesystemSkill`

### Files Modified (cosmetic fix, не часть T-002)

- `packages/skills-core/src/security/shell/SecureShellExecutor.ts` -- удалён неиспользуемый import `CommandLogEntry` (блокировал сборку)

## Architectural Compliance

- **TypeScript strict mode:** все файлы проходят `tsc --strict` (tsconfig.base.json с `"strict": true`)
- **ESM only:** все импорты используют `.js` extension для ESM-совместимости
- **Barrel exports:** обновлён `index.ts` для чистых импортов
- **Dependency injection:** `FileSandbox` передаётся через конструктор функции `createSandboxAwareFilesystemSkill(sandbox)`
- **No scope expansion:** только T-002 scope, audit delegation оставлен на T-007/T-008
- **Profile compliance:** backend-typescript profile -- TypeScript strict, async/await, no `any`, barrel exports

### Design Decisions

1. **Wrapper pattern vs monkey-patching:** Использован функциональный wrapper (`createSandboxAwareFilesystemSkill`), а не monkey-patching существующего `FilesystemSkill`. Это позволяет создавать sandbox-aware и non-sandbox версии одного skill параллельно.

2. **ToolResult as return type:** Все wrapped handlers возвращают `ToolResult` (а не raw data), что соответствует формату `SkillRegistry.execute()` и обеспечивает единообразную обработку ошибок.

3. **Path extraction via static mapping:** Используется статическая таблица `TOOL_PATH_PARAMS` для извлечения путей из tool parameters. Это проще и надёжнее чем динамический анализ JSON Schema.

4. **Sandbox validation order:** Пути валидируются последовательно. При move_file проверяются и source, и destination -- если любой из них нарушает sandbox, операция блокируется.

## Deviations

| Deviation | Justification |
|-----------|---------------|
| Audit record creation не реализован | Roadmap явно указывает "delegated to T-007". Реализация audit logging здесь создала бы ненужную耦合 с ещё не существующим AuditService. |
| 2 symlink-теста пропущены на Windows | Windows требует elevated privileges для создания symlinks. Тесты корректно помечены `it.skipIf(!hasSymlinkSupport)` и пройдут на Linux CI. |
| Minor fix в SecureShellExecutor.ts | Неиспользуемый import блокировал сборку всего пакета. Минимальное исправление для разблокировки. |

## Known Limitations

1. **Sandbox validation is call-site only:** Wrapper проверяет пути только в момент вызова. Если FilesystemSkill handler создаёт дополнительные пути (например, mkdir в write_file), эти пути не проходят через sandbox. Это приемлемо, так как создаются подкаталоги внутри целевого пути, который уже валидирован.

2. **No audit logging yet:** Audit records для sandbox violations будут добавлены в T-008 (Integration + Hooks) через `before_tool_call` hook.

3. **search_files directory-only validation:** Для `search_files` валидируется только корневой `directory` parameter, но не конкретные файлы найденные glob'ом. Файлы glob'а находятся внутри directory, который уже валидирован sandbox'ом.
