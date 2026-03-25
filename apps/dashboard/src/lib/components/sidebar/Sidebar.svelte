<script lang="ts">
  /**
   * Main Sidebar component.
   * Contains navigation, session list, new session button,
   * connection status indicator, and permission badge.
   */
  import { goto } from '$app/navigation';
  import { sessionsStore, connectionStore, pendingPermissionCount, addSession, setActiveSession } from '../../stores';
  import SidebarNav from './SidebarNav.svelte';
  import SessionList from './SessionList.svelte';
  import NewSessionButton from './NewSessionButton.svelte';
  import type { Session } from '../../types';

  interface Props {
    isOpen?: boolean;
    onToggle?: () => void;
  }

  let { isOpen = true, onToggle }: Props = $props();

  let sessionsCollapsed = $state(false);

  function toggleSessions(): void {
    sessionsCollapsed = !sessionsCollapsed;
  }

  function handleSessionSelect(sessionId: string): void {
    setActiveSession(sessionId);
    goto('/');
  }

  function handleNewSession(): void {
    const newSession: Session = {
      id: crypto.randomUUID(),
      label: `Session ${$sessionsStore.sessions.length + 1}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      messageCount: 0,
      channel: 'dashboard',
      status: 'active'
    };
    addSession(newSession);
    setActiveSession(newSession.id);
    goto('/');
  }

  const connectionState = $derived($connectionStore.state);
  const permissionCount = $derived($pendingPermissionCount);

  const connectionColorClass: Record<string, string> = {
    connected: 'bg-osai-success',
    connecting: 'bg-osai-warning animate-pulse',
    reconnecting: 'bg-osai-warning animate-pulse',
    disconnected: 'bg-osai-text-muted',
    error: 'bg-osai-error'
  };

  const connectionLabel: Record<string, string> = {
    connected: 'Connected',
    connecting: 'Connecting...',
    reconnecting: 'Reconnecting...',
    disconnected: 'Disconnected',
    error: 'Connection Error'
  };
</script>

<!-- Mobile overlay -->
{#if isOpen}
  <div
    class="fixed inset-0 z-20 bg-black/50 md:hidden"
    onclick={onToggle}
    role="presentation"
  ></div>
{/if}

<aside
  class="flex w-64 flex-shrink-0 flex-col border-r border-osai-surface-600 bg-osai-surface-800 transition-transform duration-200 {isOpen
    ? 'translate-x-0'
    : '-translate-x-full'} md:translate-x-0"
  role="navigation"
  aria-label="Main sidebar"
>
  <!-- Header -->
  <div class="flex h-14 items-center justify-between border-b border-osai-surface-600 px-4">
    <div class="flex items-center gap-2">
      <h1 class="text-lg font-semibold text-osai-text-primary">
        osaI
      </h1>
      <span class="text-xs text-osai-text-muted">Dashboard</span>
    </div>
    <!-- Mobile close button -->
    <button
      class="rounded-md p-1 text-osai-text-secondary hover:bg-osai-surface-700 hover:text-osai-text-primary md:hidden"
      onclick={onToggle}
      type="button"
      aria-label="Close sidebar"
    >
      <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <line x1="18" y1="6" x2="6" y2="18"></line>
        <line x1="6" y1="6" x2="18" y2="18"></line>
      </svg>
    </button>
  </div>

  <!-- Navigation -->
  <SidebarNav />

  <!-- Sessions section (collapsible) -->
  <div class="border-t border-osai-surface-600 px-2 pt-2">
    <div class="flex items-center justify-between px-2 py-1">
      <button
        class="flex items-center gap-1 text-xs font-medium uppercase tracking-wider text-osai-text-muted hover:text-osai-text-secondary"
        onclick={toggleSessions}
        type="button"
        aria-expanded={!sessionsCollapsed}
        aria-controls="session-list"
      >
        <span>Sessions</span>
        <svg
          class="h-3 w-3 transition-transform {sessionsCollapsed ? '-rotate-90' : 'rotate-0'}"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <polyline points="6 9 12 15 18 9"></polyline>
        </svg>
      </button>

      <!-- Permission badge -->
      {#if permissionCount > 0}
        <span
          class="flex h-5 min-w-5 items-center justify-center rounded-full bg-osai-error px-1.5 text-xs font-medium text-white"
          title="{permissionCount} pending permission(s)"
        >
          {permissionCount}
        </span>
      {/if}
    </div>

    {#if !sessionsCollapsed}
      <div id="session-list" class="pb-1">
        <NewSessionButton onNewSession={handleNewSession} />
        <div class="mt-1 max-h-60 overflow-y-auto">
          <SessionList
            sessions={$sessionsStore.sessions}
            activeSessionId={$sessionsStore.activeSessionId}
            onSessionSelect={handleSessionSelect}
          />
        </div>
      </div>
    {/if}
  </div>

  <!-- Bottom section: connection status -->
  <div class="mt-auto border-t border-osai-surface-600 p-3">
    <div class="flex items-center gap-2 text-xs text-osai-text-muted">
      <span
        class="h-2 w-2 rounded-full {connectionColorClass[connectionState] ?? 'bg-osai-text-muted'}"
        title={connectionLabel[connectionState] ?? connectionState}
      ></span>
      <span>{connectionLabel[connectionState] ?? connectionState}</span>
    </div>
  </div>
</aside>
