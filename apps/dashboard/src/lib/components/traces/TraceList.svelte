<script lang="ts">
  /**
   * TraceList component -- list of trace entries for the current session.
   *
   * Features:
   *   - Reads traces from tracesStore bound to activeSession
   *   - Filter by status (all, success, error)
   *   - Filter by tool name
   *   - Computes and displays TokenUsage summary
   *   - Renders TraceEntry items and TraceTimeline
   */
  import { derived } from 'svelte/store';
  import { tracesStore } from '../../stores/traces';
  import { activeSession } from '../../stores/sessions';
  import TraceEntry from './TraceEntry.svelte';
  import TraceTimeline from './TraceTimeline.svelte';
  import TokenUsage from './TokenUsage.svelte';
  import {
    computeTokenSummary,
    extractToolNames,
    filterByStatus,
    filterByToolName,
    type StatusFilter
  } from './trace-utils';
  import type { TraceEntry as TraceEntryType } from '../../stores/traces';

  // Get traces for the active session
  const currentTraces = derived(
    [tracesStore, activeSession],
    ([$store, $session]): TraceEntryType[] => {
      if (!$session) return [];
      const traceIds = $store.tracesBySession[$session.id] ?? [];
      return traceIds
        .map((id) => $store.traces[id])
        .filter((t): t is TraceEntryType => t !== undefined);
    }
  );

  // Available tool names for filter
  const toolNames = derived(currentTraces, ($traces) => extractToolNames($traces));

  // Filter state
  let statusFilter: StatusFilter = $state('all');
  let toolFilter: string | null = $state(null);

  // Computed filtered traces
  const filteredTraces = derived(currentTraces, ($traces) => {
    let result = filterByStatus($traces, statusFilter);
    result = filterByToolName(result, toolFilter);
    return result;
  });

  // Summary based on filtered traces
  const summary = derived(filteredTraces, ($traces) => computeTokenSummary($traces));

  function setStatusFilter(filter: StatusFilter): void {
    statusFilter = filter;
  }

  function setToolFilter(name: string | null): void {
    toolFilter = name;
  }
</script>

<div class="flex flex-1 flex-col gap-6 overflow-hidden p-6">
  <!-- Page header -->
  <div>
    <h1 class="text-2xl font-semibold text-osai-text-primary">Agent Traces</h1>
    <p class="mt-1 text-sm text-osai-text-secondary">
      View agent tool calls, durations, token usage, and costs.
    </p>
  </div>

  <!-- Token usage summary -->
  {#if $currentTraces.length > 0}
    <TokenUsage summary={$summary} />
  {/if}

  <!-- Filters -->
  <div class="flex flex-wrap items-center gap-3">
    <!-- Status filter -->
    <div class="flex items-center gap-1 rounded-lg border border-osai-surface-600 p-1">
      <button
        type="button"
        class="rounded-md px-3 py-1 text-xs font-medium transition-colors {statusFilter === 'all' ? 'bg-osai-surface-500 text-osai-text-primary' : 'text-osai-text-secondary hover:text-osai-text-primary'}"
        onclick={() => setStatusFilter('all')}
      >
        All ({$currentTraces.length})
      </button>
      <button
        type="button"
        class="rounded-md px-3 py-1 text-xs font-medium transition-colors {statusFilter === 'success' ? 'bg-osai-surface-500 text-osai-text-primary' : 'text-osai-text-secondary hover:text-osai-text-primary'}"
        onclick={() => setStatusFilter('success')}
      >
        Success
      </button>
      <button
        type="button"
        class="rounded-md px-3 py-1 text-xs font-medium transition-colors {statusFilter === 'error' ? 'bg-osai-surface-500 text-osai-text-primary' : 'text-osai-text-secondary hover:text-osai-text-primary'}"
        onclick={() => setStatusFilter('error')}
      >
        Error
      </button>
    </div>

    <!-- Tool name filter -->
    {#if $toolNames.length > 1}
      <select
        class="rounded-lg border border-osai-surface-600 bg-osai-surface-800 px-3 py-1 text-xs text-osai-text-primary focus:border-osai-primary-500 focus:outline-none"
        value={toolFilter ?? ''}
        onchange={(e) => {
          const val = (e.target as HTMLSelectElement).value;
          setToolFilter(val || null);
        }}
      >
        <option value="">All tools</option>
        {#each $toolNames as name}
          <option value={name}>{name}</option>
        {/each}
      </select>
    {/if}
  </div>

  <!-- Content area -->
  {#if $currentTraces.length === 0}
    <div class="flex flex-1 flex-col items-center justify-center rounded-lg border border-dashed border-osai-surface-500 p-12">
      <p class="text-sm text-osai-text-muted">No traces available yet.</p>
    </div>
  {:else if $filteredTraces.length === 0}
    <div class="flex flex-1 flex-col items-center justify-center rounded-lg border border-dashed border-osai-surface-500 p-12">
      <p class="text-sm text-osai-text-muted">No traces match the current filter.</p>
      <button
        type="button"
        class="mt-2 text-xs text-osai-primary-400 hover:text-osai-primary-300"
        onclick={() => { statusFilter = 'all'; toolFilter = null; }}
      >
        Clear filters
      </button>
    </div>
  {:else}
    <!-- Toggle between list and timeline views -->
    <div class="flex flex-1 flex-col gap-4 overflow-hidden">
      <!-- Trace list -->
      <div class="flex-1 space-y-2 overflow-y-auto">
        {#each $filteredTraces as trace (trace.toolCallId)}
          <TraceEntry {trace} />
        {/each}
      </div>

      <!-- Timeline visualization -->
      {#if $filteredTraces.length > 1}
        <div class="flex-shrink-0 rounded-lg border border-osai-surface-600 bg-osai-surface-800 p-4">
          <h2 class="mb-3 text-sm font-medium text-osai-text-secondary">Timeline</h2>
          <TraceTimeline traces={$filteredTraces} />
        </div>
      {/if}
    </div>
  {/if}
</div>
