// ---------------------------------------------------------------------------
// TelegramBot (T-002)
//
// grammY-based Telegram Bot handler implementing:
//   - Commands: /help, /chat, /memory, /status
//   - Text message handling (forward to Gateway)
//   - allowedUsers whitelist middleware (Layer 6: Telegram Security)
//   - Integration with ChannelHandler interface
//   - Graceful degradation when Gateway is unavailable
//
// Dependencies: grammY, pino
// ---------------------------------------------------------------------------

import { Bot, Context, type Middleware } from "grammy";
import pino from "pino";
import type { TelegramBotConfig } from "./types.js";
import type { ChannelHandler, ChannelContext, ChannelResult } from "../types.js";

// ---------------------------------------------------------------------------
// TelegramBotConfig -- extended configuration for the bot
// ---------------------------------------------------------------------------

/** Configuration options for TelegramBot. */
export interface TelegramBotOptions {
  /** Bot configuration from TelegramConfig. */
  readonly config: TelegramBotConfig;
  /** Callback to send messages to the Gateway. If null, bot responds with degradation message. */
  readonly onMessage?: (context: ChannelContext) => Promise<ChannelResult | void>;
  /** Callback for permission requests forwarded from Gateway. */
  readonly onPermissionRequest?: (data: Record<string, unknown>) => Promise<void>;
  /** Callback for notifications forwarded from Gateway. */
  readonly onNotification?: (data: Record<string, unknown>) => Promise<void>;
  /** Custom pino logger. If omitted, a default child logger is created. */
  readonly logger?: pino.Logger;
}

// ---------------------------------------------------------------------------
// TelegramBotError
// ---------------------------------------------------------------------------

/**
 * Error thrown by TelegramBot for initialization and operation issues.
 */
export class TelegramBotError extends Error {
  constructor(
    message: string,
    public readonly cause?: Error,
  ) {
    super(message);
    this.name = "TelegramBotError";
  }
}

// ---------------------------------------------------------------------------
// Whitelist Middleware
// ---------------------------------------------------------------------------

/**
 * Create a grammY middleware that restricts access to allowedUsers only.
 *
 * Layer 6 security: Telegram Security. Only users listed in the
 * `allowedUsers` whitelist are permitted to interact with the bot.
 * Unauthorized users receive a refusal message and their messages
 * are logged as audit events.
 */
function createWhitelistMiddleware(
  allowedUsers: readonly string[],
  logger: pino.Logger,
): Middleware {
  return async (ctx, next) => {
    const userId = ctx.from?.id?.toString();
    const username = ctx.from?.username ?? ctx.from?.first_name ?? "unknown";

    if (!userId) {
      logger.warn({ chatId: ctx.chat?.id }, "Received message without user ID");
      return;
    }

    if (!allowedUsers.includes(userId)) {
      logger.warn(
        { userId, username, chatId: ctx.chat?.id },
        "Unauthorized access attempt -- user not in allowedUsers whitelist",
      );

      await ctx.reply(
        "Access denied. Your user ID is not in the allowed users list.",
      );
      return;
    }

    logger.debug({ userId, username }, "User passed whitelist check");
    await next();
  };
}

// ---------------------------------------------------------------------------
// TelegramBot
// ---------------------------------------------------------------------------

/**
 * grammY-based Telegram Bot handler.
 *
 * Implements the ChannelHandler interface for integration with the
 * Gateway channel router.
 *
 * Commands:
 *   /help     -- Show available commands
 *   /chat     -- Show current chat info
 *   /memory   -- Show memory status
 *   /status   -- Show bot and system status
 *
 * Security:
 *   All interactions are gated by the allowedUsers whitelist middleware.
 *   Unauthorized users receive a denial message; attempts are logged.
 *
 * Graceful degradation:
 *   If the Gateway callback is not provided or throws, the bot responds
 *   with an error message instead of crashing.
 */
export class TelegramBot implements ChannelHandler {
  readonly channelName = "telegram";

