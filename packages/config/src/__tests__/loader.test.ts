/**
 * Tests for T-002: Config Loader Implementation
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  loadConfigSync,
  loadConfig,
  validateAndNormalize,
  getOsaiDirectory,
  getConfigPath,
  getCachedConfig,
  invalidateCache,
  resetLoaderState,
} from '../loader.js';
import {
  ConfigNotFoundError,
  ConfigParseError,
  ConfigValidationError,
  ConfigPermissionWarning,
} from '../errors.js';

describe('T-002: Config Loader Implementation', () => {
  let tempDir: string;
  let configPath: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'osai-config-test-'));
    configPath = path.join(tempDir, 'openclaw.json');
    resetLoaderState();
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
    resetLoaderState();
  });

  // T002-UT-01: Load valid config file
  it('T002-UT-01: should load valid config file', () => {
    const config = {
      gateway: { host: '127.0.0.1', port: 18789 },
      model: { provider: 'anthropic', model: 'claude-3-opus' },
    };
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

    const result = loadConfigSync({ configPath });
    expect(result.gateway.host).toBe('127.0.0.1');
    expect(result.gateway.port).toBe(18789);
    expect(result.model.provider).toBe('anthropic');
    expect(result.model.model).toBe('claude-3-opus');
    // Defaults should be applied
    expect(result.gateway.heartbeat).toBe(30000);
  });

  // T002-UT-02: Load config with defaults merge
  it('T002-UT-02: should merge defaults with partial config', () => {
    const config = {
      gateway: { host: '0.0.0.0', port: 8080 },
      model: { provider: 'openai', model: 'gpt-4' },
    };
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

    const result = loadConfigSync({ configPath });
    expect(result.gateway.host).toBe('0.0.0.0');
    expect(result.gateway.port).toBe(8080);
    expect(result.model.provider).toBe('openai');
    // Defaults filled
    expect(result.model.apiKey).toBe('');
    expect(result.model.maxTokens).toBe(8192);
    expect(result.session?.maxHistory).toBe(100);
    expect(result.memory?.enabled).toBe(false);
  });

  // T002-UT-03: ConfigNotFoundError for missing file
  it('T002-UT-03: should throw ConfigNotFoundError for missing file', () => {
    expect(() => loadConfigSync({ configPath: '/nonexistent/openclaw.json' }))
      .toThrow();
    try {
      loadConfigSync({ configPath: '/nonexistent/openclaw.json' });
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigNotFoundError);
      expect((error as ConfigNotFoundError).code).toBe('CONFIG_NOT_FOUND');
    }
  });

  // T002-UT-04: ConfigParseError for invalid JSON
  it('T002-UT-04: should throw ConfigParseError for invalid JSON', () => {
    fs.writeFileSync(configPath, '{ invalid json }');

    expect(() => loadConfigSync({ configPath })).toThrow();
    try {
      loadConfigSync({ configPath });
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigParseError);
      expect((error as ConfigParseError).code).toBe('CONFIG_PARSE_ERROR');
    }
  });

  // T002-UT-05: ConfigValidationError for schema violation
  it('T002-UT-05: should throw ConfigValidationError for invalid config structure', () => {
    fs.writeFileSync(configPath, JSON.stringify({
      gateway: { host: '127.0.0.1' }, // missing port
    }));

    expect(() => loadConfigSync({ configPath })).toThrow();
    try {
      loadConfigSync({ configPath });
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigValidationError);
      expect((error as ConfigValidationError).code).toBe('CONFIG_VALIDATION_ERROR');
      expect((error as ConfigValidationError).validationErrors.length).toBeGreaterThan(0);
    }
  });

  // T002-UT-06: File permissions warning
  it('T002-UT-06: should warn about insecure file permissions', () => {
    const config = {
      gateway: { host: '127.0.0.1', port: 18789 },
      model: { provider: 'anthropic', model: 'claude-3' },
    };
    fs.writeFileSync(configPath, JSON.stringify(config));
    // Set wide-open permissions
    try {
      fs.chmodSync(configPath, 0o644);
    } catch {
      // Skip on systems where chmod doesn't work
      return;
    }

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    loadConfigSync({ configPath });
    expect(warnSpy).toHaveBeenCalled();
    const warningMsg = warnSpy.mock.calls[0]?.[0] as string;
    expect(warningMsg).toContain('permissions');
    warnSpy.mockRestore();
  });

  // T002-UT-07: Sync loader works
  it('T002-UT-07: loadConfigSync should return config synchronously', () => {
    const config = {
      gateway: { host: '127.0.0.1', port: 18789 },
      model: { provider: 'anthropic', model: 'claude-3' },
    };
    fs.writeFileSync(configPath, JSON.stringify(config));

    const result = loadConfigSync({ configPath });
    expect(result).toBeDefined();
    expect(result.gateway.port).toBe(18789);
  });

  // T002-UT-08: LoadConfig caches result
  it('T002-UT-08: should cache config on subsequent calls', () => {
    const config = {
      gateway: { host: '127.0.0.1', port: 18789 },
      model: { provider: 'anthropic', model: 'claude-3' },
    };
    fs.writeFileSync(configPath, JSON.stringify(config));

    const first = loadConfigSync({ configPath });
    const second = loadConfigSync({ configPath });
    expect(first).toBe(second); // Same reference
  });

  // T002-UT-09: Cache invalidation
  it('T002-UT-09: should reload config when forceReload is true', () => {
    const config1 = {
      gateway: { host: '127.0.0.1', port: 18789 },
      model: { provider: 'anthropic', model: 'claude-3' },
    };
    fs.writeFileSync(configPath, JSON.stringify(config1));

    loadConfigSync({ configPath }); // Cache the first load

    // Update file
    const config2 = {
      gateway: { host: '0.0.0.0', port: 9999 },
      model: { provider: 'openai', model: 'gpt-4' },
    };
    fs.writeFileSync(configPath, JSON.stringify(config2));

    // Without forceReload -- returns cached
    const cached = loadConfigSync({ configPath });
    expect(cached.gateway.port).toBe(18789);

    // With forceReload -- returns fresh
    const fresh = loadConfigSync({ configPath, forceReload: true });
    expect(fresh.gateway.port).toBe(9999);
    expect(fresh.model.provider).toBe('openai');
  });

  // T002-IT-01: Load config from real filesystem
  it('T002-IT-01: should load config from real filesystem', () => {
    const config = {
      gateway: { host: '192.168.1.1', port: 9000, cors: ['http://localhost:3000'], heartbeat: 5000 },
      model: { provider: 'ollama', model: 'llama3:70b', apiKey: '', maxTokens: 4096 },
      session: { maxHistory: 200, timeout: 1200000, pruning: 90, activationMode: 'always' },
    };
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

    const result = loadConfigSync({ configPath });
    expect(result.gateway.host).toBe('192.168.1.1');
    expect(result.gateway.port).toBe(9000);
    expect(result.model.provider).toBe('ollama');
    expect(result.model.model).toBe('llama3:70b');
    expect(result.session?.maxHistory).toBe(200);
    expect(result.session?.activationMode).toBe('always');
  });

  // T002-IT-02: Handle symlinked config
  it('T002-IT-02: should handle symlinked config', () => {
    const realPath = path.join(tempDir, 'real-config.json');
    const linkPath = path.join(tempDir, 'linked-config.json');

    const config = {
      gateway: { host: '127.0.0.1', port: 18789 },
      model: { provider: 'anthropic', model: 'claude-3' },
    };
    fs.writeFileSync(realPath, JSON.stringify(config));

    try {
      fs.symlinkSync(realPath, linkPath);
    } catch {
      // Skip on systems where symlinks aren't supported
      return;
    }

    const result = loadConfigSync({ configPath: linkPath });
    expect(result.gateway.host).toBe('127.0.0.1');
  });

  // Async loader
  describe('loadConfig (async)', () => {
    it('should load config asynchronously', async () => {
      const config = {
        gateway: { host: '127.0.0.1', port: 18789 },
        model: { provider: 'anthropic', model: 'claude-3' },
      };
      fs.writeFileSync(configPath, JSON.stringify(config));

      const result = await loadConfig({ configPath });
      expect(result.gateway.port).toBe(18789);
    });
  });

  // getCachedConfig / invalidateCache
  describe('cache management', () => {
    it('should return null when no config loaded', () => {
      expect(getCachedConfig()).toBeNull();
    });

    it('should return cached config', () => {
      const config = {
        gateway: { host: '127.0.0.1', port: 18789 },
        model: { provider: 'anthropic', model: 'claude-3' },
      };
      fs.writeFileSync(configPath, JSON.stringify(config));
      loadConfigSync({ configPath });
      expect(getCachedConfig()).not.toBeNull();
    });

    it('invalidateCache should clear cached config', () => {
      const config = {
        gateway: { host: '127.0.0.1', port: 18789 },
        model: { provider: 'anthropic', model: 'claude-3' },
      };
      fs.writeFileSync(configPath, JSON.stringify(config));
      loadConfigSync({ configPath });
      expect(getCachedConfig()).not.toBeNull();
      invalidateCache();
      expect(getCachedConfig()).toBeNull();
    });
  });

  // Path helpers
  describe('path helpers', () => {
    it('getOsaiDirectory should return path ending with .osai', () => {
      const dir = getOsaiDirectory();
      expect(dir).toMatch(/\.osai$/);
      expect(dir).toContain(os.homedir());
    });

    it('getConfigPath should return path to openclaw.json', () => {
      const p = getConfigPath();
      expect(p).toMatch(/openclaw\.json$/);
      expect(p).toContain(getOsaiDirectory());
    });
  });

  // validateAndNormalize
  describe('validateAndNormalize', () => {
    it('should validate and normalize config', () => {
      const result = validateAndNormalize({
        gateway: { host: '127.0.0.1', port: 18789 },
        model: { provider: 'anthropic', model: 'claude-3' },
      });
      expect(result.gateway.heartbeat).toBe(30000);
      expect(result.model.temperature).toBe(0.7);
    });

    it('should throw on invalid config', () => {
      expect(() => validateAndNormalize({})).toThrow(ConfigValidationError);
    });
  });

  // Error classes
  describe('Error classes', () => {
    it('ConfigNotFoundError should have correct properties', () => {
      const error = new ConfigNotFoundError('/tmp/test.json');
      expect(error.code).toBe('CONFIG_NOT_FOUND');
      expect(error.message).toContain('/tmp/test.json');
      expect(error.details?.path).toBe('/tmp/test.json');
    });

    it('ConfigParseError should have correct properties', () => {
      const error = new ConfigParseError('/tmp/test.json', new Error('Unexpected token'));
      expect(error.code).toBe('CONFIG_PARSE_ERROR');
      expect(error.message).toContain('Unexpected token');
    });

    it('ConfigValidationError should have correct properties', () => {
      const errors = [
        { path: 'gateway.port', message: 'Required field is missing' },
      ];
      const error = new ConfigValidationError(errors);
      expect(error.code).toBe('CONFIG_VALIDATION_ERROR');
      expect(error.validationErrors).toHaveLength(1);
    });

    it('ConfigPermissionWarning should have correct properties', () => {
      const error = new ConfigPermissionWarning('/tmp/test.json', 0o644);
      expect(error.code).toBe('CONFIG_PERMISSION_WARNING');
      expect(error.message).toContain('0o644');
    });
  });
});
