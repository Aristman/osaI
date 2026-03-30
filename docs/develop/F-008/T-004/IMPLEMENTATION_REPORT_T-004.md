# Implementation Report -- T-004 Agent Loop Core

## Implemented Scope

Реализован основной цикл агента (AgentLoop) для T-004 задачи F-008 Agent Runtime.

**Реализовано:**
- `AgentLoopConfig` -- конфигурация цикла: systemPrompt, defaultModel, defaultTemperature, defaultMaxTokens, tools, ragQuery
- `AgentLoopInput` -- входные данные: userMessage, messages, sessionId, chatId, traceId (optional, генерируется автоматически)
- `AgentLoopOutput` -- результат: content, toolCalls, hasToolCalls, usage, model, provider, finishReason, traceId, isError, errorMessage, ragResultCount
- `AgentLoop` -- класс с DI (ContextAssembler, InferenceService, HookRegistry), метод `async run(input): Promise<AgentLoopOutput>`
- Pipeline: BEFORE_INTAKE hook -> context.assemble() -> inference.infer() -> return response
- Error handling: при ошибке любого этапа -> console.error + return error response (graceful degradation)
- Barrel export в `loop/index.ts`
- Обновлён barrel export в `packages/agent/src/index.ts`

**НЕ в scope (по roadmap):**
- Tool execution loop (T-005) -- AgentLoop выполняет только один inference call
- Streaming to client (T-006)
- Persistence (T-006)

## Tests Implemented

Тестовый файл: `packages/agent/src/loop/__tests__/AgentLoop.test.ts`

| ID | Описание | Статус |
|----|----------|--------|
| TC-004-1 | run() выполняет полный pipeline | PASS |
| TC-004-1 | context.assemble() и inference.infer() вызываются в порядке | PASS |
| TC-004-1 | Параметры корректно передаются в assemble() | PASS |
| TC-004-1 | Собранные сообщения передаются в infer() | PASS |
| TC-004-1 | Config defaults передаются в infer() | PASS |
| TC-004-1 | ragResultCount возвращается из assembly | PASS |
| TC-004-1 | hasToolCalls и toolCalls при tool_use response | PASS |
| TC-004-1 | traceId генерируется автоматически | PASS |
| TC-004-2 | BEFORE_INTAKE hook вызывается в начале | PASS |
| TC-004-2 | Корректные данные в hook context | PASS |
| TC-004-2 | BEFORE_INTAKE вызывается перед assemble() | PASS |
| TC-004-4 | Error response при ошибке inference | PASS |
| TC-004-4 | Error response при ошибке context assembly | PASS |
| TC-004-4 | Non-Error thrown values обрабатываются | PASS |
| TC-004-4 | BEFORE_INTAKE вызывается даже при ошибке | PASS |
| TC-004-4 | traceId в error response | PASS |
| TC-004-4 | traceId генерируется в error response | PASS |
| TC-004-5/6 | Zero usage при ошибке assembly | PASS |
| TC-004-5/6 | Correct model/provider из config при ошибке | PASS |
| TC-004-5/6 | model=unknown при отсутствии defaultModel | PASS |
| TC-004-7 | traceId сохраняется через весь pipeline | PASS |
| TC-004-7 | Корреляционные ID передаются в assemble и infer | PASS |

**Дополнительные тесты (edge cases):**
- Без хуков -- работает корректно
- Hook error -- graceful degradation (HookRegistry обрабатывает)
- Config tools передаются в inference
- finishReason возвращается из inference
- Hook может модифицировать data

**Итого: 27 тестов, все PASS.**

## Code Changes

### Files added
- `packages/agent/src/loop/types.ts` -- AgentLoopConfig, AgentLoopInput, AgentLoopOutput
- `packages/agent/src/loop/AgentLoop.ts` -- AgentLoop class
- `packages/agent/src/loop/index.ts` -- barrel export
- `packages/agent/src/loop/__tests__/AgentLoop.test.ts` -- unit tests (27 cases)

### Files modified
- `packages/agent/src/index.ts` -- добавлены экспорты AgentLoop, AgentLoopConfig, AgentLoopInput, AgentLoopOutput

## Architectural Compliance

- **DI через constructor:** AgentLoop принимает AgentLoopConfig, ContextAssembler, InferenceService, HookRegistry через конструктор
- **Layered Architecture:** AgentLoop -- оркестрационный слой (business logic), делегирует в ContextAssembler и InferenceService
- **Hook Integration:** BEFORE_INTAKE вызывается через HookRegistry.execute()
- **Separation of Concerns:** loop модуль зависит от context, inference, hooks -- но ни один из них не зависит от loop
- **TypeScript strict mode:** все файлы компилируются без ошибок в strict mode
- **No circular dependencies:** loop модуль зависит только от hooks, context, inference (все существующие)
- **Barrel exports:** index.ts в модуле
- **Mock strategy:** ContextAssembler и InferenceService полностью mock'ируются в тестах, HookRegistry используется реальный

## Deviations

1. **HookPoint для before_agent_start** -- roadmap упоминает `before_agent_start` hook, но в HookPoint enum (T-001) его нет. Использован `BEFORE_INTAKE` как ближайший эквивалент -- вызывается в начале pipeline, с корреляционными ID и user message в контексте.
2. **HookPoint для agent_end / on_error** -- roadmap упоминает `agent_end` и `on_error` hooks, но они не определены в HookPoint enum. Error handling реализовано через `console.error` + error response, а не через hook. Это допустимо для текущего этапа -- hook-based error routing может быть добавлен при необходимости.
3. **TraceId generation** -- когда traceId не предоставлен, генерируется через `crypto.randomUUID()`. Это соответствует подходу из HookRegistry.

## Known Limitations

- AgentLoop не включает tool execution loop (T-005) -- только один inference call
- Error response не вызывает ON_ERROR hook -- прямое логирование через console.error
- Нет timeout для pipeline execution -- может быть добавлен как config option
- Нет streaming output -- только non-streaming inference (T-006)
