/**
 * @osai/os-integration -- Notifier factory
 *
 * Creates platform-specific notifier adapters.
 */

import type { NotifierAdapter, NotifierAdapterOptions } from "./notification-service.js";
import { getLogger } from "../logger.js";

// ---------------------------------------------------------------------------
// Default adapter using node-notifier
// ---------------------------------------------------------------------------

class NodeNotifierAdapter implements NotifierAdapter {
  private notifier: {
    notify: (
      options: NotifierAdapterOptions,
      callback: (err: Error | null, response: unknown) => void,
    ) => unknown;
  };

  constructor() {
    // Dynamic import-friendly: load node-notifier lazily
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    this.notifier = require("node-notifier") as typeof this.notifier;
  }

  notify(
    options: NotifierAdapterOptions,
    callback: (err: Error | null, response: unknown) => void,
  ): unknown {
    return this.notifier.notify(options, callback);
  }
}

// ---------------------------------------------------------------------------
// Silent adapter for tests / fallback
// ---------------------------------------------------------------------------

class SilentNotifierAdapter implements NotifierAdapter {
  notify(
    _options: NotifierAdapterOptions,
    callback: (err: Error | null, response: unknown) => void,
  ): unknown {
    // Silent mode: immediately succeeds without showing anything
    callback(null, "silent");
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export interface NotifierFactoryConfig {
  /** Force silent mode (no real notifications) */
  silent?: boolean;
}

export function createNotifier(
  config?: NotifierFactoryConfig,
): NotifierAdapter {
  if (config?.silent === true) {
    return new SilentNotifierAdapter();
  }

  try {
    return new NodeNotifierAdapter();
  } catch (err) {
    const logger = getLogger("notifications");
    const message =
      err instanceof Error ? err.message : String(err);
    logger.warn(
      { error: message },
      "node-notifier unavailable, falling back to silent mode",
    );
    return new SilentNotifierAdapter();
  }
}
