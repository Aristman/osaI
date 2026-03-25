<script lang="ts">
  import { onMount } from 'svelte';
  import { SystemStatus } from '../../lib/components';
  import { statusStore, startStatusAutoRefresh, stopStatusAutoRefresh } from '../../lib/stores';

  onMount(() => {
    startStatusAutoRefresh((_msg) => {
      // wsSend is handled by the WS client integration layer
    });

    return () => {
      stopStatusAutoRefresh();
    };
  });
</script>

<svelte:head>
  <title>System Status - osaI Dashboard</title>
</svelte:head>

<div class="flex h-full flex-col overflow-y-auto p-6">
  <div class="mb-6">
    <h1 class="text-2xl font-semibold text-osai-text-primary">System Status</h1>
    <p class="mt-2 text-osai-text-secondary">
      System metrics, health checks, and performance indicators.
    </p>
  </div>

  <SystemStatus
    systemInfo={$statusStore.systemInfo}
    healthStatus={$statusStore.healthStatus}
    lastUpdated={$statusStore.lastUpdated}
    onRefresh={() => statusStore.fetchStatus((_msg) => {})}
  />
</div>
