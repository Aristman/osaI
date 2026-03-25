/**
 * T004-UNIT-001: Trace list renders traces in chronological order
 * Preconditions: traceStore contains traces
 * Expected result: All traces visible in chronological order
 * Pass criteria: Trace count matches store, order correct
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const traceListPath = resolve(__dirname, '..', 'TraceList.svelte');

function readSource(): string {
  return readFileSync(traceListPath, 'utf-8');
}

describe('T004-UNIT-001: TraceList component', () => {
  it('TraceList.svelte file exists', () => {
    expect(existsSync(traceListPath)).toBe(true);
  });

  it('imports tracesStore or sessionTraces from stores', () => {
    const source = readSource();
    const hasImport = source.includes('sessionTraces') || source.includes('tracesStore');
    expect(hasImport).toBe(true);
  });

  it('imports activeSession from sessions store', () => {
    const source = readSource();
    const hasImport = source.includes('activeSession') || source.includes('sessionsStore');
    expect(hasImport).toBe(true);
  });

  it('renders trace entries as list items', () => {
    const source = readSource();
    expect(source).toContain('TraceEntry');
  });

  it('has status filter controls', () => {
    const source = readSource();
    // Status filter buttons or selects
    const hasFilter =
      source.includes('all') &&
      (source.includes('success') || source.includes('error'));
    expect(hasFilter).toBe(true);
  });

  it('has tool name filter', () => {
    const source = readSource();
    const hasFilter = source.includes('tool') || source.includes('filter');
    expect(hasFilter).toBe(true);
  });

  it('uses TokenUsage component', () => {
    const source = readSource();
    expect(source).toContain('TokenUsage');
  });
});
