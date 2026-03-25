<script lang="ts">
  import {
    getCategoryLabel,
    getCategoryColorClass,
    getConfidencePercentage,
    getConfidenceColorClass,
    formatMemoryDate,
    truncateContent,
    type MemorySearchResult
  } from './memory-utils';

  interface Props {
    result: MemorySearchResult;
  }

  let { result }: Props = $props();
</script>

<div class="rounded-lg border border-osai-surface-600 bg-osai-surface-800 p-4 transition-colors hover:border-osai-surface-500">
  <!-- Content preview -->
  <p class="text-sm text-osai-text-primary leading-relaxed">
    {truncateContent(result.content)}
  </p>

  <!-- Meta row: category badge + confidence + date -->
  <div class="mt-3 flex flex-wrap items-center gap-3">
    <!-- Category badge -->
    <span class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium {getCategoryColorClass(result.category)}">
      {getCategoryLabel(result.category)}
    </span>

    <!-- Confidence bar -->
    <div class="flex items-center gap-1.5">
      <div class="h-1.5 w-16 overflow-hidden rounded-full bg-osai-surface-600">
        <div
          class="h-full rounded-full transition-all {getConfidenceColorClass(result.confidence)}"
          style="width: {getConfidencePercentage(result.confidence)}"
        ></div>
      </div>
      <span class="text-xs text-osai-text-muted">
        {getConfidencePercentage(result.confidence)}
      </span>
    </div>

    <!-- Date -->
    <span class="text-xs text-osai-text-muted">
      {formatMemoryDate(result.createdAt)}
    </span>
  </div>

  <!-- Tags -->
  {#if result.tags.length > 0}
    <div class="mt-2 flex flex-wrap gap-1">
      {#each result.tags as tag}
        <span class="inline-block rounded bg-osai-surface-600 px-1.5 py-0.5 text-[10px] text-osai-text-muted">
          {tag}
        </span>
      {/each}
    </div>
  {/if}

  <!-- Source -->
  <div class="mt-1.5 text-[10px] text-osai-text-muted">
    Source: {result.source}
  </div>
</div>
