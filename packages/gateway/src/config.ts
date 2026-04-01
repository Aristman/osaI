import { homedir } from "node:os";
import { join } from "node:path";
import {
  existsSync,
  readFileSync,
  writeFileSync,
  chmodSync,
} from "node:fs";
import { z } from "zod";

// ---------------------------------------------------------------------------
// ConfigError -- custom error class for configuration issues
// ---------------------------------------------------------------------------

/**
 * Error thrown when configuration loading or validation fails.
 * Provides structured error information: message, path to offending field,
 * and a user-facing suggestion.
 */
export class ConfigError extends Error {
  public readonly configPath: string;
  public readonly field?: string;

  constructor(
    message: string,
    configPath: string,
    field?: string,
  ) {
    super(message);
    this.name = "ConfigError";
    this.configPath = configPath;
    this.field = field;
  }
}

// ---------------------------------------------------------------------------
// Zod Schema -- type-safe validation for all osai.json sections
// ---------------------------------------------------------------------------

/**
 * Provider configuration schema.
 * Each provider has a type discriminator and common fields.
 */
const providerConfigSchema = z.object({
  type: z.string(),
  baseUrl: z.string().optional(),
  apiKey: z.string().optional(),
  model: z.string().optional(),
  catalogId: z.string().optional(),
  apiId: z.number().optional(),
  apiHash: z.string().optional(),
  phone: z.string().optional(),
});

const telegramBotSchema = z.object({
  enabled: z.boolean(),
  token: z.string(),
  allowedUsers: z.array(z.string()),
});

const telegramUserbotSchema = z.object({
  enabled: z.boolean(),
  apiId: z.number(),
  apiHash: z.string(),
  phone: z.string(),
});

const telegramMirrorSchema = z.object({
  chatId: z.string(),
  telegramChatId: z.number(),
  direction: z.enum(["both", "osai-to-tg", "tg-to-osai"]),
});

const telegramChannelSchema = z.object({
  bot: telegramBotSchema,
  userbot: telegramUserbotSchema,
  mirrors: z.array(telegramMirrorSchema),
});

const skillEntrySchema = z.object({
  enabled: z.boolean(),
  timeout: z.number().optional(),
});

/**
 * Complete osai.json configuration schema.
 * Covers all sections defined in ARCHITECTURE_OVERVIEW section 7.4.
 */
export const osaiConfigSchema = z.object({
  agent: z.object({
    model: z.string(),
    failoverChain: z.array(z.string()),
    circuitBreaker: z.object({
      failureThreshold: z.number(),
      resetTimeoutMs: z.number(),
    }),
  }),
  providers: z.record(z.string(), providerConfigSchema),
  memory: z.object({
    embeddings: z.object({
      default: z.string(),
      ollama: z.object({ model: z.string() }),
      fallback: z.string(),
    }),
    vectorStorage: z.object({
      default: z.string(),
      qdrant: z.object({ url: z.string() }),
    }),
    rag: z.object({
      topK: z.number(),
      minSimilarity: z.number(),
    }),
  }),
  channels: z.object({
    telegram: telegramChannelSchema,
  }),
  security: z.object({
    sandbox: z.object({
      allowedDirs: z.array(z.string()),
      blockedPatterns: z.array(z.string()),
    }),
    shell: z.object({
      blockedCommands: z.array(z.string()),
      timeout: z.number(),
    }),
  }),
  skills: z.object({
    allowBundled: z.boolean(),
    extraDirs: z.array(z.string()),
    entries: z.record(z.string(), skillEntrySchema),
  }),
  voice: z.object({
    stt: z.object({
      primary: z.string(),
      fallback: z.string(),
    }),
    tts: z.object({
      primary: z.string(),
      fallback: z.string(),
    }),
  }),
});

// ---------------------------------------------------------------------------
// Client config push schema (only agent + providers)
// ---------------------------------------------------------------------------

/**
 * Schema for config.push messages from CLI clients.
 * Only validates the `agent` and `providers` sections needed for ProviderChain.
 */
