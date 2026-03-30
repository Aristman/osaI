/**
 * Tests for os-detect utility
 */

import { describe, it, expect, afterEach } from "vitest";
import { detectPlatform, isLinux, isWindows } from "../os-detect.js";

describe("os-detect", () => {
  const originalPlatform = process.platform;

  afterEach(() => {
    // Restore process.platform after each test
    Object.defineProperty(process, "platform", {
      value: originalPlatform,
      writable: true,
      configurable: true,
    });
  });

  describe("detectPlatform", () => {
    it("should return 'linux' when process.platform is 'linux'", () => {
      Object.defineProperty(process, "platform", {
        value: "linux",
        writable: true,
        configurable: true,
      });

      expect(detectPlatform()).toBe("linux");
    });

    it("should return 'windows' when process.platform is 'win32'", () => {
      Object.defineProperty(process, "platform", {
        value: "win32",
        writable: true,
        configurable: true,
      });

      expect(detectPlatform()).toBe("windows");
    });

    it("should throw on unsupported platform", () => {
      Object.defineProperty(process, "platform", {
        value: "darwin",
        writable: true,
        configurable: true,
      });

      expect(() => detectPlatform()).toThrow(
        "Unsupported platform: darwin",
      );
    });

    it("should throw on 'freebsd'", () => {
      Object.defineProperty(process, "platform", {
        value: "freebsd",
        writable: true,
        configurable: true,
      });

      expect(() => detectPlatform()).toThrow(
        "Unsupported platform: freebsd",
      );
    });
  });

  describe("isLinux", () => {
    it("should return true for linux", () => {
      Object.defineProperty(process, "platform", {
        value: "linux",
        writable: true,
        configurable: true,
      });

      expect(isLinux()).toBe(true);
    });

    it("should return false for windows", () => {
      Object.defineProperty(process, "platform", {
        value: "win32",
        writable: true,
        configurable: true,
      });

      expect(isLinux()).toBe(false);
    });
  });

  describe("isWindows", () => {
    it("should return true for windows", () => {
      Object.defineProperty(process, "platform", {
        value: "win32",
        writable: true,
        configurable: true,
      });

      expect(isWindows()).toBe(true);
    });

    it("should return false for linux", () => {
      Object.defineProperty(process, "platform", {
        value: "linux",
        writable: true,
        configurable: true,
      });

      expect(isWindows()).toBe(false);
    });
  });
});
