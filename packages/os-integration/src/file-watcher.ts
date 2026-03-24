/**
 * File Watcher Module
 *
 * Provides file system watching using chokidar.
 * Supports create/modify/delete events with debouncing.
 */

import type { FileWatcherCallback, FileWatcherConfig, FileWatcherEvent, WatcherHandle } from './types.js';
import * as fs from 'node:fs';

/** Logger interface */
interface FileWatcherLogger {
  warn(message: string, ...args: unknown[]): void;
  info(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
  debug(message: string, ...args: unknown[]): void;
}

const defaultLogger: FileWatcherLogger = {
  // eslint-disable-next-line no-console
  warn: (msg, ...args) => console.warn(`[FileWatcher] ${msg}`, ...args),
  // eslint-disable-next-line no-console
  info: (msg, ...args) => console.info(`[FileWatcher] ${msg}`, ...args),
  // eslint-disable-next-line no-console
  error: (msg, ...args) => console.error(`[FileWatcher] ${msg}`, ...args),
  // eslint-disable-next-line no-console
  debug: (msg, ...args) => console.debug(`[FileWatcher] ${msg}`, ...args),
};

/** Chokidar FSWatcher interface */
interface ChokidarWatcher {
  on(event: string, callback: (...args: unknown[]) => void): ChokidarWatcher;
  close(): Promise<void>;
  add(path: string): ChokidarWatcher;
  unwatch(path: string): ChokidarWatcher;
  getWatched(): Record<string, string[]>;
}

/**
 * FileWatcher -- manages file system watchers using chokidar.
 *
 * Supports multiple concurrent watchers with ID-based handles.
 */
export class FileWatcher {
  private config: Required<FileWatcherConfig>;
  private logger: FileWatcherLogger;
  private watchers: Map<string, { watcher: ChokidarWatcher; path: string }> = new Map();
  private watcherIdCounter = 0;
  private closed = false;

  constructor(config?: FileWatcherConfig, logger?: FileWatcherLogger) {
    this.config = {
      debounceMs: config?.debounceMs ?? 100,
      maxFiles: config?.maxFiles ?? 100_000,
      persistent: config?.persistent ?? true,
      ignoreInitial: config?.ignoreInitial ?? true,
      ignored: config?.ignored ?? [],
    };
    this.logger = logger ?? defaultLogger;
  }

  /**
   * Watch a directory or file for changes.
   *
   * @param watchPath - Path to watch
   * @param events - Event types to listen for (default: all)
   * @param callback - Callback invoked on file events
   * @returns WatcherHandle or null on error
   */
  async watchDirectory(
    watchPath: string,
    events?: FileWatcherEvent[],
    callback?: FileWatcherCallback,
  ): Promise<WatcherHandle | null> {
    if (this.closed) {
      this.logger.warn('Cannot create watcher after close');
      return null;
    }

    // Validate path exists
    try {
      const stat = fs.statSync(watchPath);
      if (!stat.isDirectory() && !stat.isFile()) {
        this.logger.error(`Path is neither a file nor directory: ${watchPath}`);
        return null;
      }
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Cannot watch path "${watchPath}": ${errMsg}`);
      return null;
    }

    const watcherId = `watcher-${++this.watcherIdCounter}`;

    try {
      // Dynamic import of chokidar
      const chokidar = await import('chokidar');
      const chokidarWatch = chokidar.watch ?? chokidar.default?.watch;

      if (typeof chokidarWatch !== 'function') {
        throw new Error('chokidar.watch is not a function');
      }

      const watcher = chokidarWatch(watchPath, {
        persistent: this.config.persistent,
        ignoreInitial: this.config.ignoreInitial,
        ignored: this.config.ignored,
        usePolling: false,
        awaitWriteFinish: {
          stabilityThreshold: this.config.debounceMs,
          pollInterval: 50,
        },
      }) as unknown as ChokidarWatcher;

      const eventSet = new Set(events ?? (['create', 'modify', 'delete'] as FileWatcherEvent[]));

      // Map chokidar events to our event types
      watcher.on('add', (...args: unknown[]) => {
        const filePath = args[0] as string;
        if (eventSet.has('create') && callback) {
          this.emitEvent(callback, 'create', filePath);
        }
      });

      watcher.on('change', (...args: unknown[]) => {
        const filePath = args[0] as string;
        if (eventSet.has('modify') && callback) {
          this.emitEvent(callback, 'modify', filePath);
        }
      });

      watcher.on('unlink', (...args: unknown[]) => {
        const filePath = args[0] as string;
        if (eventSet.has('delete') && callback) {
          this.emitEvent(callback, 'delete', filePath);
        }
      });

      watcher.on('error', (...args: unknown[]) => {
        const error = args[0] as Error;
        this.logger.error(`Watcher error for "${watchPath}": ${error.message}`);
      });

      watcher.on('ready', () => {
        this.logger.info(`Watcher ready (id=${watcherId}, path=${watchPath})`);
      });

      this.watchers.set(watcherId, { watcher, path: watchPath });

      const handle: WatcherHandle = {
        id: watcherId,
        path: watchPath,
        close: () => this.unwatch(watcherId),
      };

      return handle;
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to create watcher for "${watchPath}": ${errMsg}`);
      return null;
    }
  }

  /**
   * Stop watching by watcher ID.
   */
  async unwatch(watcherId: string): Promise<void> {
    const entry = this.watchers.get(watcherId);
    if (entry) {
      try {
        await entry.watcher.close();
        this.logger.info(`Unwatched (id=${watcherId}, path=${entry.path})`);
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);
        this.logger.error(`Error closing watcher (id=${watcherId}): ${errMsg}`);
      }
      this.watchers.delete(watcherId);
    }
  }

  /**
   * Stop all watchers.
   */
  async unwatchAll(): Promise<void> {
    const ids = [...this.watchers.keys()];
    await Promise.all(ids.map((id) => this.unwatch(id)));
    this.logger.info(`All watchers closed (${ids.length} total)`);
  }

  /**
   * Get list of active watcher IDs and paths.
   */
  listWatchers(): Array<{ id: string; path: string }> {
    return [...this.watchers.entries()].map(([id, entry]) => ({
      id,
      path: entry.path,
    }));
  }

  /**
   * Get count of active watchers.
   */
  getWatcherCount(): number {
    return this.watchers.size;
  }

  /**
   * Close the file watcher and stop all watching.
   */
  async close(): Promise<void> {
    this.closed = true;
    await this.unwatchAll();
  }

  /**
   * Emit a file event to the callback with file stats.
   */
  private emitEvent(callback: FileWatcherCallback, event: FileWatcherEvent, filePath: string): void {
    let stats: { size: number; mtime: number } | undefined;

    try {
      if (event !== 'delete') {
        const fileStat = fs.statSync(filePath);
        stats = {
          size: fileStat.size,
          mtime: fileStat.mtimeMs,
        };
      }
    } catch {
      // File may have been deleted between event and stat
    }

    callback({ event, path: filePath, stats });
  }
}