export const clientConfigPushSchema = z.object({
  agent: z.object({
    model: z.string(),
    failoverChain: z.array(z.string()),
    circuitBreaker: z.object({
      failureThreshold: z.number(),
      resetTimeoutMs: z.number(),
    }),
  }),
  providers: z.record(z.string(), providerConfigSchema),
});

export type ClientConfigPush = z.infer<typeof clientConfigPushSchema>;

/**
 * Validate a client config push payload.
 *
 * @returns Parsed client config on success.
 * @throws Error with human-readable validation message on failure.
 */
export function validateClientConfig(payload: unknown): ClientConfigPush {
  const result = clientConfigPushSchema.safeParse(payload);
  if (!result.success) {
    const firstIssue = result.error.issues[0];
    const fieldPath = firstIssue?.path?.join(".");
    throw new Error(
      `Client config validation failed at '${fieldPath ?? "unknown"}': ${firstIssue?.message ?? "unknown error"}`,
    );
  }
  return result.data;
}

/**
 * Merge a client-pushed config (agent + providers) with DEFAULT_CONFIG.
 * The client config overrides defaults; all other sections come from DEFAULT_CONFIG.
 */
export function mergeClientConfig(clientConfig: ClientConfigPush): OsaiConfig {
  return osaiConfigSchema.parse({
    ...DEFAULT_CONFIG,
    agent: clientConfig.agent,
    providers: clientConfig.providers,
  });
}

// Inferred type from the Zod schema (runtime-validated config shape).
export type OsaiConfig = z.infer<typeof osaiConfigSchema>;

// Section keys that can be queried via getConfigSection.
export type ConfigSection = keyof OsaiConfig;

// ---------------------------------------------------------------------------
// Path helpers
// ---------------------------------------------------------------------------

/**
 * Returns the root path of the osai data directory (~/.osai).
 */
export function getOsaiDir(): string {
  return join(homedir(), ".osai");
}

/**
 * Returns the path to the osai configuration file.
 */
export function getConfigPath(): string {
  return join(getOsaiDir(), "osai.json");
}

// ---------------------------------------------------------------------------
// Default configuration
// ---------------------------------------------------------------------------

/**
 * Default osai.json configuration content.
 * Keys with placeholder values are intentionally left for the user to fill in.
 *
 * Structure follows ARCHITECTURE_OVERVIEW section 7.4 (Configuration).
 */
export const DEFAULT_CONFIG = {
  agent: {
    model: "z-ai/glm-5-turbo",
    failoverChain: [
      "z-ai/glm-5-turbo",
      "yandex/yandexgpt-pro",
      "anthropic/claude-opus-4-6",
      "openai/gpt-4o",
      "ollama/llama3",
    ],
    circuitBreaker: {
      failureThreshold: 5,
      resetTimeoutMs: 30000,
    },
  },
  providers: {
    "z-ai": {
      type: "openai-compat",
      baseUrl: "https://api.z.ai/api/paas/v4",
      apiKey: "YOUR_ZAI_API_KEY",
      model: "glm-5",
    },
    yandex: {
      type: "yandex-foundation",
      catalogId: "YOUR_CATALOG_ID",
      apiKey: "YOUR_YANDEX_API_KEY",
      model: "yandexgpt-pro",
    },
    anthropic: {
      type: "anthropic",
      apiKey: "YOUR_ANTHROPIC_API_KEY",
    },
    openai: {
      type: "openai",
      apiKey: "YOUR_OPENAI_API_KEY",
    },
    ollama: {
      type: "ollama",
      baseUrl: "http://localhost:11434",
      model: "llama3",
    },
  },
  memory: {
    embeddings: {
      default: "ollama",
      ollama: { model: "nomic-embed-text" },
      fallback: "yandex",
    },
    vectorStorage: {
      default: "sqlite-vec",
      qdrant: { url: "http://localhost:6333" },
    },
    rag: { topK: 5, minSimilarity: 0.7 },
  },
  channels: {
    telegram: {
      bot: {
        enabled: false,
        token: "YOUR_TELEGRAM_BOT_TOKEN",
        allowedUsers: [],
      },
      userbot: {
        enabled: false,
        apiId: 0,
        apiHash: "YOUR_API_HASH",
        phone: "YOUR_PHONE",
      },
      mirrors: [],
    },
  },
  security: {
    sandbox: {
      allowedDirs: ["~/projects", "~/documents", "/tmp/osai"],
      blockedPatterns: ["~/.ssh/**", "~/.gnupg/**", "/etc/**"],
    },
    shell: {
      blockedCommands: ["rm -rf /", "mkfs"],
      timeout: 120,
    },
  },
  skills: {
    allowBundled: true,
    extraDirs: ["~/.osai/workspace/skills", "~/.osai/skills"],
    entries: {
      filesystem: { enabled: true },
      shell: { enabled: true, timeout: 120 },
      memory: { enabled: true },
      "knowledge-base": { enabled: true },
      "chat-management": { enabled: true },
      "os-integration": { enabled: true },
    },
  },
  voice: {
    stt: { primary: "whisper-cpp", fallback: "yandex" },
    tts: { primary: "piper", fallback: "yandex" },
  },
} as const;

