// ---------------------------------------------------------------------------
// TelegramManager (T-001)
//
// Lifecycle coordinator for the Telegram channel components:
//   - Telegram Bot (grammY) -- T-002
//   - Telegram Userbot Bridge (Telethon Python microservice) -- T-003/T-004
//   - Mirror Engine -- T-006/T-007/T-008
//
// In T-001 scope, bot/userbot/mirror are stubs (not yet implemented).
// The manager handles configuration validation, mode selection (bot-only vs
// bot+userbot), and lifecycle orchestration (start/stop/status).
//
// Dependencies: pino for structured logging.
// ---------------------------------------------------------------------------

import pino from "pino";
import type {
  TelegramConfig,
  TelegramManagerMode,
  ComponentStatus,
  ComponentStatusInfo,
  TelegramManagerStatus,
} from "./types.js";

// ---------------------------------------------------------------------------
// TelegramManagerConfig
// ---------------------------------------------------------------------------

/** Configuration options for the TelegramManager. */
export interface TelegramManagerConfig {
  /** The telegram section from osai.json. */
  readonly config: TelegramConfig;
  /** Custom pino logger. If omitted, a default child logger is created. */
  readonly logger?: pino.Logger;
}

// ---------------------------------------------------------------------------
// TelegramManagerError
// ---------------------------------------------------------------------------

/**
 * Error thrown by TelegramManager for lifecycle and configuration issues.
 * Carries structured context for logging and debugging.
 */
export class TelegramManagerError extends Error {
  constructor(
    message: string,
    public readonly cause?: Error,
  ) {
    super(message);
    this.name = "TelegramManagerError";
  }
}

// ---------------------------------------------------------------------------
// TelegramManager
// ---------------------------------------------------------------------------

/**
 * Lifecycle coordinator for Telegram integration components.
 *
 * Responsibilities:
 * - Validate Telegram configuration on construction
 * - Determine operating mode (bot-only vs bot+userbot)
 * - Orchestrate start/stop lifecycle for bot, userbot, and mirror
 * - Provide status information for monitoring
 * - Graceful degradation: bot-only mode when userbot is disabled or unavailable
 *
 * Architecture:
 *   TelegramManager
 *     +--> TelegramBot (grammY)          -- T-002 (stub in T-001)
 *     +--> UserbotBridge (Telethon)      -- T-003 (stub in T-001)
 *     +--> MirrorEngine                   -- T-006 (stub in T-001)
 *
 * Bot-only mode:
 *   When `config.userbot.enabled` is false, the manager operates in
 *   bot-only mode. Userbot and mirror components are not started.
 *   This is the graceful degradation path.
 */
export class TelegramManager {
  private readonly logger: pino.Logger;
  private readonly config: TelegramConfig;
  private readonly mode: TelegramManagerMode;

  private started = false;
  private botStatus: ComponentStatusInfo = { status: "stopped" };
  private userbotStatus: ComponentStatusInfo = { status: "stopped" };
  private mirrorStatus: ComponentStatusInfo = { status: "stopped" };
  private lastChanged = new Date().toISOString();

  constructor(managerConfig: TelegramManagerConfig) {
    this.config = managerConfig.config;
    this.logger =
      managerConfig.logger ??
      pino({ name: "telegram-manager" }).child({ component: "telegram-manager" });

    // Determine operating mode based on userbot.enabled
    this.mode = this.config.userbot.enabled ? "bot+userbot" : "bot-only";

    this.logger.info(
      { mode: this.mode, botEnabled: this.config.bot.enabled, userbotEnabled: this.config.userbot.enabled },
      "TelegramManager created",
    );
  }

  // -----------------------------------------------------------------------
  // Lifecycle: start
  // -----------------------------------------------------------------------

