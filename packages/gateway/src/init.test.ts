import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { join } from "node:path";
import { existsSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import {
  ensureOsaiDir,
  initOsai,
  OSAI_SUBDIRS,
} from "./init.js";

describe("init module", () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `osai-init-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  // ---------------------------------------------------------------
  // TT-003-01: init creates ~/.osai/ structure
  // ---------------------------------------------------------------
  describe("ensureOsaiDir", () => {
    it("should create all required subdirectories (TT-003-01)", () => {
      ensureOsaiDir(testDir);

      for (const sub of OSAI_SUBDIRS) {
        const dirPath = join(testDir, sub);
        expect(existsSync(dirPath)).toBe(true);
      }
    });

    it("should create the root osai directory if it does not exist", () => {
      const freshDir = join(testDir, "fresh-osai");
      expect(existsSync(freshDir)).toBe(false);

      ensureOsaiDir(freshDir);

      expect(existsSync(freshDir)).toBe(true);
    });

    it("should be idempotent -- calling twice does not throw", () => {
      ensureOsaiDir(testDir);
      ensureOsaiDir(testDir);

      // All directories should still exist
      for (const sub of OSAI_SUBDIRS) {
        const dirPath = join(testDir, sub);
        expect(existsSync(dirPath)).toBe(true);
      }
    });

    it("should return the osai directory path", () => {
      const result = ensureOsaiDir(testDir);
      expect(result).toBe(testDir);
    });

    it("should create deeply nested directories (e.g. channels/telegram/session)", () => {
      ensureOsaiDir(testDir);

      const telegramSessionDir = join(testDir, "channels", "telegram", "session");
      expect(existsSync(telegramSessionDir)).toBe(true);
    });

    it("should create workspace/skills directory", () => {
      ensureOsaiDir(testDir);

      const skillsDir = join(testDir, "workspace", "skills");
      expect(existsSync(skillsDir)).toBe(true);
    });

    it("should create data directory", () => {
      ensureOsaiDir(testDir);

      const dataDir = join(testDir, "data");
      expect(existsSync(dataDir)).toBe(true);
    });

    it("should create logs directory", () => {
      ensureOsaiDir(testDir);

      const logsDir = join(testDir, "logs");
      expect(existsSync(logsDir)).toBe(true);
    });
  });

  // ---------------------------------------------------------------
  // OSAI_SUBDIRS constant
  // ---------------------------------------------------------------
  describe("OSAI_SUBDIRS", () => {
    it("should contain exactly 4 subdirectories", () => {
      expect(OSAI_SUBDIRS).toHaveLength(4);
    });

    it("should include all required subdirectory paths", () => {
      const expected = [
        "data",
        "logs",
        "channels/telegram/session",
        "workspace/skills",
      ];
      expect([...OSAI_SUBDIRS]).toEqual(expected);
    });
  });

  // ---------------------------------------------------------------
  // initOsai (full initialization routine)
  // ---------------------------------------------------------------
  describe("initOsai", () => {
    it("should create both directories and config file", () => {
      initOsai(testDir);

      // Verify directories
      for (const sub of OSAI_SUBDIRS) {
        expect(existsSync(join(testDir, sub))).toBe(true);
      }

      // Verify config
      expect(existsSync(join(testDir, "osai.json"))).toBe(true);
    });

    it("should be idempotent -- calling twice is safe", () => {
      initOsai(testDir);

      // Second call should not throw and should not overwrite config
      initOsai(testDir);

      // All directories should still exist
      for (const sub of OSAI_SUBDIRS) {
        expect(existsSync(join(testDir, sub))).toBe(true);
      }

      // Config should still exist
      expect(existsSync(join(testDir, "osai.json"))).toBe(true);
    });
  });
});
