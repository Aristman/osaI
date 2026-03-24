import { describe, it, expect, beforeEach, vi } from 'vitest';
import { WhatsAppChannel } from '../../src/whatsapp/WhatsAppChannel.js';
import type { OutboundMessage } from '@osai/gateway';

describe('WhatsAppChannel', () => {
  let channel: WhatsAppChannel;

  beforeEach(() => {
    channel = new WhatsAppChannel({
      phoneNumber: '+1234567890',
      sessionName: 'test-session',
    });
  });

  // -----------------------------------------------------------------------
  // Construction and defaults
  // -----------------------------------------------------------------------

  describe('construction', () => {
    it('should create a channel with correct type', () => {
      expect(channel.type).toBe('whatsapp');
    });

    it('should create a channel with correct name from config', () => {
      expect(channel.name).toBe('test-session');
    });

    it('should create a channel with default name when sessionName is not provided', () => {
      const defaultChannel = new WhatsAppChannel();
      expect(defaultChannel.name).toBe('whatsapp');
    });

    it('should expose the phone number', () => {
      expect(channel.phoneNumber).toBe('+1234567890');
    });

    it('should expose undefined phone number when not provided', () => {
      const noPhone = new WhatsAppChannel({});
      expect(noPhone.phoneNumber).toBeUndefined();
    });

    it('should generate a unique id', () => {
      const channel2 = new WhatsAppChannel({ sessionName: 's' });
      expect(channel.id).not.toBe(channel2.id);
    });

    it('should have id prefixed with whatsapp_', () => {
      expect(channel.id).toMatch(/^whatsapp_/);
    });
  });

  // -----------------------------------------------------------------------
  // Connection lifecycle
  // -----------------------------------------------------------------------

  describe('connect', () => {
    it('should transition to connected', async () => {
      await channel.connect();
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
      channel.simulateIncomingMessage('123@s.whatsapp.net', 'hello', 'user1');
      expect(handler).toHaveBeenCalledTimes(1);

      await channel.disconnect();
      channel.simulateIncomingMessage('123@s.whatsapp.net', 'hello2', 'user1');
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
        sessionId: '123@s.whatsapp.net',
        content: 'hello',
        type: 'text',
      };
      expect(() => channel.send(message)).toThrow('not connected');
    });

    it('should store message when connected', async () => {
      await channel.connect();
      const message: OutboundMessage = {
        sessionId: '123@s.whatsapp.net',
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
      channel.simulateIncomingMessage('123@s.whatsapp.net', 'Hello!', 'user1');

      expect(handler).toHaveBeenCalledTimes(1);
      const msg = handler.mock.calls[0]![0] as OutboundMessage;
      expect(msg.sessionId).toBe('123@s.whatsapp.net');
      expect(msg.content).toBe('Hello!');
      expect(msg.metadata?.from).toBe('user1');
    });

    it('should not call handler when not connected', () => {
      const handler = vi.fn();
      channel.onMessage(handler);
      channel.simulateIncomingMessage('123@s.whatsapp.net', 'Hello!', 'user1');
      expect(handler).not.toHaveBeenCalled();
    });

    it('should set channel metadata to whatsapp', async () => {
      const handler = vi.fn();
      await channel.connect();
      channel.onMessage(handler);
      channel.simulateIncomingMessage('123@s.whatsapp.net', 'test', 'user1');

      const msg = handler.mock.calls[0]![0] as OutboundMessage;
      expect(msg.metadata?.channel).toBe('whatsapp');
    });

    it('should include timestamp in metadata', async () => {
      const handler = vi.fn();
      await channel.connect();
      channel.onMessage(handler);
      channel.simulateIncomingMessage('123@s.whatsapp.net', 'test', 'user1');

      const msg = handler.mock.calls[0]![0] as OutboundMessage;
      expect(msg.metadata?.timestamp).toBeDefined();
      expect(typeof msg.metadata?.timestamp).toBe('string');
    });
  });

  // -----------------------------------------------------------------------
  // WhatsApp-specific methods
  // -----------------------------------------------------------------------

  describe('sendMessage', () => {
    it('should send text message via channel', async () => {
      await channel.connect();
      await channel.sendMessage('123@s.whatsapp.net', 'Hello World');
      expect(channel.getSentMessages()).toHaveLength(1);
      expect(channel.getSentMessages()[0]!.content).toBe('Hello World');
    });
  });

  describe('sendPresence', () => {
    it('should send composing presence event', async () => {
      await channel.connect();
      await channel.sendPresence('123@s.whatsapp.net', 'composing');
      expect(channel.getSentMessages()).toHaveLength(1);
      const sent = channel.getSentMessages()[0]!;
      expect(sent.type).toBe('event');
      expect(sent.metadata?.presence).toBe('composing');
    });

    it('should send available presence event', async () => {
      await channel.connect();
      await channel.sendPresence('123@s.whatsapp.net', 'available');
      const sent = channel.getSentMessages()[0]!;
      expect(sent.metadata?.presence).toBe('available');
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
