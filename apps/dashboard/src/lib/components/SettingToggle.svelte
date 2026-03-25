<script lang="ts">
  interface Props {
    label: string;
    description?: string;
    checked: boolean;
    onchange?: (value: boolean) => void;
  }

  let { label, description, checked, onchange }: Props = $props();

  function handleToggle(_e: Event) {
    const newValue = !checked;
    onchange?.(newValue);
  }
</script>

<div class="flex items-center justify-between px-6 py-4">
  <div class="flex-1 pr-4">
    <span class="text-sm font-medium text-osai-text-primary">
      {label}
    </span>
    {#if description}
      <p class="mt-0.5 text-xs text-osai-text-secondary">
        {description}
      </p>
    {/if}
  </div>
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={label}
    onclick={handleToggle}
    class="relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-osai-primary-500 focus:ring-offset-2 focus:ring-offset-osai-surface-800
    {checked ? 'bg-osai-primary-600' : 'bg-osai-surface-500'}"
  >
    <span
      class="pointer-events-none inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform duration-200
      {checked ? 'translate-x-4' : 'translate-x-0'}"
    ></span>
  </button>
</div>
