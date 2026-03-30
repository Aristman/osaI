# Task Roadmap: LLM Provider System (F-002)

**Version:** v1.0
**Date:** 2026-03-30
**Author:** TDD Planner Agent
**Status:** Active

---

## 1. Feature Overview

- **Feature ID:** F-002
- **Feature Name:** LLM Provider System
- **Description:** Единый интерфейс для 5 LLM-провайдеров (Z.ai, Yandex, Anthropic, OpenAI, Ollama). Автоматическая failover-цепочка с circuit breaker и auth profile rotation. Streaming и non-streaming вызовы. Подсчёт токенов.
- **Related Requirements:** FR-007 (Provider Abstraction), FR-028 (Failover + Circuit Breaker)
- **Domain:** DOMAIN-008
- **Agent Profile:** backend/AGENT_PROFILE_nodejs.md
- **Git branch:** feature/llm-provider-system
- **Package:** packages/providers

---

## 2. Dependencies

### 2.1 Feature Dependencies

- **F-001:** Core Infrastructure (blocking) -- pnpm workspace, shared types, config loader (osai.json), pino logger

### 2.2 Task Dependencies

```
T-001 (LLMProvider interface + types)
  |
  +---> T-002 (Z.ai provider -- OpenAI-compat)  ---+
  +---> T-003 (OpenAI provider)                  |  (parallel)
  +---> T-004 (Anthropic provider)                |
  +---> T-005 (Yandex provider)                   |
  +---> T-006 (Ollama provider)                   |
  |                                               v
  +---> T-007 (Circuit Breaker) <------------------+
  +---> T-008 (ProviderChain + Auth Rotation) --- зависит от T-002..T-007
```

### 2.3 Development Order

- **Wave 1:** T-001
- **Wave 2 (parallel, max 3):** T-002, T-003, T-004
- **Wave 3 (parallel, max 3):** T-005, T-006, T-007
- **Wave 4:** T-008

---

## 3. Task Breakdown

### Task T-001: LLMProvider Interface + Shared Types

**Domain:** DOMAIN-008 | **Dependencies:** None
**Estimated Time:** 2-3 hours

**Description:**
Определение TypeScript интерфейсов для LLM Provider System: LLMProvider, LLMRequest, LLMResponse, LLMChunk, TokenUsage, ProviderStatus, ProviderError, AuthProfile. Создание barrel export для packages/providers.

**Scope:**
- **In scope:** LLMProvider interface (isAvailable, complete, stream, countTokens), LLMRequest/LLMResponse/LLMChunk types, TokenUsage, ProviderStatus enum, custom error classes (ProviderError, ProviderUnavailableError, RateLimitError, TokenLimitError)
- **Out scope:** Реализация провайдеров, circuit breaker, failover chain

#### Checklist
- [ ] CODE: `packages/providers/src/types.ts` (все интерфейсы и типы)
- [ ] CODE: `packages/providers/src/errors.ts` (custom error classes)
- [ ] CODE: `packages/providers/src/index.ts` (barrel export)
- [ ] TEST: `packages/providers/src/__tests__/types.test.ts`
- [ ] TEST: `packages/providers/src/__tests__/errors.test.ts`
- [ ] BUILD: `pnpm build` -- packages/providers компилируется

#### Acceptance
- LLMProvider interface содержит: id, name, isAvailable(), complete(), stream(), countTokens()
- LLMRequest содержит: model, messages, tools?, temperature?, maxTokens?, stream?
- LLMResponse содержит: content, toolCalls?, usage, model, provider
- TokenUsage содержит: promptTokens, completionTokens, totalTokens
- ProviderError hierarchy: ProviderError -> ProviderUnavailableError, RateLimitError, TokenLimitError
- Barrel export компилируется без ошибок
- Все типы строго типизированы (no `any`)

---

### Task T-002: Z.ai Provider (OpenAI-Compatible)

**Domain:** DOMAIN-008 | **Dependencies:** T-001
**Estimated Time:** 3-4 hours

**Description:**
Реализация Z.ai провайдера через OpenAI Node.js SDK с кастомным baseURL. Z.ai -- primary провайдер. Endpoint: `https://api.z.ai/api/paas/v4`, модель: `glm-5`. Streaming и non-streaming вызовы.

