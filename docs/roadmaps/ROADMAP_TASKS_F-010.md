# Task Roadmap: Observability — OpenTelemetry + Audit + Prometheus

**Version:** v1.0
**Generated:** 2026-03-24
**Feature ID:** F-010
**Git branch:** feature/observability

---

## 1. Feature Overview

- **Feature ID:** F-010
- **Feature Name:** Observability — OpenTelemetry + Audit + Prometheus
- **Feature Description:** Полная observability система: OpenTelemetry SDK integration (traces для agent loop, model inference, tool calls, memory queries; metrics: tokens, cost, latency, success rate), structured logging (pino с correlation IDs), audit log (SQLite, immutable, queryable via REST API), Prometheus exporter, exporters (Console, File, Jaeger/Zipkin). REST API для query traces, metrics, audit.
- **Domain:** observability
- **Related Requirements:** FR-045-FR-049, NFR-004, NFR-031-NFR-034
- **Dependencies:** F-002 (Gateway), F-004 (Agent Runtime)
- **Priority:** Should Have (V1)

### Related Requirements Summary

| Req ID | Description |
|--------|-------------|
| FR-045 | OpenTelemetry SDK setup (traces, resource attributes, span hierarchy) |
| FR-046 | Metrics system (counters, histograms, gauges для agent/skills/memory/session) |
| FR-047 | Prometheus exporter (metrics endpoint на настраиваемом порту) |
| FR-048 | Audit log (SQLite, immutable records, REST API query) |
| FR-049 | Structured logging (pino, JSON format, correlation IDs) |
| NFR-004 | OTel overhead < 5% CPU/memory |
| NFR-031 | Trace correlation via trace_id across all components |
| NFR-032 | Audit immutability (no DELETE via API) |
| NFR-033 | Metrics naming convention (osai.* prefix) |
| NFR-034 | Log rotation и retention policy |

---

## 2. Dependencies

### 2.1 Feature Dependencies

- **F-002: Gateway (WS Control Plane)** (blocking)
  - Требуется для audit trail координации (permission requests)
  - Требуется для интеграции REST API через Gateway HTTP server
  - Требуется для trace_id propagation в WS messages

- **F-004: Agent Runtime** (blocking)
  - Требуется для span создания (agent loop phases)
  - Требуется для metrics collection (tokens, latency, cost)
  - Требуется для hook интеграции (instrumentation points)

### 2.2 Task Dependencies

```
T-001 (OpenTelemetry SDK Setup)
    ├── T-002 (Structured Logging — использует trace context)
    ├── T-003 (Metrics System — использует OTel metrics API)
    └── T-005 (Trace Exporters — требует OTel SDK)

T-003 (Metrics System)
    └── T-004 (Prometheus Exporter)

T-001 (OpenTelemetry SDK Setup)
    └── T-006 (Audit Log — использует trace_id)

T-006 (Audit Log)
    └── T-007 (Observability REST API)

Independent: T-008 (Integration Tests) — зависит от T-001..T-007
```

### 2.3 Development Order

**Phase 1 (Sequential):**
1. T-001 OpenTelemetry SDK Setup — база для всех остальных задач

**Phase 2 (Parallel up to 3):**
2. T-002 Structured Logging
3. T-003 Metrics System
4. T-006 Audit Log (может начинаться параллельно)

**Phase 3 (Sequential after Phase 2):**
5. T-004 Prometheus Exporter (требует T-003)
6. T-005 Trace Exporters (требует T-001)

**Phase 4 (Sequential after Phase 3):**
7. T-007 Observability REST API (требует T-006)

**Phase 5 (Final):**
8. T-008 Integration Tests

---

## 3. Task Breakdown

---

### Task T-001: OpenTelemetry SDK Setup

**Description:**
Настройка OpenTelemetry SDK для Node.js: создание tracer provider, resource attributes, span processors, context propagation. Инициализация при старте приложения.

**Estimated Time:** 3-4 hours

**Dependencies:** None

