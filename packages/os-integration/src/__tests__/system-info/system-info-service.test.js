/**
 * Tests for SystemInfoService
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { SystemInfoService } from "../../system-info/system-info-service.js";
function createMockProvider() {
    return {
        cpu: vi.fn().mockResolvedValue({
            manufacturer: "Intel",
            brand: "Intel Core i7-12700K",
            physicalCores: 12,
            cores: 20,
            speed: 3600,
            speedMin: 800,
            speedMax: 5000,
        }),
        cpuCurrentSpeed: vi.fn().mockResolvedValue({
            avg: 4200,
            cores: [],
        }),
        cpuTemperature: vi.fn().mockResolvedValue({
            main: 65,
            cores: [60, 63, 62, 65],
        }),
        mem: vi.fn().mockResolvedValue({
            total: 16 * 1024 * 1024 * 1024, // 16 GB
            used: 8 * 1024 * 1024 * 1024, // 8 GB
            free: 8 * 1024 * 1024 * 1024, // 8 GB
            swapTotal: 4 * 1024 * 1024 * 1024,
            swapUsed: 1 * 1024 * 1024 * 1024,
        }),
        diskLayout: vi.fn().mockResolvedValue([]),
        fsSize: vi.fn().mockResolvedValue([
            {
                fs: "ext4",
                type: "ext4",
                size: 500 * 1024 * 1024 * 1024, // 500 GB
                used: 250 * 1024 * 1024 * 1024, // 250 GB
                available: 250 * 1024 * 1024 * 1024,
                mount: "/",
            },
            {
                fs: "ntfs",
                type: "ntfs",
                size: 1000 * 1024 * 1024 * 1024,
                used: 600 * 1024 * 1024 * 1024,
                available: 400 * 1024 * 1024 * 1024,
                mount: "D:\\",
            },
        ]),
        loadavg: vi.fn().mockResolvedValue([0.5, 0.8, 1.2]),
    };
}
describe("SystemInfoService", () => {
    let provider;
    let service;
    beforeEach(() => {
        provider = createMockProvider();
        service = new SystemInfoService(provider, { cacheTtlMs: 5000 });
    });
    describe("getSystemInfo", () => {
        it("should return cpu, memory, disk", async () => {
            const info = await service.getSystemInfo();
            expect(info.cpu).toBeDefined();
            expect(info.memory).toBeDefined();
            expect(info.disk).toBeDefined();
            expect(Array.isArray(info.disk)).toBe(true);
        });
        it("should cache results for cacheTtlMs", async () => {
            const info1 = await service.getSystemInfo();
            const info2 = await service.getSystemInfo();
            // Should return same cached result
            expect(info1).toBe(info2);
            // Provider should be called only once
            expect(provider.cpu).toHaveBeenCalledTimes(1);
            expect(provider.mem).toHaveBeenCalledTimes(1);
            expect(provider.fsSize).toHaveBeenCalledTimes(1);
        });
        it("should fetch fresh data after cache expires", async () => {
            vi.useFakeTimers();
            const shortCache = new SystemInfoService(provider, { cacheTtlMs: 100 });
            await shortCache.getSystemInfo();
            vi.advanceTimersByTime(101);
            await shortCache.getSystemInfo();
            vi.useRealTimers();
            expect(provider.cpu).toHaveBeenCalledTimes(2);
        });
        it("should respect invalidateCache", async () => {
            await service.getSystemInfo();
            service.invalidateCache();
            await service.getSystemInfo();
            expect(provider.cpu).toHaveBeenCalledTimes(2);
        });
    });
    describe("getCpuInfo", () => {
        it("should return correct CPU fields", async () => {
            const cpu = await service.getCpuInfo();
            expect(cpu.model).toBe("Intel Core i7-12700K");
            expect(cpu.physicalCores).toBe(12);
            expect(cpu.logicalCores).toBe(20);
            expect(cpu.speed).toBeCloseTo(4.2, 1); // 4200 MHz -> 4.2 GHz
            expect(cpu.load).toBe(0.5);
        });
        it("should handle loadavg returning null (Windows)", async () => {
            vi.mocked(provider.loadavg).mockResolvedValue(null);
            const cpu = await service.getCpuInfo();
            expect(cpu.load).toBe(0);
        });
        it("should handle loadavg throwing error", async () => {
            vi.mocked(provider.loadavg).mockRejectedValue(new Error("Not available"));
            const cpu = await service.getCpuInfo();
            expect(cpu.load).toBe(0);
        });
    });
    describe("getMemoryInfo", () => {
        it("should return memory in MB", async () => {
            const mem = await service.getMemoryInfo();
            // 16 GB = ~16384 MB
            expect(mem.total).toBe(16384);
            expect(mem.used).toBe(8192);
            expect(mem.free).toBe(8192);
            expect(mem.swapTotal).toBe(4096);
            expect(mem.swapUsed).toBe(1024);
        });
    });
    describe("getDiskInfo", () => {
        it("should return disk info with GB values", async () => {
            const disks = await service.getDiskInfo();
            expect(disks).toHaveLength(2);
            expect(disks[0].mount).toBe("/");
            expect(disks[0].totalGb).toBe(500);
            expect(disks[0].usedGb).toBe(250);
            expect(disks[0].freeGb).toBe(250);
            expect(disks[0].usedPercent).toBe(50);
        });
        it("should handle zero-size filesystem", async () => {
            vi.mocked(provider.fsSize).mockResolvedValue([
                {
                    fs: "tmpfs",
                    type: "tmpfs",
                    size: 0,
                    used: 0,
                    available: 0,
                    mount: "/tmp",
                },
            ]);
            const disks = await service.getDiskInfo();
            expect(disks[0].usedPercent).toBe(0);
        });
    });
});
//# sourceMappingURL=system-info-service.test.js.map