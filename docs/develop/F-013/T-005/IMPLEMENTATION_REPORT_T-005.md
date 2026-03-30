# Implementation Report -- T-005: E2E Tests -- Critical User Scenarios

**Feature:** F-013 Cross-Platform + Testing
**Task:** T-005
**Date:** 2026-03-30
**Iteration:** 1

---

## Implemented Scope

Реализованы E2E тесты критичных пользовательских сценариев с реальными процессами (in-memory SQLite, ProviderChain, AgentLoop, Mock LLM HTTP server). Все тесты запускаются через vitest и покрывают сценарии из roadmap T-005.

**В scope:**
- E2E test environment setup (setup.ts)
- Mock LLM server (OpenAI-compatible HTTP)
- Basic chat flow (send message, receive response, persist to SQLite)
- Chat switch with context isolation
- Memory persistence across chats
- Provider failover with circuit breaker

**Out scope:**
- file-operation.test.ts (roadmap checklist item, но файловая операция с permission prompt требует complete tool execution pipeline, который еще не реализован на уровне E2E)
- Тестирование с реальными LLM API
- Telegram E2E

---

## Tests Implemented

### tests/e2e/chat-basic.test.ts (6 tests)
- `sends a user message and receives an LLM response via the agent loop` -- полная цепочка: ChatService -> AgentLoop -> mock LLM -> response
- `persists the assistant response in SQLite after agent processing` -- верификация сохранения в SQLite
- `includes token usage in the response` -- проверка token usage statistics
- `handles multiple sequential messages in the same chat` -- несколько обменов в одном чате с изолированным fixture
- `creates a chat with metadata and retrieves it` -- ChatService CRUD с metadata
- `generates trace ID automatically when not provided` -- автоматическая генерация trace ID

### tests/e2e/chat-switch.test.ts (6 tests)
- `maintains separate message histories for two different chats` -- изоляция сообщений между чатами
- `agent loop receives only the correct chat context when switching` -- верификация контекста при переключении (provider.completeCalls анализ)
- `updating one chat does not affect another chat` -- независимость обновлений
- `archiving one chat does not affect messages in another chat` -- архивация не влияет на другой чат
- `deleting one chat does not affect another chat` -- удаление не влияет на другой чат
- `listing chats returns all chats regardless of content` -- листинг всех чатов

### tests/e2e/memory-persistence.test.ts (5 tests)
- `extracts and stores facts from conversation in long-term memory` -- хранение фактов в memory_entries
- `recalls facts from long-term memory in a new chat via RAG` -- RAG query инжекция в новый чат
- `facts are accessible across multiple new chats` -- кросс-чат доступ к long-term memory
- `fact extraction categories are correctly persisted` -- категории (fact, preference, knowledge, pattern)
- `conversation history persists across agent loop calls within the same chat` -- история внутри чата

### tests/e2e/provider-failover.test.ts (8 tests)
- `fails over from primary to fallback when primary is unavailable` -- ProviderChain failover
- `opens circuit breaker after repeated failures and skips the provider` -- CircuitBreaker state transitions
- `tries providers in priority order (first available wins)` -- приоритетный порядок
- `throws error when all providers are unavailable` -- ошибка при недоступности всех
- `mock LLM server can be toggled between success and failure modes` -- toggle success/fail
- `mock LLM server records requests for test assertions` -- recorded requests
- `mock LLM server supports streaming responses` -- SSE streaming
- `provider chain getStatus returns correct provider information` -- status reporting

**Итого: 25 E2E тестов, все проходят.**

---

## Code Changes

### Files added
- `tests/e2e/setup.ts` -- E2E test environment factory (createE2eEnvironment, registerE2eEnvironment, cleanupAllE2eEnvironments)
- `tests/e2e/mock-llm-server.ts` -- OpenAI-compatible HTTP mock server (startMockLlmServer) с поддержкой streaming, failure mode, request recording
- `tests/e2e/chat-basic.test.ts` -- 6 E2E тестов базового чата
- `tests/e2e/chat-switch.test.ts` -- 6 E2E тестов переключения чатов
- `tests/e2e/memory-persistence.test.ts` -- 5 E2E тестов персистенции памяти
- `tests/e2e/provider-failover.test.ts` -- 8 E2E тестов failover цепочки провайдеров
- `docs/develop/F-013/T-005/IMPLEMENTATION_REPORT_T-005.md` -- данный отчёт

### Files modified
Ни один существующий файл не был изменён.

---

## Architectural Compliance

- **Modular monolith:** E2E тесты используют реальные компоненты из разных packages (gateway, agent, providers, shared) через динамические импорты
- **In-memory SQLite:** DatabaseManager с `:memory:` для изоляции тестов
- **Mock LLM server:** Случайный порт через `server.listen(0)`, OpenAI-compatible API (`/v1/chat/completions`, `/v1/models`)
- **ESM:** Все файлы используют ESM imports с `.js` расширениями
- **Vitest:** Тесты интегрированы в существующий vitest workspace (root project)
- **No ws dependency at root level:** WsServer не используется напрямую в E2E тестах -- `ws` доступен только в gateway package. WebSocket-уровневые тесты покрываются в integration suite

---

## Deviations

1. **WsServer не включён в E2E setup:** Пакет `ws` установлен только как dependency в `packages/gateway`, что делает его недоступным для root-level тестов через pnpm. E2E тесты фокусируются на AgentLoop + ChatService + ProviderChain + Mock LLM. WebSocket-тестирование покрывается в integration suite (T-004). Это отклонение от roadmap checklist пункта "запуск Gateway", но не снижает покрытие критичных сценариев.

2. **file-operation.test.ts не реализован:** Roadmap включает этот тест, но он требует полного tool execution pipeline с permission flow на уровне E2E. Текущая реализация AgentLoop поддерживает только single inference call без tool loop. Этот тест будет добавлен при завершении T-005 из agent domain.

3. **Вместо CLI через child_process:** Тесты напрямую используют ChatService + AgentLoop API, что эквивалентно CLI-потоку но надежнее и быстрее в тестовой среде.

---

## Known Limitations

- E2E тесты не проверяют WebSocket transport (покрыто в integration suite)
- Memory persistence тесты используют прямые SQL-операции для симуляции fact extraction (фактический FactExtractor требует RAG pipeline)
- Mock LLM server не эмулирует streaming delay (content отправляется мгновенно)
- Все E2E тесты запускаются в root vitest project (не в отдельном e2e workspace project)
