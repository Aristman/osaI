/**
 * Integration Test: Chat Lifecycle
 *
 * T-004 / F-013
 *
 * Tests the complete chat lifecycle through ChatService:
 *   Create -> Switch (context isolation) -> Archive -> Delete
 *
 * Verifies that the ChatService correctly:
 * - Creates chats with all fields
 * - Retrieves chats by ID
 * - Lists chats with filtering
 * - Updates chat fields
 * - Archives chats (isActive = false)
 * - Deletes chats with CASCADE (messages removed)
 * - Maintains context isolation between chats
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createTestFixture, TEST_IDS } from './setup.js';
import { DatabaseManager } from '../../packages/shared/src/database.js';
import type { Chat, ChatMessage } from '../../packages/gateway/src/chat/types.js';

describe('Integration: Chat Lifecycle (Create -> Switch -> Archive -> Delete)', () => {
  let fixture: ReturnType<typeof createTestFixture>;
  let dbManager: DatabaseManager;

  beforeEach(() => {
    dbManager = new DatabaseManager({ dbPath: ':memory:' });
    dbManager.initialize();
    fixture = createTestFixture(dbManager);
  });

  afterEach(() => {
    dbManager.close();
  });

  // ---------------------------------------------------------------------------
  // T-004: create -> switch -> archive -> delete chat via Gateway
  // ---------------------------------------------------------------------------

  it('creates a chat with all fields and persists to SQLite', () => {
    const chatId = fixture.chatService.createChat({
      name: 'Work Project',
      description: 'Discussion about project milestones',
      tags: ['work', 'project'],
      icon: 'briefcase',
      color: 'blue',
      channel: 'cli',
      channelMetadata: { sessionId: 'abc123' },
    });

    expect(chatId).toBeDefined();
    expect(chatId.length).toBeGreaterThan(0);

    const chat = fixture.chatService.getChat(chatId);
    expect(chat).not.toBeNull();
    expect(chat!.name).toBe('Work Project');
    expect(chat!.description).toBe('Discussion about project milestones');
    expect(chat!.tags).toEqual(['work', 'project']);
    expect(chat!.icon).toBe('briefcase');
    expect(chat!.color).toBe('blue');
    expect(chat!.channel).toBe('cli');
    expect(chat!.channelMetadata).toEqual({ sessionId: 'abc123' });
    expect(chat!.isActive).toBe(true);
    expect(chat!.createdAt).toBeDefined();
    expect(chat!.updatedAt).toBeDefined();
  });

  it('creates a chat with minimal fields using defaults', () => {
    const chatId = fixture.chatService.createChat({
      name: 'Minimal Chat',
    });

    const chat = fixture.chatService.getChat(chatId)!;
    expect(chat.name).toBe('Minimal Chat');
    expect(chat.description).toBe('');
    expect(chat.tags).toEqual([]);
    expect(chat.icon).toBe('');
    expect(chat.color).toBe('');
    expect(chat.channel).toBe('cli');
    expect(chat.channelMetadata).toEqual({});
    expect(chat.isActive).toBe(true);
  });

  it('updates individual chat fields', () => {
    const chatId = fixture.chatService.createChat({ name: 'Original Name' });

    fixture.chatService.updateChat(chatId, { name: 'Updated Name' });

    const chat = fixture.chatService.getChat(chatId)!;
    expect(chat.name).toBe('Updated Name');

    // Other fields should remain unchanged
    expect(chat.description).toBe('');
    expect(chat.tags).toEqual([]);
  });

  it('updates multiple fields in one call', () => {
    const chatId = fixture.chatService.createChat({ name: 'Test' });

    fixture.chatService.updateChat(chatId, {
      name: 'Renamed',
      description: 'New description',
      tags: ['tag1', 'tag2'],
      color: 'green',
    });

    const chat = fixture.chatService.getChat(chatId)!;
    expect(chat.name).toBe('Renamed');
    expect(chat.description).toBe('New description');
    expect(chat.tags).toEqual(['tag1', 'tag2']);
    expect(chat.color).toBe('green');
  });

  it('lists all chats and returns expected count', () => {
    const id1 = fixture.chatService.createChat({ name: 'Chat A' });
    const id2 = fixture.chatService.createChat({ name: 'Chat B' });
    const id3 = fixture.chatService.createChat({ name: 'Chat C' });

    const chats = fixture.chatService.listChats();

    expect(chats.length).toBe(3);
    // All three chats present
    const names = chats.map((c) => c.name);
    expect(names).toContain('Chat A');
    expect(names).toContain('Chat B');
    expect(names).toContain('Chat C');
  });

  it('lists only active chats when filtered', () => {
    const id1 = fixture.chatService.createChat({ name: 'Active Chat' });
    const id2 = fixture.chatService.createChat({ name: 'Archived Chat' });

    // Archive the second chat
    fixture.chatService.updateChat(id2, { isActive: false });

    const activeChats = fixture.chatService.listChats({ activeOnly: true });

    expect(activeChats.length).toBe(1);
    expect(activeChats[0]!.name).toBe('Active Chat');

    // Without filter, should return both
    const allChats = fixture.chatService.listChats();
    expect(allChats.length).toBe(2);
  });

  it('lists chats filtered by channel', () => {
    fixture.chatService.createChat({ name: 'CLI Chat', channel: 'cli' });
    fixture.chatService.createChat({ name: 'TG Chat', channel: 'telegram' });
    fixture.chatService.createChat({ name: 'Another CLI Chat', channel: 'cli' });

    const cliChats = fixture.chatService.listChats({ channel: 'cli' });
    expect(cliChats.length).toBe(2);
    expect(cliChats.every((c) => c.channel === 'cli')).toBe(true);

    const tgChats = fixture.chatService.listChats({ channel: 'telegram' });
    expect(tgChats.length).toBe(1);
    expect(tgChats[0]!.channel).toBe('telegram');
  });

  it('archives a chat (sets isActive to false)', () => {
    const chatId = fixture.chatService.createChat({ name: 'To Archive' });

    let chat = fixture.chatService.getChat(chatId)!;
    expect(chat.isActive).toBe(true);

    fixture.chatService.updateChat(chatId, { isActive: false });

    chat = fixture.chatService.getChat(chatId)!;
    expect(chat.isActive).toBe(false);
  });

  it('deletes a chat and cascades to messages', () => {
    const chatId = fixture.chatService.createChat({ name: 'To Delete' });

    // Add messages
    fixture.chatService.addMessage(chatId, { role: 'user', content: 'Hello' });
    fixture.chatService.addMessage(chatId, { role: 'assistant', content: 'Hi there' });

    // Verify messages exist
    const messages = fixture.chatService.getMessages(chatId);
    expect(messages.length).toBe(2);

    // Delete the chat
    fixture.chatService.deleteChat(chatId);

    // Chat should be gone
    expect(fixture.chatService.getChat(chatId)).toBeNull();

    // Messages should also be gone (CASCADE)
    const deletedMessages = fixture.chatService.getMessages(chatId);
    expect(deletedMessages.length).toBe(0);
  });

  it('supports adding and retrieving messages', () => {
    const chatId = fixture.chatService.createChat({ name: 'Message Chat' });

    const msgId1 = fixture.chatService.addMessage(chatId, {
      role: 'user',
      content: 'First message',
    });
    const msgId2 = fixture.chatService.addMessage(chatId, {
      role: 'assistant',
      content: 'Second message',
    });

    expect(msgId1).toBeDefined();
    expect(msgId2).toBeDefined();

    const messages = fixture.chatService.getMessages(chatId);
    expect(messages.length).toBe(2);
    expect(messages[0]!.content).toBe('First message');
    expect(messages[1]!.content).toBe('Second message');
  });

  it('maintains context isolation between chats', () => {
    // Create two separate chats
    const chatA = fixture.chatService.createChat({ name: 'Chat A' });
    const chatB = fixture.chatService.createChat({ name: 'Chat B' });

    // Add messages to each chat
    fixture.chatService.addMessage(chatA, { role: 'user', content: 'Message for A' });
    fixture.chatService.addMessage(chatA, { role: 'assistant', content: 'Response for A' });

    fixture.chatService.addMessage(chatB, { role: 'user', content: 'Message for B' });
    fixture.chatService.addMessage(chatB, { role: 'assistant', content: 'Response for B' });

    // Each chat should only see its own messages
    const messagesA = fixture.chatService.getMessages(chatA);
    const messagesB = fixture.chatService.getMessages(chatB);

    expect(messagesA.length).toBe(2);
    expect(messagesB.length).toBe(2);

    expect(messagesA.every((m) => m.content.includes('A'))).toBe(true);
    expect(messagesB.every((m) => m.content.includes('B'))).toBe(true);
  });

  it('supports message pagination with limit and offset', () => {
    const chatId = fixture.chatService.createChat({ name: 'Pagination Chat' });

    // Add 10 messages
    for (let i = 0; i < 10; i++) {
      fixture.chatService.addMessage(chatId, { role: 'user', content: `Message ${i}` });
    }

    // Get first page (5 messages)
    const page1 = fixture.chatService.getMessages(chatId, 5, 0);
    expect(page1.length).toBe(5);
    expect(page1[0]!.content).toBe('Message 0');

    // Get second page (5 messages)
    const page2 = fixture.chatService.getMessages(chatId, 5, 5);
    expect(page2.length).toBe(5);
    expect(page2[0]!.content).toBe('Message 5');

    // Get with limit 3
    const page3 = fixture.chatService.getMessages(chatId, 3, 0);
    expect(page3.length).toBe(3);
  });

  it('returns correct active chat count', () => {
    fixture.chatService.createChat({ name: 'Active 1' });
    fixture.chatService.createChat({ name: 'Active 2' });

    const id3 = fixture.chatService.createChat({ name: 'To Archive' });
    fixture.chatService.updateChat(id3, { isActive: false });

    expect(fixture.chatService.getActiveCount()).toBe(2);
  });

  it('persists tool calls in assistant messages', () => {
    const chatId = fixture.chatService.createChat({ name: 'Tool Chat' });

    fixture.chatService.addMessage(chatId, {
      role: 'assistant',
      content: '',
      toolCalls: [
        { id: 'tc-1', name: 'read_file', arguments: '{"path":"/tmp/test.txt"}' },
        { id: 'tc-2', name: 'list_dir', arguments: '{"path":"/tmp"}' },
      ],
    });

    const messages = fixture.chatService.getMessages(chatId);
    expect(messages.length).toBe(1);
    expect(messages[0]!.toolCalls).toBeDefined();
    expect(messages[0]!.toolCalls!.length).toBe(2);
    expect(messages[0]!.toolCalls![0]!.name).toBe('read_file');
    expect(messages[0]!.toolCalls![1]!.name).toBe('list_dir');
  });

  it('throws when updating a non-existent chat', () => {
    expect(() => {
      fixture.chatService.updateChat('non-existent-id', { name: 'New Name' });
    }).toThrow('Chat not found');
  });

  it('persists metadata in messages', () => {
    const chatId = fixture.chatService.createChat({ name: 'Metadata Chat' });

    fixture.chatService.addMessage(chatId, {
      role: 'assistant',
      content: 'Response',
      metadata: { traceId: 'trace-123', provider: 'z-ai', model: 'glm-5' },
    });

    const messages = fixture.chatService.getMessages(chatId);
    expect(messages[0]!.metadata).toEqual({
      traceId: 'trace-123',
      provider: 'z-ai',
      model: 'glm-5',
    });
  });
});
