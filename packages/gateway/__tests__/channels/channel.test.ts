/**
 * Unit tests for Channel Handler Interface and ChannelManager
 *
 * Tests cover: IChannelHandler interface, StdioChannel,
 * ChannelManager registration, broadcast, and status tracking.
 *
 * Test IDs: T005-01 through T005-06
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  StdioChannel,
  ChannelManager,
} from '../../src/channels/channel.js';
import type { IChannelHandler, OutboundMessage } from '../../src/channels/channel.js';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/** Create a mock channel handler for testing */
function createMockChannel(
  id: string,
  type: IChannelHandler['type'] = 'ws',
  name: string = id,
): IChannelHandler {
  let status: IChannelHandler['status'] = 'disconnected';
  let handler: ((msg: OutboundMessage) => void) | null = null;

  return {
    id,
    type,
    name,
    get status() {
      return status;
    },
    connect: vi.fn(async () => {
      status = 'connected';
    }),
    disconnect: vi.fn(async () => {
      status = 'disconnected';
    }),
    send: vi.fn((msg: OutboundMessage) => {
      if (status !== 'connected') {
        throw new Error(`Channel '${id}' is not connected`);
      }
    }),
    onMessage: vi.fn((h) => {
      handler = h;
    }),
    getStatus: vi.fn(() => status),
  };
}

function createMockOutboundMessage(overrides?: Partial<OutboundMessage>): OutboundMessage {
  return {
    sessionId: 'test-session',
    content: 'hello',
    type: 'text',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// T005-01: IChannelHandler interface
// ---------------------------------------------------------------------------

describe('IChannelHandler interface', () => {
  it('T005-01: StdioChannel implements all required methods', () => {
    const channel = new StdioChannel('test-cli');
    expect(typeof channel.connect).toBe('function');
    expect(typeof channel.disconnect).toBe('function');
    expect(typeof channel.send).toBe('function');
    expect(typeof channel.onMessage).toBe('function');
    expect(typeof channel.getStatus).toBe('function');
    expect(channel.id).toBeDefined();
    expect(channel.type).toBe('cli');
    expect(channel.name).toBe('test-cli');
  });
});

// ---------------------------------------------------------------------------
// StdioChannel
// ---------------------------------------------------------------------------

describe('StdioChannel', () => {
  it('should start in disconnected state', () => {
    const channel = new StdioChannel('test');
    expect(channel.status).toBe('disconnected');
    expect(channel.getStatus()).toBe('disconnected');
  });

  it('should transition to connected on connect()', async () => {
    const channel = new StdioChannel('test');
    await channel.connect();
    expect(channel.status).toBe('connected');
  });

  it('should transition to disconnected on disconnect()', async () => {
    const channel = new StdioChannel('test');
    await channel.connect();
    await channel.disconnect();
    expect(channel.status).toBe('disconnected');
  });

  it('should throw when sending on disconnected channel', () => {
    const channel = new StdioChannel('test');
    expect(() => channel.send(createMockOutboundMessage())).toThrow('not connected');
  });

  it('should allow sending when connected', async () => {
    const channel = new StdioChannel('test');
    await channel.connect();
    expect(() => channel.send(createMockOutboundMessage())).not.toThrow();
  });

  it('should dispatch received lines to message handler', async () => {
    const channel = new StdioChannel('test');
    const handler = vi.fn();
    channel.onMessage(handler);

    await channel.connect();
    channel.receiveLine('hello world');

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: 'cli-default',
        content: 'hello world',
        type: 'text',
      }),
    );
  });

  it('should not dispatch when disconnected', () => {
    const channel = new StdioChannel('test');
    const handler = vi.fn();
    channel.onMessage(handler);

    channel.receiveLine('hello');
    expect(handler).not.toHaveBeenCalled();
  });

  it('should support custom line reader', async () => {
    const channel = new StdioChannel('test');
    const handler = vi.fn();
    channel.onMessage(handler);

    channel.setLineReader((line) => {
      handler({ sessionId: 'custom', content: line.toUpperCase(), type: 'text' });
    });

    await channel.connect();
    channel.receiveLine('hello');
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({ content: 'HELLO' }),
    );
  });
});

// ---------------------------------------------------------------------------
// ChannelManager
// ---------------------------------------------------------------------------

