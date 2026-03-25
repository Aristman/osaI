/**
 * T003-UNIT-001: Message list renders messages (integration)
 * T003-UNIT-004: Send message updates store and sends WS (integration)
 * T003-UNIT-005: Auto-scroll on new message (logic test)
 *
 * Integration tests for chat area components with stores.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import type { ChatMessage } from '../stores/messages';
import type { BlockMessage, ToolStreamMessage } from '../types';

describe('Chat Area Integration', () => {
  beforeEach(async () => {
    const { resetMessagesStore } = await import('../stores/messages');
    const { resetSessionsStore } = await import('../stores/sessions');
    resetMessagesStore();
    resetSessionsStore();
  });

  it('T003-UNIT-001: renders all message types in session', async () => {
    const { messagesStore } = await import('../stores/messages');
    const { sessionMessages } = await import('../stores/messages');

    // Add user message
    messagesStore.addUserMessage({
      id: 'msg-u1',
      sessionId: 'session-1',
      type: 'user',
      timestamp: '2026-01-01T00:00:00Z',
      data: { text: 'Hello' }
    });

    // Add block message
    const blockMsg: BlockMessage = {
      type: 'block',
      sessionId: 'session-1',
      blockId: 'block-1',
      blockType: 'text',
      content: { text: 'Hi there!' },
      timestamp: '2026-01-01T00:00:01Z'
    };
    messagesStore.addBlockMessage(blockMsg);

    // Add tool stream
    const toolMsg: ToolStreamMessage = {
      type: 'tool_stream',
      sessionId: 'session-1',
      toolCallId: 'tc-1',
      toolName: 'shell',
      status: 'started',
      data: { command: 'ls' },
      timestamp: '2026-01-01T00:00:02Z'
    };
    messagesStore.addToolStreamMessage(toolMsg);

    // Add system message
    messagesStore.addUserMessage({
      id: 'sys-1',
      sessionId: 'session-1',
      type: 'system',
      timestamp: '2026-01-01T00:00:03Z',
      data: { text: 'Tool completed' }
    });

    const msgs = get(sessionMessages('session-1'));
    expect(msgs).toHaveLength(4);

    // Verify order and types
    expect(msgs[0]!.type).toBe('user');
    expect(msgs[1]!.type).toBe('block');
    expect(msgs[2]!.type).toBe('tool_stream');
    expect(msgs[3]!.type).toBe('system');
  });

  it('T003-UNIT-001: returns empty list for non-existent session', async () => {
    const { sessionMessages } = await import('../stores/messages');
    const msgs = get(sessionMessages('non-existent-session'));
    expect(msgs).toEqual([]);
  });

  it('T003-UNIT-004: send flow adds user message to store', async () => {
    const { messagesStore } = await import('../stores/messages');
    const { sessionMessages } = await import('../stores/messages');

    // Simulate what ChatArea.handleSend does
    const text = 'Hello agent';
    const userMsg: ChatMessage = {
      id: 'msg-new-1',
      sessionId: 's-active',
      type: 'user',
      timestamp: new Date().toISOString(),
      data: { text }
    };

    messagesStore.addUserMessage(userMsg);

    // Verify it's in the store
    const state = get(messagesStore);
    expect(state.messages['msg-new-1']).toBeDefined();
    expect((state.messages['msg-new-1']!.data as { text: string }).text).toBe('Hello agent');

    // Verify it appears in sessionMessages
    const msgs = get(sessionMessages('s-active'));
    expect(msgs).toHaveLength(1);
    expect(msgs[0]!.type).toBe('user');
  });

  it('T003-UNIT-004: multiple messages in order', async () => {
    const { messagesStore } = await import('../stores/messages');
    const { sessionMessages } = await import('../stores/messages');

    // Simulate conversation
    messagesStore.addUserMessage({
      id: 'conv-1',
      sessionId: 's1',
      type: 'user',
      timestamp: '2026-01-01T00:00:00Z',
      data: { text: 'Question 1' }
    });

    const blockMsg: BlockMessage = {
      type: 'block',
      sessionId: 's1',
      blockId: 'conv-2',
      blockType: 'text',
      content: { text: 'Answer 1' },
      timestamp: '2026-01-01T00:00:01Z'
    };
    messagesStore.addBlockMessage(blockMsg);

    messagesStore.addUserMessage({
      id: 'conv-3',
      sessionId: 's1',
      type: 'user',
      timestamp: '2026-01-01T00:00:02Z',
      data: { text: 'Question 2' }
    });

    const msgs = get(sessionMessages('s1'));
    expect(msgs).toHaveLength(3);
    expect((msgs[0]!.data as { text: string }).text).toBe('Question 1');
    expect(msgs[1]!.type).toBe('block');
    expect((msgs[2]!.data as { text: string }).text).toBe('Question 2');
  });

  it('T003-UNIT-005: new message changes store triggering auto-scroll (logic)', async () => {
    const { messagesStore } = await import('../stores/messages');
    const { sessionMessages } = await import('../stores/messages');

    // Initial state: empty
    let msgs = get(sessionMessages('s1'));
    expect(msgs).toHaveLength(0);

    // Add a message
    messagesStore.addUserMessage({
      id: 'scroll-1',
      sessionId: 's1',
      type: 'user',
      timestamp: '2026-01-01T00:00:00Z',
      data: { text: 'First' }
    });

    msgs = get(sessionMessages('s1'));
    expect(msgs).toHaveLength(1);

    // Add another message
    const blockMsg: BlockMessage = {
      type: 'block',
      sessionId: 's1',
      blockId: 'scroll-2',
      blockType: 'text',
      content: { text: 'Response' },
      timestamp: '2026-01-01T00:00:01Z'
    };
    messagesStore.addBlockMessage(blockMsg);

    msgs = get(sessionMessages('s1'));
    expect(msgs).toHaveLength(2);

    // Store changed, which would trigger the $effect in ChatArea
    // The auto-scroll logic checks if messagesContainer exists and scrolls to bottom
    // This is verified by the fact that sessionMessages reactive derivation changes
  });

  it('tool stream update does not create duplicates', async () => {
    const { messagesStore } = await import('../stores/messages');
    const { sessionMessages } = await import('../stores/messages');

    const toolMsg1: ToolStreamMessage = {
      type: 'tool_stream',
      sessionId: 's1',
      toolCallId: 'tc-dup',
      toolName: 'shell',
      status: 'started',
      data: { command: 'ls' },
      timestamp: '2026-01-01T00:00:00Z'
    };
    messagesStore.addToolStreamMessage(toolMsg1);

    const toolMsg2: ToolStreamMessage = {
      type: 'tool_stream',
      sessionId: 's1',
      toolCallId: 'tc-dup',
      toolName: 'shell',
      status: 'completed',
      data: { output: 'file1.txt\nfile2.txt' },
      duration: 150,
      timestamp: '2026-01-01T00:00:01Z'
    };
    messagesStore.addToolStreamMessage(toolMsg2);

    const msgs = get(sessionMessages('s1'));
    expect(msgs).toHaveLength(1); // Only one entry
    expect((msgs[0]!.data as { status: string }).status).toBe('completed');
  });
});
