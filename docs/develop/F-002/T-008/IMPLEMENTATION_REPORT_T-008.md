# Implementation Report -- T-008

## Implemented Scope

- **ProviderChain**: failover chain manager, итерирующий по провайдерам в порядке приоритета (Z.ai -> Yandex -> Anthropic -> OpenAI -> Ollama)
- **AuthRotator**: авторотация API-ключей при RateLimitError (429)
- **CircuitBreaker integration**: каждый провайдер оборачивается в CircuitBreaker (per-instance), OPEN-провайдеры пропускаются
- **Timeout**: настраиваемый таймаут на каждый вызов провайдера (default 30s)
- **Structured logging**: все failover-события логируются через ChainLogger (pino-совместимый интерфейс)
- **Статус**: getStatus() возвращает статус всех провайдеров, getActiveProvider() -- первого доступного
- **Lifecycle**: dispose() для очистки ресурсов, resetAll()/resetProvider() для сброса circuit breaker

Реализовано строго в рамках scope T-008. Observability hook integration (F-003) и agent hook integration (F-008) -- out of scope.

## Tests Implemented

### auth-rotation.test.ts (20 tests)

| ID | Описание |
|----|----------|
| AR-01 | Конструкция: хранение API-ключей из конфигурации |
| AR-02 | canRotate(): multiple keys -> true |
| AR-03 | canRotate(): single key -> false |
| AR-04 | canRotate(): empty -> false |
| AR-05 | getDefaultKey(): первый ключ |
| AR-06 | getDefaultKey(): empty -> undefined |
| AR-07 | getNextKey(): первый неиспользованный |
| AR-08 | getNextKey(): none used -> первый |
| AR-09 | getNextKey(): all used -> undefined |
| AR-10 | getRemainingKeyCount(): подсчёт |
| AR-11 | tryWithRotation(): первый ключ успешен |
| AR-12 | tryWithRotation(): ротация при RateLimitError |
| AR-13 | tryWithRotation(): множественная ротация |
| AR-14 | tryWithRotation(): все ключи исчерпаны |
| AR-15 | tryWithRotation(): не-rate-limit ошибка пробрасывается |
| AR-16 | tryWithRotation(): пустой список ключей |
| AR-17 | tryWithRotation(): определение rate limit по retryAfterMs |
| AR-18 | tryWithRotation(): определение rate limit по statusCode 429 |

### provider-chain.test.ts (29 tests)

| ID | Описание | Roadmap mapping |
|----|----------|----------------|
| TT-002-70 | Первый провайдер доступен -> используется | TT-002-70 |
| TT-002-71 | Z.ai down -> fallback на Yandex | TT-002-71 |
| TT-002-72 | Все cloud down -> fallback на Ollama | TT-002-72 |
| TT-002-73 | Все провайдеры down -> ProviderError с diagnostic | TT-002-73 |
| TT-002-73b | Ошибка содержит детали по каждому провайдеру | TT-002-73 |
| TT-002-74 | Rate limit -> fallback на следующий провайдер | TT-002-74 |
| TT-002-75 | 429 на текущем -> следующий провайдер | TT-002-75 |
| TT-002-76 | Circuit breaker OPEN -> skip провайдера | TT-002-76 |
| TT-002-77 | getStatus() возвращает статусы всех 5 провайдеров | TT-002-77 |
| TT-002-77b | getStatus() отражает состояние circuit breaker | TT-002-77 |
| TT-002-78 | Failover события логируются | TT-002-78 |
| PC-01 | executeStream(): стриминг от первого доступного | Streaming |
| PC-02 | executeStream(): fallback при ошибке | Streaming |
| PC-03 | executeStream(): все провайдеры down -> ошибка | Streaming |
| PC-04 | getActiveProvider(): первый доступный | API |
| PC-05 | getActiveProvider(): все CB open -> null | API |
| PC-06 | CB integration: failure recorded | CB |
| PC-07 | CB integration: success resets counter | CB |
| PC-08 | CB integration: open after threshold | CB |
| PC-09 | resetAll(): сброс всех CB | Reset |
| PC-10 | resetProvider(): сброс конкретного CB | Reset |
| PC-11 | providers property | Properties |
| PC-12 | length property | Properties |
| PC-13 | empty provider list | Properties |
| PC-14 | timeout slow provider | Config |
| PC-15 | custom circuit breaker config | Config |
| PC-16 | без logger (noop) | Config |
| PC-17 | dispose() не бросает | Lifecycle |
| PC-18 | non-ProviderError wrapping | Error |

