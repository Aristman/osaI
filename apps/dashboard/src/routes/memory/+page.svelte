<script lang="ts">
  import MemorySearch from '../../lib/components/memory/MemorySearch.svelte';
</script>

<svelte:head>
  <title>Memory Search - osaI Dashboard</title>
</svelte:head>

<div class="flex flex-col gap-2 p-6">
  <h1 class="text-2xl font-semibold text-osai-text-primary">Memory Search</h1>
  <p class="text-sm text-osai-text-secondary">
    Search through long-term memory and knowledge base.
  </p>
</div>

<div class="px-6 pb-6">
  <MemorySearch />
</div>
