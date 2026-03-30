# Implementation Report -- T-004: Filesystem Skill (Bundled)

## Implemented Scope

Bundled filesystem skill с 7 tool handlers, програмно создаваемый SkillDefinition.
Skill не использует SkillMdParser -- это программно определённый bundled skill.

**Tool handlers:**
- `read_file(path)` -- синхронное чтение файла через `fs.readFileSync`
- `write_file(path, content)` -- создание/перезапись файла через `fs.writeFileSync`
- `list_dir(path)` -- листинг директории через `fs.readdirSync` с `withFileTypes`
- `search_files(pattern, directory)` -- поиск файлов по glob pattern (рекурсивный walk + regex)
- `move_file(source, destination)` -- перемещение через `fs.renameSync`
- `delete_file(path)` -- удаление через `fs.unlinkSync`
- `get_file_info(path)` -- metadata через `fs.statSync` (size, mtime, type)

**Permission mapping:**
- `read_file`, `list_dir`, `search_files`, `get_file_info` = `auto`
- `write_file`, `move_file`, `delete_file` = `confirm`

**Handler contract:**
Handlers возвращают сырые данные (string, object, array) при успехе и бросают Error при неудаче. SkillRegistry.execute() оборачивает в `{ success: true, data }` / `{ success: false, error }`.

## Tests Implemented

24 теста в `FilesystemSkill.test.ts`, покрывающие:

| ID | Description | Status |
|----|-------------|--------|
| TC-004-1 | read_file читает существующий файл | PASS |
| TC-004-2 | read_file несуществующий файл (throw -> ToolResult via registry) | PASS |
| TC-004-3 | write_file создаёт новый файл | PASS |
| TC-004-4 | write_file перезаписывает существующий | PASS |
| TC-004-5 | list_dir возвращает файлы с типами | PASS |
| TC-004-6 | list_dir пустая директория | PASS |
| TC-004-7 | search_files по glob pattern `**/*.ts` | PASS |
| TC-004-8 | move_file перемещает файл | PASS |
| TC-004-9 | delete_file удаляет файл | PASS |
| TC-004-10 | get_file_info возвращает metadata { size, mtime, type } | PASS |

Дополнительные тесты:
- Skill definition (name, version, category, 7 tools, permissions)
- Registry integration (register, execute via registry, getTools, enable/disable)
- search_files edge cases (*.log pattern, no match)
- Error handling (missing required parameters)

**Fixture strategy:** temp directory через `fs.mkdtempSync` в `beforeEach`, очистка через `fs.rmSync` в `afterEach`.

## Code Changes

### Files added

- `packages/skills-core/src/skills/filesystem/SKILL.md` -- документация skill (reference only)
- `packages/skills-core/src/skills/filesystem/FilesystemSkill.ts` -- основная реализация (createFilesystemSkill + 7 handlers + glob matcher)
- `packages/skills-core/src/skills/filesystem/index.ts` -- barrel export
- `packages/skills-core/src/skills/filesystem/__tests__/FilesystemSkill.test.ts` -- 24 теста
- `packages/skills-core/src/skills/index.ts` -- skills barrel export

### Files modified

- `packages/skills-core/src/index.ts` -- добавлен экспорт `createFilesystemSkill`

## Architectural Compliance

- **Handler contract:** Handlers возвращают `Promise<unknown>` (тип `ToolHandler`), бросают Error при неудаче. SkillRegistry.execute() оборачивает в `ToolResult`.
- **Sync fs API:** Все операции используют `fs.readFileSync`, `fs.writeFileSync`, `fs.readdirSync`, `fs.statSync`, `fs.renameSync`, `fs.unlinkSync`, `fs.mkdirSync` -- в стиле better-sqlite3 проекта.
- **Cross-platform paths:** Используется `path` module (`path.resolve`, `path.join`, `path.relative`, `path.dirname`).
- **Bundled skill:** Категория `bundled`, не зависит от SkillMdParser.
- **Registration:** FilesystemSkill создаёт корректный `SkillDefinition` и успешно регистрируется в `SkillRegistry`.
- **TypeScript strict mode:** Все файлы проходят `tsc --noEmit`.

## Deviations

1. **Отклонение от roadmap:** Roadmap предполагает отдельные файлы handlers в `handlers/` subdir. Реализация расположила все handlers в одном файле `FilesystemSkill.ts` -- это целесообразно для bundled skill с программным определением (все 7 handlers логически связаны и невелики по размеру). Разделение на отдельные файлы может быть выполнено при рефакторинге.
2. **Отклонение от roadmap:** Roadmap указывает `fs/promises`, но по инструкции задачи используется sync fs API (better-sqlite3 style). handlers являются `async` (для совместимости с типом `ToolHandler`), но внутри используют sync fs calls.
3. **Handler contract:** Handlers не возвращают `ToolResult` напрямую, а бросают Error и возвращают сырые данные. Это совместимо с `SkillRegistry.execute()`, который оборачивает результат.

## Known Limitations

- **Glob pattern matching:** Минимальная реализация, поддерживает `*`, `**`, `?`. Не поддерживает character classes `[abc]`, negation `[!...]`, brace expansion `{a,b}`.
- **Symlink resolution:** Не реализована (out scope по roadmap -- F-012).
- **File sandbox:** Не реализован (out scope по roadmap -- F-012).
- **Binary file handling:** read_file использует `utf-8` кодировку -- бинарные файлы будут повреждены.
