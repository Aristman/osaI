# Implementation Report — T-002: Chat CRUD + Persistence

## Implemented Scope

Реализован ChatService с полным набором CRUD операций для чатов и сообщений, с персистенцией через SQLite (better-sqlite3 синхронный API).

**In scope:**
- ChatService: createChat, getChat, updateChat, deleteChat, listChats
- Message operations: addMessage, getMessages (с пагинацией)
- getActiveCount для подсчёта активных чатов
- Фильтрация по activeOnly, channel, tags
- Каскадное удаление сообщений при удалении чата (ON DELETE CASCADE)
- Barrel export из packages/gateway/src/chat/index.ts
- Re-export из packages/gateway/src/index.ts

**Out scope:**
- Context isolation (T-005)
- Archiving / лимит 20 активных (T-006)
- WebSocket интеграция (T-003)

## Tests Implemented

**Файл:** `packages/gateway/src/chat/__tests__/ChatService.test.ts`
**Количество:** 40 тестов, все проходят
**Среда:** in-memory SQLite (`:memory:`)

| Категория | Тесты | Описание |
|-----------|-------|----------|
| createChat | 4 | Persist + return ID, все metadata поля, уникальные ID, defaults |
| getChat | 2 | Null для несуществующего, корректный возврат по ID |
| updateChat | 5 | Обновление metadata полей, updated_at timestamp, ошибка при несуществующем, toggle isActive, no-op |
| deleteChat | 3 | Каскадное удаление, non-existent без ошибки, изоляция других чатов |
| listChats | 3 | Все чаты, сортировка DESC, пустой массив |
| listChats filter | 6 | activeOnly, channel, tags (any match), комбинированные фильтры, пустой результат |
| addMessage | 5 | Persist с полями, toolCalls, metadata, уникальные ID, все роли |
| getMessages | 5 | Пагинация (limit/offset), сортировка ASC, пустой чат, несуществующий чат, изоляция |
| getActiveCount | 5 | 0 при пустой БД, только активные, увеличение/уменьшение, delete |
| cascade delete | 2 | Все типы сообщений удаляются, изоляция других чатов |

**Покрытие roadmap тест-кейсов:**
- TT-009-07 (createChat сохраняет в SQLite) -- PASS
- TT-009-08 (getChat null для несуществующего) -- PASS
- TT-009-09 (updateChat обновляет metadata) -- PASS
- TT-009-10 (deleteChat каскадное удаление) -- PASS
- TT-009-11 (listChats возвращает все) -- PASS
- TT-009-12 (addMessage сохраняет с правильными полями) -- PASS
- TT-009-13 (getMessages с пагинацией) -- PASS
- TT-009-14 (Chat metadata: id, name, tags, icon, color) -- PASS

## Code Changes

### Files Added

| Файл | Назначение |
|------|------------|
| `packages/gateway/src/chat/types.ts` | Типы: Chat, ChatMessage, CreateChatInput, UpdateChatInput, ChatFilter, AddMessageInput, ToolCall |
| `packages/gateway/src/chat/ChatService.ts` | ChatService класс с CRUD + message ops |
| `packages/gateway/src/chat/index.ts` | Barrel export модуля |
| `packages/gateway/src/chat/__tests__/ChatService.test.ts` | 40 unit тестов (in-memory SQLite) |

### Files Modified

| Файл | Изменение |
|------|-----------|
| `packages/gateway/src/index.ts` | Добавлен re-export chat модуля (ChatService + типы) |
| `packages/gateway/package.json` | Добавлены зависимости: `@osai/shared`, `better-sqlite3`, `@types/better-sqlite3` |

## Architectural Compliance

- **DI через конструктор:** ChatService принимает DatabaseManager
- **Синхронный API better-sqlite3:** db.prepare().run(), .get(), .all()
- **Параметризованные запросы:** все SQL через placeholders (?)
- **Foreign keys + CASCADE:** chat_messages ON DELETE CASCADE от chats.id
- **TypeScript strict mode:** все типы определены, без `any`
- **Barrel exports:** модуль экспортируется через index.ts
- **JSON-сериализация:** tags, channelMetadata, toolCalls, metadata хранятся как JSON text
- **Формат ChatMessage:** { id, chatId, role, content, toolCalls?, metadata?, createdAt }

## Deviations

- Тест сортировки по created_at DESC использует ручное обновление timestamp через прямое DB-обновление, т.к. SQLite `datetime('now')` имеет секундное разрешение и быстрое создание нескольких чатов даёт одинаковый timestamp.

## Known Limitations

- Нет валидации длины строковых полей (name, description) -- валидация на уровне приложения пока не требуется roadmap-ом
- Нет транзакций для multi-step операций (updateChat динамически строит SET -- это безопасно т.к. одна операция)
- Filter по tags использует `json_each` -- для больших volumes данных может потребоваться оптимизация (FTS или отдельная таблица tag mappings)
