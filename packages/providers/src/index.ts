/**
 * @osai/providers -- LLM Providers (DOMAIN-008)
 *
 * Provider registry, failover chain (Z.ai -> Yandex -> Anthropic -> OpenAI -> Ollama),
 * auth profile rotation, circuit breaker.
 */

// Types and interfaces
export type {
  ChatRole,
  ChatMessage,
  ToolCall,
  ToolDefinition,
  TokenUsage,
  LLMChunk,
  LLMRequest,
  LLMResponse,
  ProviderConfig,
  LLMProvider,
} from './types.js';

export { ProviderStatus } from './types.js';

// Error hierarchy
export {
  ProviderError,
  ProviderUnavailableError,
  RateLimitError,
  TokenLimitError,
  AuthError,
  CircuitBreakerOpenError,
} from './errors.js';

// Circuit Breaker
export { CircuitBreaker } from './circuit-breaker/index.js';
export { CircuitState } from './circuit-breaker/index.js';
export type {
  CircuitBreakerConfig,
  CircuitBreakerStats,
} from './circuit-breaker/index.js';

// Base class
export { BaseLLMProvider } from './base.js';

// Providers
export { OpenAIProvider } from './openai/index.js';
export { ZAiProvider } from './z-ai/index.js';
export { AnthropicProvider } from './anthropic/index.js';
export { YandexProvider } from './yandex/index.js';
export { OllamaProvider } from './ollama/index.js';

// Provider Chain + Auth Rotation
export { ProviderChain } from './chain/index.js';
export { AuthRotator } from './chain/index.js';
export { RotationResult } from './chain/index.js';
export type {
  ChainLogger,
  ProviderChainConfig,
  ProviderChainEntryStatus,
} from './chain/index.js';
