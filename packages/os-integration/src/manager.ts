/**
 * OsIntegrationManager -- Unified Facade
 *
 * Provides a single entry point for all OS integration operations.
 * Respects capabilities and manages subsystem lifecycle.
 */

import type {
  OsCapabilities,
  OsIntegrationConfig,
  FileWatcherCallback,
  FileWatcherEvent,
  NotificationUrgency,
  NotificationResult,
  WatcherHandle,
  TrayHandle,
  TrayMenuItem,
  ProcessInfo,
  SystemInfo,
  ServiceOptions,
} from './types.js';
import { getCapabilities } from './capability.js';
import { SystemTray } from './tray.js';
import { NotificationManager } from './notifications.js';
import { FileWatcher } from './file-watcher.js';
import { ProcessManager } from './processes.js';
import { ServiceManager } from './service.js';

/** Logger interface */
interface ManagerLogger {
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
}

const defaultLogger: ManagerLogger = {
  // eslint-disable-next-line no-console
  info: (msg, ...args) => console.info(`[OsIntegrationManager] ${msg}`, ...args),
  // eslint-disable-next-line no-console
  warn: (msg, ...args) => console.warn(`[OsIntegrationManager] ${msg}`, ...args),
  // eslint-disable-next-line no-console
  error: (msg, ...args) => console.error(`[OsIntegrationManager] ${msg}`, ...args),
};

/**
 * OsIntegrationManager -- the main facade for OS integration.
 *
 * Usage:
 * ```typescript
 * const manager = new OsIntegrationManager({ enabled: true });
 * await manager.initialize();
 * // ... use subsystems
 * await manager.shutdown();
 * ```
 */
export class OsIntegrationManager {
  private config: OsIntegrationConfig;
  private capabilities: OsCapabilities;
  private logger: ManagerLogger;

  private tray: SystemTray | null = null;
  private notifications: NotificationManager | null = null;
  private fileWatcher: FileWatcher | null = null;
  private processManager: ProcessManager | null = null;
  private serviceManager: ServiceManager | null = null;

  private initialized = false;

  constructor(config?: OsIntegrationConfig) {
    this.config = config ?? {};
    this.capabilities = getCapabilities();
    this.logger = defaultLogger;
  }

  /**
   * Initialize all OS integration subsystems.
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      this.logger.warn('Already initialized');
      return;
    }

    this.capabilities = getCapabilities();
    this.logger.info('Initializing OS integration...');

    // Initialize system tray (if supported)
    if (this.config.tray?.enabled !== false && this.capabilities.traySupported) {
      this.tray = new SystemTray(this.capabilities);
      this.logger.info('System tray subsystem initialized');
    } else {
      this.logger.warn('System tray not supported, skipping');
    }

    // Initialize notifications (if supported)
    if (this.config.notifications?.enabled !== false && this.capabilities.notificationsSupported) {
      this.notifications = new NotificationManager(this.capabilities);
      this.logger.info('Notifications subsystem initialized');
    } else {
      this.logger.warn('Notifications not supported, skipping');
    }

    // Initialize file watcher (always supported)
    this.fileWatcher = new FileWatcher(this.config.fileWatcher);
    this.logger.info('File watcher subsystem initialized');

    // Initialize process manager (always available)
    this.processManager = new ProcessManager();
    this.logger.info('Process manager subsystem initialized');

    // Initialize service manager (if supported)
    if (this.capabilities.serviceManagementSupported) {
      this.serviceManager = new ServiceManager(this.capabilities.platform);
      this.logger.info('Service manager subsystem initialized');
    } else {
      this.logger.warn('Service management not supported, skipping');
    }

    this.initialized = true;
    this.logger.info('OS integration initialized successfully');
  }

  /**
   * Shutdown all OS integration subsystems gracefully.
   */
  async shutdown(): Promise<void> {
    if (!this.initialized) {
      this.logger.warn('Not initialized, nothing to shut down');
      return;
    }

    this.logger.info('Shutting down OS integration...');

    // Shutdown tray
    if (this.tray) {
      this.tray.destroy();
      this.tray = null;
    }

    // Close all file watchers
    if (this.fileWatcher) {
      await this.fileWatcher.close();
      this.fileWatcher = null;
    }

    // Close notifications
    if (this.notifications) {
      this.notifications.closeAll();
      this.notifications = null;
    }

    // Clear process and service managers (no cleanup needed)
    this.processManager = null;
    this.serviceManager = null;

    this.initialized = false;
    this.logger.info('OS integration shut down successfully');
  }

