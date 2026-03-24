# Task Roadmap: OS Integration

**Version:** v1.0
**Generated:** 2026-03-24
**Feature ID:** F-011
**Status:** Active

---

## 1. Feature Overview

- **Feature ID:** F-011
- **Feature Name:** OS Integration -- Tray, Notifications, File Watcher, Processes
- **Feature Description:** Desktop OS integration: system tray с меню (Open Chat, Sessions, Memory, Skills, Status, Quit), desktop notifications (node-notifier с urgency levels), file system watcher (chokidar, create/modify/delete events), process management (list_processes, get_system_info), service management (systemd --user / launchd). Capability detection (X11 vs Wayland) и fallback на CLI-only.
- **Domain:** os-integration
- **Related Requirements:** FR-050-FR-055, NFR-035, NFR-036
- **Git branch:** feature/os-integration

### Related Requirements Traceability

| Requirement | Description | Covered by Task |
|-------------|-------------|-----------------|
| FR-050 | System tray с меню | T-001, T-002 |
| FR-051 | Desktop notifications с urgency levels | T-003, T-004 |
| FR-052 | File system watcher | T-005, T-006 |
| FR-053 | Process management | T-007 |
| FR-054 | System info (CPU/memory/disk) | T-007 |
| FR-055 | Capability detection (X11 vs Wayland) и fallback | T-002 |
| NFR-035 | Graceful degradation на Wayland | T-002 |
| NFR-036 | Tray/notifications должны работать стабильно | All tasks |

---

## 2. Dependencies

### 2.1 Feature Dependencies

**None**

Фича F-011 OS Integration не имеет зависимостей от других фич. Это standalone пакет, который может разрабатываться параллельно с Gateway (F-002) на Level 1 dependency graph.

### 2.2 Task Dependencies

```
T-001 (Package Setup) ─────────────────────────────────────────────────┐
                                                                        │
T-002 (Capability Detection) ──┬──> T-003 (System Tray)                │
                                │                                        │
                                ├──> T-004 (Desktop Notifications)      │
                                │                                        │
                                └──> T-005 (File Watcher)               │
                                                                         │
T-006 (Process Management + System Info) ──────────────────────────────│
                                                                        │
T-007 (Service Management) ────────────────────────────────────────────│
                                                                        │
T-008 (OsIntegrationManager Facade) ──> зависит от T-003..T-007 ───────┘
                                                                        │
T-009 (Integration Tests) ──> зависит от T-008 ────────────────────────┘
```

**Dependency Summary:**
- **T-001:** None (базовая настройка пакета)
- **T-002:** None (capability detection -- независимая задача)
- **T-003:** зависит от T-001, T-002 (нужен package setup + capability detection)
- **T-004:** зависит от T-001, T-002
- **T-005:** зависит от T-001, T-002
- **T-006:** зависит от T-001
- **T-007:** зависит от T-001
- **T-008:** зависит от T-003, T-004, T-005, T-006, T-007
- **T-009:** зависит от T-008

### 2.3 Development Order

**Параллельная разработка:**
- T-001, T-002 могут разрабатываться параллельно (нет зависимостей)
- После T-001 + T-002: T-003, T-004, T-005, T-006, T-007 могут разрабатываться параллельно (до 5 задач)
- T-008 ждёт завершения T-003..T-007
- T-009 ждёт завершения T-008

**Критический путь:** T-001 -> T-002 -> T-003/T-004/T-005 -> T-008 -> T-009

---

## 3. Task Breakdown

### Task T-001: Package Setup и TypeScript Configuration

**Description:**
Создание структуры пакета `packages/os-integration`, настройка TypeScript, добавление зависимостей (systray2, node-notifier, chokidar, systeminformation), настройка сборки (tsup).

**Estimated Time:** 2-3 hours

**Dependencies:** None

**Scope:**
- **In scope:**
  - Создание директории `packages/os-integration/`
  - `package.json` с зависимостями: systray2, node-notifier, chokidar, systeminformation
  - `tsconfig.json` (extends root config)
  - `tsup.config.ts` для сборки
  - Базовый `src/index.ts` с placeholder exports
  - Типы интерфейсов из архитектуры (OsIntegrationManager, OsCapabilities, etc.)

- **Out scope:**
  - Реализация функционала (другие задачи)
  - Интеграционные тесты

---

### Task T-002: Capability Detection (X11 vs Wayland)

