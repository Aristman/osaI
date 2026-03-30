/**
 * @osai/os-integration -- NotificationService
 *
 * Cross-platform desktop notification service.
 * Uses node-notifier with graceful degradation.
 */

import type { NotificationOptions, NotificationResult } from "../types.js";
import type { Logger } from "pino";
import { getLogger } from "../logger.js";

// ---------------------------------------------------------------------------
// NotifierAdapter interface (for testability / platform abstraction)
// ---------------------------------------------------------------------------

export interface NotifierAdapter {
  notify(
    options: NotifierAdapterOptions,
    callback: (err: Error | null, response: unknown) => void,
  ): unknown;
}

export interface NotifierAdapterOptions {
  title: string;
  message: string;
  icon?: string;
  appID?: string;
  sound?: string;
  wait?: boolean;
}

// ---------------------------------------------------------------------------
// NotificationService
// ---------------------------------------------------------------------------

export class NotificationService {
  private readonly logger: Logger;
  private readonly adapter: NotifierAdapter;
  private readonly defaultAppUserModelId: string;

  constructor(
    adapter: NotifierAdapter,
    config?: { appUserModelId?: string },
  ) {
    this.adapter = adapter;
    this.defaultAppUserModelId = config?.appUserModelId ?? "osaI";
    this.logger = getLogger("notifications");
  }

  /**
   * Send a desktop notification.
   *
   * Returns a Promise that resolves with the result.
   * Graceful degradation: if notification fails, logs a warning and
   * returns { ok: false, error } instead of throwing.
   */
  async notify(options: NotificationOptions): Promise<NotificationResult> {
    const adapterOptions: NotifierAdapterOptions = {
      title: options.title,
      message: options.message,
      icon: options.icon,
      appID: options.appUserModelId ?? this.defaultAppUserModelId,
      sound: options.sound,
      wait: (options.wait ?? 5) > 0,
    };

    return new Promise<NotificationResult>((resolve) => {
      try {
        this.adapter.notify(adapterOptions, (err: Error | null) => {
          if (err !== null) {
            this.logger.warn(
              { error: err.message },
              "Desktop notification failed (graceful degradation)",
            );
            resolve({ ok: false, error: err.message });
            return;
          }
          this.logger.debug(
            { title: options.title },
            "Desktop notification sent",
          );
          resolve({ ok: true });
        });
      } catch (err) {
        const message =
          err instanceof Error ? err.message : String(err);
        this.logger.warn(
          { error: message },
          "Desktop notification error (graceful degradation)",
        );
        resolve({ ok: false, error: message });
      }
    });
  }
}
