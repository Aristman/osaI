<script lang="ts">
  import ChatMessage from './ChatMessage.svelte';
  import ChatInput from './ChatInput.svelte';
  import PermissionList from './PermissionList.svelte';
  import { messagesStore } from '../stores/messages';
  import { sessionsStore } from '../stores/sessions';
  import { connectionStore } from '../stores/connection';
  import { permissionsStore } from '../stores/permissions';
  import { WsClient } from '../ws-client';
  import { generateMessageId } from './chat-utils';
  import { createPermissionActions } from './permissions/permission-actions';

  let wsClient = $state<WsClient | null>(null);
  let permissionActions = $state<ReturnType<typeof createPermissionActions> | null>(null);

  const currentMessages = $derived.by(() => {
    const sessionId = $sessionsStore.activeSessionId;
    if (!sessionId) return [];
    const ids = $messagesStore.messagesBySession[sessionId] ?? [];
    return ids
      .map((id) => $messagesStore.messages[id])
      .filter((m): m is NonNullable<typeof m> => m !== undefined);
  });

  const currentPermissions = $derived($permissionsStore.pendingRequests);

  const isConnected = $derived($connectionStore.state === 'connected');
  const hasMessages = $derived(currentMessages.length > 0);
  const hasPermissionRequests = $derived(currentPermissions.length > 0);

  let messagesContainer = $state<HTMLDivElement | null>(null);

  // Initialize permission actions when wsClient becomes available
  $effect(() => {
    if (wsClient && !permissionActions) {
      permissionActions = createPermissionActions(wsClient, permissionsStore);
    }
  });

  // Auto-scroll on new messages or permission requests
  $effect(() => {
    // Track currentMessages and currentPermissions so effect re-runs on change
    const _msgs = currentMessages;
    const _perms = currentPermissions;
    if (messagesContainer && (_msgs.length > 0 || _perms.length > 0)) {
      requestAnimationFrame(() => {
        if (messagesContainer) {
          messagesContainer.scrollTop = messagesContainer.scrollHeight;
        }
      });
    }
  });

  function handleSend(text: string): void {
    const sessionId = $sessionsStore.activeSessionId;
    if (!sessionId) return;

    try {
      // Add user message to store locally
      const userMsg = {
        id: generateMessageId(),
        sessionId,
        type: 'user' as const,
        timestamp: new Date().toISOString(),
        data: { text }
      };

      messagesStore.addUserMessage(userMsg);

      // Send via WebSocket
      if (wsClient) {
        wsClient.send({ type: 'message', sessionId, content: text });
      }
    } catch {
      // Silently handle send error -- connection may not be active
    }
  }
</script>

<div class="flex h-full flex-col">
  <!-- Chat header -->
  <div class="flex h-14 flex-shrink-0 items-center border-b border-osai-surface-600 px-4">
    <h1 class="text-lg font-semibold text-osai-text-primary">
      Chat
    </h1>
    {#if $sessionsStore.activeSessionId}
      <span class="ml-2 text-xs text-osai-text-muted">
        {$sessionsStore.activeSessionId}
      </span>
    {/if}
  </div>

  <!-- Messages list with permission prompts -->
  <div
    bind:this={messagesContainer}
    class="flex-1 overflow-y-auto"
  >
    {#if hasMessages || hasPermissionRequests}
      <div class="py-4">
        <!-- Permission requests rendered inline in chat -->
        {#if hasPermissionRequests && permissionActions}
          <div class="mx-4 mb-4">
            <PermissionList
              requests={currentPermissions}
              actions={permissionActions}
            />
          </div>
        {/if}

        <!-- Chat messages -->
        {#each currentMessages as message (message.id)}
          <ChatMessage {message} />
        {/each}
      </div>
    {:else}
      <div class="flex h-full items-center justify-center">
        <div class="text-center">
          <p class="text-lg text-osai-text-muted">
            Start a conversation...
          </p>
          {#if !isConnected}
            <p class="mt-2 text-sm text-osai-text-muted">
              Connect to Gateway to begin chatting.
            </p>
          {/if}
        </div>
      </div>
    {/if}
  </div>

  <!-- Input -->
  <ChatInput
    onSend={handleSend}
    disabled={!isConnected || !$sessionsStore.activeSessionId}
    placeholder={!isConnected ? 'Not connected...' : !$sessionsStore.activeSessionId ? 'Select a session...' : 'Type a message...'}
  />
</div>
