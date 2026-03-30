/**
 * @osai/gateway -- ChatService (T-002)
 *
 * CRUD operations for chats and messages with SQLite persistence.
 * Uses synchronous better-sqlite3 API (db.prepare().run(), .get(), .all()).
 *
 * Dependencies:
 *   - DatabaseManager from @osai/shared (injected via constructor)
 *   - Tables: chats, chat_messages (created by F-001 T-005 migrations)
 *
 * Constraints:
 *   - Parameterized queries only (SQL injection prevention)
 *   - Foreign keys enabled (ON DELETE CASCADE for messages)
 *   - Synchronous API (better-sqlite3 design)
 */

import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import type { DatabaseManager } from "@osai/shared";
import {
  runMigrations,
} from "@osai/shared";
import type {
  Chat,
  ChatFilter,
  ChatMessage,
  CreateChatInput,
  UpdateChatInput,
  AddMessageInput,
  ToolCall,
} from "./types.js";

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Parse a JSON text column value safely.
 * Returns the parsed value or the fallback if parsing fails.
 */
function parseJsonColumn<T>(raw: string | null, fallback: T): T {
  if (raw === null || raw === undefined) {
    return fallback;
  }
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/**
 * Convert a raw database row to a Chat domain object.
 */
function rowToChat(row: Record<string, unknown>): Chat {
  return {
    id: row["id"] as string,
    name: row["name"] as string,
    description: (row["description"] as string) ?? "",
    tags: parseJsonColumn<string[]>(row["tags"] as string | null, []),
    icon: (row["icon"] as string) ?? "",
    color: (row["color"] as string) ?? "",
    channel: (row["channel"] as string) ?? "cli",
    channelMetadata: parseJsonColumn<Record<string, unknown>>(
      row["channel_metadata"] as string | null,
      {},
    ),
    isActive: (row["is_active"] as number) === 1,
    createdAt: row["created_at"] as string,
    updatedAt: row["updated_at"] as string,
  };
}

/**
 * Convert a raw database row to a ChatMessage domain object.
 */
function rowToChatMessage(row: Record<string, unknown>): ChatMessage {
  const toolCallsRaw = row["tool_calls"] as string | null;
  let toolCalls: readonly ToolCall[] | undefined;
  if (toolCallsRaw !== null && toolCallsRaw !== undefined) {
    const parsed = parseJsonColumn<ToolCall[]>(toolCallsRaw, []);
    if (parsed.length > 0) {
      toolCalls = parsed;
    }
  }

  const metadataRaw = row["metadata"] as string | null;
  let metadata: Record<string, unknown> | undefined;
  if (metadataRaw !== null && metadataRaw !== undefined) {
    const parsed = parseJsonColumn<Record<string, unknown>>(metadataRaw, {});
    if (Object.keys(parsed).length > 0) {
      metadata = parsed;
    }
  }

  return {
    id: row["id"] as string,
    chatId: row["chat_id"] as string,
    role: row["role"] as ChatMessage["role"],
    content: (row["content"] as string) ?? "",
    createdAt: row["created_at"] as string,
    ...(toolCalls !== undefined && { toolCalls }),
    ...(metadata !== undefined && { metadata }),
  } satisfies ChatMessage;
}

// ---------------------------------------------------------------------------
// ChatService
// ---------------------------------------------------------------------------

/**
 * Service for managing chats and their messages.
 *
 * Requires an initialized DatabaseManager. The constructor does NOT
 * initialize the database -- the caller must call dbManager.initialize()
 * before creating ChatService, or call ensureSchema() after construction.
 */
export class ChatService {
  private readonly db: Database.Database;

  constructor(dbManager: DatabaseManager) {
    this.db = dbManager.getDb();
  }

  // -----------------------------------------------------------------------
  // Schema bootstrap (useful for tests with in-memory DB)
  // -----------------------------------------------------------------------

  /**
   * Ensure the chats/chat_messages tables exist.
   * Runs migrations if not yet applied. Safe to call multiple times.
   */
  ensureSchema(): void {
    runMigrations(this.db);
  }

  // -----------------------------------------------------------------------
  // Chat CRUD
  // -----------------------------------------------------------------------

  /**
   * Create a new chat and persist it to SQLite.
   *
   * @param input - Chat creation parameters
   * @returns The generated chat ID (UUID)
   */
  createChat(input: CreateChatInput): string {
    const id = randomUUID();
    const tags = JSON.stringify(input.tags ?? []);
    const channelMetadata = JSON.stringify(input.channelMetadata ?? {});

    this.db
      .prepare(
        `INSERT INTO chats (id, name, description, tags, icon, color, channel, channel_metadata, is_active)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      )
      .run(
        id,
        input.name,
        input.description ?? "",
        tags,
        input.icon ?? "",
        input.color ?? "",
        input.channel ?? "cli",
        channelMetadata,
      );

    return id;
  }

  /**
   * Get a chat by its ID.
   *
   * @param id - Chat UUID
   * @returns The chat entity, or null if not found
   */
  getChat(id: string): Chat | null {
    const row = this.db
      .prepare("SELECT * FROM chats WHERE id = ?")
      .get(id) as Record<string, unknown> | undefined;

    return row !== undefined ? rowToChat(row) : null;
  }

  /**
   * Update an existing chat with the provided fields.
   * Only fields present in `updates` are modified.
   * The `updated_at` timestamp is refreshed automatically.
   *
   * @param id - Chat UUID
   * @param updates - Fields to update
   * @throws {Error} if the chat does not exist
   */
  updateChat(id: string, updates: UpdateChatInput): void {
    // Verify chat exists first
    const existing = this.getChat(id);
    if (existing === null) {
      throw new Error(`Chat not found: ${id}`);
    }

    const setClauses: string[] = [];
    const values: unknown[] = [];

    if (updates.name !== undefined) {
      setClauses.push("name = ?");
      values.push(updates.name);
    }
    if (updates.description !== undefined) {
      setClauses.push("description = ?");
      values.push(updates.description);
    }
    if (updates.tags !== undefined) {
      setClauses.push("tags = ?");
      values.push(JSON.stringify(updates.tags));
    }
    if (updates.icon !== undefined) {
      setClauses.push("icon = ?");
      values.push(updates.icon);
    }
    if (updates.color !== undefined) {
      setClauses.push("color = ?");
      values.push(updates.color);
    }
    if (updates.channel !== undefined) {
      setClauses.push("channel = ?");
      values.push(updates.channel);
    }
    if (updates.channelMetadata !== undefined) {
      setClauses.push("channel_metadata = ?");
      values.push(JSON.stringify(updates.channelMetadata));
    }
    if (updates.isActive !== undefined) {
      setClauses.push("is_active = ?");
      values.push(updates.isActive ? 1 : 0);
    }

    if (setClauses.length === 0) {
      return;
    }

    setClauses.push("updated_at = datetime('now')");
    values.push(id);

    const sql = `UPDATE chats SET ${setClauses.join(", ")} WHERE id = ?`;
    this.db.prepare(sql).run(...values);
  }

  /**
   * Delete a chat and all its messages (CASCADE).
   *
   * @param id - Chat UUID
   */
  deleteChat(id: string): void {
    this.db.prepare("DELETE FROM chats WHERE id = ?").run(id);
  }

  /**
   * List chats with optional filtering.
   *
   * @param filter - Optional filter criteria
   * @returns Array of chat entities ordered by created_at DESC
   */
  listChats(filter?: ChatFilter): Chat[] {
    const conditions: string[] = [];
    const values: unknown[] = [];

    if (filter?.activeOnly === true) {
      conditions.push("is_active = 1");
    }
    if (filter?.channel !== undefined) {
      conditions.push("channel = ?");
      values.push(filter.channel);
    }
    if (filter?.tags !== undefined && filter.tags.length > 0) {
      // JSON array containment: tags stores a JSON array.
      // For each tag, check if it appears in the JSON.
      // Using json_each for proper JSON array search.
      const placeholders = filter.tags.map(() => "?").join(", ");
      conditions.push(
        `id IN (
          SELECT DISTINCT chat_id FROM (
            SELECT c.id AS chat_id
            FROM chats c, json_each(c.tags) AS jt
            WHERE jt.value IN (${placeholders})
          )
        )`,
      );
      values.push(...filter.tags);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const sql = `SELECT * FROM chats ${where} ORDER BY created_at DESC`;

    const rows = this.db.prepare(sql).all(...values) as Record<string, unknown>[];
    return rows.map(rowToChat);
  }

  // -----------------------------------------------------------------------
  // Message operations
  // -----------------------------------------------------------------------

  /**
   * Add a message to a chat.
   *
   * @param chatId - Target chat UUID
   * @param message - Message content
   * @returns The generated message ID (UUID)
   */
  addMessage(chatId: string, message: AddMessageInput): string {
    const id = randomUUID();
    const toolCalls = message.toolCalls
      ? JSON.stringify(message.toolCalls)
      : null;
    const metadata = message.metadata
      ? JSON.stringify(message.metadata)
      : "{}";

    this.db
      .prepare(
        `INSERT INTO chat_messages (id, chat_id, role, content, tool_calls, metadata)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(id, chatId, message.role, message.content, toolCalls, metadata);

    return id;
  }

  /**
   * Get messages for a chat with pagination.
   * Messages are ordered by created_at ASC (oldest first).
   *
   * @param chatId - Target chat UUID
   * @param limit - Maximum messages to return. Default: 50.
   * @param offset - Number of messages to skip. Default: 0.
   * @returns Array of chat messages
   */
  getMessages(chatId: string, limit: number = 50, offset: number = 0): ChatMessage[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM chat_messages WHERE chat_id = ? ORDER BY created_at ASC LIMIT ? OFFSET ?`,
      )
      .all(chatId, limit, offset) as Record<string, unknown>[];

    return rows.map(rowToChatMessage);
  }

  // -----------------------------------------------------------------------
  // Counting
  // -----------------------------------------------------------------------

  /**
   * Get the number of currently active chats.
   *
   * @returns Count of chats where is_active = 1
   */
  getActiveCount(): number {
    const row = this.db
      .prepare("SELECT COUNT(*) as cnt FROM chats WHERE is_active = 1")
      .get() as { cnt: number };

    return row["cnt"];
  }
}