**Scope:**
- **In scope:** ZAiProvider class (implements LLMProvider), OpenAI SDK с baseURL конфигурацией, complete() non-streaming, stream() через AsyncIterable, isAvailable() health check, countTokens() (приближённый), конфигурация из osai.json
- **Out scope:** Auth profile rotation (T-008), circuit breaker (T-007)

#### Checklist
- [ ] CODE: `packages/providers/src/z-ai/z-ai-provider.ts`
- [ ] CODE: `packages/providers/src/z-ai/index.ts`
- [ ] TEST: `packages/providers/src/z-ai/__tests__/z-ai-provider.test.ts`
- [ ] BUILD: `pnpm build`

#### Acceptance
- ZAiProvider реализует LLMProvider interface
- complete() отправляет POST к /chat/completions с messages и возвращает LLMResponse
- stream() возвращает AsyncIterable<LLMChunk>
- isAvailable() возвращает true при успешном health check (GET /models)
- countTokens() возвращает приближённую оценку (characters / 4)
- baseURL конфигурируется через osai.json (providers.z-ai.baseUrl)
- Ошибки API маппятся на ProviderError hierarchy (429 -> RateLimitError, 5xx -> ProviderUnavailableError)
- API key НЕ логируется (NFR-S03)

---

### Task T-003: OpenAI Provider

**Domain:** DOMAIN-008 | **Dependencies:** T-001
**Estimated Time:** 2-3 hours

**Description:**
Реализация OpenAI GPT провайдера (fallback 3). Использует OpenAI Node.js SDK напрямую. Streaming и non-streaming.

**Scope:**
- **In scope:** OpenAIProvider class, complete(), stream(), isAvailable(), countTokens(), поддержка tool_calls
- **Out scope:** Auth rotation (T-008), circuit breaker (T-007)

#### Checklist
- [ ] CODE: `packages/providers/src/openai/openai-provider.ts`
- [ ] CODE: `packages/providers/src/openai/index.ts`
- [ ] TEST: `packages/providers/src/openai/__tests__/openai-provider.test.ts`
- [ ] BUILD: `pnpm build`

#### Acceptance
- OpenAIProvider реализует LLMProvider interface
- complete() вызывает OpenAI Chat Completions API
- stream() возвращает AsyncIterable<LLMChunk>
- tool_calls в ответе корректно маппятся в ToolCall[]
- isAvailable() проверяет доступность API
- Errors маппятся на ProviderError hierarchy

---

### Task T-004: Anthropic Provider

**Domain:** DOMAIN-008 | **Dependencies:** T-001
**Estimated Time:** 3-4 hours

**Description:**
Реализация Anthropic Claude провайдера (fallback 2). Anthropic Messages API имеет отличный формат от OpenAI: отдельный system prompt, другой формат tool_calls (tool_use content block).

**Scope:**
- **In scope:** AnthropicProvider class, адаптация Anthropic Messages API к LLMProvider interface, complete(), stream() (SSE parsing), isAvailable(), countTokens(), конвертация tool_calls format (tool_use blocks <-> ToolCall[])
- **Out scope:** Auth rotation, circuit breaker

#### Checklist
- [ ] CODE: `packages/providers/src/anthropic/anthropic-provider.ts`
- [ ] CODE: `packages/providers/src/anthropic/message-converter.ts` ( Anthropic <-> LLM format)
- [ ] CODE: `packages/providers/src/anthropic/index.ts`
- [ ] TEST: `packages/providers/src/anthropic/__tests__/anthropic-provider.test.ts`
- [ ] TEST: `packages/providers/src/anthropic/__tests__/message-converter.test.ts`
- [ ] BUILD: `pnpm build`

#### Acceptance
- AnthropicProvider реализует LLMProvider interface
- system prompt извлекается из messages и передаётся как отдельный параметр
- Anthropic tool_use content blocks конвертируются в unified ToolCall[] формат
- SSE streaming парсится корректно (message_start, content_block_delta, message_stop)
- isAvailable() проверяет доступность
- Errors маппятся: rate_limit_error -> RateLimitError, overloaded_error -> ProviderUnavailableError

---

### Task T-005: Yandex Provider

**Domain:** DOMAIN-008 | **Dependencies:** T-001
**Estimated Time:** 3-4 hours

