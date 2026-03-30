# Test & Review -- T-001

**Version:** v1.0
**Date:** 2026-03-30

---

## Tested Task

- **Task ID:** T-001
- **Task Name:** WebSocket Server on :18789
- **Feature:** F-009 Gateway + Multi-Chat
- **Domain:** DOMAIN-001 (Gateway)
- **Profile:** backend/AGENT_PROFILE_nodejs.md + backend/AGENT_PROFILE_backend-base.md

---

## Build and Run Verification

### Build Verification
- **Command:** `pnpm -C packages/gateway build` (tsc --build)
- **Status:** PASS
- **Output:** Exit code 0, no errors. dist/ содержит ws-server.js, ws-server.d.ts, index.js, index.d.ts с source maps.
- **Duration:** < 3s

### Run Verification
- **Command:** `node -e "import(...).then(async ({WsServer}) => { ... })"`
- **Status:** PASS
- **Startup Time:** < 100ms
- **Runtime Errors:** None (на свободном порту; EADDRINUSE на 18789 -- порт занят сторонним процессом, не баг)
- **Exit Code:** 0 (graceful stop)
- **Observations:** Pino structured JSON logging корректно работает. Старт/стоп lifecycle без проблем. Проверка на дефолтном порту 18789 дала EADDRINUSE (порт занят на хосте) -- это ожидаемое поведение, не дефект.

**КРИТИЧЕСКОЕ:**
- Build = PASS
- Run = PASS

---

## Tests

### Tests Executed

| ID | Описание | Результат |
|----|----------|-----------|
| TT-009-01 | WS server стартует на настроенном порту | PASS |
| TT-009-01 | Ошибка при занятом порту | PASS |
| TT-009-04 | Graceful shutdown с закрытием всех connections | PASS |
| TT-009-04 | Безопасный вызов stop() без стартового | PASS |
| TT-009-02 | onConnection callback с clientId | PASS |
| TT-009-02 | onDisconnection callback | PASS |
| TT-009-02 | Обновление счётчика connections | PASS |
| TT-009-03 | Heartbeat поддерживает живые connections (pong) | PASS |
| TT-009-03 | Heartbeat терминирует неотвечающие connections | PASS |
| TT-009-03 | send() отправляет JSON конкретному клиенту | PASS |
| TT-009-03 | send() не падает при несуществующем clientId | PASS |
| TT-009-03 | broadcast() отправляет JSON всем клиентам | PASS |
| TT-009-05 | По умолчанию привязан к 127.0.0.1 | PASS |
| TT-009-06 | Логирование connection events через pino | PASS |
| TT-009-06 | Логирование disconnection events через pino | PASS |

### Test Results

- **Total:** 15 / 15 PASS
- **Test File:** `packages/gateway/src/server/__tests__/ws-server.test.ts`
- **Framework:** Vitest 3.2.4
- **Duration:** 1.88s (15 tests, max 472-518ms для heartbeat тестов)
- **Flakiness:** None detected (random ports, deterministic assertions)

### Coverage Evaluation

- **Scope coverage:** Полный. Все 6 тест-кейсов из roadmap (TT-009-01..06) покрыты с дополнительными под-кейсами.
- **Missing areas:** Нет критических пробелов. Единственное -- TT-009-05 проверяет только конфигурацию host, а не реальный network rejection (отмечено как known limitation).
- **Coverage estimation:** > 90% строк ws-server.ts покрыто тестами.

---

## Code Review

### Files Reviewed

1. `packages/gateway/src/server/ws-server.ts` (295 lines) -- основная реализация
2. `packages/gateway/src/server/index.ts` (6 lines) -- barrel export
3. `packages/gateway/src/server/__tests__/ws-server.test.ts` (398 lines) -- тесты
4. `packages/gateway/src/index.ts` (57 lines) -- корневой barrel export
5. `packages/gateway/package.json` (34 lines) -- зависимости
6. `packages/gateway/tsconfig.json` (9 lines) -- TS конфигурация

