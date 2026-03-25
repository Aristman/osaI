<script lang="ts">
  interface Props {
    label: string;
    description?: string;
    type?: 'text' | 'number';
    value: string | number;
    placeholder?: string;
    onchange?: (value: string | number) => void;
    min?: number;
    max?: number;
    step?: number;
  }

  let {
    label,
    description,
    type = 'text',
    value,
    placeholder,
    onchange,
    min,
    max,
    step
  }: Props = $props();

  function handleInput(e: Event) {
    const target = e.currentTarget as HTMLInputElement;
    if (type === 'number') {
      const num = target.value === '' ? 0 : Number(target.value);
      onchange?.(num);
    } else {
      onchange?.(target.value);
    }
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
  <input
    id={label}
    type={type}
    value={value}
    {placeholder}
    {min}
    {max}
    {step}
    oninput={handleInput}
    class="w-56 rounded-md border border-osai-surface-500 bg-osai-surface-700 px-3 py-1.5 text-sm text-osai-text-primary placeholder-osai-text-muted transition-colors hover:border-osai-surface-600 focus:border-osai-primary-500 focus:outline-none focus:ring-1 focus:ring-osai-primary-500"
  />
</div>
