/**
 * init command tests (T-005)
 *
 * TT-005-01: osai init -- создаёт ~/.osai/ с defaults
 * TT-005-02: osai init при существующей конфигурации -- warning
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  configExists,
  ensureDirectoryStructure,
  writeConfig,
  DEFAULT_CONFIG,
} from "../../utils/config.js";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

let tempHome: string;

describe("Command: osai init", () => {
  beforeEach(() => {
    tempHome = fs.mkdtempSync(path.join(os.tmpdir(), "osai-init-test-"));
  });

  afterEach(() => {
    fs.rmSync(tempHome, { recursive: true, force: true });
  });

  describe("TT-005-01: osai init creates directory structure with defaults", () => {
    it("should create osai.json with default config content when directory exists", () => {
      const osaiDir = path.join(tempHome, ".osai");
      const configPath = path.join(osaiDir, "osai.json");

      // Simulate what runInit does
      ensureDirectoryStructure(osaiDir);
      writeConfig(DEFAULT_CONFIG, configPath);

      expect(configExists(configPath)).toBe(true);
      expect(fs.existsSync(path.join(osaiDir, "data"))).toBe(true);
      expect(fs.existsSync(path.join(osaiDir, "logs"))).toBe(true);
      expect(fs.existsSync(path.join(osaiDir, "channels", "telegram", "session"))).toBe(true);

      const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
      expect(config.version).toBe(DEFAULT_CONFIG.version);
      expect(config.gateway.wsUrl).toBe("ws://127.0.0.1:18789");
    });

    it("should create default config with correct structure", () => {
      const osaiDir = path.join(tempHome, ".osai");
      const configPath = path.join(osaiDir, "osai.json");

      ensureDirectoryStructure(osaiDir);
      writeConfig(DEFAULT_CONFIG, configPath);

      const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));

      expect(config).toHaveProperty("version");
      expect(config).toHaveProperty("gateway");
      expect(config).toHaveProperty("providers");
      expect(config).toHaveProperty("channels");
      expect(config).toHaveProperty("memory");
      expect(config).toHaveProperty("logging");
      expect(config.providers.primary).toBe("z-ai");
    });
  });

  describe("TT-005-02: osai init with existing configuration", () => {
    it("should detect existing configuration", () => {
      const existingPath = path.join(tempHome, "osai.json");
      fs.writeFileSync(existingPath, '{"version":"1.0"}', "utf-8");

      expect(configExists(existingPath)).toBe(true);
    });

    it("should return false when config does not exist", () => {
      const missingPath = path.join(tempHome, "nonexistent.json");

      expect(configExists(missingPath)).toBe(false);
    });
  });
});