**Description:**
Реализация Yandex Foundation Models провайдера (fallback 1). Yandex API использует IAM token или API key для авторизации, catalogueId для routing. Специфичный формат запроса/ответа.

**Scope:**
- **In scope:** YandexProvider class, complete(), stream(), isAvailable(), countTokens(), IAM token / API key авторизация, конвертация Yandex format <-> LLMProvider format
- **Out scope:** Auth rotation, circuit breaker, embeddings (F-005), STT/TTS (V1)

#### Checklist
- [ ] CODE: `packages/providers/src/yandex/yandex-provider.ts`
- [ ] CODE: `packages/providers/src/yandex/message-converter.ts`
- [ ] CODE: `packages/providers/src/yandex/index.ts`
- [ ] TEST: `packages/providers/src/yandex/__tests__/yandex-provider.test.ts`
- [ ] TEST: `packages/providers/src/yandex/__tests__/message-converter.test.ts`
- [ ] BUILD: `pnpm build`

#### Acceptance
- YandexProvider реализует LLMProvider interface
- Авторизация через IAM token (env: YANDEX_IAM_TOKEN) или API key (osai.json)
- catalogueId передаётся из конфигурации
- Yandex message format конвертируется в/из LLMRequest/LLMResponse
- complete() и stream() работают
- isAvailable() проверяет доступность через Yandex API
- Errors корректно маппятся

---

### Task T-006: Ollama Provider (Local)

**Domain:** DOMAIN-008 | **Dependencies:** T-001
**Estimated Time:** 2-3 hours

**Description:**
Реализация Ollama провайдера (offline local fallback). Ollama REST API на localhost:11434. Нет API key. Модель по умолчанию: llama3 (конфигурируемая).

**Scope:**
- **In scope:** OllamaProvider class, complete(), stream(), isAvailable() (проверяет что Ollama запущен на localhost:11434), countTokens(), нет авторизации
- **Out scope:** Embeddings (F-005), circuit breaker

#### Checklist
- [ ] CODE: `packages/providers/src/ollama/ollama-provider.ts`
- [ ] CODE: `packages/providers/src/ollama/index.ts`
- [ ] TEST: `packages/providers/src/ollama/__tests__/ollama-provider.test.ts`
- [ ] BUILD: `pnpm build`

#### Acceptance
- OllamaProvider реализует LLMProvider interface
- baseUrl по умолчанию: http://localhost:11434
- isAvailable() возвращает false если Ollama не запущен (connection refused)
- complete() вызывает /api/chat или /api/generate
- stream() парсит newline-delimited JSON stream
- countTokens() использует Ollama /api/embeddings или приближённую оценку
- Graceful degradation: при недоступности Ollama -- isAvailable() = false, ProviderChain пропускает

---

### Task T-007: Circuit Breaker

**Domain:** DOMAIN-008 | **Dependencies:** T-001
**Estimated Time:** 2-3 hours

**Description:**
Реализация circuit breaker state machine для LLM-провайдеров. Состояния: closed (normal), open (skip provider), half-open (пробный запрос). Параметры: failure_threshold=5, reset_timeout=30000ms.

**Scope:**
- **In scope:** CircuitBreaker class, state machine (closed -> open -> half-open), onRecordSuccess/onRecordFailure API, getState(), reset(), оборачивание LLMProvider вызовов, таймер автоматического перехода open -> half-open
- **Out scope:** ProviderChain (T-008), конкретные провайдеры

#### Checklist
- [ ] CODE: `packages/providers/src/circuit-breaker/circuit-breaker.ts`
- [ ] CODE: `packages/providers/src/circuit-breaker/types.ts`
- [ ] CODE: `packages/providers/src/circuit-breaker/index.ts`
- [ ] TEST: `packages/providers/src/circuit-breaker/__tests__/circuit-breaker.test.ts`
- [ ] BUILD: `pnpm build`

#### Acceptance
- CircuitBreaker стартует в состоянии CLOSED
- После failure_threshold (5) последовательных ошибок -> состояние OPEN
- Через reset_timeout (30s) -> автоматический переход в HALF_OPEN
- HALF_OPEN: один пробный запрос; при успехе -> CLOSED, при ошибке -> OPEN
- OPEN: вызовы отклоняются немедленно (ProviderUnavailableError) без фактического HTTP запроса
- CLOSED: нормальное выполнение, failure counter сбрасывается при успехе
- Конфигурируемые параметры (failure_threshold, reset_timeout)

