/**
 * Unit tests for ModelResolver, failover chain, circuit breaker,
 * exponential backoff, and provider implementations.
 */

import { describe, it, expect } from 'vitest';
import { ModelResolver } from '../model/ModelResolver.js';
import { ClaudeProvider } from '../model/providers/ClaudeProvider.js';
import { OpenAIProvider } from '../model/providers/OpenAIProvider.js';
import { OllamaProvider } from '../model/providers/OllamaProvider.js';
import { AllProvidersExhaustedError } from '../model/errors.js';
import type { ModelProviderConfig } from '../model/ModelResolver.js';
import type { ModelMessage } from '../types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const testMessages: ModelMessage[] = [
  { role: 'user', content: 'Hello' },
];

function makeConfig(
  provider: string,
  model: string,
  overrides: Partial<ModelProviderConfig> = {},
): ModelProviderConfig {
  return { provider, model, ...overrides };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ModelResolver', () => {
  // 1. Primary model selection -- Claude is active
  describe('Primary model selection', () => {
    it('returns Claude as the active provider when it is first in the list', () => {
      const resolver = new ModelResolver([
        makeConfig('claude', 'claude-3-opus'),
        makeConfig('openai', 'gpt-4'),
        makeConfig('ollama', 'llama3'),
      ]);

      const active = resolver.resolve();
      expect(active.name).toBe('claude');
      expect(active.model).toBe('claude-3-opus');
    });
  });

  // 2. Failover to GPT on Claude error
  describe('Failover to GPT on Claude error', () => {
    it('switches to OpenAI when failover() is called and Claude is current', () => {
      const resolver = new ModelResolver([
        makeConfig('claude', 'claude-3-opus'),
        makeConfig('openai', 'gpt-4'),
        makeConfig('ollama', 'llama3'),
      ]);

      const next = resolver.failover();
      expect(next.name).toBe('openai');
      expect(next.model).toBe('gpt-4');
    });
  });

  // 3. Failover to Ollama on GPT error
  describe('Failover to Ollama on GPT error', () => {
    it('switches to Ollama when called twice (skipping Claude and GPT)', () => {
      const resolver = new ModelResolver([
        makeConfig('claude', 'claude-3-opus'),
        makeConfig('openai', 'gpt-4'),
        makeConfig('ollama', 'llama3'),
      ]);

      resolver.failover(); // -> openai
      const next = resolver.failover(); // -> ollama
      expect(next.name).toBe('ollama');
      expect(next.model).toBe('llama3');
    });
  });

  // 4. All providers fail raises AllProvidersExhaustedError
  describe('All providers fail', () => {
    it('throws AllProvidersExhaustedError when all providers are circuit-broken', () => {
      const resolver = new ModelResolver(
        [
          makeConfig('claude', 'claude-3-opus'),
          makeConfig('openai', 'gpt-4'),
        ],
        { circuitBreakerThreshold: 1 },
      );

      // Trip circuit breaker on Claude
      resolver.recordFailure();

      // Failover to OpenAI, then trip its circuit breaker
      resolver.failover();
      resolver.recordFailure();

      // Both are unavailable -- failover should throw
      expect(() => resolver.failover()).toThrow(AllProvidersExhaustedError);
    });

    it('AllProvidersExhaustedError contains attempt details', () => {
      const resolver = new ModelResolver(
        [
          makeConfig('claude', 'claude-3-opus'),
          makeConfig('openai', 'gpt-4'),
        ],
        { circuitBreakerThreshold: 1 },
      );

      resolver.recordFailure();
      resolver.failover();
      resolver.recordFailure();

      try {
        resolver.failover();
        expect.unreachable('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(AllProvidersExhaustedError);
        const exhausted = err as AllProvidersExhaustedError;
        expect(exhausted.attempts.length).toBeGreaterThan(0);
      }
    });
  });

  // 5. Exponential backoff: 1s, 2s, 4s, 8s
  describe('Exponential backoff', () => {
    it('computes delays: 1000, 2000, 4000, 8000 ms for attempts 1-4', () => {
      const resolver = new ModelResolver(
        [makeConfig('claude', 'claude-3-opus')],
        { baseDelay: 1000 },
      );

      expect(resolver.backoff(1)).toBe(1000);
      expect(resolver.backoff(2)).toBe(2000);
      expect(resolver.backoff(3)).toBe(4000);
      expect(resolver.backoff(4)).toBe(8000);
    });
  });

  // 6. Get active model info
  describe('getActiveModel', () => {
    it('returns ModelInfo for the currently active provider', () => {
      const resolver = new ModelResolver([
        makeConfig('claude', 'claude-3-opus'),
        makeConfig('openai', 'gpt-4'),
      ]);

      const info = resolver.getActiveModel();
      expect(info).toEqual({
        name: 'claude',
        provider: 'claude',
        model: 'claude-3-opus',
        active: true,
      });
    });

    it('reflects failover state after switching', () => {
      const resolver = new ModelResolver([
        makeConfig('claude', 'claude-3-opus'),
        makeConfig('openai', 'gpt-4'),
      ]);

      resolver.failover();
      const info = resolver.getActiveModel();
      expect(info.provider).toBe('openai');
      expect(info.model).toBe('gpt-4');
    });
  });

  // 7. Streaming support -- provider has stream method
  describe('Streaming support', () => {
    it('ClaudeProvider has a stream method that yields StreamChunks', async () => {
      const provider = new ClaudeProvider({ model: 'claude-3-opus' });
      expect(typeof provider.stream).toBe('function');

      const chunks: Array<{ type: string }> = [];
      for await (const chunk of provider.stream!(testMessages)) {
        chunks.push(chunk);
      }
      expect(chunks.length).toBeGreaterThan(0);
      expect(chunks.some((c) => c.type === 'done')).toBe(true);
    });

    it('OpenAIProvider has a stream method', async () => {
      const provider = new OpenAIProvider({ model: 'gpt-4' });
      expect(typeof provider.stream).toBe('function');

      const chunks: Array<{ type: string }> = [];
      for await (const chunk of provider.stream!(testMessages)) {
        chunks.push(chunk);
      }
      expect(chunks.some((c) => c.type === 'done')).toBe(true);
    });

    it('OllamaProvider has a stream method', async () => {
      const provider = new OllamaProvider({ model: 'llama3' });
      expect(typeof provider.stream).toBe('function');

      const chunks: Array<{ type: string }> = [];
      for await (const chunk of provider.stream!(testMessages)) {
        chunks.push(chunk);
      }
      expect(chunks.some((c) => c.type === 'done')).toBe(true);
    });
  });

  // 8. Circuit breaker -- provider marked unavailable after N failures
  describe('Circuit breaker', () => {
    it('provider is marked unavailable after reaching threshold', () => {
      const resolver = new ModelResolver(
        [makeConfig('claude', 'claude-3-opus')],
        { circuitBreakerThreshold: 3 },
      );

      // Not unavailable yet
      expect(resolver.getActiveModel().active).toBe(true);

      resolver.recordFailure();
      expect(resolver.getActiveModel().active).toBe(true);

      resolver.recordFailure();
      expect(resolver.getActiveModel().active).toBe(true);

      // Third failure triggers circuit breaker
      resolver.recordFailure();
      expect(resolver.getActiveModel().active).toBe(false);
    });
  });

  // 9. Reset returns to primary
  describe('Reset returns to primary', () => {
    it('reset() sets active provider back to the first one', () => {
      const resolver = new ModelResolver([
        makeConfig('claude', 'claude-3-opus'),
        makeConfig('openai', 'gpt-4'),
        makeConfig('ollama', 'llama3'),
      ]);

      // Failover twice: claude -> openai -> ollama
      resolver.failover();
      resolver.failover();
      expect(resolver.resolve().name).toBe('ollama');

      resolver.reset();
      expect(resolver.resolve().name).toBe('claude');
    });

    it('reset() clears circuit breaker state', () => {
      const resolver = new ModelResolver(
        [makeConfig('claude', 'claude-3-opus')],
        { circuitBreakerThreshold: 1 },
      );

      resolver.recordFailure();
      expect(resolver.getActiveModel().active).toBe(false);

      resolver.reset();
      expect(resolver.getActiveModel().active).toBe(true);
    });
  });

  // 10. Provider with custom baseUrl
  describe('Provider with custom baseUrl', () => {
    it('ClaudeProvider can be created with a custom baseUrl', () => {
      const provider = new ClaudeProvider({
        model: 'claude-3-opus',
        baseUrl: 'https://custom-proxy.example.com/v1',
      });
      expect(provider.model).toBe('claude-3-opus');
      // Provider is functional (mock)
      expect(typeof provider.complete).toBe('function');
    });

    it('ModelResolver accepts configs with baseUrl', () => {
      const resolver = new ModelResolver([
        makeConfig('claude', 'claude-3-opus', { baseUrl: 'https://proxy.example.com' }),
        makeConfig('openai', 'gpt-4', { baseUrl: 'https://openai-proxy.example.com' }),
      ]);

      const active = resolver.resolve();
      expect(active.model).toBe('claude-3-opus');
    });
  });

  // 11. Timeout handling
  describe('Timeout handling', () => {
    it('accepts timeout in provider config', () => {
      const provider = new ClaudeProvider({
        model: 'claude-3-opus',
        timeout: 5000,
      });
      expect(provider.model).toBe('claude-3-opus');
      expect(typeof provider.complete).toBe('function');
    });

    it('ModelResolver passes timeout through config', () => {
      const resolver = new ModelResolver([
        makeConfig('claude', 'claude-3-opus', { timeout: 10000 }),
      ]);
      expect(resolver.resolve().model).toBe('claude-3-opus');
    });
  });

  // 12. Constructor with empty providers throws error
  describe('Constructor validation', () => {
    it('throws when providers array is empty', () => {
      expect(() => new ModelResolver([])).toThrow('at least one provider');
    });
  });

  // Additional coverage
  describe('completeWithFailover', () => {
    it('returns result from primary on success', async () => {
      const resolver = new ModelResolver([
        makeConfig('claude', 'claude-3-opus'),
        makeConfig('openai', 'gpt-4'),
      ]);

      const result = await resolver.completeWithFailover(testMessages);
      expect(result.content).toContain('[claude]');
      expect(result.finishReason).toBe('stop');
    });

    it('falls back to second provider when primary throws', async () => {
      const resolver = new ModelResolver([
        makeConfig('claude', 'claude-3-opus'),
        makeConfig('openai', 'gpt-4'),
      ]);

      // Trip circuit breaker on Claude by recording 3 failures
      // (threshold is 3, default). Then completeWithFailover should skip to OpenAI.
      resolver.recordFailure();
      resolver.recordFailure();
      resolver.recordFailure(); // trip circuit breaker

      // After circuit breaker on claude, completeWithFailover should go to openai
      const result = await resolver.completeWithFailover(testMessages);
      expect(result.content).toContain('[openai]');
    });

    it('throws AllProvidersExhaustedError when all fail', async () => {
      const resolver = new ModelResolver(
        [
          makeConfig('claude', 'claude-3-opus'),
          makeConfig('openai', 'gpt-4'),
        ],
        { circuitBreakerThreshold: 1 },
      );

      // Trip circuit breaker on both
      resolver.recordFailure();
      resolver.failover();
      resolver.recordFailure();

      await expect(resolver.completeWithFailover(testMessages)).rejects.toThrow(
        AllProvidersExhaustedError,
      );
    });
  });

  describe('recordSuccess', () => {
    it('resets the failure counter on the active provider', () => {
      const resolver = new ModelResolver(
        [makeConfig('claude', 'claude-3-opus')],
        { circuitBreakerThreshold: 3 },
      );

      resolver.recordFailure();
      resolver.recordFailure();
      resolver.recordSuccess();

      // Counter was reset, so one more failure does NOT trip the breaker
      resolver.recordFailure();
      expect(resolver.getActiveModel().active).toBe(true);
    });
  });

  describe('backoff cap', () => {
    it('caps backoff at 60 seconds', () => {
      const resolver = new ModelResolver(
        [makeConfig('claude', 'claude-3-opus')],
        { baseDelay: 1000 },
      );

      // 2^20 * 1000 = ~1 billion -- should cap at 60000
      expect(resolver.backoff(20)).toBe(60_000);
    });
  });

  describe('unknown provider', () => {
    it('throws on unknown provider name', () => {
      expect(
        () => new ModelResolver([makeConfig('unknown_provider', 'model-x')]),
      ).toThrow('Unknown provider: unknown_provider');
    });
  });
});
