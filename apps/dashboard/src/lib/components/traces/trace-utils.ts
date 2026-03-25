/**
 * Trace View utility functions.
 *
 * Provides formatting and computation helpers for the Agent Trace View components.
 * Pure functions only -- no side effects.
 */
import type { TraceEntry } from '../../stores/traces';

/**
 * Format a duration in milliseconds to a human-readable string.
 * - < 1000ms: "XXXms"
 * - >= 1000ms: "X.XXs"
 * - null: "--"
 */
export function formatDuration(duration: number | null): string {
  if (duration === null) return '--';
  if (duration < 1000) return `${Math.round(duration)}ms`;
  return `${(duration / 1000).toFixed(2)}s`;
}

/**
 * Format a token count with locale grouping (e.g. "1,234 tokens").
 */
export function formatTokens(count: number): string {
  return `${count.toLocaleString('en-US')} tokens`;
}

/**
 * Format a USD cost estimate.
 * Shows up to 4 decimal places for small values, 2 for larger.
 */
export function formatCost(cost: number): string {
  if (cost === 0) return '$0.00';
  if (cost < 0.01) return `$${cost.toFixed(4)}`;
  return `$${cost.toFixed(2)}`;
}

/**
 * Pricing constants for cost estimation.
 * Uses Claude Sonnet 4 pricing as reference.
 */
const INPUT_COST_PER_MILLION = 3; // $3 per 1M input tokens
const OUTPUT_COST_PER_MILLION = 15; // $15 per 1M output tokens

/**
 * Computed summary statistics from a list of trace entries.
 */
export interface TokenSummary {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCost: number;
  totalDuration: number;
  traceCount: number;
  errorCount: number;
}

/**
 * Compute aggregate token usage summary from trace entries.
 * Traces without tokenUsage are skipped in token calculations
 * but still counted in traceCount and errorCount.
 */
export function computeTokenSummary(traces: TraceEntry[]): TokenSummary {
  let inputTokens = 0;
  let outputTokens = 0;
  let totalDuration = 0;
  let errorCount = 0;

  for (const trace of traces) {
    totalDuration += trace.duration ?? 0;
    if (trace.status === 'error') errorCount++;

    const usage = trace.tokenUsage;
    if (usage) {
      inputTokens += usage.inputTokens;
      outputTokens += usage.outputTokens;
    }
  }

  const estimatedCost =
    (inputTokens * INPUT_COST_PER_MILLION) / 1_000_000 +
    (outputTokens * OUTPUT_COST_PER_MILLION) / 1_000_000;

  return {
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
    estimatedCost,
    totalDuration,
    traceCount: traces.length,
    errorCount
  };
}

/**
 * Get a list of unique tool names from trace entries.
 */
export function extractToolNames(traces: TraceEntry[]): string[] {
  const names = new Set(traces.map((t) => t.toolName));
  return Array.from(names).sort();
}

/**
 * Status filter type for trace filtering.
 */
export type StatusFilter = 'all' | 'success' | 'error';

/**
 * Filter trace entries by status.
 * - "all": returns all traces
 * - "success": traces with status "completed"
 * - "error": traces with status "error"
 */
export function filterByStatus(
  traces: TraceEntry[],
  filter: StatusFilter
): TraceEntry[] {
  if (filter === 'all') return traces;
  if (filter === 'success') return traces.filter((t) => t.status === 'completed');
  if (filter === 'error') return traces.filter((t) => t.status === 'error');
  return traces;
}

/**
 * Filter trace entries by tool name.
 * If toolName is empty/null, returns all traces.
 */
export function filterByToolName(
  traces: TraceEntry[],
  toolName: string | null
): TraceEntry[] {
  if (!toolName) return traces;
  return traces.filter((t) => t.toolName === toolName);
}
