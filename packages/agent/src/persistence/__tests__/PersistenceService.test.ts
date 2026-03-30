/**
 * Unit tests for PersistenceService
 *
 * Covers: T-006 Streaming + Persistence acceptance criteria
 *   - TC-006-3: PersistenceService saves user message
 *   - TC-006-4: PersistenceService saves assistant response
 *   - TC-006-5: PersistenceService saves tool calls
 *   - TC-006-6: All records contain chat_id + trace_id
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { PersistenceService } from '../PersistenceService.js';
import type { ChatMessage, ToolCall } from '@osai/providers';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Create an in-memory SQLite DB with chat_messages table
 * (mimics schema from packages/shared/src/schema.ts)
 */
function createInMemoryDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  // Create tables (chats is parent, chat_messages references it)
  db.exec(`
    CREATE TABLE IF NOT EXISTS chats (
      id              TEXT PRIMARY KEY,
      name            TEXT NOT NULL,
      description     TEXT DEFAULT '',
      tags            TEXT DEFAULT '[]',
      icon            TEXT DEFAULT '',
      color           TEXT DEFAULT '',
      channel         TEXT NOT NULL DEFAULT 'cli',
      channel_metadata TEXT DEFAULT '{}',
      is_active       INTEGER NOT NULL DEFAULT 1,
      created_at      TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS chat_messages (
      id              TEXT PRIMARY KEY,
      chat_id         TEXT NOT NULL,
      role            TEXT NOT NULL CHECK(role IN ('system', 'user', 'assistant', 'tool')),
      content         TEXT NOT NULL DEFAULT '',
      tool_calls      TEXT DEFAULT NULL,
      metadata        TEXT DEFAULT '{}',
      created_at      TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE CASCADE
    );
  `);

  return db;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PersistenceService', () => {
  let db: Database.Database;
  let service: PersistenceService;

  beforeEach(() => {
    db = createInMemoryDb();
    service = new PersistenceService(db);
  });

  afterEach(() => {
    db.close();
  });

  // -----------------------------------------------------------------------
  // setupChat -- internal helper to satisfy FK constraint
  // -----------------------------------------------------------------------

  function setupChat(chatId: string): void {
    db.prepare('INSERT INTO chats (id, name) VALUES (?, ?)').run(chatId, 'Test Chat');
  }

  // -----------------------------------------------------------------------
  // TC-006-3: saveUserMessage
  // -----------------------------------------------------------------------

  describe('saveUserMessage', () => {
    it('TC-006-3: should save user message to SQLite', () => {
      setupChat('chat-001');

      service.saveUserMessage('chat-001', 'session-001', 'trace-001', 'Hello agent');

      const rows = db
        .prepare('SELECT * FROM chat_messages WHERE chat_id = ? AND role = ?')
        .all('chat-001', 'user') as Array<Record<string, unknown>>;

      expect(rows).toHaveLength(1);
      expect(rows[0]!['content']).toBe('Hello agent');
    });

    it('should save message with generated UUID id', () => {
      setupChat('chat-001');

      service.saveUserMessage('chat-001', 'session-001', 'trace-001', 'Hello');

      const row = db
        .prepare('SELECT id FROM chat_messages WHERE role = ? LIMIT 1')
        .get('user') as Record<string, unknown> | undefined;

      expect(row).toBeDefined();
      // UUID format: 8-4-4-4-12
      const id = row!['id'] as string;
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    });

    it('TC-006-6: should store chat_id in metadata', () => {
      setupChat('chat-001');

      service.saveUserMessage('chat-001', 'session-001', 'trace-001', 'Hello');

      const row = db
        .prepare("SELECT metadata FROM chat_messages WHERE role = 'user' LIMIT 1")
        .get() as Record<string, unknown> | undefined;

      expect(row).toBeDefined();
      const metadata = JSON.parse(row!['metadata'] as string);
      expect(metadata.session_id).toBe('session-001');
      expect(metadata.trace_id).toBe('trace-001');
    });
  });

  // -----------------------------------------------------------------------
  // TC-006-4: saveAssistantMessage
  // -----------------------------------------------------------------------

  describe('saveAssistantMessage', () => {
    it('TC-006-4: should save assistant response to SQLite', () => {
      setupChat('chat-001');

      service.saveAssistantMessage('chat-001', 'session-001', 'trace-001', 'Hi there!');

      const rows = db
        .prepare("SELECT * FROM chat_messages WHERE chat_id = ? AND role = 'assistant'")
        .all('chat-001') as Array<Record<string, unknown>>;

      expect(rows).toHaveLength(1);
      expect(rows[0]!['content']).toBe('Hi there!');
    });

    it('TC-006-6: should store trace_id in metadata', () => {
      setupChat('chat-001');

      service.saveAssistantMessage('chat-001', 'session-001', 'trace-001', 'Response');

      const row = db
        .prepare("SELECT metadata FROM chat_messages WHERE role = 'assistant' LIMIT 1")
        .get() as Record<string, unknown> | undefined;

      expect(row).toBeDefined();
      const metadata = JSON.parse(row!['metadata'] as string);
      expect(metadata.trace_id).toBe('trace-001');
    });

    it('should work without tool calls', () => {
      setupChat('chat-001');

      service.saveAssistantMessage('chat-001', 'session-001', 'trace-001', 'Simple response');

      const row = db
        .prepare("SELECT tool_calls FROM chat_messages WHERE role = 'assistant' LIMIT 1")
        .get() as Record<string, unknown> | undefined;

      expect(row).toBeDefined();
      expect(row!['tool_calls']).toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // TC-006-5: tool calls storage
  // -----------------------------------------------------------------------

  describe('saveAssistantMessage with toolCalls', () => {
    it('TC-006-5: should save tool calls in tool_calls column', () => {
      setupChat('chat-001');

      const toolCalls: ToolCall[] = [
        {
          id: 'tc-001',
          name: 'read_file',
          arguments: '{"path": "/test.txt"}',
        },
      ];

      service.saveAssistantMessage(
        'chat-001',
        'session-001',
        'trace-001',
        '',
        toolCalls,
      );

      const row = db
        .prepare("SELECT tool_calls FROM chat_messages WHERE role = 'assistant' LIMIT 1")
        .get() as Record<string, unknown> | undefined;

      expect(row).toBeDefined();
      const parsed = JSON.parse(row!['tool_calls'] as string);
      expect(parsed).toHaveLength(1);
      expect(parsed[0].id).toBe('tc-001');
      expect(parsed[0].name).toBe('read_file');
      expect(parsed[0].arguments).toBe('{"path": "/test.txt"}');
    });

    it('should save multiple tool calls', () => {
      setupChat('chat-001');

      const toolCalls: ToolCall[] = [
        { id: 'tc-001', name: 'read_file', arguments: '{}' },
        { id: 'tc-002', name: 'write_file', arguments: '{}' },
      ];

      service.saveAssistantMessage('chat-001', 'session-001', 'trace-001', '', toolCalls);

      const row = db
        .prepare("SELECT tool_calls FROM chat_messages WHERE role = 'assistant' LIMIT 1")
        .get() as Record<string, unknown> | undefined;

      const parsed = JSON.parse(row!['tool_calls'] as string);
      expect(parsed).toHaveLength(2);
    });
  });

  // -----------------------------------------------------------------------
  // saveToolResult
  // -----------------------------------------------------------------------

  describe('saveToolResult', () => {
    it('should save tool result with role=tool', () => {
      setupChat('chat-001');

      service.saveToolResult('chat-001', 'session-001', 'trace-001', 'tc-001', 'File contents here');

      const rows = db
        .prepare("SELECT * FROM chat_messages WHERE role = 'tool' AND chat_id = ?")
        .all('chat-001') as Array<Record<string, unknown>>;

      expect(rows).toHaveLength(1);
      expect(rows[0]!['content']).toBe('File contents here');
    });

    it('should store tool_call_id in metadata', () => {
      setupChat('chat-001');

      service.saveToolResult('chat-001', 'session-001', 'trace-001', 'tc-001', 'Result');

      const row = db
        .prepare("SELECT metadata FROM chat_messages WHERE role = 'tool' LIMIT 1")
        .get() as Record<string, unknown> | undefined;

      expect(row).toBeDefined();
      const metadata = JSON.parse(row!['metadata'] as string);
      expect(metadata.tool_call_id).toBe('tc-001');
      expect(metadata.trace_id).toBe('trace-001');
      expect(metadata.session_id).toBe('session-001');
    });
  });

  // -----------------------------------------------------------------------
  // getChatHistory
  // -----------------------------------------------------------------------

  describe('getChatHistory', () => {
    it('should return chat messages ordered by created_at', () => {
      setupChat('chat-001');

      service.saveUserMessage('chat-001', 's1', 't1', 'User message');
      service.saveAssistantMessage('chat-001', 's1', 't1', 'Assistant message');

      const history: ChatMessage[] = service.getChatHistory('chat-001');

      expect(history).toHaveLength(2);
      expect(history[0]!.role).toBe('user');
      expect(history[0]!.content).toBe('User message');
      expect(history[1]!.role).toBe('assistant');
      expect(history[1]!.content).toBe('Assistant message');
    });

    it('should respect limit parameter', () => {
      setupChat('chat-001');

      service.saveUserMessage('chat-001', 's1', 't1', 'Msg 1');
      service.saveAssistantMessage('chat-001', 's1', 't1', 'Msg 2');
      service.saveUserMessage('chat-001', 's1', 't1', 'Msg 3');

      const history: ChatMessage[] = service.getChatHistory('chat-001', 2);

      expect(history).toHaveLength(2);
      // Should return the most recent 2
      expect(history[0]!.content).toBe('Msg 2');
      expect(history[1]!.content).toBe('Msg 3');
    });

    it('should return tool_calls for assistant messages', () => {
      setupChat('chat-001');

      const toolCalls: ToolCall[] = [
        { id: 'tc-001', name: 'read_file', arguments: '{}' },
      ];

      service.saveAssistantMessage('chat-001', 's1', 't1', '', toolCalls);

      const history: ChatMessage[] = service.getChatHistory('chat-001');

      expect(history).toHaveLength(1);
      expect(history[0]!.role).toBe('assistant');
      expect(history[0]!.tool_calls).toEqual(toolCalls);
    });

    it('should return tool_call_id for tool messages', () => {
      setupChat('chat-001');

      service.saveToolResult('chat-001', 's1', 't1', 'tc-001', 'Tool result');

      const history: ChatMessage[] = service.getChatHistory('chat-001');

      expect(history).toHaveLength(1);
      expect(history[0]!.tool_call_id).toBe('tc-001');
    });

    it('should return empty array for chat with no messages', () => {
      setupChat('chat-001');

      const history: ChatMessage[] = service.getChatHistory('chat-001');

      expect(history).toEqual([]);
    });

    it('should only return messages for the specified chat_id', () => {
      setupChat('chat-001');
      setupChat('chat-002');

      service.saveUserMessage('chat-001', 's1', 't1', 'Chat 1 message');
      service.saveUserMessage('chat-002', 's1', 't1', 'Chat 2 message');

      const history1: ChatMessage[] = service.getChatHistory('chat-001');
      const history2: ChatMessage[] = service.getChatHistory('chat-002');

      expect(history1).toHaveLength(1);
      expect(history1[0]!.content).toBe('Chat 1 message');
      expect(history2).toHaveLength(1);
      expect(history2[0]!.content).toBe('Chat 2 message');
    });

    it('should default to no limit (return all messages)', () => {
      setupChat('chat-001');

      for (let i = 0; i < 10; i++) {
        service.saveUserMessage('chat-001', 's1', `t${i}`, `Msg ${i}`);
        service.saveAssistantMessage('chat-001', 's1', `t${i}`, `Reply ${i}`);
      }

      const history: ChatMessage[] = service.getChatHistory('chat-001');

      expect(history).toHaveLength(20);
    });
  });
});