**Scope:**
- **In scope:**
  - Установка @opentelemetry/sdk-node и dependencies
  - Создание NodeTracerProvider с resource attributes
  - Resource attributes: service.name=osai, service.version, service.instance.id
  - Span processors (batching, sampling)
  - Context propagation (W3C trace context)
  - ObservabilityConfig interface
  - Глобальная инициализация (before other imports)
  - Shutdown handler (flush pending spans)

- **Out scope:**
  - Конкретные exporters (T-005)
  - Span creation в agent loop (интеграция с F-004)
  - Metrics SDK (T-003)

---

### Task T-002: Structured Logging — pino Setup

**Description:**
Настройка structured logging через pino: JSON format, correlation IDs (trace_id), log levels, log rotation, pretty printing для dev.

**Estimated Time:** 2-3 hours

**Dependencies:** T-001 (для trace context extraction)

**Scope:**
- **In scope:**
  - Pino logger creation с базовыми fields
  - Correlation IDs (trace_id, session_id из OTel context)
  - Log levels configuration (error, warn, info, debug, trace)
  - Pretty printing для development (pino-pretty)
  - Log rotation setup (file transport)
  - Logger interface для других пакетов
  - Child loggers с context

- **Out scope:**
  - Audit log (отдельная таблица, T-006)
  - Log shipping в external systems
  - Log aggregation (ELK, Loki)

---

### Task T-003: Metrics System — Counters, Histograms, Gauges

**Description:**
Реализация metrics system через OTel Metrics API: counters, histograms, gauges для agent loop, skills, memory, sessions.

**Estimated Time:** 3-4 hours

**Dependencies:** T-001 (OTel SDK)

**Scope:**
- **In scope:**
  - MeterProvider configuration
  - Counter metrics:
    - `osai.agent.llm.tokens_input`
    - `osai.agent.llm.tokens_output`
    - `osai.agent.llm.cost_usd`
    - `osai.agent.tool_call.total`
    - `osai.agent.tool_call.errors`
    - `osai.sandbox.violations`
  - Histogram metrics:
    - `osai.agent.session.duration_ms`
    - `osai.agent.tool_call.duration_ms`
    - `osai.agent.llm.duration_ms`
    - `osai.memory.query.duration_ms`
  - Gauge metrics:
    - `osai.memory.entries.total`
    - `osai.session.active`
  - MetricsRegistry класс
  - Helper functions для recording

- **Out scope:**
  - Prometheus exporter (T-004)
  - Custom dashboards
  - Alerting rules

---

### Task T-004: Prometheus Exporter

**Description:**
Настройка Prometheus exporter: HTTP endpoint (/metrics), metrics exposition format, configurable port.

**Estimated Time:** 2-3 hours

**Dependencies:** T-003 (Metrics System)

**Scope:**
- **In scope:**
  - PrometheusExporter configuration
  - HTTP endpoint на настраиваемом порту (default: 9090)
  - /metrics path handler
  - Prometheus exposition format
  - Metrics scraping optimization
  - Configurable metrics prefix
  - Graceful shutdown

- **Out scope:**
  - Grafana dashboards
  - Alertmanager integration
  - Custom metric aggregations

---

### Task T-005: Trace Exporters — Console, File, Jaeger/Zipkin, OTLP

**Description:**
Реализация trace exporters: Console (debug), File (persistent), Jaeger/Zipkin (external), OTLP (generic). Configuration-based exporter selection.

**Estimated Time:** 3-4 hours

**Dependencies:** T-001 (OTel SDK)

**Scope:**
- **In scope:**
  - ConsoleSpanExporter (debug mode)
  - FileSpanExporter (JSON lines, rotation)
  - JaegerExporter (HTTP/UDP transport)
  - ZipkinExporter (v2 protobuf/JSON)
  - OTLPTraceExporter (gRPC/HTTP)
  - Exporter configuration (via ObservabilityConfig)
  - Multi-exporter support
  - Exporter health check

