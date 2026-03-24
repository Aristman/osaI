/**
 * Tests for T-001: Configuration Schema Definition
 */

import { describe, it, expect } from 'vitest';
import {
  validateConfig,
  applyDefaults,
  DEFAULT_CONFIG,
  CONFIG_SCHEMA_VERSION,
  isGatewayConfig,
  isModelConfig,
  isSessionConfig,
  isSkillsConfig,
  isSecurityConfig,
  isMemoryConfig,
  isObservabilityConfig,
  isOsaIConfig,
} from '../schema.js';

describe('T-001: Configuration Schema Definition', () => {
  // T001-UT-01: Validate full config with all sections
  describe('validateConfig', () => {
    it('T001-UT-01: should validate full config with all sections', () => {
      const config = {
        version: '1.0.0',
        gateway: { host: '0.0.0.0', port: 8080, cors: ['*'], heartbeat: 15000 },
        model: { provider: 'openai', model: 'gpt-4', apiKey: 'test-key', maxTokens: 4096, temperature: 0.5, fallbacks: [] },
        session: { maxHistory: 50, timeout: 300000, pruning: 70, activationMode: 'always' },
        skills: { enabled: ['fs'], disabled: [], extraDirs: ['/tmp/skills'], watch: false, entries: [] },
        security: { sandboxEnabled: false, blockedCommands: ['rm'] },
        memory: { enabled: true, provider: 'qdrant' },
        observability: { traces: { enabled: true, exporter: 'jaeger' } },
      };

      const result = validateConfig(config);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    // T001-UT-02: Validate minimal config (empty object -> actually requires gateway and model)
    it('T001-UT-02: should validate minimal config with just required fields', () => {
      const config = {
        gateway: { host: '127.0.0.1', port: 18789 },
        model: { provider: 'anthropic', model: 'claude-3-opus' },
      };

      const result = validateConfig(config);
      expect(result.valid).toBe(true);
    });

    // T001-UT-03: Validate invalid config type
    it('T001-UT-03: should reject invalid config type', () => {
      const result = validateConfig('not an object');
      expect(result.valid).toBe(false);
      expect(result.errors[0]?.message).toContain('must be an object');

      const result2 = validateConfig(42);
      expect(result2.valid).toBe(false);

      const result3 = validateConfig(null);
      expect(result3.valid).toBe(false);
    });

    // T001-UT-04: Type guard for gateway section
    it('T001-UT-04: isGatewayConfig type guard should return correct boolean', () => {
      expect(isGatewayConfig({ host: '127.0.0.1', port: 8080 })).toBe(true);
      expect(isGatewayConfig({ host: '127.0.0.1' })).toBe(false); // missing port
      expect(isGatewayConfig(null)).toBe(false);
      expect(isGatewayConfig('string')).toBe(false);
      expect(isGatewayConfig({})).toBe(false);
    });

    // T001-UT-05: Type guard for model section
    it('T001-UT-05: isModelConfig type guard should return correct boolean', () => {
      expect(isModelConfig({ provider: 'anthropic', model: 'claude-3' })).toBe(true);
      expect(isModelConfig({ provider: 'anthropic' })).toBe(false); // missing model
      expect(isModelConfig(null)).toBe(false);
      expect(isModelConfig([])).toBe(false);
    });

    // T001-UT-06: Missing required field detected
    it('T001-UT-06: should detect missing required fields', () => {
      const result = validateConfig({ gateway: { host: '127.0.0.1', port: 8080 } });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.path === 'model' && e.message.includes('missing'))).toBe(true);
    });

    // T001-UT-07: Invalid enum value detected
    it('T001-UT-07: should detect invalid enum values', () => {
      const config = {
        gateway: { host: '127.0.0.1', port: 18789 },
        model: { provider: 'invalid_provider', model: 'test' },
      };
      const result = validateConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.message.includes('not one of'))).toBe(true);
    });

    // T001-UT-08: Nested object validation
    it('T001-UT-08: should report nested object validation errors', () => {
      const config = {
        gateway: { host: '127.0.0.1', port: 18789 },
        model: { provider: 'anthropic', model: 'claude-3' },
        session: { maxHistory: 'not_a_number' },
      };
      const result = validateConfig(config);
      // session.maxHistory is optional but if provided should be number
      // The validator only checks types of provided fields
      expect(result.errors.some(e => e.path.includes('maxHistory') && e.message.includes('type'))).toBe(true);
    });

    // Additional: additional properties rejected at root
    it('should reject unexpected properties at root level', () => {
      const config = {
        gateway: { host: '127.0.0.1', port: 18789 },
        model: { provider: 'anthropic', model: 'claude-3' },
        unknownField: 'value',
      };
      const result = validateConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.message.includes('unknownField'))).toBe(true);
    });

    // Additional: number constraints (min/max)
    it('should enforce number constraints', () => {
      const config = {
        gateway: { host: '127.0.0.1', port: 99999 },
        model: { provider: 'anthropic', model: 'claude-3' },
      };
      const result = validateConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.message.includes('greater than maximum'))).toBe(true);
    });
  });

  // Type guards for other sections
  describe('type guards', () => {
    it('isSessionConfig should work correctly', () => {
      expect(isSessionConfig({ maxHistory: 100 })).toBe(true);
      expect(isSessionConfig(null)).toBe(false);
      expect(isSessionConfig(42)).toBe(false);
    });

    it('isSkillsConfig should work correctly', () => {
      expect(isSkillsConfig({ enabled: ['fs'] })).toBe(true);
      expect(isSkillsConfig(null)).toBe(false);
    });

    it('isSecurityConfig should work correctly', () => {
      expect(isSecurityConfig({ sandboxEnabled: true })).toBe(true);
      expect(isSecurityConfig(null)).toBe(false);
    });

    it('isMemoryConfig should work correctly', () => {
      expect(isMemoryConfig({ enabled: true })).toBe(true);
      expect(isMemoryConfig(null)).toBe(false);
    });

    it('isObservabilityConfig should work correctly', () => {
      expect(isObservabilityConfig({ traces: { enabled: true } })).toBe(true);
      expect(isObservabilityConfig(null)).toBe(false);
    });

    it('isOsaIConfig should work correctly', () => {
      expect(isOsaIConfig({ gateway: { host: '127.0.0.1', port: 8080 }, model: { provider: 'anthropic', model: 'test' } })).toBe(true);
      expect(isOsaIConfig({ gateway: { host: '127.0.0.1' }, model: { provider: 'anthropic', model: 'test' } })).toBe(false);
      expect(isOsaIConfig(null)).toBe(false);
    });
  });

  // T001-UT-10: Default values are frozen/immutable
  describe('DEFAULT_CONFIG', () => {
    it('T001-UT-10: default config should be frozen/immutable', () => {
      expect(Object.isFrozen(DEFAULT_CONFIG)).toBe(true);
      // Attempting to modify should be no-op in strict mode or throw
      expect(() => {
        (DEFAULT_CONFIG as Record<string, unknown>).version = '2.0.0';
      }).toThrow();
    });

    it('should have correct default values', () => {
      expect(DEFAULT_CONFIG.gateway.host).toBe('127.0.0.1');
      expect(DEFAULT_CONFIG.gateway.port).toBe(18789);
      expect(DEFAULT_CONFIG.model.provider).toBe('anthropic');
      expect(DEFAULT_CONFIG.model.model).toBe('claude-sonnet-4-20250514');
      expect(DEFAULT_CONFIG.session?.maxHistory).toBe(100);
      expect(DEFAULT_CONFIG.skills?.watch).toBe(true);
      expect(DEFAULT_CONFIG.security?.sandboxEnabled).toBe(true);
      expect(DEFAULT_CONFIG.memory?.enabled).toBe(false);
      expect(DEFAULT_CONFIG.observability?.audit?.enabled).toBe(true);
    });
  });

  // CONFIG_SCHEMA_VERSION
  it('should export config schema version', () => {
    expect(CONFIG_SCHEMA_VERSION).toBe('1.0.0');
  });

  // applyDefaults
  describe('applyDefaults', () => {
    it('should merge user config with defaults', () => {
      const result = applyDefaults({
        gateway: { host: '0.0.0.0', port: 9999 },
        model: { provider: 'ollama', model: 'llama3', apiKey: 'test' },
      });

      expect(result.gateway.host).toBe('0.0.0.0');
      expect(result.gateway.port).toBe(9999);
      // Defaults should fill in other fields
      expect(result.gateway.heartbeat).toBe(30000);
      expect(result.model.provider).toBe('ollama');
      expect(result.session?.maxHistory).toBe(100);
    });

    it('should deeply merge nested objects', () => {
      const result = applyDefaults({
        gateway: { host: '127.0.0.1', port: 18789 },
        model: { provider: 'anthropic', model: 'claude-3' },
        observability: {
          logs: { level: 'debug' as const },
        },
      } as Partial<import('@osai/types').OsaIConfig>);

      expect(result.observability?.logs?.level).toBe('debug');
      expect(result.observability?.logs?.format).toBe('json'); // from defaults
    });

    it('should not mutate DEFAULT_CONFIG', () => {
      const originalVersion = DEFAULT_CONFIG.version;
      applyDefaults({
        gateway: { host: '0.0.0.0', port: 9999 },
        model: { provider: 'ollama', model: 'llama3' },
        version: '2.0.0',
      } as Partial<import('@osai/types').OsaIConfig>);
      expect(DEFAULT_CONFIG.version).toBe(originalVersion);
    });
  });
});
