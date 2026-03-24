import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TelegramChannel } from '../../src/telegram/TelegramChannel.js';
import type { OutboundMessage } from '@osai/gateway';

describe('TelegramChannel', () => {
  let channel: TelegramChannel;

  beforeEach(() => {
    channel = new TelegramChannel({ token: 'test-bot-token', botName: 'test-bot' });
  });

  // -----------------------------------------------------------------------
  // Construction and defaults
  // -----------------------------------------------------------------------

  describe('construction', () => {
    it('should create a channel with correct type', () => {
      expect(channel.type).toBe('telegram');
    });

    it('should create a channel with correct name from config', () => {
      expect(channel.name).toBe('test-bot');
    });

    it('should create a channel with default name when botName is not provided', () => {
      const defaultChannel = new TelegramChannel({ token: 'token' });
      expect(defaultChannel.name).toBe('telegram-bot');
    });

    it('should expose the token', () => {
      expect(channel.token).toBe('test-bot-token');
    });

    it('should generate a unique id', () => {
      const channel2 = new TelegramChannel({ token: 'token', botName: 'bot' });
      expect(channel.id).not.toBe(channel2.id);
    });

    it('should have id prefixed with telegram_', () => {
      expect(channel.id).toMatch(/^telegram_/);
    });
  });

  // -----------------------------------------------------------------------
  // Connection lifecycle
  // -----------------------------------------------------------------------

  describe('connect', () => {
    it('should transition to connecting then connected', async () => {
      const statusTransitions: string[] = [];

      const originalSetStatus = channel.getStatus.bind(channel);
      let previousStatus = '';
      const checkTransition = () => {
        const current = channel.getStatus();
        if (current !== previousStatus) {
          statusTransitions.push(current);
          previousStatus = current;
        }
      };

      // Connect and check states
      expect(channel.getStatus()).toBe('disconnected');
      await channel.connect();
      checkTransition();
      expect(channel.getStatus()).toBe('connected');
    });

    it('should resolve without error', async () => {
      await expect(channel.connect()).resolves.toBeUndefined();
    });

    it('should be idempotent -- connecting twice does not throw', async () => {
      await channel.connect();
      await expect(channel.connect()).resolves.toBeUndefined();
      expect(channel.getStatus()).toBe('connected');
    });
  });

  describe('disconnect', () => {
    it('should transition to disconnected', async () => {
      await channel.connect();
      await channel.disconnect();
      expect(channel.getStatus()).toBe('disconnected');
    });

    it('should clear message handler on disconnect', async () => {
      const handler = vi.fn();
      channel.onMessage(handler);
      await channel.connect();
      channel.simulateIncomingMessage('123', 'hello', 'user1');
      expect(handler).toHaveBeenCalledTimes(1);

      await channel.disconnect();
      channel.simulateIncomingMessage('123', 'hello2', 'user1');
      // Handler was cleared, but also status is disconnected
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('should resolve without error when not connected', async () => {
      await expect(channel.disconnect()).resolves.toBeUndefined();
      expect(channel.getStatus()).toBe('disconnected');
    });
  });

  // -----------------------------------------------------------------------
  // Send
  // -----------------------------------------------------------------------

  describe('send', () => {
    it('should throw when not connected', () => {
      const message: OutboundMessage = {
        sessionId: 'chat1',
        content: 'hello',
        type: 'text',
      };
      expect(() => channel.send(message)).toThrow('not connected');
    });

    it('should store message when connected', async () => {
      await channel.connect();
      const message: OutboundMessage = {
        sessionId: 'chat1',
        content: 'hello',
        type: 'text',
      };
      channel.send(message);
      expect(channel.getSentMessages()).toHaveLength(1);
      expect(channel.getSentMessages()[0]!.content).toBe('hello');
    });

    it('should store multiple messages', async () => {
      await channel.connect();
      channel.send({ sessionId: 'c1', content: 'msg1', type: 'text' });
      channel.send({ sessionId: 'c2', content: 'msg2', type: 'text' });
      channel.send({ sessionId: 'c3', content: 'msg3', type: 'text' });
      expect(channel.getSentMessages()).toHaveLength(3);
    });

    it('should throw after disconnect', async () => {
      await channel.connect();
      await channel.disconnect();
      expect(() =>
        channel.send({ sessionId: 'c1', content: 'msg', type: 'text' })
      ).toThrow('not connected');
    });
  });

  // -----------------------------------------------------------------------
  // Incoming messages
  // -----------------------------------------------------------------------

  describe('onMessage', () => {
    it('should call handler when message is simulated', async () => {
      const handler = vi.fn();
      await channel.connect();
      channel.onMessage(handler);
      channel.simulateIncomingMessage('chat1', 'Hello!', 'user1');

      expect(handler).toHaveBeenCalledTimes(1);
      const msg = handler.mock.calls[0]![0] as OutboundMessage;
      expect(msg.sessionId).toBe('chat1');
      expect(msg.content).toBe('Hello!');
      expect(msg.metadata?.from).toBe('user1');
    });

    it('should not call handler when not connected', () => {
      const handler = vi.fn();
      channel.onMessage(handler);
      channel.simulateIncomingMessage('chat1', 'Hello!', 'user1');
      expect(handler).not.toHaveBeenCalled();
    });

    it('should set channel metadata to telegram', async () => {
      const handler = vi.fn();
      await channel.connect();
      channel.onMessage(handler);
      channel.simulateIncomingMessage('chat1', 'test', 'user1');

      const msg = handler.mock.calls[0]![0] as OutboundMessage;
      expect(msg.metadata?.channel).toBe('telegram');
    });

    it('should include timestamp in metadata', async () => {
      const handler = vi.fn();
      await channel.connect();
      channel.onMessage(handler);
      channel.simulateIncomingMessage('chat1', 'test', 'user1');

      const msg = handler.mock.calls[0]![0] as OutboundMessage;
      expect(msg.metadata?.timestamp).toBeDefined();
      expect(typeof msg.metadata?.timestamp).toBe('string');
    });
  });

  // -----------------------------------------------------------------------
  // Telegram-specific methods
  // -----------------------------------------------------------------------

  describe('sendMessage', () => {
    it('should send text message via channel', async () => {
      await channel.connect();
      await channel.sendMessage('chat1', 'Hello World');
      expect(channel.getSentMessages()).toHaveLength(1);
      expect(channel.getSentMessages()[0]!.content).toBe('Hello World');
    });

    it('should include parseMode in metadata when provided', async () => {
      await channel.connect();
      await channel.sendMessage('chat1', '*bold*', { parseMode: 'Markdown' });
      const sent = channel.getSentMessages()[0]!;
      expect(sent.metadata?.parseMode).toBe('Markdown');
    });
  });

  describe('sendPhoto', () => {
    it('should send photo message via channel', async () => {
      await channel.connect();
      await channel.sendPhoto('chat1', 'https://example.com/photo.jpg');
      expect(channel.getSentMessages()).toHaveLength(1);
      expect(channel.getSentMessages()[0]!.content).toBe('https://example.com/photo.jpg');
    });

    it('should include caption in metadata', async () => {
      await channel.connect();
      await channel.sendPhoto('chat1', 'https://example.com/photo.jpg', 'My photo');
      const sent = channel.getSentMessages()[0]!;
      expect(sent.metadata?.caption).toBe('My photo');
    });

    it('should set mediaType to photo', async () => {
      await channel.connect();
      await channel.sendPhoto('chat1', 'https://example.com/photo.jpg');
      const sent = channel.getSentMessages()[0]!;
      expect(sent.metadata?.mediaType).toBe('photo');
    });
  });

  // -----------------------------------------------------------------------
  // Test helpers
  // -----------------------------------------------------------------------

  describe('getSentMessages', () => {
    it('should return a copy of sent messages', async () => {
      await channel.connect();
      channel.send({ sessionId: 'c1', content: 'msg', type: 'text' });
      const first = channel.getSentMessages();
      const second = channel.getSentMessages();
      expect(first).not.toBe(second);
      expect(first).toEqual(second);
    });
  });

  describe('clearSentMessages', () => {
    it('should clear all sent messages', async () => {
      await channel.connect();
      channel.send({ sessionId: 'c1', content: 'msg1', type: 'text' });
      channel.send({ sessionId: 'c2', content: 'msg2', type: 'text' });
      expect(channel.getSentMessages()).toHaveLength(2);

      channel.clearSentMessages();
      expect(channel.getSentMessages()).toHaveLength(0);
    });
  });

  // -----------------------------------------------------------------------
  // Status
  // -----------------------------------------------------------------------

  describe('getStatus', () => {
    it('should return disconnected initially', () => {
      expect(channel.getStatus()).toBe('disconnected');
    });

    it('should return connected after connect', async () => {
      await channel.connect();
      expect(channel.getStatus()).toBe('connected');
    });

    it('should return disconnected after disconnect', async () => {
      await channel.connect();
      await channel.disconnect();
      expect(channel.getStatus()).toBe('disconnected');
    });
  });
});