  /**
   * Start the Telegram channel components.
   *
   * Start order:
   *   1. Bot (if enabled)
   *   2. Userbot bridge (if enabled and mode is bot+userbot)
   *   3. Mirror engine (if mirrors are configured)
   *
   * In T-001, all starts are stubs. Components will be implemented in
   * subsequent tasks (T-002, T-003, T-006).
   *
   * @throws {TelegramManagerError} if already started or a component fails
   */
  async start(): Promise<void> {
    if (this.started) {
      throw new TelegramManagerError("TelegramManager is already started");
    }

    this.logger.info({ mode: this.mode }, "Starting Telegram channel");

    // Step 1: Start bot (if enabled)
    if (this.config.bot.enabled) {
      try {
        this.updateComponentStatus("bot", "starting");
        // Stub: actual bot start will be implemented in T-002
        this.logger.info("Telegram bot start (stub)");
        this.updateComponentStatus("bot", "running");
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        this.updateComponentStatus("bot", "error", message);
        throw new TelegramManagerError(
          `Failed to start Telegram bot: ${message}`,
          err instanceof Error ? err : undefined,
        );
      }
    } else {
      this.logger.info("Telegram bot is disabled, skipping");
    }

    // Step 2: Start userbot bridge (if enabled and in bot+userbot mode)
    if (this.mode === "bot+userbot") {
      try {
        this.updateComponentStatus("userbot", "starting");
        // Stub: actual userbot start will be implemented in T-003
        this.logger.info("Telegram userbot bridge start (stub)");
        this.updateComponentStatus("userbot", "running");
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        this.updateComponentStatus("userbot", "error", message);
        this.logger.warn(
          { error: message },
          "Userbot bridge failed to start, continuing in bot-only mode",
        );
        // Graceful degradation: continue without userbot
      }
    }

    // Step 3: Start mirror engine (if mirrors are configured)
    if (this.config.mirrors.length > 0) {
      try {
        this.updateComponentStatus("mirror", "starting");
        // Stub: actual mirror start will be implemented in T-006
        this.logger.info(
          { mirrorCount: this.config.mirrors.length },
          "Telegram mirror engine start (stub)",
        );
        this.updateComponentStatus("mirror", "running");
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        this.updateComponentStatus("mirror", "error", message);
        this.logger.warn(
          { error: message },
          "Mirror engine failed to start, continuing without mirroring",
        );
        // Graceful degradation: continue without mirror
      }
    }

    this.started = true;
    this.lastChanged = new Date().toISOString();
    this.logger.info(
      {
        mode: this.mode,
        bot: this.botStatus.status,
        userbot: this.userbotStatus.status,
        mirror: this.mirrorStatus.status,
      },
      "Telegram channel started",
    );
  }

  // -----------------------------------------------------------------------
  // Lifecycle: stop
  // -----------------------------------------------------------------------

  /**
   * Stop the Telegram channel components.
   *
   * Stop order (reverse of start):
   *   1. Mirror engine
   *   2. Userbot bridge
   *   3. Bot
   *
   * Errors during individual component stop are logged but do not prevent
   * other components from being stopped.
   *
   * @throws {TelegramManagerError} if not started
   */
  async stop(): Promise<void> {
    if (!this.started) {
      throw new TelegramManagerError("TelegramManager is not started");
    }

    this.logger.info("Stopping Telegram channel");

    // Step 1: Stop mirror engine
    if (this.mirrorStatus.status === "running") {
      try {
        this.updateComponentStatus("mirror", "stopping");
        // Stub: actual mirror stop will be implemented in T-006
        this.logger.info("Telegram mirror engine stop (stub)");
        this.updateComponentStatus("mirror", "stopped");
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        this.updateComponentStatus("mirror", "error", message);
        this.logger.error({ error: message }, "Failed to stop mirror engine");
      }
    }

    // Step 2: Stop userbot bridge
    if (this.userbotStatus.status === "running") {
      try {
        this.updateComponentStatus("userbot", "stopping");
        // Stub: actual userbot stop will be implemented in T-003
        this.logger.info("Telegram userbot bridge stop (stub)");
        this.updateComponentStatus("userbot", "stopped");
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        this.updateComponentStatus("userbot", "error", message);
        this.logger.error({ error: message }, "Failed to stop userbot bridge");
      }
    }

    // Step 3: Stop bot
    if (this.botStatus.status === "running") {
      try {
        this.updateComponentStatus("bot", "stopping");
        // Stub: actual bot stop will be implemented in T-002
        this.logger.info("Telegram bot stop (stub)");
        this.updateComponentStatus("bot", "stopped");
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        this.updateComponentStatus("bot", "error", message);
        this.logger.error({ error: message }, "Failed to stop Telegram bot");
      }
    }

    this.started = false;
    this.lastChanged = new Date().toISOString();
    this.logger.info("Telegram channel stopped");
  }

  // -----------------------------------------------------------------------
  // Status
  // -----------------------------------------------------------------------

  /**
   * Get the current status of all Telegram components.
   *
   * @returns Status object with component states and mode information
   */
  getStatus(): TelegramManagerStatus {
    return {
      started: this.started,
      mode: this.mode,
      bot: { ...this.botStatus },
      userbot: { ...this.userbotStatus },
      mirror: { ...this.mirrorStatus },
      lastChanged: this.lastChanged,
    };
  }

  // -----------------------------------------------------------------------
  // Accessors
  // -----------------------------------------------------------------------

  /**
   * Get the operating mode (bot-only or bot+userbot).
   */
  getMode(): TelegramManagerMode {
    return this.mode;
  }

  /**
   * Check if the manager is currently started.
   */
  isStarted(): boolean {
    return this.started;
  }

  /**
   * Get the Telegram configuration.
   */
  getConfig(): TelegramConfig {
    return this.config;
  }

  // -----------------------------------------------------------------------
  // Private helpers
  // -----------------------------------------------------------------------

  private updateComponentStatus(
    component: "bot" | "userbot" | "mirror",
    status: ComponentStatus,
    error?: string,
  ): void {
    const info: ComponentStatusInfo = { status };
    if (error !== undefined) {
      info.error = error;
    }

    switch (component) {
      case "bot":
        this.botStatus = info;
        break;
      case "userbot":
        this.userbotStatus = info;
        break;
      case "mirror":
        this.mirrorStatus = info;
        break;
    }

    this.lastChanged = new Date().toISOString();
  }
}