**Description:**
Реализация detection логики для определения доступных OS capabilities: display server (X11/Wayland), tray support, notifications support, platform detection (Linux/macOS).

**Estimated Time:** 2-3 hours

**Dependencies:** None (может параллельно с T-001)

**Scope:**
- **In scope:**
  - `src/capabilities.ts` -- модуль определения capabilities
  - Функция `detectDisplayServer(): "x11" | "wayland" | null`
  - Функция `detectPlatform(): "linux" | "macos"`
  - Функция `isTraySupported(): boolean` (X11 or macOS)
  - Функция `isNotificationsSupported(): boolean`
  - Функция `getCapabilities(): OsCapabilities`
  - Environment variable detection (XDG_SESSION_TYPE, WAYLAND_DISPLAY, DISPLAY)
  - Graceful degradation logging

- **Out scope:**
  - Реализация tray/notifications (другие задачи)

---

### Task T-003: System Tray (systray2)

**Description:**
Реализация system tray на базе systray2. Menu items (Open Chat, Sessions, Memory, Skills, Status, Quit), status indicator, graceful fallback на Wayland.

**Estimated Time:** 3-4 hours

**Dependencies:** T-001, T-002

**Scope:**
- **In scope:**
  - `src/tray.ts` -- модуль system tray
  - Класс `SystemTray` с методами createTray, updateStatus, destroy
  - Tray menu definition (menu items configuration)
  - Status indicator (active/inactive/error icons or text)
  - Event handling (menu item clicks)
  - Wayland fallback: log warning, return null handle
  - Cleanup на shutdown

