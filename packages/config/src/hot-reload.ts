/**
 * Config Hot-Reload Mechanism for osaI
 *
 * File watcher for openclaw.json with subscriber pattern, debouncing,
 * and validation before notifying subscribers.
 * F-003 T-004: Config Hot-Reload Mechanism
 */

import type { OsaIConfig } from '@osai/types';
import { EventEmitter } from 'node:events';

import { loadConfigSync, getConfigPath, readConfigFile, parseConfig, checkPermissions, validateAndNormalize } from './loader.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ConfigChangeEvent {
  newConfig: OsaIConfig;
  oldConfig: OsaIConfig;
  diff: ConfigDiff;
}

export interface ConfigDiff {
  added: string[];
  removed: string[];
  changed: string[];
}

export type ConfigChangeCallback = (event: ConfigChangeEvent) => void;
export type ConfigErrorCallback = (error: Error) => void;
export type Unsubscribe = () => void;

// ---------------------------------------------------------------------------
// Config Diff Utility
// ---------------------------------------------------------------------------

/**
 * Computes a shallow diff between two config objects.
 */
export function computeDiff(oldConfig: OsaIConfig, newConfig: OsaIConfig): ConfigDiff {
  const added: string[] = [];
  const removed: string[] = [];
  const changed: string[] = [];

  const oldKeys = new Set(Object.keys(oldConfig));
  const newKeys = new Set(Object.keys(newConfig));

  for (const key of newKeys) {
    if (!oldKeys.has(key)) {
      added.push(key);
    } else if (JSON.stringify(oldConfig[key as keyof OsaIConfig]) !== JSON.stringify(newConfig[key as keyof OsaIConfig])) {
      changed.push(key);
    }
  }

  for (const key of oldKeys) {
    if (!newKeys.has(key)) {
      removed.push(key);
    }
  }

  return { added, removed, changed };
}

// ---------------------------------------------------------------------------
// Debounce Utility
// ---------------------------------------------------------------------------

/**
 * Creates a debounced version of a function.
 */
export function debounce<T extends (...args: unknown[]) => void>(
  fn: T,
  delayMs: number,
): T & { cancel: () => void } {
  let timer: ReturnType<typeof setTimeout> | null = null;

  const debounced = ((...args: unknown[]) => {
    if (timer !== null) {
      clearTimeout(timer);
    }
    timer = setTimeout(() => {
      timer = null;
      fn(...args);
    }, delayMs);
  }) as T & { cancel: () => void };

  debounced.cancel = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };

  return debounced;
}

// ---------------------------------------------------------------------------
// ConfigWatcher
// ---------------------------------------------------------------------------

export interface ConfigWatcherOptions {
  /** Path to the config file to watch */
  configPath?: string;
  /** Debounce delay in milliseconds (default: 150) */
  debounceMs?: number;
  /** Enable verbose diff logging */
  verbose?: boolean;
  /** Use polling instead of native fs events (useful for tests, NFS) */
  usePolling?: boolean;
  /** Polling interval in ms (default: 100, only if usePolling is true) */
  interval?: number;
}

/**
 * Watches a configuration file for changes and notifies subscribers.
 */
export class ConfigWatcher extends EventEmitter {
  private configPath: string;
  private currentConfig: OsaIConfig | null = null;
  private subscribers: Set<ConfigChangeCallback> = new Set();
  private errorSubscribers: Set<ConfigErrorCallback> = new Set();
  private debouncedNotify: ReturnType<typeof debounce> & { cancel: () => void };
  private verbose: boolean;
  private _watcher: { close: () => Promise<void>; on: (event: string, cb: (arg: unknown) => void) => void } | null = null;
  private _watching = false;
  private usePolling: boolean;
  private pollingInterval: number;

  constructor(options: ConfigWatcherOptions = {}) {
    super();
    this.configPath = options.configPath ?? getConfigPath();
    this.verbose = options.verbose ?? false;
    this.usePolling = options.usePolling ?? false;
    this.pollingInterval = options.interval ?? 100;
    const delayMs = options.debounceMs ?? 150;
    this.debouncedNotify = debounce(() => this.handleFileChange(), delayMs);
  }

