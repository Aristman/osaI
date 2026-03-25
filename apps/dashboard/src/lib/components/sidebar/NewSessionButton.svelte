<script lang="ts">
  /**
   * New session button component.
   * Creates a new session and navigates to chat.
   */
  interface Props {
    onNewSession: () => void;
  }

  let { onNewSession }: Props = $props();
</script>

<button
  class="flex w-full items-center gap-2 rounded-md border border-dashed border-osai-surface-500 px-3 py-2 text-sm text-osai-text-secondary transition-colors hover:border-osai-primary-500 hover:bg-osai-surface-700 hover:text-osai-text-primary"
  onclick={onNewSession}
  type="button"
>
  <!-- Plus icon -->
  <svg class="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <line x1="12" y1="5" x2="12" y2="19"></line>
    <line x1="5" y1="12" x2="19" y2="12"></line>
  </svg>
  <span>New Session</span>
</button>