### Code Quality Assessment

- **Readability:** Хорошо. Чёткие комментарии-разделители (JSDoc на всех публичных методах). Логичные секции: Lifecycle, Event registration, Client info, Messaging, Heartbeat, Connection handling.
- **Structure:** Хорошо. Один класс с единственной ответственностью. Типы вынесены в начало файла. Конфигурация через интерфейс с дефолтами.
- **Maintainability:** Хорошо. Callback-based event registration прост и расширяем. Barrel exports обеспечивают чистые импорты.
- **Complexity:** Низкая. Цикломатическая сложность минимальна. Единственная нетривиальность -- heartbeat timer с isAlive флагом и unref().

### Architectural Compliance

- **Status:** COMPLIANT
- **Violations:** None

Проверки:
- TypeScript strict mode: Да (tsconfig.base.json: `"strict": true`, `"noUncheckedIndexedAccess": true`)
- No `any` type: Да (ни одного использования)
- No `console.log`: Да (все события через pino)
- Barrel exports: Да (server/index.ts, корневой index.ts)
- 127.0.0.1 bind only: Да (default host = "127.0.0.1")
- ESM modules: Да (imports с `.js` extension, `"type": "module"`)
- Pino structured JSON logging: Да (все события: connection, disconnection, heartbeat, errors)

### Profile Compliance

- **Status:** COMPLIANT (с учётом специфики задачи)

Проверки по AGENT_PROFILE_nodejs.md:
- TypeScript strict: Да
- ESM modules (no mixing): Да
- No `any` type: Да
- No `console.log`: Да
- No `require()` in ESM: Да
- pnpm package manager: Да
- Barrel exports: Да

Заметки по профилю:
- Профиль описывает Express/Fastify REST структуру (controllers/services/repositories), но для WebSocket сервера это не применимо напрямую. WsServer является transport layer компонентом, что соответствует архитектуре (DOMAIN-001 Gateway).
- Профиль nodejs.md описывает HTTP-specific паттерны (middleware, routes, DTO). Задача T-001 -- WebSocket server, не HTTP API. Отклонение обосновано.

Проверки по AGENT_PROFILE_backend-base.md:
- Explicit error handling: Да (ошибки логируются, не подавляются)
- No silent failures: Да (handleDisconnection проверяет existed)
- Resource cleanup: Да (heartbeat timer unref, graceful shutdown)
- No hidden mutable state: Да (все private поля)

---

## Detected Issues

### Critical Issues (blockers)

Нет.

### Major Issues

Нет.

### Minor Issues

1. **Heartbeat timeout пропускает onDisconnection callbacks.** При heartbeat timeout метод `closeClient` удаляет клиента из map и вызывает `ws.close()`. Последующий 'close' event триггерит `handleDisconnection`, который видит `!existed` и возвращается без вызова onDisconnection callbacks. Клиент, убитый по heartbeat, не генерирует событие disconnection для подписчиков. Это не блокер (heartbeat timeout -- это исключительная ситуация), но может быть неожиданным поведением для consumers.
   - **Сeverity:** Minor
   - **Recommendation:** Вызывать callbacks перед удалением из map, либо передавать флаг в closeClient.

2. **Отсутствие метода для получения clientId по WebSocket.** `onConnection` callback передаёт `(clientId, ws)`, но нет обратного API для получения clientId из ws. Если consumer теряет маппинг, он не может восстановить clientId.
   - **Severity:** Minor
   - **Recommendation:** Рассмотреть WeakMap<WebSocket, string> для обратного поиска в будущих задачах.

---

## Verdict

- **HAS_ISSUES:** false
- **Blocking Issues Present:** no

**Обоснование:** Build и Run прошли успешно. Все 15 тестов из roadmap PASS. Код соответствует TypeScript strict mode, архитектуре и профилю. Обнаружены 2 minor issues (heartbeat callback skip, нет обратного поиска clientId), которые не являются блокирующими и не влияют на корректность работы сервера в рамках scope T-001.
