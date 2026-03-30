/**
 * Unit tests for ZAiProvider.
 * T-002: Z.ai Provider (OpenAI-Compatible)
 *
 * Tests cover:
 * - TT-002-10: complete() sends correct payload
 * - TT-002-11: complete() returns LLMResponse with usage
 * - TT-002-12: stream() yields LLMChunk objects
 * - TT-002-13: isAvailable() returns true on 200
 * - TT-002-14: 429 response -> RateLimitError
 * - TT-002-15: 5xx response -> ProviderUnavailableError
 * - TT-002-16: baseURL from configuration
 */
export {};
//# sourceMappingURL=z-ai-provider.test.d.ts.map