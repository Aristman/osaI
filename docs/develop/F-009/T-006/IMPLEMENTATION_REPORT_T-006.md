# Implementation Report -- T-006

**Feature:** F-009 Gateway + Multi-Chat System
**Task:** T-006 Chat Archiving + 20 Active Limit
**Domain:** DOMAIN-001 (Gateway)
**Date:** 2026-03-30
**Iteration:** 1

---

## Implemented Scope

Реализована система архивации чатов с enforcement лимита в 20 активных чатов (NFR-SC01).

**In scope:**
- `archiveChat(chatId)` -- установка isActive=false, освобождение слота
- `unarchiveChat(chatId)` -- восстановление isActive=true с проверкой лимита
- `createChatWithLimit(input)` -- создание чата с проверкой лимита активных
- `deleteChat(chatId)` -- удаление чата с сообщениями (каскадное)
- `listArchived()` -- получение списка архивированных чатов
- Константа `MAX_ACTIVE_CHATS = 20`
- Классы ошибок: `ActiveChatLimitError`, `ChatNotFoundError`
- Идемпотентность операций archive/unarchive

**Out scope (per roadmap):**
- Автоархивирование по timeout (V1)
- Шаблоны чатов (chat templates)

---

## Tests Implemented

| ID | Описание | Статус |
|---|---|---|
| TT-009-30 | archiveChat ставит isActive=false | PASSED |
| TT-009-31 | unarchiveChat восстанавливает isActive | PASSED |
| TT-009-32 | Создание 21-го активного чата отклоняется | PASSED |
| TT-009-33 | Архивирование + создание = успех | PASSED |
| TT-009-34 | deleteChat архивированного чата | PASSED |
| TT-009-35 | listArchived возвращает только архивированные | PASSED |

**Дополнительные тесты (boundary conditions):**
- Идемпотентность archive (повторный archive не выбрасывает исключение)
- Идемпотентность unarchive (повторный unarchive не выбрасывает исключение)
- unarchive с проверкой лимита (20 active + unarchive = ошибка)
- Ошибки при несуществующем чате (archive, unarchive, delete)
- Полный цикл: archive/unarchive/delete с корректным счётчиком
- Rapid archive/unarchive (10 циклов без потери данных)
- Создание 20, архивация 1, создание 1 = 20 активных
- Сохранение данных чата при archive/unarchive
- Полезное сообщение об ошибке с рекомендацией архивировать

**Итого:** 25 тестов, все PASSED.

---

## Code Changes

### Files added

| Файл | Описание |
|---|---|
| `packages/gateway/src/chat/ChatArchiveService.ts` | Сервис архивации с limit enforcement |
| `packages/gateway/src/chat/__tests__/ChatArchiveService.test.ts` | 25 unit-тестов |

### Files modified

| Файл | Изменение |
|---|---|
| `packages/gateway/src/chat/index.ts` | Добавлен re-export ChatArchiveService, MAX_ACTIVE_CHATS, ActiveChatLimitError, ChatNotFoundError |
| `packages/gateway/src/index.ts` | Добавлен re-export из chat/index.ts |

---

## Architectural Compliance

- **Layered architecture:** ChatArchiveService -- бизнес-логический слой, ChatService -- слой доступа к данным. Зависит от ChatService через constructor injection.
- **TypeScript strict mode:** Все типы строго определены, нет `any`.
- **Parameterized queries:** Все SQL через ChatService (параметризованные плейсхолдеры).
- **No console.log:** Ошибки выбрасываются как исключения, логирование -- ответственность вызывающего кода.
- **Idempotent operations:** archive и unarchive безопасны для повторных вызовов.
- **Single Responsibility:** ChatArchiveService отвечает только за архивные правила (limit enforcement, isActive toggle). CRUD -- ChatService.

---

## Deviations

Отклонений от roadmap нет.

---

## Known Limitations

1. `listArchived()` реализован через `listChats()` + фильтрация в памяти. Для MVP с лимитом 20 чатов это приемлемо. При масштабировании возможно добавление SQL-фильтра `is_active = 0` в ChatService.
2. Ошибка сборки `cli-handler.ts` (TS6133: unused import) -- существующая проблема из T-004, не связана с T-006.
3. Падающий тест в `ChatContextManager.test.ts` (TT-009-27) -- существующая проблема из T-005, не связана с T-006.