- **Out scope:**
  - Custom sampling strategies
  - Trace aggregation
  - Trace-based alerting

---

### Task T-006: Audit Log — SQLite Backend

**Description:**
Реализация audit log: SQLite таблица, immutable records, CRUD API, query interface, retention policy.

**Estimated Time:** 3-4 hours

**Dependencies:** T-001 (для trace_id correlation)

**Scope:**
- **In scope:**
  - SQLite таблица `audit_log`
  - Schema: id, session_id, timestamp, trace_id, action, tool_name, skill_name, params (JSON), result (JSON), user_decision, risk_level, sandbox_checked
  - AuditRepository класс
  - Immutable records (no UPDATE/DELETE operations)
  - Query API (filter by session, action, time range)
  - Retention policy configuration
  - Insert-only interface
  - Batch insert optimization

- **Out scope:**
  - REST API endpoints (T-007)
  - Audit log visualization
  - Audit log export

---

### Task T-007: Observability REST API

**Description:**
REST API для query traces, metrics, audit log. Endpointы для Dashboard и CLI.

**Estimated Time:** 3-4 hours

**Dependencies:** T-006 (Audit Log)

**Scope:**
- **In scope:**
  - GET /api/v1/observability/audit
    - Query params: session_id, action, from, to, limit, offset
    - Response: paginated audit records
  - GET /api/v1/observability/traces
    - Query params: trace_id, session_id, from, to, limit
    - Response: trace spans (simplified)
  - GET /api/v1/observability/metrics
    - Prometheus-compatible metrics exposition
  - Error handling и validation
  - Authentication bypass (local-only)

- **Out scope:**
  - Real-time streaming API
  - WebSocket subscriptions
  - Complex aggregations

---

### Task T-008: Integration Tests

**Description:**
Integration tests для observability: trace propagation, metric accuracy, audit completeness, end-to-end scenarios.

**Estimated Time:** 3-4 hours

**Dependencies:** T-001..T-007 (все предыдущие задачи)

**Scope:**
- **In scope:**
  - Trace propagation test (request -> agent -> tool -> audit)
  - Metric recording accuracy test
  - Audit log completeness test
  - Prometheus endpoint scraping test
  - Log format validation test
  - Shutdown flush test
  - Error scenario tests
  - Performance overhead test (< 5% CPU/memory)

- **Out scope:**
  - Load testing
  - Stress testing
  - External exporter tests (Jaeger/Zipkin)

---

## 4. Test Strategy (TDD)

### 4.1 Test Types per Task

| Task | Unit Tests | Integration Tests | Build & Run |
|------|------------|-------------------|-------------|
| T-001 OpenTelemetry SDK Setup | Yes | No | Yes |
| T-002 Structured Logging | Yes | Yes | Yes |
| T-003 Metrics System | Yes | No | Yes |
| T-004 Prometheus Exporter | Yes | Yes | Yes |
| T-005 Trace Exporters | Yes | Yes | Yes |
| T-006 Audit Log | Yes | Yes | Yes |
| T-007 Observability REST API | Yes | Yes | Yes |
| T-008 Integration Tests | No | Yes | Yes |

### 4.2 Build and Run Verification

**Build Verification:**
- Команда: `pnpm --filter @osai/observability build`
- Ожидаемый результат: успешная компиляция TypeScript без ошибок
- Критерии успеха: 0 errors, 0 warnings (или только acceptable warnings)

**Run Verification:**
- Команда: `pnpm test --filter @osai/observability`
- Ожидаемый результат: все тесты проходят
- Базовая проверка: import ObservabilityManager без ошибок

**Integration Verification:**
- Команда: `pnpm test tests/integration/observability/`
- Ожидаемый результат: trace propagation, metric accuracy tests pass

### 4.3 Test Cases per Task

---

#### Task T-001: OpenTelemetry SDK Setup

