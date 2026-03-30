/**
 * Config utilities tests
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { OSAI_HOME, DEFAULT_CONFIG_PATH, DEFAULT_CONFIG, readConfig, writeConfig, configExists, ensureDirectoryStructure, } from "../../utils/config.js";
describe("Config utilities", () => {
    let tempDir;
    beforeEach(() => {
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "osai-test-"));
    });
    afterEach(() => {
        fs.rmSync(tempDir, { recursive: true, force: true });
    });
    describe("DEFAULT_CONFIG", () => {
        it("should have version field", () => {
            expect(DEFAULT_CONFIG.version).toBeDefined();
            expect(typeof DEFAULT_CONFIG.version).toBe("string");
        });
        it("should have gateway config with default URL", () => {
            expect(DEFAULT_CONFIG.gateway).toBeDefined();
            expect(DEFAULT_CONFIG.gateway.wsUrl).toBe("ws://127.0.0.1:18789");
        });
        it("should have providers config", () => {
            expect(DEFAULT_CONFIG.providers).toBeDefined();
            expect(DEFAULT_CONFIG.providers.primary).toBe("z-ai");
        });
    });
    describe("writeConfig / readConfig", () => {
        it("should write and read config", () => {
            const configPath = path.join(tempDir, "osai.json");
            const config = { ...DEFAULT_CONFIG, version: "3.0.0-test" };
            writeConfig(config, configPath);
            const read = readConfig(configPath);
            expect(read.version).toBe("3.0.0-test");
        });
        it("should write valid JSON", () => {
            const configPath = path.join(tempDir, "osai.json");
            writeConfig(DEFAULT_CONFIG, configPath);
            const content = fs.readFileSync(configPath, "utf-8");
            // Should not throw
            expect(() => JSON.parse(content)).not.toThrow();
        });
        it("should throw if config file does not exist", () => {
            const configPath = path.join(tempDir, "nonexistent", "osai.json");
            expect(() => readConfig(configPath)).toThrow("Configuration file not found");
        });
        it("should throw if config contains invalid JSON", () => {
            const configPath = path.join(tempDir, "osai.json");
            fs.writeFileSync(configPath, "not json", "utf-8");
            expect(() => readConfig(configPath)).toThrow("Invalid configuration file");
        });
        it("should create parent directories when writing", () => {
            const configPath = path.join(tempDir, "sub", "dir", "osai.json");
            writeConfig(DEFAULT_CONFIG, configPath);
            expect(fs.existsSync(configPath)).toBe(true);
        });
    });
    describe("configExists", () => {
        it("should return true when config exists", () => {
            const configPath = path.join(tempDir, "osai.json");
            fs.writeFileSync(configPath, "{}", "utf-8");
            expect(configExists(configPath)).toBe(true);
        });
        it("should return false when config does not exist", () => {
            const configPath = path.join(tempDir, "nonexistent", "osai.json");
            expect(configExists(configPath)).toBe(false);
        });
    });
    describe("ensureDirectoryStructure", () => {
        it("should create all required directories", () => {
            const osaiDir = path.join(tempDir, ".osai-test");
            const created = ensureDirectoryStructure(osaiDir);
            expect(fs.existsSync(path.join(osaiDir, "data"))).toBe(true);
            expect(fs.existsSync(path.join(osaiDir, "logs"))).toBe(true);
            expect(fs.existsSync(path.join(osaiDir, "channels", "telegram", "session"))).toBe(true);
            expect(created.length).toBeGreaterThan(0);
        });
        it("should not report existing directories as created", () => {
            const osaiDir = path.join(tempDir, ".osai-test2");
            // First call: create
            ensureDirectoryStructure(osaiDir);
            // Second call: already exist
            const created = ensureDirectoryStructure(osaiDir);
            expect(created.length).toBe(0);
        });
    });
});
//# sourceMappingURL=config.test.js.map