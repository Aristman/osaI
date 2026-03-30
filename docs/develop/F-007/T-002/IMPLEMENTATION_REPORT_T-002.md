# Implementation Report -- T-002 (SKILL.md Parser)

## Implemented Scope

- Парсер SKILL.md декларативного формата (YAML frontmatter + Markdown body с tool definitions)
- Валидатор обязательных полей, JSON Schema параметров, permission levels, skill categories
- Сканер директорий для поиска SKILL.md файлов в поддиректориях
- Barrel export через parser/index.ts, re-export через packages/skills-core/src/index.ts

Только in-scope задачи из ROADMAP_TASKS_F-007.md (T-002).

## Tests Implemented

| Test ID | Description | Status |
|---------|-------------|--------|
| TC-002-1 | Парсит валидный SKILL.md с frontmatter | PASS |
| TC-002-1 | Извлекает JSON Schema параметры из tool definition | PASS |
| TC-002-2 | Парсит SKILL.md с несколькими tools | PASS |
| TC-002-2 | Корректно парсит параметры каждого tool | PASS |
| TC-002-3 | Выбрасывает при отсутствующем name | PASS |
| TC-002-4 | Выбрасывает при невалидном JSON Schema в tool | PASS |
| TC-002-5 | Сканер находит все SKILL.md в директории | PASS |
| TC-002-6 | Сканер игнорирует поддиректории без SKILL.md | PASS |

Дополнительные edge case тесты:
- Default category (workspace) при отсутствии
- Default version (0.0.0) при отсутствии
- Whitespace trimming в значениях frontmatter
- Отсутствующий frontmatter
- Отсутствующее description
- Невалидный permission level
- Невалидный parameters.type (не "object")
- Skill без tools
- Skill без permissions

Итого: 17 тестов, все проходят.

## Code Changes

### Files added
- `packages/skills-core/src/parser/SkillMdParser.ts` -- парсер SKILL.md (frontmatter extraction, tool extraction, directory scanner)
- `packages/skills-core/src/parser/SkillMdValidator.ts` -- валидация parsed data, конвертация в SkillDefinition
- `packages/skills-core/src/parser/index.ts` -- barrel export
- `packages/skills-core/src/parser/__tests__/SkillMdParser.test.ts` -- unit tests (TC-002-1 .. TC-002-6 + edge cases)
- `packages/skills-core/src/parser/__tests__/fixtures/valid-skill.md` -- fixture: валидный SKILL.md с 1 tool
- `packages/skills-core/src/parser/__tests__/fixtures/missing-name.md` -- fixture: без поля name
- `packages/skills-core/src/parser/__tests__/fixtures/multi-tool.md` -- fixture: 2 tools
- `packages/skills-core/src/parser/__tests__/fixtures/invalid-schema.md` -- fixture: невалидный JSON Schema

### Files modified
- `packages/skills-core/src/index.ts` -- добавлены re-exports: SkillMdParser, SkillMdValidator, ParsedSkillMd

## Architectural Compliance

- TypeScript strict mode -- все файлы проходят `tsc --noEmit`
- Barrel exports через index.ts в каждой директории
- ESM module system (import from 'node:fs/promises')
- Без внешних YAML зависимостей (hand-rolled parser)
- SkillDefinition из types.ts используется без модификации
- ToolDefinitionWithHandler требует handler -- парсер создаёт placeholder handler
- vitest для тестирования
- Соблюдены все правила профиля AGENT_PROFILE_nodejs.md

## Deviations

- Placeholder handler в parsed skills: парсер создаёт SkillDefinition с handler, выбрасывающим "not implemented". Это необходимо, так как SkillDefinition.tools имеет тип ToolDefinitionWithHandler[]. Реальный handler устанавливается при регистрации в SkillRegistry.
- Тест whitespace: изменён -- убраны leading whitespace перед ключами frontmatter, так как это нестандартный YAML и может конфликтовать с indentation-based parsing для permissions.

## Known Limitations

- Frontmatter parser не поддерживает вложенные YAML структуры (массивы, объекты) -- только flat key:value и indented permission entries
- Строковые значения в frontmatter не поддерживают multiline (pipe, >)
- Frontmatter parser не поддерживает inline permissions (permissions: { tool: auto })
- Сканер ищет SKILL.md только в непосредственных поддиректориях (не рекурсивно)
- JSON Schema валидация минимальная -- проверяется только type, properties, required (без глубокого анализа схемы)

## Verification

- `pnpm --filter @osai/skills-core build` -- PASS (0 errors)
- `vitest run packages/skills-core/src` -- PASS (56/56 tests across 3 test files)
