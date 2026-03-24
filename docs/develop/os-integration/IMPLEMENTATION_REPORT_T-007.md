# Implementation Report -- F-011 T-007: Service Management

## Implemented Scope

- `src/service.ts` -- класс ServiceManager
- Platform detection: Linux -> systemd, macOS -> launchd
- `generateSystemdUnit(options)`: генерация systemd --user unit file
  - ExecStart, WorkingDirectory, Restart, Environment
  - Install to ~/.config/systemd/user/osai.service
- `generateLaunchdPlist(options)`: генерация launchd plist
  - ProgramArguments, WorkingDirectory, KeepAlive, RunAtLoad
  - Install to ~/Library/LaunchAgents/com.osai.osai.plist
  - XML escaping для special characters
- `install(options)`: создать директорию, записать файл, enable
- `uninstall()`: disable, stop, daemon-reload, удалить файл
- `start()`, `stop()`, `status()`: управление сервисом
- `isSupported()`: проверка поддержки платформы
- `getServicePath()`, `getServiceFilePath()`: пути к файлам

## Tests Implemented

- UT-007-01: Инстанцирование (2 подтеста)
- UT-007-02: generateSystemdUnit (5 подтестов: content, env, workdir, restart, no-restart)
- UT-007-03: generateLaunchdPlist (4 подтеста: XML, escaping, KeepAlive, no-KeepAlive)
- UT-007-04: getServicePath (3 подтеста: linux, macOS, unknown)
- UT-007-05: isSupported (3 подтеста)
- UT-007-06: install error handling
- status (2 подтеста)
- uninstall (1 подтест)
- Итого: 21 подтест

## Code Changes

**Files added:**
- `packages/os-integration/src/service.ts`
- `packages/os-integration/src/service.test.ts`

**Files modified:**
- `packages/os-integration/src/index.ts` (added ServiceManager export)

## Architectural Compliance

- User-level services only (no sudo)
- Platform-specific (systemd vs launchd)
- Graceful error handling

## Deviations

Нет отклонений.

## Known Limitations

- systemctl/launchctl команды мокируются в тестах
- Нет auto-start on boot (требует sudo, out of scope)
