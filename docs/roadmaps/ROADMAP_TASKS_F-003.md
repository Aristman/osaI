# Task Roadmap: Observability Foundation

**Feature ID:** F-003
**Domain:** DOMAIN-010 (Observability)
**Dependencies:** F-001 (Core Infrastructure -- SQLite, pino setup)
**Git branch:** feature/F-003-observability
**Profile:** backend-typescript (Node.js + TypeScript)
**Version:** v1.0

---

## 1. Feature Overview

Базовый уровень наблюдаемости для osaI v3: pino structured JSON logging с correlation IDs, audit logging в SQLite (таблица `osai_audit_log`), trace_id propagation через все модули.

**Components:**
- S-005: Structured Logging (pino enhancement с correlation IDs)
- S-046: Audit Logging (SQLite persistence)
- S-042: 7-Layer Security -- Layer 7: Audit

**Related Requirements:** FR-023 (Audit completeness), FR-024 (Structured logging)

**Out of scope (V1):** OpenTelemetry traces/metrics, Prometheus endpoint

---

## 2. Dependencies

### 2.1 Feature Dependencies

- **F-001:** Core Infrastructure (blocking) -- SQLite DB (osai.db), pino initial setup, package structure `packages/observability/`

### 2.2 Task Dependencies

- **T-001** -- нет зависимостей
- **T-002** -- нет зависимостей
- **T-003** -- зависит от T-001, T-002 (blocking)
- **T-004** -- зависит от T-003 (blocking)

### 2.3 Development Order

```
T-001 (TraceContext)  +  T-002 (LoggerFactory)  -- параллельно
    \                       /
     v                     v
         T-003 (AuditService)
                |
                v
         T-004 (AuditLogRepository + Integration)
```

---

## 3. Task Breakdown

---

### Task T-001: TraceContext -- trace_id propagation

**Domain:** DOMAIN-010 | **Dependencies:** None
**Estimated Time:** 2-3 hours

**Description:**
Модуль для управления контекстом трассировки. Генерация trace_id, propagation через AsyncLocalStorage, создание child spans. Является фундаментом для связывания логов и audit записей в единую цепочку.

**Scope:**
- **In scope:** TraceContext class, trace_id generation (UUID v4), AsyncLocalStorage provider, child span creation, runInContext helper
- **Out scope:** OpenTelemetry integration, span export, distributed tracing

#### Checklist
- [ ] CODE: `packages/observability/src/trace-context.ts`
- [ ] CODE: `packages/observability/src/types.ts` (AuditEntry, TraceSpan interfaces)
- [ ] CODE: `packages/observability/src/index.ts` (barrel export)
- [ ] TEST: `packages/observability/src/__tests__/trace-context.test.ts`
- [ ] BUILD: `pnpm --filter @osai/observability build`

#### Acceptance
- TraceContext.create() генерирует уникальный trace_id (UUID v4)
- runInContext(ctx, fn) устанавливает контекст через AsyncLocalStorage
- TraceContext.current() возвращает активный контекст внутри runInContext
- child() создаёт дочерний span с parent_span_id
- Все тесты проходят (`pnpm --filter @osai/observability test`)

---

### Task T-002: LoggerFactory -- pino с correlation IDs

**Domain:** DOMAIN-010 | **Dependencies:** None
**Estimated Time:** 2-3 hours

**Description:**
Фабрика для создания pino logger instances с автоматической инъекцией correlation IDs (trace_id, span_id) из TraceContext. Конфигурация: JSON output, уровни, transport в stdout + файл.

**Scope:**
- **In scope:** LoggerFactory, pino child logger с bindings, auto-inject trace_id/span_id через pino mixin, config-based log level, file transport
- **Out scope:** Log rotation (use external), structured error serialization enhancements

#### Checklist
- [ ] CODE: `packages/observability/src/logger-factory.ts`
- [ ] CODE: `packages/observability/src/pino-mixin.ts` (correlation ID injection)
- [ ] TEST: `packages/observability/src/__tests__/logger-factory.test.ts`
- [ ] TEST: `packages/observability/src/__tests__/pino-mixin.test.ts`
- [ ] BUILD: `pnpm --filter @osai/observability build`

