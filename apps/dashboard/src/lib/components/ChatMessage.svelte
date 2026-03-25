<script lang="ts">
  import type { ChatMessage as ChatMessageType } from '../stores/messages';
  import { renderMarkdown } from './render-markdown';
  import { formatTimestamp } from './chat-utils';

  interface Props {
    message: ChatMessageType;
  }

  let { message }: Props = $props();

  const isUser = $derived(message.type === 'user');
  const isSystem = $derived(message.type === 'system');
  const isToolStream = $derived(message.type === 'tool_stream');
  const isPermissionRequest = $derived(message.type === 'permission_request');
  const isBlock = $derived(message.type === 'block');

  const blockType = $derived(isBlock ? (message.data as { blockType: string }).blockType : null);
  const blockContent = $derived(
    isBlock ? (message.data as { content: unknown }).content : null
  );
  const textContent = $derived(
    typeof blockContent === 'object' && blockContent !== null && 'text' in blockContent
      ? (blockContent as { text: string }).text
      : typeof blockContent === 'string'
        ? blockContent
        : null
  );

  const toolName = $derived(
    isToolStream ? (message.data as { toolName: string }).toolName : null
  );
  const toolStatus = $derived(
    isToolStream ? (message.data as { status: string }).status : null
  );
  const toolData = $derived(
    isToolStream ? (message.data as { data: unknown }).data : null
  );

  const userText = $derived(isUser ? (message.data as { text?: string }).text ?? '' : '');

  const statusColor = $derived(
    toolStatus === 'completed'
      ? 'text-osai-success'
      : toolStatus === 'error'
        ? 'text-osai-error'
        : toolStatus === 'progress'
          ? 'text-osai-accent-400'
          : 'text-osai-text-muted'
  );

  const renderedMarkdown = $derived(
    textContent ? renderMarkdown(textContent) : ''
  );
</script>

{#if isUser}
  <!-- User message -->
  <div class="flex justify-end px-4 py-2">
    <div class="max-w-[75%] rounded-lg bg-osai-primary-600 px-4 py-2 text-sm text-white">
      <div class="whitespace-pre-wrap">{userText}</div>
      <div class="mt-1 text-right text-xs text-osai-primary-200">
        {formatTimestamp(message.timestamp)}
      </div>
    </div>
  </div>
{:else if isSystem}
  <!-- System message -->
  <div class="flex justify-center px-4 py-1">
    <div class="rounded bg-osai-surface-700 px-3 py-1 text-xs text-osai-text-muted">
      {(message.data as { text?: string }).text ?? JSON.stringify(message.data)}
    </div>
  </div>
{:else if isToolStream}
  <!-- Tool stream message -->
  <div class="px-4 py-2">
    <div class="rounded-lg border border-osai-surface-600 bg-osai-surface-800 p-3 text-sm">
      <div class="flex items-center gap-2">
        <span class="font-mono text-xs text-osai-accent-400">{toolName}</span>
        <span class="rounded-full bg-osai-surface-700 px-2 py-0.5 text-xs {statusColor}">
          {toolStatus}
        </span>
      </div>
      {#if toolData && typeof toolData === 'object'}
        {#if 'output' in (toolData as Record<string, unknown>) && (toolData as Record<string, unknown>).output}
          <pre class="mt-2 max-h-40 overflow-auto rounded bg-osai-surface-900 p-2 text-xs text-osai-text-secondary">
            {(toolData as Record<string, unknown>).output}
          </pre>
        {:else if 'command' in (toolData as Record<string, unknown>)}
          <pre class="mt-2 rounded bg-osai-surface-900 p-2 text-xs text-osai-text-secondary">
            $ {(toolData as Record<string, unknown>).command}
          </pre>
        {/if}
      {/if}
      <div class="mt-1 text-xs text-osai-text-muted">
        {formatTimestamp(message.timestamp)}
      </div>
    </div>
  </div>
{:else if isPermissionRequest}
  <!-- Permission request (handled by T-005, placeholder) -->
  <div class="flex justify-center px-4 py-2">
    <div class="rounded-lg border border-osai-warning/30 bg-osai-warning/10 px-4 py-2 text-sm text-osai-warning">
      Permission request: {(message.data as { toolName?: string }).toolName ?? 'unknown tool'}
    </div>
  </div>
{:else if isBlock && blockType === 'code'}
  <!-- Code block -->
  <div class="px-4 py-2">
    <div class="max-w-[80%] rounded-lg bg-osai-surface-800 p-3 text-sm">
      {#if textContent}
        <pre class="overflow-auto rounded bg-osai-surface-900 p-3 font-mono text-xs text-osai-text-secondary">{textContent}</pre>
      {:else}
        <pre class="overflow-auto rounded bg-osai-surface-900 p-3 font-mono text-xs text-osai-text-muted">No content</pre>
      {/if}
      <div class="mt-1 text-xs text-osai-text-muted">
        {formatTimestamp(message.timestamp)}
      </div>
    </div>
  </div>
{:else if isBlock && blockType === 'text'}
  <!-- Text block (assistant message with markdown) -->
  <div class="flex justify-start px-4 py-2">
    <div class="max-w-[80%] rounded-lg bg-osai-surface-800 px-4 py-2 text-sm text-osai-text-primary">
      {#if renderedMarkdown}
        {@html renderedMarkdown}
      {/if}
      <div class="mt-1 text-xs text-osai-text-muted">
        {formatTimestamp(message.timestamp)}
      </div>
    </div>
  </div>
{:else if isBlock}
  <!-- Generic block (card, table, image) -->
  <div class="px-4 py-2">
    <div class="max-w-[80%] rounded-lg border border-osai-surface-600 bg-osai-surface-800 p-3 text-sm">
      <div class="mb-1 text-xs font-medium text-osai-text-muted uppercase">{blockType}</div>
      <pre class="overflow-auto text-xs text-osai-text-secondary">{blockContent !== null && typeof blockContent === 'object' ? JSON.stringify(blockContent, null, 2) : String(blockContent ?? '')}</pre>
      <div class="mt-1 text-xs text-osai-text-muted">
        {formatTimestamp(message.timestamp)}
      </div>
    </div>
  </div>
{/if}
