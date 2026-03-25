/**
 * T-007 System Status Panel: SystemStatus component tests.
 *
 * Tests for the SystemStatus component (source-based verification).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const componentPath = resolve(__dirname, '..', 'SystemStatus.svelte');

function readSource(): string {
  return readFileSync(componentPath, 'utf-8');
}

describe('SystemStatus component', () => {
  it('SystemStatus.svelte file exists', () => {
    expect(existsSync(componentPath)).toBe(true);
  });

  it('accepts systemInfo, healthStatus, lastUpdated, onRefresh as props', () => {
    const source = readSource();
    expect(source).toContain('systemInfo');
    expect(source).toContain('healthStatus');
    expect(source).toContain('lastUpdated');
    expect(source).toContain('onRefresh');
    expect(source).toContain('$props()');
  });

  it('imports and uses HealthIndicator component', () => {
    const source = readSource();
    expect(source).toContain('HealthIndicator');
    expect(source).toContain('import');
  });

  it('imports and uses StatusCard component', () => {
    const source = readSource();
    expect(source).toContain('StatusCard');
  });

  it('imports utility functions', () => {
    const source = readSource();
    expect(source).toContain('formatBytes');
    expect(source).toContain('formatUptime');
    expect(source).toContain('formatCpuSpeed');
    expect(source).toContain('formatPercent');
  });

  it('shows CPU, Memory, Disk cards', () => {
    const source = readSource();
    expect(source).toContain('CPU Usage');
    expect(source).toContain('Memory Usage');
    expect(source).toContain('Disk Usage');
  });

  it('has refresh button', () => {
    const source = readSource();
    expect(source).toContain('Refresh');
  });

  it('shows system identity section (hostname, platform, uptime)', () => {
    const source = readSource();
    expect(source).toContain('System Information');
    expect(source).toContain('Hostname');
    expect(source).toContain('Platform');
    expect(source).toContain('Uptime');
  });

  it('has CPU details section', () => {
    const source = readSource();
    expect(source).toContain('CPU Details');
    expect(source).toContain('cpu.model');
  });

  it('has empty/loading state when no data', () => {
    const source = readSource();
    expect(source).toContain('Connect to Gateway');
  });

  it('conditionally renders based on hasData', () => {
    const source = readSource();
    expect(source).toContain('{#if hasData');
    expect(source).toContain('{:else}');
  });

  it('passes onRefresh callback to button', () => {
    const source = readSource();
    expect(source).toContain('onclick={onRefresh}');
  });
});