#### Acceptance
- LoggerFactory.create() возвращает pino logger с JSON output
- Каждое log-сообщение содержит `trace_id` и `span_id` при активном TraceContext
- Логи без контекста содержат пустые trace_id/span_id (или отсутствуют)
- Уровень логирования конфигурируется (info по умолчанию)
- Формат: `{"level":30,"time":...,"trace_id":"...","span_id":"...","msg":"..."}`
- Все тесты проходят

---

### Task T-003: AuditService -- бизнес-логика аудита

**Domain:** DOMAIN-010 | **Dependencies:** T-001, T-002 (blocking)
**Estimated Time:** 3-4 hours

**Description:**
Сервис для записи audit логов. Обеспечивает логирование всех действий агента (tool calls, permission requests, file access). Принимает структурированные audit entry, обогащает trace_id из контекста, делегирует persist в AuditLogRepository.

**Scope:**
- **In scope:** AuditService с методами log(), query(), cleanup(), обогащение trace_id, валидация entry
- **Out scope:** Audit UI, real-time audit streaming, audit export

#### Checklist
- [ ] CODE: `packages/observability/src/audit-service.ts`
- [ ] CODE: `packages/observability/src/audit-types.ts` (AuditAction enum, AuditEntry interface)
- [ ] CODE: `packages/observability/src/__tests__/audit-service.test.ts`
- [ ] BUILD: `pnpm --filter @osai/observability build`

#### Acceptance
- auditService.log(entry) сохраняет запись с auto-enriched trace_id из TraceContext
- auditService.log(entry) логирует через pino logger (level: info)
- Поддерживаемые действия: TOOL_CALL, PERMISSION_REQUEST, PERMISSION_RESPONSE, FILE_ACCESS, SHELL_EXEC, AGENT_START, AGENT_END, ERROR
- entry содержит: session_id, chat_id, trace_id, action, tool_name, skill_name, params, result, user_decision, risk_level
- Валидация: обязательные поля (action, trace_id)
- Все тесты проходят

---

### Task T-004: AuditLogRepository -- SQLite persistence + integration

**Domain:** DOMAIN-010 | **Dependencies:** T-003 (blocking)
**Estimated Time:** 3-4 hours

**Description:**
Репозиторий для сохранения audit записей в SQLite (таблица `osai_audit_log`). Реализация CRUD операций, query с фильтрами, cleanup по TTL. Интеграция: AuditService использует репозиторий через DI.

**Scope:**
- **In scope:** AuditLogRepository (create, query, cleanup), SQL schema для osai_audit_log, индексы, DI wiring
- **Out scope:** Миграции (создание таблицы -- в F-001), Prometheus metrics, audit dashboard

#### Checklist
- [ ] CODE: `packages/observability/src/audit-repository.ts`
- [ ] CODE: `packages/observability/src/sql/audit-schema.sql` (reference schema, таблица создаётся в F-001)
- [ ] CODE: `packages/observability/src/index.ts` (update barrel export)
- [ ] TEST: `packages/observability/src/__tests__/audit-repository.test.ts` (in-memory SQLite)
- [ ] TEST: `packages/observability/src/__tests__/integration.test.ts` (AuditService + Repository)
- [ ] BUILD: `pnpm --filter @osai/observability build`

#### Acceptance
- auditRepository.create(entry) вставляет запись в osai_audit_log
- auditRepository.query({session_id, action, from, to, limit}) возвращает отфильтрованные записи
- auditRepository.cleanup(olderThan) удаляет записи старше указанной даты
- Таблица osai_audit_log: id INTEGER PK, session_id TEXT, chat_id TEXT, timestamp TEXT, trace_id TEXT, action TEXT, tool_name TEXT, skill_name TEXT, params TEXT (JSON), result TEXT (JSON), user_decision TEXT, risk_level TEXT
- Индексы: idx_audit_trace_id (trace_id), idx_audit_session_id (session_id), idx_audit_timestamp (timestamp)
- AuditService принимает AuditLogRepository через конструктор (DI)
- Интеграционный тест: log() -> запись появляется в SQLite -> query() находит запись
- Все тесты проходят

---

## 4. Test Strategy (TDD)

### 4.1 Test Types per Task

| Task | Unit Tests | Integration Tests | Build Verification |
|------|-----------|-------------------|-------------------|
| T-001 | trace-context.test.ts | -- | pnpm build |
| T-002 | logger-factory.test.ts, pino-mixin.test.ts | -- | pnpm build |
| T-003 | audit-service.test.ts | -- | pnpm build |
| T-004 | audit-repository.test.ts | integration.test.ts | pnpm build |

