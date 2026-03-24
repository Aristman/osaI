# Code Review -- T-002 Shared Types Package

**Версия:** v1.0
**Дата:** 2026-03-24
**Ревьюер:** Code Reviewer Agent
**Статус:** FAIL

---

## Reviewed Feature

- **Feature ID:** T-002
- **Feature Name:** Shared Types Package
- **Domain:** backend (Node.js/TypeScript), cross-cutting infrastructure
- **Profile Used:** AGENT_PROFILE_nodejs.md v1.0 (`~/.claude/agents/profiles/backend/AGENT_PROFILE_nodejs.md`)

---

## Review Scope

### Files Reviewed

| File | Path |
|------|------|
| ws.ts | `/home/aristman/projects/osai/packages/types/src/ws.ts` |
| errors.ts | `/home/aristman/projects/osai/packages/types/src/errors.ts` |
| session.ts | `/home/aristman/projects/osai/packages/types/src/session.ts` |
| config.ts | `/home/aristman/projects/osai/packages/types/src/config.ts` |
| index.ts | `/home/aristman/projects/osai/packages/types/src/index.ts` |
| package.json | `/home/aristman/projects/osai/packages/types/package.json` |
| ws.test.ts | `/home/aristman/projects/osai/packages/types/__tests__/ws.test.ts` |
| errors.test.ts | `/home/aristman/projects/osai/packages/types/__tests__/errors.test.ts` |
| session.test.ts | `/home/aristman/projects/osai/packages/types/__tests__/session.test.ts` |
| config.test.ts | `/home/aristman/projects/osai/packages/types/__tests__/config.test.ts` |
| IMPLEMENTATION_REPORT_T-002.md | `/home/aristman/projects/osai/docs/develop/F-001/T-002/IMPLEMENTATION_REPORT_T-002.md` |

### Key Components Touched

- WS message types (ws.ts)
- Error hierarchy (errors.ts)
- Domain type aliases (session.ts)
- Configuration interfaces (config.ts)
- Barrel exports (index.ts)
- package.json (@osai/types)

---

## Architectural Compliance

**Статус:** PARTIAL COMPLIANCE

### Соответствующие требования

| Требование ARCHITECTURE_OVERVIEW.md | Статус | Комментарий |
|-------------------------------------|--------|-------------|
| WS protocol: 7 message types | **FAIL** | Определено только 6 типов: tool_stream, block, permission_request, permission_response, gateway message. Отсутствуют: `message`, `command`, `subscribe` |
| WS InboundMessage/OutboundMessage разделение | **FAIL** | Реализован единый `WsInboundMessage` без разделения на inbound/outbound |
| `message` type с session_id, content, channel | **FAIL** | Отсутствует. ARCHITECTURE_OVERVIEW.md Section 4.1 явно определяет `{ type: "message"; session_id: string; content: string; channel?: string }` |
| `command` type с command, params | **FAIL** | Отсутствует. ARCHITECTURE_OVERVIEW.md Section 4.1 определяет `{ type: "command"; command: string; params?: Record<string, unknown> }` |
| `subscribe` type с events | **FAIL** | Отсутствует. ARCHITECTURE_OVERVIEW.md Section 4.1 определяет `{ type: "subscribe"; events: string[] }` |
| Block types: text, code, image, card, table | PASS | `BlockStreamMessage.block_type` содержит все 5 значений |
| Session types: main, group, isolated | PASS | `SessionType` содержит все 3 значения |
| Error hierarchy (base + domain-specific) | PASS | OsaIError -> ModelError, SandboxError, SkillError |
| Category-based permissions | PASS | `ToolCategory` содержит read, write, execute, system |
| TypeScript strict mode | PASS | tsconfig.types.json содержит `strict: true` |
| Barrel exports | PASS | index.ts экспортирует все типы из 4 модулей |
| Dependency-free types package | PASS | Нет runtime зависимостей, только type-only экспорты |

### Детальный анализ нарушений WS Protocol

**ARCHITECTURE_OVERVIEW.md Section 4.1** определяет следующие WS message types:

