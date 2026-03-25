<script lang="ts">
  interface Props {
    onSend: (text: string) => void;
    disabled?: boolean;
    placeholder?: string;
  }

  let { onSend, disabled = false, placeholder = 'Type a message...' }: Props = $props();

  let messageText = $state('');

  function handleSend(): void {
    const trimmed = messageText.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    messageText = '';
  }

  function handleKeydown(e: KeyboardEvent): void {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  function handleTextareaInput(e: Event): void {
    const target = e.target as HTMLTextAreaElement;
    messageText = target.value;
    // Auto-resize
    target.style.height = 'auto';
    target.style.height = `${Math.min(target.scrollHeight, 200)}px`;
  }
</script>

<div class="border-t border-osai-surface-600 bg-osai-surface-800 px-4 py-3">
  <div class="flex items-end gap-2">
    <textarea
      bind:value={messageText}
      onkeydown={handleKeydown}
      oninput={handleTextareaInput}
      {disabled}
      {placeholder}
      rows="1"
      class="flex-1 resize-none rounded-lg border border-osai-surface-600 bg-osai-surface-900 px-3 py-2 text-sm text-osai-text-primary placeholder:text-osai-text-muted focus:border-osai-primary-500 focus:outline-none disabled:opacity-50"
    ></textarea>
    <button
      onclick={handleSend}
      {disabled}
      class="rounded-lg bg-osai-primary-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-osai-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
      aria-label="Send message"
    >
      Send
    </button>
  </div>
  <div class="mt-1 text-xs text-osai-text-muted">
    Press Enter to send, Shift+Enter for new line
  </div>
</div>
