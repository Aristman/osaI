# Implementation Report -- T-004

## Implemented Scope

- `ProcessService` класс в `src/processes/process-service.ts`
- `ProcessesProvider` interface для абстракции systeminformation.processes()
- `listProcesses(filter?)` -- список процессов с опциональной фильтрацией
- `filterProcesses()` -- чистая функция фильтрации (отдельно экспортирована)
- Фильтрация: name (substring, case-insensitive), pid (exact), cpuGt, memGt
- Сортировка по умолчанию: CPU usage desc
- Кэширование: 3s TTL (параметр `cacheTtlMs`)
- Barrel export через `src/processes/index.ts`

## Tests Implemented

- `src/__tests__/processes/process-service.test.ts` -- 14 тестов:
  - listProcesses: все процессы, сортировка по CPU desc, поля pid/name/cpu/mem/status
  - Кэширование: cache hit, cache miss после TTL, invalidateCache
  - Фильтрация: name (substring), name (case-insensitive), pid (exact), cpuGt, memGt, AND-combined
  - Пустой фильтр = все процессы
  - Error handling: provider failure -> throw
- `src/__tests__/processes/filter.test.ts` -- 11 тестов:
  - Чистая логика фильтрации без моков
  - Empty filter, name filter, case-insensitive, pid, cpuGt, memGt, AND logic
  - No mutation of original array, empty list, undefined filter values

## Code Changes

### Files added
- `packages/os-integration/src/processes/process-service.ts`
- `packages/os-integration/src/processes/index.ts`
- `packages/os-integration/src/__tests__/processes/process-service.test.ts`
- `packages/os-integration/src/__tests__/processes/filter.test.ts`

### Files modified
- Нет

## Architectural Compliance

- ProcessesProvider interface для тестабельности
- Формат systeminformation.processes(): `result.list[]` (не `result.all[]` -- это число)
- Кэширование 3s TTL
- `filterProcesses` -- чистая функция, экспортирована отдельно
- Охватывает AC-020-5

## Deviations

ROADMAP предписывал отдельные `types.ts` и `filter.ts` файлы в директории `processes/`. Файл `types.ts` не создан -- типы ProcessInfo/ProcessFilter определены в корневом `src/types.ts`. Файл `filter.ts` не создан как отдельный модуль -- функция `filterProcesses` экспортирована из `process-service.ts`. Это соответствует принципу YAGNI -- отдельный файл избыточен для одной функции.

## Known Limitations

- `systeminformation.processes()` может быть медленным на системах с 1000+ процессов (mitigated by 3s cache)
- Поля `cpu` и `mem` из systeminformation могут быть менее точными на некоторых ОС
