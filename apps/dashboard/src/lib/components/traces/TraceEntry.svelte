<script lang="ts">
  /**
   * TraceEntry component -- displays a single agent trace entry.
   *
   * Shows: tool name, status, duration, expand/collapse details.
   * Props:
   *   trace: TraceEntry -- the trace entry to display
   */
  import type { TraceEntry } from '../../stores/traces';
  import { formatDuration } from './trace-utils';

  interface Props {
    trace: TraceEntry;
  }

  let { trace }: Props = $props();

  let expanded = $state(false);

  function toggleExpanded(): void {
    expanded = !expanded;
  }

  function getStatusClasses(): string {
    switch (trace.status) {
      case 'completed':
        return 'text-osai-success';
      case 'error':
        return 'text-osai-error';
      case 'started':
      case 'progress':
        return 'text-osai-info';
      default:
        return 'text-osai-text-muted';
    }
  }

  function getStatusLabel(): string {
    switch (trace.status) {
      case 'completed':
        return 'success';
      case 'error':
        return 'error';
      case 'started':
        return 'running';
      case 'progress':
        return 'running';
      default:
        return trace.status;
    }
  }

  function formatData(): string {
    if (trace.data === null || trace.data === undefined) {
      return 'No data';
    }
    try {
      return JSON.stringify(trace.data, null, 2);
    } catch {
      return String(trace.data);
    }
  }
</script>

<div class="rounded-lg border border-osai-surface-600 bg-osai-surface-800 transition-colors hover:border-osai-surface-500">
  <!-- Header row -->
  <button
    type="button"
    class="flex w-full items-center gap-3 px-4 py-3 text-left"
    onclick={toggleExpanded}
    aria-expanded={expanded}
  >
    <!-- Status indicator -->
    <span class="inline-flex h-2 w-2 flex-shrink-0 rounded-full {trace.status === 'completed' ? 'bg-osai-success' : trace.status === 'error' ? 'bg-osai-error' : 'bg-osai-info animate-pulse'}"></span>

    <!-- Tool name -->
    <span class="flex-1 font-mono text-sm font-medium text-osai-text-primary">
      {trace.toolName}
    </span>

    <!-- Status label -->
    <span class="text-xs font-medium {getStatusClasses()}">
      {getStatusLabel()}
    </span>

    <!-- Duration -->
    <span class="text-xs text-osai-text-muted tabular-nums">
      {formatDuration(trace.duration)}
    </span>

    <!-- Expand/collapse chevron -->
    <span class="text-osai-text-muted transition-transform {expanded ? 'rotate-90' : ''}">
      <svg class="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M6 4l4 4-4 4" />
      </svg>
    </span>
  </button>

  <!-- Expanded details -->
  {#if expanded}
    <div class="border-t border-osai-surface-600 px-4 py-3">
      <!-- Token usage -->
      {#if trace.tokenUsage}
        <div class="mb-2 flex gap-4 text-xs text-osai-text-secondary">
          <span>In: {trace.tokenUsage.inputTokens.toLocaleString('en-US')}</span>
          <span>Out: {trace.tokenUsage.outputTokens.toLocaleString('en-US')}</span>
        </div>
      {/if}

      <!-- Data / details -->
      <pre class="max-h-64 overflow-auto rounded bg-osai-surface-900 p-3 text-xs leading-relaxed text-osai-text-secondary">{formatData()}</pre>
    </div>
  {/if}
</div>
