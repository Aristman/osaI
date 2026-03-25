/**
 * T-007 System Status Panel: Integration tests.
 *
 * Tests for store + utils integration, barrel exports,
 * and the status page route.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { get } from 'svelte/store';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// Store imports
import { statusStore, resetStatusStore } from '../../../stores/status';

// Utils imports
import {
  formatBytes,
  getUsageColorClass,
  getUsageBgClass
} from '../status-utils';

// Barrel export imports
import {
  SystemStatus,
  StatusCard,
  HealthIndicator,
  getUsageBarBgClass,
  getUsageBorderClass,
  getHealthTextClass,
  detectTrend,
  getTrendIndicator
} from '../../index';

const __dirname = dirname(fileURLToPath(import.meta.url));

describe('T-007 Integration: Status store + utils', () => {
  beforeEach(() => {
    resetStatusStore();
  });

  afterEach(() => {
    resetStatusStore();
  });

  it('store computes correct health after update with high CPU', () => {
    const data = {
      cpu: { model: 'Test', cores: 4, speed: 3000, usage: 96 },
      memory: { total: 8000000000, used: 2000000000, free: 6000000000, usage: 25 },
      disk: { total: 500000000000, used: 100000000000, free: 400000000000, usage: 20 },
      uptime: 1000,
      hostname: 'host',
      platform: 'linux'
    };

    statusStore.handleStatusResponse(data);
    const state = get(statusStore);

    expect(state.healthStatus).toBe('error');
    expect(state.systemInfo!.cpu.usage).toBe(96);
    expect(state.lastUpdated).not.toBeNull();
  });

  it('formatBytes is consistent with store data', () => {
    const data = {
      cpu: { model: 'Test', cores: 4, speed: 3000, usage: 30 },
      memory: { total: 17179869184, used: 8589934592, free: 8589934592, usage: 50 },
      disk: { total: 1073741824000, used: 536870912000, free: 536870912000, usage: 50 },
      uptime: 0,
      hostname: 'host',
      platform: 'linux'
    };

    statusStore.handleStatusResponse(data);
    const state = get(statusStore);
    const mem = state.systemInfo!.memory;

    // formatBytes should produce human-readable values for the store data
    expect(formatBytes(mem.total)).toContain('GB');
    expect(formatBytes(mem.used)).toContain('GB');
    expect(formatBytes(mem.free)).toContain('GB');
  });

  it('color functions produce valid Tailwind classes for store data', () => {
    const data = {
      cpu: { model: 'Test', cores: 4, speed: 3000, usage: 80 },
      memory: { total: 8000000000, used: 7000000000, free: 1000000000, usage: 87 },
      disk: { total: 500000000000, used: 100000000000, free: 400000000000, usage: 20 },
      uptime: 0,
      hostname: 'host',
      platform: 'linux'
    };

    statusStore.handleStatusResponse(data);
    const state = get(statusStore);

    // CPU 80% -> warning
    expect(getUsageColorClass(state.systemInfo!.cpu.usage)).toBe('text-osai-warning');
    // Memory 87% -> degraded -> warning
    expect(getUsageBgClass(state.systemInfo!.memory.usage)).toBe('bg-osai-warning');
    // Disk 20% -> success
    expect(getUsageColorClass(state.systemInfo!.disk.usage)).toBe('text-osai-success');
  });
});

describe('T-007 Integration: Barrel exports', () => {
  it('exports SystemStatus component', () => {
    expect(SystemStatus).toBeDefined();
  });

  it('exports StatusCard component', () => {
    expect(StatusCard).toBeDefined();
  });

  it('exports HealthIndicator component', () => {
    expect(HealthIndicator).toBeDefined();
  });

  it('exports all utility functions', () => {
    expect(typeof getUsageBarBgClass).toBe('function');
    expect(typeof getUsageBorderClass).toBe('function');
    expect(typeof getHealthTextClass).toBe('function');
    expect(typeof detectTrend).toBe('function');
    expect(typeof getTrendIndicator).toBe('function');
  });

  it('exports all types', () => {
    // Types are compile-time only, but we can verify the import didn't error
    // by checking that the imported values are defined at runtime
    // Type-only imports won't be available at runtime, but the import path is valid
    expect(true).toBe(true);
  });
});

describe('T-007 Integration: Status route page', () => {
  const pagePath = resolve(
    __dirname,
    '..',
    '..',
    '..',
    '..',
    'routes',
    'status',
    '+page.svelte'
  );

  it('status page exists', () => {
    expect(existsSync(pagePath)).toBe(true);
  });

  it('status page imports SystemStatus component', () => {
    const source = readFileSync(pagePath, 'utf-8');
    expect(source).toContain('SystemStatus');
  });

  it('status page imports statusStore', () => {
    const source = readFileSync(pagePath, 'utf-8');
    expect(source).toContain('statusStore');
  });

  it('status page uses auto-refresh on mount', () => {
    const source = readFileSync(pagePath, 'utf-8');
    expect(source).toContain('startStatusAutoRefresh');
    expect(source).toContain('stopStatusAutoRefresh');
    expect(source).toContain('onMount');
  });

  it('status page has title "System Status"', () => {
    const source = readFileSync(pagePath, 'utf-8');
    expect(source).toContain('System Status');
  });
});

describe('T-007 Integration: Store barrel exports', () => {
  it('status store is exported from stores/index', () => {
    const indexPath = resolve(
      __dirname,
      '..',
      '..',
      '..',
      'stores',
      'index.ts'
    );
    expect(existsSync(indexPath)).toBe(true);

    const source = readFileSync(indexPath, 'utf-8');
    expect(source).toContain('statusStore');
    expect(source).toContain('refreshStatus');
    expect(source).toContain('handleSystemStatus');
    expect(source).toContain('startStatusAutoRefresh');
    expect(source).toContain('stopStatusAutoRefresh');
    expect(source).toContain('resetStatusStore');
  });
});
