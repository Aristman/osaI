/**
 * Barrel export for the embeddings module.
 */

export type { EmbeddingProvider } from './embedding-provider.js';
export { NoProviderAvailableError, EmbeddingProviderError } from './embedding-provider.js';
export { OllamaEmbeddingProvider } from './ollama-provider.js';
export type { OllamaProviderOptions } from './ollama-provider.js';
export { EmbeddingFallbackChain } from './fallback-chain.js';
