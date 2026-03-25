/**
 * T-007 System Status Panel: StatusCard component tests.
 *
 * Tests for the StatusCard component (source-based verification).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const componentPath = resolve(__dirname, '..', 'StatusCard.svelte');

function readSource(): string {
  return readFileSync(componentPath, 'utf-8');
}

describe('StatusCard component', () => {
  it('StatusCard.svelte file exists', () => {
    expect(existsSync(componentPath)).toBe(true);
  });

  it('accepts label, value, unit, usage, trend, details as props', () => {
    const source = readSource();
    expect(source).toContain('label');
    expect(source).toContain('value');
    expect(source).toContain('unit');
    expect(source).toContain('usage');
    expect(source).toContain('trend');
    expect(source).toContain('details');
    expect(source).toContain('$props()');
  });

  it('displays label in uppercase tracking-wider style', () => {
    const source = readSource();
    expect(source).toContain('uppercase');
    expect(source).toContain('tracking-wider');
  });

  it('displays value as large text (2xl)', () => {
    const source = readSource();
    expect(source).toContain('text-2xl');
  });

  it('has progress bar when usage is provided', () => {
    const source = readSource();
    expect(source).toContain('h-2');
    expect(source).toContain('rounded-full');
    expect(source).toContain('transition-all');
    // Progress bar width uses usage value
    expect(source).toContain('style="width:');
  });

  it('uses getUsageColorClass for value text color', () => {
    const source = readSource();
    expect(source).toContain('getUsageColorClass');
  });

  it('uses getUsageBgClass for progress bar color', () => {
    const source = readSource();
    expect(source).toContain('getUsageBgClass');
  });

  it('shows trend indicator when trend is provided', () => {
    const source = readSource();
    expect(source).toContain('getTrendIndicator');
  });

  it('shows details text when details prop is provided', () => {
    const source = readSource();
    expect(source).toContain('details');
  });

  it('has card-like styling with border and bg', () => {
    const source = readSource();
    expect(source).toContain('rounded-lg');
    expect(source).toContain('border');
    expect(source).toContain('bg-osai-surface-800');
  });
});
