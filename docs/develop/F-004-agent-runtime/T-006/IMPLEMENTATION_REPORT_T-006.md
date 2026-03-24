# Implementation Report -- T-006: Agent Loop Core

## Implemented Scope

Реализован основной agent loop класса `AgentRuntime` -- координатор всех компонентов Agent Runtime.

**Реализованные методы:**
- `processMessage(message, sessionId)` -- основной entry point: hook -> context assembly -> model inference -> tool execution loop -> persistence -> hook -> response
- `registerHook(hookPoint, handler, priority)` -- shortcut для HookManager
- `unregisterHook(hookPoint, handlerId)` -- shortcut для HookManager
- `loadSkills(skillsConfig)` -- placeholder для будущей интеграции с SkillLoader
- `getToolSchemas()` -- делегирует в SkillRegistry
- `executeTool(toolName, params, sessionId)` -- публичный entry point для tool execution
- `getSessionHistory(sessionId)` -- загружает историю из SessionRepository
- `getConfig()` / `getActiveModel()` -- accessors

**Внутренние методы (private):**
- `runAgentLoop(sessionId, userMessage)` -- полный agent loop с tool execution loop (max 10 итераций)
- `executeToolCall(toolCall, sessionId)` -- выполнение одного tool call с before/after hooks
- `modelInference(messages, sessionId, modelOptions?)` -- model inference через ModelResolver с failover и before_model_resolve hook
- `createModelResolver()` -- factory для ModelResolver из AgentConfig
- `generateId()` -- генерация уникальных ID

**Интегрированные hook points:**
1. `before_agent_start` -- перед обработкой сообщения
2. `before_prompt_build` -- внутри ContextAssembler.assemble()
3. `before_model_resolve` -- перед model inference
4. `before_tool_call` -- перед выполнением tool
5. `after_tool_call` -- после выполнения tool (включая error case)
6. `agent_end` -- после завершения loop
7. `on_error` -- через ErrorHandler

**Явно не в scope:**
- Streaming (T-010)
- Real LLM calls (mocked в тестах)
- Integration tests (T-011)

## Tests Implemented

| # | Тест | Описание |
|---|------|----------|
| 1 | Process message returns valid response | T006-01: базовый flow, валидная AgentResponse |
| 2 | before_agent_start hook called | T006-02: hook вызывается при обработке |
| 3 | before_prompt_build hook called | T006-03: hook вызывается через ContextAssembler |
| 4 | Tool execution loop | T006-04: model -> tool_call -> tool executed -> result -> model -> stop |
| 5 | Multi-turn tool execution | T006-05: 2 tool calls за 1 итерацию |
| 6 | agent_end hook called | T006-06: hook вызывается после завершения |
| 7 | Session persistence | T006-07: user + assistant messages сохраняются |
| 8 | Model failover | T006-08: completeWithFailover вызывается через ModelResolver |
| 9 | Error handling in tool execution | T006-09: tool error не крашит loop |
| 10 | Empty message handled gracefully | T006-10: пустое сообщение обрабатывается без model call |
| 11 | Whitespace-only message handled | Дополнение к T006-10 |
| 12 | before_agent_start abort | Hook abort возвращает пустой response |
| 13 | before_tool_call + after_tool_call hooks | Оба hook вызываются корректно |
| 14 | Tool not found | Несуществующий tool возвращает error result |
| 15 | registerHook / unregisterHook shortcuts | Delegation в HookManager |
| 16 | getToolSchemas | Delegation в SkillRegistry |
| 17 | getConfig | Возвращает конфиг |
| 18 | getActiveModel | Возвращает ModelInfo |
| 19 | executeTool (public) | Публичный entry point |
| 20 | getSessionHistory without repo | Пустой массив без репозитория |

**Итого: 20 тестов, все проходят.**

## Code Changes

### Файлы добавлены
- `packages/agent/src/AgentRuntime.ts` -- основной класс AgentRuntime + интерфейс AgentRuntimeDeps
- `packages/agent/src/__tests__/agent-runtime.test.ts` -- 20 unit тестов

### Файлы изменены
- `packages/agent/src/index.ts` -- добавлен реэкспорт AgentRuntime и AgentRuntimeDeps

## Architectural Compliance

- **Dependency Injection:** Все зависимости инжектируются через `AgentRuntimeDeps`, defaults создаются в конструкторе
- **Hook System:** 7 core hook points интегрированы в loop
- **Model Resolver:** Используется `completeWithFailover` для failover chain
- **Skill Registry:** Tool executors получаются через `getToolExecutor` с namespaced names
- **Context Assembly:** Delegated в ContextAssembler с pruning через SessionPruner
- **Session Persistence:** Сохранение через SessionRepository (опционально)
- **Error Handling:** ErrorHandler + try/catch в loop, tool errors не крашат loop
- **TypeScript strict:** Все типы строгие, no `any`, `noEmit` passes с 0 errors

## Deviations

Нет отклонений от roadmap T-006.

## Known Limitations

- `loadSkills()` -- placeholder (no-op), требует интеграции с SkillLoader (T-004 scope)
- `createModelResolver()` factory использует hardcoded circuit breaker threshold (3), не конфигурируемый через AgentConfig
- Нет streaming support (T-010 scope)
- Tool execution не имеет timeout enforcement (V1 roadmap)
- Session concurrency не поддерживается (single-threaded access assumed, V1 roadmap)