---

### Task T-008: ProviderChain + Auth Profile Rotation

**Domain:** DOMAIN-008 | **Dependencies:** T-002, T-003, T-004, T-005, T-006, T-007
**Estimated Time:** 3-4 hours

**Description:**
Failover chain manager: итерация по провайдерам в порядке приоритета (Z.ai -> Yandex -> Anthropic -> OpenAI -> Ollama). Интеграция с circuit breaker. Auth profile rotation при rate limit (429).

**Scope:**
- **In scope:** ProviderChain class (implements ProviderChain interface из ARCHITECTURE_OVERVIEW), execute(), executeStream(), getStatus(), circuit breaker per-provider, auth profile rotation при 429 (переключение API key), логирование failover событий, таймаут на вызов провайдера
- **Out scope:** Observability integration (F-003), hook integration (F-008)

#### Checklist
- [ ] CODE: `packages/providers/src/chain/provider-chain.ts`
- [ ] CODE: `packages/providers/src/chain/auth-rotation.ts`
- [ ] CODE: `packages/providers/src/chain/index.ts`
- [ ] TEST: `packages/providers/src/chain/__tests__/provider-chain.test.ts`
- [ ] TEST: `packages/providers/src/chain/__tests__/auth-rotation.test.ts`
- [ ] BUILD: `pnpm build`

#### Acceptance
- ProviderChain выполняет запрос через первого доступного провайдера (с учётом circuit breaker)
- При ошибке провайдера -- автоматически переключается на следующего в цепочке
- Circuit breaker пропускает провайдеры в состоянии OPEN
- Auth rotation: при 429 -> переключение на следующий API key того же провайдера; при исчерпании всех keys -> следующий провайдер
- execute() возвращает LLMResponse от первого успешного провайдера
- executeStream() возвращает AsyncIterable<LLMChunk> от первого успешного провайдера
- getStatus() возвращает статус всех провайдеров (available/unavailable/circuit-open)
- При падении всех провайдеров -- ProviderError с diagnostic информацией
- Таймаут на вызов провайдера (настраиваемый, default 30s)
- Логирование каждого failover события через pino logger (NFR-O01)

---

## 4. Test Strategy (TDD)

### 4.1 Test Types per Task

| Task | Unit Tests | Integration Tests | Build + Run |
|------|-----------|-------------------|-------------|
| T-001 | Interface compliance, error hierarchy | Barrel export resolution | `pnpm build` |
| T-002 | complete(), stream(), isAvailable(), error mapping | Mock Z.ai endpoint (MSW) | `pnpm build` |
| T-003 | complete(), stream(), tool_calls mapping | Mock OpenAI endpoint | `pnpm build` |
| T-004 | Message converter, stream SSE parsing, tool_use mapping | Mock Anthropic endpoint | `pnpm build` |
| T-005 | Message converter, IAM auth, complete/stream | Mock Yandex endpoint | `pnpm build` |
| T-006 | complete(), stream(), isAvailable() when offline | Real Ollama (optional) | `pnpm build` |
| T-007 | State transitions, threshold logic, timer reset | None (pure logic) | `pnpm build` |
| T-008 | Failover logic, rotation, circuit breaker integration | Mock 5 providers + chain | `pnpm build` |

### 4.2 Build and Run Verification

**Build:**
```bash
pnpm build
```
- exit code 0, dist/ в packages/providers

**Tests:**
```bash
pnpm test -- --project providers
```
- Все unit тесты проходят (green)
- Coverage > 80% для всех modules

### 4.3 Test Cases per Task

#### T-001 Tests

| ID | Description | Expected |
|----|-------------|----------|
| TT-002-01 | LLMProvider type assertion на mock-классе | Компиляция без ошибок |
| TT-002-02 | ProviderError является instance of Error | instanceof работает |
| TT-002-03 | RateLimitError extends ProviderError | Цепочка наследования |
| TT-002-04 | TokenLimitError содержит tokenCount | Свойство доступно |

#### T-002 Tests

