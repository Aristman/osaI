# Implementation Report -- F-003 / T-002

**Feature:** F-003 Observability Foundation
**Task:** T-002 LoggerFactory enhancement -- pino с correlation IDs
**Date:** 2026-03-30
**Iteration:** 1

---

## Implemented Scope

Расширена LoggerFactory в packages/observability/src/logger.ts: добавлен mixin для pino, который автоматически инжектирует trace_id и span_id из TraceContext (AsyncLocalStorage) в каждый log entry.

**In scope:**
- Автоматическая инъекция trace_id/span_id из TraceContext в mixin pino
- Каждый log entry содержит trace_id и span_id, когда TraceContext установлен
- Отсутствие trace_id/span_id, когда TraceContext не установлен
- TraceContext mixin имеет приоритет над manual trace_id в child bindings
- Root logger и child loggers получают trace context через mixin
- Barrel export обновлён для TraceContext (T-001 dependency)

**Out scope:**
- Audit logging (T-003 F-003)
- OpenTelemetry integration (V1 milestone)

---

## Tests Implemented

Файл: `packages/observability/src/logger.test.ts` (расширен)

Новые тесты (T-002):

| ID | Тест | Описание |
|----|------|----------|
| T-002-01 | TraceContext mixin | Инъекция trace_id и span_id в log entries; несколько entries подряд |
| T-002-02 | no trace context | Отсутствие trace_id/span_id когда TraceContext не установлен |
| T-002-03 | TraceContext mixin precedence | TraceContext mixin перезаписывает manual trace_id; manual trace_id как fallback |
| T-002-04 | dynamic context changes | Отражение изменений TraceContext (set()) в последующих log entries |
| T-002-05 | root logger trace context | Root logger также получает trace context через mixin |

**Всего новых тестов:** 7 (logger.test.ts: 23 исходных + 7 новых = 30)
**Все тесты logger + trace:** 53 теста, все проходят.

---

## Code Changes

### Файлы изменены

| Файл | Изменение |
|------|-----------|
| `packages/observability/src/logger.ts` | Добавлен import TraceContext; mixin расширен для инъекции trace_id/span_id |
| `packages/observability/src/logger.test.ts` | Добавлен import TraceContext; добавлены 7 новых тестов (T-002-01..T-002-05) |
| `packages/observability/src/index.ts` | Barrel export расширен: TraceContext + convenience функции + TraceData тип |

---

## Architectural Compliance

- **DOMAIN-010 (Observability):** Улучшение logging с correlation IDs
- **NFR-O01 (Structured logging):** Каждый log entry автоматически содержит trace_id и span_id
- **TypeScript strict mode:** Полное соответствие
- **ESM only:** Сохранено
- **pino structured JSON:** Mixin работает на уровне корневого logger, все child loggers наследуют
- **No console.log / No any type:** Сохранено

### Реализация mixin

Mixin в pino вызывается для каждого log entry. Реализация:

```typescript
mixin() {
  const ctx = TraceContext.get();
  const result: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
  };
  if (ctx !== undefined) {
    result.trace_id = ctx.trace_id;
    result.span_id = ctx.span_id;
  }
  return result;
}
```

Mixin вызывается после child bindings, поэтому trace_id/span_id из TraceContext всегда перезаписывает manual trace_id из ChildLoggerOptions. Это корректное поведение: TraceContext -- авторитетный источник correlation IDs.

---

## Deviations

Отсутствуют.

---

## Known Limitations

1. **Dual trace_id в JSON output:** Когда child logger создан с manual trace_id через ChildLoggerOptions и TraceContext установлен, JSON entry может содержать два trace_id поля (из binding и из mixin). Последний (mixin) -- актуальный. Парсеры JSON видят последнее значение. Это не является проблемой для машинного парсинга, но визуально может быть заметно.
2. **Mixing manual и automatic trace context:** Не рекомендуется одновременно использовать manual trace_id в ChildLoggerOptions и TraceContext mixin. Рекомендуемый подход: всегда использовать TraceContext.runInContext() для установки correlation IDs.
