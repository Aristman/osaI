/**
 * Tests for filterProcesses (pure logic, no mocks)
 */

import { describe, it, expect } from "vitest";
import { filterProcesses } from "../../processes/process-service.js";
import type { ProcessInfo } from "../../types.js";

const SAMPLE_PROCESSES: ProcessInfo[] = [
  { pid: 1, name: "systemd", cpu: 0.1, mem: 0.5, status: "running" },
  { pid: 100, name: "chrome", cpu: 25.5, mem: 10.0, status: "running" },
  { pid: 200, name: "code", cpu: 15.3, mem: 8.5, status: "running" },
  { pid: 300, name: "node", cpu: 5.0, mem: 2.0, status: "running" },
  { pid: 400, name: "bash", cpu: 0.0, mem: 0.1, status: "sleeping" },
  { pid: 500, name: "Chrome Helper", cpu: 8.0, mem: 3.0, status: "running" },
];

describe("filterProcesses", () => {
  it("should return all processes with empty filter", () => {
    const result = filterProcesses(SAMPLE_PROCESSES, {});
    expect(result).toHaveLength(6);
  });

  it("should filter by name substring", () => {
    const result = filterProcesses(SAMPLE_PROCESSES, { name: "chrome" });
    expect(result).toHaveLength(2);
    expect(result[0]!.name).toBe("chrome");
    expect(result[1]!.name).toBe("Chrome Helper");
  });

  it("should be case-insensitive for name filter", () => {
    const result = filterProcesses(SAMPLE_PROCESSES, { name: "CHROME" });
    expect(result).toHaveLength(2);
  });

  it("should filter by exact pid", () => {
    const result = filterProcesses(SAMPLE_PROCESSES, { pid: 200 });
    expect(result).toHaveLength(1);
    expect(result[0]!.pid).toBe(200);
  });

  it("should filter by cpuGt", () => {
    const result = filterProcesses(SAMPLE_PROCESSES, { cpuGt: 10 });
    expect(result).toHaveLength(2); // chrome (25.5), code (15.3)
  });

  it("should filter by memGt", () => {
    const result = filterProcesses(SAMPLE_PROCESSES, { memGt: 5 });
    expect(result).toHaveLength(2); // chrome (10.0), code (8.5)
  });

  it("should combine filters with AND logic", () => {
    const result = filterProcesses(SAMPLE_PROCESSES, {
      name: "chrome",
      cpuGt: 20,
    });
    expect(result).toHaveLength(1);
    expect(result[0]!.name).toBe("chrome");
  });

  it("should return empty array when no match", () => {
    const result = filterProcesses(SAMPLE_PROCESSES, { pid: 99999 });
    expect(result).toHaveLength(0);
  });

  it("should not modify original array", () => {
    const original = [...SAMPLE_PROCESSES];
    filterProcesses(SAMPLE_PROCESSES, { name: "node" });
    expect(SAMPLE_PROCESSES).toEqual(original);
  });

  it("should handle empty process list", () => {
    const result = filterProcesses([], { name: "chrome" });
    expect(result).toHaveLength(0);
  });

  it("should handle undefined filter values gracefully", () => {
    const result = filterProcesses(SAMPLE_PROCESSES, {
      name: undefined,
      pid: undefined,
      cpuGt: undefined,
      memGt: undefined,
    });
    expect(result).toHaveLength(6);
  });
});
