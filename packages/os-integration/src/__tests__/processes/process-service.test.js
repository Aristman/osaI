/**
 * Tests for ProcessService
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ProcessService, } from "../../processes/process-service.js";
function createMockProvider() {
    return {
        processes: vi.fn().mockResolvedValue({
            all: 5,
            list: [
                { pid: 1, name: "systemd", cpu: 0.1, mem: 0.5, state: "running" },
                { pid: 100, name: "chrome", cpu: 25.5, mem: 10.0, state: "running" },
                { pid: 200, name: "code", cpu: 15.3, mem: 8.5, state: "running" },
                { pid: 300, name: "node", cpu: 5.0, mem: 2.0, state: "running" },
                { pid: 400, name: "bash", cpu: 0.0, mem: 0.1, state: "sleeping" },
            ],
            running: 4,
        }),
    };
}
describe("ProcessService", () => {
    let provider;
    let service;
    beforeEach(() => {
        provider = createMockProvider();
        service = new ProcessService(provider, { cacheTtlMs: 3000 });
    });
    describe("listProcesses", () => {
        it("should return all processes sorted by CPU desc", async () => {
            const processes = await service.listProcesses();
            expect(processes).toHaveLength(5);
            expect(processes[0].name).toBe("chrome");
            expect(processes[0].cpu).toBe(25.5);
            expect(processes[1].name).toBe("code");
        });
        it("should return pid, name, cpu, mem, status fields", async () => {
            const processes = await service.listProcesses();
            for (const p of processes) {
                expect(p).toHaveProperty("pid");
                expect(p).toHaveProperty("name");
                expect(p).toHaveProperty("cpu");
                expect(p).toHaveProperty("mem");
                expect(p).toHaveProperty("status");
            }
        });
        it("should cache results for cacheTtlMs", async () => {
            await service.listProcesses();
            await service.listProcesses();
            expect(provider.processes).toHaveBeenCalledTimes(1);
        });
        it("should fetch fresh data after cache expires", async () => {
            vi.useFakeTimers();
            const shortCache = new ProcessService(provider, { cacheTtlMs: 100 });
            await shortCache.listProcesses();
            vi.advanceTimersByTime(101);
            await shortCache.listProcesses();
            vi.useRealTimers();
            expect(provider.processes).toHaveBeenCalledTimes(2);
        });
        it("should respect invalidateCache", async () => {
            await service.listProcesses();
            service.invalidateCache();
            await service.listProcesses();
            expect(provider.processes).toHaveBeenCalledTimes(2);
        });
        it("should filter by name (substring match)", async () => {
            const processes = await service.listProcesses({ name: "node" });
            expect(processes).toHaveLength(1);
            expect(processes[0].name).toBe("node");
        });
        it("should filter by name case-insensitively", async () => {
            const processes = await service.listProcesses({ name: "CHROME" });
            expect(processes).toHaveLength(1);
            expect(processes[0].name).toBe("chrome");
        });
        it("should filter by exact pid", async () => {
            const processes = await service.listProcesses({ pid: 200 });
            expect(processes).toHaveLength(1);
            expect(processes[0].pid).toBe(200);
        });
        it("should filter by cpuGt", async () => {
            const processes = await service.listProcesses({ cpuGt: 10 });
            expect(processes).toHaveLength(2);
            expect(processes[0].name).toBe("chrome");
            expect(processes[1].name).toBe("code");
        });
        it("should filter by memGt", async () => {
            const processes = await service.listProcesses({ memGt: 5 });
            expect(processes).toHaveLength(2);
            expect(processes[0].name).toBe("chrome");
            expect(processes[1].name).toBe("code");
        });
        it("should combine multiple filters (AND)", async () => {
            const processes = await service.listProcesses({
                name: "node",
                cpuGt: 1,
            });
            expect(processes).toHaveLength(1);
            expect(processes[0].name).toBe("node");
        });
        it("should return empty array when filter matches nothing", async () => {
            const processes = await service.listProcesses({ pid: 99999 });
            expect(processes).toHaveLength(0);
        });
        it("should return all processes with empty filter", async () => {
            const processes = await service.listProcesses({});
            expect(processes).toHaveLength(5);
        });
    });
    describe("error handling", () => {
        it("should throw when provider fails", async () => {
            vi.mocked(provider.processes).mockRejectedValue(new Error("Permission denied"));
            await expect(service.listProcesses()).rejects.toThrow("Permission denied");
        });
    });
});
//# sourceMappingURL=process-service.test.js.map