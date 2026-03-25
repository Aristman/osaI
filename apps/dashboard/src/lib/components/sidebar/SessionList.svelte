<script lang="ts">
  /**
   * Session list component for the sidebar.
   * Displays all sessions with active session highlight and click-to-switch.
   */
  import type { Session } from '../../types';
  import SessionItem from './SessionItem.svelte';

  interface Props {
    sessions: Session[];
    activeSessionId: string | null;
    onSessionSelect: (sessionId: string) => void;
  }

  let { sessions, activeSessionId, onSessionSelect }: Props = $props();
</script>

{#if sessions.length === 0}
  <div class="px-2 py-4 text-center text-xs text-osai-text-muted">
    No sessions yet
  </div>
{:else}
  <div class="space-y-0.5" role="listbox" aria-label="Sessions">
    {#each sessions as session (session.id)}
      <SessionItem
        {session}
        isActive={session.id === activeSessionId}
        {onSessionSelect}
      />
    {/each}
  </div>
{/if}