**TC-T001-01: Provider initialization**
- **Description:** Проверка создания NodeTracerProvider
- **Preconditions:** OTel packages установлены
- **Steps:**
  1. Вызвать initObservability(config)
  2. Проверить trace.getTracerProvider()
- **Expected result:** TracerProvider инициализирован
- **Pass criteria:** Provider exists, resource attributes set

**TC-T001-02: Resource attributes**
- **Description:** Проверка resource attributes
- **Preconditions:** Provider инициализирован
- **Steps:**
  1. Получить resource из provider
  2. Проверить attributes
- **Expected result:** service.name=osai, service.version set
- **Pass criteria:** Все обязательные attributes присутствуют

**TC-T001-03: Shutdown flush**
- **Description:** Проверка корректного shutdown
- **Preconditions:** Provider инициализирован, spans created
- **Steps:**
  1. Создать span
  2. Вызвать shutdown()
  3. Проверить что spans exported
- **Expected result:** Все pending spans flushed
- **Pass criteria:** No spans lost

---

#### Task T-002: Structured Logging

**TC-T002-01: Logger creation**
- **Description:** Проверка создания pino logger
- **Preconditions:** Pino установлен
- **Steps:**
  1. Вызвать createLogger(config)
  2. Проверить logger instance
- **Expected result:** Logger создан с правильными fields
- **Pass criteria:** Logger.info() работает

**TC-T002-02: Correlation ID**
- **Description:** Проверка trace_id в logs
- **Preconditions:** Active span context
- **Steps:**
  1. Start span
  2. Log message
  3. Check log output
- **Expected result:** trace_id присутствует в log entry
- **Pass criteria:** trace_id matches span context

**TC-T002-03: Child logger**
- **Description:** Проверка child logger с context
- **Preconditions:** Base logger создан
- **Steps:**
  1. Создать child logger с {component: 'agent'}
  2. Log message
  3. Check log output
- **Expected result:** component field в log entry
- **Pass criteria:** Child fields merged correctly

---

#### Task T-003: Metrics System

**TC-T003-01: Counter increment**
- **Description:** Проверка counter metric
- **Preconditions:** MeterProvider инициализирован
- **Steps:**
  1. Получить counter
  2. Вызвать add(1, attributes)
  3. Проверить metric value
- **Expected result:** Counter увеличен на 1
- **Pass criteria:** Value = 1 after increment

**TC-T003-02: Histogram recording**
- **Description:** Проверка histogram metric
- **Preconditions:** MeterProvider инициализирован
- **Steps:**
  1. Получить histogram
  2. Записать значение 100ms
  3. Проверить bucket distribution
- **Expected result:** Value в правильном bucket
- **Pass criteria:** Histogram aggregates correctly

**TC-T003-03: Gauge value**
- **Description:** Проверка gauge metric
- **Preconditions:** MeterProvider инициализирован
- **Steps:**
  1. Получить observable gauge
  2. Set callback to return 5
  3. Observe value
- **Expected result:** Gauge возвращает 5
- **Pass criteria:** Correct value observed

---

#### Task T-004: Prometheus Exporter

**TC-T004-01: Metrics endpoint**
- **Description:** Проверка /metrics endpoint
- **Preconditions:** Prometheus exporter запущен
- **Steps:**
  1. HTTP GET to /metrics
  2. Parse response
- **Expected result:** Prometheus format metrics
- **Pass criteria:** Valid Prometheus exposition format

**TC-T004-02: Metric naming**
- **Description:** Проверка metric naming convention
- **Preconditions:** Metrics записаны
- **Steps:**
  1. Scrape /metrics
  2. Check metric names
- **Expected result:** Все metrics с prefix osai_
- **Pass criteria:** osai_agent_llm_tokens_input exists

**TC-T004-03: Graceful shutdown**
- **Description:** Проверка shutdown exporter
- **Preconditions:** Exporter активен
- **Steps:**
  1. Stop exporter
  2. Try to connect
- **Expected result:** Connection refused after shutdown
- **Pass criteria:** Port freed after shutdown

---

