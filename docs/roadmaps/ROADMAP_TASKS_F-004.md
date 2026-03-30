# Task Roadmap: OS Integration (F-004)

**Version:** v1.0
**Date:** 2026-03-30
**Author:** TDD Planner Agent
**Status:** Active

---

## Feature F-004: OS Integration
**Domain:** DOMAIN-009 | **Dependencies:** F-001 | **Profile:** backend/AGENT_PROFILE_nodejs.md

---

### Dependencies

**Feature Dependencies:**
- **F-001:** Core Infrastructure (blocking) -- pnpm workspace, shared config, SQLite, pino logger

**Task Dependencies:**
```
T-001 (package + types) --> T-002 (notifications)  } parallel
                        --> T-003 (system info)    } parallel
                        --> T-004 (process list)    } parallel
T-002 + T-003 + T-004 --> T-005 (public API + tests)
```

**Development Order:**
- Wave 1: T-001
- Wave 2 (parallel): T-002, T-003, T-004
- Wave 3: T-005

---

### Task T-001: Package Scaffolding + Type Definitions

**Domain:** DOMAIN-009 | **Dependencies:** None (F-001 assumed done)

#### Checklist
- [ ] CODE: `packages/os-integration/package.json`, `tsconfig.json`, `src/index.ts`
- [ ] CODE: `src/types.ts` -- NotificationOptions, SystemInfo, ProcessInfo, ProcessFilter interfaces
- [ ] CODE: `src/os-detect.ts` -- detectPlatform() utility (linux/windows)
- [ ] TEST: `src/__tests__/types.test.ts`, `src/__tests__/os-detect.test.ts`
- [ ] BUILD: `pnpm --filter @osai/os-integration build`

#### Acceptance
- Package компилируется без ошибок (strict mode)
- `detectPlatform()` возвращает `"linux"` или `"windows"` на текущей ОС
- Все TypeScript interfaces экспортируются из barrel
- pino child logger доступен через `src/logger.ts`

---

### Task T-002: Desktop Notifications

**Domain:** DOMAIN-009 | **Dependencies:** T-001

#### Checklist
- [ ] CODE: `src/notifications/notification-service.ts` -- NotificationService class
- [ ] CODE: `src/notifications/linux-notifier.ts` -- Linux-specific (libnotify / D-Bus fallback via node-notifier)
- [ ] CODE: `src/notifications/windows-notifier.ts` -- Windows-specific (Toast via node-notifier)
- [ ] CODE: `src/notifications/factory.ts` -- platform-specific notifier factory
- [ ] TEST: `src/__tests__/notifications/notification-service.test.ts` (unit, mock node-notifier)
- [ ] TEST: `src/__tests__/notifications/factory.test.ts` (unit)
- [ ] BUILD: `pnpm --filter @osai/os-integration build`

#### Acceptance
- `notify({ title, message, icon? })` отправляет desktop notification
- Linux path: использует node-notifier с fallback (silent mode если libnotify недоступен)
- Windows path: использует node-notifier Toast Notifications
- `notify()` возвращает Promise (resolve при успехе, reject при фулл-фейле)
- Graceful degradation: если notification API недоступен -- логирует warning, не бросает
- Охватывает AC-020-1, AC-020-2, AC-020-3 (permission requests, task completion, errors)

---

### Task T-003: System Info (CPU, Memory, Disk)

**Domain:** DOMAIN-009 | **Dependencies:** T-001

#### Checklist
- [ ] CODE: `src/system-info/system-info-service.ts` -- SystemInfoService class
- [ ] CODE: `src/system-info/cpu.ts` -- CPU info (model, cores, speed, load)
- [ ] CODE: `src/system-info/memory.ts` -- Memory info (total, used, free, swap)
- [ ] CODE: `src/system-info/disk.ts` -- Disk info (total, used, free per mount)
- [ ] CODE: `src/system-info/types.ts` -- CpuInfo, MemoryInfo, DiskInfo, FullSystemInfo
- [ ] TEST: `src/__tests__/system-info/system-info-service.test.ts` (unit, mock systeminformation)
- [ ] TEST: `src/__tests__/system-info/cpu.test.ts` (unit)
- [ ] TEST: `src/__tests__/system-info/memory.test.ts` (unit)
- [ ] TEST: `src/__tests__/system-info/disk.test.ts` (unit)
- [ ] BUILD: `pnpm --filter @osai/os-integration build`

