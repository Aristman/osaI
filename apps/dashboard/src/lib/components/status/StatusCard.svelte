<script lang="ts">
  import type { TrendDirection } from './status-utils';
  import { getUsageColorClass, getUsageBgClass, getUsageBarBgClass, getTrendIndicator } from './status-utils';

  interface Props {
    label: string;
    value: string;
    unit?: string;
    usage?: number;
    trend?: TrendDirection;
    details?: string;
  }

  let { label, value, unit = '', usage, trend, details }: Props = $props();

  let colorClass = $derived(usage !== undefined ? getUsageColorClass(usage) : 'text-osai-text-primary');
  let barColorClass = $derived(usage !== undefined ? getUsageBgClass(usage) : 'bg-osai-primary-500');
  let barBgClass = $derived(usage !== undefined ? getUsageBarBgClass(usage) : 'bg-osai-surface-600');
  let trendIcon = $derived(trend ? getTrendIndicator(trend) : '');
</script>

<div class="rounded-lg border border-osai-surface-600 bg-osai-surface-800 p-4">
  <div class="flex items-center justify-between">
    <span class="text-xs font-medium uppercase tracking-wider text-osai-text-muted">
      {label}
    </span>
    {#if trend}
      <span class="text-xs text-osai-text-muted">{trendIcon}</span>
    {/if}
  </div>

  <div class="mt-2 flex items-baseline gap-1">
    <span class="text-2xl font-semibold {colorClass}">{value}</span>
    {#if unit}
      <span class="text-sm text-osai-text-secondary">{unit}</span>
    {/if}
  </div>

  {#if usage !== undefined}
    <div class="mt-3">
      <div class="h-2 w-full overflow-hidden rounded-full {barBgClass}">
        <div
          class="h-2 rounded-full transition-all duration-300 {barColorClass}"
          style="width: {Math.min(usage, 100)}%"
        ></div>
      </div>
      <div class="mt-1 text-right text-xs text-osai-text-muted">
        {usage.toFixed(1)}%
      </div>
    </div>
  {/if}

  {#if details}
    <div class="mt-2 text-xs text-osai-text-secondary">{details}</div>
  {/if}
</div>
