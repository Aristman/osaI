/**
 * @osai/os-integration -- ProcessService
 *
 * Process list with filtering, sorting, and caching.
 * Uses systeminformation (pure JS).
 */

import type { ProcessInfo, ProcessFilter, ProcessServiceConfig } from "../types.js";
import type { Logger } from "pino";
import { getLogger } from "../logger.js";

// ---------------------------------------------------------------------------
// Systeminformation process module interface (for testability)
// ---------------------------------------------------------------------------

export interface ProcessesProvider {
  processes(): Promise<{
    all: number;
    list: Array<{
      pid: number;
      name: string;
      cpu: number;
      cpuu?: number;
      mem: number;
      state: string;
    }>;
    running: number;
  }>;
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
// ProcessService
// ---------------------------------------------------------------------------

export class ProcessService {
  private readonly logger: Logger;
  private readonly provider: ProcessesProvider;
  private readonly cacheTtlMs: number;
  private listCache: CacheEntry<ProcessInfo[]> | undefined;

  constructor(
    provider: ProcessesProvider,
    config?: ProcessServiceConfig,
  ) {
    this.provider = provider;
    this.cacheTtlMs = config?.cacheTtlMs ?? 3000;
    this.logger = getLogger("processes");
  }

  /**
   * List all processes, optionally filtered.
   * Results are cached for cacheTtlMs (default 3s).
   *
   * @param filter - Optional filter criteria
   * @returns Array of ProcessInfo sorted by CPU usage desc
   */
  async listProcesses(filter?: ProcessFilter): Promise<ProcessInfo[]> {
    // Get all processes (possibly from cache)
    const allProcesses = await this.getOrFetchAll();

    // If no filter, return cached/full list
    if (filter === undefined || filter === null) {
      return allProcesses;
    }

    // Apply filter
    return filterProcesses(allProcesses, filter);
  }

  /**
   * Get all processes, with caching.
   */
  private async getOrFetchAll(): Promise<ProcessInfo[]> {
    const cached = getCached(this.listCache);
    if (cached !== undefined) {
      this.logger.debug("Returning cached process list");
      return cached;
    }

    try {
      const result = await this.provider.processes();
      const processes: ProcessInfo[] = result.list.map((p) => ({
        pid: p.pid,
        name: p.name,
        cpu: Math.round(p.cpu * 100) / 100,
        mem: Math.round(p.mem * 100) / 100,
        status: p.state,
      }));

      // Sort by CPU usage desc (default sort)
      processes.sort((a, b) => b.cpu - a.cpu);

      this.listCache = setCache(processes, this.cacheTtlMs);
      return processes;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : String(err);
      this.logger.warn(
        { error: message },
        "Failed to list processes (graceful degradation)",
      );
      throw err;
    }
  }

  /**
   * Invalidate the cache, forcing fresh data on next call.
   */
  invalidateCache(): void {
    this.listCache = undefined;
  }
}

// ---------------------------------------------------------------------------
// Pure filter logic (exported for separate testing)
// ---------------------------------------------------------------------------

/**
 * Filter a list of processes according to the given filter criteria.
 * All conditions are AND-combined.
 */
export function filterProcesses(
  processes: ProcessInfo[],
  filter: ProcessFilter,
): ProcessInfo[] {
  let result = processes;

  if (filter.name !== undefined && filter.name !== "") {
    const nameLower = filter.name.toLowerCase();
    result = result.filter((p) =>
      p.name.toLowerCase().includes(nameLower),
    );
  }

  if (filter.pid !== undefined) {
    result = result.filter((p) => p.pid === filter.pid);
  }

  if (filter.cpuGt !== undefined) {
    result = result.filter((p) => p.cpu > filter.cpuGt!);
  }

  if (filter.memGt !== undefined) {
    result = result.filter((p) => p.mem > filter.memGt!);
  }

  return result;
}
