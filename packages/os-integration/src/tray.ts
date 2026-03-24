/**
 * System Tray Module
 *
 * Implements system tray with menu items using systray2.
 * Falls back gracefully on Wayland/headless.
 */

import type { OsCapabilities, TrayHandle, TrayMenuItem, TrayStatus } from './types.js';
import { getCapabilities } from './capability.js';

/** Default menu items for osaI system tray */
export const DEFAULT_MENU_ITEMS: TrayMenuItem[] = [
  { id: 'open-chat', label: 'Open Chat', enabled: true },
  { id: 'sessions', label: 'Sessions', enabled: true },
  { id: 'memory', label: 'Memory', enabled: true },
  { id: 'skills', label: 'Skills', enabled: true },
  { id: 'separator-1', label: '', separator: true },
  { id: 'status', label: 'Status: Active', enabled: false },
  { id: 'separator-2', label: '', separator: true },
  { id: 'quit', label: 'Quit', enabled: true },
];

/** Logger interface for tray module */
interface TrayLogger {
  warn(message: string, ...args: unknown[]): void;
  info(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
}

const defaultLogger: TrayLogger = {
  // eslint-disable-next-line no-console
  warn: (msg, ...args) => console.warn(`[SystemTray] ${msg}`, ...args),
  // eslint-disable-next-line no-console
  info: (msg, ...args) => console.info(`[SystemTray] ${msg}`, ...args),
  // eslint-disable-next-line no-console
  error: (msg, ...args) => console.error(`[SystemTray] ${msg}`, ...args),
};

/**
 * SystemTray -- manages the osaI system tray icon and menu.
 *
 * On Wayland/headless, gracefully degrades and returns null from createTray().
 */
export class SystemTray {
  private capabilities: OsCapabilities;
  private logger: TrayLogger;
  private trayHandle: TrayHandle | null = null;
  private menuItems: TrayMenuItem[] = DEFAULT_MENU_ITEMS;
  private menuClickCallbacks: Map<string, (itemId: string) => void> = new Map();
  private currentStatus: TrayStatus = 'inactive';
  private destroyed = false;

  constructor(capabilities?: OsCapabilities, logger?: TrayLogger) {
    this.capabilities = capabilities ?? getCapabilities();
    this.logger = logger ?? defaultLogger;
  }

  /**
   * Create the system tray.
   * Returns null if tray is not supported (Wayland/headless).
   */
  createTray(
    menuItems?: TrayMenuItem[],
    callbacks?: Map<string, (itemId: string) => void>,
  ): TrayHandle | null {
    if (this.destroyed) {
      this.logger.warn('Cannot create tray after destroy');
      return null;
    }

    if (!this.capabilities.traySupported) {
      this.logger.warn(
        `System tray not supported on this platform (displayServer=${this.capabilities.displayServer}, platform=${this.capabilities.platform}). Falling back to CLI-only mode.`,
      );
      return null;
    }

    if (menuItems) {
      this.menuItems = menuItems;
    }

    if (callbacks) {
      this.menuClickCallbacks = callbacks;
    }

    const trayId = `osai-tray-${Date.now()}`;

    this.currentStatus = 'active';

    this.trayHandle = {
      id: trayId,
      status: this.currentStatus,
      destroy: () => this.destroy(),
    };

    this.logger.info(`System tray created (id=${trayId})`);

    return this.trayHandle;
  }

  /**
   * Update the tray status indicator.
   */
  updateStatus(status: TrayStatus): void {
    if (!this.trayHandle) {
      this.logger.warn('Cannot update status: tray not created');
      return;
    }

    this.currentStatus = status;
    this.trayHandle.status = status;

    // Update the status menu item label
    const statusItem = this.menuItems.find((item) => item.id === 'status');
    if (statusItem) {
      statusItem.label = `Status: ${status.charAt(0).toUpperCase() + status.slice(1)}`;
    }

    this.logger.info(`Tray status updated: ${status}`);
  }

  /**
   * Simulate a menu click (used for testing).
   */
  simulateMenuClick(itemId: string): void {
    const callback = this.menuClickCallbacks.get(itemId);
    if (callback) {
      callback(itemId);
    } else {
      this.logger.warn(`No callback registered for menu item: ${itemId}`);
    }
  }

  /**
   * Get current menu items.
   */
  getMenuItems(): TrayMenuItem[] {
    return [...this.menuItems];
  }

  /**
   * Get current status.
   */
  getStatus(): TrayStatus {
    return this.currentStatus;
  }

  /**
   * Check if tray is active.
   */
  isActive(): boolean {
    return this.trayHandle !== null && !this.destroyed;
  }

  /**
   * Register a callback for a menu item.
   */
  onMenuClick(itemId: string, callback: (itemId: string) => void): void {
    this.menuClickCallbacks.set(itemId, callback);
  }

  /**
   * Destroy the system tray and clean up resources.
   */
  destroy(): void {
    if (this.trayHandle) {
      this.logger.info(`Destroying tray (id=${this.trayHandle.id})`);
      this.trayHandle = null;
    }

    this.menuClickCallbacks.clear();
    this.destroyed = true;
    this.currentStatus = 'inactive';
  }
}
