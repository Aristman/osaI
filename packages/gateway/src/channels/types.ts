// ---------------------------------------------------------------------------
// Channel Types (T-004)
//
// Channel handler interface and routing types for the Gateway channel system.
// Extensible architecture: new channels (telegram, web, etc.) implement
// ChannelHandler and register with ChannelRouter.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// ChannelHandler
// ---------------------------------------------------------------------------

/**
 * Result returned by a channel handler after processing a message.
 */
export interface ChannelResult {
  /** Response payload to be sent back to the client. */
  readonly payload: Record<string, unknown>;
  /** Optional metadata about the processing (e.g., duration, handler info). */
  readonly meta?: Record<string, unknown>;
}

/**
 * Context passed to a channel handler during message processing.
 */
export interface ChannelContext {
  /** The WS client ID that sent the message. */
  readonly clientId: string;
  /** The chat ID associated with the message, if any. */
  readonly chatId?: string;
  /** The raw message payload. */
  readonly payload: Record<string, unknown>;
}

/**
 * Interface for channel handlers.
 *
 * Each channel (CLI, Telegram, Web, etc.) must implement this interface.
 * Handlers are registered with ChannelRouter and receive dispatched messages.
 *
 * Lifecycle:
 *   1. router.register(channelName, handler)
 *   2. router.dispatch(channelName, context) -> ChannelResult
 *   3. router.unregister(channelName)
 *   4. handler.destroy() (optional cleanup)
 */
export interface ChannelHandler {
  /** The unique channel name (e.g., "cli", "telegram", "web"). */
  readonly channelName: string;

  /**
   * Handle an incoming message dispatched by the ChannelRouter.
   *
   * @param context - The channel context containing client ID, chat ID, and payload
   * @returns A ChannelResult with response data, or void if no response is needed
   * @throws ChannelHandlerError on processing failures
   */
  onMessage(context: ChannelContext): Promise<ChannelResult | void>;

  /**
   * Send a proactive message to the channel (e.g., agent response, notification).
   * Used when the gateway needs to push data to the channel independently.
   *
   * @param payload - The message payload to send
   */
  send(payload: Record<string, unknown>): Promise<void>;

  /**
   * Subscribe to events from this channel.
   * Enables the handler to notify the gateway of channel-specific events.
   *
   * @param event - The event type to subscribe to
   * @param callback - Function called when the event occurs
   */
  subscribe(
    event: string,
    callback: (data: Record<string, unknown>) => void,
  ): void;

  /**
   * Destroy the handler and release all resources.
   * Called when the handler is unregistered or the gateway shuts down.
   */
  destroy(): Promise<void>;
}

// ---------------------------------------------------------------------------
// ChannelHandlerError
// ---------------------------------------------------------------------------

/**
 * Error thrown by channel handlers when message processing fails.
 * Carries the channel name for error reporting and logging.
 */
export class ChannelHandlerError extends Error {
  constructor(
    public readonly channelName: string,
    message: string,
    public readonly cause?: Error,
  ) {
    super(message);
    this.name = "ChannelHandlerError";
  }
}
