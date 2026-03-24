/**
 * Process Management & System Info Module
 *
 * Provides process listing and system information
 * using the systeminformation package.
 */

import type { ProcessInfo, SystemInfo } from './types.js';
import * as os from 'node:os';

/** Logger interface */
interface ProcessLogger {
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
}

const defaultLogger: ProcessLogger = {
  // eslint-disable-next-line no-console
  warn: (msg, ...args) => console.warn(`[ProcessManager] ${msg}`, ...args),
  // eslint-disable-next-line no-console
  error: (msg, ...args) => console.error(`[ProcessManager] ${msg}`, ...args),
};

/** systeminformation process item */
interface SiProcess {
  pid: number;
  name: string;
  pcpu: number;
  pmem: number;
  cmd: string;
  user: string;
  started: string;
  status: string;
}

/** systeminformation CPU result */
interface SiCpu {
  manufacturer: string;
  brand: string;
  speed: number;
  cores: number;
  physicalCores: number;
}

/** systeminformation mem result */
interface SiMem {
  total: number;
  used: number;
  free: number;
  available: number;
}

/** systeminformation disk result */
interface SiFsSize {
  fs: string;
  size: number;
  used: number;
  available: number;
  use: number;
}

/** systeminformation time result */
interface SiTime {
  uptime: number;
}

/**
 * ProcessManager -- manages process listing and system info.
 */
export class ProcessManager {
  private logger: ProcessLogger;

  constructor(logger?: ProcessLogger) {
    this.logger = logger ?? defaultLogger;
  }

  /**
   * List running processes.
   *
   * @param filter - Optional filter string (matches against name or command)
   * @returns Array of process info
   */
  async listProcesses(filter?: string): Promise<ProcessInfo[]> {
    try {
      const si = await import('systeminformation');

      const result = await si.processes() as unknown as { list?: SiProcess[] };

      if (!result?.list) {
        return [];
      }

      let processes = result.list;

      if (filter) {
        const lowerFilter = filter.toLowerCase();
        processes = processes.filter((proc) =>
          proc.name?.toLowerCase().includes(lowerFilter) ||
          proc.cmd?.toLowerCase().includes(lowerFilter),
        );
      }

      return processes.map((proc) => this.mapProcess(proc));
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to list processes: ${errMsg}`);
      return [];
    }
  }

  /**
   * Get system information: CPU, memory, disk, uptime.
   */
  async getSystemInfo(): Promise<SystemInfo> {
    try {
      const si = await import('systeminformation');

      const [cpu, mem, disks, time] = await Promise.all([
        si.cpu(),
        si.mem(),
        si.fsSize(),
        si.time(),
      ]);

      return this.mapSystemInfo(cpu, mem, disks, time);
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to get system info: ${errMsg}`);

      // Return basic info from Node.js built-in modules
      return this.getBasicSystemInfo();
    }
  }

  /**
   * Map systeminformation process to ProcessInfo.
   */
  private mapProcess(proc: SiProcess): ProcessInfo {
    return {
      pid: proc.pid ?? 0,
      name: proc.name ?? 'unknown',
      cpu: Math.round((proc.pcpu ?? 0) * 100) / 100,
      mem: Math.round((proc.pmem ?? 0) * 100) / 100,
      command: proc.cmd ?? '',
      user: proc.user ?? 'unknown',
      started: proc.started ?? '',
      status: proc.status ?? 'unknown',
    };
  }

  /**
   * Map systeminformation data to SystemInfo.
   */
  private mapSystemInfo(
    cpu: SiCpu,
    mem: SiMem,
    disks: SiFsSize[],
    time: SiTime,
  ): SystemInfo {
    // Use root disk for disk stats
    const rootDisk = disks.find((d) => d.fs === '/') ?? disks[0];

    // Calculate memory usage percentage
    const memTotal = mem.total ?? 0;
    const memUsed = mem.used ?? 0;
    const memUsagePercent = memTotal > 0 ? Math.round((memUsed / memTotal) * 10000) / 100 : 0;

    return {
      cpu: {
        model: `${cpu.manufacturer ?? ''} ${cpu.brand ?? ''}`.trim(),
        cores: cpu.cores ?? cpu.physicalCores ?? os.cpus().length,
        speed: cpu.speed ?? os.cpus()[0]?.speed ?? 0,
        usage: 0, // systeminformation doesn't provide current usage in static cpu()
      },
      memory: {
        total: memTotal,
        used: memUsed,
        free: mem.free ?? 0,
        usagePercent: memUsagePercent,
      },
      disk: {
        total: rootDisk?.size ?? 0,
        used: rootDisk?.used ?? 0,
        free: rootDisk?.available ?? 0,
        usagePercent: rootDisk ? Math.round(((rootDisk.use ?? 0) * 100) * 100) / 100 : 0,
      },
      uptime: time.uptime ?? os.uptime(),
      hostname: os.hostname(),
      platform: os.platform(),
    };
  }

  /**
   * Get basic system info from Node.js built-in modules as fallback.
   */
  private getBasicSystemInfo(): SystemInfo {
    const totalMem = os.totalmem();
    const freeMem = os.freemem();

    return {
      cpu: {
        model: os.cpus()[0]?.model ?? 'unknown',
        cores: os.cpus().length,
        speed: os.cpus()[0]?.speed ?? 0,
        usage: 0,
      },
      memory: {
        total: totalMem,
        used: totalMem - freeMem,
        free: freeMem,
        usagePercent: Math.round(((totalMem - freeMem) / totalMem) * 10000) / 100,
      },
      disk: {
        total: 0,
        used: 0,
        free: 0,
        usagePercent: 0,
      },
      uptime: os.uptime(),
      hostname: os.hostname(),
      platform: os.platform(),
    };
  }
}
