/**
 * @osai/agent -- Model Resolver module
 *
 * Barrel export for model resolution, failover, circuit breaker,
 * and provider implementations.
 */

export { ModelResolver } from './ModelResolver.js';
export type { ModelProviderConfig, ModelResolverOptions } from './ModelResolver.js';

export { ModelError, AllProvidersExhaustedError } from './errors.js';
export type { ProviderAttempt } from './errors.js';

export { ClaudeProvider } from './providers/ClaudeProvider.js';
export type { ClaudeProviderConfig } from './providers/ClaudeProvider.js';

export { OpenAIProvider } from './providers/OpenAIProvider.js';
export type { OpenAIProviderConfig } from './providers/OpenAIProvider.js';

export { OllamaProvider } from './providers/OllamaProvider.js';
export type { OllamaProviderConfig } from './providers/OllamaProvider.js';
