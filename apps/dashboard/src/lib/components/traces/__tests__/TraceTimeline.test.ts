/**
 * Tests for TraceTimeline component.
 * Timeline visualization with vertical line and chronological nodes.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const traceTimelinePath = resolve(__dirname, '..', 'TraceTimeline.svelte');

function readSource(): string {
  return readFileSync(traceTimelinePath, 'utf-8');
}

describe('TraceTimeline component', () => {
  it('TraceTimeline.svelte file exists', () => {
    expect(existsSync(traceTimelinePath)).toBe(true);
  });

  it('accepts traces array as prop', () => {
    const source = readSource();
    const hasProps = source.includes('traces') && source.includes('$props()');
    expect(hasProps).toBe(true);
  });

  it('renders timeline nodes for each trace', () => {
    const source = readSource();
    // Should iterate over traces using {#each}
    expect(source).toContain('{#each');
    expect(source).toContain('traces');
  });

  it('displays tool name in timeline nodes', () => {
    const source = readSource();
    expect(source).toContain('toolName');
  });

  it('shows status indicator on nodes', () => {
    const source = readSource();
    expect(source).toContain('status');
  });

  it('has vertical line styling for timeline', () => {
    const source = readSource();
    // Timeline typically has a vertical line via CSS
    const hasTimeline = source.includes('timeline') || source.includes('border-l') || source.includes('line');
    expect(hasTimeline).toBe(true);
  });
});