#### Task T-005: Trace Exporters

**TC-T005-01: Console exporter**
- **Description:** Проверка console exporter
- **Preconditions:** Console exporter configured
- **Steps:**
  1. Create span
  2. Force flush
  3. Check console output
- **Expected result:** Span в console output
- **Pass criteria:** Valid JSON span в stdout

**TC-T005-02: File exporter**
- **Description:** Проверка file exporter
- **Preconditions:** File exporter configured
- **Steps:**
  1. Create multiple spans
  2. Force flush
  3. Read file
- **Expected result:** Spans в файле
- **Pass criteria:** JSON lines format, all spans present

**TC-T005-03: OTLP exporter config**
- **Description:** Проверка OTLP exporter configuration
- **Preconditions:** OTLP endpoint configured
- **Steps:**
  1. Configure OTLP exporter
  2. Create span
  3. Check export attempt
- **Expected result:** Export request sent
- **Pass criteria:** Valid OTLP request format

---

#### Task T-006: Audit Log

**TC-T006-01: Insert audit record**
- **Description:** Проверка вставки audit record
- **Preconditions:** SQLite DB initialized
- **Steps:**
  1. Вызвать auditLog.insert(entry)
  2. Query record
- **Expected result:** Record inserted
- **Pass criteria:** Record exists with correct fields

**TC-T006-02: Immutability**
- **Description:** Проверка immutable records
- **Preconditions:** Audit record exists
- **Steps:**
  1. Попробовать UPDATE
  2. Попробовать DELETE
- **Expected result:** Operations rejected
- **Pass criteria:** No changes to record

**TC-T006-03: Query by session**
- **Description:** Проверка query by session_id
- **Preconditions:** Multiple records для разных sessions
- **Steps:**
  1. Query auditLog.findBySession(session_id)
  2. Check results
- **Expected result:** Только records для session
- **Pass criteria:** Correct filtering

**TC-T006-04: Query by time range**
- **Description:** Проверка query by time range
- **Preconditions:** Records за разные периоды
- **Steps:**
  1. Query auditLog.findByTimeRange(from, to)
  2. Check results
- **Expected result:** Records в диапазоне
- **Pass criteria:** Correct time filtering

---

#### Task T-007: Observability REST API

**TC-T007-01: GET /api/v1/observability/audit**
- **Description:** Проверка audit API endpoint
- **Preconditions:** Audit records exist
- **Steps:**
  1. GET /api/v1/observability/audit
  2. Parse response
- **Expected result:** JSON array audit records
- **Pass criteria:** Valid JSON, records present

**TC-T007-02: Audit pagination**
- **Description:** Проверка pagination
- **Preconditions:** 100+ audit records
- **Steps:**
  1. GET /api/v1/observability/audit?limit=10&offset=0
  2. GET /api/v1/observability/audit?limit=10&offset=10
- **Expected result:** Разные records на страницах
- **Pass criteria:** Correct pagination

**TC-T007-03: GET /api/v1/observability/traces**
- **Description:** Проверка traces API endpoint
- **Preconditions:** Traces exist
- **Steps:**
  1. GET /api/v1/observability/traces?trace_id=xxx
  2. Parse response
- **Expected result:** JSON trace spans
- **Pass criteria:** Valid trace structure

**TC-T007-04: GET /api/v1/observability/metrics**
- **Description:** Проверка metrics API endpoint
- **Preconditions:** Metrics recorded
- **Steps:**
  1. GET /api/v1/observability/metrics
  2. Check format
- **Expected result:** Prometheus format metrics
- **Pass criteria:** Valid exposition format

---

#### Task T-008: Integration Tests

**TC-T008-01: End-to-end trace propagation**
- **Description:** Проверка trace propagation через весь stack
- **Preconditions:** Все компоненты запущены
- **Steps:**
  1. Send message through Gateway
  2. Agent processes message
  3. Tool executes
  4. Audit record created
  5. Check trace_id consistency
