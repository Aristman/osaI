/**
 * Tests for traces store.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import type { ToolStreamMessage } from '../types';

const mockTraceStart: ToolStreamMessage = {
  type: 'tool_stream',
  sessionId: 's1',
  toolCallId: 'tc1',
  toolName: 'shell',
  status: 'started',
  data: { command: 'ls' },
  timestamp: '2026-01-01T00:00:00Z'
};

const mockTraceComplete: ToolStreamMessage = {
  type: 'tool_stream',
  sessionId: 's1',
  toolCallId: 'tc1',
  toolName: 'shell',
  status: 'completed',
  data: { output: 'file1.txt\nfile2.txt' },
  duration: 150,
  timestamp: '2026-01-01T00:00:01Z'
};

describe('tracesStore', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('initial state has empty traces map', async () => {
    const { tracesStore } = await import('../stores/traces');
    const state = get(tracesStore);
    expect(state.traces).toEqual({});
    expect(state.tracesBySession).toEqual({});
  });

  it('adds tool stream trace on started', async () => {
    const { tracesStore, addTrace } = await import('../stores/traces');
    addTrace(mockTraceStart);
    const state = get(tracesStore);
    expect(state.traces['tc1']).toBeDefined();
    expect(state.traces['tc1']!.toolName).toBe('shell');
    expect(state.traces['tc1']!.status).toBe('started');
  });

  it('updates trace on completion', async () => {
    const { tracesStore, addTrace } = await import('../stores/traces');
    addTrace(mockTraceStart);
    addTrace(mockTraceComplete);
    const state = get(tracesStore);
    expect(state.traces['tc1']!.status).toBe('completed');
    expect(state.traces['tc1']!.duration).toBe(150);
  });

  it('adds trace to session list', async () => {
    const { tracesStore, addTrace } = await import('../stores/traces');
    addTrace(mockTraceStart);
    expect(get(tracesStore).tracesBySession['s1']).toHaveLength(1);
  });

  it('returns session traces from derived store', async () => {
    const { sessionTraces, addTrace } = await import('../stores/traces');
    addTrace(mockTraceStart);
    const traces = get(sessionTraces('s1'));
    expect(traces).toHaveLength(1);
    expect(traces[0]!.toolCallId).toBe('tc1');
  });

  it('returns empty array for non-existent session', async () => {
    const { sessionTraces } = await import('../stores/traces');
    expect(get(sessionTraces('nonexistent'))).toEqual([]);
  });

  it('stores token usage when available', async () => {
    const { tracesStore, addTrace, updateTraceTokens } = await import('../stores/traces');
    addTrace(mockTraceStart);
    updateTraceTokens('tc1', { inputTokens: 100, outputTokens: 50 });
    const trace = get(tracesStore).traces['tc1'];
    expect(trace!.tokenUsage).toEqual({ inputTokens: 100, outputTokens: 50 });
  });

  it('can reset store', async () => {
    const { tracesStore, addTrace, resetTracesStore } = await import('../stores/traces');
    addTrace(mockTraceStart);
    resetTracesStore();
    const state = get(tracesStore);
    expect(state.traces).toEqual({});
    expect(state.tracesBySession).toEqual({});
  });
});