Inbound (Client -> Server):
```typescript
type InboundMessage =
  | { type: "message"; session_id: string; content: string; channel?: string }
  | { type: "command"; command: string; params?: Record<string, unknown> }
  | { type: "permission_response"; request_id: string; decision: "approved" | "denied" }
  | { type: "subscribe"; events: string[] };
```

Outbound (Server -> Client):
```typescript
type OutboundMessage =
  | { type: "block"; session_id: string; block_type: ...; content: string; language?: string }
  | { type: "tool_stream"; session_id: string; tool: string; action: string; chunk: Record<string, unknown> }
  | { type: "permission_request"; request_id: string; session_id: string; tool: string; action: string; params: Record<string, unknown>; risk_level: string }
  | { type: "error"; code: string; message: string; severity: string }
  | { type: "status"; session_id: string; state: SessionState }
  | { type: "event"; event: string; data: Record<string, unknown> };
```

**Реализация в ws.ts:**
- `GatewayMessage` -- generic message с `type: string` и `session_id`, но без специфических полей content/channel
- `ToolStreamMessage` -- **отсутствует `session_id`** (требуется по ARCHITECTURE_OVERVIEW.md)
- `BlockStreamMessage` -- **отсутствует `session_id`** (требуется по ARCHITECTURE_OVERVIEW.md)
- `PermissionRequest` -- **отсутствует `session_id`** (требуется по ARCHITECTURE_OVERVIEW.md)
- `PermissionResponse` -- использует `granted: boolean` вместо `decision: "approved" | "denied"` (несоответствие ARCHITECTURE_OVERVIEW.md)
- Отсутствуют: `message`, `command`, `subscribe`, `error`, `status`, `event`

**ARCH-VIOLATION-001:** WS message types не соответствуют ARCHITECTURE_OVERVIEW.md WS Protocol Specification. Отсутствуют 3 из 4 inbound типов (message, command, subscribe) и 3 из 6 outbound типов (error, status, event). Имеющиеся типы не содержат обязательных полей (session_id в outbound сообщениях).

**ARCH-VIOLATION-002:** Поле `PermissionResponse.granted: boolean` не соответствует ARCHITECTURE_OVERVIEW.md, где определено `decision: "approved" | "denied"`. Использование boolean вместо строкового enum снижает явность и затрудняет логирование/аудит.

**ARCH-VIOLATION-003:** Отсутствует разделение на InboundMessage и OutboundMessage. ARCHITECTURE_OVERVIEW.md явно определяет два отдельных union type (InboundMessage и OutboundMessage). Реализация содержит единственный `WsInboundMessage`, который смешивает inbound и outbound типы (block и tool_stream -- outbound по спецификации -- включены в "inbound" union).

---

## Profile Compliance

**Статус:** PARTIAL COMPLIANCE

### Проверка по AGENT_PROFILE_nodejs.md v1.0

| Требование профиля | Статус | Доказательство |
|--------------------|--------|----------------|
| Language: TypeScript 5.x | PASS | Все файлы `.ts` |
| Strict mode | PASS | tsconfig.types.json содержит `strict: true` |
| Не использовать `any` | PASS | Во всех файлах отсутствует `any` |
| Barrel exports (index.ts) | PASS | index.ts экспортирует все типы |
| Использовать интерфейсы для public API | PASS | Все public типы -- интерфейсы |
| TypeScript naming conventions | PASS | PascalCase для типов, camelCase для полей |
| `engines` field | **FAIL** | packages/types/package.json не содержит `engines` |
| Package manager: pnpm (preferred) или npm | PASS | npm используется |
| Build: tsup/esbuild или tsc | PASS | tsup в package.json scripts |

**PROFILE-VIOLATION-001:** `packages/types/package.json` не содержит поле `engines`. Профиль AGENT_PROFILE_nodejs.md явно требует `"engines": { "node": ">=20.0.0" }` для всех пакетов.

---

## Code Quality Assessment

### Читаемость: GOOD

Все файлы хорошо структурированы, содержат JSDoc-комментарии, секции отделены визуальными разделителями. Именование типов согласовано и описательно.

### Структура: GOOD

