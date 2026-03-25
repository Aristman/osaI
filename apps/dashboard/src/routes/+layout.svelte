<script lang="ts">
  import '../app.css';
  import Sidebar from '$lib/components/sidebar/Sidebar.svelte';

  interface Props {
    children: import('svelte').Snippet;
  }

  let { children }: Props = $props();
  let sidebarOpen = $state(false);

  function toggleSidebar(): void {
    sidebarOpen = !sidebarOpen;
  }
</script>

<div class="flex h-screen overflow-hidden bg-osai-surface-900">
  <!-- Mobile sidebar toggle -->
  <button
    class="fixed left-3 top-3 z-30 rounded-md bg-osai-surface-700 p-2 text-osai-text-secondary shadow-md transition-colors hover:bg-osai-surface-600 hover:text-osai-text-primary md:hidden"
    onclick={toggleSidebar}
    type="button"
    aria-label="Toggle sidebar"
  >
    {#if !sidebarOpen}
      <!-- Menu icon -->
      <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <line x1="3" y1="12" x2="21" y2="12"></line>
        <line x1="3" y1="6" x2="21" y2="6"></line>
        <line x1="3" y1="18" x2="21" y2="18"></line>
      </svg>
    {:else}
      <!-- Close icon -->
      <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <line x1="18" y1="6" x2="6" y2="18"></line>
        <line x1="6" y1="6" x2="18" y2="18"></line>
      </svg>
    {/if}
  </button>

  <!-- Sidebar -->
  <Sidebar isOpen={sidebarOpen} onToggle={toggleSidebar} />

  <!-- Main content area -->
  <main class="flex flex-1 flex-col overflow-hidden">
    {@render children()}
  </main>
</div>