#### Acceptance
- `getSystemInfo()` возвращает { cpu, memory, disk } на Linux и Windows
- CPU: model name, cores (physical + logical), current speed, load avg (Linux) / load (Windows)
- Memory: total, used, free в MB, swap total/used
- Disk: массив { mount, total, used, free } для всех дисков
- Результаты кэшируются на 5 секунд (параметр cacheTtlMs)
- systeminformation -- pure JS, никаких native modules
- Охватывает AC-020-4

---

### Task T-004: Process List with Filtering

**Domain:** DOMAIN-009 | **Dependencies:** T-001

#### Checklist
- [ ] CODE: `src/processes/process-service.ts` -- ProcessService class
- [ ] CODE: `src/processes/types.ts` -- ProcessInfo, ProcessFilter interfaces
- [ ] CODE: `src/processes/filter.ts` -- filterProcesses(list, filter) logic
- [ ] TEST: `src/__tests__/processes/process-service.test.ts` (unit, mock systeminformation.processes)
- [ ] TEST: `src/__tests__/processes/filter.test.ts` (unit, pure logic, no mocks)
- [ ] BUILD: `pnpm --filter @osai/os-integration build`

#### Acceptance
- `listProcesses()` возвращает массив процессов: pid, name, cpu, mem, status
- `listProcesses(filter)` поддерживает фильтрацию: по name (substring match), по pid (exact), по cpu>threshold, по mem>threshold
- Пустой фильтр = все процессы
- Результаты кэшируются на 3 секунды
- Сортировка по умолчанию: CPU usage desc
- Охватывает AC-020-5

---

### Task T-005: Public API Integration + Cross-Platform Verification

**Domain:** DOMAIN-009 | **Dependencies:** T-002, T-003, T-004

#### Checklist
- [ ] CODE: `src/os-integration.ts` -- OsIntegration facade (единая точка входа)
- [ ] CODE: `src/index.ts` -- barrel export всех public API
- [ ] TEST: `src/__tests__/os-integration.test.ts` -- integration test фасада
- [ ] TEST: `src/__tests__/cross-platform.test.ts` -- проверка платформенного определения
- [ ] BUILD: `pnpm build` (весь monorepo)
- [ ] BUILD: `pnpm test` (все тесты)

#### Acceptance
- `OsIntegration` фасад экспортирует: `notify()`, `getSystemInfo()`, `listProcesses()`, `detectPlatform()`
- Все методы работают на текущей платформе (Linux или Windows)
- `pnpm build` -- exit code 0, без ошибок TypeScript
- `pnpm test` -- все тесты проходят
- Покрытие тестами > 80% для packages/os-integration
- Graceful degradation: недоступные функции логируют warning, не крашат систему

---

## Build and Run Verification

```bash
pnpm install                    # Workspace dependencies
pnpm --filter @osai/os-integration build   # Package build
pnpm --filter @osai/os-integration test    # Package tests
pnpm build                      # Full monorepo build (exit 0)
pnpm test                       # All tests green
```

## Quality Expectations

- TypeScript strict mode -- обязательно
- Test coverage > 80% для packages/os-integration
- No `any` type, no `console.log` (pino logger)
- Graceful degradation для всех OS-dependent функций
- systeminformation (pure JS) -- никаких native зависимостей
- node-notifier -- кроссплатформенный, fallback на silent mode

## Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| node-notifier не работает на некоторых Linux DE | Medium | Fallback: silent mode + pino warning |
| systeminformation возвращает разные форматы на Linux/Windows | Medium | Абстрактные интерфейсы + адаптация в provider layer |
| Процесс-лист медленный на системах с 1000+ процессов | Low | Кэширование 3s, фильтрация на уровне systeminformation API |
| Notifications блокируются ОС (Focus Assist, Do Not Disturb) | Low | Это ОС-level ограничение, документировать в notes |
| Windows Toast требует appUserModelId | Medium | Параметр в NotificationOptions, default = "osaI" |

## Notes

1. **DEPENDENCIES:** Все задачи зависят от F-001 (Core Infrastructure) -- pnpm workspace, shared types, pino logger, Zod.
2. **SYSTEMINFORMATION:** Pure JS библиотека, никаких native modules. Критично для R-FD-04 mitigation (кроссплатформенные риски).
3. **NODE-NOTIFIER:** Использует libnotify-bin на Linux, Toast на Windows. Graceful degradation при отсутствии.
4. **HOOK INTEGRATION:** `on_desktop_notification` hook point (DOMAIN-002) будет использовать NotificationService из этого пакета. Интеграция -- в F-008.
5. **SKILL TOOLS:** OS Integration skill (DOMAIN-003, T-005) будет вызывать эти API. show_notification, get_system_info, list_processes.
6. **CACHING:** Кэширование system info (5s) и process list (3s) снижает нагрузку при частых вызовах из agent loop.
