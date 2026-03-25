<script lang="ts">
  interface Props {
    title: string;
    description?: string;
    children: import('svelte').Snippet;
  }

  let { title, description, children }: Props = $props();
</script>

<div class="rounded-lg border border-osai-surface-600 bg-osai-surface-800">
  <div class="border-b border-osai-surface-600 px-6 py-4">
    <h2 class="text-base font-semibold text-osai-text-primary">
      {title}
    </h2>
    {#if description}
      <p class="mt-1 text-sm text-osai-text-secondary">
        {description}
      </p>
    {/if}
  </div>
  <div class="divide-y divide-osai-surface-600">
    {@render children()}
  </div>
</div>
