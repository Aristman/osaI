<script lang="ts">
  import { MEMORY_CATEGORIES, type MemoryCategory } from './memory-utils';

  interface Props {
    selectedCategory: MemoryCategory | null;
    onCategoryChange: (category: MemoryCategory | null) => void;
  }

  let { selectedCategory, onCategoryChange }: Props = $props();
</script>

<div class="flex flex-wrap gap-2">
  {#each MEMORY_CATEGORIES as cat}
    <button
      type="button"
      class="rounded-full px-3 py-1 text-xs font-medium transition-colors
        {selectedCategory === cat.value
          ? 'bg-osai-primary-500 text-white'
          : 'bg-osai-surface-600 text-osai-text-secondary hover:bg-osai-surface-500 hover:text-osai-text-primary'}"
      onclick={() => onCategoryChange(cat.value)}
      aria-pressed={selectedCategory === cat.value}
    >
      {cat.label}
    </button>
  {/each}
</div>
