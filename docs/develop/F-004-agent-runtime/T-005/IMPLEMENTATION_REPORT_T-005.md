# Implementation Report -- F-004 T-005: Context Assembly

## Implemented Scope

Реализован модуль Context Assembly для Agent Runtime:
- `ContextAssembler` -- основной класс сборки LLM контекста
- `SystemPromptLoader` -- загрузчик компонентов system prompt (AGENTS.md, SOUL.md)
- Barrel export и реэкспорт из основного `packages/agent/src/index.ts`

Все функции находятся строго в scope задачи T-005 из ROADMAP_TASKS_F-004.md.

## Tests Implemented

Файл: `packages/agent/src/__tests__/context.test.ts`

**SystemPromptLoader (5 тестов):**
1. Возвращает дефолтный AGENTS.md при отсутствии установки
2. Возвращает пустую строку для SOUL.md по умолчанию
3. Возвращает установленный AGENTS.md
4. Возвращает установленный SOUL.md
5. Загружает контент из файла

**ContextAssembler (18 тестов):**
1. T005-01: Возвращает строку system prompt
2. T005-02: Включает SOUL.md контент в system prompt
3. T005-03: Загружает tool schemas из SkillRegistry
4. T005-04: Конвертирует AgentMessage[] в ModelMessage[]
5. T005-04b: Сохраняет toolCallId и toolCalls из metadata
6. T005-05: Оценивает totalTokens > 0 для непустого контекста
7. T005-06: Возвращает минимальный контекст для пустой сессии
8. T005-07: Проверяет порядок: AGENTS.md перед SOUL.md
9. T005-08: AssembledContext содержит все обязательные поля
10. T005-09: before_prompt_build hook вызывается
11. T005-10: Hook abort бросает ошибку
12. T005-11: Точность оценки токенов (~4 символа = 1 токен)
13. Пустая строка дает 0 токенов
14. Фильтрация пустых компонентов из system prompt
15. Сборка без HookManager не бросает ошибку
16. Агрегация tool schemas из нескольких skills
17. Hook context data содержит systemPrompt, toolSchemas, history
18. Null return от hook вызывает abort

**Итого: 23 теста, все проходят.**

## Code Changes

### Files Added
- `packages/agent/src/context/ContextAssembler.ts` -- основной класс (169 строк)
- `packages/agent/src/context/SystemPromptLoader.ts` -- загрузчик system prompt (78 строк)
- `packages/agent/src/context/index.ts` -- barrel export
- `packages/agent/src/__tests__/context.test.ts` -- 23 теста

### Files Modified
- `packages/agent/src/index.ts` -- добавлен реэкспорт `ContextAssembler` и `SystemPromptLoader` из `./context/index.js`

## Architectural Compliance

- TypeScript strict mode: соблюдён
- Barrel exports через index.ts: реализовано
- Импорты через `.js` расширения (ESM NodeNext): соблюдено
- Dependency injection через constructor: реализовано
- Hook system integration (before_prompt_build): реализовано
- Порядок контекста (system -> soul -> tools -> history): соблюдён
- Оценка токенов (~4 chars/token): реализована
- Профиль `nodejs` (ts-backend): соблюдён (TypeScript, vitest, barrel exports, DI)

## Deviations

1. **Параметр `config` убран из конструктора** -- `AgentConfig` пока не используется в ContextAssembler (maxTokens понадобится в T-008 Session Pruning). Параметр может быть добавлен обратно при интеграции с pruning без breaking changes (добавляется как optional параметр).

2. **SystemPromptLoader как отдельный класс** -- в задаче предполагалось, что `loadAgentsMd()` и `loadSoulMd()` будут методами ContextAssembler. Реализация выделила их в отдельный `SystemPromptLoader`, доступный через `assembler.systemPromptLoader`. Это улучшает тестируемость и разделение ответственности.

## Known Limitations

- Token estimation использует грубую эвристику (4 chars/token). Для продакшена потребуется tiktoken или аналогичная библиотека (планируется в V1).
- Файловая загрузка AGENTS.md/SOUL.md реализована в SystemPromptLoader но пока не интегрирована в рабочий flow (ожидается интеграция при сборке AgentRuntime в T-006).
- Hook context в `data.history` содержит `ModelMessage[]`, а не `AgentMessage[]` -- это соответствует передаваемым данным для model inference.
