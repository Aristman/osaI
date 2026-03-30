# Implementation Report -- T-003

## Implemented Scope

Интерактивный TUI для чата на базе ink v5. Реализованы все компоненты из чеклиста T-003 roadmap:

- Область ввода сообщений (input-area)
- Область отображения ответов: text, code blocks (chat-area)
- Статус-бар: chat name, model, connection status (status-bar)
- Главный TUI компонент с управлением состоянием через reducer (app)
- Команда запуска `osai` -- интерактивный режим (chat.ts)
- Streaming display для text ответов
- Ctrl+C -- корректный выход из TUI с WS disconnect
- useGateway hook -- управление WS подключением

Строго в рамках scope T-003. Sidebar чатов и permission prompt UI не реализованы (T-006).

## Tests Implemented

### packages/cli/src/__tests__/tui/tui-state.test.ts (18 tests)
- Reducer: ADD_USER_MESSAGE (3 tests)
- Reducer: ADD_ASSISTANT_BLOCK text (2 tests)
- Reducer: ADD_ASSISTANT_BLOCK code (2 tests)
- Reducer: APPEND_STREAMING_TEXT (1 test)
- Reducer: FINALIZE_STREAMING (1 test)
- Reducer: SET_CONNECTION_STATUS (2 tests)
- Reducer: SET_CHAT_NAME (1 test)
- Reducer: SET_MODEL_NAME (1 test)
- Reducer: SET_TOOL_PROGRESS (1 test)
- Reducer: CLEAR_TOOL_PROGRESS (1 test)
- Reducer: SET_SESSION_ID (1 test)
- Reducer: SET_CHAT_ID (1 test)
- Unknown action handling (1 test)

### packages/cli/src/__tests__/tui/chat-area.test.tsx (9 tests)
- TT-003-03: text block response in chat area
- TT-003-03: user message with prefix
- TT-003-04: code block with language label
- TT-003-04: multiple code blocks
- TT-003-05: tool stream progress with percentage
- TT-003-05: tool stream progress without percentage
- Streaming cursor display (isStreaming true/false)
- Empty chat area

### packages/cli/src/__tests__/tui/input-area.test.tsx (4 tests)
- TT-003-02: placeholder text rendering
- Custom placeholder
- Disabled state when disconnected
- Normal state when enabled

### packages/cli/src/__tests__/tui/status-bar.test.tsx (4 tests)
- TT-003-06: connected status with chat name and model
- TT-003-06: disconnected status
- TT-003-06: reconnecting status
- TT-003-06: failed status

**Total T-003 tests: 35 (all passing)**

## Code Changes

### Files Added
- `packages/cli/src/tui/types.ts` -- типы TUI (ChatMessage, CodeBlock, ConnectionStatus, ToolProgress, TUIState, TUIAction)
- `packages/cli/src/tui/tui-state.ts` -- reducer для управления состоянием TUI
- `packages/cli/src/tui/app.tsx` -- главный TUI компонент (StatusBar + ChatArea + InputArea + useGateway)
- `packages/cli/src/tui/chat-area.tsx` -- область отображения сообщений (text + code blocks + tool progress)
- `packages/cli/src/tui/input-area.tsx` -- область ввода с useInput hook
- `packages/cli/src/tui/status-bar.tsx` -- статус-бар (chat name, model, connection)
- `packages/cli/src/tui/use-gateway.ts` -- React hook для WS подключения к Gateway
- `packages/cli/src/commands/chat.ts` -- команда запуска TUI (runChat)
- `packages/cli/src/__tests__/tui/tui-state.test.ts` -- reducer tests
- `packages/cli/src/__tests__/tui/chat-area.test.tsx` -- ChatArea component tests
- `packages/cli/src/__tests__/tui/input-area.test.tsx` -- InputArea component tests
- `packages/cli/src/__tests__/tui/status-bar.test.tsx` -- StatusBar component tests

### Files Modified
- `packages/cli/tsconfig.json` -- добавлены `jsx: "react-jsx"`, `jsxImportSource: "react"`
- `packages/cli/vitest.config.ts` -- добавлен `@vitejs/plugin-react`, расширен include для `.tsx`
- `packages/cli/bin/osai.js` -- добавлен маршрут для запуска TUI (`osai` без аргументов)
- `packages/cli/src/index.ts` -- добавлены экспорты T-003 типов и компонентов

### Dependencies Added
- `ink@^5.2.1` -- React-подобный TUI framework
- `react@^18.3.1` -- React (peer dependency для ink)
- `ink-testing-library@^4` -- тестирование ink компонентов
- `@types/react@^18` -- типы React
- `@vitejs/plugin-react@^4` -- vitest plugin для JSX

## Architectural Compliance

- ink-компоненты -- функциональные (без классов), в соответствии с roadmap
- Состояние управляется через чистый reducer (tui-state.ts)
- Gateway подключение через кастомный хук (use-gateway.ts)
- Используется ink-testing-library для тестов
- Все типы в отдельном файле (types.ts)
- Ctrl+C обрабатывается через process.on("SIGINT") с корректным cleanup
- Протокол Gateway (T-002) используется для отправки/приёма сообщений

## Deviations

- **bin/osai.js**: Файл был модифицирован другим параллельным процессом (T-004/T-005), что расширило его за пределы первоначального дизайна. Мой вклад: добавление маршрута `osai` (без аргументов) для запуска TUI.
- **init.ts**: Исправлен баг (неиспользуемый `import fs`), который блокировал сборку. Файл относится к T-005.
- **vitest.config.ts**: Требовалось добавить `@vitejs/plugin-react` для поддержки JSX в тестах.

## Known Limitations

- TT-003-02 (пользователь вводит текст и нажимает Enter): Полностью протестировано через render/lastFrame. Симуляция нажатия клавиш через `useInput` не покрывается unit тестами (требует интеграционного тестирования с реальным stdin). Проверена корректность отображения UI, логика onSubmit требует E2E теста.
- TT-003-01 (osai запускает TUI): Компонент TUIApp рендерится корректно в тестах. Полный E2E тест запуска `osai` через child_process не реализован (оставлен для T-006 integration tests).
- TT-003-07 (Ctrl+C): Обработчик SIGINT зарегистрирован, но unit тест не покрывает SIGINT эмиттинг (требует отдельного E2E теста).
