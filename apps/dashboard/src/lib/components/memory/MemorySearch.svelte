<script lang="ts">
  import { memoryStore, searchMemory, loadMore, hasMore, hasSearched, setSelectedCategory, clearError } from '../../stores/memory';
  import MemoryFilters from './MemoryFilters.svelte';
  import MemoryResult from './MemoryResult.svelte';

  let searchInput = $state('');
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  const DEBOUNCE_MS = 300;

  function handleInput(event: Event) {
    const value = (event.target as HTMLInputElement).value;
    searchInput = value;

    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }

    debounceTimer = setTimeout(() => {
      searchMemory(value);
    }, DEBOUNCE_MS);
  }

  function handleSubmit(event: Event) {
    event.preventDefault();
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }
    searchMemory(searchInput);
  }

  function handleCategoryChange(category: import('./memory-utils').MemoryCategory | null) {
    setSelectedCategory(category);
    // Re-trigger search with new category
    if (searchInput.trim()) {
      searchMemory(searchInput);
    }
  }

  function handleLoadMore() {
    loadMore();
  }

  function handleClearError() {
    clearError();
  }
</script>

<div class="flex flex-col gap-6">
  <!-- Search input -->
  <form onsubmit={handleSubmit} class="flex gap-2">
    <div class="relative flex-1">
      <input
        type="text"
        value={searchInput}
        oninput={handleInput}
        placeholder="Search memories..."
        class="w-full rounded-lg border border-osai-surface-600 bg-osai-surface-700 px-4 py-2.5 text-sm text-osai-text-primary placeholder-osai-text-muted transition-colors focus:border-osai-primary-500 focus:outline-none"
        aria-label="Search memories"
      />
    </div>
    <button
      type="submit"
      class="rounded-lg bg-osai-primary-500 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-osai-primary-600"
    >
      Search
    </button>
  </form>

  <!-- Category filters -->
  <MemoryFilters
    selectedCategory={$memoryStore.selectedCategory}
    onCategoryChange={handleCategoryChange}
  />

  <!-- Error state -->
  {#if $memoryStore.error}
    <div class="rounded-lg border border-red-500/30 bg-red-500/10 p-4">
      <div class="flex items-center justify-between">
        <p class="text-sm text-red-300">
          {$memoryStore.error}
        </p>
        <button
          type="button"
          onclick={handleClearError}
          class="text-xs text-red-400 hover:text-red-300"
        >
          Dismiss
        </button>
      </div>
    </div>
  {/if}

  <!-- Loading state -->
  {#if $memoryStore.isSearching && $memoryStore.searchResults.length === 0}
    <div class="flex items-center justify-center py-12">
      <div class="flex items-center gap-3">
        <div class="h-5 w-5 animate-spin rounded-full border-2 border-osai-primary-500 border-t-transparent"></div>
        <span class="text-sm text-osai-text-muted">Searching...</span>
      </div>
    </div>
  {/if}

  <!-- Empty state (search performed, no results) -->
  {#if !$memoryStore.isSearching && $hasSearched && $memoryStore.searchResults.length === 0}
    <div class="flex flex-col items-center justify-center rounded-lg border border-dashed border-osai-surface-500 p-12">
      <p class="text-sm text-osai-text-secondary">
        No results found
      </p>
      {#if $memoryStore.searchQuery}
        <p class="mt-1 text-xs text-osai-text-muted">
          Try a different search query or category filter.
        </p>
      {/if}
    </div>
  {/if}

  <!-- Results list -->
  {#if $memoryStore.searchResults.length > 0}
    <div class="space-y-3">
      <p class="text-xs text-osai-text-muted">
        {$memoryStore.totalFacts} result{$memoryStore.totalFacts !== 1 ? 's' : ''} found
      </p>

      {#each $memoryStore.searchResults as result (result.id)}
        <MemoryResult {result} />
      {/each}
    </div>

    <!-- Load more / loading more indicator -->
    <div class="flex items-center justify-center pt-4">
      {#if $memoryStore.isSearching}
        <div class="flex items-center gap-3">
          <div class="h-4 w-4 animate-spin rounded-full border-2 border-osai-primary-500 border-t-transparent"></div>
          <span class="text-xs text-osai-text-muted">Loading more...</span>
        </div>
      {:else if $hasMore}
        <button
          type="button"
          onclick={handleLoadMore}
          class="rounded-lg border border-osai-surface-600 px-4 py-2 text-sm text-osai-text-secondary transition-colors hover:bg-osai-surface-700 hover:text-osai-text-primary"
        >
          Load more
        </button>
      {/if}
    </div>
  {/if}
</div>
