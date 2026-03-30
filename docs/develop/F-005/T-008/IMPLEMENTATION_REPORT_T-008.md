# Implementation Report -- T-008

## Implemented Scope

Интеграция Memory System: Fact Extraction + End-to-End Tests.

Реализованы:
- **FactExtractor** -- извлечение структурированных фактов из LLM-ответов через LLM provider. Graceful degradation при ошибках LLM (возвращает пустой массив).
- **MemoryService** -- единый facade для всех операций Memory System (init, query, store, forget, buildContext, extractFacts, destroy).
- **Unit тесты** FactExtractor (TC-001..TC-004, 16 тестов).
- **E2E тесты** полного RAG pipeline (TC-005..TC-008, 13 тестов).
- Обновлён barrel export `packages/memory/src/index.ts`.

## Tests Implemented

### Unit Tests (`packages/memory/src/__tests__/facts/fact-extractor.test.ts`)

| Test Case | Описание |
|-----------|----------|
| TC-001 | extract() вызывает LLM с prompt для извлечения фактов |
| TC-001 | Текст ответа передаётся в user message |
| TC-002 | Парсинг JSON array в MemoryEntry[] с корректными полями |
| TC-002 | Обработка JSON wrapped в markdown code blocks |
| TC-002 | Пустой JSON array -> пустой результат |
| TC-003 | chatId устанавливается на извлечённых записях |
| TC-003 | Категория по умолчанию "fact" |
| TC-003 | Теги по умолчанию пустой массив |
| TC-003 | LLM error -> пустой массив (graceful degradation) |
| TC-003 | Invalid JSON -> пустой массив |
| TC-003 | Empty string -> пустой массив |
| TC-003 | Malformed JSON (non-objects) -> пустой массив |
| TC-004 | Логирование не вызывает исключений |
| TC-004 | Успешное извлечение логируется |
| TC-004 | Ошибки логируются при graceful degradation |
| TC-004 | Уникальные ID для каждого извлечённого факта |

### E2E Tests (`packages/memory/src/__tests__/integration/memory-e2e.test.ts`)

| Test Case | Описание |
|-----------|----------|
| TC-005 | store -> embed -> vector upsert -> query -> results |
| TC-005 | Несколько записей, релевантные результаты при query |
| TC-006 | remember -> recall через RAG pipeline |
| TC-006 | Комбинация chat-scoped и long-term memories в recall |
| TC-007 | buildContext без обрезки при достаточном бюджете |
| TC-007 | buildContext с pruning при overflow |
| TC-007 | System prompt не обрезается даже при pruning |
| TC-008 | forget удаляет из SQLite + vector storage |
| TC-008 | forget несуществующей записи -> false |
| TC-008 | Query после forget не возвращает ghost results |
| Facade | Init -> store -> query -> buildContext -> extractFacts -> forget -> destroy |
| Facade | Operations before init throw "not initialized" |
| Facade | extractFacts без LLM provider -> пустой массив |

### Coverage Summary

- **10 test files**, **181 tests**, all passing
- T-008 specific: **29 new tests** (16 unit + 13 E2E)

## Code Changes

### Files Added

- `packages/memory/src/facts/fact-extractor.ts` -- FactExtractor class
- `packages/memory/src/facts/index.ts` -- facts barrel export
- `packages/memory/src/memory-service.ts` -- MemoryService facade
- `packages/memory/src/__tests__/facts/fact-extractor.test.ts` -- unit tests
- `packages/memory/src/__tests__/integration/memory-e2e.test.ts` -- E2E tests
- `docs/develop/F-005/T-008/IMPLEMENTATION_REPORT_T-008.md` -- this report

### Files Modified

- `packages/memory/src/index.ts` -- added FactExtractor and MemoryService exports
- `packages/memory/package.json` -- added `@osai/providers` dependency

## Architectural Compliance

- **DI pattern**: FactExtractor принимает LLMProvider через constructor; MemoryService принимает все зависимости через init()
- **Facade pattern**: MemoryService является единой точкой входа для всех memory-операций
- **Graceful degradation**: FactExtractor при ошибке LLM возвращает пустой массив; MemoryService.extractFacts возвращает пустой массив при отсутствии LLM provider
- **pino structured logging**: все операции логируются через LoggerFactory с action-полями
- **Barrel exports**: все новые модули экспортируются через index.ts
- **TypeScript strict mode**: компиляция без ошибок
- **Версионирование**: векторы детерминированы для тестов, in-memory SQLite для изоляции

## Deviations

- `MemoryService.createMinimalRepository()` использует dynamic import для `better-sqlite3` и создаёт in-memory SQLite при инициализации. Это необходимо потому, что MemoryManager требует MemoryRepository, но MemoryService facade создаёт свои внутренние компоненты. В production-использовании caller может предоставить собственный repository через расширенный API.

## Known Limitations

- FactExtractor не кэширует результаты LLM calls
- MemoryService.createMinimalRepository() создаёт новый in-memory DB при каждом init(), что означает что данные не сохраняются между сессиями без внешней конфигурации
- E2E тесты используют mock embedder с простой хеш-функцией (не реальный embedding model)
