// ---------------------------------------------------------------------------
// CLI Channel Handler (T-004)
//
// Basic channel handler for the CLI channel.
// Passes messages through and supports event subscriptions.
// Extensible for future enhancements (history, formatting, etc.).
// ---------------------------------------------------------------------------

import pino from "pino";
import {
  type ChannelHandler,
  type ChannelContext,
  type ChannelResult,
} from "./types.js";

// ---------------------------------------------------------------------------
// CliHandler
// ---------------------------------------------------------------------------

/** Configuration for the CLI channel handler. */
export interface CliHandlerConfig {
  /** Custom pino logger. If omitted, a default child logger is created. */
  readonly logger?: pino.Logger;
}

/**
 * Basic CLI channel handler.
 *
 * For MVP this handler echoes the payload back as a ChannelResult.
 * Future iterations will integrate with the CLI client (ink/TUI) for
 * interactive display, command history, etc.
 *
 * Subscriptions:
 *   - "message" -- emitted when a message is received
 *   - "error" -- emitted when message processing fails
 */
export class CliHandler implements ChannelHandler {
  readonly channelName = "cli";
  private readonly logger: pino.Logger;
  private readonly subscriptions = new Map<
    string,
    Set<(data: Record<string, unknown>) => void>
  >();

  constructor(config: CliHandlerConfig = {}) {
    this.logger =
      config.logger ??
      pino({ name: "cli-handler" }).child({ component: "cli-handler", channel: "cli" });
  }

  async onMessage(context: ChannelContext): Promise<ChannelResult> {
    this.logger.debug(
      { clientId: context.clientId, chatId: context.chatId },
      "CLI handler processing message",
    );

    // Emit subscription event
    this.emit("message", {
      clientId: context.clientId,
      chatId: context.chatId,
      payload: context.payload,
    });

    return {
      payload: {
        ...context.payload,
        _channel: this.channelName,
        _handledBy: "cli-handler",
      },
    };
  }

  async send(payload: Record<string, unknown>): Promise<void> {
    this.logger.debug({ payload }, "CLI handler send (no-op in MVP)");
    // In MVP, CLI handler does not push to any external output.
    // Future: integrate with ink/TUI for display.
  }

  subscribe(
    event: string,
    callback: (data: Record<string, unknown>) => void,
  ): void {
    this.logger.debug({ event }, "CLI subscription registered");

    let callbacks = this.subscriptions.get(event);
    if (callbacks === undefined) {
      callbacks = new Set();
      this.subscriptions.set(event, callbacks);
    }
    callbacks.add(callback);
  }

  async destroy(): Promise<void> {
    this.logger.debug("CLI handler destroyed");
    this.subscriptions.clear();
  }

  // -----------------------------------------------------------------------
  // Internals
  // -----------------------------------------------------------------------

  private emit(
    event: string,
    data: Record<string, unknown>,
  ): void {
    const callbacks = this.subscriptions.get(event);
    if (callbacks !== undefined) {
      for (const cb of callbacks) {
        try {
          cb(data);
        } catch (err) {
          this.logger.error(
            { err, event },
            "CLI subscription callback error",
          );
        }
      }
    }
  }
}
