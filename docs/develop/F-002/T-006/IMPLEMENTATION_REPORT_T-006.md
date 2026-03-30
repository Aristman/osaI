# Implementation Report -- T-006 Ollama Provider (Local LLM)

## Implemented Scope

Реализован Ollama Provider -- локальный offline fallback провайдер LLM через Ollama REST API на localhost:11434.

**В scope:**
- OllamaProvider extends BaseLLMProvider (DOMAIN-008)
- complete() -- non-streaming через POST /api/chat (stream: false)
- stream() -- streaming через POST /api/chat (stream: true) с NDJSON парсингом
- isAvailable() -- health check через GET /api/tags
- countTokens() -- унаследован от BaseLLMProvider (character-based heuristic)
- Конвертация ChatMessage[] в Ollama формат
- Поддержка tool/function calling
- Error mapping: connection errors -> ProviderUnavailableError, HTTP errors -> ProviderError
- Graceful degradation при недоступности Ollama

**Out scope:**
- Embeddings через /api/embeddings (F-005)
- Circuit Breaker (T-007)
- Auth rotation (T-008)

## Tests Implemented

43 unit теста в `packages/providers/src/ollama/__tests__/ollama-provider.test.ts`:

| Категория | Тесты | Описание |
|-----------|-------|----------|
| construction | 6 | Конфигурация: id, name, baseUrl, model, partial config |
| isAvailable | 7 | TT-002-50: успех, connection refused, не-200, 500, status обновление |
| complete | 9 | TT-002-51: endpoint, response, usage, temperature, maxTokens, stop, tools, tool_calls, default model |
| stream | 8 | TT-002-52: NDJSON парсинг, stream:true, usage, provider/model, connection error, HTTP error, empty stream, options |
| countTokens | 3 | Character heuristic: базовый, пустая строка, длинный текст |
| getStatus | 3 | Initial, after success, after failure |
| error mapping | 3 | Connection error, HTTP error with statusCode, Ollama error message |
| request format | 3 | System messages, tool result messages, tools format |

Все тесты используют mock `globalThis.fetch` -- реальных HTTP запросов нет.

## Code Changes

### Files added

1. **`packages/providers/src/ollama/ollama-provider.ts`** -- реализация OllamaProvider
   - Конструктор с Partial<ProviderConfig> и дефолтами (localhost:11434, llama3)
   - isAvailable() через GET /api/tags
   - complete() через POST /api/chat (stream: false)
   - stream() через POST /api/chat (stream: true) с NDJSON парсером
   - Конвертация messages, tools в Ollama формат
   - Error mapping в ProviderError hierarchy
   - AbortSignal.timeout для таймаутов

2. **`packages/providers/src/ollama/index.ts`** -- barrel export OllamaProvider

3. **`packages/providers/src/ollama/__tests__/ollama-provider.test.ts`** -- 43 unit теста

### Files modified

1. **`packages/providers/src/index.ts`** -- добавлен `export { OllamaProvider } from './ollama/index.js'`

## Architectural Compliance

- **BaseLLMProvider extension:** OllamaProvider extends BaseLLMProvider, реализуя LLMProvider interface
- **TypeScript strict mode:** нет `any`, строгая типизация всех Ollama API типов
- **ESM only:** все импорты через `.js` расширение
- **No external SDK:** raw HTTP через global fetch (undici встроен в Node.js 22)
- **Barrel export:** экспорт через ollama/index.ts и providers/src/index.ts
- **Profile compliance:** AGENT_PROFILE_nodejs.md -- TypeScript strict, no console.log, ESM, vitest
- **Error hierarchy:** все ошибки маппятся на ProviderError (connection -> ProviderUnavailableError)
- **Graceful degradation:** isAvailable() = false при недоступности, ProviderChain пропускает

## Deviations

Нет отклонений от roadmap. Реализация полностью соответствует спецификации T-006 из ROADMAP_TASKS_F-002.md.

## Known Limitations

1. **countTokens() -- приблизительная оценка.** Точный подсчёт через Ollama API не реализован (roadmap допускает estimation). При наличии eval_count/prompt_eval_count в ответе используются точные значения.
2. **Tool calls ID генерация.** Ollama не возвращает ID для tool_calls, поэтому генерируется синтетический ID (`call_ollama_N`).
3. **Streaming NDJSON буферизация.** Парсер корректно обрабатывает частичные чанки и разбиение JSON по сетевым границам.
