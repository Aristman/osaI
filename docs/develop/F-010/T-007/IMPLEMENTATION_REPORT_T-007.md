# Implementation Report -- T-007

**Feature:** F-010 Telegram Integration
**Task:** T-007 Mirror Engine -- Telegram-to-osaiI
**Domain:** DOMAIN-006
**Date:** 2026-03-30
**Iteration:** 1

---

## Implemented Scope

Реализовано обратное зеркалирование сообщений Telegram -> osaI (TG-to-osai) в MirrorEngine.

Ключевое поведение:
- Получение входящего сообщения от bot/userbot через метод `receiveMessage()`
- Маппинг входящего Telegram сообщения в GatewayMessage через абстракцию `GatewayInjector`
- Дедупликация по `message_id` через in-memory `Set<number>` для предотвращения циклов зеркалирования
- Конвертация Telegram HTML -> Markdown перед инъекцией в Agent Runtime
- Вызов hook `on_mirror_message` для каждого обработанного сообщения (включая TG-to-osai направление)
- Фильтрация по направлению: только зеркала с `direction === "tg-to-osai"` или `direction === "both"` активны для входящих сообщений
- При ошибке инъекции -- логирование без выброса исключения
- Сообщения без текста (`text === undefined`) пропускаются

Строго в рамках scope из roadmap T-007. Двусторонняя координация (T-008) не реализована.

---

## Tests Implemented

Файл: `packages/gateway/src/channels/telegram/__tests__/mirror-tg-to-osai.test.ts`

38 тестов в 7 describe-блоках:

1. **telegramHtmlToMarkdown** (18 тестов) -- конвертация Telegram HTML в Markdown:
   - Plain text preservation
   - `<b>`, `<i>`, `<u>`, `<s>`, `<code>`, `<pre>`, `<pre><code>`, `<a>`, `<blockquote>`, `<tg-spoiler>`
   - Mixed formatting, nested tags
   - Multiline text, empty string
   - HTML entities decoding
   - Unclosed tags graceful handling
   - Multiline pre blocks

2. **receiveMessage: injection** (5 тестов):
   - Инъекция входящего сообщения в Agent Runtime
   - Передача telegramMessageId, telegramUserId, telegramChatId
   - Конвертация HTML -> Markdown перед инъекцией

3. **deduplication** (4 теста):
   - Повторный message_id не обрабатывается
   - Разные message_id обрабатываются оба
   - Дедупликация через разные mirrors
   - Сброс dedup set после stop/start

4. **no matching mirror** (2 теста):
   - Нет mirror для данного Telegram chat ID
   - Direction "osai-to-tg" не принимает входящие

5. **both direction** (1 тест):
   - Direction "both" принимает входящие TG сообщения

6. **error handling** (4 теста):
   - Ошибка инъекции логируется, исключение не выбрасывается
   - Engine not started -- сообщение не обрабатывается
   - Нет текста -- сообщение пропускается
   - Нет поля from -- сообщение обрабатывается

7. **on_mirror_message hook** (2 теста):
   - Hook вызывается с success=true
   - Hook вызывается с success=false при ошибке инъекции

8. **introspection** (1 тест):
   - `getProcessedMessageIds()` возвращает обработанные ID

---

## Code Changes

### Files added
- `packages/gateway/src/channels/telegram/__tests__/mirror-tg-to-osai.test.ts` -- 38 тестов TG-to-osai mirror

### Files modified
- `packages/gateway/src/channels/telegram/mirror.ts` -- TG-to-osai реализация:
  - Добавлены типы: `IncomingTelegramMessage`, `GatewayInjector`
  - Добавлена функция `telegramHtmlToMarkdown()` (HTML -> Markdown конвертация)
  - Добавлен приватный хелпер `decodeHtmlEntities()`
  - Класс `MirrorEngine` расширен:
    - Новые приватные поля: `activeMirrorsIn`, `processedMessageIds`
    - Обновлён конструктор: фильтрация mirrors для входящего направления
    - Обновлён `start()`: очистка dedup set
    - Новый метод: `receiveMessage()` -- основной API TG-to-osai
    - Новый приватный метод: `injectToOsaI()` -- инъекция с error handling + hook
    - Новые акцессоры: `getActiveMirrorsIn()`, `getProcessedMessageIds()`
    - Рефакторинг: `activeMirrors` -> `activeMirrorsOut`

- `packages/gateway/src/channels/telegram/index.ts` -- barrel exports:
  - Добавлены экспорты: `telegramHtmlToMarkdown`, `IncomingTelegramMessage`, `GatewayInjector`

---

## Architectural Compliance

- **Модульный монолит:** Изменения только в `packages/gateway/src/channels/telegram/` (DOMAIN-006)
- **Separation of concerns:** `GatewayInjector` -- абстракция для инъекции, `MirrorEngine` не зависит от конкретной реализации Gateway
- **Event-driven:** Hook `on_mirror_message` вызывается для каждого обработанного сообщения (TG-to-osai)
- **Error handling:** Ошибки инъекции логируются через pino, не прерывают работу engine
- **ESM + TypeScript strict:** Все новые типы и экспорты используют ESM `.js` extensions, `readonly` модификаторы
- **pino logging:** Все операции логируются через pino с structured context
- **Barrel exports:** Новые типы экспортированы через `index.ts`
- **TDD:** Тесты написаны перед реализацией, все 38 тестов проходят

---

## Deviations

Отклонений от roadmap нет. Все checklist-пункты T-007 выполнены:
- [x] CODE: Обновить `mirror.ts` -- TG-to-osai направление
- [x] CODE: Получение сообщения от bot/userbot, маппинг в GatewayMessage
- [x] CODE: Дедупликация по message_id (предотвращение циклов)
- [x] CODE: Telegram HTML -> Markdown конвертация
- [x] TEST: `mirror-tg-to-osai.test.ts` -- получение, дедупликация, форматирование, injection
- [x] BUILD: компиляция без ошибок в изменённых файлах

---

## Known Limitations

1. **In-memory dedup set:** Дедупликация основана на in-memory `Set<number>`. При restart engine set сбрасывается. Для production (T-008) потребуется persistent deduplication (SQLite).

2. **Нет media handling:** Медиа-сообщения (фото, видео, документы) не обрабатываются -- только текст. Это outside scope T-007, будет реализовано в T-008.

3. **Нет throttle/rate limiting на входящих:** Входящие сообщения обрабатываются без ограничений по частоте. Rate limiting на уровне Telegram API -- responsibility bot/userbot.

4. **HTML entity decoding частичный:** Поддерживаются только основные HTML entities (`&amp;`, `&lt;`, `&gt;`, `&quot;`, `&#39;`). Numeric character references (`&#123;`, `&#x7B;`) не декодируются -- редкий кейс для Telegram.