// ---------------------------------------------------------------------------
// Config file creation
// ---------------------------------------------------------------------------

/**
 * Creates the default osai.json configuration file.
 * Will NOT overwrite an existing configuration file (idempotent).
 * On Unix-like systems sets file permissions to 0o600 (owner read/write only).
 * On Windows, permissions are best-effort via chmod (may not fully apply on NTFS).
 *
 * @param baseDir - Optional override for the osai directory path (used in tests).
 * @returns true if the config was created, false if it already existed.
 */
export function createDefaultConfig(baseDir?: string): boolean {
  const configPath = baseDir
    ? join(baseDir, "osai.json")
    : getConfigPath();

  if (existsSync(configPath)) {
    return false;
  }

  const configContent = JSON.stringify(DEFAULT_CONFIG, null, 2) + "\n";
  writeFileSync(configPath, configContent, { encoding: "utf-8" });

  // Best-effort permission 600 for security (NFR-S03)
  try {
    chmodSync(configPath, 0o600);
  } catch {
    // Windows NTFS may not fully support POSIX chmod;
    // this is acceptable per the roadmap risk mitigation.
  }

  return true;
}

// ---------------------------------------------------------------------------
// Deep merge utility
// ---------------------------------------------------------------------------

/**
 * Deeply merges source into target. For plain objects, merges recursively.
 * For arrays and primitives, source value wins.
 */
