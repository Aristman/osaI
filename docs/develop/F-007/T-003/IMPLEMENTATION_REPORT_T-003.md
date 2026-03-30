# Implementation Report -- T-003: Permission Model

## Implemented Scope

Реализован category-based permission model для Skills System (DOMAIN-003).

Компоненты:
- **PermissionDecision** -- тип результата проверки разрешений (toolName, category, decision, riskLevel, reason)
- **PermissionChecker** -- класс с методом `check(toolName, policy)`, реализующий category-based логику
- **ToolCategory** -- тип категории операции (read, write, exec, system)
- **CATEGORY_DEFAULTS** -- константа с маппингом category -> default decision/riskLevel
- **RiskLevel** -- тип уровня риска (low, medium, high)

Category-based логика:
- read -> auto (riskLevel: low)
- write -> confirm (riskLevel: medium)
- exec -> confirm (riskLevel: high)
- system -> auto (riskLevel: low)

Custom overrides: если в policy указан конкретный tool name, он переопределяет category default.

Изменение в области scope: добавлено значение `'deny'` в тип `PermissionLevel` (было `'auto' | 'confirm'`, стало `'auto' | 'confirm' | 'deny'`), т.к. roadmap и задача явно указывают deny как валидное значение для PermissionLevel.

## Tests Implemented

Файл: `packages/skills-core/src/permissions/__tests__/PermissionChecker.test.ts`

| Test ID | Description | Status |
|---------|-------------|--------|
| TC-003-1 | read category = auto (4 subtests: read_, list_, get_, search_) | PASS |
| TC-003-2 | write category = confirm (4 subtests: write_, create_, delete_, move_) | PASS |
| TC-003-3 | exec category = confirm (2 subtests: exec, shell_) | PASS |
| TC-003-4 | system category = auto (1 subtest: system_) | PASS |
| TC-003-5 | PermissionDecision содержит risk_level (4 subtests: low/medium/high/low) | PASS |
| Custom policy overrides | 5 доп. тестов на override-логику | PASS |

Всего: 20 тестов, все проходят.

## Code Changes

### Files Added
- `packages/skills-core/src/permissions/types.ts` -- PermissionDecision, RiskLevel, DecisionType, ToolCategory, CATEGORY_DEFAULTS
- `packages/skills-core/src/permissions/PermissionChecker.ts` -- PermissionChecker class
- `packages/skills-core/src/permissions/index.ts` -- barrel export
- `packages/skills-core/src/permissions/__tests__/PermissionChecker.test.ts` -- 20 unit tests

### Files Modified
- `packages/skills-core/src/types.ts` -- PermissionLevel: добавлено `'deny'` (было `'auto' | 'confirm'`, стало `'auto' | 'confirm' | 'deny'`)
- `packages/skills-core/src/index.ts` -- добавлены экспорты PermissionChecker, CATEGORY_DEFAULTS и типов из permissions модуля

## Architectural Compliance

- Соблюдается layered architecture: permissions module -- отдельный модуль в `src/permissions/`
- Barrel exports через `index.ts`
- TypeScript strict mode: все файлы проходят tsc --strict
- Импорты используют `.js` extension (ESM, Node16 moduleResolution)
- Зависимости только от `types.ts` в том же пакете
- Нет циклических зависимостей
- Константа CATEGORY_DEFAULTS использует `as const` и `Readonly`
- Профиль `AGENT_PROFILE_nodejs.md`: TypeScript strict, barrel exports, vitest для тестов
- Профиль `AGENT_PROFILE_backend-base.md`: разделение ответственности, явные типы, no hidden state

## Deviations

1. **PermissionLevel расширён**: добавлено `'deny'` к существующему типу `'auto' | 'confirm'`. Обоснование: roadmap (T-003) и задача явно требуют `decision: 'auto' | 'confirm' | 'deny'` в PermissionDecision. Без `'deny'` в PermissionLevel невозможно реализовать deny-override через PermissionPolicy.

2. **Tool category resolution по naming convention**: вместо явного указания категории для каждого tool, реализована эвристика на основе префикса имени (read_*, write_*, exec*, shell_*, system_*). Обоснование: соответствует архитектуре SKILL.md, где tool name определяется декларативно, а категория выводится из семантики имени. Это elimineрует необходимость дублировать category в PermissionPolicy.

## Known Limitations

- Category resolution по naming convention может быть неточной для инструментов с нестандартными именами (не соответствующим префиксам). В таком случае используется fallback category = 'read'.
- `PermissionChecker.check()` -- синхронный метод. Если в будущем потребуется async валидация (например, запрос к audit log), потребуется рефакторинг.