| ID | Description | Expected |
|----|-------------|----------|
| TT-002-10 | complete() отправляет корректный payload | Messages + model + temperature переданы |
| TT-002-11 | complete() возвращает LLMResponse с usage | content + usage.promptTokens + provider="z-ai" |
| TT-002-12 | stream() yields LLMChunk объекты | Каждый chunk содержит content delta |
| TT-002-13 | isAvailable() возвращает true при 200 | Health check успешен |
| TT-002-14 | 429 response -> RateLimitError | Ошибка содержит retryAfterMs |
| TT-002-15 | 5xx response -> ProviderUnavailableError | Ошибка содержит statusCode |
| TT-002-16 | baseURL берётся из конфигурации | https://api.z.ai/api/paas/v4 |

#### T-003 Tests

| ID | Description | Expected |
|----|-------------|----------|
| TT-002-20 | complete() вызывает OpenAI Chat Completions | POST /v1/chat/completions |
| TT-002-21 | tool_calls маппятся в ToolCall[] | id, name, arguments корректны |
| TT-002-22 | stream() yields chunk с delta.content | Streaming работает |

#### T-004 Tests

| ID | Description | Expected |
|----|-------------|----------|
| TT-002-30 | system prompt извлекается из messages | system parameter в Anthropic API |
| TT-002-31 | tool_use blocks конвертируются в ToolCall[] | name, id, input корректны |
| TT-002-32 | SSE event parsing (content_block_delta) | Текст извлекается из delta.text |
| TT-002-33 | stop_reason: tool_use -> response.toolCalls заполнен | ToolCalls[] не пуст |

#### T-005 Tests

| ID | Description | Expected |
|----|-------------|----------|
| TT-002-40 | IAM token авторизация | Header Authorization: Bearer {token} |
| TT-002-41 | catalogueId передаётся в запросе | В query или body |
| TT-002-42 | Yandex response format конвертируется в LLMResponse | content, usage корректны |

#### T-006 Tests

| ID | Description | Expected |
|----|-------------|----------|
| TT-002-50 | isAvailable() = false когда Ollama не запущен | Connection refused handled |
| TT-002-51 | complete() вызывает /api/chat | Правильный endpoint |
| TT-002-52 | stream() парсит newline-delimited JSON | Chunks yield'ятся |

#### T-007 Tests

| ID | Description | Expected |
|----|-------------|----------|
| TT-002-60 | Начальное состояние CLOSED | getState() === CLOSED |
| TT-002-61 | 5 sequential failures -> OPEN | getState() === OPEN |
| TT-002-62 | OPEN -> вызывает ProviderUnavailableError немедленно | Нет HTTP запроса |
| TT-002-63 | Через 30s -> HALF_OPEN | getState() === HALF_OPEN |
| TT-002-64 | HALF_OPEN success -> CLOSED | Счётчик сброшен |
| TT-002-65 | HALF_OPEN failure -> OPEN | Счётчик сброшен в 1 |
| TT-002-66 | CLOSED success -> failure counter reset | Счётчик = 0 |

#### T-008 Tests

| ID | Description | Expected |
|----|-------------|----------|
| TT-002-70 | Z.ai available -> используется Z.ai | provider в response = "z-ai" |
| TT-002-71 | Z.ai down -> Yandex available -> Yandex | provider = "yandex" |
| TT-002-72 | Все cloud down -> Ollama | provider = "ollama" |
| TT-002-73 | Все провайдеры down -> ProviderError | Error с diagnostic info |
| TT-002-74 | 429 на Z.ai -> auth rotation (следующий key) | Retry с другим API key |
| TT-002-75 | 429 на всех keys Z.ai -> следующий провайдер | Fallback chain |
| TT-002-76 | Circuit breaker OPEN на Z.ai -> skip | Z.ai пропущен |
| TT-002-77 | getStatus() возвращает статус всех 5 провайдеров | Массив ProviderStatus[] |
| TT-002-78 | Failover event залогирован через pino | Logger.info вызван с провайдером и причиной |

---

## 5. Implementation Plan per Task

### T-001: LLMProvider Interface + Shared Types
1. Определить LLMRequest, LLMResponse, LLMChunk, TokenUsage, ToolCall в types.ts
2. Определить LLMProvider interface (id, name, isAvailable, complete, stream, countTokens)
3. Создать ProviderError hierarchy (ProviderError -> ProviderUnavailableError, RateLimitError, TokenLimitError)
4. Создать barrel export index.ts
5. Написать тесты для всех типов и error classes

