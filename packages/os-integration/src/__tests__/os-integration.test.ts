/**
 * Integration tests for OsIntegration facade
 *
 * Tests the facade with real services (using mocked providers).
 */

import { describe, it, expect, beforeEach } from "vitest";
import { OsIntegration } from "../os-integration.js";

describe("OsIntegration (integration)", () => {
  let integration: OsIntegration;

  beforeEach(() => {
    integration = new OsIntegration({ silentNotifications: true });
  });

  describe("notify", () => {
    it("should send notification with silent adapter", async () => {
      const result = await integration.notify({
        title: "Test",
        message: "Hello",
      });

      expect(result.ok).toBe(true);
    });
  });

  describe("getSystemInfo", () => {
    it("should return system info with cpu, memory, disk", async () => {
      const info = await integration.getSystemInfo();

      expect(info.cpu).toBeDefined();
      expect(typeof info.cpu.model).toBe("string");
      expect(typeof info.cpu.physicalCores).toBe("number");
      expect(typeof info.cpu.logicalCores).toBe("number");
      expect(typeof info.cpu.speed).toBe("number");

      expect(info.memory).toBeDefined();
      expect(typeof info.memory.total).toBe("number");
      expect(typeof info.memory.used).toBe("number");
      expect(typeof info.memory.free).toBe("number");

      expect(info.disk).toBeDefined();
      expect(Array.isArray(info.disk)).toBe(true);
    });
  });

  describe("listProcesses", () => {
    it("should return array of processes", async () => {
      const processes = await integration.listProcesses();

      expect(Array.isArray(processes)).toBe(true);
      expect(processes.length).toBeGreaterThan(0);

      for (const p of processes) {
        expect(p).toHaveProperty("pid");
        expect(p).toHaveProperty("name");
        expect(p).toHaveProperty("cpu");
        expect(p).toHaveProperty("mem");
        expect(p).toHaveProperty("status");
      }
    });

    it("should filter processes by name", async () => {
      const processes = await integration.listProcesses({ name: "node" });

      expect(Array.isArray(processes)).toBe(true);
      for (const p of processes) {
        expect(p.name.toLowerCase()).toContain("node");
      }
    });
  });

  describe("getPlatform", () => {
    it("should return 'linux' or 'windows'", () => {
      const platform = integration.getPlatform();

      expect(["linux", "windows"]).toContain(platform);
    });
  });

  describe("invalidateCaches", () => {
    it("should not throw when invalidating caches", () => {
      expect(() => integration.invalidateCaches()).not.toThrow();
    });
  });
});
