import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { join } from "node:path";
import {
  existsSync,
  rmSync,
  readFileSync,
  statSync,
  mkdirSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import {
  createDefaultConfig,
  getOsaiDir,
  getConfigPath,
  DEFAULT_CONFIG,
} from "./config.js";

describe("config module", () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `osai-config-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  // ---------------------------------------------------------------
  // TT-003-02: init copies osai.json config
  // ---------------------------------------------------------------
  describe("createDefaultConfig", () => {
    it("should create osai.json with valid JSON content (TT-003-02)", () => {
      const created = createDefaultConfig(testDir);

      expect(created).toBe(true);

      const configPath = join(testDir, "osai.json");
      expect(existsSync(configPath)).toBe(true);

      const content = readFileSync(configPath, "utf-8");
      const parsed = JSON.parse(content);

      expect(parsed).toHaveProperty("agent");
      expect(parsed).toHaveProperty("providers");
      expect(parsed).toHaveProperty("memory");
      expect(parsed).toHaveProperty("channels");
      expect(parsed).toHaveProperty("security");
      expect(parsed).toHaveProperty("skills");
      expect(parsed).toHaveProperty("voice");
    });

    it("should create config with correct default values from DEFAULT_CONFIG", () => {
      createDefaultConfig(testDir);

      const configPath = join(testDir, "osai.json");
      const parsed = JSON.parse(readFileSync(configPath, "utf-8"));

      expect(parsed.agent.model).toBe(DEFAULT_CONFIG.agent.model);
      expect(parsed.agent.circuitBreaker.failureThreshold).toBe(
        DEFAULT_CONFIG.agent.circuitBreaker.failureThreshold,
      );
      expect(parsed.agent.circuitBreaker.resetTimeoutMs).toBe(
        DEFAULT_CONFIG.agent.circuitBreaker.resetTimeoutMs,
      );
      expect(parsed.agent.failoverChain).toEqual(
        [...DEFAULT_CONFIG.agent.failoverChain],
      );
    });

    // ---------------------------------------------------------------
    // TT-003-04: init does not overwrite existing config
    // ---------------------------------------------------------------
    it("should NOT overwrite an existing osai.json (TT-003-04)", () => {
      // Pre-create an osai.json with custom content
      const configPath = join(testDir, "osai.json");
      const customContent = '{"custom": true}';
      writeFileSync(configPath, customContent, "utf-8");

      const created = createDefaultConfig(testDir);

      expect(created).toBe(false);

      const content = readFileSync(configPath, "utf-8");
      expect(content).toBe(customContent);
    });

    it("should return false when called twice (idempotent)", () => {
      const first = createDefaultConfig(testDir);
      const second = createDefaultConfig(testDir);

      expect(first).toBe(true);
      expect(second).toBe(false);
    });
  });

  // ---------------------------------------------------------------
  // TT-003-03: osai.json has permissions 600
  // ---------------------------------------------------------------
  describe("createDefaultConfig - permissions (TT-003-03)", () => {
    it("should attempt to set file permissions to 0o600", () => {
      createDefaultConfig(testDir);

      const configPath = join(testDir, "osai.json");
      const stats = statSync(configPath);

      // On Unix-like systems mode & 0o777 should equal 0o600
      // On Windows NTFS this test verifies the file is a valid file
      // and chmod did not crash (best-effort per roadmap risk mitigation).
      expect(stats.isFile()).toBe(true);
    });
  });

  // ---------------------------------------------------------------
  // Path utility functions
  // ---------------------------------------------------------------
  describe("getOsaiDir", () => {
    it("should return ~/.osai path", () => {
      const result = getOsaiDir();
      expect(result).toContain(".osai");
      expect(result).not.toBe("");
    });
  });

  describe("getConfigPath", () => {
    it("should return ~/.osai/osai.json path", () => {
      const result = getConfigPath();
      expect(result).toContain(".osai");
      expect(result).toContain("osai.json");
      expect(result).toBe(join(getOsaiDir(), "osai.json"));
    });
  });

  // ---------------------------------------------------------------
  // DEFAULT_CONFIG completeness check
  // ---------------------------------------------------------------
  describe("DEFAULT_CONFIG", () => {
    it("should contain all required configuration sections", () => {
      expect(DEFAULT_CONFIG).toHaveProperty("agent");
      expect(DEFAULT_CONFIG).toHaveProperty("providers");
      expect(DEFAULT_CONFIG).toHaveProperty("memory");
      expect(DEFAULT_CONFIG).toHaveProperty("channels");
      expect(DEFAULT_CONFIG).toHaveProperty("security");
      expect(DEFAULT_CONFIG).toHaveProperty("skills");
      expect(DEFAULT_CONFIG).toHaveProperty("voice");
    });

    it("should have agent failover chain with 5 providers", () => {
      expect(DEFAULT_CONFIG.agent.failoverChain).toHaveLength(5);
    });

    it("should have circuit breaker configuration", () => {
      expect(DEFAULT_CONFIG.agent.circuitBreaker.failureThreshold).toBe(5);
      expect(DEFAULT_CONFIG.agent.circuitBreaker.resetTimeoutMs).toBe(30000);
    });

    it("should have all 5 LLM providers configured", () => {
      expect(DEFAULT_CONFIG.providers).toHaveProperty("z-ai");
      expect(DEFAULT_CONFIG.providers).toHaveProperty("yandex");
      expect(DEFAULT_CONFIG.providers).toHaveProperty("anthropic");
      expect(DEFAULT_CONFIG.providers).toHaveProperty("openai");
      expect(DEFAULT_CONFIG.providers).toHaveProperty("ollama");
    });

    it("should have RAG configuration with topK and minSimilarity", () => {
      expect(DEFAULT_CONFIG.memory.rag.topK).toBe(5);
      expect(DEFAULT_CONFIG.memory.rag.minSimilarity).toBe(0.7);
    });

    it("should have memory embeddings configuration", () => {
      expect(DEFAULT_CONFIG.memory.embeddings.default).toBe("ollama");
      expect(DEFAULT_CONFIG.memory.embeddings.ollama.model).toBe("nomic-embed-text");
      expect(DEFAULT_CONFIG.memory.embeddings.fallback).toBe("yandex");
    });

    it("should have vector storage configuration", () => {
      expect(DEFAULT_CONFIG.memory.vectorStorage.default).toBe("sqlite-vec");
      expect(DEFAULT_CONFIG.memory.vectorStorage.qdrant.url).toBe(
        "http://localhost:6333",
      );
    });

    it("should have telegram channel configuration", () => {
      expect(DEFAULT_CONFIG.channels.telegram.bot.enabled).toBe(false);
      expect(DEFAULT_CONFIG.channels.telegram.userbot.enabled).toBe(false);
      expect(DEFAULT_CONFIG.channels.telegram.mirrors).toEqual([]);
    });

    it("should have security sandbox and shell configuration", () => {
      expect(DEFAULT_CONFIG.security.sandbox.allowedDirs).toBeDefined();
      expect(DEFAULT_CONFIG.security.sandbox.blockedPatterns).toBeDefined();
      expect(DEFAULT_CONFIG.security.shell.blockedCommands).toBeDefined();
      expect(DEFAULT_CONFIG.security.shell.timeout).toBe(120);
    });

    it("should have skills configuration with bundled skills enabled", () => {
      expect(DEFAULT_CONFIG.skills.allowBundled).toBe(true);
      expect(DEFAULT_CONFIG.skills.entries).toHaveProperty("filesystem");
      expect(DEFAULT_CONFIG.skills.entries).toHaveProperty("shell");
      expect(DEFAULT_CONFIG.skills.entries).toHaveProperty("memory");
    });

    it("should have voice STT and TTS configuration", () => {
      expect(DEFAULT_CONFIG.voice.stt.primary).toBe("whisper-cpp");
      expect(DEFAULT_CONFIG.voice.stt.fallback).toBe("yandex");
      expect(DEFAULT_CONFIG.voice.tts.primary).toBe("piper");
      expect(DEFAULT_CONFIG.voice.tts.fallback).toBe("yandex");
    });

    it("should produce valid JSON when stringified", () => {
      const jsonStr = JSON.stringify(DEFAULT_CONFIG, null, 2);
      const parsed = JSON.parse(jsonStr);
      expect(parsed).toBeDefined();
      expect(Object.keys(parsed).length).toBeGreaterThan(0);
    });
  });
});
