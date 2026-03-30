# Implementation Report -- T-002 Context Assembly

## Implemented Scope

Реализован модуль сборки контекста для LLM запроса (ContextAssembler). Модуль отвечает за формирование финального messages array, включающего system prompt, историю чата, RAG результаты и текущее сообщение пользователя.

**In scope:**
- ContextAssembler: конвейер сборки контекста с 7 шагами
- Интеграция с HookRegistry (BEFORE_CONTEXT_ASSEMBLY, BEFORE_MEMORY_QUERY, AFTER_CONTEXT_ASSEMBLY)
- Injectable RAG query function через constructor DI
- Graceful degradation при ошибках RAG
- Типы: ContextAssemblyInput, ContextAssemblyResult, RAGQueryFn, RAGResult

**Out scope:** LLM вызов (T-003), tool results append (T-005)

## Tests Implemented

| ID | Description | Status |
|----|-------------|--------|
| TC-002-1 | Формирует messages array из chat history | Passed |
| TC-002-1 | Сохраняет порядок истории | Passed |
| TC-002-2 | Вызывает before_memory_query hook при наличии RAG | Passed |
| TC-002-2 | НЕ вызывает before_memory_query при отсутствии RAG | Passed |
| TC-002-3 | Инжектирует RAG results в system prompt (## Relevant Memory) | Passed |
| TC-002-3 | Не добавляет секцию при пустых RAG results | Passed |
| TC-002-4 | Вызывает after_context_assembly hook | Passed |
| TC-002-4 | Позволяет хуку модифицировать system prompt | Passed |
| TC-002-4 | Передаёт ragResultCount в контекст хука | Passed |
| TC-002-5 | Работает без RAG (без секции Relevant Memory) | Passed |
| TC-002-5 | Graceful degradation при ошибке RAG | Passed |
| TC-002-5 | Включает историю чата без RAG | Passed |
| TC-002-6 | Пустая история -> только system + user | Passed |
| Additional | BEFORE_CONTEXT_ASSEMBLY вызывается первым | Passed |
| Additional | BEFORE_CONTEXT_ASSEMBLY может модифицировать system prompt | Passed |
| Additional | Корреляционные ID передаются во все хуки | Passed |

**Итого: 16 тестов, все пройдены.**

## Code Changes

### Files Added
- `packages/agent/src/context/types.ts` -- типы ContextAssemblyInput, ContextAssemblyResult, RAGQueryFn, RAGResult
- `packages/agent/src/context/ContextAssembler.ts` -- основная реализация конвейера сборки контекста
- `packages/agent/src/context/index.ts` -- barrel export модуля
- `packages/agent/src/context/__tests__/ContextAssembler.test.ts` -- unit tests (16 тестов)

### Files Modified
- `packages/agent/src/index.ts` -- добавлены экспорты ContextAssembler и связанных типов

## Architectural Compliance

- **DI через constructor:** HookRegistry и опциональный RAG query function инжектируются через конструктор
- **Hook system:** используется execute() из HookRegistry (async, sequential), хуки вызываются в правильном порядке
- **Types:** ChatMessage импортируется из @osai/providers (единый формат сообщений)
- **Barrel exports:** каждый модуль имеет index.ts
- **ESM:** все импорты используют .js extension
- **TypeScript strict:** файлы проходят tsc --strict
- **No circular dependencies:** context модуль зависит только от hooks и @osai/providers
- **Graceful degradation:** ошибки RAG не прерывают сборку контекста

## Deviations

- Название хука `before_prompt_build` из roadmap не существует в текущей реализации HookPoint enum (T-001). Вместо него используются `BEFORE_CONTEXT_ASSEMBLY` и `AFTER_CONTEXT_ASSEMBLY`, которые покрывают тот же функционал (модификация system prompt перед и после RAG injection).
- Hook `before_memory_query` в roadmap соответствует `BEFORE_MEMORY_QUERY` в enum -- совпадает.
- Реализация позволяет хукам модифицировать query string для RAG через `data.query` в контексте BEFORE_MEMORY_QUERY hook -- дополнительная гибкость.

## Known Limitations

- RAG query function не имеет кэширования -- каждый вызов assemble() выполняет новый RAG запрос.
- Context window pruning (обрезка контекста) не реализована -- это отдельная задача Memory System (F-005).
- Формат ## Relevant Memory section фиксирован -- кастомизация возможна только через AFTER_CONTEXT_ASSEMBLY hook.
