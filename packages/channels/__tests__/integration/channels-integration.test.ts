import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ChannelManager } from '../../src/ChannelManager.js';
import { TelegramChannel } from '../../src/telegram/TelegramChannel.js';
import { WhatsAppChannel } from '../../src/whatsapp/WhatsAppChannel.js';
import { BaseChannelHandler } from '../../src/ChannelHandler.js';
import type { OutboundMessage } from '@osai/gateway';

describe('Integration: Channel lifecycle and message routing', () => {
  let manager: ChannelManager;
  let tgChannel: TelegramChannel;
  let waChannel: WhatsAppChannel;

  beforeEach(async () => {
    manager = new ChannelManager();
    tgChannel = new TelegramChannel({ token: 'tg-token', botName: 'tg-bot' });
    waChannel = new WhatsAppChannel({ sessionName: 'wa-session' });
  });

  // -----------------------------------------------------------------------
  // Full lifecycle: register -> connect -> use -> disconnect -> unregister
  // -----------------------------------------------------------------------

  describe('full lifecycle', () => {
    it('should complete full lifecycle for Telegram channel', async () => {
      // Register
      manager.registerChannel(tgChannel);
      expect(manager.listChannels()).toHaveLength(1);

      // Connect
      await manager.connectAll();
      expect(tgChannel.getStatus()).toBe('connected');

      // Use: send and receive
      const handler = vi.fn();
      tgChannel.onMessage(handler);
      tgChannel.simulateIncomingMessage('chat1', 'Hello TG', 'user1');
      expect(handler).toHaveBeenCalledTimes(1);

      tgChannel.send({ sessionId: 'chat1', content: 'Reply', type: 'text' });
      expect(tgChannel.getSentMessages()).toHaveLength(1);

      // Disconnect
      await manager.disconnectAll();
      expect(tgChannel.getStatus()).toBe('disconnected');

      // Unregister
      const removed = await manager.unregisterChannel(tgChannel.id);
      expect(removed).toBe(true);
      expect(manager.listChannels()).toHaveLength(0);
    });

    it('should complete full lifecycle for WhatsApp channel', async () => {
      manager.registerChannel(waChannel);
      await manager.connectAll();

      const handler = vi.fn();
      waChannel.onMessage(handler);
      waChannel.simulateIncomingMessage('123@s.whatsapp.net', 'Hello WA', 'user2');
      expect(handler).toHaveBeenCalledTimes(1);

      waChannel.send({ sessionId: '123@s.whatsapp.net', content: 'Reply', type: 'text' });
      expect(waChannel.getSentMessages()).toHaveLength(1);

      await manager.disconnectAll();
      expect(waChannel.getStatus()).toBe('disconnected');
    });
  });

  // -----------------------------------------------------------------------
  // Message routing between channels
  // -----------------------------------------------------------------------

  describe('message routing', () => {
    it('should route incoming Telegram message to handler', async () => {
      manager.registerChannel(tgChannel);
      await manager.connectAll();

      const received: OutboundMessage[] = [];
      tgChannel.onMessage((msg) => received.push(msg));
      tgChannel.simulateIncomingMessage('chat1', 'Test message', 'alice');

      expect(received).toHaveLength(1);
      expect(received[0]!.content).toBe('Test message');
      expect(received[0]!.metadata?.from).toBe('alice');
    });

    it('should route incoming WhatsApp message to handler', async () => {
      manager.registerChannel(waChannel);
      await manager.connectAll();

      const received: OutboundMessage[] = [];
      waChannel.onMessage((msg) => received.push(msg));
      waChannel.simulateIncomingMessage('123@s.whatsapp.net', 'Test WA', 'bob');

      expect(received).toHaveLength(1);
      expect(received[0]!.content).toBe('Test WA');
      expect(received[0]!.metadata?.from).toBe('bob');
    });

    it('should not cross-contaminate message handlers between channels', async () => {
      manager.registerChannel(tgChannel);
      manager.registerChannel(waChannel);
      await manager.connectAll();

      const tgReceived: OutboundMessage[] = [];
      const waReceived: OutboundMessage[] = [];
      tgChannel.onMessage((msg) => tgReceived.push(msg));
      waChannel.onMessage((msg) => waReceived.push(msg));

      tgChannel.simulateIncomingMessage('chat1', 'TG msg', 'user1');
      waChannel.simulateIncomingMessage('123@s.whatsapp.net', 'WA msg', 'user2');

      expect(tgReceived).toHaveLength(1);
      expect(waReceived).toHaveLength(1);
      expect(tgReceived[0]!.content).toBe('TG msg');
      expect(waReceived[0]!.content).toBe('WA msg');
    });
  });

  // -----------------------------------------------------------------------
  // Broadcast to all channels
  // -----------------------------------------------------------------------

  describe('broadcast routing', () => {
    it('should broadcast to both channels', async () => {
      manager.registerChannel(tgChannel);
      manager.registerChannel(waChannel);
      await manager.connectAll();

      const sentCount = await manager.broadcast({
        sessionId: 'global',
        content: 'Announcement',
        type: 'text',
      });

      expect(sentCount).toBe(2);
      expect(tgChannel.getSentMessages()[0]!.content).toBe('Announcement');
      expect(waChannel.getSentMessages()[0]!.content).toBe('Announcement');
    });

    it('should broadcast only to connected channels when one is disconnected', async () => {
      manager.registerChannel(tgChannel);
      manager.registerChannel(waChannel);
      await tgChannel.connect();
      // wa not connected

      const sentCount = await manager.broadcast({
        sessionId: 'global',
        content: 'Partial',
        type: 'text',
      });

      expect(sentCount).toBe(1);
      expect(tgChannel.getSentMessages()).toHaveLength(1);
      expect(waChannel.getSentMessages()).toHaveLength(0);
    });
  });

  // -----------------------------------------------------------------------
  // ChannelManager status tracking
  // -----------------------------------------------------------------------

  describe('status tracking', () => {
    it('should reflect channel status changes in listChannels', async () => {
      manager.registerChannel(tgChannel);
      expect(manager.listChannels()[0]!.status).toBe('disconnected');

      await tgChannel.connect();
      expect(manager.listChannels()[0]!.status).toBe('connected');

      await tgChannel.disconnect();
      expect(manager.listChannels()[0]!.status).toBe('disconnected');
    });

    it('should track status of multiple channels independently', async () => {
      manager.registerChannel(tgChannel);
      manager.registerChannel(waChannel);

      await tgChannel.connect();
      // wa still disconnected

      const list = manager.listChannels();
      const tgInfo = list.find((c) => c.type === 'telegram');
      const waInfo = list.find((c) => c.type === 'whatsapp');

      expect(tgInfo!.status).toBe('connected');
      expect(waInfo!.status).toBe('disconnected');
    });
  });

  // -----------------------------------------------------------------------
  // BaseChannelHandler interface compliance
  // -----------------------------------------------------------------------

  describe('BaseChannelHandler interface compliance', () => {
    it('TelegramChannel should implement IChannelHandler', async () => {
      expect(typeof tgChannel.connect).toBe('function');
      expect(typeof tgChannel.disconnect).toBe('function');
      expect(typeof tgChannel.send).toBe('function');
      expect(typeof tgChannel.onMessage).toBe('function');
      expect(typeof tgChannel.getStatus).toBe('function');
      expect(typeof tgChannel.id).toBe('string');
      expect(typeof tgChannel.type).toBe('string');
      expect(typeof tgChannel.name).toBe('string');

      await tgChannel.connect();
      expect(tgChannel.getStatus()).toBe('connected');

      const handler = vi.fn();
      tgChannel.onMessage(handler);
      tgChannel.simulateIncomingMessage('chat1', 'test', 'user');
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('WhatsAppChannel should implement IChannelHandler', async () => {
      expect(typeof waChannel.connect).toBe('function');
      expect(typeof waChannel.disconnect).toBe('function');
      expect(typeof waChannel.send).toBe('function');
      expect(typeof waChannel.onMessage).toBe('function');
      expect(typeof waChannel.getStatus).toBe('function');
      expect(typeof waChannel.id).toBe('string');
      expect(typeof waChannel.type).toBe('string');
      expect(typeof waChannel.name).toBe('string');

      await waChannel.connect();
      expect(waChannel.getStatus()).toBe('connected');

      const handler = vi.fn();
      waChannel.onMessage(handler);
      waChannel.simulateIncomingMessage('123@s.whatsapp.net', 'test', 'user');
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('BaseChannelHandler is abstract and cannot be instantiated directly', () => {
      expect(
        () => new (class extends BaseChannelHandler {
          constructor() {
            super('test', 'test', 'cli');
          }
          connect(): Promise<void> {
            return Promise.resolve();
          }
          disconnect(): Promise<void> {
            return Promise.resolve();
          }
          send(): void {}
          onMessage(): void {}
        })()
      ).not.toThrow();
    });
  });
});
