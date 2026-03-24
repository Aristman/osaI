/**
 * @osai/os-integration -- Desktop OS integration for osaI
 *
 * Provides: system tray, desktop notifications, file watcher,
 * process management, system info, and service management.
 */

// Types
export type {
  DisplayServer,
  Platform,
  NotificationUrgency,
  TrayStatus,
  FileWatcherEvent,
  OsCapabilities,
  TrayMenuItem,
  TrayHandle,
  NotificationOptions,
  NotificationResult,
  FileWatcherEventPayload,
  FileWatcherCallback,
  WatcherHandle,
  FileWatcherConfig,
  ProcessInfo,
  SystemInfo,
  ServiceStatus,
  ServiceOptions,
  OsIntegrationConfig,
} from './types.js';

// Capability Detection
export {
  detectDisplayServer,
  detectPlatform,
  detectDesktopEnvironment,
  hasSystemd,
  hasLaunchd,
  getCapabilities,
} from './capability.js';

// System Tray
export { SystemTray } from './tray.js';

// Desktop Notifications
export { NotificationManager } from './notifications.js';

// File Watcher
export { FileWatcher } from './file-watcher.js';

// Process Management
export { ProcessManager } from './processes.js';

// Service Management
export { ServiceManager } from './service.js';

// Facade
export { OsIntegrationManager } from './manager.js';
