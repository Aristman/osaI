<script lang="ts">
  /**
   * Individual session item in the sidebar.
   * Displays session label, status indicator, and click-to-switch behavior.
   */
  import type { Session } from '../../types';

  interface Props {
    session: Session;
    isActive: boolean;
    onSessionSelect: (sessionId: string) => void;
  }

  let { session, isActive, onSessionSelect }: Props = $props();

  function handleClick(): void {
    onSessionSelect(session.id);
  }

  function handleKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      handleClick();
    }
  }

  const statusColor: Record<string, string> = {
    active: 'bg-osai-success',
    archived: 'bg-osai-text-muted'
  };

  const channelIcon: Record<string, string> = {
    cli: 'CLI',
    dashboard: 'WEB',
    telegram: 'TG',
    whatsapp: 'WA'
  };
</script>

<button
  class="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm transition-colors {isActive
    ? 'bg-osai-primary-600/20 text-osai-text-primary'
    : 'text-osai-text-secondary hover:bg-osai-surface-700 hover:text-osai-text-primary'}"
  onclick={handleClick}
  onkeydown={handleKeydown}
  role="option"
  aria-selected={isActive}
  tabindex={isActive ? 0 : -1}
>
  <!-- Status indicator -->
  <span
    class="h-2 w-2 shrink-0 rounded-full {statusColor[session.status] ?? 'bg-osai-text-muted'}"
    title={session.status}
  ></span>

  <!-- Session info -->
  <div class="min-w-0 flex-1">
    <div class="truncate font-medium">{session.label}</div>
    <div class="truncate text-xs text-osai-text-muted">
      {channelIcon[session.channel] ?? session.channel} -- {session.messageCount} messages
    </div>
  </div>

  <!-- Active indicator -->
  {#if isActive}
    <span class="h-1.5 w-1.5 shrink-0 rounded-full bg-osai-primary-400"></span>
  {/if}
</button>
