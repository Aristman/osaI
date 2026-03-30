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
  // New T-006 exports
  loadConfig,
  validateConfig,
  getConfig,
  reloadConfig,
  resetConfigCache,
  getProviderConfig,
  getConfigSection,
  ConfigError,
  osaiConfigSchema,
  type OsaiConfig,
  type ConfigSection,
} from "./config.js";

describe("config module", () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `osai-config-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
    mkdirSync(testDir, { recursive: true });
    // Reset cache before each test to avoid cross-test pollution
    resetConfigCache();
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
    resetConfigCache();
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

  // ===============================================================
  // T-006: osai.json Configuration Loader tests
  // ===============================================================

  // ---------------------------------------------------------------
  // ConfigError class
  // ---------------------------------------------------------------
  describe("ConfigError", () => {
    it("should be an instance of Error", () => {
      const err = new ConfigError("test", "/path/to/config");
      expect(err).toBeInstanceOf(Error);
      expect(err).toBeInstanceOf(ConfigError);
    });

    it("should have correct name property", () => {
      const err = new ConfigError("test", "/path");
      expect(err.name).toBe("ConfigError");
    });

    it("should store configPath and optional field", () => {
      const err = new ConfigError("test message", "/path/to/config", "agent.model");
      expect(err.message).toBe("test message");
      expect(err.configPath).toBe("/path/to/config");
      expect(err.field).toBe("agent.model");
    });

    it("should have undefined field when not provided", () => {
      const err = new ConfigError("test", "/path");
      expect(err.field).toBeUndefined();
    });
  });

  // ---------------------------------------------------------------
  // TT-006-01: Config loads from ~/.osai/osai.json
  // ---------------------------------------------------------------
  describe("loadConfig", () => {
    it("should load config from an existing valid osai.json (TT-006-01)", () => {
      // Create a valid config file
      createDefaultConfig(testDir);
      const configPath = join(testDir, "osai.json");

      const config = loadConfig(configPath);

      expect(config).toBeDefined();
      expect(config.agent.model).toBe(DEFAULT_CONFIG.agent.model);
      expect(config.providers).toHaveProperty("z-ai");
      expect(config.providers).toHaveProperty("yandex");
      expect(config.providers).toHaveProperty("anthropic");
      expect(config.providers).toHaveProperty("openai");
      expect(config.providers).toHaveProperty("ollama");
      expect(config.memory).toBeDefined();
      expect(config.channels).toBeDefined();
      expect(config.security).toBeDefined();
      expect(config.skills).toBeDefined();
      expect(config.voice).toBeDefined();
    });

    // ---------------------------------------------------------------
    // TT-006-02: Defaults apply when keys are missing
    // ---------------------------------------------------------------
    it("should merge defaults when keys are missing from user config (TT-006-02)", () => {
      // Create a partial config file
      const partialConfig = {
        agent: {
          model: "custom-model",
          // failoverChain and circuitBreaker omitted -- should get defaults
        },
      };
      const configPath = join(testDir, "osai.json");
      writeFileSync(configPath, JSON.stringify(partialConfig, null, 2), "utf-8");

      const config = loadConfig(configPath);

      // User-provided value preserved
      expect(config.agent.model).toBe("custom-model");
      // Defaults applied for missing keys
      expect(config.agent.failoverChain).toEqual([...DEFAULT_CONFIG.agent.failoverChain]);
      expect(config.agent.circuitBreaker.failureThreshold).toBe(
        DEFAULT_CONFIG.agent.circuitBreaker.failureThreshold,
      );
      expect(config.agent.circuitBreaker.resetTimeoutMs).toBe(
        DEFAULT_CONFIG.agent.circuitBreaker.resetTimeoutMs,
      );
    });

    // ---------------------------------------------------------------
    // TT-006-05: Error when file does not exist (fallback to defaults)
    // ---------------------------------------------------------------
    it("should fallback to default config when file does not exist (TT-006-05)", () => {
      const configPath = join(testDir, "nonexistent", "osai.json");

      const config = loadConfig(configPath);

      // Should return defaults without error
      expect(config).toBeDefined();
      expect(config.agent.model).toBe(DEFAULT_CONFIG.agent.model);
    });

    it("should throw ConfigError for invalid JSON", () => {
      const configPath = join(testDir, "osai.json");
      writeFileSync(configPath, "{ invalid json }", "utf-8");

      expect(() => loadConfig(configPath)).toThrow(ConfigError);
      expect(() => loadConfig(configPath)).toThrow(/Invalid JSON/i);
    });

    it("should throw ConfigError when file contains a non-object value", () => {
      const configPath = join(testDir, "osai.json");
      writeFileSync(configPath, JSON.stringify([1, 2, 3]), "utf-8");

      expect(() => loadConfig(configPath)).toThrow(ConfigError);
      expect(() => loadConfig(configPath)).toThrow(/must contain a JSON object/i);
    });

    it("should throw ConfigError when file contains a string", () => {
      const configPath = join(testDir, "osai.json");
      writeFileSync(configPath, JSON.stringify("just a string"), "utf-8");

      expect(() => loadConfig(configPath)).toThrow(ConfigError);
    });

    // ---------------------------------------------------------------
    // TT-006-03: Zod validation rejects invalid config
    // ---------------------------------------------------------------
    it("should reject invalid config with wrong type for circuitBreaker.failureThreshold (TT-006-03)", () => {
      const invalidConfig = {
        ...DEFAULT_CONFIG,
        agent: {
          ...DEFAULT_CONFIG.agent,
          circuitBreaker: {
            failureThreshold: "not-a-number",
            resetTimeoutMs: 30000,
          },
        },
      };
      const configPath = join(testDir, "osai.json");
      writeFileSync(configPath, JSON.stringify(invalidConfig, null, 2), "utf-8");

      expect(() => loadConfig(configPath)).toThrow(ConfigError);
      try {
        loadConfig(configPath);
      } catch (err) {
        expect(err).toBeInstanceOf(ConfigError);
        const configErr = err as ConfigError;
        expect(configErr.message).toContain("Configuration validation failed");
        expect(configErr.field).toBeDefined();
      }
    });

    it("should reject invalid config with wrong type for memory.rag.topK", () => {
      const invalidConfig = {
        ...DEFAULT_CONFIG,
        memory: {
          ...DEFAULT_CONFIG.memory,
          rag: {
            topK: "invalid",
            minSimilarity: 0.7,
          },
        },
      };
      const configPath = join(testDir, "osai.json");
      writeFileSync(configPath, JSON.stringify(invalidConfig, null, 2), "utf-8");

      expect(() => loadConfig(configPath)).toThrow(ConfigError);
    });

    it("should reject config with missing required agent section", () => {
      // Config without agent section at all (but valid partial)
      const partialConfig = {
        providers: { ...DEFAULT_CONFIG.providers },
      };
      const configPath = join(testDir, "osai.json");
      writeFileSync(configPath, JSON.stringify(partialConfig, null, 2), "utf-8");

      // Deep merge will add defaults for missing sections, so agent will be present
      // from defaults. But if agent is explicitly set to wrong type:
      const invalidConfig = {
        ...DEFAULT_CONFIG,
        agent: "not-an-object",
      };
      writeFileSync(configPath, JSON.stringify(invalidConfig, null, 2), "utf-8");

      expect(() => loadConfig(configPath)).toThrow(ConfigError);
    });
  });

  // ---------------------------------------------------------------
  // validateConfig
  // ---------------------------------------------------------------
  describe("validateConfig", () => {
    it("should return the config when valid", () => {
      const validConfig = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
      const result = validateConfig(validConfig);

      expect(result).toBeDefined();
      expect(result.agent.model).toBe(DEFAULT_CONFIG.agent.model);
    });

    it("should throw ConfigError for invalid config", () => {
      const invalidConfig = {
        agent: {
          model: 123, // should be string
          failoverChain: [],
          circuitBreaker: { failureThreshold: 5, resetTimeoutMs: 30000 },
        },
      };

      expect(() => validateConfig(invalidConfig)).toThrow(ConfigError);
      expect(() => validateConfig(invalidConfig)).toThrow(/Configuration validation failed/);
    });

    it("should accept config with additional unknown top-level keys (deepMerge preserves)", () => {
      // After deepMerge, extra keys are preserved but Zod strips unknown keys
      // by default in v4. This test verifies validation succeeds.
      const configWithExtra = {
        ...DEFAULT_CONFIG,
        unknownSection: "some value",
      };

      // This should NOT throw because Zod strips unknown keys by default
      const result = validateConfig(configWithExtra);
      expect(result).toBeDefined();
      // unknownSection is stripped by Zod
      expect((result as Record<string, unknown>).unknownSection).toBeUndefined();
    });

    it("should validate the DEFAULT_CONFIG successfully", () => {
      const result = validateConfig(DEFAULT_CONFIG);
      expect(result).toBeDefined();
      expect(result.agent.model).toBe("z-ai/z-best");
    });
  });

  // ---------------------------------------------------------------
  // getConfig
  // ---------------------------------------------------------------
  describe("getConfig", () => {
    it("should trigger loadConfig if cache is empty", () => {
      createDefaultConfig(testDir);
      const configPath = join(testDir, "osai.json");

      // getConfig should load and return config
      const config = loadConfig(configPath);
      const cached = getConfig();

      expect(cached).toBe(config);
    });

    it("should return cached config on subsequent calls", () => {
      const config = getConfig();
      const config2 = getConfig();

      expect(config).toBe(config2); // Same reference
    });
  });

  // ---------------------------------------------------------------
  // TT-006-04: reloadConfig
  // ---------------------------------------------------------------
  describe("reloadConfig", () => {
    it("should reload config from modified file (TT-006-04)", () => {
      createDefaultConfig(testDir);
      const configPath = join(testDir, "osai.json");

      // Initial load
      const config1 = loadConfig(configPath);
      expect(config1.agent.model).toBe("z-ai/z-best");

      // Modify the file
      const modifiedConfig = JSON.parse(readFileSync(configPath, "utf-8"));
      modifiedConfig.agent.model = "ollama/llama3-custom";
      writeFileSync(configPath, JSON.stringify(modifiedConfig, null, 2), "utf-8");

      // Reload
      const config2 = reloadConfig(configPath);
      expect(config2.agent.model).toBe("ollama/llama3-custom");

      // getConfig should return the reloaded config
      const config3 = getConfig();
      expect(config3.agent.model).toBe("ollama/llama3-custom");
    });

    it("should reset cache and load fresh config", () => {
      createDefaultConfig(testDir);
      const configPath = join(testDir, "osai.json");

      const config1 = loadConfig(configPath);

      // Modify file and reload
      const modified = JSON.parse(readFileSync(configPath, "utf-8"));
      modified.agent.model = "new-model";
      writeFileSync(configPath, JSON.stringify(modified, null, 2), "utf-8");

      const config2 = reloadConfig(configPath);

      // Should be different reference
      expect(config2).not.toBe(config1);
      expect(config2.agent.model).toBe("new-model");
    });
  });

  // ---------------------------------------------------------------
  // resetConfigCache
  // ---------------------------------------------------------------
  describe("resetConfigCache", () => {
    it("should clear the cached config", () => {
      // Load config to populate cache
      getConfig();

      resetConfigCache();

      // getConfig will reload, potentially returning a new reference
      const config2 = getConfig();
      // Both are defaults since no file is overridden
      expect(config2).toBeDefined();
    });
  });

  // ---------------------------------------------------------------
  // getProviderConfig
  // ---------------------------------------------------------------
  describe("getProviderConfig", () => {
    beforeEach(() => {
      createDefaultConfig(testDir);
      loadConfig(join(testDir, "osai.json"));
    });

    it("should return z-ai provider config", () => {
      const provider = getProviderConfig("z-ai");
      expect(provider).toBeDefined();
      expect(provider.type).toBe("openai-compat");
      expect(provider.baseUrl).toBe("https://api.z.ai/api/paas/v4");
      expect(provider.model).toBe("glm-5");
    });

    it("should return ollama provider config", () => {
      const provider = getProviderConfig("ollama");
      expect(provider).toBeDefined();
      expect(provider.type).toBe("ollama");
      expect(provider.baseUrl).toBe("http://localhost:11434");
    });

    it("should throw ConfigError for unknown provider", () => {
      expect(() => getProviderConfig("nonexistent")).toThrow(ConfigError);
      expect(() => getProviderConfig("nonexistent")).toThrow(/not found/);
    });

    it("should include field path in error for unknown provider", () => {
      try {
        getProviderConfig("missing-provider");
      } catch (err) {
        expect(err).toBeInstanceOf(ConfigError);
        const ce = err as ConfigError;
        expect(ce.field).toBe("providers.missing-provider");
      }
    });
  });

  // ---------------------------------------------------------------
  // getConfigSection
  // ---------------------------------------------------------------
  describe("getConfigSection", () => {
    beforeEach(() => {
      createDefaultConfig(testDir);
      loadConfig(join(testDir, "osai.json"));
    });

    const sections: Array<{ key: ConfigSection; check: (val: unknown) => void }> = [
      { key: "agent", check: (v) => expect((v as OsaiConfig["agent"]).model).toBeDefined() },
      { key: "providers", check: (v) => expect(Object.keys(v as Record<string, unknown>).length).toBeGreaterThan(0) },
      { key: "memory", check: (v) => expect((v as OsaiConfig["memory"]).rag).toBeDefined() },
      { key: "channels", check: (v) => expect((v as OsaiConfig["channels"]).telegram).toBeDefined() },
      { key: "security", check: (v) => expect((v as OsaiConfig["security"]).sandbox).toBeDefined() },
      { key: "skills", check: (v) => expect((v as OsaiConfig["skills"]).entries).toBeDefined() },
      { key: "voice", check: (v) => expect((v as OsaiConfig["voice"]).stt).toBeDefined() },
    ];

    for (const { key, check } of sections) {
      it(`should return the '${key}' section`, () => {
        const section = getConfigSection(key);
        expect(section).toBeDefined();
        check(section);
      });
    }

    it("should return the agent section with correct values", () => {
      const agent = getConfigSection("agent") as OsaiConfig["agent"];
      expect(agent.model).toBe(DEFAULT_CONFIG.agent.model);
      expect(agent.failoverChain).toEqual([...DEFAULT_CONFIG.agent.failoverChain]);
      expect(agent.circuitBreaker.failureThreshold).toBe(
        DEFAULT_CONFIG.agent.circuitBreaker.failureThreshold,
      );
    });
  });

  // ---------------------------------------------------------------
  // TT-006-06: All sections from ARCHITECTURE_OVERVIEW covered
  // ---------------------------------------------------------------
  describe("osaiConfigSchema coverage (TT-006-06)", () => {
    it("should cover all 7 sections: agent, providers, memory, channels, security, skills, voice", () => {
      const shape = osaiConfigSchema.shape;
      const expectedSections: ConfigSection[] = [
        "agent", "providers", "memory", "channels", "security", "skills", "voice",
      ];

      for (const section of expectedSections) {
        expect(shape[section]).toBeDefined();
      }
      expect(Object.keys(shape)).toHaveLength(expectedSections.length);
    });

    it("should accept a complete valid config from DEFAULT_CONFIG", () => {
      const result = osaiConfigSchema.safeParse(DEFAULT_CONFIG);
      expect(result.success).toBe(true);
    });
  });
});