- **Expected result:** Один trace_id через все components
- **Pass criteria:** Same trace_id in all spans and audit

**TC-T008-02: Metric accuracy**
- **Description:** Проверка accuracy metrics
- **Preconditions:** Agent loop executed
- **Steps:**
  1. Execute 10 tool calls
  2. Check osai_agent_tool_call_total
  3. Check histogram buckets
- **Expected result:** Correct metric values
- **Pass criteria:** Counter = 10, histogram correct

**TC-T008-03: Audit completeness**
- **Description:** Проверка completeness audit log
- **Preconditions:** Operations executed
- **Steps:**
  1. Execute permission request
  2. User approves/denies
  3. Check audit record
- **Expected result:** Audit contains user_decision
- **Pass criteria:** Complete audit trail

**TC-T008-04: Overhead verification**
- **Description:** Проверка overhead < 5%
- **Preconditions:** Observability enabled
- **Steps:**
  1. Measure baseline (observability disabled)
  2. Measure with observability
  3. Calculate overhead
- **Expected result:** Overhead < 5%
- **Pass criteria:** CPU/memory overhead acceptable

---

## 5. Implementation Plan per Task

### Task T-001: OpenTelemetry SDK Setup

**Logical Steps:**
1. Установить dependencies:
   - @opentelemetry/sdk-node
   - @opentelemetry/resources
   - @opentelemetry/semantic-conventions
   - @opentelemetry/context-async-hooks
2. Создать packages/observability/src/sdk/
3. Реализовать initObservability(config: ObservabilityConfig)
4. Создать NodeTracerProvider с Resource
5. Настроить BatchSpanProcessor
6. Register provider globally
7. Добавить shutdown handler

**Constraints from Architecture:**
- Инициализация ДО других imports (OTel requirement)
- Resource attributes: service.name=osai
- Sampling: 10% в production mode

**Integration Points:**
- packages/gateway — инициализация при старте
- packages/agent — получение tracer instance

---

### Task T-002: Structured Logging

**Logical Steps:**
1. Установить pino, pino-pretty
2. Создать packages/observability/src/logging/
3. Реализовать createLogger(config: LoggingConfig)
4. Добавить correlation middleware (extract trace_id from context)
5. Реализовать child logger pattern
6. Настроить file transport (rotation)
7. Экспортировать logger factory

**Constraints from Architecture:**
- JSON format в production
- Pretty printing в development
- Levels: error, warn, info, debug, trace

**Integration Points:**
- Все packages используют logger из observability

---

### Task T-003: Metrics System

**Logical Steps:**
1. Установить @opentelemetry/sdk-metrics
2. Создать packages/observability/src/metrics/
3. Реализовать MetricsRegistry класс
4. Создать counter helpers (incrementTokenInput, incrementToolCall, etc.)
5. Создать histogram helpers (recordLatency, etc.)
6. Создать gauge callbacks (getActiveSessions, getMemoryEntries)
7. Экспортировать metrics helpers

**Constraints from Architecture:**
- Prefix: osai.*
- Units: ms для durations, 1 для counts

**Integration Points:**
- packages/agent — recording LLM metrics
- packages/skills-core — recording tool metrics
- packages/memory — recording query metrics

---

### Task T-004: Prometheus Exporter

**Logical Steps:**
1. Установить @opentelemetry/exporter-prometheus
2. Создать packages/observability/src/exporters/
3. Реализовать createPrometheusExporter(config)
4. Настроить HTTP server на configurable port
5. Добавить /metrics endpoint handler
6. Интегрировать с MeterProvider
7. Добавить graceful shutdown

**Constraints from Architecture:**
- Default port: 9090
- Metrics path: /metrics

**Integration Points:**
- Config через ObservabilityConfig
- Prometheus scrapes /metrics

---

### Task T-005: Trace Exporters

**Logical Steps:**
1. Установить exporters:
   - @opentelemetry/exporter-trace-otlp-http
   - @opentelemetry/exporter-trace-otlp-grpc
   - @opentelemetry/exporter-jaeger
   - @opentelemetry/exporter-zipkin