### 4.2 Build and Run Verification

**Build Verification:**
```bash
cd /path/to/osai
pnpm --filter @osai/observability build
```
- Ожидаемый результат: сборка без ошибок TypeScript
- Критерий: exit code 0, `dist/` содержит скомпилированные файлы

**Test Verification:**
```bash
cd /path/to/osai
pnpm --filter @osai/observability test
```
- Ожидаемый результат: все тесты проходят
- Критерий: exit code 0, 0 failures

### 4.3 Test Cases per Task

#### T-001: TraceContext

| ID | Description | Preconditions | Expected | Pass Criteria |
|----|-------------|---------------|----------|---------------|
| TC-001-01 | create() генерирует UUID v4 | Module imported | trace_id формата UUID v4, не пустой | Регулярка UUID match |
| TC-001-02 | runInContext устанавливает контекст | TraceContext создан | TraceContext.current() возвращает тот же trace_id внутри callback | ID совпадает |
| TC-001-03 | current() вне контекста | Без runInContext | Возвращает null или undefined | Null/undefined |
| TC-001-04 | child() создаёт дочерний span | Родительский контекст активен | child.span_id != parent.span_id, child.parent_span_id == parent.span_id | ID связи корректны |
| TC-001-05 | Вложенные контексты не конфликтуют | runInContext внутри runInContext | Внутренний контекст переопределяет внешний | current() возвращает внутренний |

#### T-002: LoggerFactory

| ID | Description | Preconditions | Expected | Pass Criteria |
|----|-------------|---------------|----------|---------------|
| TC-002-01 | create() возвращает pino logger | Module imported | logger имеет метод info, error, warn, debug | typeof logger.info === 'function' |
| TC-002-02 | JSON output формат | LoggerFactory.create() | JSON строка с полями level, time, msg | JSON.parse() успешен |
| TC-002-03 | trace_id инжектится из контекста | runInContext активен | log содержит trace_id из TraceContext | trace_id совпадает |
| TC-002-04 | trace_id отсутствует без контекста | Без runInContext | trace_id пустой или отсутствует | Не выбрасывает ошибку |
| TC-002-05 | Конфигурация уровня логирования | level: 'debug' | debug-сообщения проходят | logger.debug() не bị filtered |
| TC-002-06 | child() logger наследует корреляцию | Parent logger в контексте | Child logger содержит те же trace_id/span_id | ID совпадают |

#### T-003: AuditService

| ID | Description | Preconditions | Expected | Pass Criteria |
|----|-------------|---------------|----------|---------------|
| TC-003-01 | log() вызывает repository | AuditService с mock repo | repository.create вызван 1 раз с enriched entry | Call count === 1 |
| TC-003-02 | log() обогащает trace_id | runInContext с trace_id | entry.trace_id из контекста | trace_id совпадает |
| TC-003-03 | log() логирует через pino | AuditService с logger | logger.info вызван с audit data | Call count >= 1 |
| TC-003-04 | Валидация обязательных полей | entry без action | Выбрасывает ошибку валидации | Error thrown |
| TC-003-05 | query() делегирует в repository | AuditService с mock repo | repository.query вызван с фильтрами | Args match |
| TC-003-06 | cleanup() делегирует в repository | AuditService с mock repo | repository.cleanup вызван | Call count === 1 |
| TC-003-07 | Все AuditAction enum значения | AuditAction enum | Содержит 8 значений (TOOL_CALL, PERMISSION_REQUEST, etc.) | Enum size === 8 |

#### T-004: AuditLogRepository

| ID | Description | Preconditions | Expected | Pass Criteria |
|----|-------------|---------------|----------|---------------|
| TC-004-01 | create() вставляет запись | In-memory SQLite, таблица создана | Запись в osai_audit_log с корректными полями | SELECT возвращает запись |
| TC-004-02 | query() по trace_id | 3 записи, 1 с целевым trace_id | Возвращает 1 запись | Length === 1 |
| TC-004-03 | query() по session_id | Записи с разными session_id | Фильтрует корректно | Только целевые записи |
| TC-004-04 | query() с временным фильтром | Записи за 3 дня | from/to фильтруют правильно | Count match |
| TC-004-05 | query() с limit | 10 записей | Возвращает не более limit | Length <= limit |
| TC-004-06 | cleanup() удаляет старые | 5 записей, 2 старые | Удаляет только старые | Remaining === 3 |
| TC-004-07 | Интеграция: log() -> query() | AuditService + Repository + SQLite | Запись доступна через query после log() | Round-trip success |
| TC-004-08 | Индексы ускоряют запрос | 1000+ записей | query по trace_id < 50ms | Performance assertion |