**Итого: 49 тестов (20 + 29)**, все проходят.

## Code Changes

### Files added

| Файл | Описание |
|------|----------|
| `packages/providers/src/chain/auth-rotation.ts` | AuthRotator: управление API-ключами, ротация при 429 |
| `packages/providers/src/chain/provider-chain.ts` | ProviderChain: failover chain, circuit breaker integration, logging |
| `packages/providers/src/chain/index.ts` | Barrel export для chain модуля |
| `packages/providers/src/__tests__/chain/auth-rotation.test.ts` | Unit tests для AuthRotator (20 tests) |
| `packages/providers/src/__tests__/chain/provider-chain.test.ts` | Unit tests для ProviderChain (29 tests) |

### Files modified

| Файл | Изменение |
|------|-----------|
| `packages/providers/src/index.ts` | Добавлены экспорты: ProviderChain, AuthRotator, RotationResult, ChainLogger, ProviderChainConfig, ProviderChainEntryStatus |

## Architectural Compliance

- **Adapter pattern**: ProviderChain не привязан к конкретным провайдерам, работает через LLMProvider interface
- **Circuit breaker per-provider**: каждый провайдер получает собственный экземпляр CircuitBreaker
- **TypeScript strict mode**: все файлы компилируются без ошибок в strict mode, no `any`
- **Barrel exports**: chain модуль экспортируется через index.ts
- **No external dependencies**: ChainLogger определён локально, pino не требуется как зависимость
- **NFR-S03**: API-ключи не логируются (rotator хранит ключи, logger получает только provider ID)
- **NFR-O01**: structured logging всех failover-событий (pino-compatible формат)
- **NFR-R01**: failover time ограничен настраиваемым таймаутом (default 30s)
- **NFR-R05**: circuit breaker correctness -- OPEN провайдеры пропускаются без HTTP-запроса

## Deviations

1. **ChainLogger vs pino import**: вместо прямой зависимости от `pino` определён локальный интерфейс `ChainLogger`, совместимый с pino API. Причина: пакет `pino` находится в `packages/observability` (F-003) и ещё не может быть добавлен как dependency. Когда observability будет готов, ChainLogger может быть заменён на прямой pino тип.

2. **Auth rotation location**: roadmap предполагал `packages/providers/src/chain/auth-rotation.ts` и `packages/providers/src/chain/provider-chain.ts`. Auth rotation реализована как отдельный класс `AuthRotator`, который хранится в каждом `ProviderEntry` внутри ProviderChain. Провайдеры пока не используют AuthRotator напрямую -- ротация ключей через AuthRotator вызывается на уровне chain. Интеграция AuthRotator с конкретными провайдерами (подмена API key в runtime) потребует изменения провайдеров (out of scope для T-008, может быть добавлена в будущей задаче).

3. **Test location**: тесты размещены в `packages/providers/src/__tests__/chain/` вместо `packages/providers/src/chain/`, чтобы соответствовать существующей структуре проекта (tsconfig exclude patterns).

## Known Limitations

1. **Auth rotation не вызывается автоматически провайдерами**: текущая реализация ProviderChain при получении RateLimitError записывает failure в circuit breaker и переходит к следующему провайдеру. Полная auth rotation (переключение API key внутри провайдера и повторная попытка) требует изменения архитектуры провайдеров (например, метод `rotateApiKey()` в LLMProvider interface).

2. **Timeout применяется ко всему вызову**: таймаут оборачивает вызов `complete()`/`stream()` целиком. Нет частичного таймаута для отдельных фаз (connect, first-byte, etc.).

3. **dispose() не вызывается автоматически**: вызывающий код должен явно вызвать `dispose()` для очистки circuit breaker timers. В production это должно быть реализовано через graceful shutdown hook.
