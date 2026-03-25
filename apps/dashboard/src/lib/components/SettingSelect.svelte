<script lang="ts">
  interface Props {
    label: string;
    description?: string;
    value: string;
    options: Array<{ value: string; label: string }>;
    onchange?: (value: string) => void;
  }

  let { label, description, value, options, onchange }: Props = $props();

  function handleChange(e: Event) {
    const target = e.currentTarget as HTMLSelectElement;
    onchange?.(target.value);
  }
</script>

<div class="flex items-center justify-between px-6 py-4">
  <div class="flex-1 pr-4">
    <label for={label} class="text-sm font-medium text-osai-text-primary">
      {label}
    </label>
    {#if description}
      <p class="mt-0.5 text-xs text-osai-text-secondary">
        {description}
      </p>
    {/if}
  </div>
  <select
    id={label}
    value={value}
    onchange={handleChange}
    class="w-56 rounded-md border border-osai-surface-500 bg-osai-surface-700 px-3 py-1.5 text-sm text-osai-text-primary transition-colors hover:border-osai-surface-600 focus:border-osai-primary-500 focus:outline-none focus:ring-1 focus:ring-osai-primary-500"
  >
    {#each options as option}
      <option value={option.value}>
        {option.label}
      </option>
    {/each}
  </select>
</div>
