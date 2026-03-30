# Implementation Report — T-004 Anthropic Claude Provider

## Implemented Scope

Реализован Anthropic Claude провайдер (fallback 2 в failover chain) для LLM Provider System (DOMAIN-008). Провайдер реализует интерфейс `LLMProvider` через `BaseLLMProvider` и использует `@anthropic-ai/sdk` npm package.

**В scope:**
- AnthropicProvider class (implements LLMProvider)
- Message converter (bidirectional: osaI ChatMessage <-> Anthropic Messages API format)
- complete() -- non-streaming completion
- stream() -- SSE streaming с AsyncIterable<LLMChunk>
- isAvailable() -- health check через countTokens API
- countTokens() -- character-based heuristic estimation
- System prompt extraction (отдельный параметр в Anthropic API)
- Tool calling: tool_use content blocks <-> ToolCall[] конвертация
- Error mapping: 429 -> RateLimitError, 529/530 -> ProviderUnavailableError, 401/403 -> AuthError
- Retry-after extraction from rate limit headers

**Out scope:**
- Auth profile rotation (T-008)
- Circuit breaker integration (T-007)
- Thinking/reasoning block handling
- Token counting via Anthropic API (countTokens endpoint)

## Tests Implemented

### Message Converter Tests (27 tests)
- `extractSystemPrompt`: single/multiple system messages, no system, empty array
- `toAnthropicMessages`: user/assistant conversion, system exclusion, tool_calls -> tool_use blocks, tool results -> tool_result blocks, consecutive tool result merging, invalid JSON in tool arguments
- `toAnthropicTools`: ToolDefinition -> Anthropic Tool conversion, no parameters, multiple tools
- `fromAnthropicContent`: text extraction, text concatenation, tool_use -> ToolCall[], mixed content, empty tool input, stop_reason mapping (end_turn->stop, max_tokens->length, tool_use->tool_calls), null stop_reason, unknown stop reasons, non-text/non-tool_use block filtering

### Anthropic Provider Tests (34 tests)
- `constructor`: id/name from config, API key usage, baseURL, timeout, default timeout
- `isAvailable`: success (Available), 429 (RateLimited), 401/403 (Unavailable), other 4xx (Available), connection error (Unavailable), 5xx (Unavailable)
- `complete`: system prompt extraction (TT-002-30), correct LLMResponse, tool_use -> ToolCall[] (TT-002-31), tool passing, temperature/maxTokens, stop sequences, RateLimitError mapping (429), overloaded_error (529/530) -> ProviderUnavailableError, auth errors (401/403) -> AuthError, connection errors -> ProviderUnavailableError, default max_tokens, retry-after extraction
- `stream`: text chunks from content_block_delta (TT-002-32), tool input JSON accumulation from input_json_delta, correct provider/model in chunks, system prompt in stream, usage in final chunk, error mapping
- `countTokens`: character-based heuristic, non-empty minimum, empty string

**Итого: 61 тестов, все pass.**

## Code Changes

### Files Added
- `packages/providers/src/anthropic/anthropic-provider.ts` — AnthropicProvider class (main implementation)
- `packages/providers/src/anthropic/message-converter.ts` — bidirectional message format converter
- `packages/providers/src/anthropic/index.ts` — module barrel export
- `packages/providers/src/anthropic/__tests__/anthropic-provider.test.ts` — provider unit tests (34 tests)
- `packages/providers/src/anthropic/__tests__/message-converter.test.ts` — converter unit tests (27 tests)
- `docs/develop/F-002/T-004/IMPLEMENTATION_REPORT_T-004.md` — this report

### Files Modified
- `packages/providers/src/index.ts` — added `AnthropicProvider` export
- `package.json` (root) — added `@anthropic-ai/sdk` to devDependencies

### Dependencies Added
- `@anthropic-ai/sdk@^0.80.0` — devDependency (workspace root)

## Architectural Compliance

- **Interface compliance:** AnthropicProvider extends BaseLLMProvider, implements LLMProvider interface (id, name, isAvailable, complete, stream, countTokens, getStatus)
- **Type safety:** strict TypeScript, no `any` types, all Anthropic SDK types properly referenced
- **ESM only:** `.js` extension in all imports
- **Error hierarchy:** все external errors маппятся на ProviderError hierarchy
- **API key protection:** ключ передаётся через SDK constructor, не логируется
- **Duck-typing для error detection:** вместо `instanceof` Anthropic SDK error classes используется duck-typing (`status` property check) для устойчивости к мокированию в тестах
- **Message converter separation:** конвертация форматов выделена в отдельный module (`message-converter.ts`), что соответствует архитектурному решению о message-converter из roadmap

## Deviations

1. **Duck-typing вместо `instanceof` для Anthropic errors:** В roadmap предполагалось использовать `instanceof Anthropic.APIError`, но при реализации обнаружено, что vi.mock() полностью заменяет модуль Anthropic SDK, что ломает `instanceof` проверку. Решено использовать duck-typing (`'status' in error && typeof error.status === 'number'`) для detection API errors. Это не нарушает функциональность, а наоборот улучшает testability.

2. **`isAvailable()` использует `countTokens` вместо GET /models:** Anthropic API не имеет простого GET /models endpoint. Используется `messages.countTokens` с минимальным payload (`{messages: [{role: 'user', content: 'ping'}]}`) как lightweight health check.

3. **`isAnthropicConnectionError` использует `error.name` check вместо `instanceof`:** Аналогично duck-typing для APIError, connection error detection использует проверку имени класса.

## Known Limitations

1. **Token counting estimation:** Используется character-based heuristic (`Math.ceil(text.length / 4)`), что неточно. Anthropic SDK предоставляет `messages.countTokens()` API, но оно требует полной payload (messages + tools + system), что делает его непригодным для простого `countTokens(text)` вызова. Точный counting оставлен для будущих итераций.

2. **Thinking blocks ignored:** Anthropic Claude может возвращать `thinking` и `redacted_thinking` content blocks. Они игнорируются в текущей реализации, так как не предусмотрены в osaI LLMResponse type.

3. **No streaming tool call incremental output:** Tool call input JSON накапливается по частям через `input_json_delta` events, но промежуточные состояния не yield'ятся. Только финальный chunk содержит полные tool calls.