Разделение на 4 модуля (ws, errors, session, config) логично и позволяет независимое развитие каждой области. Barrel export через index.ts корректен.

### Сопровождаемость: GOOD

Модули не имеют взаимных зависимостей. Добавление новых типов не требует изменения существующих модулей.

### Проблемы сложности

Нет значимых проблем. Объём кода мал, типы -- декларативные.

### Конкретные замечания по качеству

1. **`GatewayMessage.type: string`** -- Использование `string` для discriminated union field снижает type safety. ARCHITECTURE_OVERVIEW.md использует string literal types (`"message"`, `"command"`, etc.). Если `GatewayMessage` предназначен как base type для конкретных сообщений, рекомендуется добавить комментарий об этом назначении.

2. **`PermissionRequest.risk_level`** -- Определён как `'low' | 'medium' | 'high'`, а ARCHITECTURE_OVERVIEW.md определяет как `string`. Реализация с литеральными типами является улучшением (более строгая типизация), это позитивное отклонение.

3. **Отсутствие `session_id` в outbound сообщениях** -- ToolStreamMessage, BlockStreamMessage и PermissionRequest не содержат `session_id`, хотя ARCHITECTURE_OVERVIEW.md явно требует его для всех outbound сообщений. Это не только нарушение спецификации, но и практическая проблема: клиент не сможет определить, к какой сессии относится пришедшее сообщение.

---

## Test Adequacy

### Соответствие тестов реализации

Тесты покрывают все реализованные типы:
- ws.test.ts: 9 тестов для WS message types
- errors.test.ts: 6 тестов для error hierarchy
- session.test.ts: 5 тестов для domain type aliases
- config.test.ts: 9 тестов для config interfaces
- index.test.ts: barrel export verification

Комбинация compile-time (`expectTypeOf`) и runtime (`expect`) проверок -- хорошая практика для types package.

### Пробелы и слабые места

1. **Тесты подтверждают некорректную реализацию:** Тест ws.test.ts строка 17 заявляет "All 7 WS-related types are defined", но фактически определено только 6 типов. Тест считает 7 (GatewayMessage + 5 specific = 6), и WsInboundMessage = 7. Но по ARCHITECTURE_OVERVIEW.md требуется 10+ типов (4 inbound + 6 outbound). Тест не проверяет соответствие архитектуре.

2. **Отсутствие тестов на отсутствие session_id:** Нет тестов, которые бы проверяли наличие `session_id` в outbound сообщениях. Это позволяет реализации не соответствовать архитектуре без обнаружения на уровне тестов.

3. **PermissionResponse.decision vs granted:** Тесты (ws.test.ts строки 74-79) проверяют `granted: boolean`, но ARCHITECTURE_OVERVIEW.md требует `decision: "approved" | "denied"`. Тесты не обнаруживают это расхождение.

4. **TEST_REPORT_T-002.md отсутствует:** Реализовано 32 тест-кейса, но отсутствует формальный TEST_REPORT. IMPLEMENTATION_REPORT_T-002.md содержит результаты тестов, но это не заменяет TEST_REPORT.

---

## Detected Issues

### DEF-001 [Blocker] -- Неполное покрытие WS message types

- **Описание:** Реализация в ws.ts определяет только 6 типов (GatewayMessage, ToolStreamMessage, BlockStreamMessage, PermissionRequest, PermissionResponse, WsInboundMessage). ARCHITECTURE_OVERVIEW.md WS Protocol Specification (Appendix D, Section 4.1) определяет 10 типов: 4 inbound (message, command, permission_response, subscribe) и 6 outbound (block, tool_stream, permission_request, error, status, event).
- **Отсутствующие inbound типы:**
  - `{ type: "message"; session_id: string; content: string; channel?: string }`
  - `{ type: "command"; command: string; params?: Record<string, unknown> }`
  - `{ type: "subscribe"; events: string[] }`
- **Отсутствующие outbound типы:**
  - `{ type: "error"; code: string; message: string; severity: string }`
  - `{ type: "status"; session_id: string; state: SessionState }`
  - `{ type: "event"; event: string; data: Record<string, unknown> }`
