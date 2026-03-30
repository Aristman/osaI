// ---------------------------------------------------------------------------
// Telegram Types (T-001)
//
// Type definitions for Telegram Integration (DOMAIN-006).
// Covers configuration schema, bridge protocol types (JSON-over-stdio),
// and manager status types.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// TelegramConfig -- configuration for the telegram channel section
// ---------------------------------------------------------------------------

/** Configuration for the Telegram Bot (grammY). */
export interface TelegramBotConfig {
  /** Whether the Telegram bot is enabled. */
  readonly enabled: boolean;
  /** Bot API token from @BotFather. */
  readonly token: string;
  /** Whitelist of Telegram user IDs allowed to interact with the bot. */
  readonly allowedUsers: readonly string[];
}

/** Configuration for the Telegram Userbot (Telethon Python microservice). */
export interface TelegramUserbotConfig {
  /** Whether the userbot bridge is enabled. */
  readonly enabled: boolean;
  /** Telegram API ID (from my.telegram.org). */
  readonly apiId: number;
  /** Telegram API Hash (from my.telegram.org). */
  readonly apiHash: string;
  /** Phone number for Telethon authentication. */
  readonly phone: string;
}

/** Mirror direction control. */
export type MirrorDirection = "both" | "osai-to-tg" | "tg-to-osai";

/**
 * Configuration for a single mirror mapping.
 *
 * Maps an osaI chat to a Telegram chat/channel for bidirectional
 * or unidirectional message forwarding.
 */
export interface MirrorConfig {
  /** The osaI chat ID to mirror. */
  readonly chatId: string;
  /** The Telegram chat/channel ID to mirror to/from. */
  readonly telegramChatId: number;
  /** Mirror direction: both, osai-to-tg, or tg-to-osai. */
  readonly direction: MirrorDirection;
}

/**
 * Full Telegram channel configuration.
 *
 * Corresponds to the `channels.telegram` section in osai.json.
 * Controls bot, userbot, and mirror settings.
 */
export interface TelegramConfig {
  /** Telegram Bot configuration. */
  readonly bot: TelegramBotConfig;
  /** Telegram Userbot configuration. */
  readonly userbot: TelegramUserbotConfig;
  /** Mirror configurations for bidirectional chat forwarding. */
  readonly mirrors: readonly MirrorConfig[];
}

// ---------------------------------------------------------------------------
// Bridge Protocol Types (JSON-over-stdio between Node.js and Telethon)
// ---------------------------------------------------------------------------

/** Request types that Node.js can send to the Telethon Python process. */
export type BridgeRequestType =
  | "auth"
  | "send_message"
  | "listen"
  | "get_chats"
  | "health";

/** Response types from the Telethon Python process. */
export type BridgeResponseType =
  | "auth_result"
  | "message"
  | "send_result"
  | "error"
  | "health";

/**
 * Request sent from Node.js parent to Telethon Python child process.
 *
 * Protocol: JSON lines over stdio (newline-delimited JSON).
 * Each request has a unique `id` for correlation with responses.
 */
export interface BridgeRequest {
  /** Request type discriminator. */
  readonly type: BridgeRequestType;
  /** Unique correlation ID for matching responses. */
  readonly id: string;
  /** Request parameters (depend on type). */
  readonly params: Record<string, unknown>;
}

/**
 * Response received from Telethon Python child process to Node.js parent.
 *
 * Protocol: JSON lines over stdio (newline-delimited JSON).
 * The `id` field matches the originating BridgeRequest.
 */
export interface BridgeResponse {
  /** Response type discriminator. */
  readonly type: BridgeResponseType;
  /** Correlation ID matching the originating BridgeRequest. */
  readonly id: string;
  /** Response data (depends on type). */
  readonly data: unknown;
}

// ---------------------------------------------------------------------------
// TelegramManager Status Types
// ---------------------------------------------------------------------------

/** Operating mode of the TelegramManager. */
export type TelegramManagerMode = "bot-only" | "bot+userbot";

/** Status of an individual Telegram component. */
export type ComponentStatus = "stopped" | "starting" | "running" | "stopping" | "error";

/**
 * Status information for an individual Telegram component (bot, userbot, mirror).
 */
export interface ComponentStatusInfo {
  /** Current lifecycle status. */
  status: ComponentStatus;
  /** Optional error message if status is "error". */
  error?: string;
}

/**
 * Overall TelegramManager status.
 *
 * Returned by `TelegramManager.getStatus()` for monitoring and diagnostics.
 */
export interface TelegramManagerStatus {
  /** Whether the manager has been started. */
  readonly started: boolean;
  /** Operating mode: bot-only or bot+userbot. */
  readonly mode: TelegramManagerMode;
  /** Status of the Telegram Bot (grammY). */
  readonly bot: ComponentStatusInfo;
  /** Status of the Telegram Userbot bridge (Telethon). */
  readonly userbot: ComponentStatusInfo;
  /** Status of the Mirror Engine. */
  readonly mirror: ComponentStatusInfo;
  /** Timestamp of the last status change (ISO 8601). */
  readonly lastChanged: string;
}
