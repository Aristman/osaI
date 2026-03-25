<script lang="ts">
  /**
   * TokenUsage component -- displays token usage summary.
   *
   * Shows: input/output/total tokens, estimated cost, trace count, total duration.
   * Props:
   *   summary: TokenSummary -- computed summary data
   */
  import type { TokenSummary } from './trace-utils';
  import { formatCost, formatDuration } from './trace-utils';

  interface Props {
    summary: TokenSummary;
  }

  let { summary }: Props = $props();
</script>

<div class="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
  <!-- Trace count -->
  <div class="rounded-lg border border-osai-surface-600 bg-osai-surface-800 p-3">
    <p class="text-xs text-osai-text-muted">Traces</p>
    <p class="mt-1 text-lg font-semibold text-osai-text-primary">{summary.traceCount}</p>
  </div>

  <!-- Total duration -->
  <div class="rounded-lg border border-osai-surface-600 bg-osai-surface-800 p-3">
    <p class="text-xs text-osai-text-muted">Duration</p>
    <p class="mt-1 text-lg font-semibold text-osai-text-primary">{formatDuration(summary.totalDuration)}</p>
  </div>

  <!-- Input tokens -->
  <div class="rounded-lg border border-osai-surface-600 bg-osai-surface-800 p-3">
    <p class="text-xs text-osai-text-muted">Input Tokens</p>
    <p class="mt-1 text-lg font-semibold text-osai-text-primary">{summary.inputTokens.toLocaleString('en-US')}</p>
  </div>

  <!-- Output tokens -->
  <div class="rounded-lg border border-osai-surface-600 bg-osai-surface-800 p-3">
    <p class="text-xs text-osai-text-muted">Output Tokens</p>
    <p class="mt-1 text-lg font-semibold text-osai-text-primary">{summary.outputTokens.toLocaleString('en-US')}</p>
  </div>

  <!-- Total tokens -->
  <div class="rounded-lg border border-osai-surface-600 bg-osai-surface-800 p-3">
    <p class="text-xs text-osai-text-muted">Total Tokens</p>
    <p class="mt-1 text-lg font-semibold text-osai-text-primary">{summary.totalTokens.toLocaleString('en-US')}</p>
  </div>

  <!-- Estimated cost -->
  <div class="rounded-lg border border-osai-surface-600 bg-osai-surface-800 p-3">
    <p class="text-xs text-osai-text-muted">Est. Cost</p>
    <p class="mt-1 text-lg font-semibold text-osai-accent-400">{formatCost(summary.estimatedCost)}</p>
  </div>
</div>
