/**
 * @osai/os-integration -- Public API (DOMAIN-009)
 *
 * OS Integration facade: notifications, system info, process management.
 */

// Facade (single entry point)
export { OsIntegration, type OsIntegrationConfig } from "./os-integration.js";

// Platform detection
export {
  detectPlatform,
  isLinux,
  isWindows,
} from "./os-detect.js";

// Individual services (for advanced usage)
export {
  NotificationService,
  createNotifier,
  type NotifierAdapter,
  type NotifierAdapterOptions,
  type NotifierFactoryConfig,
} from "./notifications/index.js";

export {
  SystemInfoService,
  type SystemInfoProvider,
} from "./system-info/index.js";

export {
  ProcessService,
  filterProcesses,
  type ProcessesProvider,
} from "./processes/index.js";

// Types
export type {
  NotificationOptions,
  NotificationResult,
  CpuInfo,
  MemoryInfo,
  DiskInfo,
  FullSystemInfo,
  ProcessInfo,
  ProcessFilter,
  Platform,
  SystemInfoConfig,
  ProcessServiceConfig,
  NotificationServiceConfig,
} from "./types.js";

// Logger setup
export { setLogger } from "./logger.js";