---

## 5. Implementation Plan per Task

### T-001: TraceContext
1. Определить интерфейсы: `TraceContext`, `TraceSpan` в `types.ts`
2. Реализовать TraceContext с `AsyncLocalStorage` для propagation
3. Реализовать `runInContext(ctx, fn)` -- устанавливает контекст
4. Реализовать `current()` -- получение активного контекста
5. Реализовать `child()` -- создание дочернего span
6. Barrel export в `index.ts`

### T-002: LoggerFactory
1. Создать pino mixin для инъекции trace_id/span_id из AsyncLocalStorage
2. Реализовать LoggerFactory с конфигурацией (level, transport)
3. Настроить pino child bindings для корреляции
4. Реализовать create() -- фабричный метод
5. Конфигурация: JSON stdout + опциональный file transport

### T-003: AuditService
1. Определить AuditAction enum и AuditEntry interface
2. Реализовать AuditService с DI-конструктором (AuditLogRepository, Logger)
3. Реализовать log(): валидация entry -> обогащение trace_id -> repository.create() -> logger.info()
4. Реализовать query(): делегирование в repository с фильтрами
5. Реализовать cleanup(): делегирование в repository

### T-004: AuditLogRepository
1. Определить SQL schema reference для osai_audit_log
2. Реализовать create(entry): INSERT с параметризацией
3. Реализовать query(filters): SELECT с WHERE + ORDER BY + LIMIT
4. Реализовать cleanup(olderThan): DELETE с WHERE timestamp < ?
5. Обновить barrel export
6. Интеграционный тест: full round-trip (TraceContext + Logger + AuditService + Repository)

---

## 6. Acceptance Criteria per Task

| Task | Критерии |
|------|----------|
| T-001 | trace_id генерируется (UUID v4); runInContext/current/child работают; все тесты проходят; build успешен |
| T-002 | pino logger создаётся с JSON output; correlation IDs auto-inject; все тесты проходят; build успешен |
| T-003 | AuditService.log() обогащает trace_id и логирует; query/cleanup делегируют; все тесты проходят; build успешен |
| T-004 | CRUD в SQLite работает; query с фильтрами; cleanup по TTL; интеграционный тест round-trip; build успешен |

---

## 7. Quality Expectations

- **Coverage:** >= 90% для TraceContext, LoggerFactory, AuditService; >= 80% для AuditLogRepository
- **Task time:** 2-4 часа каждая
- **Build stability:** нулевые ошибки TypeScript (strict mode)
- **Test framework:** vitest
- **Profile compliance:** backend-typescript (TypeScript strict, no `any`, pino for logging)

---

## 8. Risks and Edge Cases

| Риск | Вероятность | Митигация |
|------|-------------|-----------|
| AsyncLocalStorage не доступен в target Node.js version | Низкая | Node.js 22.16+ имеет стабильный AsyncLocalStorage |
| osai_audit_log таблица не создана (F-001 не завершена) | Средняя | T-004 включает reference schema; при отсутствии таблицы -- информативная ошибка |
| Audit log растёт без ограничений | Средняя | cleanup() по TTL; рекомендация по cron/periodic cleanup в документации |
| params/result JSON serialisation больших объектов | Низкая | Ограничить размер params/result при записи (truncate > 10KB) |
| Circular references в params при JSON.stringify | Низкая | Safe JSON stringify (replacer или try/catch) |

---

## 9. Notes

- F-001 создаёт таблицу `osai_audit_log` при инициализации DB; T-004 только использует её
- pino initial setup из F-001: базовый pino logger; T-002 расширяет его через mixin + factory
- TraceContext предназначен для использования всеми модулями (agent, gateway, providers, memory)
- API keys и секреты НЕ логируются (NFR-S03)
- Audit completeness (NFR-O04): 100% tool calls, permission requests, file access

---

**Версия:** v1.0
**Дата создания:** 2026-03-30
**Автор:** TDD Planner Agent
**Статус:** Завершён
