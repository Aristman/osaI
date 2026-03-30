/**
 * @osai/os-integration -- Shared type definitions
 *
 * All public interfaces used across OS Integration services.
 */

// ---------------------------------------------------------------------------
// Notification types
// ---------------------------------------------------------------------------

export interface NotificationOptions {
  /** Notification title */
  title: string;
  /** Notification body message */
  message: string;
  /** Optional icon path (absolute) */
  icon?: string;
  /** Optional appUserModelId for Windows Toast (default: "osaI") */
  appUserModelId?: string;
  /** Optional sound name (platform-specific) */
  sound?: string;
  /** Optional wait/timeout in seconds (default: 5) */
  wait?: number;
}

export type NotificationResult =
  | { ok: true }
  | { ok: false; error: string };

// ---------------------------------------------------------------------------
// System Info types
// ---------------------------------------------------------------------------

export interface CpuInfo {
  /** CPU model name */
  model: string;
  /** Physical cores */
  physicalCores: number;
  /** Logical cores (threads) */
  logicalCores: number;
  /** Current clock speed in GHz */
  speed: number;
  /** Average load (Linux: 1/5/15 min; Windows: current %) */
  load: number;
}

export interface MemoryInfo {
  /** Total memory in MB */
  total: number;
  /** Used memory in MB */
  used: number;
  /** Free memory in MB */
  free: number;
  /** Swap total in MB */
  swapTotal: number;
  /** Swap used in MB */
  swapUsed: number;
}

export interface DiskInfo {
  /** Mount point path */
  mount: string;
  /** Filesystem type */
  fsType: string;
  /** Total size in GB */
  totalGb: number;
  /** Used size in GB */
  usedGb: number;
  /** Free size in GB */
  freeGb: number;
  /** Usage percentage (0-100) */
  usedPercent: number;
}

export interface FullSystemInfo {
  cpu: CpuInfo;
  memory: MemoryInfo;
  disk: DiskInfo[];
}

// ---------------------------------------------------------------------------
// Process types
// ---------------------------------------------------------------------------

export interface ProcessInfo {
  /** Process ID */
  pid: number;
  /** Process name */
  name: string;
  /** CPU usage percentage */
  cpu: number;
  /** Memory usage percentage */
  mem: number;
  /** Process status */
  status: string;
}

export interface ProcessFilter {
  /** Filter by name (substring match, case-insensitive) */
  name?: string;
  /** Filter by exact PID */
  pid?: number;
  /** Filter processes with CPU usage > threshold */
  cpuGt?: number;
  /** Filter processes with memory usage > threshold */
  memGt?: number;
}

// ---------------------------------------------------------------------------
// Platform detection
// ---------------------------------------------------------------------------

export type Platform = "linux" | "windows";

// ---------------------------------------------------------------------------
// Service configuration
// ---------------------------------------------------------------------------

export interface SystemInfoConfig {
  /** Cache TTL in milliseconds (default: 5000) */
  cacheTtlMs?: number;
}

export interface ProcessServiceConfig {
  /** Cache TTL in milliseconds (default: 3000) */
  cacheTtlMs?: number;
}

export interface NotificationServiceConfig {
  /** appUserModelId for Windows Toast (default: "osaI") */
  appUserModelId?: string;
}
