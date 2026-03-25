/**
 * T002-UNIT-003: Message store updates on block message
 * Tests for messages store.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import type { BlockMessage, ToolStreamMessage } from '../types';

const mockBlockMessage: BlockMessage = {
  type: 'block',
  sessionId: 's1',
  blockId: 'b1',
  blockType: 'text',
  content: { text: 'Hello world' },
  timestamp: '2026-01-01T00:00:00Z'
};

const mockToolStreamMessage: ToolStreamMessage = {
  type: 'tool_stream',
  sessionId: 's1',
  toolCallId: 'tc1',
  toolName: 'shell',
  status: 'started',
  data: { command: 'ls' },
  timestamp: '2026-01-01T00:00:00Z'
};

describe('messagesStore', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('initial state has empty messages map', async () => {
    const { messagesStore } = await import('../stores/messages');
    const state = get(messagesStore);
    expect(state.messages).toEqual({});
    expect(state.messagesBySession).toEqual({});
  });

  it('T002-UNIT-003: adds block message to store', async () => {
    const { messagesStore, addBlockMessage } = await import('../stores/messages');
    addBlockMessage(mockBlockMessage);
    const state = get(messagesStore);
    const msg = state.messages[mockBlockMessage.blockId];
    expect(msg).toBeDefined();
    expect(msg!.type).toBe('block');
    expect(msg!.id).toBe('b1');
    expect((msg!.data as { blockType: string }).blockType).toBe('text');
  });

  it('T002-UNIT-003: adds message to session messages list', async () => {
    const { messagesStore, addBlockMessage } = await import('../stores/messages');
    addBlockMessage(mockBlockMessage);
    const state = get(messagesStore);
    const sessionMsgs = state.messagesBySession['s1'];
    expect(sessionMsgs).toHaveLength(1);
    expect(sessionMsgs![0]).toBe('b1');
  });

  it('updates tool stream message in place', async () => {
    const { messagesStore, addToolStreamMessage } = await import('../stores/messages');
    addToolStreamMessage(mockToolStreamMessage);
    const progressMsg: ToolStreamMessage = {
      ...mockToolStreamMessage,
      status: 'progress',
      data: { output: 'file1.txt\nfile2.txt' }
    };
    addToolStreamMessage(progressMsg);
    const state = get(messagesStore);
    // Tool stream should update, not create duplicate
    const sessionMessages = state.messagesBySession['s1'];
    expect(sessionMessages?.length).toBe(1);
    const msg = state.messages['tc1'];
    expect(msg).toBeDefined();
    expect((msg!.data as { status: string }).status).toBe('progress');
  });

  it('returns session messages from derived store', async () => {
    const { sessionMessages, addBlockMessage } = await import('../stores/messages');
    addBlockMessage(mockBlockMessage);
    const msgs = get(sessionMessages('s1'));
    expect(msgs).toHaveLength(1);
  });

  it('returns empty array for non-existent session', async () => {
    const { sessionMessages } = await import('../stores/messages');
    const msgs = get(sessionMessages('nonexistent'));
    expect(msgs).toEqual([]);
  });

  it('can clear messages for a session', async () => {
    const { messagesStore, addBlockMessage, clearSessionMessages } = await import('../stores/messages');
    addBlockMessage(mockBlockMessage);
    clearSessionMessages('s1');
    const state = get(messagesStore);
    // Key is deleted on clear
    expect(state.messagesBySession['s1']).toBeUndefined();
    expect(state.messages['b1']).toBeUndefined();
  });

  it('can reset entire store', async () => {
    const { messagesStore, addBlockMessage, resetMessagesStore } = await import('../stores/messages');
    addBlockMessage(mockBlockMessage);
    resetMessagesStore();
    const state = get(messagesStore);
    expect(state.messages).toEqual({});
    expect(state.messagesBySession).toEqual({});
  });
});
