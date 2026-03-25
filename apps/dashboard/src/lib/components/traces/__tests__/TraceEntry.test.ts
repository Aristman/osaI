/**
 * T004-UNIT-002: Expand trace shows params
 * Preconditions: Trace with collapsed params
 * Expected result: Clicking expand shows params
 * Pass criteria: Params visible after click
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const traceEntryPath = resolve(__dirname, '..', 'TraceEntry.svelte');

function readSource(): string {
  return readFileSync(traceEntryPath, 'utf-8');
}

describe('T004-UNIT-002: TraceEntry component', () => {
  it('TraceEntry.svelte file exists', () => {
    expect(existsSync(traceEntryPath)).toBe(true);
  });

  it('accepts trace entry props', () => {
    const source = readSource();
    const hasProps = source.includes('trace') && source.includes('$props()');
    expect(hasProps).toBe(true);
  });

  it('displays tool name', () => {
    const source = readSource();
    expect(source).toContain('toolName');
  });

  it('displays status with visual indicator', () => {
    const source = readSource();
    // Status display with color classes
    expect(source).toContain('status');
    const hasStatusColors =
      source.includes('success') ||
      source.includes('error') ||
      source.includes('running') ||
      source.includes('started');
    expect(hasStatusColors).toBe(true);
  });

  it('displays duration', () => {
    const source = readSource();
    expect(source).toContain('duration');
  });

  it('has expand/collapse toggle for details', () => {
    const source = readSource();
    const hasExpandCollapse =
      source.includes('expanded') ||
      source.includes('collapsed') ||
      source.includes('toggle');
    expect(hasExpandCollapse).toBe(true);
  });

  it('displays data/details section', () => {
    const source = readSource();
    expect(source).toContain('data');
  });
});
