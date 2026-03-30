/**
 * @osai/os-integration -- SystemInfoService
 *
 * Provides CPU, memory, and disk information.
 * Uses systeminformation (pure JS) with caching.
 */

import type {
  CpuInfo,
  MemoryInfo,
  DiskInfo,
  FullSystemInfo,
  SystemInfoConfig,
} from "../types.js";
import type { Logger } from "pino";
import { getLogger } from "../logger.js";

// ---------------------------------------------------------------------------
// Systeminformation module interface (for testability)
// ---------------------------------------------------------------------------

export interface SystemInfoProvider {
  cpu(): Promise<{
    manufacturer: string;
    brand: string;
    physicalCores: number;
    cores: number;
    speed: number;
    speedMin?: number;
    speedMax?: number;
    governors?: string[];
  }>;
  cpuCurrentSpeed(): Promise<{
    avg: number;
    cores: Array<{ cpu: number; speed: number }>;
  }>;
  cpuTemperature(): Promise<{
    main: number | null;
    cores: number[] | null;
  }>;
  mem(): Promise<{
    total: number;
    used: number;
    free: number;
    swapTotal: number;
    swapUsed: number;
  }>;
  diskLayout(): Promise<
    Array<{
      name: string;
      type: string;
      size: number;
      vendor: string;
    }>
  >;
  fsSize(): Promise<
    Array<{
      fs: string;
      type: string;
      size: number;
      used: number;
      available: number;
      mount: string;
    }>
  >;
  loadavg(): Promise<number[] | null>;
}

// ---------------------------------------------------------------------------
// Cache helper
// ---------------------------------------------------------------------------

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

function getCached<T>(cache: CacheEntry<T> | undefined): T | undefined {
  if (cache === undefined) return undefined;
  if (Date.now() > cache.expiresAt) return undefined;
  return cache.data;
}

function setCache<T>(data: T, ttlMs: number): CacheEntry<T> {
  return { data, expiresAt: Date.now() + ttlMs };
}

// ---------------------------------------------------------------------------
// SystemInfoService
// ---------------------------------------------------------------------------

export class SystemInfoService {
  private readonly logger: Logger;
  private readonly provider: SystemInfoProvider;
  private readonly cacheTtlMs: number;
  private infoCache: CacheEntry<FullSystemInfo> | undefined;

  constructor(
    provider: SystemInfoProvider,
    config?: SystemInfoConfig,
  ) {
    this.provider = provider;
    this.cacheTtlMs = config?.cacheTtlMs ?? 5000;
    this.logger = getLogger("system-info");
  }

  /**
   * Get full system information: CPU, memory, disk.
   * Results are cached for cacheTtlMs (default 5s).
   */
  async getSystemInfo(): Promise<FullSystemInfo> {
    const cached = getCached(this.infoCache);
    if (cached !== undefined) {
      this.logger.debug("Returning cached system info");
      return cached;
    }

    try {
      const [cpu, memory, disk] = await Promise.all([
        this.getCpuInfo(),
        this.getMemoryInfo(),
        this.getDiskInfo(),
      ]);

      const info: FullSystemInfo = { cpu, memory, disk };
      this.infoCache = setCache(info, this.cacheTtlMs);
      return info;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : String(err);
      this.logger.warn(
        { error: message },
        "Failed to collect system info (graceful degradation)",
      );
      throw err;
    }
  }

  /**
   * Get CPU information.
   */
  async getCpuInfo(): Promise<CpuInfo> {
    const [cpuData, speedData] = await Promise.all([
      this.provider.cpu(),
      this.provider.cpuCurrentSpeed(),
    ]);

    // Get load average (Linux provides 1/5/15 min, Windows uses current %)
    let load = 0;
    try {
      const loadAvg = await this.provider.loadavg();
      if (loadAvg !== null && loadAvg.length > 0) {
        load = Math.round(loadAvg[0]! * 100) / 100;
      }
    } catch {
      // loadavg may not be available on Windows -- graceful
      load = 0;
    }

    return {
      model: cpuData.brand || cpuData.manufacturer || "Unknown",
      physicalCores: cpuData.physicalCores,
      logicalCores: cpuData.cores,
      speed: speedData.avg / 1000, // MHz -> GHz
      load,
    };
  }

  /**
   * Get memory information.
   */
  async getMemoryInfo(): Promise<MemoryInfo> {
    const mem = await this.provider.mem();

    return {
      total: Math.round(mem.total / 1024 / 1024), // bytes -> MB
      used: Math.round(mem.used / 1024 / 1024),
      free: Math.round(mem.free / 1024 / 1024),
      swapTotal: Math.round(mem.swapTotal / 1024 / 1024),
      swapUsed: Math.round(mem.swapUsed / 1024 / 1024),
    };
  }

  /**
   * Get disk information.
   */
  async getDiskInfo(): Promise<DiskInfo[]> {
    const fsData = await this.provider.fsSize();

    return fsData.map((fs) => {
      const usedPercent =
        fs.size > 0
          ? Math.round((fs.used / fs.size) * 10000) / 100
          : 0;

      return {
        mount: fs.mount,
        fsType: fs.type,
        totalGb: Math.round((fs.size / 1024 / 1024 / 1024) * 100) / 100,
        usedGb: Math.round((fs.used / 1024 / 1024 / 1024) * 100) / 100,
        freeGb:
          Math.round((fs.available / 1024 / 1024 / 1024) * 100) / 100,
        usedPercent,
      };
    });
  }

  /**
   * Invalidate the cache, forcing fresh data on next call.
   */
  invalidateCache(): void {
    this.infoCache = undefined;
  }
}
