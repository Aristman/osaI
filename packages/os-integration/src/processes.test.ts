import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ProcessManager } from './processes.js';

// Mock systeminformation
vi.mock('systeminformation', () => ({
  processes: vi.fn(),
  cpu: vi.fn(),
  mem: vi.fn(),
  fsSize: vi.fn(),
  time: vi.fn(),
}));

describe('ProcessManager', () => {
  let manager: ProcessManager;

  beforeEach(() => {
    manager = new ProcessManager();
    vi.clearAllMocks();
  });

  describe('UT-006-01: listProcesses returns array', () => {
    it('returns empty array when systeminformation has no list', async () => {
      const si = await import('systeminformation');
      vi.mocked(si.processes).mockResolvedValue({ all: 0, running: 0, sleeping: 0 } as never);

      const result = await manager.listProcesses();
      expect(Array.isArray(result)).toBe(true);
    });

    it('returns process array', async () => {
      const si = await import('systeminformation');
      vi.mocked(si.processes).mockResolvedValue({
        all: 2,
        running: 2,
        sleeping: 0,
        list: [
          {
            pid: 1,
            name: 'systemd',
            pcpu: 0.1,
            pmem: 0.5,
            cmd: '/sbin/init',
            user: 'root',
            started: '2024-01-01',
            status: 'running',
          },
          {
            pid: 100,
            name: 'node',
            pcpu: 2.5,
            pmem: 1.2,
            cmd: '/usr/bin/node test.js',
            user: 'user',
            started: '2024-01-01',
            status: 'running',
          },
        ],
      } as never);

      const result = await manager.listProcesses();
      expect(result).toHaveLength(2);
      expect(result[0]!.pid).toBe(1);
      expect(result[0]!.name).toBe('systemd');
      expect(result[1]!.pid).toBe(100);
      expect(result[1]!.name).toBe('node');
    });
  });

  describe('UT-006-03: listProcesses with filter', () => {
    it('filters processes by name', async () => {
      const si = await import('systeminformation');
      vi.mocked(si.processes).mockResolvedValue({
        all: 2,
        running: 2,
        sleeping: 0,
        list: [
          { pid: 100, name: 'node', pcpu: 2.5, pmem: 1.2, cmd: '/usr/bin/node test.js', user: 'user', started: '', status: 'running' },
          { pid: 200, name: 'node-api', pcpu: 1.0, pmem: 0.8, cmd: '/usr/bin/node api.js', user: 'user', started: '', status: 'running' },
        ],
      } as never);

      const result = await manager.listProcesses('node');
      expect(result.length).toBeLessThanOrEqual(2);
      for (const proc of result) {
        const matchesName = proc.name.toLowerCase().includes('node');
        const matchesCmd = proc.command.toLowerCase().includes('node');
        expect(matchesName || matchesCmd).toBe(true);
      }
    });
  });

  describe('listProcesses error handling', () => {
    it('returns empty array on error', async () => {
      const si = await import('systeminformation');
      vi.mocked(si.processes).mockRejectedValue(new Error('Permission denied'));

      const result = await manager.listProcesses();
      expect(result).toEqual([]);
    });
  });

  describe('UT-006-04: getSystemInfo returns object', () => {
    it('returns valid SystemInfo object', async () => {
      const si = await import('systeminformation');
      vi.mocked(si.cpu).mockResolvedValue({
        manufacturer: 'Intel',
        brand: 'Core i7',
        speed: 3200,
        cores: 8,
        physicalCores: 4,
      } as never);
      vi.mocked(si.mem).mockResolvedValue({
        total: 16_000_000_000,
        used: 8_000_000_000,
        free: 8_000_000_000,
        available: 10_000_000_000,
      } as never);
      vi.mocked(si.fsSize).mockResolvedValue([
        { fs: '/', size: 500_000_000_000, used: 200_000_000_000, available: 300_000_000_000, use: 0.4 },
      ] as never);
      vi.mocked(si.time).mockResolvedValue({ uptime: 86400 } as never);

      const result = await manager.getSystemInfo();
      expect(result).toHaveProperty('cpu');
      expect(result).toHaveProperty('memory');
      expect(result).toHaveProperty('disk');
      expect(result).toHaveProperty('uptime');
      expect(result).toHaveProperty('hostname');
      expect(result).toHaveProperty('platform');
    });
  });

  describe('UT-006-05: SystemInfo has CPU data', () => {
    it('has cpu property with model, cores, speed', async () => {
      const si = await import('systeminformation');
      vi.mocked(si.cpu).mockResolvedValue({
        manufacturer: 'AMD',
        brand: 'Ryzen 9',
        speed: 4200,
        cores: 16,
        physicalCores: 8,
      } as never);
      vi.mocked(si.mem).mockResolvedValue({ total: 0, used: 0, free: 0, available: 0 } as never);
      vi.mocked(si.fsSize).mockResolvedValue([] as never);
      vi.mocked(si.time).mockResolvedValue({ uptime: 0 } as never);

      const result = await manager.getSystemInfo();
      expect(result.cpu.model).toContain('AMD');
      expect(result.cpu.model).toContain('Ryzen 9');
      expect(result.cpu.cores).toBe(16);
      expect(result.cpu.speed).toBe(4200);
    });
  });

  describe('UT-006-06: SystemInfo has memory data', () => {
    it('has memory property with total, used, free, usagePercent', async () => {
      const si = await import('systeminformation');
      vi.mocked(si.cpu).mockResolvedValue({ manufacturer: '', brand: '', speed: 0, cores: 1, physicalCores: 1 } as never);
      vi.mocked(si.mem).mockResolvedValue({
        total: 32_000_000_000,
        used: 16_000_000_000,
        free: 16_000_000_000,
        available: 20_000_000_000,
      } as never);
      vi.mocked(si.fsSize).mockResolvedValue([] as never);
      vi.mocked(si.time).mockResolvedValue({ uptime: 0 } as never);

      const result = await manager.getSystemInfo();
      expect(result.memory.total).toBe(32_000_000_000);
      expect(result.memory.used).toBe(16_000_000_000);
      expect(result.memory.free).toBe(16_000_000_000);
      expect(result.memory.usagePercent).toBe(50);
    });
  });

  describe('UT-006-07: SystemInfo has disk data', () => {
    it('has disk property with total, used, free, usagePercent', async () => {
      const si = await import('systeminformation');
      vi.mocked(si.cpu).mockResolvedValue({ manufacturer: '', brand: '', speed: 0, cores: 1, physicalCores: 1 } as never);
      vi.mocked(si.mem).mockResolvedValue({ total: 0, used: 0, free: 0, available: 0 } as never);
      vi.mocked(si.fsSize).mockResolvedValue([
        { fs: '/', size: 1_000_000_000_000, used: 500_000_000_000, available: 500_000_000_000, use: 0.5 },
      ] as never);
      vi.mocked(si.time).mockResolvedValue({ uptime: 0 } as never);

      const result = await manager.getSystemInfo();
      expect(result.disk.total).toBe(1_000_000_000_000);
      expect(result.disk.used).toBe(500_000_000_000);
      expect(result.disk.free).toBe(500_000_000_000);
      expect(result.disk.usagePercent).toBe(50);
    });
  });

  describe('getSystemInfo fallback', () => {
    it('returns basic info when systeminformation fails', async () => {
      const si = await import('systeminformation');
      vi.mocked(si.cpu).mockRejectedValue(new Error('Failed'));
      vi.mocked(si.mem).mockRejectedValue(new Error('Failed'));
      vi.mocked(si.fsSize).mockRejectedValue(new Error('Failed'));
      vi.mocked(si.time).mockRejectedValue(new Error('Failed'));

      const result = await manager.getSystemInfo();
      expect(result).toHaveProperty('cpu');
      expect(result).toHaveProperty('memory');
      expect(result.cpu.cores).toBeGreaterThan(0);
      expect(result.memory.total).toBeGreaterThan(0);
      expect(result.uptime).toBeGreaterThan(0);
    });
  });
});
