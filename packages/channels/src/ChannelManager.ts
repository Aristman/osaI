/**
 * ChannelManager -- Registry and lifecycle manager for channel handlers.
 *
 * Provides registration, lookup, bulk connect/disconnect, and broadcast
 * capabilities for all registered messaging channels.
 */

import type { OutboundMessage } from '@osai/gateway';
import { BaseChannelHandler } from './ChannelHandler.js';

// ---------------------------------------------------------------------------
// Channel Info (lightweight descriptor)
// ---------------------------------------------------------------------------

export interface ChannelInfo {
  id: string;
  name: string;
  type: string;
  status: string;
}

// ---------------------------------------------------------------------------
// ChannelManager
// ---------------------------------------------------------------------------

/**
 * Registry and lifecycle manager for messaging channel handlers.
 *
 * Responsibilities:
 * - Register and unregister channels
 * - Track channel statuses
 * - Connect/disconnect all channels
 * - Broadcast messages to all connected channels
 */
export class ChannelManager {
  private readonly channels: Map<string, BaseChannelHandler> = new Map();

  /**
   * Register a channel handler.
   * Throws if a channel with the same id is already registered.
   */
  registerChannel(channel: BaseChannelHandler): void {
    if (this.channels.has(channel.id)) {
      throw new Error(`Channel with id '${channel.id}' is already registered.`);
    }
    this.channels.set(channel.id, channel);
  }

  /**
   * Unregister a channel handler by id.
   * Disconnects the channel before removing it.
   * Returns true if the channel was found and removed.
   */
  async unregisterChannel(channelId: string): Promise<boolean> {
    const channel = this.channels.get(channelId);
    if (!channel) return false;

    try {
      await channel.disconnect();
    } catch {
      // Swallow disconnect errors during unregister
    }

    this.channels.delete(channelId);
    return true;
  }

  /**
   * Get a channel by id.
   */
  getChannel(channelId: string): BaseChannelHandler | undefined {
    return this.channels.get(channelId);
  }

  /**
   * List all registered channels with their status info.
   */
  listChannels(): ChannelInfo[] {
    return Array.from(this.channels.values()).map((channel) => ({
      id: channel.id,
      name: channel.name,
      type: channel.type,
      status: channel.getStatus(),
    }));
  }

  /**
   * Connect all registered channels.
   */
  async connectAll(): Promise<void> {
    const promises = Array.from(this.channels.values()).map(async (channel) => {
      try {
        await channel.connect();
      } catch {
        // Skip channels that fail to connect
      }
    });
    await Promise.all(promises);
  }

  /**
   * Disconnect all registered channels.
   */
  async disconnectAll(): Promise<void> {
    const promises = Array.from(this.channels.values()).map(async (channel) => {
      try {
        await channel.disconnect();
      } catch {
        // Swallow errors
      }
    });
    await Promise.all(promises);
  }

  /**
   * Broadcast a message to all connected channels.
   * Returns the number of channels that received the message.
   */
  async broadcast(message: OutboundMessage): Promise<number> {
    let sentCount = 0;
    for (const channel of this.channels.values()) {
      if (channel.getStatus() === 'connected') {
        try {
          channel.send(message);
          sentCount++;
        } catch {
          // Skip channels that fail to send
        }
      }
    }
    return sentCount;
  }
}
