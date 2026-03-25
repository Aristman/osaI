<script lang="ts">
  import type { SystemInfo } from './status-utils';
  import {
    formatBytes,
    formatUptime,
    formatCpuSpeed,
    formatPercent
  } from './status-utils';
  import StatusCard from './StatusCard.svelte';
  import HealthIndicator from './HealthIndicator.svelte';

  interface Props {
    systemInfo: SystemInfo | null;
    healthStatus: import('./status-utils').HealthStatus;
    lastUpdated: string | null;
    onRefresh?: () => void;
  }

  let { systemInfo, healthStatus, lastUpdated, onRefresh }: Props = $props();

  let hasData = $derived(systemInfo !== null);
</script>

<div class="flex flex-col gap-6">
  <!-- Header -->
  <div class="flex items-center justify-between">
    <HealthIndicator health={healthStatus} {lastUpdated} />
    {#if onRefresh}
      <button
        onclick={onRefresh}
        class="rounded-md border border-osai-surface-600 bg-osai-surface-700 px-3 py-1.5 text-xs text-osai-text-secondary transition-colors hover:bg-osai-surface-600 hover:text-osai-text-primary"
      >
        Refresh
      </button>
    {/if}
  </div>

  {#if hasData && systemInfo}
    <!-- System Identity -->
    <div class="rounded-lg border border-osai-surface-600 bg-osai-surface-800 p-4">
      <h3 class="text-sm font-medium text-osai-text-muted">System Information</h3>
      <div class="mt-3 grid grid-cols-2 gap-4">
        <div>
          <span class="text-xs text-osai-text-muted">Hostname</span>
          <p class="mt-0.5 text-sm font-medium text-osai-text-primary">{systemInfo.hostname}</p>
        </div>
        <div>
          <span class="text-xs text-osai-text-muted">Platform</span>
          <p class="mt-0.5 text-sm font-medium text-osai-text-primary">{systemInfo.platform}</p>
        </div>
        <div>
          <span class="text-xs text-osai-text-muted">Uptime</span>
          <p class="mt-0.5 text-sm font-medium text-osai-text-primary">{formatUptime(systemInfo.uptime)}</p>
        </div>
      </div>
    </div>

    <!-- Resource Metrics -->
    <div class="grid grid-cols-1 gap-4 md:grid-cols-3">
      <!-- CPU Card -->
      <StatusCard
        label="CPU Usage"
        value={formatPercent(systemInfo.cpu.usage)}
        usage={systemInfo.cpu.usage}
        details="{systemInfo.cpu.cores} cores, {formatCpuSpeed(systemInfo.cpu.speed)}"
      />

      <!-- Memory Card -->
      <StatusCard
        label="Memory Usage"
        value={formatBytes(systemInfo.memory.used)}
        unit="/ {formatBytes(systemInfo.memory.total)}"
        usage={systemInfo.memory.usage}
        details="{formatBytes(systemInfo.memory.free)} free"
      />

      <!-- Disk Card -->
      <StatusCard
        label="Disk Usage"
        value={formatBytes(systemInfo.disk.used)}
        unit="/ {formatBytes(systemInfo.disk.total)}"
        usage={systemInfo.disk.usage}
        details="{formatBytes(systemInfo.disk.free)} free"
      />
    </div>

    <!-- CPU Details -->
    <div class="rounded-lg border border-osai-surface-600 bg-osai-surface-800 p-4">
      <h3 class="text-sm font-medium text-osai-text-muted">CPU Details</h3>
      <p class="mt-1 text-sm text-osai-text-secondary">{systemInfo.cpu.model}</p>
    </div>
  {:else}
    <!-- Empty / Loading state -->
    <div class="flex flex-col items-center justify-center rounded-lg border border-dashed border-osai-surface-500 p-12">
      <p class="text-sm text-osai-text-muted">
        {#if lastUpdated === null}
          Connect to Gateway to view system status.
        {:else}
          Loading system metrics...
        {/if}
      </p>
    </div>
  {/if}
</div>