**Constraints:** strict TypeScript, no `any`, ESM only

### T-002: Z.ai Provider
1. Установить openai npm package
2. Создать ZAiProvider class с constructor(config: ProviderConfig)
3. Реализовать isAvailable() через GET /models
4. Реализовать complete() через chat.completions.create()
5. Реализовать stream() через chat.completions.create({ stream: true }) + AsyncIterable adapter
6. Реализовать countTokens() (приближённый: Math.ceil(text.length / 4))
7. Error mapping: 429 -> RateLimitError, 5xx -> ProviderUnavailableError
8. Мок-тесты с MSW (Mock Service Worker) или vi.mock()

**Constraints:** baseURL из osai.json, API key не логируется, OpenAI SDK с кастомным baseURL

### T-003: OpenAI Provider
1. Создать OpenAIProvider (аналогично ZAiProvider но с дефолтным baseURL)
2. Реализовать complete(), stream(), isAvailable(), countTokens()
3. Обработка tool_calls из ответа
4. Мок-тесты

**Constraints:** Reuse OpenAI SDK (та же зависимость что и Z.ai)

### T-004: Anthropic Provider
1. Установить @anthropic-ai/sdk
2. Создать message-converter.ts (LLMRequest <-> Anthropic format)
3. Реализовать AnthropicProvider с конвертацией форматов
4. SSE streaming parsing для Anthropic format
5. Мок-тесты

**Constraints:** system prompt extracted from messages[] before first non-system message

### T-005: Yandex Provider
1. Создать message-converter.ts (LLMRequest <-> Yandex format)
2. Реализовать YandexProvider с IAM token авторизацией
3. Complete + stream + isAvailable
4. Мок-тесты

**Constraints:** catalogueId в конфигурации, IAM token или API key авторизация

### T-006: Ollama Provider
1. Создать OllamaProvider без внешнего SDK (raw HTTP через undici/fetch)
2. Реализовать complete() через /api/chat, stream() через /api/chat с stream=true
3. isAvailable() через GET /api/tags
4. countTokens() через /api/embeddings или estimation
5. Мок-тесты + optional integration test с реальным Ollama

**Constraints:** localhost:11434, graceful degradation при недоступности

### T-007: Circuit Breaker
1. Определить CircuitState enum: CLOSED, OPEN, HALF_OPEN
2. Реализовать CircuitBreaker class с generic state machine
3. setTimeout для автоматического OPEN -> HALF_OPEN перехода
4. onRecordSuccess() / onRecordFailure() API
5. wrap<T>(providerMethod) для автоматического обёртывания вызовов
6. Unit тесты всех переходов состояний (vi.useFakeTimers)

**Constraints:** failure_threshold=5, reset_timeout=30000ms, thread-safe для event loop

### T-008: ProviderChain + Auth Rotation
1. Создать ProviderChain с конструктором (providers[], config)
2. Инициализировать circuit breaker per-provider
3. Реализовать execute(): try provider -> catch -> circuit breaker record -> next provider
4. Реализовать executeStream(): аналогично через AsyncIterable
5. Auth rotation: при RateLimitError -> next API key -> retry; exhausted -> next provider
6. getStatus() собирает состояние всех провайдеров
7. Логирование failover через pino
8. Интеграционные тесты с мокированными провайдерами

**Constraints:** Порядок chain из osai.json (agent.failoverChain), timeout per-call

---

## 6. Acceptance Criteria per Task

### T-001
- [ ] Все интерфейсы компилируются в strict TypeScript
- [ ] Error hierarchy корректно наследуется
- [ ] Barrel export работает: `import { LLMProvider, ProviderError } from '@osai/providers'`

### T-002
- [ ] ZAiProvider реализует LLMProvider
- [ ] Non-streaming complete() работает с mock Z.ai endpoint
- [ ] Streaming через AsyncIterable работает
- [ ] Error mapping корректен (429, 5xx)

### T-003
- [ ] OpenAIProvider реализует LLMProvider
- [ ] tool_calls конвертируются в ToolCall[]
- [ ] Streaming работает

### T-004
- [ ] AnthropicProvider реализует LLMProvider
- [ ] Message converter双向 конвертация корректна
- [ ] SSE streaming parsing работает
- [ ] tool_use blocks конвертируются

