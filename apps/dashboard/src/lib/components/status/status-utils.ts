/**
 * System Status Panel utility functions.
 *
 * Pure functions for formatting, color coding, and status computation.
 * No side effects, no UI dependencies.
 */

// --- Types ---

export interface CpuInfo {
  model: string;
  cores: number;
  speed: number; // MHz
  usage: number; // 0-100 percent
}

export interface MemoryInfo {
  total: number; // bytes
  used: number; // bytes
  free: number; // bytes
  usage: number; // 0-100 percent
}

export interface DiskInfo {
  total: number; // bytes
  used: number; // bytes
  free: number; // bytes
  usage: number; // 0-100 percent
}

export interface SystemInfo {
  cpu: CpuInfo;
  memory: MemoryInfo;
  disk: DiskInfo;
  uptime: number; // seconds
  hostname: string;
  platform: string;
}

export type HealthStatus = 'healthy' | 'degraded' | 'error';

export interface SystemStatusData {
  systemInfo: SystemInfo | null;
  healthStatus: HealthStatus;
  lastUpdated: string | null;
}

// --- Color coding ---

/**
 * Returns a color class based on usage percentage.
 * Green (<70%), Yellow (70-90%), Red (>90%).
 */
export function getUsageColorClass(usage: number): string {
  if (usage > 90) return 'text-osai-error';
  if (usage >= 70) return 'text-osai-warning';
  return 'text-osai-success';
}

/**
 * Returns a background color class based on usage percentage.
 */
export function getUsageBgClass(usage: number): string {
  if (usage > 90) return 'bg-osai-error';
  if (usage >= 70) return 'bg-osai-warning';
  return 'bg-osai-success';
}

/**
 * Returns a progress bar background class (lighter version for track).
 */
export function getUsageBarBgClass(usage: number): string {
  if (usage > 90) return 'bg-red-500/20';
  if (usage >= 70) return 'bg-amber-500/20';
  return 'bg-green-500/20';
}

/**
 * Returns a border color class based on usage percentage.
 */
export function getUsageBorderClass(usage: number): string {
  if (usage > 90) return 'border-osai-error';
  if (usage >= 70) return 'border-osai-warning';
  return 'border-osai-success';
}

// --- Health status ---

/**
 * Returns a color class for the health indicator dot.
 */
export function getHealthColorClass(health: HealthStatus): string {
  switch (health) {
    case 'healthy':
      return 'bg-osai-success';
    case 'degraded':
      return 'bg-osai-warning';
    case 'error':
      return 'bg-osai-error';
  }
}

/**
 * Returns a human-readable label for health status.
 */
export function getHealthLabel(health: HealthStatus): string {
  switch (health) {
    case 'healthy':
      return 'Healthy';
    case 'degraded':
      return 'Degraded';
    case 'error':
      return 'Error';
  }
}

/**
 * Returns a text color class for health status.
 */
export function getHealthTextClass(health: HealthStatus): string {
  switch (health) {
    case 'healthy':
      return 'text-osai-success';
    case 'degraded':
      return 'text-osai-warning';
    case 'error':
      return 'text-osai-error';
  }
}

// --- Formatting ---

/**
 * Format bytes to human-readable string.
 * e.g. 1024 -> "1.00 KB", 1073741824 -> "1.00 GB"
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const k = 1024;
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const value = bytes / Math.pow(k, i);
  return `${value.toFixed(i === 0 ? 0 : 2)} ${units[i]}`;
}

/**
 * Format uptime in seconds to human-readable string.
 * e.g. 90061 -> "1d 1h 1m"
 */
export function formatUptime(seconds: number): string {
  if (seconds < 0) return '0m';
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0 || parts.length === 0) parts.push(`${minutes}m`);

  return parts.join(' ');
}

/**
 * Format CPU speed in MHz to GHz string if >= 1000.
 */
export function formatCpuSpeed(mhz: number): string {
  if (mhz >= 1000) {
    return `${(mhz / 1000).toFixed(2)} GHz`;
  }
  return `${mhz} MHz`;
}

/**
 * Format a percentage value for display.
 */
export function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

// --- Health computation ---

/**
 * Compute overall health status from system info.
 * Rules:
 * - If any metric > 95%: error
 * - If any metric > 85%: degraded
 * - Otherwise: healthy
 */
export function computeHealthStatus(info: SystemInfo): HealthStatus {
  const metrics = [info.cpu.usage, info.memory.usage, info.disk.usage];

  if (metrics.some((m) => m > 95)) return 'error';
  if (metrics.some((m) => m > 85)) return 'degraded';
  return 'healthy';
}

// --- Trend indicator ---

export type TrendDirection = 'up' | 'down' | 'stable';

/**
 * Simple trend detection from two values.
 * Uses a small threshold (2%) to avoid noise.
 */
export function detectTrend(current: number, previous: number): TrendDirection {
  const threshold = 2;
  const diff = current - previous;
  if (diff > threshold) return 'up';
  if (diff < -threshold) return 'down';
  return 'stable';
}

/**
 * Returns a trend indicator character.
 */
export function getTrendIndicator(trend: TrendDirection): string {
  switch (trend) {
    case 'up':
      return '\u2191'; // up arrow
    case 'down':
      return '\u2193'; // down arrow
    case 'stable':
      return '\u2192'; // right arrow
  }
}
