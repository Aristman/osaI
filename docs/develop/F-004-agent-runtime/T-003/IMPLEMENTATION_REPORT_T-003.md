# Implementation Report -- T-003: Model Resolver + Failover Chain

## Implemented Scope

Реализован ModelResolver с failover chain, circuit breaker и exponential backoff для Agent Runtime (F-004). Все провайдеры -- mock-реализации без реальных HTTP вызовов.

**Входит в scope:**
- ModelResolver с resolve/failover/reset/completeWithFailover
- Circuit breaker: N consecutive failures -> provider unavailable
- Exponential backoff: baseDelay * 2^(attempt-1), cap 60s
- Три mock-провайдера: ClaudeProvider, OpenAIProvider, OllamaProvider
- Типы ошибок: ModelError, AllProvidersExhaustedError, ProviderAttempt
- Barrel exports в model/index.ts и реэкспорт в src/index.ts

## Tests Implemented

25 тестов в `packages/agent/src/__tests__/model.test.ts`:

| # | Тест | Описание |
|---|------|----------|
| 1 | Primary model selection | Claude активен как первый в списке |
| 2 | Failover to GPT on Claude error | failover() переключает на OpenAI |
| 3 | Failover to Ollama on GPT error | Двойной failover -> Ollama |
| 4 | All providers fail | AllProvidersExhaustedError при исчерпании |
| 5 | AllProvidersExhaustedError details | Проверка attempts в ошибке |
| 6 | Exponential backoff | 1000, 2000, 4000, 8000 ms |
| 7 | getActiveModel -- primary | ModelInfo для Claude |
| 8 | getActiveModel -- after failover | ModelInfo обновляется |
| 9 | Streaming -- Claude | ClaudeProvider.stream() возвращает StreamChunks |
| 10 | Streaming -- OpenAI | OpenAIProvider.stream() |
| 11 | Streaming -- Ollama | OllamaProvider.stream() |
| 12 | Circuit breaker threshold | Провайдер unavailable после N failures |
| 13 | Reset returns to primary | reset() -> первый провайдер |
| 14 | Reset clears circuit breaker | active=true после reset |
| 15 | Custom baseUrl -- Claude | ClaudeProvider с baseUrl |
| 16 | Custom baseUrl -- resolver | ModelResolver принимает baseUrl |
| 17 | Timeout handling -- provider | Provider принимает timeout |
| 18 | Timeout handling -- resolver | ModelResolver пробрасывает timeout |
| 19 | Empty providers throws | Error при пустом массиве |
| 20 | completeWithFailover -- success | Возвращает результат от primary |
| 21 | completeWithFailover -- failover | Переключается при circuit breaker |
| 22 | completeWithFailover -- exhausted | AllProvidersExhaustedError |
| 23 | recordSuccess resets counter | Успех обнуляет failures |
| 24 | Backoff cap | Максимум 60s |
| 25 | Unknown provider | Ошибка при неизвестном имени |

## Code Changes

### Файлы добавлены

- `packages/agent/src/model/ModelResolver.ts` -- основной класс ModelResolver
- `packages/agent/src/model/errors.ts` -- ModelError, AllProvidersExhaustedError, ProviderAttempt
- `packages/agent/src/model/providers/ClaudeProvider.ts` -- mock провайдер Anthropic Claude
- `packages/agent/src/model/providers/OpenAIProvider.ts` -- mock провайдер OpenAI GPT
- `packages/agent/src/model/providers/OllamaProvider.ts` -- mock провайдер Ollama
- `packages/agent/src/model/providers/index.ts` -- barrel export провайдеров
- `packages/agent/src/model/index.ts` -- barrel export модуля model
- `packages/agent/src/__tests__/model.test.ts` -- 25 тестов

### Файлы изменены

- `packages/agent/src/index.ts` -- добавлен реэкспорт model модуля (ModelResolver, ModelError, AllProvidersExhaustedError, ClaudeProvider, OpenAIProvider, OllamaProvider и типы)

## Architectural Compliance

- Strict TypeScript: `npx tsc --noEmit` -- 0 ошибок в новых файлах
- Все провайдеры реализуют `ModelProvider` interface из `types.ts`
- Barrel exports через `.js` расширения (NodeNext moduleResolution)
- Mock-провайдеры не содержат реальных HTTP вызовов
- Экспоненциальный backoff: `baseDelay * 2^(attempt-1)`, capped at 60s
- Circuit breaker: провайдер помечается unavailable после `circuitBreakerThreshold` consecutive failures

## Deviations

Нет отклонений от спецификации задачи.

## Known Limitations

- Провайдеры -- mock-реализации. Реальные HTTP вызовы к Anthropic/OpenAI/Ollama API не реализованы (запланировано для будущих задач).
- Параметры `apiKey`, `baseUrl`, `timeout` в провайдерах принимаются в конфигурации, но не используются в mock-реализации (placeholders для будущей интеграции).
- 3 падающих теста в `persistence.test.ts` -- это другая задача (не T-003), не блокирует текущую реализацию.
