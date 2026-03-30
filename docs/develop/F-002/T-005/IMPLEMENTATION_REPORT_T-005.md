# Implementation Report -- T-005 Yandex Foundation Models Provider

## Implemented Scope

Реализован Yandex Foundation Models Provider (fallback 1) для LLM Provider System (DOMAIN-008). Провайдер использует raw HTTP через глобальный `fetch` (undici в Node.js 22+), т.к. Yandex API не OpenAI-совместимый.

Реализовано:
- `YandexProvider` extends `BaseLLMProvider` -- реализует `LLMProvider` interface
- `message-converter.ts` -- двусторонняя конвертация между osaI `ChatMessage`/`LLMRequest` форматом и Yandex API форматом
- Авторизация через IAM token (`Bearer`) или API key (`ApiKey`) -- настраивается через `extra.authType`
- `catalogueId` передаётся через `extra.catalogueId` и отправляется в заголовке `x-folder-id` и в `modelUri`
- Endpoint: `https://llm.api.cloud.yandex.net/foundationModels/v1/completion`
- Streaming через NDJSON (newline-delimited JSON) парсинг

In-scope только. Не реализовано: embeddings (F-005), STT/TTS (V1), auth rotation (T-008), circuit breaker (T-007).

## Tests Implemented

### message-converter.test.ts (20 тестов)

| Область | Тесты |
|---------|-------|
| `toYandexMessages` | user, assistant, system, multiple system, empty array, tool exclusion (6) |
| `toYandexCompletionOptions` | с параметрами, дефолты, zero temperature, string maxTokens (4) |
| `fromYandexResponse` | TT-002-42, empty text, missing usage, first alternative, CONTENT_FILTER, TRUNCATED (6) |
| `fromYandexAlternative` | text extraction, TRUNCATED, CONTENT_FILTER, PARTIAL (4) |

### yandex-provider.test.ts (34 теста)

| Область | Тесты |
|---------|-------|
| constructor | id/name, catalogueId, TT-002-40 IAM token auth, defaults (4) |
| `isAvailable` | 200, 401, 403, 429, 5xx, connection error, Authorization header (7) |
| `complete` | TT-002-41 payload/catalogueId, TT-002-42 response mapping, system message, temperature/maxTokens, RateLimitError 429, AuthError 401/403, ProviderUnavailableError 500, connection error, retryAfterMs, unknown status (11) |
| `stream` | NDJSON chunks, finishReason, usage, stream:true, error mapping, provider/model, TRUNCATED, empty body (8) |
| `countTokens` | heuristic estimation, min 1, empty (3) |
| error mapping | retry-after header as milliseconds (1) |

Итого: **54 теста**, все проходят.

## Code Changes

### Files Added

| Файл | Описание |
|------|----------|
| `packages/providers/src/yandex/yandex-provider.ts` | YandexProvider -- основной класс провайдера |
| `packages/providers/src/yandex/message-converter.ts` | Двусторонняя конвертация форматов + Yandex API типы |
| `packages/providers/src/yandex/index.ts` | Barrel export модуля |
| `packages/providers/src/yandex/__tests__/yandex-provider.test.ts` | Unit тесты провайдера (34) |
| `packages/providers/src/yandex/__tests__/message-converter.test.ts` | Unit тесты конвертера (20) |
| `docs/develop/F-002/T-005/IMPLEMENTATION_REPORT_T-005.md` | Данный отчёт |

### Files Modified

| Файл | Изменение |
|------|-----------|
| `packages/providers/src/index.ts` | Добавлен экспорт `YandexProvider` из `./yandex/index.js` |

## Architectural Compliance

- YandexProvider extends `BaseLLMProvider` (DOMAIN-008 architecture)
- Реализует `LLMProvider` interface (`isAvailable`, `complete`, `stream`, `countTokens`, `getStatus`)
- Ошибки маппятся на `ProviderError` hierarchy: 429 -> `RateLimitError`, 401/403 -> `AuthError`, 5xx -> `ProviderUnavailableError`, прочие -> `ProviderError`
- Barrel export через `index.ts` (стандарт monorepo pattern)
- TypeScript strict mode, no `any`, ESM only
- API key НЕ логируется (NFR-S03) -- заголовок Authorization конструируется через `getAuthHeader()`
- Raw HTTP через `fetch` (а не OpenAI SDK) -- Yandex API не OpenAI-совместимый (CONTEXT.md)

## Deviations

1. **Авторизация**: Эвристика автоопределения IAM token vs API key заменена на явную конфигурацию через `extra.authType: 'iam' | 'apikey'`. По умолчанию используется `Bearer` (IAM token). Причина: автодетект ненадёжен для тестовых ключей.

2. **System messages**: В отличие от Anthropic (где system prompt извлекается отдельно), для Yandex system messages включаются в массив messages как есть. Причина: Yandex API поддерживает system role в messages.

3. **Tool messages**: Исключаются из массива messages при отправке в Yandex API, т.к. Yandex Foundation Models не поддерживает tool role. Причина: Yandex API constraint.

## Known Limitations

1. **Tool calling**: Yandex Foundation Models не поддерживает tool/function calling в том же формате, что и OpenAI/Anthropic. Tool messages исключаются. Полная поддержка tool calling не в scope T-005.

2. **Token counting**: Используется character-based heuristic (characters / 4) из `BaseLLMProvider`. Точный подсчёт через Yandex API (`tokenize`) не реализован.

3. **IAM token refresh**: Если IAM token истекает во время работы, провайдер не обновляет его автоматически. Обработка через auth rotation (T-008).

4. **Streaming NDJSON parsing**: Реализован линейный парсинг с буфером. Не поддерживается SSE (Server-Sent Events) -- Yandex использует NDJSON.
