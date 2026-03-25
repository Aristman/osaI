<script lang="ts">
  import type { PendingPermission } from '../stores/permissions';
  import type { PermissionActions } from './permissions/permission-actions';
  import { getPermissionSummary, getRiskBorderClass } from './permissions/permission-actions';
  import RiskBadge from './RiskBadge.svelte';

  interface Props {
    request: PendingPermission;
    actions: PermissionActions;
    onApprove?: (requestId: string) => void;
    onDeny?: (requestId: string) => void;
  }

  let { request, actions, onApprove, onDeny }: Props = $props();

  let paramsExpanded = $state(false);

  const summary = $derived(getPermissionSummary(request));
  const borderClass = $derived(getRiskBorderClass(request.riskLevel));
</script>

<div
  class="rounded-lg border bg-osai-surface-800 p-4 {borderClass}"
  data-testid="permission-prompt"
  data-request-id={request.requestId}
>
  <!-- Header: tool name + risk badge -->
  <div class="mb-3 flex items-center justify-between">
    <div class="flex items-center gap-2">
      <span class="font-mono text-sm font-semibold text-osai-text-primary">
        {summary.toolName}
      </span>
      <span class="text-xs text-osai-text-muted">
        {summary.action}
      </span>
    </div>
    <RiskBadge level={request.riskLevel} />
  </div>

  <!-- Description -->
  <p class="mb-3 text-sm text-osai-text-secondary">
    {summary.description}
  </p>

  <!-- Params (collapsed by default) -->
  {#if Object.keys(request.params).length > 0}
    <div class="mb-3">
      <button
        type="button"
        class="flex items-center gap-1 text-xs text-osai-text-muted transition-colors hover:text-osai-text-secondary"
        onclick={() => paramsExpanded = !paramsExpanded}
        data-testid="toggle-params"
      >
        <span class="inline-block transition-transform {paramsExpanded ? 'rotate-90' : ''}">{'\u25B6'}</span>
        Parameters
      </button>
      {#if paramsExpanded}
        <pre class="mt-1 overflow-x-auto rounded-md bg-osai-surface-900 p-2 text-xs text-osai-text-muted" data-testid="params-display">{summary.params}</pre>
      {/if}
    </div>
  {/if}

  <!-- Action buttons -->
  <div class="flex items-center justify-end gap-2" data-testid="action-buttons">
    <button
      type="button"
      class="rounded-md border border-osai-surface-500 bg-osai-surface-700 px-3 py-1.5 text-sm text-osai-text-secondary transition-colors hover:bg-osai-surface-600 hover:text-osai-error"
      onclick={() => {
        actions.deny(request.requestId);
        onDeny?.(request.requestId);
      }}
      data-testid="deny-button"
    >
      Deny
    </button>
    <button
      type="button"
      class="rounded-md bg-osai-primary-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-osai-primary-700"
      onclick={() => {
        actions.approve(request.requestId);
        onApprove?.(request.requestId);
      }}
      data-testid="approve-button"
    >
      Approve
    </button>
  </div>
</div>