describe('ChannelManager', () => {
  let manager: ChannelManager;

  beforeEach(() => {
    manager = new ChannelManager();
  });

  // -------------------------------------------------------------------------
  // T005-02: registerChannel
  // -------------------------------------------------------------------------

  describe('registerChannel', () => {
    it('T005-02: should register a channel and make it accessible', () => {
      const channel = createMockChannel('ch-1');
      manager.registerChannel(channel);
      expect(manager.channelCount).toBe(1);
      expect(manager.getChannels().length).toBe(1);
      expect(manager.getChannel('ch-1')).toBe(channel);
    });

    it('should reject duplicate channel id', () => {
      const channel1 = createMockChannel('ch-1');
      const channel2 = createMockChannel('ch-1');
      manager.registerChannel(channel1);
      expect(() => manager.registerChannel(channel2)).toThrow('already registered');
    });

    it('should support chaining', () => {
      const result = manager.registerChannel(createMockChannel('ch-1'));
      expect(result).toBe(manager);
    });
  });

  // -------------------------------------------------------------------------
  // T005-03: unregisterChannel
  // -------------------------------------------------------------------------

  describe('unregisterChannel', () => {
    it('T005-03: should unregister a channel and disconnect it', async () => {
      const channel = createMockChannel('ch-1');
      manager.registerChannel(channel);
      expect(manager.channelCount).toBe(1);

      const removed = await manager.unregisterChannel('ch-1');
      expect(removed).toBe(true);
      expect(manager.channelCount).toBe(0);
      expect(channel.disconnect).toHaveBeenCalled();
    });

    it('should return false for unknown channel id', async () => {
      const removed = await manager.unregisterChannel('nonexistent');
      expect(removed).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // T005-04: broadcastEvent
  // -------------------------------------------------------------------------

  describe('broadcastEvent', () => {
    it('T005-04: should broadcast to all connected channels', async () => {
      const ch1 = createMockChannel('ch-1');
      const ch2 = createMockChannel('ch-2');

      manager.registerChannel(ch1);
      manager.registerChannel(ch2);

      // Connect both
      await manager.connectAll();
      expect(ch1.getStatus()).toBe('connected');
      expect(ch2.getStatus()).toBe('connected');

      const message = createMockOutboundMessage({ content: 'broadcast test' });
      const sentCount = manager.broadcastEvent(message);

      expect(sentCount).toBe(2);
      expect(ch1.send).toHaveBeenCalledWith(message);
      expect(ch2.send).toHaveBeenCalledWith(message);
    });

    it('should skip disconnected channels', async () => {
      const ch1 = createMockChannel('ch-1');
      const ch2 = createMockChannel('ch-2');

      manager.registerChannel(ch1);
      manager.registerChannel(ch2);

      // Only connect ch1
      await ch1.connect();

      const sentCount = manager.broadcastEvent(createMockOutboundMessage());
      expect(sentCount).toBe(1);
      expect(ch1.send).toHaveBeenCalled();
      expect(ch2.send).not.toHaveBeenCalled();
    });

    it('should return 0 when no channels are registered', () => {
      const sentCount = manager.broadcastEvent(createMockOutboundMessage());
      expect(sentCount).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // T005-05: Channel status tracking
  // -------------------------------------------------------------------------

  describe('status tracking', () => {
    it('T005-05: should track connected status', async () => {
      const channel = createMockChannel('ch-1');
      manager.registerChannel(channel);

      expect(channel.getStatus()).toBe('disconnected');

      await manager.connectAll();
      expect(channel.getStatus()).toBe('connected');
    });
  });

  // -------------------------------------------------------------------------
  // T005-06: Disconnect propagates
  // -------------------------------------------------------------------------

  describe('disconnect propagation', () => {
    it('T005-06: should update status on disconnect', async () => {
      const channel = createMockChannel('ch-1');
      manager.registerChannel(channel);

      await manager.connectAll();
      expect(channel.getStatus()).toBe('connected');

      await manager.unregisterChannel('ch-1');
      expect(channel.getStatus()).toBe('disconnected');
    });
  });

  // -------------------------------------------------------------------------
  // connectAll / disconnectAll
  // -------------------------------------------------------------------------

  describe('connectAll', () => {
    it('should connect all registered channels', async () => {
      manager.registerChannel(createMockChannel('ch-1'));
      manager.registerChannel(createMockChannel('ch-2'));
      manager.registerChannel(createMockChannel('ch-3'));

      const count = await manager.connectAll();
      expect(count).toBe(3);
    });

    it('should handle connect failures gracefully', async () => {
      const failingChannel = createMockChannel('ch-fail');
      (failingChannel.connect as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('connection failed'),
      );

      const goodChannel = createMockChannel('ch-good');
      manager.registerChannel(failingChannel);
      manager.registerChannel(goodChannel);

      const count = await manager.connectAll();
      expect(count).toBe(1);
    });
  });

  describe('disconnectAll', () => {
    it('should disconnect all registered channels', async () => {
      const ch1 = createMockChannel('ch-1');
      const ch2 = createMockChannel('ch-2');
      manager.registerChannel(ch1);
      manager.registerChannel(ch2);

      await manager.connectAll();
      await manager.disconnectAll();

      expect(ch1.disconnect).toHaveBeenCalled();
      expect(ch2.disconnect).toHaveBeenCalled();
    });
  });

  describe('getChannel', () => {
    it('should return undefined for unknown channel', () => {
      expect(manager.getChannel('nonexistent')).toBeUndefined();
    });
  });
});