- **Файл:** `/home/aristman/projects/osai/packages/types/src/ws.ts`
- **Рекомендация:** Добавить недостающие типы в ws.ts. Разделить на `WsInboundMessage` (message, command, permission_response, subscribe) и `WsOutboundMessage` (block, tool_stream, permission_request, error, status, event), как определено в ARCHITECTURE_OVERVIEW.md Section 4.1.

### DEF-002 [Blocker] -- Отсутствует session_id в outbound WS сообщениях

- **Описание:** ToolStreamMessage, BlockStreamMessage и PermissionRequest не содержат поле `session_id`. ARCHITECTURE_OVERVIEW.md явно определяет `session_id` как обязательное поле для всех outbound сообщений (block, tool_stream, permission_request, status). Без session_id клиент не может идентифицировать сессию, к которой относится сообщение.
- **Файл:** `/home/aristman/projects/osai/packages/types/src/ws.ts`, строки 22-50
- **Рекомендация:** Добавить `session_id: string` в ToolStreamMessage, BlockStreamMessage и PermissionRequest.

### DEF-003 [Blocker] -- Некорректный тип PermissionResponse

- **Описание:** Реализация определяет `PermissionResponse.granted: boolean`. ARCHITECTURE_OVERVIEW.md Section 4.1 определяет `permission_response` как `{ request_id: string; decision: "approved" | "denied" }`. Поле названо `decision` (не `granted`) и имеет тип string literal union (не boolean). Использование boolean затрудняет аудит (невозможно отличить лог от "false -- denied" и "false -- no response").
- **Файл:** `/home/aristman/projects/osai/packages/types/src/ws.ts`, строки 46-50
- **Рекомендация:** Переименовать поле `granted` в `decision` и изменить тип на `"approved" | "denied"` для соответствия ARCHITECTURE_OVERVIEW.md.

### DEF-004 [Blocker] -- Отсутствует разделение InboundMessage / OutboundMessage

- **Описание:** Реализация содержит единый `WsInboundMessage` union, который включает outbound типы (block, tool_stream, permission_request). ARCHITECTURE_OVERVIEW.md Section 4.1 явно разделяет сообщения на InboundMessage (client -> server) и OutboundMessage (server -> client). Это разделение критически важно для типобезопасной маршрутизации сообщений в gateway.
- **Файл:** `/home/aristman/projects/osai/packages/types/src/ws.ts`, строки 56-61
- **Рекомендация:** Создать два отдельных union type: `WsInboundMessage` (message, command, permission_response, subscribe) и `WsOutboundMessage` (block, tool_stream, permission_request, error, status, event), как определено в ARCHITECTURE_OVERVIEW.md.

### DEF-005 [Major] -- Отсутствие TEST_REPORT_T-002.md

- **Описание:** Результаты тестирования (32 тест-кейса) описаны только в IMPLEMENTATION_REPORT_T-002.md. Формальный TEST_REPORT_T-002.md отсутствует. PROCESS_WORKFLOW требует отдельный TEST_REPORT для каждой задачи.
- **Рекомендация:** Создать TEST_REPORT_T-002.md с формальным описанием всех тест-кейсов, результатов и покрытия.

### DEF-006 [Major] -- ToolStreamMessage.chunk: string вместо Record<string, unknown>

- **Описание:** ARCHITECTURE_OVERVIEW.md Section 4.1 определяет `chunk` как `Record<string, unknown>` (строка 255). Реализация определяет `chunk: string`. Это ограничивает tool_stream до текстовых данных и не позволяет передавать структурированные данные (например, прогресс-бары, файлы, JSON-объекты).
- **Файл:** `/home/aristman/projects/osai/packages/types/src/ws.ts`, строка 27
- **Рекомендация:** Изменить тип `chunk` на `Record<string, unknown>` для соответствия ARCHITECTURE_OVERVIEW.md.

### DEF-007 [Minor] -- packages/types/package.json: отсутствие поля engines

- **Описание:** Профиль AGENT_PROFILE_nodejs.md требует поле `engines` во всех пакетах. packages/types/package.json не содержит этого поля.
- **Файл:** `/home/aristman/projects/osai/packages/types/package.json`
- **Рекомендация:** Добавить `"engines": { "node": ">=20.0.0" }`.

