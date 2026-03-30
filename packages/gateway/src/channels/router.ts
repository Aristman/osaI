// ---------------------------------------------------------------------------
// Channel Router (T-004)
//
// Routes messages from WS clients to registered channel handlers.
// Dispatcher pattern: messages carry a "channel" field in their payload
// that determines which handler processes them.
//
// Architecture:
//   WS Client -> MessageHandler -> ChannelRouter.dispatch(channel, context)
//                                      |
//                                      +--> CLI handler
//                                      +--> Telegram handler (F-010)
//                                      +--> Web handler (F-012)
// ---------------------------------------------------------------------------

import pino from "pino";
import {
  type ChannelHandler,
  type ChannelContext,
  type ChannelResult,
  ChannelHandlerError,
} from "./types.js";

// ---------------------------------------------------------------------------
// ChannelRouterConfig
// ---------------------------------------------------------------------------

/** Configuration options for the ChannelRouter. */
export interface ChannelRouterConfig {
  /** Custom pino logger. If omitted, a default child logger is created. */
  readonly logger?: pino.Logger;
}

// ---------------------------------------------------------------------------
// ChannelRouter
// ---------------------------------------------------------------------------

/**
 * Routes messages to channel handlers based on channel name.
 *
 * Responsibilities:
 * - Register and unregister channel handlers
 * - Dispatch messages to the correct handler by channel name
 * - Return errors for unknown channels
 * - Provide introspection (getChannels, getHandler)
 * - Graceful shutdown (destroy all handlers)
 *
 * Extensibility:
 * New channels (Telegram, Web, etc.) are added by implementing ChannelHandler
 * and calling router.register(). No changes to the core router are needed.
 */
export class ChannelRouter {
  private readonly logger: pino.Logger;
  private readonly handlers = new Map<string, ChannelHandler>();

  constructor(config: ChannelRouterConfig = {}) {
    this.logger =
      config.logger ??
      pino({ name: "channel-router" }).child({ component: "channel-router" });
  }

  // -----------------------------------------------------------------------
  // Handler registration
  // -----------------------------------------------------------------------

  /**
   * Register a channel handler.
   *
   * @param handler - The channel handler to register
   * @throws {Error} if a handler with the same channelName is already registered
   */
  register(handler: ChannelHandler): void {
    const name = handler.channelName;

    if (this.handlers.has(name)) {
      throw new Error(
        `Channel handler already registered: "${name}". Unregister the existing handler first.`,
      );
    }

    this.handlers.set(name, handler);
    this.logger.info({ channel: name }, "Channel handler registered");
  }

  /**
   * Unregister a channel handler and destroy it.
   *
   * @param channelName - The name of the channel to unregister
   * @throws {Error} if no handler is registered for the given channel
   */
  async unregister(channelName: string): Promise<void> {
    const handler = this.handlers.get(channelName);
    if (handler === undefined) {
      throw new Error(`No channel handler registered: "${channelName}"`);
    }

    await handler.destroy();
    this.handlers.delete(channelName);
    this.logger.info({ channel: channelName }, "Channel handler unregistered");
  }

  // -----------------------------------------------------------------------
  // Message dispatch
  // -----------------------------------------------------------------------

  /**
   * Dispatch a message to the appropriate channel handler.
   *
   * @param channelName - The target channel name
   * @param context - The channel context with client ID, chat ID, and payload
   * @returns The handler's ChannelResult, or void if no response needed
   * @throws {ChannelHandlerError} if the handler throws during processing
   * @throws {ChannelHandlerError} if the channel is not registered
   */
  async dispatch(
    channelName: string,
    context: ChannelContext,
  ): Promise<ChannelResult | void> {
    const handler = this.handlers.get(channelName);

    if (handler === undefined) {
      throw new ChannelHandlerError(
        channelName,
        `Unknown channel: "${channelName}". Available channels: ${this.getChannels().join(", ") || "(none)"}`,
      );
    }

    this.logger.debug(
      { channel: channelName, clientId: context.clientId, chatId: context.chatId },
      "Dispatching message to channel handler",
    );

    try {
      const result = await handler.onMessage(context);
      return result;
    } catch (err) {
      if (err instanceof ChannelHandlerError) {
        throw err;
      }
      throw new ChannelHandlerError(
        channelName,
        `Handler "${channelName}" failed: ${err instanceof Error ? err.message : "Unknown error"}`,
        err instanceof Error ? err : undefined,
      );
    }
  }

  // -----------------------------------------------------------------------
  // Introspection
  // -----------------------------------------------------------------------

  /**
   * Get a list of all registered channel names.
   *
   * @returns Array of registered channel name strings
   */
  getChannels(): string[] {
    return Array.from(this.handlers.keys());
  }

  /**
   * Get a registered handler by channel name.
   *
   * @param channelName - The target channel name
   * @returns The channel handler, or undefined if not registered
   */
  getHandler(channelName: string): ChannelHandler | undefined {
    return this.handlers.get(channelName);
  }

  /**
   * Check if a channel handler is registered.
   *
   * @param channelName - The target channel name
   * @returns true if a handler is registered for the channel
   */
  hasChannel(channelName: string): boolean {
    return this.handlers.has(channelName);
  }

  // -----------------------------------------------------------------------
  // Lifecycle
  // -----------------------------------------------------------------------

  /**
   * Destroy all registered handlers and clear the registry.
   * Call this during gateway shutdown.
   */
  async destroy(): Promise<void> {
    this.logger.info(
      { channels: this.getChannels() },
      "Destroying all channel handlers",
    );

    const destroyPromises: Promise<void>[] = [];
    for (const handler of this.handlers.values()) {
      destroyPromises.push(handler.destroy());
    }

    await Promise.all(destroyPromises);
    this.handlers.clear();
  }
}