  /**
   * Check if a specific feature is capable/supported.
   */
  isCapable(feature: string): boolean {
    switch (feature) {
      case 'tray':
        return this.capabilities.traySupported;
      case 'notifications':
        return this.capabilities.notificationsSupported;
      case 'fileWatcher':
        return this.capabilities.fileWatcherSupported;
      case 'serviceManagement':
        return this.capabilities.serviceManagementSupported;
      case 'systemd':
        return this.capabilities.hasSystemd;
      case 'launchd':
        return this.capabilities.hasLaunchd;
      default:
        return false;
    }
  }

  // ---- Tray delegates ----

  /**
   * Create the system tray.
   */
  createTray(menuItems?: TrayMenuItem[], callbacks?: Map<string, (itemId: string) => void>): TrayHandle | null {
    if (!this.tray) return null;
    return this.tray.createTray(menuItems, callbacks);
  }

  /**
   * Get the system tray instance.
   */
  getTray(): SystemTray | null {
    return this.tray;
  }

  /**
   * Update tray status.
   */
  updateTrayStatus(status: 'active' | 'inactive' | 'error'): void {
    this.tray?.updateStatus(status);
  }

  // ---- Notification delegates ----

  /**
   * Get the notification manager instance.
   */
  getNotifications(): NotificationManager | null {
    return this.notifications;
  }

  /**
   * Show a desktop notification.
   */
  async notify(
    title: string,
    body: string,
    urgency?: NotificationUrgency,
    onClick?: (action?: string) => void,
  ): Promise<NotificationResult | null> {
    if (!this.notifications) return null;
    return this.notifications.show(title, body, urgency, onClick);
  }

  // ---- File watcher delegates ----

  /**
   * Get the file watcher instance.
   */
  getFileWatcher(): FileWatcher | null {
    return this.fileWatcher;
  }

  /**
   * Watch a directory for file system events.
   */
  async watchDirectory(
    watchPath: string,
    events?: FileWatcherEvent[],
    callback?: FileWatcherCallback,
  ): Promise<WatcherHandle | null> {
    if (!this.fileWatcher) return null;
    return this.fileWatcher.watchDirectory(watchPath, events, callback);
  }

  // ---- Process manager delegates ----

  /**
   * Get the process manager instance.
   */
  getProcessManager(): ProcessManager | null {
    return this.processManager;
  }

  /**
   * List running processes.
   */
  async listProcesses(filter?: string): Promise<ProcessInfo[]> {
    if (!this.processManager) return [];
    return this.processManager.listProcesses(filter);
  }

  /**
   * Get system information.
   */
  async getSystemInfo(): Promise<SystemInfo | null> {
    if (!this.processManager) return null;
    return this.processManager.getSystemInfo();
  }

  // ---- Service manager delegates ----

  /**
   * Get the service manager instance.
   */
  getServiceManager(): ServiceManager | null {
    return this.serviceManager;
  }

  /**
   * Install osaI as a user service.
   */
  async installService(options: ServiceOptions): Promise<void> {
    if (!this.serviceManager) {
      throw new Error('Service management not supported on this platform');
    }
    return this.serviceManager.install(options);
  }

  /**
   * Uninstall osaI service.
   */
  async uninstallService(): Promise<void> {
    if (!this.serviceManager) {
      throw new Error('Service management not supported on this platform');
    }
    return this.serviceManager.uninstall();
  }

  // ---- Capabilities ----

  /**
   * Get the current OS capabilities.
   */
  getCapabilities(): OsCapabilities {
    return { ...this.capabilities };
  }

  /**
   * Check if the manager has been initialized.
   */
  isInitialized(): boolean {
    return this.initialized;
  }
}