2. Создать packages/observability/src/exporters/
3. Реализовать factory для exporters по config
4. Реализовать FileSpanExporter (custom)
5. Реализовать multi-exporter support
6. Добавить exporter health checks
7. Конфигурация через ObservabilityConfig.exporters

**Constraints from Architecture:**
- Console только в development
- File rotation для file exporter
- Async exports (non-blocking)

**Integration Points:**
- SpanProcessor использует configured exporters

---

### Task T-006: Audit Log

**Logical Steps:**
1. Создать packages/observability/src/audit/
2. Определить AuditEntry interface
3. Создать SQLite таблицу audit_log
4. Реализовать AuditRepository класс
5. Реализовать insert(entry: AuditEntry)
6. Реализовать query methods (findBySession, findByTimeRange, etc.)
7. Добавить retention policy (cleanup old records)
8. Гарантировать immutability (no UPDATE/DELETE methods)

**Constraints from Architecture:**
- Immutable records (Layer 6 security)
- JSON fields: params, result
- Retention: configurable days

**Integration Points:**
- packages/gateway — audit permission decisions
- packages/agent — audit tool executions
- packages/security — audit sandbox violations

---

### Task T-007: Observability REST API

**Logical Steps:**
1. Создать packages/observability/src/api/
2. Реализовать маршруты:
   - GET /api/v1/observability/audit
   - GET /api/v1/observability/traces
   - GET /api/v1/observability/metrics
3. Добавить query parameter validation
4. Добавить pagination support
5. Добавить error handling
6. Интегрировать с Gateway HTTP server

**Constraints from Architecture:**
- Local-only (no auth required)
- Pagination limit: max 100

**Integration Points:**
- Gateway HTTP server mounts API routes
- Dashboard использует API

---

### Task T-008: Integration Tests

**Logical Steps:**
1. Создать tests/integration/observability/
2. Реализовать test fixtures (mock agent, mock gateway)
3. Написать trace propagation test
4. Написать metric accuracy test
5. Написать audit completeness test
6. Написать overhead verification test
7. Добавить test utilities

**Constraints from Architecture:**
- Integration tests используют реальную SQLite
- Mock external exporters (Jaeger, OTLP)

**Integration Points:**
- Запускаются после всех unit tests
- Требуют running services (или mocks)

---

## 6. Acceptance Criteria per Task

### Task T-001: OpenTelemetry SDK Setup
- [ ] NodeTracerProvider инициализирован при старте
- [ ] Resource attributes содержат service.name=osai
- [ ] Tracer может быть получен через trace.getTracer()
- [ ] Shutdown корректно flushed все spans
- [ ] Build: `pnpm build` завершается успешно
- [ ] Tests: все unit tests проходят

### Task T-002: Structured Logging
- [ ] Pino logger создан с JSON format
- [ ] trace_id присутствует в log entries при active span
- [ ] Child loggers работают корректно
- [ ] Log rotation настроен
- [ ] Build: `pnpm build` завершается успешно
- [ ] Tests: все unit tests проходят

### Task T-003: Metrics System
- [ ] Все counters созданы и работают
- [ ] Все histograms созданы и работают
- [ ] Все gauges созданы и работают
- [ ] Naming convention: osai.* prefix
- [ ] Build: `pnpm build` завершается успешно
- [ ] Tests: все unit tests проходят

### Task T-004: Prometheus Exporter
- [ ] /metrics endpoint доступен
- [ ] Prometheus format валидный
- [ ] Port configurable через config
- [ ] Graceful shutdown работает
- [ ] Build: `pnpm build` завершается успешно
- [ ] Tests: endpoint responding

### Task T-005: Trace Exporters
- [ ] Console exporter работает в development
- [ ] File exporter пишет в JSON lines
- [ ] OTLP exporter configuration работает
- [ ] Multi-exporter support
- [ ] Build: `pnpm build` завершается успешно
- [ ] Tests: exporters export spans