### T-005
- [ ] YandexProvider реализует LLMProvider
- [ ] IAM token авторизация
- [ ] Message converter работает

### T-006
- [ ] OllamaProvider реализует LLMProvider
- [ ] isAvailable() = false при недоступности (graceful)
- [ ] Streaming NDJSON parsing работает

### T-007
- [ ] Все state transitions работают (CLOSED -> OPEN -> HALF_OPEN -> CLOSED)
- [ ] failure_threshold и reset_timeout конфигурируемы
- [ ] OPEN state отклоняет вызовы без HTTP запроса

### T-008
- [ ] Failover chain пробует провайдеров в правильном порядке
- [ ] Circuit breaker интегрирован (OPEN провайдеры пропускаются)
- [ ] Auth rotation при 429 работает
- [ ] getStatus() возвращает статус всех провайдеров
- [ ] Failover события логируются
- [ ] Все провайдеры down -> понятная ошибка с diagnostic

---

## 7. Quality Expectations

- **TypeScript strict mode** -- обязательно (NFR-M01)
- **Test coverage** -- > 80% для каждого провайдера, > 90% для circuit breaker и chain
- **No `any` type** -- без веских оснований
- **No console.log** -- pino logger только
- **API key protection** -- ключи НЕ логируются (NFR-S03)
- **Error handling** -- все external call errors маппятся на ProviderError hierarchy
- **Test speed** -- все unit тесты packages/providers < 15s
- **Build stability** -- `pnpm build` exit code 0

---

## 8. Risks and Edge Cases

| Risk | Impact | Mitigation |
|------|--------|------------|
| Z.ai API меняет формат ответа | High | OpenAI SDK стабилизирует формат; Z.ai верифицирован как OpenAI-совместимый |
| Anthropic SSE streaming формат сложнее для парсинга | Medium | Выделенный message-converter + обширные тесты |
| Yandex IAM token истекает во время работы | Medium | Refresh mechanism или fallback на API key |
| Ollama не запущен на целевой машине | Low | isAvailable() = false, chain пропускает, graceful degradation |
| OpenAI SDK version conflict (Z.ai + OpenAI) | Low | Одна версия SDK, разные baseURL конфигурации |
| Circuit breaker таймер не синхронизирован | Low | vi.useFakeTimers в тестах, event loop timer |
| Auth rotation исчерпала все keys | Medium | Fallback на следующий провайдер в chain |
| Streaming interruption mid-response | Medium | Error propagation через AsyncIterable, cleanup |
| Timeout на провайдере слишком длинный | Medium | Конфигурируемый таймаут (default 30s), AbortController |

---

## 9. Notes

1. **Z.ai VERIFIED:** endpoint `https://api.z.ai/api/paas/v4`, модель `glm-5`, OpenAI-совместимый API. Работает через OpenAI Node.js SDK с baseURL. Base URL конфигурируемый (AD-004).
2. **SHARED OpenAI SDK:** Z.ai (T-002) и OpenAI (T-003) используют одну и ту же зависимость `openai` npm package с разными baseURL. Это уменьшает bundle size и упрощает поддержку.
3. **Z.ai + OpenAI разделение:** Несмотря на общую зависимость, Z.ai и OpenAI -- отдельные provider classes. Z.ai имеет специфичные настройки (кастомный baseURL, другая модель).
4. **NO REAL API CALLS IN TESTS:** Все тесты используют мокирование (vi.mock или MSW). Интеграционные тесты с реальными API выносятся в F-013 (Cross-Platform + Testing).
5. **CIRCUIT BREAKER GENERIC:** CircuitBreaker (T-007) -- generic, не привязан к LLM. Может переиспользоваться для других компонентов (Memory System, Knowledge Base).
6. **TOKEN COUNTING:** Приближённая оценка (characters / 4) для всех провайдеров. Точный counting возможен через tiktoken (OpenAI) или provider-specific API, но это выходит за рамки MVP.
7. **PROVIDER CHAIN ORDER:** Конфигурируется через `agent.failoverChain` в osai.json. Default: Z.ai -> Yandex -> Anthropic -> OpenAI -> Ollama.
8. **DEPENDENCIES ON F-001:** Требуется config loader (T-006 из F-001), pino logger (T-004 из F-001), shared types, workspace setup.
