# Implementation Report -- T-005: Userbot Auth Flow (CLI Integration)

## Implemented Scope

Реализован интерактивный CLI-команда для авторизации Telegram userbot через `osai channel add telegram`. AuthFlow обеспечивает полный цикл: phone -> code -> (optional 2FA password) -> session save -> credentials save.

**В scope:**
- AuthFlow класс: интерактивная авторизация с session reuse
- CLI-команда `runChannelAddTelegram` в packages/cli
- Сохранение credentials в osai.json
- Проверка и переиспользование существующей session
- barrel exports через все уровни (telegram/index.ts -> channels/index.ts -> gateway/src/index.ts)
- pino structured logging

**Out scope (согласно roadmap):**
- Bot token setup -- не реализовано в рамках T-005

## Tests Implemented

21 unit test в `packages/gateway/src/channels/telegram/__tests__/auth-flow.test.ts`:

| Категория | Тесты | Количество |
|---|---|---|
| Construction | Создание, конфигурация | 2 |
| Full auth sequence | phone -> code -> credentials save | 2 |
| 2FA password flow | password required, wrong password | 2 |
| Session reuse | valid session reuse, invalid session fallback | 2 |
| Error cases | bridge fail, invalid phone, empty phone, short phone, phone rejected, wrong code, retry, max retries exceeded | 8 |
| AuthFlowResult | result structure | 1 |
| AuthFlowError | error creation, cause | 2 |
| Bridge lifecycle | start/stop, stop on error | 2 |

Test coverage: все публичные методы и error paths покрыты.

## Code Changes

### Files added

| Файл | Описание |
|---|---|
| `packages/gateway/src/channels/telegram/auth-flow.ts` | AuthFlow класс: интерактивная авторизация Telegram userbot |
| `packages/gateway/src/channels/telegram/__tests__/auth-flow.test.ts` | 21 unit test для AuthFlow |
| `packages/cli/src/commands/channel/add-telegram.ts` | CLI-команда `osai channel add telegram` |
| `packages/cli/src/commands/channel/index.ts` | Barrel export для channel commands |
| `packages/cli/src/commands/index.ts` | Barrel export для commands |
| `docs/develop/F-010/T-005/IMPLEMENTATION_REPORT_T-005.md` | Данный отчёт |

### Files modified

| Файл | Изменение |
|---|---|
| `packages/gateway/src/channels/telegram/index.ts` | Добавлен export AuthFlow, AuthFlowError, типы |
| `packages/gateway/src/channels/index.ts` | Добавлен re-export AuthFlow и связанных типов |
| `packages/gateway/src/index.ts` | Добавлен re-export AuthFlow и связанных типов |
| `packages/cli/package.json` | Добавлены зависимости @osai/gateway, pino |
| `packages/cli/src/index.ts` | Добавлен export runChannelAddTelegram |

## Architectural Compliance

- **ESM modules**: все файлы используют `.js` extension в imports
- **TypeScript strict mode**: все типы явные, no `any`, no `@ts-ignore`
- **pino logging**: structured JSON logging через pino в AuthFlow
- **Barrel exports**: чистые re-exports через index.ts на всех уровнях
- **Separation of concerns**: AuthFlow (бизнес-логика) отделён от CLI (transport)
- **Dependency injection**: prompt функции, sendAuthRequest, startBridge/stopBridge инжектируются через конфигурацию
- **Bridge pattern**: AuthFlow использует UserbotBridge через sendAuthRequest callback

### Конфигурация

- Session dir: `~/.osai/channels/telegram/session/`
- Config file: `~/.osai/osai.json`
- Credentials section: `channels.telegram.userbot`

## Deviations

1. **CLI-команда размещена в `packages/cli/` вместо `packages/gateway/`**: roadmap указывает `packages/cli/src/commands/channel/add-telegram.ts` -- это соответствует архитектуре (DOMAIN-011: CLI Client). Основной AuthFlow класс находится в `packages/gateway/` (DOMAIN-006).

2. **Session файлы не создаются AuthFlow**: AuthFlow делегирует создание session файлов Python Telethon microservice через sendAuthRequest. Тесты "session file in result" убраны, так как физическое создание файлов -- ответственность Python side (T-004).

3. **Профиль `backend-multi` не найден**: DOMAIN-006 назначен профиль `backend-multi`, которого нет в ~/.claude/agents/profiles/. Использован `backend/nodejs` профиль как наиболее подходящий для TypeScript кода. Задача не требует Python кода (только TypeScript CLI и AuthFlow). Это отмечено как ограничение.

## Known Limitations

- CLI команда использует readline вместо ink TUI -- в production будет заменена на ink-based TUI (DOMAIN-011 milestone)
- Password prompting не маскирует ввод (plain readline) -- потребуется readline-prompts или ink для production
- sendAuthRequest в CLI spawning новый Python process для каждого запроса -- в production AuthFlow будет использовать постоянный UserbotBridge instance
- Dynamic path resolution для Python script в CLI -- предполагает, что проект установлен через pnpm workspace

## Verification

```
$ npx tsc --build packages/gateway  -- OK
$ npx tsc --build packages/cli      -- OK
$ npx vitest run packages/gateway/src/channels/telegram/__tests__/auth-flow.test.ts -- 21 passed
$ npx vitest run packages/gateway/src/channels/telegram/__tests__/ -- 175 passed (0 failed)
```
