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

// Base class
export { BaseLLMProvider } from './base.js';

// Providers
export { OpenAIProvider } from './openai/index.js';
export { ZAiProvider } from './z-ai/index.js';
export { AnthropicProvider } from './anthropic/index.js';