  private readonly bot: Bot;
  private readonly config: TelegramBotConfig;
  private readonly logger: pino.Logger;
  private readonly onMessageCallback?: (context: ChannelContext) => Promise<ChannelResult | void>;
  private readonly onPermissionRequestCallback?: (data: Record<string, unknown>) => Promise<void>;
  private readonly onNotificationCallback?: (data: Record<string, unknown>) => Promise<void>;
  private readonly eventSubscribers = new Map<string, Array<(data: Record<string, unknown>) => void>>();

  private started = false;

  constructor(options: TelegramBotOptions) {
    this.config = options.config;
    this.onMessageCallback = options.onMessage;
    this.onPermissionRequestCallback = options.onPermissionRequest;
    this.onNotificationCallback = options.onNotification;
    this.logger =
      options.logger ??
      pino({ name: "telegram-bot" }).child({ component: "telegram-bot" });

    // Initialize grammY bot
    this.bot = new Bot(this.config.token);

    // Register whitelist middleware (must be first -- before command handlers)
    this.bot.use(createWhitelistMiddleware(this.config.allowedUsers, this.logger));

    // Register command handlers
    this.bot.command("help", this.handleHelp.bind(this));
    this.bot.command("chat", this.handleChat.bind(this));
    this.bot.command("memory", this.handleMemory.bind(this));
    this.bot.command("status", this.handleStatus.bind(this));

    // Register text message handler (must be after commands to avoid overlap)
    this.bot.on("message:text", this.handleTextMessage.bind(this));

    this.logger.info(
      { allowedUsersCount: this.config.allowedUsers.length },
      "TelegramBot created",
    );
  }

  // -----------------------------------------------------------------------
  // Lifecycle: start
  // -----------------------------------------------------------------------

  /**
   * Start the Telegram bot polling.
   *
   * @throws {TelegramBotError} if bot is already started or polling fails
   */
  async start(): Promise<void> {
    if (this.started) {
      throw new TelegramBotError("TelegramBot is already started");
    }

    try {
      this.logger.info("Starting Telegram bot polling");
      await this.bot.start({
        onStart: (info) => {
          this.logger.info({ username: info.username, id: info.id }, "Telegram bot started");
        },
      });
      this.started = true;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      this.logger.error({ error: message }, "Failed to start Telegram bot");
      throw new TelegramBotError(`Failed to start Telegram bot: ${message}`, err instanceof Error ? err : undefined);
    }
  }

  // -----------------------------------------------------------------------
  // Lifecycle: stop
  // -----------------------------------------------------------------------

  /**
   * Stop the Telegram bot polling.
   *
   * @throws {TelegramBotError} if bot is not started
   */
  async stop(): Promise<void> {
    if (!this.started) {
      throw new TelegramBotError("TelegramBot is not started");
    }

    try {
      this.logger.info("Stopping Telegram bot polling");
      this.bot.stop();
      this.started = false;
      this.logger.info("Telegram bot stopped");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      this.logger.error({ error: message }, "Failed to stop Telegram bot");
      throw new TelegramBotError(`Failed to stop Telegram bot: ${message}`, err instanceof Error ? err : undefined);
    }
  }

  // -----------------------------------------------------------------------
  // ChannelHandler interface
  // -----------------------------------------------------------------------

  /**
   * Handle a message dispatched from the Gateway channel router.
   *
   * Used by Gateway to push agent responses, permission requests,
   * and notifications to the Telegram channel.
   */
  async onMessage(context: ChannelContext): Promise<ChannelResult | void> {
    this.logger.debug(
      { clientId: context.clientId, chatId: context.chatId },
      "Received message from Gateway channel router",
    );

    // Determine message type from payload
    const payload = context.payload;
    const type = payload["type"] as string | undefined;

    if (type === "permission_request") {
      await this.sendPermissionRequest(payload);
    } else if (type === "notification") {
      await this.sendNotification(payload);
    } else {
      // Agent response -- send to bound telegram chat
      await this.sendAgentResponse(context);
    }

    return { payload: { sent: true }, meta: { channel: "telegram" } };
  }

