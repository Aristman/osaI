/**
 * Channel Handler Interface and ChannelManager for osaI Gateway
 *
 * Defines the IChannelHandler interface for send/receive messages,
 * lifecycle hooks, and registration/management of channel handlers.
 */

// ---------------------------------------------------------------------------
// Channel Types
// ---------------------------------------------------------------------------

/** Supported channel types */
export type ChannelType = 'cli' | 'ws' | 'telegram' | 'whatsapp' | 'api';

/** Channel status */
export type ChannelStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

/** Configuration for a channel */
export interface ChannelConfig {
  type: ChannelType;
  name: string;
  enabled?: boolean;
}

// ---------------------------------------------------------------------------
// Outbound Message (generic)
// ---------------------------------------------------------------------------

/** Generic outbound message sent through a channel */
export interface OutboundMessage {
  sessionId: string;
  content: string;
  type: 'text' | 'event' | 'error' | 'status';
  metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Message Handler
// ---------------------------------------------------------------------------

/** Handler for incoming messages from a channel */
export type ChannelMessageHandler = (message: OutboundMessage) => void;

// ---------------------------------------------------------------------------
// IChannelHandler Interface
// ---------------------------------------------------------------------------

/**
 * Interface for channel handlers.
 *
 * Each channel (CLI, WebSocket, Telegram, API) implements this interface
 * to provide a unified way to send/receive messages and manage lifecycle.
 */
export interface IChannelHandler {
  /** Unique channel identifier */
  readonly id: string;

  /** Channel type */
  readonly type: ChannelType;

  /** Channel name (human-readable) */
  readonly name: string;

  /** Current channel status */
  readonly status: ChannelStatus;

  /**
   * Connect to the channel (e.g., open WebSocket, start CLI reader).
   */
  connect(): Promise<void>;

  /**
   * Disconnect from the channel gracefully.
   */
  disconnect(): Promise<void>;

  /**
   * Send an outbound message through this channel.
   */
  send(message: OutboundMessage): void;

  /**
   * Register a handler for incoming messages from this channel.
   */
  onMessage(handler: ChannelMessageHandler): void;

  /**
   * Get current channel status.
   */
  getStatus(): ChannelStatus;
}

// ---------------------------------------------------------------------------
// StdioChannel (CLI implementation)
// ---------------------------------------------------------------------------

/**
 * StdioChannel -- CLI channel handler using stdin/stdout.
 *
 * Reads lines from stdin and dispatches them as messages.
 * Writes outbound messages to stdout.
 */
export class StdioChannel implements IChannelHandler {
  readonly id: string;
  readonly type: ChannelType = 'cli';
  readonly name: string;

  private _status: ChannelStatus = 'disconnected';
  private messageHandler: ChannelMessageHandler | null = null;
  private lineReader: (line: string) => void;

  constructor(name: string = 'cli', lineReader?: (line: string) => void) {
    this.id = `cli_${name}_${Date.now().toString(36)}`;
    this.name = name;
    // Allow injecting a custom line reader for testing
    this.lineReader = lineReader ?? this.defaultLineReader;
  }

  get status(): ChannelStatus {
    return this._status;
  }

  async connect(): Promise<void> {
    this._status = 'connected';
  }

  async disconnect(): Promise<void> {
    this._status = 'disconnected';
    this.messageHandler = null;
  }

  send(_message: OutboundMessage): void {
    if (this._status !== 'connected') {
      throw new Error(`Channel '${this.name}' is not connected (status: ${this._status})`);
    }
    // In production this would write to stdout
    // For now it's a no-op (the CLI channel is primarily for receiving)
  }

  onMessage(handler: ChannelMessageHandler): void {
    this.messageHandler = handler;
  }

  getStatus(): ChannelStatus {
    return this._status;
  }

  /**
   * Simulate receiving a line of input (used in tests and in production
   * when the CLI input loop detects a complete line).
   */
  receiveLine(line: string): void {
    if (this._status !== 'connected') return;
    this.lineReader(line);
  }

  /**
   * Set a custom line reader (for testing purposes).
   */
  setLineReader(reader: (line: string) => void): void {
    this.lineReader = reader;
  }

  /** Default line reader: parses the line and dispatches as a message. */
  private defaultLineReader(line: string): void {
    if (!this.messageHandler) return;

    const message: OutboundMessage = {
      sessionId: 'cli-default',
      content: line,
      type: 'text',
    };

    this.messageHandler(message);
  }
}

// ---------------------------------------------------------------------------
// ChannelManager
// ---------------------------------------------------------------------------

/**
 * ChannelManager -- Registry and lifecycle manager for channel handlers.
 *
 * Responsibilities:
 * - Register and unregister channels
 * - Broadcast events to all active channels
 * - Track channel statuses
 */
export class ChannelManager {
  private channels: Map<string, IChannelHandler> = new Map();

  /**
   * Register a channel handler.
   * Throws if a channel with the same id is already registered.
   */
  registerChannel(channel: IChannelHandler): this {
    if (this.channels.has(channel.id)) {
      throw new Error(`Channel with id '${channel.id}' is already registered.`);
    }
    this.channels.set(channel.id, channel);
    return this;
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

  /** Get a channel by id. */
  getChannel(channelId: string): IChannelHandler | undefined {
    return this.channels.get(channelId);
  }

  /** Get all registered channels. */
  getChannels(): readonly IChannelHandler[] {
    return Array.from(this.channels.values());
  }

  /** Get the number of registered channels. */
  get channelCount(): number {
    return this.channels.size;
  }

  /**
   * Broadcast a message to all connected channels.
   * Returns the number of channels that received the message.
   */
  broadcastEvent(message: OutboundMessage): number {
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

  /**
   * Connect all registered channels.
   * Returns the number of channels that connected successfully.
   */
  async connectAll(): Promise<number> {
    let connectedCount = 0;
    for (const channel of this.channels.values()) {
      try {
        await channel.connect();
        connectedCount++;
      } catch {
        // Skip channels that fail to connect
      }
    }
    return connectedCount;
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
}
