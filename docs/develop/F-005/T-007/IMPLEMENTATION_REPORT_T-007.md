# Implementation Report -- T-007

## Task

T-007: Context Window Manager -- Auto-Pruning + Summarization
Feature: F-005 Memory System
Domain: DOMAIN-004

## Implemented Scope

Реализован Context Window Manager с приоритетной обрезкой контекста и триггером суммаризации.

**В scope:**
- `estimateTokens(text)` -- консервативная оценка токенов для UTF-8 текста
- `pruneByPriority(messages, maxTokens, reservedForResponse, minMessages)` -- обрезка по приоритету
- `ContextWindowManager` -- сборка контекста с обрезкой и суммаризацией
- `Summarizer` interface -- инжектируемая зависимость для суммаризации
- Unit тесты TC-001..TC-008

**Out scope (по roadmap):**
- LLM-based summarization (используется stub, реальная интеграция в T-008)

## Tests Implemented

Все 8 тестовых кейсов из roadmap:

| ID | Описание | Статус |
|----|----------|--------|
| TC-001 | buildContext() оставляет system prompt без изменений | PASS |
| TC-002 | buildContext() при превышении 80% threshold запускает summarization | PASS |
| TC-003 | pruneByPriority() сначала удаляет LT RAG results, потом KB chunks | PASS |
| TC-004 | pruneByPriority() оставляет последние N tool calls | PASS |
| TC-005 | reservedForResponse=1024 резервирует токены для ответа | PASS |
| TC-006 | buildContext() с историей < maxTokens не обрезает | PASS |
| TC-007 | estimateTokens() корректно оценивает количество токенов | PASS (5 sub-tests) |
| TC-008 | pruneByPriority() с minMessages=4 оставляет минимум 4 сообщения | PASS |

Всего: 12 тестов (11 именованных + 5 sub-tests в TC-007), все pass.

## Code Changes

### Files Added

- `packages/memory/src/context/token-counter.ts` -- estimateTokens() чистая функция
- `packages/memory/src/context/pruning.ts` -- pruneByPriority() приоритетная обрезка
- `packages/memory/src/context/context-window-manager.ts` -- ContextWindowManager класс
- `packages/memory/src/context/index.ts` -- barrel export модуля context
- `packages/memory/src/__tests__/context/context-window-manager.test.ts` -- unit тесты

### Files Modified

- `packages/memory/src/types/context.ts` -- добавлен интерфейс `Summarizer` и поле `context` в `PruningResult`
- `packages/memory/src/types/index.ts` -- добавлен export `Summarizer`
- `packages/memory/src/index.ts` -- добавлены exports для context модуля

## Architectural Compliance

- **Профиль:** backend-base (fallback для backend-typescript)
- **Разделение ответственности:** token counting (pure function), pruning (pure function), context assembly (class with DI)
- **Dependency Inversion:** Summarizer -- injectable interface, не привязан к конкретной реализации
- **Error handling:** graceful degradation при ошибке суммаризации (в buildContextAsync)
- **No implicit state:** все функции чистые, класс не имеет скрытого мутабельного состояния
- **TypeScript strict mode:** 0 type errors в файлах T-007

### Constraints Respected

- System prompt никогда не обрезается (PruningPriority.SystemPrompt = 5, защищён в pruning.ts)
- reservedForResponse резервирует токены для ответа
- minMessages гарантирует минимальное количество сообщений
- Summarization trigger при 80% пороге (конфигурируемо)

## Deviations

1. **PruningResult.context поле:** Добавлено поле `context: ContextEntry[]` в интерфейс `PruningResult`, которого не было в исходном типе. Это необходимо для того, чтобы `pruneByPriority` возвращал обрезанный контекст, а не только метаданные. Без этого поля `ContextWindowManager` не мог бы получить результат обрезки.

2. **buildContext() синхронный:** `buildContext()` не вызывает summarizer (т.к. summarize() -- async). Вместо этого:
   - `buildContext()` устанавливает флаг `summarizationTriggered` и сокращает историю
   - `buildContextAsync()` -- async версия, которая фактически вызывает summarizer

## Known Limitations

- Ошибки компиляции в `memory-manager.ts` (T-006) блокируют полную сборку package через `pnpm --filter @osai/memory build`. Файлы T-007 компилируются без ошибок независимо.
- `estimateTokens()` -- консервативная оценка, не tiktoken/BPE. Реальная оценка может отличаться на 10-30% в зависимости от модели.
