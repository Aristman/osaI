import { describe, it, expect, beforeEach } from 'vitest';
import { ChannelManager } from '../../src/ChannelManager.js';
import { TelegramChannel } from '../../src/telegram/TelegramChannel.js';
import { WhatsAppChannel } from '../../src/whatsapp/WhatsAppChannel.js';

describe('ChannelManager', () => {
  let manager: ChannelManager;

  beforeEach(() => {
    manager = new ChannelManager();
  });

  // -----------------------------------------------------------------------
  // Registration
  // -----------------------------------------------------------------------

  describe('registerChannel', () => {
    it('should register a Telegram channel', () => {
      const channel = new TelegramChannel({ token: 't', botName: 'tg' });
      manager.registerChannel(channel);
      expect(manager.getChannel(channel.id)).toBe(channel);
    });

    it('should register a WhatsApp channel', () => {
      const channel = new WhatsAppChannel({ sessionName: 'wa' });
      manager.registerChannel(channel);
      expect(manager.getChannel(channel.id)).toBe(channel);
    });

    it('should throw on duplicate registration', () => {
      const channel = new TelegramChannel({ token: 't', botName: 'tg' });
      manager.registerChannel(channel);
      expect(() => manager.registerChannel(channel)).toThrow('already registered');
    });

    it('should register multiple channels', () => {
      const tg = new TelegramChannel({ token: 't1', botName: 'tg1' });
      const wa = new WhatsAppChannel({ sessionName: 'wa1' });
      const tg2 = new TelegramChannel({ token: 't2', botName: 'tg2' });
      manager.registerChannel(tg);
      manager.registerChannel(wa);
      manager.registerChannel(tg2);
      expect(manager.listChannels()).toHaveLength(3);
    });
  });

  // -----------------------------------------------------------------------
  // Unregistration
  // -----------------------------------------------------------------------

  describe('unregisterChannel', () => {
    it('should unregister a registered channel', async () => {
      const channel = new TelegramChannel({ token: 't', botName: 'tg' });
      manager.registerChannel(channel);
      const result = await manager.unregisterChannel(channel.id);
      expect(result).toBe(true);
      expect(manager.getChannel(channel.id)).toBeUndefined();
    });

    it('should return false for non-existent channel', async () => {
      const result = await manager.unregisterChannel('non-existent');
      expect(result).toBe(false);
    });

    it('should disconnect the channel before unregistering', async () => {
      const channel = new TelegramChannel({ token: 't', botName: 'tg' });
      manager.registerChannel(channel);
      await channel.connect();
      expect(channel.getStatus()).toBe('connected');

      await manager.unregisterChannel(channel.id);
      expect(channel.getStatus()).toBe('disconnected');
    });
  });

  // -----------------------------------------------------------------------
  // Lookup
  // -----------------------------------------------------------------------

  describe('getChannel', () => {
    it('should return undefined for non-existent channel', () => {
      expect(manager.getChannel('non-existent')).toBeUndefined();
    });

    it('should return the correct channel by id', () => {
      const channel = new TelegramChannel({ token: 't', botName: 'tg' });
      manager.registerChannel(channel);
      expect(manager.getChannel(channel.id)).toBe(channel);
    });
  });

  // -----------------------------------------------------------------------
  // List
  // -----------------------------------------------------------------------

  describe('listChannels', () => {
    it('should return empty array when no channels registered', () => {
      expect(manager.listChannels()).toEqual([]);
    });

    it('should return all registered channels with info', () => {
      const tg = new TelegramChannel({ token: 't', botName: 'tg' });
      const wa = new WhatsAppChannel({ sessionName: 'wa' });
      manager.registerChannel(tg);
      manager.registerChannel(wa);

      const list = manager.listChannels();
      expect(list).toHaveLength(2);
      expect(list[0]!.id).toBe(tg.id);
      expect(list[0]!.name).toBe('tg');
      expect(list[0]!.type).toBe('telegram');
      expect(list[0]!.status).toBe('disconnected');
      expect(list[1]!.id).toBe(wa.id);
      expect(list[1]!.type).toBe('whatsapp');
    });
  });

  // -----------------------------------------------------------------------
  // Connect all / Disconnect all
  // -----------------------------------------------------------------------

  describe('connectAll', () => {
    it('should connect all registered channels', async () => {
      const tg = new TelegramChannel({ token: 't', botName: 'tg' });
      const wa = new WhatsAppChannel({ sessionName: 'wa' });
      manager.registerChannel(tg);
      manager.registerChannel(wa);

      await manager.connectAll();
      expect(tg.getStatus()).toBe('connected');
      expect(wa.getStatus()).toBe('connected');
    });

    it('should not throw when no channels registered', async () => {
      await expect(manager.connectAll()).resolves.toBeUndefined();
    });
  });

  describe('disconnectAll', () => {
    it('should disconnect all registered channels', async () => {
      const tg = new TelegramChannel({ token: 't', botName: 'tg' });
      const wa = new WhatsAppChannel({ sessionName: 'wa' });
      manager.registerChannel(tg);
      manager.registerChannel(wa);
      await manager.connectAll();

      await manager.disconnectAll();
      expect(tg.getStatus()).toBe('disconnected');
      expect(wa.getStatus()).toBe('disconnected');
    });

    it('should not throw when no channels registered', async () => {
      await expect(manager.disconnectAll()).resolves.toBeUndefined();
    });
  });

  // -----------------------------------------------------------------------
  // Broadcast
  // -----------------------------------------------------------------------

  describe('broadcast', () => {
    it('should send message to all connected channels', async () => {
      const tg = new TelegramChannel({ token: 't', botName: 'tg' });
      const wa = new WhatsAppChannel({ sessionName: 'wa' });
      manager.registerChannel(tg);
      manager.registerChannel(wa);
      await manager.connectAll();

      const sentCount = await manager.broadcast({
        sessionId: 's1',
        content: 'broadcast',
        type: 'text',
      });

      expect(sentCount).toBe(2);
      expect(tg.getSentMessages()).toHaveLength(1);
      expect(wa.getSentMessages()).toHaveLength(1);
    });

    it('should only send to connected channels', async () => {
      const tg = new TelegramChannel({ token: 't', botName: 'tg' });
      const wa = new WhatsAppChannel({ sessionName: 'wa' });
      manager.registerChannel(tg);
      manager.registerChannel(wa);
      await tg.connect();
      // wa is not connected

      const sentCount = await manager.broadcast({
        sessionId: 's1',
        content: 'broadcast',
        type: 'text',
      });

      expect(sentCount).toBe(1);
      expect(tg.getSentMessages()).toHaveLength(1);
      expect(wa.getSentMessages()).toHaveLength(0);
    });

    it('should return 0 when no channels are connected', async () => {
      const sentCount = await manager.broadcast({
        sessionId: 's1',
        content: 'broadcast',
        type: 'text',
      });
      expect(sentCount).toBe(0);
    });

    it('should skip channels that fail to send', async () => {
      const channel = new TelegramChannel({ token: 't', botName: 'tg' });
      manager.registerChannel(channel);
      await manager.connectAll();

      // Manually disconnect to make send fail, then broadcast
      channel.disconnect();
      const sentCount = await manager.broadcast({
        sessionId: 's1',
        content: 'broadcast',
        type: 'text',
      });
      expect(sentCount).toBe(0);
    });
  });
});
