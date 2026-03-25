/**
 * T003-UNIT-001: Message list renders messages
 * T003-UNIT-004: Send message updates store and sends WS
 *
 * Tests for messages store user message functionality.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import type { ChatMessage } from '../stores/messages';

describe('messagesStore - addUserMessage', () => {
  beforeEach(async () => {
    const { resetMessagesStore } = await import('../stores/messages');
    resetMessagesStore();
  });

  it('T003-UNIT-001: adds user message to store', async () => {
    const { messagesStore } = await import('../stores/messages');
    const userMsg: ChatMessage = {
      id: 'msg-1',
      sessionId: 's1',
      type: 'user',
      timestamp: '2026-01-01T00:00:00Z',
      data: { text: 'Hello agent' }
    };
    messagesStore.addUserMessage(userMsg);
    const state = get(messagesStore);
    expect(state.messages['msg-1']).toBeDefined();
    expect(state.messages['msg-1']!.type).toBe('user');
    expect((state.messages['msg-1']!.data as { text: string }).text).toBe('Hello agent');
  });

  it('T003-UNIT-001: message appears in session messages list', async () => {
    const { messagesStore } = await import('../stores/messages');
    const userMsg: ChatMessage = {
      id: 'msg-2',
      sessionId: 's1',
      type: 'user',
      timestamp: '2026-01-01T00:00:00Z',
      data: { text: 'Test message' }
    };
    messagesStore.addUserMessage(userMsg);
    const state = get(messagesStore);
    const sessionMsgs = state.messagesBySession['s1'];
    expect(sessionMsgs).toHaveLength(1);
    expect(sessionMsgs![0]).toBe('msg-2');
  });

  it('T003-UNIT-001: preserves message order', async () => {
    const { messagesStore } = await import('../stores/messages');
    const msg1: ChatMessage = {
      id: 'msg-1',
      sessionId: 's1',
      type: 'user',
      timestamp: '2026-01-01T00:00:00Z',
      data: { text: 'First' }
    };
    const msg2: ChatMessage = {
      id: 'msg-2',
      sessionId: 's1',
      type: 'block',
      timestamp: '2026-01-01T00:00:01Z',
      data: { blockType: 'text', content: { text: 'Response' } }
    };
    const msg3: ChatMessage = {
      id: 'msg-3',
      sessionId: 's1',
      type: 'user',
      timestamp: '2026-01-01T00:00:02Z',
      data: { text: 'Second' }
    };
    messagesStore.addUserMessage(msg1);
    messagesStore.addUserMessage(msg2);
    messagesStore.addUserMessage(msg3);

    const state = get(messagesStore);
    const sessionMsgs = state.messagesBySession['s1'];
    expect(sessionMsgs).toEqual(['msg-1', 'msg-2', 'msg-3']);
  });

  it('T003-UNIT-001: sessionMessages derived returns ordered messages', async () => {
    const { messagesStore, sessionMessages } = await import('../stores/messages');
    const msg1: ChatMessage = {
      id: 'msg-1',
      sessionId: 's1',
      type: 'user',
      timestamp: '2026-01-01T00:00:00Z',
      data: { text: 'Hello' }
    };
    const msg2: ChatMessage = {
      id: 'msg-2',
      sessionId: 's1',
      type: 'block',
      timestamp: '2026-01-01T00:00:01Z',
      data: { blockType: 'text', content: { text: 'Hi there' } }
    };
    messagesStore.addUserMessage(msg1);
    messagesStore.addUserMessage(msg2);

    const derived = get(sessionMessages('s1'));
    expect(derived).toHaveLength(2);
    expect(derived[0]!.type).toBe('user');
    expect(derived[1]!.type).toBe('block');
  });

  it('T003-UNIT-001: supports system messages', async () => {
    const { messagesStore } = await import('../stores/messages');
    const systemMsg: ChatMessage = {
      id: 'sys-1',
      sessionId: 's1',
      type: 'system',
      timestamp: '2026-01-01T00:00:00Z',
      data: { text: 'Session started' }
    };
    messagesStore.addUserMessage(systemMsg);
    const state = get(messagesStore);
    expect(state.messages['sys-1']!.type).toBe('system');
  });
});

describe('T003-UNIT-004: Send message flow', () => {
  beforeEach(async () => {
    const { resetMessagesStore } = await import('../stores/messages');
    resetMessagesStore();
  });

  it('T003-UNIT-004: user message is stored before WS send', async () => {
    const { messagesStore } = await import('../stores/messages');
    const userMsg: ChatMessage = {
      id: 'msg-send-1',
      sessionId: 's1',
      type: 'user',
      timestamp: '2026-01-01T00:00:00Z',
      data: { text: 'Send this' }
    };

    // Simulate the flow: add to store first, then send
    messagesStore.addUserMessage(userMsg);

    const state = get(messagesStore);
    expect(state.messages['msg-send-1']).toBeDefined();
    expect((state.messages['msg-send-1']!.data as { text: string }).text).toBe('Send this');

    // The actual WS send is in ChatArea component, tested via integration
  });
});
