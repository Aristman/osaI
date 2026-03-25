/**
 * Tests for TokenUsage component.
 * Displays token usage summary: input/output/total tokens and estimated cost.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const tokenUsagePath = resolve(__dirname, '..', 'TokenUsage.svelte');

function readSource(): string {
  return readFileSync(tokenUsagePath, 'utf-8');
}

describe('TokenUsage component', () => {
  it('TokenUsage.svelte file exists', () => {
    expect(existsSync(tokenUsagePath)).toBe(true);
  });

  it('accepts summary prop', () => {
    const source = readSource();
    const hasProps = source.includes('summary') && source.includes('$props()');
    expect(hasProps).toBe(true);
  });

  it('displays input tokens', () => {
    const source = readSource();
    expect(source).toContain('inputTokens');
  });

  it('displays output tokens', () => {
    const source = readSource();
    expect(source).toContain('outputTokens');
  });

  it('displays total tokens', () => {
    const source = readSource();
    expect(source).toContain('totalTokens');
  });

  it('displays estimated cost', () => {
    const source = readSource();
    expect(source).toContain('estimatedCost');
  });

  it('displays trace count', () => {
    const source = readSource();
    expect(source).toContain('traceCount');
  });

  it('displays total duration', () => {
    const source = readSource();
    expect(source).toContain('totalDuration');
  });
});
