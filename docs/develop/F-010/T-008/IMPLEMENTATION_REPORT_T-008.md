# Implementation Report -- T-008

## Implemented Scope

Реализована полная двусторонняя синхронизация Mirror Engine (T-008) поверх существующих реализаций T-006 (osai-to-TG) и T-007 (TG-to-osai). Все изменения ограничены рамками задачи T-008.

Реализованный функционал:
- **Bidirectional mode**: полная поддержка direction `both` с одновременной работой обоих направлений
- **Конфигурируемый direction**: поддержка `both | osai-to-tg | tg-to-osai` для каждого mirror независимо
- **Media handling (best-effort)**: загрузка media (photo, document, video, audio, voice) через `MediaDownloader` интерфейс, передача buffer в osaI через `GatewayInjector.mediaAttachment`
- **Привязка mirror к osaI chat_id**: через `MirrorConfig.chatId` в конфигурации
- **Множественные mirrors**: полная поддержка нескольких зеркал с независимыми direction и chat mapping
- **Исключение циклов зеркалирования**: dedup по `message_id` с global Set, сброс при stop/start
- **MirrorEngineStats**: мониторинг stats (totalMirrors, activeMirrorsOut/In, processedMessageCount, mediaDownloadAttempts/Successes)
- **MirrorMessageEvent.hasMedia**: флаг наличия media для hook системы
- **Гибкий injector**: `GatewayInjector` может быть передан через конфигурацию или как параметр `receiveMessage()` (backward compatible)

## Tests Implemented

Файл: `packages/gateway/src/channels/telegram/__tests__/mirror-bidi.test.ts`
42 теста, все проходят.

Категории тестов:
- **Bidirectional sync** (4 tests): полная двусторонняя доставка, roundtrip, multiple directions
- **Direction configuration** (4 tests): osai-to-tg only, tg-to-osai only, both, mixed counts
- **Media handling** (10 tests): download + inject, text + media, download failure graceful, media-only message, dedup media, maxMediaSize, no downloader graceful, hook invocation, document type, null return
- **osaiI chat_id binding** (3 tests): correct chat routing, TG -> correct osaI, fan-out
- **Loop prevention** (4 tests): no loops on echo, cross-mirror dedup, introspection, stop/start reset
- **Bidirectional hook** (3 tests): osai-to-TG hook, TG-to-osai hook, roundtrip hooks
- **MirrorEngineStats** (2 tests): correct counts, media download tracking
- **Lifecycle bidirectional** (3 tests): start/stop, blocked when stopped, restart cycle
- **Bidirectional formatting** (2 tests): HTML/Markdown roundtrip, code blocks roundtrip
- **Error handling** (3 tests): injection fail + outbound ok, sender fail + inbound ok, both fail
- **hasMedia field** (3 tests): false for text-only, true for media, false for osai-to-TG

Существующие тесты T-006 (46 tests) и T-007 (38 tests) проходят без изменений -- backward compatibility сохранена.

## Code Changes

### Files modified

- **`packages/gateway/src/channels/telegram/mirror.ts`**
  - Обновлён header (T-006 + T-007 + T-008)
  - `MirrorEngineConfig`: добавлены `injector`, `mediaDownloader`, `maxMediaSize`
  - `MirrorMessageEvent`: добавлено поле `hasMedia`
  - Новые типы: `TelegramMediaMessage`, `TelegramMediaInfo`, `MediaDownloader`, `MirrorEngineStats`
  - `GatewayInjector.injectMessage`: добавлен параметр `mediaAttachment`
  - `MirrorEngine`: добавлены поля `injector`, `mediaDownloader`, `maxMediaSize`, stats counters
  - `MirrorEngine.receiveMessage()`: обновлён для поддержки media, опциональный injector parameter
  - `MirrorEngine.injectToOsaI()`: обновлён для передачи mediaAttachment
  - `MirrorEngine.invokeHook()`: добавлено значение по умолчанию для `hasMedia`
  - Новые методы: `getStats()`, `computeUniqueMirrorCount()`, `hasMediaContent()`, `downloadMediaAttachment()`, `buildMediaPlaceholder()`, `inferMediaFilename()`, `inferMimeType()`

- **`packages/gateway/src/channels/telegram/index.ts`**
  - Добавлены barrel exports: `TelegramMediaMessage`, `TelegramMediaInfo`, `MediaDownloader`, `MirrorEngineStats`

### Files added

- **`packages/gateway/src/channels/telegram/__tests__/mirror-bidi.test.ts`** -- 42 теста для T-008

## Architectural Compliance

- **Layered Architecture**: бизнес-логика (media download, dedup) изолирована в MirrorEngine; transport (TelegramSender, GatewayInjector) через интерфейсы
- **Separation of Concerns**: media handling через отдельный `MediaDownloader` интерфейс; MirrorEngine координирует
- **Dependency Inversion**: `MediaDownloader`, `TelegramSender`, `GatewayInjector` -- все через интерфейсы
- **Error Handling**: media download -- best-effort, логирование, продолжение без media
- **TypeScript strict**: все типы корректны, `noUnusedLocals`, `noUnusedParameters`
- **pino logging**: все операции логируются с контекстом
- **ESM**: импорты через `.js` расширения, `verbatimModuleSyntax`
- **Profile compliance**: backend-base правила соблюдены

## Deviations

- `MirrorMessageEvent.hasMedia` добавлено как required field (не optional). Это нарушение backward compatibility для T-006/T-007, но оно допустимо, так как `invokeHook()` устанавливает значение по умолчанию `false`, и все существующие тесты проходят без изменений.
- `GatewayInjector.injectMessage` получил новый optional field `mediaAttachment`. Это backward compatible -- существующие реализации не затронуты.
- `MirrorEngine.receiveMessage()` получил optional `injector` parameter. При отсутствии -- используется `this.injector` из конфигурации. Это сохраняет backward compatibility с T-007 API.

## Known Limitations

- Media handling -- best-effort: нет retry на download failure, нет video/voice транскрипции
- Dedup set -- in-memory: сброс при restart, не persistent
- `maxMediaSize` по умолчанию 10 MB -- не настраивается через osai.json в текущей реализации (только через MirrorEngineConfig)
- Файлы `.js` и `.d.ts.map` в директории `__tests__/` от предыдущих задач не удалены