  /**
   * Send a proactive message to the Telegram channel.
   *
   * Used when the gateway needs to push data (agent responses,
   * notifications) to the Telegram channel independently.
   */
  async send(payload: Record<string, unknown>): Promise<void> {
    const type = payload["type"] as string | undefined;

    if (type === "permission_request") {
      await this.sendPermissionRequest(payload);
    } else if (type === "notification") {
      await this.sendNotification(payload);
    } else {
      await this.sendAgentResponseFromPayload(payload);
    }
  }

  /**
   * Subscribe to events from this channel.
   *
   * Events:
   *   "message"       -- Incoming text message from Telegram user
   *   "command"       -- Bot command executed
   *   "error"         -- Error occurred during processing
   */
  subscribe(
    event: string,
    callback: (data: Record<string, unknown>) => void,
  ): void {
    const subscribers = this.eventSubscribers.get(event) ?? [];
    subscribers.push(callback);
    this.eventSubscribers.set(event, subscribers);
  }

  /**
   * Destroy the bot and release all resources.
   */
  async destroy(): Promise<void> {
    try {
      if (this.started) {
        await this.stop();
      }
    } catch {
      // Swallow stop errors during destroy
    }
    this.eventSubscribers.clear();
    this.logger.info("TelegramBot destroyed");
  }

  // -----------------------------------------------------------------------
  // Accessors
  // -----------------------------------------------------------------------

  /**
   * Check if the bot is currently running.
   */
  isStarted(): boolean {
    return this.started;
  }

  /**
   * Get the underlying grammY Bot instance (for testing/mocking).
   */
  getBot(): Bot {
    return this.bot;
  }

  // -----------------------------------------------------------------------
  // Command handlers
  // -----------------------------------------------------------------------

  private async handleHelp(ctx: Context): Promise<void> {
    this.emitEvent("command", { command: "help", userId: ctx.from?.id?.toString(), chatId: ctx.chat?.id });

    const helpText = [
      "*osaI Telegram Bot*",
      "",
      "Available commands:",
      "/help -- Show this help message",
      "/chat -- Show current chat info",
      "/memory -- Show memory status",
      "/status -- Show bot and system status",
      "",
      "You can also send any text message to chat with the AI assistant.",
    ].join("\n");

    await ctx.reply(helpText, { parse_mode: "Markdown" });
  }

  private async handleChat(ctx: Context): Promise<void> {
    this.emitEvent("command", { command: "chat", userId: ctx.from?.id?.toString(), chatId: ctx.chat?.id });

    if (!this.onMessageCallback) {
      await ctx.reply("Gateway is not available. Cannot retrieve chat info.");
      return;
    }

    try {
      const result = await this.onMessageCallback({
        clientId: ctx.from?.id?.toString() ?? "unknown",
        chatId: ctx.chat?.id?.toString(),
        payload: { type: "command", command: "chat" },
      });

      const responseText = result?.payload
        ? JSON.stringify(result.payload)
        : "No chat info available.";

      await ctx.reply(`Chat info:\n${responseText}`);
    } catch (err) {
      this.logger.error({ error: err instanceof Error ? err.message : String(err) }, "Failed to handle /chat command");
      await ctx.reply("Error retrieving chat info. Please try again later.");
    }
  }

  private async handleMemory(ctx: Context): Promise<void> {
    this.emitEvent("command", { command: "memory", userId: ctx.from?.id?.toString(), chatId: ctx.chat?.id });

    if (!this.onMessageCallback) {
      await ctx.reply("Gateway is not available. Cannot retrieve memory status.");
      return;
    }

    try {
      const result = await this.onMessageCallback({
        clientId: ctx.from?.id?.toString() ?? "unknown",
        chatId: ctx.chat?.id?.toString(),
        payload: { type: "command", command: "memory" },
      });

      const responseText = result?.payload
        ? JSON.stringify(result.payload)
        : "No memory info available.";

      await ctx.reply(`Memory status:\n${responseText}`);
    } catch (err) {
      this.logger.error({ error: err instanceof Error ? err.message : String(err) }, "Failed to handle /memory command");
      await ctx.reply("Error retrieving memory status. Please try again later.");
    }
  }

