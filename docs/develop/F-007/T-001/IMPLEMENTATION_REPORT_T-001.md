# Implementation Report -- T-001: Skill Registry Core + Package Setup

## Implemented Scope

Реализован базовый реестр навыков (SkillRegistry) для DOMAIN-003 Skills System. Пакет `@osai/skills-core` сконфигурирован с зависимостями и barrel export.

**В scope:**
- TypeScript interfaces: SkillDefinition, ToolDefinition, ToolDefinitionWithHandler, ToolResult, PermissionLevel, PermissionPolicy, SkillCategory, ToolParameters, ToolHandler
- SkillRegistry class: register, unregister, getTools, getTool, execute, enable, disable, isEnabled, getSkill, listSkills
- Barrel export из `src/index.ts`
- Unit tests (TC-001-1..TC-001-7 + дополнительные)

**Out scope (как указано в roadmap):**
- SKILL.md parsing (T-002)
- Permission enforcement (T-003)
- Конкретные skills (Filesystem, Shell)

## Tests Implemented

| ID | Description | Status |
|----|-------------|--------|
| TC-001-1 | register() добавляет skill, getTools() возвращает tools | PASS |
| TC-001-2 | register() дубликат выбрасывает ошибку | PASS |
| TC-001-3 | getTools() агрегирует все tools из нескольких skills | PASS |
| TC-001-4 | execute() dispatch на handler с правильными params | PASS |
| TC-001-5 | execute() несуществующий tool выбрасывает ошибку | PASS |
| TC-001-6 | enable/disable переключает доступность skill | PASS |
| TC-001-7 | unregister() удаляет skill | PASS |

**Дополнительные тесты:**
- getTool(name) -- поиск конкретного tool
- getSkill(name) -- поиск конкретного skill
- listSkills() -- список всех зарегистрированных skills
- execute() error handling -- обработка ошибок handler с возвратом `{ success: false }`
- Duplicate tool names -- агрегация и execute первого совпадения

**Итого:** 19 тестов, все PASS.

## Code Changes

### Files Added
- `packages/skills-core/src/types.ts` -- типы SkillDefinition, ToolDefinition, ToolResult, PermissionLevel, PermissionPolicy, SkillCategory
- `packages/skills-core/src/registry/SkillRegistry.ts` -- реализация SkillRegistry
- `packages/skills-core/src/registry/index.ts` -- barrel export для registry
- `packages/skills-core/src/registry/__tests__/SkillRegistry.test.ts` -- unit tests
- `docs/develop/F-007/T-001/IMPLEMENTATION_REPORT_T-001.md` -- данный отчёт

### Files Modified
- `packages/skills-core/package.json` -- добавлены зависимости: pino, @osai/shared, @osai/observability
- `packages/skills-core/src/index.ts` -- обновлён barrel export (types + SkillRegistry)

## Architectural Compliance

- **Профиль:** AGENT_PROFILE_nodejs.md + AGENT_PROFILE_backend-base.md
- **TypeScript strict mode:** все файлы проходят `tsc --strict` (через tsconfig.base.json)
- **ESM only:** `"type": "module"`, все импорты с `.js` extension
- **Barrel exports:** `index.ts` в каждом модуле
- **pino logging:** структурированное логирование в SkillRegistry (опциональный inject, no-op default)
- **noUnusedLocals / noUnusedParameters:** соблюдено
- **verbatimModuleSyntax:** соблюдено
- **vitest:** globals: true, test file в `__tests__/` директории

### Конвенции проекта
- `package.json` формат соответствует `@osai/memory` и `@osai/providers`
- `tsconfig.json` расширяет `../../tsconfig.base.json`
- Тесты используют `vitest` с `describe/it/expect/beforeEach`

## Deviations

**Deviation 1: Logger injection вместо прямого импорта pino**

Проблема: при `verbatimModuleSyntax` и ESM, динамический `require('pino')` недоступен, а статический `import pino from 'pino'` создаёт жёсткую зависимость даже когда logger не нужен (тесты).

Решение: SkillRegistry принимает опциональный `MinimalLogger` интерфейс через конструктор. По умолчанию используется no-op logger. В production инжектируется реальный pino logger.

Обоснование: уменьшает связность, упрощает тестирование, не нарушает dependency declaration в package.json.

## Known Limitations

1. **Handler не вынесен в ToolDefinition (public API):** `ToolDefinition` для LLM function calling не содержит `handler`. `ToolDefinitionWithHandler` используется только внутри SkillRegistry. Это намеренное разделение -- LLM не должен видеть handler.

2. **Duplicate tool names:** при дублирующихся именах tools из разных skills, `getTools()` возвращает оба, а `execute()` вызывает первый найденный. Поведение documentировано в тестах. В T-003 (Permission Model) может быть добавлена валидация уникальности.

3. **No-op default logger:** в production необходимо инжектировать реальный pino logger для audit logging. Без него действия не логируются.
