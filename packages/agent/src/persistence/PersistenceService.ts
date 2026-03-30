/**
 * @osai/agent -- PersistenceService (T-006)
 *
 * Service for persisting chat messages to SQLite (chat_messages table).
 * Uses better-sqlite3 synchronous API (db.prepare().run()).
 * All queries are parameterized to prevent SQL injection.
 *
 * Dependencies:
 *   - DatabaseManager (from @osai/shared) or raw better-sqlite3 Database
 *     injected via constructor.
 */

import type Database from 'better-sqlite3';
import type { ToolCall } from '@osai/providers';

// ---------------------------------------------------------------------------
// ChatMessage (persistence format)
// ---------------------------------------------------------------------------

/**
 * Chat message format returned by PersistenceService.
 * Aligns with roadmap spec: { role, content, tool_calls?, tool_call_id? }.
 */
export interface ChatMessage {
  role: string;
  content: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

// ---------------------------------------------------------------------------
// PersistenceService
// ---------------------------------------------------------------------------

/**
 * Persists conversation messages (user, assistant, tool) to the chat_messages
 * SQLite table. Each record includes chat_id, session_id, and trace_id
 * in the metadata JSON column.
 *
 * All SQL operations are synchronous (better-sqlite3 design).
 */
export class PersistenceService {
  private readonly _db: Database.Database;

  // Prepared statements (lazy-initialized)
  private _insertStmt: Database.Statement<[string, string, string, string, string | null, string]> | null = null;

  /**
   * @param db - An initialized better-sqlite3 Database instance.
   *             Can be obtained from DatabaseManager.getDb().
   */
  constructor(db: Database.Database) {
    this._db = db;
  }

  // -----------------------------------------------------------------------
  // saveUserMessage
  // -----------------------------------------------------------------------

  /**
   * Save a user message to the chat_messages table.
   *
   * @param chatId    - The chat identifier.
   * @param sessionId - The session identifier.
   * @param traceId   - The trace identifier for correlation.
   * @param content   - The user message text.
   */
  saveUserMessage(
    chatId: string,
    sessionId: string,
    traceId: string,
    content: string,
  ): void {
    const id = this._generateUuid();
    const metadata = JSON.stringify({
      session_id: sessionId,
      trace_id: traceId,
    });

    this._getInsertStmt().run(id, chatId, 'user', content, null, metadata);
  }

  // -----------------------------------------------------------------------
  // saveAssistantMessage
  // -----------------------------------------------------------------------

  /**
   * Save an assistant message to the chat_messages table.
   *
   * @param chatId    - The chat identifier.
   * @param sessionId - The session identifier.
   * @param traceId   - The trace identifier for correlation.
   * @param content   - The assistant response text.
   * @param toolCalls - Optional tool calls requested by the LLM.
   */
  saveAssistantMessage(
    chatId: string,
    sessionId: string,
    traceId: string,
    content: string,
    toolCalls?: readonly ToolCall[],
  ): void {
    const id = this._generateUuid();
    const metadata = JSON.stringify({
      session_id: sessionId,
      trace_id: traceId,
    });
    const toolCallsJson = toolCalls !== undefined && toolCalls.length > 0
      ? JSON.stringify(toolCalls)
      : null;

    this._getInsertStmt().run(id, chatId, 'assistant', content, toolCallsJson, metadata);
  }

  // -----------------------------------------------------------------------
  // saveToolResult
  // -----------------------------------------------------------------------

  /**
   * Save a tool execution result to the chat_messages table.
   *
   * @param chatId     - The chat identifier.
   * @param sessionId  - The session identifier.
   * @param traceId    - The trace identifier for correlation.
   * @param toolCallId - The ID of the tool call this result corresponds to.
   * @param content    - The tool execution result text.
   */
  saveToolResult(
    chatId: string,
    sessionId: string,
    traceId: string,
    toolCallId: string,
    content: string,
  ): void {
    const id = this._generateUuid();
    const metadata = JSON.stringify({
      session_id: sessionId,
      trace_id: traceId,
      tool_call_id: toolCallId,
    });

    this._getInsertStmt().run(id, chatId, 'tool', content, null, metadata);
  }

  // -----------------------------------------------------------------------
  // getChatHistory
  // -----------------------------------------------------------------------

  /**
   * Retrieve chat message history for a given chat.
   *
   * Messages are ordered by created_at ASC (chronological order).
   *
   * @param chatId - The chat identifier.
   * @param limit  - Maximum number of recent messages to return.
   *                If omitted, returns all messages.
   * @returns Array of ChatMessage objects.
   */
  getChatHistory(chatId: string, limit?: number): ChatMessage[] {
    let rows: Array<Record<string, unknown>>;

    if (limit !== undefined) {
      // Get the N most recent messages, then flip order to ASC.
      // rowid provides deterministic ordering when created_at is identical.
      rows = this._db
        .prepare(
          `SELECT role, content, tool_calls, metadata
           FROM chat_messages
           WHERE chat_id = ?
           ORDER BY rowid DESC
           LIMIT ?`,
        )
        .all(chatId, limit) as Array<Record<string, unknown>>;

      // Reverse to chronological order
      rows = rows.reverse();
    } else {
      rows = this._db
        .prepare(
          `SELECT role, content, tool_calls, metadata
           FROM chat_messages
           WHERE chat_id = ?
           ORDER BY created_at ASC`,
        )
        .all(chatId) as Array<Record<string, unknown>>;
    }

    return rows.map((row) => this._rowToChatMessage(row));
  }

  // -----------------------------------------------------------------------
  // Internal: prepared statements
  // -----------------------------------------------------------------------

  /**
   * Get or create the prepared INSERT statement.
   * Using prepared statements for performance and SQL injection prevention.
   */
  private _getInsertStmt(): Database.Statement<
    [string, string, string, string, string | null, string]
  > {
    if (this._insertStmt === null) {
      this._insertStmt = this._db.prepare(
        `INSERT INTO chat_messages (id, chat_id, role, content, tool_calls, metadata)
         VALUES (?, ?, ?, ?, ?, ?)`,
      );
    }
    return this._insertStmt;
  }

  // -----------------------------------------------------------------------
  // Internal: row mapping
  // -----------------------------------------------------------------------

  /**
   * Convert a database row to a ChatMessage object.
   */
  private _rowToChatMessage(row: Record<string, unknown>): ChatMessage {
    const message: ChatMessage = {
      role: row['role'] as string,
      content: row['content'] as string,
    };

    // Parse tool_calls JSON if present
    const toolCallsRaw = row['tool_calls'];
    if (toolCallsRaw !== null && toolCallsRaw !== undefined) {
      message.tool_calls = JSON.parse(toolCallsRaw as string) as ToolCall[];
    }

    // Extract tool_call_id from metadata for role='tool' messages
    const metadataRaw = row['metadata'];
    if (metadataRaw !== null && metadataRaw !== undefined) {
      const metadata = JSON.parse(metadataRaw as string) as Record<string, unknown>;
      if (metadata['tool_call_id'] !== undefined) {
        message.tool_call_id = metadata['tool_call_id'] as string;
      }
    }

    return message;
  }

  // -----------------------------------------------------------------------
  // Internal: UUID generation
  // -----------------------------------------------------------------------

  /**
   * Generate a UUID v4 string.
   * Uses crypto.randomUUID() available in Node.js 19+.
   */
  private _generateUuid(): string {
    return crypto.randomUUID();
  }
}
