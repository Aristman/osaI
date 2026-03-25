<script lang="ts">
  import type { HealthStatus } from './status-utils';
  import { getHealthColorClass, getHealthLabel, getHealthTextClass } from './status-utils';

  interface Props {
    health: HealthStatus;
    lastUpdated: string | null;
  }

  let { health, lastUpdated }: Props = $props();

  let dotClass = $derived(getHealthColorClass(health));
  let label = $derived(getHealthLabel(health));
  let textClass = $derived(getHealthTextClass(health));
  let formattedTime = $derived(
    lastUpdated ? new Date(lastUpdated).toLocaleTimeString() : 'Never'
  );
</script>

<div class="flex items-center gap-3">
  <!-- Pulsing dot indicator -->
  <span class="relative flex h-3 w-3">
    <span
      class="absolute inline-flex h-full w-full animate-ping rounded-full opacity-75 {dotClass}"
    ></span>
    <span class="relative inline-flex h-3 w-3 rounded-full {dotClass}"></span>
  </span>

  <div>
    <span class="text-sm font-medium {textClass}">{label}</span>
    <span class="ml-2 text-xs text-osai-text-muted">
      Updated: {formattedTime}
    </span>
  </div>
</div>
