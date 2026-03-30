/**
 * @osai/gateway -- ChatContextManager (T-005)
 *
 * Manages chat context isolation and switching.
 * Each chat has its own isolated message history and state.
 * Switching between chats triggers the on_chat_switch hook and
 * notifies connected WebSocket clients.
 *
 * Dependencies:
 *   - ChatService (T-002) for persistence
 *   - WsServer (T-001) for client notifications
 *
 * Constraints:
 *   - Context of each chat is strictly isolated
 *   - State is held in-memory (per-process lifecycle)
 *   - Messages are loaded from SQLite on context access
 *   - on_chat_switch hook point (for future F-008 integration)
 */

import pino from "pino";
import type { ChatService } from "./ChatService.js";
import type { WsServer } from "../server/ws-server.js";
import type { Chat, ChatMessage } from "./types.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Configuration for ChatContextManager. */
export interface ChatContextManagerConfig {
  /** ChatService instance for persistence operations. */
  readonly chatService: ChatService;
  /** WsServer instance for broadcasting notifications. */
  readonly wsServer: WsServer;
  /** Custom pino logger. If omitted, a default child logger is created. */
  readonly logger?: pino.Logger;
}

/** The context snapshot for a chat. */
export interface ChatContext {
  /** The chat metadata entity. */
  readonly chat: Chat;
  /** Messages loaded from the database for this chat. */
  readonly messages: readonly ChatMessage[];
  /** Mutable state bag for this chat (in-memory, per-process). */
  readonly state: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// ChatContextManager
// ---------------------------------------------------------------------------

/**
 * Manages switching between chats while maintaining context isolation.
 *
 * Each chat has its own isolated context consisting of:
 * - Message history (loaded from SQLite via ChatService)
 * - In-memory state bag (per-process, not persisted)
 *
 * On chat switch:
 * 1. Validate target chat exists
 * 2. Broadcast `on_chat_switch` event to all connected WS clients
 * 3. Update the current chat pointer
 * 4. Load target context (messages + state) for subsequent access
 */
export class ChatContextManager {
  private readonly chatService: ChatService;
  private readonly wsServer: WsServer;
  private readonly logger: pino.Logger;

  /** Currently active chat ID (null if none selected). */
  private currentChatId: string | null = null;

  /** In-memory state per chat (keyed by chat ID). */
  private readonly stateMap = new Map<string, Record<string, unknown>>();

  constructor(config: ChatContextManagerConfig) {
    this.chatService = config.chatService;
    this.wsServer = config.wsServer;
    this.logger = config.logger
      ?? pino({ name: "chat-context-manager" }).child({ component: "chat-context-manager" });
  }

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  /**
   * Switch to a different chat.
   *
   * Validates that the target chat exists, broadcasts a notification
   * to all connected clients, and updates the current chat pointer.
   *
   * @param chatId - The ID of the chat to switch to
   * @throws {Error} if the chat does not exist
   */
  switchChat(chatId: string): void {
    const targetChat = this.chatService.getChat(chatId);
    if (targetChat === null) {
      throw new Error(`Chat not found: ${chatId}`);
    }

    const previousChatId = this.currentChatId;

    // Update current chat pointer BEFORE broadcasting
    // so getCurrentChatId() returns the new value
    this.currentChatId = chatId;

    // Ensure state map entry exists
    if (!this.stateMap.has(chatId)) {
      this.stateMap.set(chatId, {});
    }

    // Broadcast to all connected clients
    this.wsServer.broadcast({
      type: "on_chat_switch",
      payload: {
        chatId,
        previousChatId,
        chat: this.chatToSummary(targetChat),
      },
    });

    this.logger.info(
      { from: previousChatId, to: chatId },
      "Chat context switched",
    );
  }

  /**
   * Get the current active chat ID.
   *
   * @returns The current chat ID, or null if no chat is active
   */
  getCurrentChatId(): string | null {
    return this.currentChatId;
  }

  /**
   * Get the full context (chat metadata + messages + state) for the current chat.
   *
   * @returns The current ChatContext, or null if no chat is active
   */
  getCurrentContext(): ChatContext | null {
    if (this.currentChatId === null) {
      return null;
    }

    return this.getContextForChat(this.currentChatId);
  }

  /**
   * Get the context for any chat by ID (not just the current one).
   *
   * This loads messages from the database each time it is called,
   * ensuring fresh data. The state is per-chat in-memory.
   *
   * @param chatId - Target chat ID
   * @returns The ChatContext for the specified chat
   * @throws {Error} if the chat does not exist
   */
  getContextForChat(chatId: string): ChatContext {
    const chat = this.chatService.getChat(chatId);
    if (chat === null) {
      throw new Error(`Chat not found: ${chatId}`);
    }

    const messages = this.chatService.getMessages(chatId);

    // Ensure state map entry exists so that the returned reference is stable
    if (!this.stateMap.has(chatId)) {
      this.stateMap.set(chatId, {});
    }
    const state = this.stateMap.get(chatId)!;

    return { chat, messages, state };
  }

  /**
   * Update the state for the current chat.
   *
   * Merges the provided updates into the existing state.
   * If no chat is currently active, this is a no-op.
   *
   * @param updates - Key-value pairs to merge into the state
   */
  updateContextState(updates: Record<string, unknown>): void {
    if (this.currentChatId === null) {
      this.logger.warn("updateContextState called with no active chat");
      return;
    }

    let state = this.stateMap.get(this.currentChatId);
    if (state === undefined) {
      state = {};
      this.stateMap.set(this.currentChatId, state);
    }

    Object.assign(state, updates);
  }

  /**
   * Clear all state for the current chat.
   *
   * If no chat is currently active, this is a no-op.
   */
  clearContextState(): void {
    if (this.currentChatId === null) {
      return;
    }

    this.stateMap.set(this.currentChatId, {});
  }

  // -----------------------------------------------------------------------
  // Internals
  // -----------------------------------------------------------------------

  /**
   * Convert a full Chat entity to a lightweight summary for WS broadcast.
   * Avoids leaking internal details to clients.
   */
  private chatToSummary(chat: Chat): Record<string, unknown> {
    return {
      id: chat.id,
      name: chat.name,
      description: chat.description,
      tags: chat.tags,
      icon: chat.icon,
      color: chat.color,
      channel: chat.channel,
      isActive: chat.isActive,
      createdAt: chat.createdAt,
      updatedAt: chat.updatedAt,
    };
  }
}
