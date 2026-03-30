# Implementation Report -- T-003 OpenAI GPT Provider

## Implemented Scope

- OpenAIProvider class, реализующий LLMProvider interface (DOMAIN-008)
- complete() -- non-streaming вызов через OpenAI Chat Completions API
- stream() -- streaming вызов через AsyncIterable<LLMChunk> с аккумуляцией tool_calls
- isAvailable() -- health check через GET /models
- countTokens() -- приближённая оценка (characters / 4), унаследована от BaseLLMProvider
- Поддержка tool/function calling (tool_calls в complete и stream)
- Error mapping: 429 -> RateLimitError, 401/403 -> AuthError, 5xx -> ProviderUnavailableError, unknown -> ProviderUnavailableError
- Barrel export из packages/providers/src/openai/index.ts
- Экспорт OpenAIProvider из packages/providers/src/index.ts

## Tests Implemented

| ID | Description | Status |
|----|-------------|--------|
| TT-002-20 | complete() вызывает OpenAI Chat Completions API | PASSED |
| TT-002-21 | tool_calls маппятся в ToolCall[] | PASSED |
| TT-002-22 | stream() yields chunk с delta.content | PASSED |

Дополнительно реализованные тесты (29 total):

- Construction: id/name from config, default baseUrl, custom timeout
- isAvailable: success -> true, connection error -> false, auth error -> false
- complete: content + usage, temperature/maxTokens, stop sequences, ToolDefinition conversion, empty content
- Error mapping: 429 -> RateLimitError (с retryAfterMs), 500 -> ProviderUnavailableError, 401 -> AuthError, 403 -> AuthError, unknown -> ProviderError
- stream: chunks с provider/model, accumulation tool_calls, stream: true param
- countTokens: character heuristic, empty string, longer text
- getStatus: Unknown initial, Available after success, Unavailable after failure

**Test file:** `packages/providers/src/openai/__tests__/openai-provider.test.ts` -- 29 tests, all passing

## Code Changes

### Files added

- `packages/providers/src/openai/openai-provider.ts` -- OpenAIProvider class (258 lines)
- `packages/providers/src/openai/index.ts` -- barrel export
- `packages/providers/src/openai/__tests__/openai-provider.test.ts` -- unit tests (29 tests)
- `docs/develop/F-002/T-003/IMPLEMENTATION_REPORT_T-003.md` -- данный отчёт

### Files modified

- `packages/providers/src/index.ts` -- добавлен экспорт OpenAIProvider
- `packages/providers/tsconfig.json` -- добавлен exclude для тестовых файлов
- `packages/providers/package.json` -- добавлена зависимость `openai` (^4.104.0)

## Architectural Compliance

- OpenAIProvider extends BaseLLMProvider (наследует LLMProvider interface)
- Использует openai npm package (разделяет зависимость с Z.ai provider -- T-002)
- Duck typing для detection OpenAI APIError (robust, testable без реального SDK в моках)
- Error hierarchy: ProviderError -> RateLimitError / AuthError / ProviderUnavailableError
- API key НЕ логируется (передаётся напрямую в SDK constructor)
- ESM-only, strict TypeScript, no `any`
- Barrel export pattern

## Deviations

- **Duck typing вместо instanceof:** В `mapError()` используется duck typing (`status: number` check) вместо `instanceof OpenAI.APIError`. Обоснование: при vi.mock()整个 `openai` модуль подменяется mock-объектом, и `instanceof` не работает с mock-конструктором. Duck typing -- более testable подход, который работает как с реальными, так и с mock ошибками.

- **tsconfig exclude:** Добавлен `exclude` в `packages/providers/tsconfig.json` для исключения тестовых файлов. Это необходимо, потому что при `tsc --build` composite mode не всегда корректно применяет `exclude` из parent tsconfig. Заметка: другие пакеты (z-ai, anthropic) имеют TypeScript ошибки в тестовых файлах, не связанные с данной задачей.

## Known Limitations

- countTokens() использует приближённую оценку (characters / 4). Точный counting через tiktoken выходит за рамки MVP.
- Timeout интегрирован в OpenAI SDK client, но AbortController не используется явно. SDK обрабатывает timeout внутренне.
- Streaming tool_calls accumulation использует Map с numeric index -- работает корректно для OpenAI API, который отправляет deltas по порядку.