### Task T-006: Audit Log
- [ ] Audit records сохраняются в SQLite
- [ ] Records immutable (no UPDATE/DELETE)
- [ ] Query by session_id работает
- [ ] Query by time range работает
- [ ] Build: `pnpm build` завершается успешно
- [ ] Tests: CRUD operations work

### Task T-007: Observability REST API
- [ ] GET /api/v1/observability/audit работает
- [ ] GET /api/v1/observability/traces работает
- [ ] GET /api/v1/observability/metrics работает
- [ ] Pagination работает
- [ ] Build: `pnpm build` завершается успешно
- [ ] Tests: API endpoints respond

### Task T-008: Integration Tests
- [ ] Trace propagation test проходит
- [ ] Metric accuracy test проходит
- [ ] Audit completeness test проходит
- [ ] Overhead < 5% verified
- [ ] Build: `pnpm build` завершается успешно
- [ ] All integration tests pass

---

## 7. Quality Expectations

### Coverage Requirements

| Task | Unit Coverage | Integration Coverage |
|------|---------------|---------------------|
| T-001 | 80% | N/A |
| T-002 | 80% | 70% |
| T-003 | 85% | N/A |
| T-004 | 80% | 70% |
| T-005 | 75% | 60% |
| T-006 | 85% | 80% |
| T-007 | 85% | 80% |
| T-008 | N/A | 90% |

### Task Completion Time

- **Target:** 2-4 hours per task
- **Maximum:** 6 hours (split if exceeded)
- **Buffer:** 20% time for unexpected issues

### Build and Run Stability

- Build должен проходить без errors
- Все tests должны проходить
- Application должна запускаться без критических ошибок
- Observability overhead < 5% CPU/memory (NFR-004)

---

## 8. Risks and Edge Cases

### Known Edge Cases

1. **OTel context loss in async code**
   - Risk: trace_id теряется в promises/callbacks
   - Mitigation: Использовать context.bind() или async_hooks

2. **High cardinality metrics**
   - Risk: Metrics взрываются с уникальными labels
   - Mitigation: Ограничить cardinality, использовать predetermined labels

3. **SQLite audit log growth**
   - Risk: Таблица audit растет без ограничений
   - Mitigation: Retention policy, periodic cleanup

4. **File exporter rotation**
   - Risk: Ротация файлов может потерять spans
   - Mitigation: Flush перед rotation, atomic rename

### Risky Scenarios

1. **Shutdown during span export**
   - Risk: Spans потеряны при abrupt shutdown
   - Mitigation: Graceful shutdown с timeout

2. **Prometheus scrape during high load**
   - Risk: Scrape timeout или incomplete metrics
   - Mitigation: Optimized export, caching

3. **Concurrent audit log writes**
   - Risk: SQLite lock contention
   - Mitigation: WAL mode, batch inserts

### Dependency-related Risks

1. **F-002 Gateway not ready**
   - Risk: REST API не может быть mounted
   - Mitigation: Feature dependency enforcement

2. **F-004 Agent Runtime not ready**
   - Risk: Нет spans для trace, нет metrics для record
   - Mitigation: Feature dependency enforcement

---

## 9. Notes

### Clarifications

1. **Sampling Strategy:**
   - Development: 100% sampling
   - Production: 10% sampling (configurable)

2. **Exporter Selection:**
   - Default: Console + File
   - V1: OTLP для production deployments

3. **Audit Retention:**
   - Default: 30 days
   - Configurable через openclaw.json

4. **Metrics Port:**
   - Default: 9090
   - Конфигурируется в observability.metrics.port

### Planning Notes

1. Observability — cross-cutting concern, используется всеми packages
2. Инициализация ДО других imports критична для OTel
3. Audit log — часть security model (Layer 6)
4. Prometheus endpoint — для external monitoring integration

---

*End of Task Roadmap v1.0 for Feature F-010: Observability*