### DEF-008 [Minor] -- packages/types/package.json: отсутствие typescript в devDependencies

- **Описание:** Перенос из CODE_REVIEW_T-001.md DEF-004. packages/types/package.json не содержит `typescript` в devDependencies. Сборка зависит от hoisted typescript из корня.
- **Файл:** `/home/aristman/projects/osai/packages/types/package.json`
- **Рекомендация:** Добавить `"typescript": "^5.9.3"` в devDependencies.

### DEF-009 [Minor] -- IMPLEMENTATION_REPORT_T-002.md заявляет о "6 типах + union" как 7 типов

- **Описание:** IMPLEMENTATION_REPORT_T-002.md строка 14 заявляет "Все WS-related типы определены (6 типов + union)". Тест ws.test.ts строка 17 заявляет "All 7 WS-related types are defined". ROADMAP_F-001 явно требует "7 WS message types" (message, command, permission_response, subscribe, tool_stream, block, permission_request). Реализация определяет 6 типов + union, но 3 из 7 требуемых типов (message, command, subscribe) отсутствуют. Заявление о покрытии некорректно.
- **Рекомендация:** Обновить IMPLEMENTATION_REPORT_T-002.md, указав фактические отклонения от ROADMAP по WS types.

---

## Positive Observations

1. **Хорошая иерархия ошибок:** OsaIError как базовый интерфейс с Severity, от которого наследуют ModelError (с retryable), SandboxError (с operation/path) и SkillError (с skillName/toolName). Структура обоснована и покрывает ключевые домены системы.

2. **Строгая типизация risk_level:** PermissionRequest.risk_level определён как `'low' | 'medium' | 'high'` (string literals), тогда как ARCHITECTURE_OVERVIEW.md определяет его как `string`. Это позитивное отклонение -- более строгая типизация предотвращает ошибки.

3. **Конфигурационные типы:** config.ts покрывает все основные секции (model, gateway, session, skills, security) и содержит соответствующие поля из ARCHITECTURE_OVERVIEW.md (allowedDirs, blockedPatterns для fileSandbox).

4. **Domain type aliases:** session.ts содержит хорошо продуманные типы (SessionType, ActivationMode, ToolCategory, RiskLevel, MemoryCategory), соответствующие ARCHITECTURE_OVERVIEW.md.

5. **Качество тестов:** Комбинация compile-time (`expectTypeOf`) и runtime (`expect`) проверок -- эффективный подход для types package.

---

## Review Summary

| Критерий | Результат |
|----------|-----------|
| **Общий статус ревью** | **FAIL** |
| **Блокирующие проблемы** | Да (4: DEF-001, DEF-002, DEF-003, DEF-004) |
| **Major проблемы** | 2 (DEF-005, DEF-006) |
| **Minor проблемы** | 3 (DEF-007, DEF-008, DEF-009) |
| **Архитектурное соответствие** | Partial compliance |
| **Профильное соответствие** | Partial compliance |
| **TypeScript strict compliance** | PASS |
| **Test coverage (types)** | Good (для реализованных типов), но не проверяет соответствие ARCHITECTURE_OVERVIEW.md |

### Условия повторного ревью (v2.0)

Задача T-002 может быть принята после:
1. Добавления недостающих WS message types: message, command, subscribe (DEF-001)
2. Добавления outbound типов: error, status, event (DEF-001)
3. Добавления session_id в ToolStreamMessage, BlockStreamMessage, PermissionRequest (DEF-002)
4. Исправления PermissionResponse: decision вместо granted, "approved"|"denied" вместо boolean (DEF-003)
5. Разделения на WsInboundMessage и WsOutboundMessage (DEF-004)
6. Создания TEST_REPORT_T-002.md (DEF-005)
7. (Рекомендовано) Исправления chunk type в ToolStreamMessage (DEF-006)
8. (Рекомендовано) Добавления engines в packages/types/package.json (DEF-007)

---

*End of Code Review v1.0*