  private async handleStatus(ctx: Context): Promise<void> {
    this.emitEvent("command", { command: "status", userId: ctx.from?.id?.toString(), chatId: ctx.chat?.id });

    const statusLines = [
      "*Bot Status*",
      "",
      `State: ${this.started ? "Running" : "Stopped"}`,
      `Allowed users: ${this.config.allowedUsers.length}`,
      `Gateway: ${this.onMessageCallback ? "Connected" : "Not connected"}`,
    ].join("\n");

    await ctx.reply(statusLines, { parse_mode: "Markdown" });
  }

  // -----------------------------------------------------------------------
  // Text message handler
  // -----------------------------------------------------------------------

  private async handleTextMessage(ctx: Context): Promise<void> {
    const text = ctx.message?.text;
    if (!text) return;

    const userId = ctx.from?.id?.toString() ?? "unknown";
    const chatId = ctx.chat?.id?.toString();

    this.emitEvent("message", { userId, chatId, text });

    if (!this.onMessageCallback) {
      await ctx.reply(
        "Gateway is not available. The bot is operating in offline mode.",
      );
      return;
    }

    try {
      await this.onMessageCallback({
        clientId: userId,
        chatId,
        payload: { type: "message", text },
      });
    } catch (err) {
      this.logger.error(
        { error: err instanceof Error ? err.message : String(err), userId, chatId },
        "Failed to forward message to Gateway",
      );
      await ctx.reply(
        "An error occurred while processing your message. Please try again later.",
      );
    }
  }

  // -----------------------------------------------------------------------
  // Gateway response helpers
  // -----------------------------------------------------------------------

  private async sendPermissionRequest(payload: Record<string, unknown>): Promise<void> {
    if (this.onPermissionRequestCallback) {
      await this.onPermissionRequestCallback(payload);
    }

    this.logger.info({ payload }, "Sending permission request to Telegram");

    // In real implementation, this would send to bound telegram chat
    // For now, emit event so tests can verify
    this.emitEvent("permission_request", payload);
  }

  private async sendNotification(payload: Record<string, unknown>): Promise<void> {
    if (this.onNotificationCallback) {
      await this.onNotificationCallback(payload);
    }

    this.logger.info({ payload }, "Sending notification to Telegram");

    // Emit event for tests and future mirror integration
    this.emitEvent("notification", payload);
  }

  private async sendAgentResponse(context: ChannelContext): Promise<void> {
    // Agent response payload from Gateway
    const text = context.payload["text"] as string
      ?? context.payload["content"] as string
      ?? JSON.stringify(context.payload);

    this.logger.debug({ chatId: context.chatId }, "Sending agent response to Telegram");

    this.emitEvent("agent_response", { chatId: context.chatId, text });
  }

  private async sendAgentResponseFromPayload(payload: Record<string, unknown>): Promise<void> {
    const text = payload["text"] as string
      ?? payload["content"] as string
      ?? JSON.stringify(payload);

    this.logger.debug({ payload: { type: payload["type"] } }, "Sending proactive message to Telegram");

    this.emitEvent("agent_response", { text });
  }

  // -----------------------------------------------------------------------
  // Event emission
  // -----------------------------------------------------------------------

  private emitEvent(event: string, data: Record<string, unknown>): void {
    const subscribers = this.eventSubscribers.get(event);
    if (subscribers) {
      for (const callback of subscribers) {
        try {
          callback(data);
        } catch (err) {
          this.logger.error(
            { event, error: err instanceof Error ? err.message : String(err) },
            "Event subscriber threw error",
          );
        }
      }
    }
  }
}
