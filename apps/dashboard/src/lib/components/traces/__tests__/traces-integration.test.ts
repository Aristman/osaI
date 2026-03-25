/**
 * T004-UNIT-003: Filter by tool name
 * T004-UNIT-004: Summary stats accurate
 *
 * Integration tests for trace filtering and summary computation.
 */
import { describe, it, expect } from 'vitest';
import {
  filterByStatus,
  filterByToolName,
  computeTokenSummary,
  extractToolNames
} from '../trace-utils';
import type { TraceEntry } from '../../../stores/traces';

function makeTrace(overrides: Partial<TraceEntry> = {}): TraceEntry {
  return {
    toolCallId: `tc-${Math.random().toString(36).slice(2)}`,
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

describe('T004-UNIT-003: Filter traces by tool name', () => {
  it('returns all traces when filter is null', () => {
    const traces = [
      makeTrace({ toolName: 'shell' }),
      makeTrace({ toolName: 'filesystem' })
    ];
    const result = filterByToolName(traces, null);
    expect(result).toHaveLength(2);
  });

  it('returns all traces when filter is empty string', () => {
    const traces = [
      makeTrace({ toolName: 'shell' }),
      makeTrace({ toolName: 'filesystem' })
    ];
    const result = filterByToolName(traces, '');
    expect(result).toHaveLength(2);
  });

  it('filters by exact tool name', () => {
    const traces = [
      makeTrace({ toolName: 'shell', toolCallId: 'tc-1' }),
      makeTrace({ toolName: 'filesystem', toolCallId: 'tc-2' }),
      makeTrace({ toolName: 'shell', toolCallId: 'tc-3' })
    ];
    const result = filterByToolName(traces, 'shell');
    expect(result).toHaveLength(2);
    expect(result.every((t) => t.toolName === 'shell')).toBe(true);
  });

  it('returns empty array when no traces match', () => {
    const traces = [makeTrace({ toolName: 'shell' })];
    const result = filterByToolName(traces, 'browser');
    expect(result).toHaveLength(0);
  });
});

describe('T004-UNIT-003: Filter traces by status', () => {
  const traces: TraceEntry[] = [
    makeTrace({ status: 'completed', toolCallId: 'tc-1' }),
    makeTrace({ status: 'error', toolCallId: 'tc-2' }),
    makeTrace({ status: 'started', toolCallId: 'tc-3' }),
    makeTrace({ status: 'completed', toolCallId: 'tc-4' }),
    makeTrace({ status: 'error', toolCallId: 'tc-5' })
  ];

  it('"all" filter returns all traces', () => {
    const result = filterByStatus(traces, 'all');
    expect(result).toHaveLength(5);
  });

  it('"success" filter returns only completed traces', () => {
    const result = filterByStatus(traces, 'success');
    expect(result).toHaveLength(2);
    expect(result.every((t) => t.status === 'completed')).toBe(true);
  });

  it('"error" filter returns only error traces', () => {
    const result = filterByStatus(traces, 'error');
    expect(result).toHaveLength(2);
    expect(result.every((t) => t.status === 'error')).toBe(true);
  });
});

describe('T004-UNIT-004: Summary statistics accuracy', () => {
  it('computes correct totals for known data', () => {
    const traces: TraceEntry[] = [
      makeTrace({
        toolCallId: 'tc-1',
        duration: 100,
        tokenUsage: { inputTokens: 100, outputTokens: 50 },
        status: 'completed'
      }),
      makeTrace({
        toolCallId: 'tc-2',
        toolName: 'fs',
        duration: 200,
        tokenUsage: { inputTokens: 200, outputTokens: 100 },
        status: 'completed'
      }),
      makeTrace({
        toolCallId: 'tc-3',
        toolName: 'browser',
        duration: 300,
        tokenUsage: null,
        status: 'error'
      })
    ];

    const summary = computeTokenSummary(traces);

    // Token totals: 100+200=300 input, 50+100=150 output
    expect(summary.inputTokens).toBe(300);
    expect(summary.outputTokens).toBe(150);
    expect(summary.totalTokens).toBe(450);

    // Cost: (300 * 3 / 1M) + (150 * 15 / 1M) = 0.0009 + 0.00225 = 0.00315
    expect(summary.estimatedCost).toBe(0.00315);

    // Duration: 100 + 200 + 300 = 600
    expect(summary.totalDuration).toBe(600);

    // Counts
    expect(summary.traceCount).toBe(3);
    expect(summary.errorCount).toBe(1);
  });

  it('extracts unique tool names sorted alphabetically', () => {
    const traces: TraceEntry[] = [
      makeTrace({ toolCallId: 'tc-1', toolName: 'shell' }),
      makeTrace({ toolCallId: 'tc-2', toolName: 'filesystem' }),
      makeTrace({ toolCallId: 'tc-3', toolName: 'shell' }),
      makeTrace({ toolCallId: 'tc-4', toolName: 'browser' })
    ];
    const names = extractToolNames(traces);
    expect(names).toEqual(['browser', 'filesystem', 'shell']);
  });

  it('handles empty traces list', () => {
    const names = extractToolNames([]);
    expect(names).toEqual([]);
  });
});

describe('Combined filter operations', () => {
  it('applies tool name filter then status filter', () => {
    const traces: TraceEntry[] = [
      makeTrace({ toolCallId: 'tc-1', toolName: 'shell', status: 'completed' }),
      makeTrace({ toolCallId: 'tc-2', toolName: 'shell', status: 'error' }),
      makeTrace({ toolCallId: 'tc-3', toolName: 'fs', status: 'completed' })
    ];

    const byTool = filterByToolName(traces, 'shell');
    const byStatus = filterByStatus(byTool, 'success');

    expect(byStatus).toHaveLength(1);
    expect(byStatus[0]!.toolCallId).toBe('tc-1');
  });
});