- **Out scope:**
  - Actions при клике на menu items (делегируются callback'ам)
  - Platform-specific icons (используем стандартные)

---

### Task T-004: Desktop Notifications (node-notifier)

**Description:**
Реализация desktop notifications через node-notifier с поддержкой urgency levels (low, normal, critical) и click actions.

**Estimated Time:** 2-3 hours

**Dependencies:** T-001, T-002

**Scope:**
- **In scope:**
  - `src/notifications.ts` -- модуль notifications
  - Класс `NotificationManager` с методом `notify(options)`
  - Поддержка urgency levels: low, normal, critical
  - Click action callback support
  - Platform-specific notification mechanisms (notify-send на Linux, terminal-notifier на macOS)
  - Error handling при недоступности notifications

- **Out scope:**
  - Rich notifications с images (V2)
  - Action buttons (V2)

---

### Task T-005: File Watcher (chokidar)

**Description:**
Реализация file system watcher на базе chokidar. Поддержка событий create/modify/delete, watcher lifecycle management, unwatch operations.

**Estimated Time:** 3-4 hours

**Dependencies:** T-001, T-002

**Scope:**
- **In scope:**
  - `src/file-watcher.ts` -- модуль file watcher
  - Класс `FileWatcher` с методами watch, unwatch, unwatchAll
  - Поддержка событий: create, modify, delete
  - Recursive watching
  - Watcher handle management (ID-based)
  - Error handling (permission denied, too many files)
  - Max watched files limit (configurable)

- **Out scope:**
  - @parcel/watcher migration (V2)
  - Content diffing

---

### Task T-006: Process Management и System Info

**Description:**
Реализация process listing и system info gathering через systeminformation. CPU/memory/disk metrics, process filtering.

**Estimated Time:** 2-3 hours

**Dependencies:** T-001

**Scope:**
- **In scope:**
  - `src/processes.ts` -- модуль process management
  - Функция `listProcesses(filter?: string): Promise<ProcessInfo[]>`
  - Функция `getSystemInfo(): Promise<SystemInfo>`
  - SystemInfo: CPU usage, memory usage, disk usage, uptime
  - ProcessInfo: pid, name, cpu%, memory%, command
  - Process filtering by name/pattern

- **Out scope:**
  - Process termination (security risk, не планируется)
  - Real-time process monitoring (polling-based only)

---

### Task T-007: Service Management (systemd/launchd)

**Description:**
Реализация service management для установки osaI как user service: systemd --user unit file (Linux), launchd plist (macOS), install/uninstall commands.

**Estimated Time:** 3-4 hours

**Dependencies:** T-001

**Scope:**
- **In scope:**
  - `src/service.ts` -- модуль service management
  - Класс `ServiceManager` с методами installService, uninstallService
  - systemd --user unit file generation (osai.service)
  - launchd plist generation (com.osai.osai.plist)
  - Service file installation paths (~/.config/systemd/user/, ~/Library/LaunchAgents/)
  - systemctl/launchctl command execution
  - Platform detection (Linux uses systemd, macOS uses launchd)

- **Out scope:**
  - Auto-start on boot (требует sudo, out of scope)
  - Service status monitoring

---

### Task T-008: OsIntegrationManager Facade

**Description:**
Создание единого фасада OsIntegrationManager, который объединяет все subsystems (tray, notifications, file-watcher, processes, service). Lifecycle management (initialize, shutdown).

**Estimated Time:** 2-3 hours

**Dependencies:** T-003, T-004, T-005, T-006, T-007

**Scope:**
- **In scope:**
  - `src/manager.ts` -- главный фасад
  - Класс `OsIntegrationManager` реализующий интерфейс из архитектуры
  - Aggregation всех subsystems
  - `initialize()`: инициализация всех subsystems с capability checks
  - `shutdown()`: graceful shutdown всех subsystems
  - `src/index.ts`: публичные exports
  - Конфигурация через OsIntegrationConfig interface

- **Out scope:**
  - REST API endpoints (часть Gateway)
  - WebSocket integration

---

### Task T-009: Integration Tests

**Description:**
Интеграционные тесты для OsIntegrationManager и всех subsystems. Platform-specific testing, mock-based testing для tray/notifications, real testing для file-watcher/processes.

**Estimated Time:** 3-4 hours

**Dependencies:** T-008

**Scope:**
- **In scope:**
  - `tests/integration/os-integration.test.ts`
  - Tests для OsIntegrationManager lifecycle
  - Tests для capability detection
  - Tests для file watcher (real temp directories)
  - Tests для process listing
  - Tests для system info
  - Mock tests для tray (cannot test in CI)
  - Mock tests для notifications
  - Platform-specific test conditions

- **Out scope:**
  - E2E tests (отдельная фаза)
  - Service management tests (требуют реальной установки)

---

## 4. Test Strategy (TDD)

### 4.1 Test Types per Task

| Task | Unit Tests | Integration Tests | Build & Run |
|------|------------|-------------------|-------------|
| T-001 | TypeScript compile check | Import tests | `pnpm build` |
| T-002 | 5-7 tests | Platform detection | `pnpm build` |
| T-003 | 6-8 tests | Mock tray tests | `pnpm build` |
| T-004 | 5-6 tests | Mock notification tests | `pnpm build` |
| T-005 | 8-10 tests | Real file watcher tests | `pnpm build` |
| T-006 | 6-8 tests | Real process/system tests | `pnpm build` |
| T-007 | 5-6 tests | Mock service tests | `pnpm build` |
| T-008 | 5-7 tests | Full integration tests | `pnpm build` |
| T-009 | -- | Comprehensive integration | `pnpm test` |

### 4.2 Build and Run Verification

**Build Verification:**
```bash
# Сборка пакета
cd packages/os-integration && pnpm build

# Ожидаемый результат:
# - dist/index.js создан
# - dist/index.d.ts создан
# - Нет TypeScript errors
# - Нет import errors
```

**Run Verification:**
```bash
# Проверка импорта
node -e "const osi = require('./dist/index.js'); console.log(typeof osi.OsIntegrationManager);"
# Expected output: "function"

# Проверка capabilities detection
node -e "const {getCapabilities} = require('./dist/capabilities.js'); console.log(getCapabilities());"
# Expected output: JSON с capabilities
```

**Test Verification:**
```bash
# Unit tests
cd packages/os-integration && pnpm test

# Ожидаемый результат:
# - Все tests pass
# - Coverage >= 70%
```

### 4.3 Test Cases per Task

---

#### Task T-001: Package Setup

**Unit Tests:**

| Test ID | Description | Preconditions | Expected Result | Pass/Fail |
|---------|-------------|---------------|-----------------|-----------|
| UT-001-01 | TypeScript compiles without errors | package setup complete | No compilation errors | Build succeeds |
| UT-001-02 | Exports are accessible | build complete | All exports accessible via import | Import works |
| UT-001-03 | Interface types are correct | build complete | Types match architecture spec | Type check passes |

---

#### Task T-002: Capability Detection

**Unit Tests:**

| Test ID | Description | Preconditions | Expected Result | Pass/Fail |
|---------|-------------|---------------|-----------------|-----------|
| UT-002-01 | detectPlatform returns valid value | function exists | Returns "linux" or "macos" | Valid platform |
| UT-002-02 | detectDisplayServer handles X11 | DISPLAY env set | Returns "x11" | "x11" returned |
| UT-002-03 | detectDisplayServer handles Wayland | WAYLAND_DISPLAY set | Returns "wayland" | "wayland" returned |
| UT-002-04 | detectDisplayServer handles headless | No display env | Returns null | null returned |
| UT-002-05 | isTraySupported on X11 | X11 detected | Returns true | true |
| UT-002-06 | isTraySupported on Wayland | Wayland detected | Returns false | false |
| UT-002-07 | getCapabilities returns complete object | functions exist | All fields populated | Complete object |

---

#### Task T-003: System Tray

**Unit Tests:**

| Test ID | Description | Preconditions | Expected Result | Pass/Fail |
|---------|-------------|---------------|-----------------|-----------|
| UT-003-01 | SystemTray class instantiates | T-002 complete | Instance created | Instance exists |
| UT-003-02 | createTray returns handle on X11 | X11 available | TrayHandle returned | Valid handle |
| UT-003-03 | createTray returns null on Wayland | Wayland detected | null returned | null |
| UT-003-04 | updateStatus changes status | tray created | Status updated | Status changed |
| UT-003-05 | destroy cleans up resources | tray created | No memory leaks | Clean exit |
| UT-003-06 | Menu item click triggers callback | tray with callback | Callback invoked | Callback called |

**Integration Tests:**

| Test ID | Description | Preconditions | Expected Result | Pass/Fail |
|---------|-------------|---------------|-----------------|-----------|
| IT-003-01 | Full tray lifecycle | X11 environment | Create -> Update -> Destroy works | No errors |

---

#### Task T-004: Desktop Notifications

**Unit Tests:**

| Test ID | Description | Preconditions | Expected Result | Pass/Fail |
|---------|-------------|---------------|-----------------|-----------|
| UT-004-01 | NotificationManager instantiates | module loaded | Instance created | Instance exists |
| UT-004-02 | notify with low urgency | manager ready | Notification sent | Promise resolves |
| UT-004-03 | notify with normal urgency | manager ready | Notification sent | Promise resolves |
| UT-004-04 | notify with critical urgency | manager ready | Notification sent | Promise resolves |
| UT-004-05 | notify handles errors gracefully | notification fails | Error caught, logged | No throw |
| UT-004-06 | Click callback registered | notify with callback | Callback stored | Callback available |

---

#### Task T-005: File Watcher

**Unit Tests:**

| Test ID | Description | Preconditions | Expected Result | Pass/Fail |
|---------|-------------|---------------|-----------------|-----------|
| UT-005-01 | FileWatcher instantiates | module loaded | Instance created | Instance exists |
| UT-005-02 | watchDirectory returns handle | temp dir exists | WatcherHandle returned | Valid handle |
| UT-005-03 | create event detected | watching dir | Event fired | Callback called |
| UT-005-04 | modify event detected | watching file | Event fired | Callback called |
| UT-005-05 | delete event detected | watching dir | Event fired | Callback called |
| UT-005-06 | unwatch stops watching | watching dir | No more events | Events stop |
| UT-005-07 | unwatchAll clears all | multiple watchers | All cleared | Count = 0 |
| UT-005-08 | Error on non-existent path | bad path | Error handled | No crash |

**Integration Tests:**

| Test ID | Description | Preconditions | Expected Result | Pass/Fail |
|---------|-------------|---------------|-----------------|-----------|
| IT-005-01 | Full watcher lifecycle | temp directory | Watch -> Event -> Unwatch works | Events received |
| IT-005-02 | Recursive watching | nested dirs | Nested events detected | Nested events |
| IT-005-03 | Multiple watchers | multiple dirs | All work independently | Independent |

---

#### Task T-006: Process Management

**Unit Tests:**

| Test ID | Description | Preconditions | Expected Result | Pass/Fail |
|---------|-------------|---------------|-----------------|-----------|
| UT-006-01 | listProcesses returns array | systeminformation loaded | Array returned | Array is array |
| UT-006-02 | listProcesses includes current process | function works | node process found | Found in list |
| UT-006-03 | listProcesses with filter | function works | Filtered results | Filter applied |
| UT-006-04 | getSystemInfo returns object | systeminformation loaded | Object returned | Valid object |
| UT-006-05 | SystemInfo has CPU data | getSystemInfo works | cpu property exists | Has cpu |
| UT-006-06 | SystemInfo has memory data | getSystemInfo works | memory property exists | Has memory |
| UT-006-07 | SystemInfo has disk data | getSystemInfo works | disk property exists | Has disk |

---

#### Task T-007: Service Management

**Unit Tests:**

| Test ID | Description | Preconditions | Expected Result | Pass/Fail |
|---------|-------------|---------------|-----------------|-----------|
| UT-007-01 | ServiceManager instantiates | module loaded | Instance created | Instance exists |
| UT-007-02 | generateSystemdUnit creates valid content | Linux platform | Valid unit file content | Valid format |
| UT-007-03 | generateLaunchdPlist creates valid XML | macOS platform | Valid plist XML | Valid XML |
| UT-007-04 | getServicePath returns correct Linux path | Linux platform | ~/.config/systemd/user/ | Correct path |
| UT-007-05 | getServicePath returns correct macOS path | macOS platform | ~/Library/LaunchAgents/ | Correct path |
| UT-007-06 | installService handles errors | insufficient permissions | Error handled | No crash |

---

#### Task T-008: OsIntegrationManager Facade

**Unit Tests:**

| Test ID | Description | Preconditions | Expected Result | Pass/Fail |
|---------|-------------|---------------|-----------------|-----------|
| UT-008-01 | OsIntegrationManager instantiates | all modules ready | Instance created | Instance exists |
| UT-008-02 | initialize sets up subsystems | capabilities checked | All subsystems ready | All initialized |
| UT-008-03 | initialize respects capabilities | Wayland detected | Tray not initialized | Tray skipped |
| UT-008-04 | shutdown cleans up all subsystems | manager initialized | All cleaned up | All shutdown |
| UT-008-05 | getCapabilities returns capabilities | manager ready | Capabilities object | Valid object |
| UT-008-06 | notify delegates to NotificationManager | manager initialized | Delegation works | Notification sent |
| UT-008-07 | watchDirectory delegates to FileWatcher | manager initialized | Delegation works | Watcher created |

---

#### Task T-009: Integration Tests

**Integration Tests:**

| Test ID | Description | Preconditions | Expected Result | Pass/Fail |
|---------|-------------|---------------|-----------------|-----------|
| IT-009-01 | Full OsIntegrationManager lifecycle | all modules | Initialize -> Use -> Shutdown | No errors |
| IT-009-02 | Capability detection integration | manager instance | Correct capabilities | Accurate detection |
| IT-009-03 | File watcher + manager integration | manager ready | Events via manager | Events received |
| IT-009-04 | Process listing via manager | manager ready | Process list returned | List returned |
| IT-009-05 | System info via manager | manager ready | Info returned | Info returned |
| IT-009-06 | Multiple subsystems concurrent | manager ready | All work together | Concurrent OK |
| IT-009-07 | Graceful degradation on Wayland | Wayland detected | Tray disabled, rest works | Degraded OK |

---

## 5. Implementation Plan per Task

### Task T-001: Package Setup

**Implementation Steps:**

1. Создать директорию `packages/os-integration/`
2. Создать `package.json`:
   - name: `@osai/os-integration`
   - dependencies: systray2, node-notifier, chokidar, systeminformation
   - devDependencies: typescript, tsup, vitest, @types/node
3. Создать `tsconfig.json` extending root config
4. Создать `tsup.config.ts` для ESM + CJS output
5. Создать `src/types.ts` с интерфейсами:
   - OsIntegrationConfig
   - OsCapabilities
   - TrayMenuItem, TrayHandle
   - NotificationOptions
   - WatcherCallback, WatcherHandle
   - ProcessInfo, SystemInfo
6. Создать `src/index.ts` с placeholder exports

**Constraints from Architecture:**
- TypeScript strict mode
- ESM + CJS dual output
- Node.js 20+ compatibility

**Integration Points:**
- Экспортирует интерфейсы для skills-osai (F-007)
- Не имеет входящих зависимостей от других пакетов

---

### Task T-002: Capability Detection

**Implementation Steps:**

1. Создать `src/capabilities.ts`
2. Реализовать `detectPlatform()`:
   - process.platform === 'linux' -> 'linux'
   - process.platform === 'darwin' -> 'macos'
3. Реализовать `detectDisplayServer()`:
   - Check XDG_SESSION_TYPE env
   - Check WAYLAND_DISPLAY env
   - Check DISPLAY env
   - Return appropriate value or null
4. Реализовать `isTraySupported()`:
   - macOS -> true
   - Linux + X11 -> true
   - Linux + Wayland -> false
   - headless -> false
5. Реализовать `isNotificationsSupported()`:
   - Check for notify-send (Linux)
   - Check for terminal-notifier (macOS)
   - Return boolean
6. Реализовать `getCapabilities()` aggregating all checks

**Constraints:**
- Не бросать исключения при недоступности
- Логировать warnings для unsupported features

---

### Task T-003: System Tray

**Implementation Steps:**

1. Создать `src/tray.ts`
2. Определить default menu items:
   - Open Chat
   - Sessions
   - Memory
   - Skills
   - Status (Active/Inactive/Error indicator)
   - Quit
3. Реализовать класс `SystemTray`:
   - constructor(capabilities: OsCapabilities)
   - createTray(menuItems, callbacks): TrayHandle | null
   - updateStatus(status): void
   - destroy(): void
4. Интеграция с systray2:
   - Import systray2
   - Configure icon path
   - Setup menu structure
   - Handle menu clicks
5. Wayland fallback:
   - Check capabilities.tray
   - If false, log warning and return null
6. Cleanup на destroy:
   - Remove tray icon
   - Clear callbacks

**Constraints:**
- Wayland: graceful degradation (no crash)
- Cleanup на shutdown обязателен

---

### Task T-004: Desktop Notifications

**Implementation Steps:**

1. Создать `src/notifications.ts`
2. Реализовать класс `NotificationManager`:
   - constructor(capabilities: OsCapabilities)
   - notify(options: NotificationOptions): Promise<void>
3. Настроить node-notifier:
   - Configure for Linux (notify-send)
   - Configure for macOS (terminal-notifier)
4. Urgency levels:
   - Map to platform-specific urgency flags
   - Linux: --urgency=low/normal/critical
   - macOS: Different sound for critical
5. Click action support:
   - wait: true option
   - Handle click callback
6. Error handling:
   - Catch notification failures
   - Log warning, don't throw

**Constraints:**
- Non-blocking (async)
- Graceful degradation if unavailable

---

### Task T-005: File Watcher

**Implementation Steps:**

1. Создать `src/file-watcher.ts`
2. Реализовать класс `FileWatcher`:
   - constructor(config: FileWatcherConfig)
   - watch(path, events, callback): WatcherHandle
   - unwatch(handleId): void
   - unwatchAll(): void
3. Интеграция с chokidar:
   - Import chokidar.watch
   - Configure options (ignored, persistent, etc.)
4. Event mapping:
   - 'add' -> 'create'
   - 'change' -> 'modify'
   - 'unlink' -> 'delete'
5. Watcher handle management:
   - Map<string, FSWatcher>
   - Generate unique IDs
6. Error handling:
   - Handle ENOENT
   - Handle EMFILE (too many files)
   - Log errors, continue

**Constraints:**
- Max watched files limit (default 100000)
- Handle permission errors gracefully

---

### Task T-006: Process Management

**Implementation Steps:**

1. Создать `src/processes.ts`
2. Реализовать `listProcesses(filter?)`:
   - Use systeminformation.processes()
   - Map to ProcessInfo interface
   - Apply filter if provided
3. Реализовать `getSystemInfo()`:
   - Use systeminformation.cpu()
   - Use systeminformation.mem()
   - Use systeminformation.fsSize()
   - Use systeminformation.time()
   - Map to SystemInfo interface
4. Process filtering:
   - Filter by name (includes)
   - Filter by command (includes)
5. Error handling:
   - Handle permission errors
   - Return empty array on failure

**Constraints:**
- Async operations
- Handle permission denied gracefully

---

### Task T-007: Service Management

**Implementation Steps:**

1. Создать `src/service.ts`
2. Реализовать класс `ServiceManager`:
   - constructor(platform: 'linux' | 'macos')
   - installService(): Promise<void>
   - uninstallService(): Promise<void>
3. systemd unit file (Linux):
   - Generate osai.service content
   - ExecStart pointing to osai binary
   - Install to ~/.config/systemd/user/
   - Run systemctl --user daemon-reload
   - Run systemctl --user enable osai
4. launchd plist (macOS):
   - Generate com.osai.osai.plist
   - ProgramArguments pointing to osai binary
   - Install to ~/Library/LaunchAgents/
   - Run launchctl load
5. Uninstall:
   - systemctl --user disable osai
   - launchctl unload
   - Remove service files
6. Error handling:
   - Handle missing systemctl/launchctl
   - Handle permission errors

**Constraints:**
- User-level services only (no sudo)
- Platform-specific implementation

---

### Task T-008: OsIntegrationManager Facade

**Implementation Steps:**

1. Создать `src/manager.ts`
2. Реализовать класс `OsIntegrationManager`:
   - Private subsystems: tray, notifications, fileWatcher, processes, service
   - Private capabilities: OsCapabilities
3. constructor(config: OsIntegrationConfig):
   - Get capabilities
   - Create subsystem instances (not initialize yet)
4. initialize():
   - Initialize tray (if supported)
   - Initialize notifications (if supported)
   - File watcher ready
   - Process/service managers ready
5. shutdown():
   - Destroy tray
   - Unwatch all files
   - Clear all callbacks
6. Delegate methods:
   - createTray -> SystemTray
   - notify -> NotificationManager
   - watchDirectory -> FileWatcher
   - listProcesses -> process module
   - getSystemInfo -> process module
   - installService/uninstallService -> ServiceManager
7. Обновить `src/index.ts`:
   - Export OsIntegrationManager
   - Export all types

**Constraints:**
- Single entry point for all OS operations
- Respect capabilities

---

### Task T-009: Integration Tests

**Implementation Steps:**

1. Создать `tests/integration/os-integration.test.ts`
2. Setup test fixtures:
   - Temp directories for file watcher tests
   - Mock implementations for tray/notifications
3. OsIntegrationManager lifecycle tests:
   - initialize/shutdown cycle
   - Multiple initialize calls (idempotent)
   - Shutdown without initialize
4. Capability tests:
   - Verify detection logic
   - Platform-specific assertions
5. File watcher integration:
   - Create temp directory
   - Watch for events
   - Create/modify/delete files
   - Verify events received
   - Cleanup
6. Process/system tests:
   - List processes (verify current process)
   - Get system info (verify structure)
7. Tray/notification mock tests:
   - Verify delegation
   - Verify error handling
8. Run tests with `pnpm test`

**Constraints:**
- Tests must pass on both Linux and macOS
- CI-compatible (no real tray required)

---

## 6. Acceptance Criteria per Task

### Task T-001: Package Setup

- [ ] `packages/os-integration/` directory exists
- [ ] `package.json` with all dependencies
- [ ] TypeScript compiles without errors
- [ ] `pnpm build` creates `dist/` directory
- [ ] Types are accessible via import

### Task T-002: Capability Detection

- [ ] `detectPlatform()` returns correct platform
- [ ] `detectDisplayServer()` returns correct display server or null
- [ ] `isTraySupported()` returns boolean based on environment
- [ ] `getCapabilities()` returns complete OsCapabilities object
- [ ] No exceptions thrown on headless systems

### Task T-003: System Tray

- [ ] `SystemTray` class implements createTray, updateStatus, destroy
- [ ] Tray created on X11/macOS
- [ ] Tray returns null on Wayland with warning logged
- [ ] Menu items clickable with callbacks
- [ ] Status indicator updates
- [ ] destroy() cleans up resources

### Task T-004: Desktop Notifications

- [ ] `NotificationManager` class implements notify method
- [ ] All urgency levels work (low, normal, critical)
- [ ] Notifications sent successfully
- [ ] Click callbacks work
- [ ] Errors handled gracefully

### Task T-005: File Watcher

- [ ] `FileWatcher` class implements watch, unwatch, unwatchAll
- [ ] create events detected
- [ ] modify events detected
- [ ] delete events detected
- [ ] unwatch stops watching
- [ ] Error handling for non-existent paths

### Task T-006: Process Management

- [ ] `listProcesses()` returns array of ProcessInfo
- [ ] Filter parameter works
- [ ] Current process found in list
- [ ] `getSystemInfo()` returns valid SystemInfo
- [ ] All metrics populated (CPU, memory, disk)

### Task T-007: Service Management

- [ ] systemd unit file generated correctly
- [ ] launchd plist generated correctly
- [ ] installService() works on respective platform
- [ ] uninstallService() removes service
- [ ] Errors handled gracefully

### Task T-008: OsIntegrationManager Facade

- [ ] `OsIntegrationManager` implements full interface
- [ ] initialize() sets up all subsystems
- [ ] shutdown() cleans up all subsystems
- [ ] Capabilities respected (no tray on Wayland)
- [ ] All methods delegate correctly

### Task T-009: Integration Tests

- [ ] All integration tests pass
- [ ] Coverage >= 70%
- [ ] Tests work on Linux
- [ ] Tests work on macOS (or skip with reason)
- [ ] CI-compatible (no real desktop required)

---

## 7. Quality Expectations

### Coverage Requirements

| Component | Target Coverage |
|-----------|-----------------|
| capabilities.ts | 90%+ |
| tray.ts | 80%+ (mock tests) |
| notifications.ts | 80%+ (mock tests) |
| file-watcher.ts | 85%+ |
| processes.ts | 85%+ |
| service.ts | 75%+ |
| manager.ts | 85%+ |
| **Overall** | **70%+** |

### Task Completion Time

| Task | Estimated | Max |
|------|-----------|-----|
| T-001 | 2-3 hours | 4 hours |
| T-002 | 2-3 hours | 4 hours |
| T-003 | 3-4 hours | 5 hours |
| T-004 | 2-3 hours | 4 hours |
| T-005 | 3-4 hours | 5 hours |
| T-006 | 2-3 hours | 4 hours |
| T-007 | 3-4 hours | 5 hours |
| T-008 | 2-3 hours | 4 hours |
| T-009 | 3-4 hours | 5 hours |
| **Total** | **22-31 hours** | **40 hours** |

### Build and Run Stability

- `pnpm build` must complete without errors
- `pnpm test` must pass all tests
- No memory leaks in long-running scenarios
- Graceful shutdown within 5 seconds

---

## 8. Risks and Edge Cases

### Known Edge Cases

1. **Wayland + GNOME:** systray2 не работает. Fallback: CLI-only mode, логировать warning.
2. **Headless server:** No tray, no notifications. Fallback: Only process management and file watcher.
3. **Too many files to watch:** chokidar may hit EMFILE. Mitigation: configurable limit, graceful error.
4. **Permission denied on system info:** Some metrics may be unavailable. Mitigation: Return partial data, log warning.
5. **systemd not available:** Older Linux distros may not have systemd. Mitigation: Check availability, log error.

### Risky Scenarios

1. **systray2 crash on X11:** Rare but possible. Mitigation: Wrap in try-catch, fallback to no tray.
2. **Notification daemon not running:** Linux without notification daemon. Mitigation: node-notifier falls back to console.
3. **File watcher CPU usage:** Large directories may cause high CPU. Mitigation: Debouncing, ignore patterns.
4. **Service installation fails:** Permission issues. Mitigation: User-level services only, clear error messages.

### Dependency-related Risks

| Dependency | Risk | Mitigation |
|------------|------|------------|
| systray2 | Native module, may fail to build | Pre-built binaries, fallback |
| node-notifier | External dependency (notify-send) | Graceful degradation |
| chokidar | Performance on large dirs | Configurable limits |
| systeminformation | Permission issues | Partial data return |

---

## 9. Notes

### Platform Support

- **Linux (Primary):** Full support on X11, degraded on Wayland
- **macOS (Secondary):** Full support with launchd
- **Windows:** Not supported (out of scope per PROJECT_PROFILE)

### Capability Detection Flow

```
detectPlatform()
    |
    v
detectDisplayServer()  <--  Linux only
    |
    v
isTraySupported()      <--  X11 or macOS only
    |
    v
isNotificationsSupported()
    |
    v
getCapabilities()      <--  Aggregate all
```

### Service Management Notes

- **systemd --user:** Runs as user, starts on login
- **launchd:** Runs as user, starts on login
- No sudo/root required
- Service auto-restart on failure

### Clarifications

1. **Tray icons:** Use simple text/status indicator initially. Custom icons in V2.
2. **Notification sounds:** Platform default. Custom sounds in V2.
3. **File watcher debouncing:** 100ms default. Configurable via OsIntegrationConfig.
4. **Process filtering:** Simple string match. Regex support in V2.

---

## 10. Profile Alignment

**Profile:** ts-system (based on PROJECT_PROFILE domain mapping)
**Fallback Profile:** backend/nodejs

**Profile-specific considerations:**
- Node.js 20+ LTS runtime
- TypeScript 5.x strict mode
- Native modules handling (systray2, better-sqlite3)
- Cross-platform (Linux primary, macOS secondary)
- Desktop integration patterns

---

*End of Task Roadmap: OS Integration v1.0*
