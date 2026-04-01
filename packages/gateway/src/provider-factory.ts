/**
 * @osai/gateway -- Provider Factory
 *
 * Creates a ProviderChain from the osa.json configuration.
 * Supports all 5 providers: Z.ai, Yandex, Anthropic, OpenAI, Ollama.
 * Providers without API keys are skipped.
 */

import pino from "pino";
import type { LLMProvider } from "@osai/providers";
import { ProviderChain } from "@osai/providers";
import { OllamaProvider } from "@osai/providers";
import { ZAiProvider } from "@osai/providers";
import { YandexProvider } from "@osai/providers";
import { AnthropicProvider } from "@osai/providers";
import { OpenAIProvider } from "@osai/providers";
import type { OsaiConfig } from "./config.js";

// ---------------------------------------------------------------------------
// Provider creation helpers
// ---------------------------------------------------------------------------

function createOllamaProvider(config: OsaiConfig, entryModel?: string): LLMProvider | null {
  const pc = config.providers["ollama"];
  if (!pc) return null;

  const baseUrl = process.env.OLLAMA_BASE_URL ?? pc.baseUrl ?? "http://localhost:11434";
  const callTimeout = config.agent.callTimeoutMs ?? 120_000;

  return new OllamaProvider({
    id: "ollama",
    name: "Ollama (Local)",
    baseUrl,
    defaultModel: entryModel ?? pc.model ?? "llama3",
    apiKeys: [],
    timeoutMs: callTimeout,
  });
}

function createZAiProvider(config: OsaiConfig, entryModel?: string): LLMProvider | null {
  const pc = config.providers["z-ai"];
  if (!pc || !pc.apiKey || isPlaceholderKey(pc.apiKey)) return null;

  const baseUrl = pc.baseUrl ?? "https://api.z.ai/api/paas/v4";

  // When z-ai is configured with an Anthropic-compatible endpoint,
  // use AnthropicProvider (Anthropic SDK) instead of ZAiProvider (OpenAI SDK).
  // Z.ai Anthropic-compatible models: glm-4.5-air (haiku), glm-4.7 (sonnet/opus)
  if (baseUrl.includes("/anthropic")) {
    return new AnthropicProvider({
      id: "z-ai",
      name: "Z.ai (Anthropic)",
      baseUrl,
      defaultModel: entryModel ?? pc.model ?? "glm-4.7",
      apiKeys: [pc.apiKey],
    });
  }

  return new ZAiProvider({
    id: "z-ai",
    name: "Z.ai",
    baseUrl,
    defaultModel: entryModel ?? pc.model ?? "glm-5",
    apiKeys: [pc.apiKey],
  });
}

function createYandexProvider(config: OsaiConfig, entryModel?: string): LLMProvider | null {
  const pc = config.providers["yandex"];
  if (!pc || !pc.apiKey || isPlaceholderKey(pc.apiKey)) return null;

  return new YandexProvider({
    id: "yandex",
    name: "Yandex Foundation",
    baseUrl: pc.baseUrl ?? "https://llm.api.cloud.yandex.net/foundationModels/v1",
    defaultModel: entryModel ?? pc.model ?? "yandexgpt-pro",
    apiKeys: [pc.apiKey],
    extra: {
      catalogId: pc.catalogId,
    },
  });
}

function createAnthropicProvider(config: OsaiConfig, entryModel?: string): LLMProvider | null {
  const pc = config.providers["anthropic"];
  if (!pc || !pc.apiKey || isPlaceholderKey(pc.apiKey)) return null;

  return new AnthropicProvider({
    id: "anthropic",
    name: "Anthropic Claude",
    baseUrl: pc.baseUrl ?? "https://api.anthropic.com/v1",
    defaultModel: entryModel ?? pc.model ?? "claude-sonnet-4-20250514",
    apiKeys: [pc.apiKey],
  });
}

function createOpenAIProvider(config: OsaiConfig, entryModel?: string): LLMProvider | null {
  const pc = config.providers["openai"];
  if (!pc || !pc.apiKey || isPlaceholderKey(pc.apiKey)) return null;

  return new OpenAIProvider({
    id: "openai",
    name: "OpenAI",
    baseUrl: pc.baseUrl ?? "https://api.openai.com/v1",
    defaultModel: entryModel ?? pc.model ?? "gpt-4o",
    apiKeys: [pc.apiKey],
  });
}

// ---------------------------------------------------------------------------
// Provider map
// ---------------------------------------------------------------------------

const PROVIDER_FACTORIES: Record<
  string,
  (config: OsaiConfig, entryModel?: string) => LLMProvider | null
> = {
  ollama: createOllamaProvider,
  "z-ai": createZAiProvider,
  yandex: createYandexProvider,
  anthropic: createAnthropicProvider,
  openai: createOpenAIProvider,
};

// ---------------------------------------------------------------------------
// Placeholder detection
// ---------------------------------------------------------------------------

/** API key patterns that indicate the key is a placeholder, not a real key. */
const PLACEHOLDER_PATTERNS = [
  "YOUR_",
  "your_",
  "placeholder",
  "TODO",
  "xxx",
];

function isPlaceholderKey(key: string): boolean {
  const lower = key.toLowerCase();
  return PLACEHOLDER_PATTERNS.some((p) => lower.includes(p.toLowerCase()));
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Create a ProviderChain from the osa.json configuration.
 *
 * Builds providers in the order specified by `config.agent.failoverChain`.
 * Providers without configured API keys (or with placeholder keys) are skipped.
 * Ollama is always included as the last fallback.
 *
 * @param config - Validated osa.json configuration.
 * @returns Configured ProviderChain ready for use with InferenceService.
 */
export function createProviderChain(
  config: OsaiConfig,
  logger?: pino.Logger,
): ProviderChain {
  const log = logger ?? pino({ name: "provider-factory" });
  const providers: LLMProvider[] = [];

  // Build in failover chain order
  const chain = config.agent.failoverChain;

  for (const entry of chain) {
    // Failover chain entries are in "provider/model" format (e.g. "z-ai/z-best")
    const slashIdx = entry.indexOf("/");
    const providerId = slashIdx > 0 ? entry.slice(0, slashIdx) : entry;
    const entryModel = slashIdx > 0 ? entry.slice(slashIdx + 1) : undefined;

    const factory = PROVIDER_FACTORIES[providerId];
    if (!factory) {
      log.warn({ providerId }, `Unknown provider in failover chain, skipping`);
      continue;
    }

    const provider = factory(config, entryModel);
    if (provider) {
      providers.push(provider);
      log.info({ providerId, model: entryModel }, `Provider added to chain`);
    } else {
      log.info({ providerId }, `Provider skipped (not configured)`);
    }
  }

  // Always ensure Ollama is present as fallback (if not already in chain)
  const hasOllama = providers.some((p) => p.id === "ollama");
  if (!hasOllama) {
    const ollama = createOllamaProvider(config);
    if (ollama) {
      providers.push(ollama);
      log.info("Ollama added as implicit fallback");
    }
  }

  if (providers.length === 0) {
    log.error("No providers configured! Agent will not be functional.");
  }

  return new ProviderChain(providers, {
    callTimeoutMs: config.agent.callTimeoutMs ?? 120_000,
    circuitBreaker: {
      failureThreshold: config.agent.circuitBreaker.failureThreshold,
      resetTimeoutMs: config.agent.circuitBreaker.resetTimeoutMs,
    },
    logger: log as never,
  });
}
