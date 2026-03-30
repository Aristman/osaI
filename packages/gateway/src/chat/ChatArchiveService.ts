/**
 * @osai/gateway -- ChatArchiveService (T-006)
 *
 * Manages chat archiving, unarchiving, and enforcement of the
 * 20-active-chats limit (NFR-SC01).
 *
 * Responsibilities:
 *   - archiveChat(chatId): mark chat as inactive
 *   - unarchiveChat(chatId): restore chat to active (with limit check)
 *   - createChatWithLimit(input): create a new chat with limit enforcement
 *   - deleteChat(chatId): remove chat and messages
 *   - listArchived(): return only archived chats
 *
 * Constraints:
 *   - Maximum 20 active chats (NFR-SC01)
 *   - Archiving a chat frees a slot
 *   - Parameterized queries only (SQL injection prevention)
 */

import type {
  Chat,
  CreateChatInput,
} from "./types.js";
import type { ChatService } from "./ChatService.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Maximum number of chats that can be active simultaneously (NFR-SC01). */
export const MAX_ACTIVE_CHATS = 20;

// ---------------------------------------------------------------------------
// Custom errors
// ---------------------------------------------------------------------------

/**
 * Thrown when an operation would exceed the active chat limit.
 */
export class ActiveChatLimitError extends Error {
  constructor(
    public readonly currentCount: number,
    public readonly maxCount: number,
  ) {
    super(
      `Cannot activate chat: max ${maxCount} active chats reached ` +
      `(${currentCount}/${maxCount}). Archive an existing chat to free a slot.`,
    );
    this.name = "ActiveChatLimitError";
  }
}

/**
 * Thrown when a chat is not found for archiving/unarchiving/deletion.
 */
export class ChatNotFoundError extends Error {
  constructor(chatId: string) {
    super(`Chat not found: ${chatId}`);
    this.name = "ChatNotFoundError";
  }
}

// ---------------------------------------------------------------------------
// ChatArchiveService
// ---------------------------------------------------------------------------

/**
 * Service for managing chat archiving and the 20-active-chats limit.
 *
 * Delegates persistence to ChatService and adds business rules on top:
 *   - Active chat limit enforcement
 *   - Archive / unarchive validation
 */
export class ChatArchiveService {
  /**
   * @param chatService - The underlying ChatService for persistence operations
   */
  constructor(private readonly chatService: ChatService) {}

  // -----------------------------------------------------------------------
  // Archive operations
  // -----------------------------------------------------------------------

  /**
   * Archive a chat (set isActive = false).
   * This frees an active slot.
   *
   * @param chatId - UUID of the chat to archive
   * @throws {ChatNotFoundError} if the chat does not exist
   */
  archiveChat(chatId: string): void {
    const chat = this.chatService.getChat(chatId);
    if (chat === null) {
      throw new ChatNotFoundError(chatId);
    }

    // Idempotent: if already archived, no-op
    if (!chat.isActive) {
      return;
    }

    this.chatService.updateChat(chatId, { isActive: false });
  }

  /**
   * Unarchive a chat (set isActive = true).
   * Checks that the active chat limit is not exceeded.
   *
   * @param chatId - UUID of the chat to unarchive
   * @throws {ChatNotFoundError} if the chat does not exist
   * @throws {ActiveChatLimitError} if unarchiving would exceed the limit
   */
  unarchiveChat(chatId: string): void {
    const chat = this.chatService.getChat(chatId);
    if (chat === null) {
      throw new ChatNotFoundError(chatId);
    }

    // Idempotent: if already active, no-op
    if (chat.isActive) {
      return;
    }

    // Check limit: current active + 1 (this unarchive)
    const activeCount = this.chatService.getActiveCount();
    if (activeCount >= MAX_ACTIVE_CHATS) {
      throw new ActiveChatLimitError(activeCount, MAX_ACTIVE_CHATS);
    }

    this.chatService.updateChat(chatId, { isActive: true });
  }

  // -----------------------------------------------------------------------
  // Create with limit enforcement
  // -----------------------------------------------------------------------

  /**
   * Create a new chat with active limit enforcement.
   * The new chat is created as active by default.
   *
   * @param input - Chat creation parameters
   * @returns The generated chat ID (UUID)
   * @throws {ActiveChatLimitError} if creating would exceed the 20 active limit
   */
  createChatWithLimit(input: CreateChatInput): string {
    const activeCount = this.chatService.getActiveCount();
    if (activeCount >= MAX_ACTIVE_CHATS) {
      throw new ActiveChatLimitError(activeCount, MAX_ACTIVE_CHATS);
    }

    return this.chatService.createChat(input);
  }

  // -----------------------------------------------------------------------
  // Delete
  // -----------------------------------------------------------------------

  /**
   * Delete a chat and all its messages (cascade).
   * Works for both active and archived chats.
   *
   * @param chatId - UUID of the chat to delete
   * @throws {ChatNotFoundError} if the chat does not exist
   */
  deleteChat(chatId: string): void {
    const chat = this.chatService.getChat(chatId);
    if (chat === null) {
      throw new ChatNotFoundError(chatId);
    }

    this.chatService.deleteChat(chatId);
  }

  // -----------------------------------------------------------------------
  // Query
  // -----------------------------------------------------------------------

  /**
   * List all archived chats.
   *
   * @returns Array of archived chats ordered by updated_at DESC
   */
  listArchived(): Chat[] {
    return this.chatService.listChats({ activeOnly: false }).filter(
      (chat) => !chat.isActive,
    );
  }
}
