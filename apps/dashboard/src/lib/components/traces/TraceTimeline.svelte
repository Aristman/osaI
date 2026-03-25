<script lang="ts">
  /**
   * TraceTimeline component -- timeline visualization of tool calls.
   *
   * Displays traces chronologically with a vertical timeline line and nodes.
   * Props:
   *   traces: TraceEntry[] -- ordered list of trace entries
   */
  import type { TraceEntry } from '../../stores/traces';
  import { formatDuration } from './trace-utils';

  interface Props {
    traces: TraceEntry[];
  }

  let { traces }: Props = $props();

  function getNodeColorClass(status: TraceEntry['status']): string {
    switch (status) {
      case 'completed':
        return 'bg-osai-success';
      case 'error':
        return 'bg-osai-error';
      default:
        return 'bg-osai-info';
    }
  }
</script>

<div class="relative">
  <!-- Vertical timeline line -->
  <div class="absolute bottom-0 left-3 top-0 w-px bg-osai-surface-600"></div>

  <!-- Timeline nodes -->
  {#each traces as trace (trace.toolCallId)}
    <div class="relative mb-4 pl-10 last:mb-0">
      <!-- Node dot on the timeline -->
      <div class="absolute left-2 top-3 h-3 w-3 rounded-full border-2 border-osai-surface-800 {getNodeColorClass(trace.status)}"></div>

      <!-- Node content -->
      <div class="rounded-lg border border-osai-surface-600 bg-osai-surface-800 p-3">
        <div class="flex items-center justify-between">
          <span class="font-mono text-sm font-medium text-osai-text-primary">{trace.toolName}</span>
          <div class="flex items-center gap-3 text-xs text-osai-text-muted">
            <span class="{trace.status === 'completed' ? 'text-osai-success' : trace.status === 'error' ? 'text-osai-error' : 'text-osai-info'}">{trace.status}</span>
            <span class="tabular-nums">{formatDuration(trace.duration)}</span>
          </div>
        </div>
      </div>
    </div>
  {/each}

  {#if traces.length === 0}
    <div class="pl-10 py-4 text-sm text-osai-text-muted">No timeline entries.</div>
  {/if}
</div>
