<script lang="ts">
  import type { PendingPermission } from '../stores/permissions';
  import type { PermissionActions } from './permissions/permission-actions';
  import PermissionPrompt from './PermissionPrompt.svelte';

  interface Props {
    requests: PendingPermission[];
    actions: PermissionActions;
  }

  let { requests, actions }: Props = $props();

  function handleApprove(_requestId: string): void {
    // Notification / toast placeholder: action already handled by PermissionPrompt
  }

  function handleDeny(_requestId: string): void {
    // Notification / toast placeholder: action already handled by PermissionPrompt
  }
</script>

{#if requests.length > 0}
  <div class="space-y-3" data-testid="permission-list">
    <!-- Batch actions header -->
    {#if requests.length > 1}
      <div class="flex items-center justify-between" data-testid="batch-actions">
        <span class="text-xs text-osai-text-muted">
          {requests.length} pending permission {requests.length === 1 ? 'request' : 'requests'}
        </span>
        <div class="flex gap-2">
          <button
            type="button"
            class="rounded-md border border-osai-surface-500 bg-osai-surface-700 px-2 py-1 text-xs text-osai-text-secondary transition-colors hover:bg-osai-surface-600 hover:text-osai-error"
            onclick={() => actions.denyAll()}
            data-testid="batch-deny-button"
          >
            Deny All
          </button>
          <button
            type="button"
            class="rounded-md bg-osai-primary-600 px-2 py-1 text-xs font-medium text-white transition-colors hover:bg-osai-primary-700"
            onclick={() => actions.approveAll()}
            data-testid="batch-approve-button"
          >
            Approve All
          </button>
        </div>
      </div>
    {/if}

    <!-- Individual permission prompts -->
    {#each requests as request (request.requestId)}
      <PermissionPrompt
        {request}
        {actions}
        onApprove={handleApprove}
        onDeny={handleDeny}
      />
    {/each}
  </div>
{:else}
  <div class="rounded-lg border border-dashed border-osai-surface-500 p-6 text-center" data-testid="permission-list-empty">
    <p class="text-sm text-osai-text-muted">
      No pending permission requests
    </p>
  </div>
{/if}
