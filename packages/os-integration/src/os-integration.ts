/**
 * @osai/os-integration -- OsIntegration facade
 *
 * Single entry point for all OS Integration features.
 * Wraps NotificationService, SystemInfoService, and ProcessService.
 */

import { NotificationService, createNotifier } from "./notifications/index.js";
import {
  SystemInfoService,
  type SystemInfoProvider,
} from "./system-info/index.js";
import { ProcessService, type ProcessesProvider } from "./processes/index.js";
import { detectPlatform } from "./os-detect.js";
import { getLogger } from "./logger.js";
import type {
  NotificationOptions,
  NotificationResult,
  FullSystemInfo,
  ProcessInfo,
  ProcessFilter,
  Platform,
} from "./types.js";

// ---------------------------------------------------------------------------
// OsIntegration configuration
// ---------------------------------------------------------------------------

export interface OsIntegrationConfig {
  /** Force silent mode for notifications (default: false) */
  silentNotifications?: boolean;
  /** appUserModelId for Windows Toast (default: "osaI") */
  appUserModelId?: string;
  /** System info cache TTL in ms (default: 5000) */
  systemInfoCacheTtlMs?: number;
  /** Process list cache TTL in ms (default: 3000) */
  processCacheTtlMs?: number;
}

// ---------------------------------------------------------------------------
// Real providers (lazy-loaded to avoid importing at module level)
// ---------------------------------------------------------------------------

function createRealSystemInfoProvider(): SystemInfoProvider {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const si = require("systeminformation") as SystemInfoProvider;
  return si;
}

function createRealProcessesProvider(): ProcessesProvider {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const si = require("systeminformation") as ProcessesProvider & SystemInfoProvider;
  return si;
}

// ---------------------------------------------------------------------------
// OsIntegration facade
// ---------------------------------------------------------------------------

export class OsIntegration {
  private readonly notifications: NotificationService;
  private readonly systemInfo: SystemInfoService;
  private readonly processes: ProcessService;
  private readonly platform: Platform;

  constructor(config?: OsIntegrationConfig) {
    const silent = config?.silentNotifications ?? false;

    const notifier = createNotifier({ silent });
    this.notifications = new NotificationService(notifier, {
      appUserModelId: config?.appUserModelId,
    });

    let systemInfoProvider: SystemInfoProvider;
    let processesProvider: ProcessesProvider;

    try {
      systemInfoProvider = createRealSystemInfoProvider();
      processesProvider = createRealProcessesProvider();
    } catch (err) {
      const logger = getLogger("os-integration");
      const message =
        err instanceof Error ? err.message : String(err);
      logger.warn(
        { error: message },
        "systeminformation unavailable, services will fail on first call",
      );
      // Create minimal stubs that throw clear errors
      systemInfoProvider = createStubSystemInfoProvider(message);
      processesProvider = createStubProcessesProvider(message);
    }

    this.systemInfo = new SystemInfoService(systemInfoProvider, {
      cacheTtlMs: config?.systemInfoCacheTtlMs,
    });
    this.processes = new ProcessService(processesProvider, {
      cacheTtlMs: config?.processCacheTtlMs,
    });

    this.platform = detectPlatform();
  }

  /**
   * Send a desktop notification.
   */
  async notify(
    options: NotificationOptions,
  ): Promise<NotificationResult> {
    return this.notifications.notify(options);
  }

  /**
   * Get full system information (CPU, memory, disk).
   */
  async getSystemInfo(): Promise<FullSystemInfo> {
    return this.systemInfo.getSystemInfo();
  }

  /**
   * List processes, optionally filtered.
   */
  async listProcesses(filter?: ProcessFilter): Promise<ProcessInfo[]> {
    return this.processes.listProcesses(filter);
  }

  /**
   * Detect the current platform (linux or windows).
   */
  getPlatform(): Platform {
    return this.platform;
  }

  /**
   * Invalidate all caches.
   */
  invalidateCaches(): void {
    this.systemInfo.invalidateCache();
    this.processes.invalidateCache();
  }
}

// ---------------------------------------------------------------------------
// Stub providers for graceful degradation
// ---------------------------------------------------------------------------

function createStubSystemInfoProvider(reason: string): SystemInfoProvider {
  const err = new Error(`systeminformation unavailable: ${reason}`);
  return {
    cpu: async () => { throw err; },
    cpuCurrentSpeed: async () => { throw err; },
    cpuTemperature: async () => { throw err; },
    mem: async () => { throw err; },
    diskLayout: async () => { throw err; },
    fsSize: async () => { throw err; },
    loadavg: async () => null,
  };
}

function createStubProcessesProvider(reason: string): ProcessesProvider {
  const err = new Error(`systeminformation unavailable: ${reason}`);
  return {
    processes: async () => { throw err; },
  };
}
