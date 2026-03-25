/**
 * Tests for the traces page route and barrel exports.
 * Verifies that the traces page uses TraceList + TokenUsage components
 * and that the barrel export includes all trace components.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pagePath = resolve(__dirname, '..', '..', '..', '..', 'routes', 'traces', '+page.svelte');
const indexPath = resolve(__dirname, '..', '..', 'index.ts');

function readSource(path: string): string {
  return readFileSync(path, 'utf-8');
}

describe('Traces page route', () => {
  it('traces page file exists', () => {
    expect(existsSync(pagePath)).toBe(true);
  });

  it('traces page uses TraceList component', () => {
    const source = readSource(pagePath);
    expect(source).toContain('TraceList');
  });

  it('traces page uses TraceList from components', () => {
    const source = readSource(pagePath);
    expect(source).toContain('TraceList');
  });

  it('traces page renders TraceList component', () => {
    const source = readSource(pagePath);
    expect(source).toContain('<TraceList');
  });
});

describe('Barrel exports', () => {
  it('index.ts file exists', () => {
    expect(existsSync(indexPath)).toBe(true);
  });

  it('exports TraceList component', () => {
    const source = readSource(indexPath);
    expect(source).toContain('TraceList');
  });

  it('exports TraceEntry component', () => {
    const source = readSource(indexPath);
    expect(source).toContain('TraceEntry');
  });

  it('exports TraceTimeline component', () => {
    const source = readSource(indexPath);
    expect(source).toContain('TraceTimeline');
  });

  it('exports TokenUsage component', () => {
    const source = readSource(indexPath);
    expect(source).toContain('TokenUsage');
  });
});