function deepMerge<T extends Record<string, unknown>>(
  target: T,
  source: Partial<T>,
): T {
  const result = { ...target };

  for (const key of Object.keys(source) as Array<keyof T>) {
    const srcVal = source[key];
    const tgtVal = result[key];

    if (
      srcVal !== null &&
      srcVal !== undefined &&
      typeof srcVal === "object" &&
      !Array.isArray(srcVal) &&
      tgtVal !== null &&
      tgtVal !== undefined &&
      typeof tgtVal === "object" &&
      !Array.isArray(tgtVal)
    ) {
      result[key] = deepMerge(
        tgtVal as Record<string, unknown>,
        srcVal as Record<string, unknown>,
      ) as T[keyof T];
    } else if (srcVal !== undefined) {
      result[key] = srcVal as T[keyof T];
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Config loading, validation, caching
// ---------------------------------------------------------------------------

/** In-memory cache for the loaded configuration. */
let cachedConfig: OsaiConfig | null = null;

/**
 * Loads and validates osai.json configuration.
 *
 * Strategy:
 * 1. If config file does not exist, return DEFAULT_CONFIG (fallback).
 * 2. Read file, parse JSON, validate with Zod.
 * 3. Deep-merge user config over defaults (missing keys get default values).
 * 4. Validate the merged result.
 * 5. Cache the config in memory for subsequent getConfig() calls.
 *
 * @param configPathOverride - Optional path override (used in tests).
 * @returns Validated configuration object.
 * @throws {ConfigError} When the file exists but contains invalid JSON or
 *                       fails Zod validation.
 */
export function loadConfig(configPathOverride?: string): OsaiConfig {
  const configPath = configPathOverride ?? getConfigPath();

  if (!existsSync(configPath)) {
    // Fallback to default config (no file present).
    cachedConfig = osaiConfigSchema.parse(DEFAULT_CONFIG);
    return cachedConfig;
  }

  // Read and parse file.
  let raw: unknown;
  try {
    const content = readFileSync(configPath, { encoding: "utf-8" });
    raw = JSON.parse(content) as unknown;
  } catch (err) {
    const message =
      err instanceof SyntaxError
        ? `Invalid JSON in ${configPath}: ${err.message}`
        : `Failed to read configuration file: ${configPath}`;

    throw new ConfigError(
      message + ". Run 'osai init' to create a valid configuration.",
      configPath,
    );
  }

  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new ConfigError(
      `Configuration file ${configPath} must contain a JSON object. ` +
        "Run 'osai init' to create a valid configuration.",
      configPath,
    );
  }

  // Deep merge: user config overrides defaults.
  const merged = deepMerge(
    DEFAULT_CONFIG as unknown as Record<string, unknown>,
    raw as Partial<Record<string, unknown>>,
  );

  // Validate with Zod.
  const result = osaiConfigSchema.safeParse(merged);

  if (!result.success) {
    const firstIssue = result.error.issues[0];
    const fieldPath = firstIssue?.path?.join(".");
    const message =
      `Configuration validation failed at '${fieldPath ?? "unknown"}': ` +
      `${firstIssue?.message ?? "unknown error"}. ` +
      `Check ${configPath} for errors.`;

    throw new ConfigError(message, configPath, fieldPath);
  }

  cachedConfig = result.data;
  return cachedConfig;
}

/**
 * Validates a configuration object against the Zod schema.
 * Does NOT modify the cache.
 *
 * @param config - Raw configuration object to validate.
 * @returns The parsed (and type-narrowed) configuration.
 * @throws {ConfigError} When validation fails.
 */
export function validateConfig(config: unknown): OsaiConfig {
  const result = osaiConfigSchema.safeParse(config);

  if (!result.success) {
    const firstIssue = result.error.issues[0];
    const fieldPath = firstIssue?.path?.join(".");
    const message =
      `Configuration validation failed at '${fieldPath ?? "unknown"}': ` +
      `${firstIssue?.message ?? "unknown error"}`;

    throw new ConfigError(message, "", fieldPath);
  }

  return result.data;
}

/**
 * Returns the currently cached configuration.
 * If no config has been loaded yet, triggers loadConfig().
 *
 * @returns The cached configuration object.
 */
export function getConfig(): OsaiConfig {
  if (cachedConfig === null) {
    return loadConfig();
  }
  return cachedConfig;
}

/**
 * Reloads the configuration from disk (re-reads and re-validates the file).
 * Updates the in-memory cache.
 *
 * @param configPathOverride - Optional path override (used in tests).
 * @returns The freshly loaded configuration.
 */
export function reloadConfig(configPathOverride?: string): OsaiConfig {
  cachedConfig = null;
  return loadConfig(configPathOverride);
}

/**
 * Returns the configuration for a specific LLM provider.
 *
 * @param providerId - Provider identifier (e.g. "z-ai", "yandex", "ollama").
 * @returns The provider configuration object.
 * @throws {ConfigError} When the provider is not found in the config.
 */
export function getProviderConfig(
  providerId: string,
): OsaiConfig["providers"][string] {
  const config = getConfig();

  const provider = config.providers[providerId];
  if (provider === undefined) {
    throw new ConfigError(
      `Provider '${providerId}' not found in configuration. ` +
        `Available providers: ${Object.keys(config.providers).join(", ")}`,
      "",
      `providers.${providerId}`,
    );
  }

  return provider;
}

/**
 * Returns a specific section of the configuration.
 *
 * @param section - The top-level section name (agent, providers, memory,
 *                  channels, security, skills, voice).
 * @returns The configuration section object.
 * @throws {ConfigError} When the section is not a valid config section.
 */
export function getConfigSection(section: ConfigSection): OsaiConfig[ConfigSection] {
  const config = getConfig();

  const value = config[section];
  if (value === undefined) {
    throw new ConfigError(
      `Configuration section '${section}' not found.`,
      "",
      section,
    );
  }

  return value;
}

/**
 * Resets the internal config cache.
 * Primarily used in tests to ensure a clean state.
 */
export function resetConfigCache(): void {
  cachedConfig = null;
}
