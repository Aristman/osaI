import { describe, it, expect } from 'vitest';
import type {
  OsaIConfig,
  ModelConfig,
  GatewayConfig,
  SessionConfig,
  SkillsConfig,
  SecurityConfig,
} from '../src/config.js';

describe('Config Types', () => {
  it('ModelConfig has required fields: provider, model, apiKey', () => {
    const config: ModelConfig = {
      provider: 'anthropic',
      model: 'claude-opus-4-20250514',
      apiKey: 'sk-test',
    };
    expect(config.provider).toBe('anthropic');
    expect(config.model).toBe('claude-opus-4-20250514');
    expect(config.apiKey).toBe('sk-test');
  });

  it('ModelConfig supports optional fallbacks', () => {
    const config: ModelConfig = {
      provider: 'anthropic',
      model: 'claude-opus-4-20250514',
      apiKey: 'sk-test',
      fallbacks: [
        {
          provider: 'openai',
          model: 'gpt-4o',
          apiKey: 'sk-test2',
        },
      ],
    };
    expect(config.fallbacks).toHaveLength(1);
    expect(config.fallbacks![0].provider).toBe('openai');
  });

  it('GatewayConfig has host and port', () => {
    const config: GatewayConfig = {
      host: '127.0.0.1',
      port: 18789,
    };
    expect(config.host).toBe('127.0.0.1');
    expect(config.port).toBe(18789);
  });

  it('GatewayConfig supports optional cors', () => {
    const config: GatewayConfig = {
      host: '127.0.0.1',
      port: 18789,
      cors: ['http://localhost:3000'],
    };
    expect(config.cors).toEqual(['http://localhost:3000']);
  });

  it('OsaIConfig has gateway and model sections', () => {
    const config: OsaIConfig = {
      gateway: {
        host: '127.0.0.1',
        port: 18789,
      },
      model: {
        provider: 'anthropic',
        model: 'claude-opus-4-20250514',
        apiKey: 'sk-test',
      },
    };
    expect(config.gateway.host).toBe('127.0.0.1');
    expect(config.model.provider).toBe('anthropic');
  });

  it('OsaIConfig supports all optional sections', () => {
    const config: OsaIConfig = {
      gateway: { host: '127.0.0.1', port: 18789 },
      model: { provider: 'anthropic', model: 'claude', apiKey: 'sk' },
      session: { maxHistory: 100, timeout: 3600 },
      skills: { enabled: ['filesystem', 'shell'], disabled: ['browser'] },
      security: {
        sandboxEnabled: true,
        fileSandbox: {
          allowedDirs: ['/home/user'],
          blockedPatterns: ['~/.ssh', '/etc'],
        },
      },
    };

    expect(config.session?.maxHistory).toBe(100);
    expect(config.skills?.enabled).toEqual(['filesystem', 'shell']);
    expect(config.security?.sandboxEnabled).toBe(true);
    expect(config.security?.fileSandbox?.blockedPatterns).toContain('~/.ssh');
  });

  it('SessionConfig has optional fields', () => {
    const config: SessionConfig = {};
    expect(config).toBeDefined();

    const fullConfig: SessionConfig = {
      maxHistory: 50,
      timeout: 1800,
    };
    expect(fullConfig.maxHistory).toBe(50);
  });

  it('SecurityConfig fileSandbox has required fields', () => {
    const security: SecurityConfig = {
      fileSandbox: {
        allowedDirs: ['/tmp'],
        blockedPatterns: ['/etc/passwd'],
      },
    };
    expect(security.fileSandbox?.allowedDirs).toEqual(['/tmp']);
  });
});
