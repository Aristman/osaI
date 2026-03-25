/**
 * T-004 Trace View: Utility function tests.
 *
 * Tests for formatting helpers and filtering logic used by trace components.
 */
import { describe, it, expect } from 'vitest';
import {
  formatDuration,
  formatTokens,
  formatCost,
  computeTokenSummary
} from '../trace-utils';
import type { TraceEntry } from '../../../stores/traces';

function makeTrace(overrides: Partial<TraceEntry> = {}): TraceEntry {
  return {
    toolCallId: 'tc-1',
    sessionId: 's1',
    toolName: 'shell',
    status: 'completed',
    startedAt: '2026-01-01T00:00:00Z',
    completedAt: '2026-01-01T00:00:02Z',
    duration: 2000,
    data: null,
    tokenUsage: null,
    ...overrides
  };
}

describe('formatDuration', () => {
  it('formats zero duration', () => {
    expect(formatDuration(0)).toBe('0ms');
  });

  it('formats sub-second duration', () => {
    expect(formatDuration(500)).toBe('500ms');
  });

  it('formats duration under 1 second', () => {
    expect(formatDuration(999)).toBe('999ms');
  });

  it('formats exactly 1 second', () => {
    expect(formatDuration(1000)).toBe('1.00s');
  });

  it('formats multi-second duration with decimals', () => {
    expect(formatDuration(2500)).toBe('2.50s');
  });

  it('formats duration with 0 decimal seconds', () => {
    expect(formatDuration(3000)).toBe('3.00s');
  });

  it('returns dash for null duration', () => {
    expect(formatDuration(null)).toBe('--');
  });
});

describe('formatTokens', () => {
  it('formats token count with locale', () => {
    const result = formatTokens(1234);
    expect(result).toContain('1,234');
  });

  it('formats zero tokens', () => {
    expect(formatTokens(0)).toContain('0');
  });
});

describe('formatCost', () => {
  it('formats zero cost', () => {
    expect(formatCost(0)).toBe('$0.00');
  });

  it('formats small cost', () => {
    expect(formatCost(0.00123)).toBe('$0.0012');
  });

  it('formats typical cost', () => {
    expect(formatCost(0.05)).toBe('$0.05');
  });

  it('formats larger cost', () => {
    expect(formatCost(1.5)).toBe('$1.50');
  });

  it('formats very small cost', () => {
    expect(formatCost(0.0001)).toBe('$0.0001');
  });
});

describe('computeTokenSummary', () => {
  it('returns zeros for empty traces', () => {
    const summary = computeTokenSummary([]);
    expect(summary.inputTokens).toBe(0);
    expect(summary.outputTokens).toBe(0);
    expect(summary.totalTokens).toBe(0);
    expect(summary.estimatedCost).toBe(0);
  });

  it('sums token usage from traces', () => {
    const traces = [
      makeTrace({ tokenUsage: { inputTokens: 100, outputTokens: 50 } }),
      makeTrace({
        toolCallId: 'tc-2',
        tokenUsage: { inputTokens: 200, outputTokens: 75 }
      })
    ];
    const summary = computeTokenSummary(traces);
    expect(summary.inputTokens).toBe(300);
    expect(summary.outputTokens).toBe(125);
    expect(summary.totalTokens).toBe(425);
  });

  it('ignores traces without token usage', () => {
    const traces = [
      makeTrace({ tokenUsage: null }),
      makeTrace({
        toolCallId: 'tc-2',
        tokenUsage: { inputTokens: 50, outputTokens: 25 }
      })
    ];
    const summary = computeTokenSummary(traces);
    expect(summary.inputTokens).toBe(50);
    expect(summary.outputTokens).toBe(25);
    expect(summary.totalTokens).toBe(75);
  });

  it('estimates cost using Claude pricing', () => {
    // Claude Sonnet pricing: $3/M input, $15/M output
    const traces = [
      makeTrace({ tokenUsage: { inputTokens: 1_000_000, outputTokens: 1_000_000 } })
    ];
    const summary = computeTokenSummary(traces);
    // Expected: (1M * 3/1M) + (1M * 15/1M) = 3 + 15 = $18
    expect(summary.estimatedCost).toBe(18);
  });

  it('computes total duration from traces', () => {
    const traces = [
      makeTrace({ duration: 100 }),
      makeTrace({ toolCallId: 'tc-2', duration: 200 })
    ];
    const summary = computeTokenSummary(traces);
    expect(summary.totalDuration).toBe(300);
  });

  it('counts trace entries', () => {
    const traces = [makeTrace(), makeTrace({ toolCallId: 'tc-2' })];
    const summary = computeTokenSummary(traces);
    expect(summary.traceCount).toBe(2);
  });

  it('counts errors correctly', () => {
    const traces = [
      makeTrace({ status: 'completed' }),
      makeTrace({ toolCallId: 'tc-2', status: 'error' }),
      makeTrace({ toolCallId: 'tc-3', status: 'error' })
    ];
    const summary = computeTokenSummary(traces);
    expect(summary.errorCount).toBe(2);
  });
});
