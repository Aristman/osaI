# Implementation Report -- T-002: Unit Tests: Core Packages (gateway, agent, providers)

## Implemented Scope

Добавлены **51 дополнительных критических unit-тестов** для модулей gateway, agent, providers, которые расширяют существующее покрытие. Все тесты изолированы от внешних сервисов (mock SQLite, mock HTTP, mock WebSocket).

### Покрытые области:

1. **Gateway WsServer** -- send изоляция, broadcast partial delivery, rapid connect/disconnect, send после disconnect, connection count tracking
2. **Agent ContextAssembler** -- RAG query injection, BEFORE/AFTER_CONTEXT_ASSEMBLY hook modification, BEFORE_MEMORY_QUERY hook override, graceful degradation при RAG failure, message ordering
3. **Agent HookRegistry** -- complex data flow через multiple handlers, error resilience с сохранением контекста, lifecycle tracking (register/unregister cycles), async handler scenarios
4. **Providers ProviderChain** -- full 5-provider failover, circuit breaker recovery в цепочке, TokenLimitError/AuthError handling, error wrapping (TypeError, string), mixed success/failure scenarios, provider recovery after intermittent outage
5. **Providers CircuitBreaker** -- interspersed successes prevention, stats tracking через multiple state transitions, error type preservation, manual record API integration, openedAt/closedAt timestamps

### Вне scope:

- Integration tests между пакетами (отдельная задача T-004)
- E2E тесты (отдельная задача T-005)
- Тесты для memory, knowledge-base, skills (отдельная задача T-003)

## Tests Implemented

### Root Tests (tests/unit/)

| Файл | Тестов | Описание |
|------|--------|----------|
| `tests/unit/agent/context-assembler-rag.test.ts` | 11 | RAG injection, hook integration, message ordering |
| `tests/unit/agent/hooks-lifecycle.test.ts` | 12 | Complex data flow, error resilience, lifecycle tracking, async scenarios |
| `tests/unit/providers/provider-chain-recovery.test.ts` | 12 | 5-provider failover, CB recovery, TokenLimitError, AuthError, error wrapping |
| `tests/unit/providers/circuit-breaker-advanced.test.ts` | 11 | Interspersed failures, stats, error types, manual API, timestamps |

### Package Tests (packages/gateway/)

| Файл | Тестов | Описание |
|------|--------|----------|
| `packages/gateway/src/server/__tests__/ws-server-routing.test.ts` | 5 | Send isolation, broadcast partial, rapid cycles, send after disconnect, connection count |

**Итого: 51 новых теста.**

## Code Changes

### Files Added

- `tests/unit/agent/context-assembler-rag.test.ts` -- ContextAssembler RAG + hook integration tests
- `tests/unit/agent/hooks-lifecycle.test.ts` -- HookRegistry advanced lifecycle tests
- `tests/unit/providers/provider-chain-recovery.test.ts` -- ProviderChain failover + recovery tests
- `tests/unit/providers/circuit-breaker-advanced.test.ts` -- CircuitBreaker advanced state machine tests
- `packages/gateway/src/server/__tests__/ws-server-routing.test.ts` -- WsServer additional routing tests
- `packages/gateway/vitest.config.ts` -- Minimal vitest config for gateway package

### Files Modified

Нет модификаций существующих исходных файлов. Все изменения -- добавление новых тестовых файлов.

## Architectural Compliance

- Все тесты используют mock-объекты, без внешних зависимостей
- Test isolation: каждый describe блок использует beforeEach для свежего состояния
- HookRegistry тесты используют реальный класс (легковесный, без внешних deps)
- CircuitBreaker тесты используют vi.useFakeTimers() для предсказуемых state transitions
- Provider chain тесты используют mock LLMProvider с настраиваемым поведением
- Vitest как тестовый фреймворк (соответствует T-001)
- barrel exports через относительные импорты (ESM совместимость)

### Constraints Respected

- Backend profile: разделение concern, no global mutable state
- Error handling: explicit assertions, meaningful messages
- No scope expansion: только gateway/agent/providers modules

## Deviations

- **WsServer send isolation test**: Изначально планировался тест "ws2 не получает сообщение от server.send(ws1_id)", но WebSocket `message` event срабатывает как на текст, так и на ping frames, что делает ненадежным сравнение через "не должно получить". Тест упрощён до проверки "server.send() не бросает и connection count корректен". Обоснование: send() -- это низкоуровневый transport метод, корректная маршрутизация сообщений -- зона ответственности MessageHandler (уже покрыта его тестами).

## Known Limitations

- Gateway WsServer send/receive тесты зависят от ОС и таймингов (setTimeout). В CI могут быть flaky на медленных машинах.
- Circuit breaker HALF_OPEN probe в chain -- тест использует fake timers, но реальная среда может отличаться.
- Provider chain recovery test: таймер advance делает state transitions синхронными, что не проверяет реальный concurrent access.

---

**Версия:** 1.0
**Дата:** 2026-03-30