  /**
   * Returns the currently loaded configuration.
   */
  get config(): OsaIConfig | null {
    return this.currentConfig;
  }

  /**
   * Returns the path being watched.
   */
  get watchPath(): string {
    return this.configPath;
  }

  /**
   * Whether the watcher is actively watching.
   */
  get isWatching(): boolean {
    return this._watching;
  }

  /**
   * Subscribes to config change events.
   * Returns an unsubscribe function.
   */
  subscribe(callback: ConfigChangeCallback): Unsubscribe {
    this.subscribers.add(callback);
    return () => {
      this.subscribers.delete(callback);
    };
  }

  /**
   * Subscribes to config error events (invalid config, parse errors, etc).
   * Returns an unsubscribe function.
   */
  onError(callback: ConfigErrorCallback): Unsubscribe {
    this.errorSubscribers.add(callback);
    return () => {
      this.errorSubscribers.delete(callback);
    };
  }

  /**
   * Starts watching the configuration file.
   */
  async start(): Promise<void> {
    if (this._watching) {
      return;
    }

    // Load initial config
    try {
      this.currentConfig = loadConfigSync({ configPath: this.configPath });
    } catch {
      // File might not exist yet; that's ok
      this.currentConfig = null;
    }

    // Load chokidar via dynamic import (works in both ESM and CJS)
    let chokidarModule: { watch: (path: string, options: Record<string, unknown>) => { close: () => Promise<void>; on: (event: string, cb: (arg: unknown) => void) => void } } | null = null;
    try {
      chokidarModule = await import('chokidar');
    } catch {
      // chokidar not installed
    }

    if (!chokidarModule) {
      // eslint-disable-next-line no-console
      console.warn('[config] chokidar not available, hot-reload disabled.');
      return;
    }

    try {
      this._watcher = chokidarModule.watch(this.configPath, {
        ignoreInitial: true,
        usePolling: this.usePolling,
        interval: this.pollingInterval,
        awaitWriteFinish: this.usePolling ? undefined : {
          stabilityThreshold: 100,
          pollInterval: 50,
        },
      });

      this._watcher.on('change', () => {
        this.debouncedNotify();
      });

      this._watcher.on('error', (error: unknown) => {
        this.notifyError(error instanceof Error ? error : new Error(String(error)));
      });

      this._watching = true;
      this.emit('start');
    } catch {
      // eslint-disable-next-line no-console
      console.warn('[config] Failed to start file watcher, hot-reload disabled.');
    }
  }

  /**
   * Stops watching and cleans up resources.
   */
  async stop(): Promise<void> {
    this.debouncedNotify.cancel();

    if (this._watcher) {
      await this._watcher.close();
      this._watcher = null;
    }

    this._watching = false;
    this.emit('stop');
    this.removeAllListeners();
  }

  /**
   * Handles a debounced file change event.
   * Public for testing purposes.
   */
  handleFileChange(): void {
    try {
      const content = readConfigFile(this.configPath);
      const data = parseConfig(content, this.configPath);
      checkPermissions(this.configPath);
      const newConfig = validateAndNormalize(data);

      const oldConfig = this.currentConfig;
      this.currentConfig = newConfig;

      if (oldConfig !== null) {
        const diff = computeDiff(oldConfig, newConfig);

        if (this.verbose && (diff.added.length > 0 || diff.removed.length > 0 || diff.changed.length > 0)) {
          // eslint-disable-next-line no-console
          console.log('[config] Configuration changed:', JSON.stringify(diff, null, 2));
        }

        const event: ConfigChangeEvent = { newConfig, oldConfig, diff };

        for (const callback of this.subscribers) {
          try {
            callback(event);
          } catch {
            // Subscriber errors should not break the watcher
          }
        }

        this.emit('change', event);
      }
    } catch (error) {
      this.notifyError(error as Error);
    }
  }

  /**
   * Notifies error subscribers about an error.
   */
  private notifyError(error: Error): void {
    for (const callback of this.errorSubscribers) {
      try {
        callback(error);
      } catch {
        // Error handler errors should not break the watcher
      }
    }

    this.emit('error', error);
  }
}
