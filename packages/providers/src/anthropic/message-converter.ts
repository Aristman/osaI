/**
 * @osai/providers -- Anthropic Message Converter (DOMAIN-008)
 *
 * Bidirectional conversion between osaI ChatMessage / ToolDefinition format
 * and Anthropic Messages API format.
 *
 * Key differences:
 * - Anthropic has a separate `system` parameter (not in messages array)
 * - Anthropic tool calls use `tool_use` content blocks with `input` (object)
 *   instead of OpenAI-style `tool_calls` with stringified `arguments`
 * - Anthropic tool results use `tool_result` content blocks
 */

import type {
  ChatMessage,
  ToolCall,
  ToolDefinition,
} from '../types.js';
import type {
  MessageParam,
  Tool as AnthropicTool,
  ToolResultBlockParam,
  TextBlockParam,
  ToolUseBlockParam,
} from '@anthropic-ai/sdk/resources/messages.js';

// ---------------------------------------------------------------------------
// Outbound: osaI -> Anthropic
// ---------------------------------------------------------------------------

/**
 * Extract system prompt from the messages array.
 *
 * Anthropic API requires the system prompt as a separate parameter,
 * not as a message in the messages array. The first message(s) with
 * role 'system' are extracted and concatenated.
 */
export function extractSystemPrompt(
  messages: readonly ChatMessage[],
): string | undefined {
  const systemMessages = messages.filter((m) => m.role === 'system');
  if (systemMessages.length === 0) return undefined;
  return systemMessages.map((m) => m.content).join('\n\n');
}

/**
 * Convert osaI ChatMessage[] to Anthropic MessageParam[].
 *
 * System messages are excluded (they should be passed separately via
 * the `system` parameter). Tool calls and tool results are converted
 * to Anthropic content block format.
 */
export function toAnthropicMessages(
  messages: readonly ChatMessage[],
): MessageParam[] {
  const result: MessageParam[] = [];

  for (const msg of messages) {
    if (msg.role === 'system') continue;

    if (msg.role === 'tool') {
      // Tool result messages: convert to Anthropic tool_result content block
      // and attach to a user message
      const toolResultBlock: ToolResultBlockParam = {
        type: 'tool_result',
        tool_use_id: msg.toolCallId ?? '',
        content: msg.content,
      };

      // Try to merge with previous user message (Anthropic groups consecutive
      // user content blocks). Otherwise create a new user message.
      const last = result[result.length - 1];
      if (last && last.role === 'user' && Array.isArray(last.content)) {
        (last.content as Array<TextBlockParam | ToolResultBlockParam>).push(
          toolResultBlock,
        );
      } else {
        result.push({
          role: 'user',
          content: [toolResultBlock],
        });
      }
      continue;
    }

    if (msg.role === 'assistant' && msg.toolCalls && msg.toolCalls.length > 0) {
      // Assistant message with tool calls: convert to Anthropic content blocks
      const blocks: Array<TextBlockParam | ToolUseBlockParam> = [];

      if (msg.content) {
        blocks.push({ type: 'text', text: msg.content });
      }

      for (const tc of msg.toolCalls) {
        blocks.push({
          type: 'tool_use',
          id: tc.id,
          name: tc.name,
          input: parseToolArguments(tc.arguments),
        });
      }

      result.push({ role: 'assistant', content: blocks });
      continue;
    }

    // Standard text message (user or assistant without tool calls)
    result.push({
      role: msg.role as 'user' | 'assistant',
      content: msg.content,
    });
  }

  return result;
}

/**
 * Convert osaI ToolDefinition[] to Anthropic Tool[].
 *
 * Anthropic uses a flat `Tool` object with `name`, `description`, and `input_schema`
 * instead of OpenAI-style nested `function` wrapper.
 */
export function toAnthropicTools(
  tools: readonly ToolDefinition[],
): AnthropicTool[] {
  return tools.map((tool) => ({
    name: tool.function.name,
    description: tool.function.description,
    input_schema: {
      type: 'object' as const,
      ...tool.function.parameters,
    },
  }));
}

// ---------------------------------------------------------------------------
// Inbound: Anthropic -> osaI
// ---------------------------------------------------------------------------

/**
 * Result of converting an Anthropic Message response to osaI format.
 */
export interface AnthropicResponseConversion {
  content: string;
  toolCalls: ToolCall[];
  finishReason: string | undefined;
}

/**
 * Convert Anthropic Message content blocks to osaI format.
 *
 * Extracts text from TextBlock content blocks and converts ToolUseBlock
 * content blocks to ToolCall[].
 */
export function fromAnthropicContent(
  contentBlocks: ReadonlyArray<{
    type: string;
    text?: string;
    id?: string;
    name?: string;
    input?: unknown;
  }>,
  stopReason: string | null | undefined,
): AnthropicResponseConversion {
  const textParts: string[] = [];
  const toolCalls: ToolCall[] = [];

  for (const block of contentBlocks) {
    if (block.type === 'text' && typeof block.text === 'string') {
      textParts.push(block.text);
    } else if (block.type === 'tool_use') {
      toolCalls.push({
        id: block.id ?? crypto.randomUUID(),
        name: block.name ?? '',
        arguments: JSON.stringify(block.input ?? {}),
      });
    }
    // Ignore other block types (thinking, redacted_thinking, etc.)
  }

  let finishReason: string | undefined;
  if (stopReason === 'tool_use') {
    finishReason = 'tool_calls';
  } else if (stopReason === 'end_turn') {
    finishReason = 'stop';
  } else if (stopReason === 'max_tokens') {
    finishReason = 'length';
  } else if (stopReason != null) {
    finishReason = stopReason;
  }

  return {
    content: textParts.join(''),
    toolCalls,
    finishReason,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Parse tool arguments string to a JSON object.
 * Returns empty object if parsing fails.
 */
function parseToolArguments(args: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(args);
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return {};
  } catch {
    return {};
  }
}
