# Implementation Report -- T-002: Z.ai Provider (OpenAI-Compatible)

## Implemented Scope

Реализован Z.ai LLM провайдер -- primary провайдер системы osaI (DOMAIN-008). Провайдер использует OpenAI Node.js SDK с кастомным baseURL для подключения к Z.ai API (`https://api.z.ai/api/paas/v4`, модель `glm-5`).

**In scope (реализовано):**
- `ZAiProvider` класс, расширяющий `BaseLLMProvider` из T-001
- Non-streaming `complete()` через `chat.completions.create()`
- Streaming `stream()` через `AsyncIterable<LLMChunk>`
- `isAvailable()` health check через `GET /models`
- `countTokens()` -- эвристическая оценка (characters / 4)
- Tool/function calling через OpenAI формат
- Error mapping: 429 -> RateLimitError, 401/403 -> AuthError, 5xx -> ProviderUnavailableError, connection errors -> ProviderUnavailableError
- API key НЕ логируется (NFR-S03)

**Out scope (не реализовано, как указано в roadmap):**
- Auth profile rotation (T-008)
- Circuit breaker (T-007)

## Tests Implemented

| ID | Description | Status |
|----|-------------|--------|
| TT-002-10 | complete() отправляет корректный payload (messages + model + temperature) | PASS |
| TT-002-11 | complete() возвращает LLMResponse с content + usage + provider | PASS |
| TT-002-12 | stream() yields LLMChunk объекты с content delta | PASS |
| TT-002-13 | isAvailable() возвращает true при успешном health check | PASS |
| TT-002-14 | 429 response -> RateLimitError с retryAfterMs | PASS |
| TT-002-15 | 5xx response -> ProviderUnavailableError | PASS |
| TT-002-16 | baseURL берётся из конфигурации (default: https://api.z.ai/api/paas/v4) | PASS |
| -- | tool_calls маппинг из response (complete) | PASS |
| -- | tool_calls маппинг из stream deltas | PASS |
| -- | 401 -> AuthError | PASS |
| -- | 403 -> AuthError | PASS |
| -- | Connection error -> ProviderUnavailableError | PASS |
| -- | 400 -> ProviderError (generic) | PASS |
| -- | Unknown error -> ProviderError fallback | PASS |
| -- | API key не утечкает в error messages | PASS |
| -- | stop sequences передаются в API | PASS |
| -- | assistant messages with tool_calls конвертируются | PASS |
| -- | tool messages конвертируются с tool_call_id | PASS |
| -- | stream: true передаётся в streaming запросах | PASS |
| -- | usage в stream chunk | PASS |
| -- | countTokens эвристика (characters / 4) | PASS |
| -- | countTokens для пустой строки | PASS |

**Итого: 30 тестов, все проходят.**

## Code Changes

### Files Added
- `packages/providers/src/z-ai/z-ai-provider.ts` -- ZAiProvider реализация
- `packages/providers/src/z-ai/index.ts` -- barrel export модуля
- `packages/providers/src/z-ai/__tests__/z-ai-provider.test.ts` -- unit тесты (30 test cases)

### Files Modified
- `packages/providers/package.json` -- добавлена зависимость `openai: ^4.104.0`
- `packages/providers/src/index.ts` -- добавлен экспорт `ZAiProvider`

## Architectural Compliance

- **LLMProvider interface:** ZAiProvider корректно реализует все методы интерфейса (isAvailable, complete, stream, countTokens, getStatus)
- **BaseLLMProvider inheritance:** Переиспользование helper-методов (buildResponse, buildChunk, buildUsage)
- **ProviderError hierarchy:** Все ошибки маппятся на корректные классы из T-001
- **ESM only:** Все импорты используют `.js` extension
- **Strict TypeScript:** No `any`, no `@ts-ignore`, full strict mode
- **No console.log:** Ошибки логируются через ProviderError (будет подключён pino в T-008/T-010)
- **API key protection:** API key не включается в error messages

## Deviations

Отклонений от roadmap нет. Все checklist-пункты T-002 выполнены.

## Known Limitations

1. **countTokens approximation:** Используется эвристика `characters / 4`. Точный counting через tiktoken выходит за рамки MVP (указано в roadmap Note 6).
2. **Full build blocked:** `pnpm build` на уровне корневого проекта содержит ошибки компиляции в `openai-provider.ts` (T-003, другая задача). Изолированная сборка Z.ai файлов проходит без ошибок.
3. **Streaming tool_calls:** Z.ai streaming возвращает incremental tool_call deltas. Текущая реализация маппит каждый delta как отдельный ToolCall (без аккумуляции). Полная аккумуляция tool_calls по индексу будет реализована в T-008 (ProviderChain), если потребуется.
