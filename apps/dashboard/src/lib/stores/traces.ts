/**
 * Traces store for agent traces (tool calls, durations, token usage).
 */
import { writable, derived } from 'svelte/store';
import type { ToolStreamMessage } from '../types';

export interface TraceEntry {
  toolCallId: string;
  sessionId: string;
  toolName: string;
  status: 'started' | 'progress' | 'completed' | 'error';
  startedAt: string;
  completedAt: string | null;
  duration: number | null;
  data: unknown;
  tokenUsage: TokenUsage | null;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface TracesState {
  /** Map of toolCallId -> trace entry */
  traces: Record<string, TraceEntry>;
  /** Map of sessionId -> ordered tool call IDs */
  tracesBySession: Record<string, string[]>;
}

const initialState: TracesState = {
  traces: {},
  tracesBySession: {}
};

function createTracesStore() {
  const { subscribe, set, update } = writable<TracesState>({ ...initialState });

  return {
    subscribe,
    set,

    addTrace(msg: ToolStreamMessage): void {
      update((s) => {
        const existing = s.traces[msg.toolCallId];
        const trace: TraceEntry = {
          toolCallId: msg.toolCallId,
          sessionId: msg.sessionId,
          toolName: msg.toolName,
          status: msg.status,
          startedAt: existing?.startedAt ?? msg.timestamp,
          completedAt: msg.status === 'completed' || msg.status === 'error' ? msg.timestamp : null,
          duration: msg.duration ?? existing?.duration ?? null,
          data: msg.data,
          tokenUsage: existing?.tokenUsage ?? null
        };

        const sessionTraces = s.tracesBySession[msg.sessionId] ?? [];
        const hasTrace = sessionTraces.includes(msg.toolCallId);

        return {
          traces: { ...s.traces, [trace.toolCallId]: trace },
          tracesBySession: {
            ...s.tracesBySession,
            [msg.sessionId]: hasTrace ? sessionTraces : [...sessionTraces, trace.toolCallId]
          }
        };
      });
    },

    updateTraceTokens(toolCallId: string, tokenUsage: TokenUsage): void {
      update((s) => {
        const existing = s.traces[toolCallId];
        if (!existing) return s;
        return {
          ...s,
          traces: {
            ...s.traces,
            [toolCallId]: { ...existing, tokenUsage }
          }
        };
      });
    },

    clearSessionTraces(sessionId: string): void {
      update((s) => {
        const traceIds = s.tracesBySession[sessionId] ?? [];
        const newTraces = { ...s.traces };
        for (const id of traceIds) {
          delete newTraces[id];
        }
        const newBySession = { ...s.tracesBySession };
        delete newBySession[sessionId];
        return { traces: newTraces, tracesBySession: newBySession };
      });
    },

    reset(): void {
      set({ ...initialState });
    }
  };
}

export const tracesStore = createTracesStore();

/**
 * Derived store that returns ordered traces for a given session.
 */
export function sessionTraces(sessionId: string) {
  return derived(tracesStore, ($state) => {
    const traceIds = $state.tracesBySession[sessionId] ?? [];
    return traceIds
      .map((id) => $state.traces[id])
      .filter((t): t is TraceEntry => t !== undefined);
  });
}

export const addTrace = (msg: ToolStreamMessage) => tracesStore.addTrace(msg);
export const updateTraceTokens = (toolCallId: string, tokenUsage: TokenUsage) =>
  tracesStore.updateTraceTokens(toolCallId, tokenUsage);
export const clearSessionTraces = (sessionId: string) => tracesStore.clearSessionTraces(sessionId);
export const resetTracesStore = () => tracesStore.reset();
