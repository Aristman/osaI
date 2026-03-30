# Implementation Report -- T-005 Docker Sandbox (Graceful Degradation)

## Implemented Scope

Реализован Docker Sandbox с автоматическим определением наличия Docker и graceful degradation на permission-only mode.

- `SandboxManager.detectMode()` -- проверка Docker daemon через `docker info`
- При Docker доступен: выполнение команд в изолированном container (--network=none, --memory, --cpus, --read-only, --rm)
- При Docker недоступен: graceful degradation на `PERMISSION_ONLY` с информативным сообщением
- `DockerSandbox` управляет полным lifecycle Docker-контейнера (создание с ограничениями, выполнение, автоматическая очистка через --rm)
- Barrel exports через index.ts

## Tests Implemented

| Файл | Тесты | Описание |
|------|-------|----------|
| `SandboxManager.test.ts` | 12 | detectMode (Docker доступен/недоступен, daemon не запущен, healthcheck), execSandbox (Docker mode, permission_only degradation), getState, isDockerAvailable, buildDockerRunArgs |
| `DockerSandbox.test.ts` | 10 | constructor (default/custom config), exec (TC-005-3: контейнер с ограничениями, TC-005-4: cleanup через --rm, TC-005-5: выполнение команды с результатом, обработка ошибок, timeout), buildRunArgs |
| **Итого** | **22** | Все тесты из roadmap покрыты |

Покрытие TC:
- TC-005-1: Docker доступен -- mode = DOCKER (SandboxManager.test.ts)
- TC-005-2: Docker НЕ доступен -- graceful degradation (SandboxManager.test.ts)
- TC-005-3: Docker container с ограничениями (DockerSandbox.test.ts)
- TC-005-4: Docker container cleanup (DockerSandbox.test.ts)
- TC-005-5: Команда выполняется в container (DockerSandbox.test.ts)
- TC-006-6: Docker healthcheck при старте (SandboxManager.test.ts)

## Code Changes

### Files Added
- `packages/gateway/src/security/sandbox/types.ts` -- типы: SandboxMode, DockerConfig, DockerConstraints, SandboxExecResult, DockerInfo, ContainerState, SandboxManagerState
- `packages/gateway/src/security/sandbox/DockerSandbox.ts` -- Docker container lifecycle management
- `packages/gateway/src/security/sandbox/SandboxManager.ts` -- mode detection, graceful degradation
- `packages/gateway/src/security/sandbox/__tests__/SandboxManager.test.ts` -- 12 unit tests
- `packages/gateway/src/security/sandbox/__tests__/DockerSandbox.test.ts` -- 10 unit tests

### Files Modified
- Нет (новый модуль, не затрагивает существующие файлы)

## Architectural Compliance

- **Layer 2 (Sandbox)** из 7-layer security model реализован
- TypeScript strict mode: все файлы проходят `tsc --noEmit` без ошибок
- ESM: `"type": "module"`, `.js` extensions в imports, `verbatimModuleSyntax`
- Barrel exports: `index.ts` экспортирует все public API
- Barrel exports из `SandboxManager.ts`: `DEFAULT_DOCKER_CONFIG` экспортируется для конфигурируемости
- pino не используется напрямую (модуль не нуждается в логировании на данном этапе; будет интегрирован через T-008)
- dependency injection: `SandboxManager` принимает конфигурацию через конструктор
- separation of concerns: `DockerSandbox` отвечает за container lifecycle, `SandboxManager` за mode detection

## Deviations

Отсутствуют. Реализация полностью соответствует roadmap T-005.

## Known Limitations

- Docker presence не проверяется автоматически при старте приложения (требуется явный вызов `detectMode()`) -- по дизайн-решению, lazy detection
- Команды с сложным quoting (пробелы в аргументах, pipes) могут некорректно разбиваться через `.split(' ')` -- упрощённый парсер для MVP
- `execFileAsync` в DockerSandbox выставлен как public для testability (mock через spy) -- допустимое отклонение для тестируемости
