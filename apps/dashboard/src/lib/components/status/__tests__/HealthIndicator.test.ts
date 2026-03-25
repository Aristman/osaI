/**
 * T-007 System Status Panel: HealthIndicator component tests.
 *
 * Tests for the HealthIndicator component (source-based verification).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const componentPath = resolve(__dirname, '..', 'HealthIndicator.svelte');

function readSource(): string {
  return readFileSync(componentPath, 'utf-8');
}

describe('HealthIndicator component', () => {
  it('HealthIndicator.svelte file exists', () => {
    expect(existsSync(componentPath)).toBe(true);
  });

  it('accepts health and lastUpdated as props', () => {
    const source = readSource();
    expect(source).toContain('health');
    expect(source).toContain('lastUpdated');
    expect(source).toContain('$props()');
  });

  it('uses getHealthColorClass for dot styling', () => {
    const source = readSource();
    expect(source).toContain('getHealthColorClass');
  });

  it('uses getHealthLabel for text display', () => {
    const source = readSource();
    expect(source).toContain('getHealthLabel');
  });

  it('uses getHealthTextClass for text color', () => {
    const source = readSource();
    expect(source).toContain('getHealthTextClass');
  });

  it('displays last updated timestamp', () => {
    const source = readSource();
    expect(source).toContain('Updated:');
    expect(source).toContain('toLocaleTimeString');
  });

  it('has pulsing dot animation', () => {
    const source = readSource();
    expect(source).toContain('animate-ping');
  });
});
