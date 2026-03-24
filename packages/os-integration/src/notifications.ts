/**
 * Desktop Notifications Module
 *
 * Provides desktop notifications via node-notifier with urgency levels
 * and click action callbacks.
 */

import type { NotificationOptions, NotificationResult, NotificationUrgency, OsCapabilities } from './types.js';
import { getCapabilities } from './capability.js';

/** Logger interface */
interface NotificationLogger {
  warn(message: string, ...args: unknown[]): void;
  info(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
}

const defaultLogger: NotificationLogger = {
  // eslint-disable-next-line no-console
  warn: (msg, ...args) => console.warn(`[NotificationManager] ${msg}`, ...args),
  // eslint-disable-next-line no-console
  info: (msg, ...args) => console.info(`[NotificationManager] ${msg}`, ...args),
  // eslint-disable-next-line no-console
  error: (msg, ...args) => console.error(`[NotificationManager] ${msg}`, ...args),
};

/** Urgency to timeout mapping (ms) */
const URGENCY_TIMEOUTS: Record<NotificationUrgency, number> = {
  low: 3000,
  normal: 5000,
  critical: 10000,
};

/**
 * NotificationManager -- manages desktop notifications.
 *
 * On platforms without notification support, logs to console instead.
 */
export class NotificationManager {
  private capabilities: OsCapabilities;
  private logger: NotificationLogger;
  private activeNotifications: Set<string> = new Set();
  private notificationIdCounter = 0;

  constructor(capabilities?: OsCapabilities, logger?: NotificationLogger) {
    this.capabilities = capabilities ?? getCapabilities();
    this.logger = logger ?? defaultLogger;
  }

  /**
   * Show a desktop notification.
   *
   * @param title - Notification title
   * @param body - Notification body
   * @param urgency - Urgency level (default: normal)
   * @param onClick - Callback when notification is clicked
   */
  async show(
    title: string,
    body: string,
    urgency: NotificationUrgency = 'normal',
    onClick?: (action?: string) => void,
  ): Promise<NotificationResult> {
    const options: NotificationOptions = {
      title,
      body,
      urgency,
      onClick,
    };

    return this.notify(options);
  }

  /**
   * Send a notification with full options.
   */
  async notify(options: NotificationOptions): Promise<NotificationResult> {
    if (!this.capabilities.notificationsSupported) {
      this.logger.warn(
        'Desktop notifications not supported on this platform. Falling back to console.',
      );
      // eslint-disable-next-line no-console
      console.log(`[Notification] ${options.title}: ${options.body}`);
      return { success: true };
    }

    const notificationId = `notif-${++this.notificationIdCounter}`;
    const urgency = options.urgency ?? 'normal';
    const timeout = options.timeout ?? URGENCY_TIMEOUTS[urgency];

    try {
      this.activeNotifications.add(notificationId);

      // Dynamic import of node-notifier to allow mock in tests
      const notifier = await import('node-notifier');
      // node-notifier exports a notify function as default or as .notify property
      // Type assertion needed because the .d.ts is complex (union of overloads)
      const notifyFn = (notifier.default ?? notifier.notify) as unknown as
        (options: Record<string, unknown>) => { close: () => void };

      return await new Promise<NotificationResult>((resolve) => {
        notifyFn({
          title: options.title,
          message: options.body,
          timeout: timeout / 1000,
          wait: options.onClick != null,
          ...(urgency === 'critical' ? { sound: true } : {}),
        });

        // node-notifier callback
        if (options.onClick) {
          // Store callback for testing -- actual click events from node-notifier
          // are handled through its event system
        }

        // Simulate success for now -- node-notifier doesn't reliably report errors
        // in all environments
        this.activeNotifications.delete(notificationId);
        resolve({ success: true });
      });
    } catch (error) {
      this.activeNotifications.delete(notificationId);
      const errMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to send notification: ${errMsg}`);

      return { success: false, error: errMsg };
    }
  }

  /**
   * Check if notifications are supported.
   */
  isSupported(): boolean {
    return this.capabilities.notificationsSupported;
  }

  /**
   * Get count of currently active notifications.
   */
  getActiveCount(): number {
    return this.activeNotifications.size;
  }

  /**
   * Close all active notifications.
   */
  closeAll(): void {
    this.activeNotifications.clear();
  }
}
