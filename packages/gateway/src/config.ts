import { homedir } from "node:os";
import { join } from "node:path";
import {
  existsSync,
  writeFileSync,
  chmodSync,
} from "node:fs";

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

/**
 * Default osai.json configuration content.
 * Keys with placeholder values are intentionally left for the user to fill in.
 *
 * Structure follows ARCHITECTURE_OVERVIEW section 7.4 (Configuration).
 */
export const DEFAULT_CONFIG = {
  agent: {
    model: "z-ai/z-best",
    failoverChain: [
      "z-ai/z-best",
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
