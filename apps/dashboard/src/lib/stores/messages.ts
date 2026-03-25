/**
 * Messages store for chat messages per session.
 * Supports message types: user, assistant, tool_stream, block, permission_request.
 */
import { writable, derived } from 'svelte/store';
import type { BlockMessage, ToolStreamMessage } from '../types';

export interface ChatMessage {
  id: string;
  sessionId: string;
  type: 'user' | 'assistant' | 'tool_stream' | 'block' | 'permission_request' | 'system';
  timestamp: string;
  data: unknown;
}

export interface MessagesState {
  /** Map of message ID -> message data */
  messages: Record<string, ChatMessage>;
  /** Map of sessionId -> ordered message IDs */
  messagesBySession: Record<string, string[]>;
}

const initialState: MessagesState = {
  messages: {},
  messagesBySession: {}
};

function createMessagesStore() {
  const { subscribe, set, update } = writable<MessagesState>({ ...initialState });

  return {
    subscribe,
    set,

    addBlockMessage(msg: BlockMessage): void {
      update((s) => {
        const chatMsg: ChatMessage = {
          id: msg.blockId,
          sessionId: msg.sessionId,
          type: 'block',
          timestamp: msg.timestamp,
          data: { blockType: msg.blockType, content: msg.content }
        };
        const sessionMessages = s.messagesBySession[msg.sessionId] ?? [];
        return {
          messages: { ...s.messages, [chatMsg.id]: chatMsg },
          messagesBySession: {
            ...s.messagesBySession,
            [msg.sessionId]: [...sessionMessages, chatMsg.id]
          }
        };
      });
    },

    addToolStreamMessage(msg: ToolStreamMessage): void {
      update((s) => {
        const existing = s.messages[msg.toolCallId];
        const chatMsg: ChatMessage = {
          id: msg.toolCallId,
          sessionId: msg.sessionId,
          type: 'tool_stream',
          timestamp: msg.timestamp,
          data: {
            toolName: msg.toolName,
            status: msg.status,
            data: msg.data,
            duration: msg.duration ?? (existing?.data as Record<string, unknown>)?.duration
          }
        };
        const sessionMessages = s.messagesBySession[msg.sessionId] ?? [];
        const hasMessage = sessionMessages.includes(msg.toolCallId);
        return {
          messages: { ...s.messages, [chatMsg.id]: chatMsg },
          messagesBySession: {
            ...s.messagesBySession,
            [msg.sessionId]: hasMessage
              ? sessionMessages
              : [...sessionMessages, chatMsg.id]
          }
        };
      });
    },

    addUserMessage(chatMsg: ChatMessage): void {
      update((s) => {
        const sessionMsgs = s.messagesBySession[chatMsg.sessionId] ?? [];
        return {
          messages: { ...s.messages, [chatMsg.id]: chatMsg },
          messagesBySession: {
            ...s.messagesBySession,
            [chatMsg.sessionId]: [...sessionMsgs, chatMsg.id]
          }
        };
      });
    },

    clearSessionMessages(sessionId: string): void {
      update((s) => {
        const messageIds = s.messagesBySession[sessionId] ?? [];
        const newMessages = { ...s.messages };
        for (const id of messageIds) {
          delete newMessages[id];
        }
        const newBySession = { ...s.messagesBySession };
        delete newBySession[sessionId];
        return { messages: newMessages, messagesBySession: newBySession };
      });
    },

    reset(): void {
      set({ ...initialState });
    }
  };
}

export const messagesStore = createMessagesStore();

/**
 * Derived store that returns ordered messages for a given session.
 */
export function sessionMessages(sessionId: string) {
  return derived(messagesStore, ($state) => {
    const messageIds = $state.messagesBySession[sessionId] ?? [];
    return messageIds
      .map((id) => $state.messages[id])
      .filter((m): m is ChatMessage => m !== undefined);
  });
}

export const addBlockMessage = (msg: BlockMessage) => messagesStore.addBlockMessage(msg);
export const addToolStreamMessage = (msg: ToolStreamMessage) => messagesStore.addToolStreamMessage(msg);
export const addUserMessage = (msg: ChatMessage) => messagesStore.addUserMessage(msg);
export const clearSessionMessages = (sessionId: string) => messagesStore.clearSessionMessages(sessionId);
export const resetMessagesStore = () => messagesStore.reset();
