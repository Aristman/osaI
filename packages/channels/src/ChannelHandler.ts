/**
 * BaseChannelHandler -- Abstract base class for messaging channel handlers.
 *
 * Extends IChannelHandler from @osai/gateway with common lifecycle
 * and status management for all channel implementations.
 */

import type {
  IChannelHandler,
  ChannelType,
  ChannelStatus,
  ChannelMessageHandler,
  OutboundMessage,
} from '@osai/gateway';

// ---------------------------------------------------------------------------
// Channel Configuration
// ---------------------------------------------------------------------------

/** Configuration for a messaging channel */
export interface ChannelConfig {
  enabled: boolean;
  token?: string;
  options?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// BaseChannelHandler
// ---------------------------------------------------------------------------

/**
 * Abstract base class for all messaging channel handlers.
 *
 * Provides default status management and ID generation.
 * Concrete implementations must provide connect, disconnect, send,
 * and onMessage logic.
 */
export abstract class BaseChannelHandler implements IChannelHandler {
  protected _status: ChannelStatus = 'disconnected';
  protected _name: string;
  readonly id: string;

  constructor(id: string, name: string, protected readonly _type: ChannelType) {
    this.id = id;
    this._name = name;
  }

  /** Channel type identifier */
  get type(): ChannelType {
    return this._type;
  }

  /** Human-readable channel name */
  get name(): string {
    return this._name;
  }

  /** Current channel status */
  get status(): ChannelStatus {
    return this._status;
  }

  /**
   * Connect to the messaging channel.
   * Must set _status to 'connected' on success or 'error' on failure.
   */
  abstract connect(): Promise<void>;

  /**
   * Disconnect from the messaging channel.
   * Must set _status to 'disconnected'.
   */
  abstract disconnect(): Promise<void>;

  /**
   * Send a message through this channel.
   */
  abstract send(message: OutboundMessage): void;

  /**
   * Register a handler for incoming messages from this channel.
   */
  abstract onMessage(handler: ChannelMessageHandler): void;

  /**
   * Get the current channel status.
   */
  getStatus(): ChannelStatus {
    return this._status;
  }

  /**
   * Set the channel status (used by subclasses).
   */
  protected setStatus(status: ChannelStatus): void {
    this._status = status;
  }
}
