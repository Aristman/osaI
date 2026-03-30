/**
 * @osai/gateway -- Chat Types (T-002)
 *
 * Type definitions for chat entities and CRUD operations.
 * Aligns with DDL in @osai/shared schema.ts:
 *   - chats table
 *   - chat_messages table
 */

// ---------------------------------------------------------------------------
// ToolCall (for assistant messages with function calling)
// ---------------------------------------------------------------------------

/** A single tool/function call within an assistant message. */
export interface ToolCall {
  readonly id: string;
  readonly name: string;
  readonly arguments: string;
}

// ---------------------------------------------------------------------------
// Chat
// ---------------------------------------------------------------------------

/** Full chat entity, maps to `chats` table row. */
export interface Chat {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly tags: readonly string[];
  readonly icon: string;
  readonly color: string;
  readonly channel: string;
  readonly channelMetadata: Record<string, unknown>;
  readonly isActive: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
}

// ---------------------------------------------------------------------------
// ChatMessage
// ---------------------------------------------------------------------------

/** Full chat message entity, maps to `chat_messages` table row. */
export interface ChatMessage {
  readonly id: string;
  readonly chatId: string;
  readonly role: "system" | "user" | "assistant" | "tool";
  readonly content: string;
  readonly toolCalls?: readonly ToolCall[];
  readonly metadata?: Record<string, unknown>;
  readonly createdAt: string;
}

// ---------------------------------------------------------------------------
// Input types
// ---------------------------------------------------------------------------

/** Input for creating a new chat. */
export interface CreateChatInput {
  readonly name: string;
  readonly description?: string;
  readonly tags?: readonly string[];
  readonly icon?: string;
  readonly color?: string;
  readonly channel?: string;
  readonly channelMetadata?: Record<string, unknown>;
}

/** Input for updating an existing chat. Only provided fields are updated. */
export interface UpdateChatInput {
  readonly name?: string;
  readonly description?: string;
  readonly tags?: readonly string[];
  readonly icon?: string;
  readonly color?: string;
  readonly channel?: string;
  readonly channelMetadata?: Record<string, unknown>;
  readonly isActive?: boolean;
}

/** Filter options for listing chats. */
export interface ChatFilter {
  /** If true, return only active chats. Default: false (return all). */
  readonly activeOnly?: boolean;
  /** Filter by channel name. */
  readonly channel?: string;
  /** Filter chats that have at least one of the specified tags. */
  readonly tags?: readonly string[];
}

/** Input for adding a message to a chat. */
export interface AddMessageInput {
  readonly role: "system" | "user" | "assistant" | "tool";
  readonly content: string;
  readonly toolCalls?: readonly ToolCall[];
  readonly metadata?: Record<string, unknown>;
}
