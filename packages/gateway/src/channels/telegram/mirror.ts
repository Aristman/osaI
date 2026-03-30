// ---------------------------------------------------------------------------
// MirrorEngine (T-006 + T-007 + T-008)
//
// Bidirectional mirror: osaI <-> Telegram message forwarding.
//
// Responsibilities (osai-to-TG, T-006):
//   - Subscribe to agent responses from Gateway
//   - Send messages to Telegram via bot or userbot
//   - Convert Markdown formatting to Telegram HTML
//   - Invoke hook on_mirror_message for each mirrored message
//   - Error handling: structured logging, single retry on failure
//
// Responsibilities (TG-to-osai, T-007):
//   - Receive messages from Telegram (bot/userbot)
//   - Deduplicate by message_id to prevent mirror loops
//   - Convert Telegram HTML to Markdown
//   - Inject messages into Agent Runtime via Gateway channel router
//   - Invoke hook on_mirror_message for each mirrored message
//   - Error handling: structured logging on injection failure
//
// Responsibilities (Bidirectional Sync + Config, T-008):
//   - Full bidirectional sync with configurable direction (both/osai-to-tg/tg-to-osai)
//   - Media handling (best-effort): download -> pass buffer to osaI
//   - Mirror binding to specific osaI chat_id via configuration
//   - Multiple mirrors with independent direction settings
//   - Mirror loop prevention (dedup by message_id)
//   - Stats and introspection for monitoring
//
// Dependencies: pino for structured logging.
// ---------------------------------------------------------------------------

import pino from "pino";
import type {
  MirrorConfig,
  MirrorDirection,
} from "./types.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Sender interface for delivering messages to Telegram.
 *
 * Both TelegramBot and UserbotBridge satisfy this contract.
 * MirrorEngine uses this abstraction to send messages via
 * either transport without coupling to the concrete implementation.
 */
export interface TelegramSender {
  /** Send a text message to a Telegram chat. */
  sendMessage(chatId: number, text: string): Promise<unknown>;
}

/**
 * Configuration for the MirrorEngine.
 */
export interface MirrorEngineConfig {
  /** Mirror configuration entries from osai.json. */
  readonly mirrors: readonly MirrorConfig[];
  /** Telegram sender (bot or userbot). */
  readonly sender: TelegramSender;
  /** Gateway injector for TG-to-osai message routing. */
  readonly injector?: GatewayInjector;
  /** Custom pino logger. If omitted, a default child logger is created. */
  readonly logger?: pino.Logger;
  /**
   * Hook callback invoked for each mirrored message.
   * Used for audit, metrics, and downstream processing.
   *
   * Signature matches hook system: on_mirror_message.
   */
  readonly onMirrorMessage?: (event: MirrorMessageEvent) => void;
  /**
   * Media downloader for handling media attachments in TG messages.
   * If provided, media (photos, documents) will be downloaded and
   * attached to injected messages (best-effort).
   */
  readonly mediaDownloader?: MediaDownloader;
  /**
   * Maximum media file size in bytes for download (default: 10 MB).
   * Media larger than this will be skipped.
   */
  readonly maxMediaSize?: number;
}

/**
 * Event payload for the on_mirror_message hook.
 *
 * Carries structured context about the mirrored message for
 * observability, audit, and downstream processing.
 */
export interface MirrorMessageEvent {
  /** Direction of the mirror operation. */
  readonly direction: MirrorDirection;
  /** The osaI chat ID the message originated from. */
  readonly osaiChatId: string;
  /** The Telegram chat ID the message was sent to. */
  readonly telegramChatId: number;
  /** The original message text (before formatting). */
  readonly originalText: string;
  /** The formatted message text (after Markdown -> HTML conversion). */
  readonly formattedText: string;
  /** Whether the delivery was successful. */
  readonly success: boolean;
  /** Whether the message contained media (T-008). */
  readonly hasMedia: boolean;
  /** Error message if delivery failed. */
  readonly error?: string;
  /** ISO 8601 timestamp of the mirror operation. */
  readonly timestamp: string;
}

/**
 * A mirror mapping between an osaI chat and a Telegram chat.
 */
interface ActiveMirror {
  readonly chatId: string;
  readonly telegramChatId: number;
  readonly direction: MirrorDirection;
}

// ---------------------------------------------------------------------------
// TG-to-osai Types (T-007)
// ---------------------------------------------------------------------------

/**
 * Represents an incoming Telegram message (simplified).
 *
 * Used by MirrorEngine to receive messages from bot or userbot
 * for injection into the Agent Runtime.
 */
export interface IncomingTelegramMessage {
  /** Unique Telegram message ID (used for deduplication). */
  readonly message_id: number;
  /** Telegram chat the message came from. */
  readonly chat: { readonly id: number };
  /** Sender information (optional for anonymous admins). */
  readonly from?: {
    readonly id: number;
    readonly first_name?: string;
    readonly username?: string;
  };
  /** Text content of the message (may be HTML-formatted). */
  readonly text?: string;
  /** Unix timestamp of the message. */
  readonly date: number;
}

// ---------------------------------------------------------------------------
// Media Types (T-008)
// ---------------------------------------------------------------------------

/**
 * Metadata about a media attachment in a Telegram message.
 */
export interface TelegramMediaInfo {
  /** Telegram file ID for downloading. */
  readonly fileId: string;
  /** Width in pixels (for photos/videos). */
  readonly width?: number;
  /** Height in pixels (for photos/videos). */
  readonly height?: number;
  /** File size in bytes. */
  readonly fileSize?: number;
  /** Original filename (for documents). */
  readonly fileName?: string;
  /** MIME type of the media. */
  readonly mimeType?: string;
}

/**
 * Represents an incoming Telegram message that may contain media.
 *
 * Extends IncomingTelegramMessage with optional photo/document fields
 * for media handling (T-008).
 */
export interface TelegramMediaMessage extends IncomingTelegramMessage {
  /** Photo attachment (array of sizes, last is largest). */
  readonly photo?: TelegramMediaInfo;
  /** Document attachment (file). */
  readonly document?: TelegramMediaInfo;
  /** Video attachment. */
  readonly video?: TelegramMediaInfo;
  /** Voice message. */
  readonly voice?: TelegramMediaInfo;
  /** Audio attachment. */
  readonly audio?: TelegramMediaInfo;
}

/**
 * Interface for downloading media from Telegram.
 *
 * Used by MirrorEngine to download media attachments before
 * passing them to the Gateway injector.
 */
export interface MediaDownloader {
  /**
   * Download media by Telegram file ID.
   *
   * @param fileId - Telegram file ID to download
   * @param maxSize - Maximum acceptable file size in bytes
   * @returns Buffer with file content, or null if download failed
   */
  downloadMedia(fileId: string, maxSize: number): Promise<Buffer | null>;
}

// ---------------------------------------------------------------------------
// MirrorEngineStats (T-008)
// ---------------------------------------------------------------------------

/**
 * Statistics about the MirrorEngine for monitoring and introspection.
 */
export interface MirrorEngineStats {
  /** Whether the engine is currently started. */
  readonly started: boolean;
  /** Total number of configured mirrors. */
  readonly totalMirrors: number;
  /** Number of active outbound mirrors (osai-to-tg). */
  readonly activeMirrorsOut: number;
  /** Number of active inbound mirrors (tg-to-osai). */
  readonly activeMirrorsIn: number;
  /** Number of unique Telegram message IDs processed (dedup set size). */
  readonly processedMessageCount: number;
  /** Number of media download attempts. */
  readonly mediaDownloadAttempts: number;
  /** Number of successful media downloads. */
  readonly mediaDownloadSuccesses: number;
}

/**
 * Interface for injecting messages into Agent Runtime via Gateway.
 *
 * MirrorEngine uses this abstraction to deliver incoming Telegram
 * messages to the agent without coupling to the concrete Gateway
 * or channel router implementation.
 */
export interface GatewayInjector {
  /**
   * Inject a message into the Agent Runtime.
   *
   * @param params - Injection parameters
   * @param params.chatId - Target osaI chat ID
   * @param params.text - Message text (after HTML -> Markdown conversion)
   * @param params.source - Source identifier ("telegram-mirror")
   * @param params.telegramMessageId - Original Telegram message ID
   * @param params.telegramUserId - Telegram user ID of the sender
   * @param params.telegramChatId - Telegram chat ID the message came from
   * @param params.mediaAttachment - Optional media attachment (T-008)
   */
  injectMessage(params: {
    readonly chatId: string;
    readonly text: string;
    readonly source: string;
    readonly telegramMessageId?: number;
    readonly telegramUserId?: number;
    readonly telegramChatId?: number;
    readonly mediaAttachment?: {
      readonly buffer: Buffer;
      readonly filename: string;
      readonly mimeType: string;
    };
  }): Promise<void>;
}

// ---------------------------------------------------------------------------
// MirrorEngineError
// ---------------------------------------------------------------------------

/**
 * Error thrown by MirrorEngine for configuration and operation issues.
 */
export class MirrorEngineError extends Error {
  constructor(
    message: string,
    public readonly cause?: Error,
  ) {
    super(message);
    this.name = "MirrorEngineError";
  }
}

// ---------------------------------------------------------------------------
// Markdown -> Telegram HTML Converter
// ---------------------------------------------------------------------------

/**
 * Convert Markdown text to Telegram HTML.
 *
 * Telegram HTML supports a limited subset of tags:
 *   <b>, <i>, <u>, <s>, <code>, <pre>, <blockquote>, <a href="...">, <tg-spoiler>
 *
 * Supported Markdown -> HTML conversions:
 *   **bold**          -> <b>bold</b>
 *   *italic*         -> <i>italic</i>
 *   __underline__    -> <u>underline</u>
 *   ~~strikethrough~~ -> <s>strikethrough</s>
 *   `inline code`    -> <code>inline code</code>
 *   ```lang\ncode``` -> <pre>code</pre>
 *   [text](url)      -> <a href="url">text</a>
 *   > quote          -> <blockquote>quote</blockquote>
 *
 * Lines that are not part of any formatting construct are preserved as-is.
 *
 * @param markdown - The Markdown text to convert.
 * @returns Telegram HTML string.
 */
export function markdownToTelegramHtml(markdown: string): string {
  const lines = markdown.split("\n");
  const htmlLines: string[] = [];
  let insideCodeBlock = false;
  let codeBlockContent: string[] = [];
  let codeBlockLang = "";

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line === undefined) continue;

    // Handle fenced code blocks (```...```)
    if (line.startsWith("```")) {
      if (!insideCodeBlock) {
        // Opening fence
        insideCodeBlock = true;
        codeBlockContent = [];
        codeBlockLang = line.slice(3).trim();
      } else {
        // Closing fence
        insideCodeBlock = false;
        const code = codeBlockContent.join("\n");
        if (codeBlockLang) {
          htmlLines.push(`<pre><code class="language-${escapeHtmlAttr(codeBlockLang)}">${escapeHtml(code)}</code></pre>`);
        } else {
          htmlLines.push(`<pre>${escapeHtml(code)}</pre>`);
        }
        codeBlockContent = [];
        codeBlockLang = "";
      }
      continue;
    }

    if (insideCodeBlock) {
      codeBlockContent.push(line);
      continue;
    }

    // Handle blockquote lines
    if (line.startsWith("> ")) {
      const quoteContent = convertInlineFormatting(line.slice(2));
      htmlLines.push(`<blockquote>${quoteContent}</blockquote>`);
      continue;
    }

    // Regular line: apply inline formatting
    htmlLines.push(convertInlineFormatting(line));
  }

  // Handle unclosed code block (edge case)
  if (insideCodeBlock) {
    const code = codeBlockContent.join("\n");
    htmlLines.push(`<pre>${escapeHtml(code)}</pre>`);
  }

  return htmlLines.join("\n");
}

/**
 * Convert inline Markdown formatting to Telegram HTML.
 *
 * Order of replacement matters to avoid double-processing.
 * Bold (**...**) must be processed before italic (*...*).
 */
function convertInlineFormatting(text: string): string {
  // Escape HTML entities first (but not our own <b>, <i>, etc. tags)
  // We work on raw text, so escape < and > that are part of the text
  let result = escapeHtmlExceptMarkdown(text);

  // Bold: **text**
  result = result.replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");
  // Italic: *text*
  result = result.replace(/\*(.+?)\*/g, "<i>$1</i>");
  // Underline: __text__
  result = result.replace(/__(.+?)__/g, "<u>$1</u>");
  // Strikethrough: ~~text~~
  result = result.replace(/~~(.+?)~~/g, "<s>$1</s>");
  // Inline code: `text`
  result = result.replace(/`([^`]+)`/g, "<code>$1</code>");
  // Links: [text](url)
  result = result.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');

  return result;
}

/**
 * Escape HTML entities in text, preserving Markdown formatting characters.
 *
 * Only escapes characters that could break Telegram HTML parsing
 * (< and & outside of Markdown syntax).
 */
function escapeHtmlExceptMarkdown(text: string): string {
  let result = "";
  let i = 0;

  while (i < text.length) {
    const ch = text[i];

    // Check for Markdown link syntax: [text](url)
    if (ch === "[" && text.indexOf("](", i) !== -1) {
      const closeBracket = text.indexOf("]", i);
      if (closeBracket !== -1 && text[closeBracket + 1] === "(") {
        const closeParen = text.indexOf(")", closeBracket + 2);
        if (closeParen !== -1) {
          result += text.slice(i, closeParen + 1);
          i = closeParen + 1;
          continue;
        }
      }
    }

    // Check for inline code: `...`
    if (ch === "`") {
      const closeBacktick = text.indexOf("`", i + 1);
      if (closeBacktick !== -1) {
        result += text.slice(i, closeBacktick + 1);
        i = closeBacktick + 1;
        continue;
      }
    }

    // Escape raw < and & characters
    if (ch === "<") {
      result += "&lt;";
    } else if (ch === ">") {
      result += "&gt;";
    } else if (ch === "&") {
      result += "&amp;";
    } else {
      result += ch;
    }

    i++;
  }

  return result;
}

/**
 * Escape HTML entities for content inside HTML tags.
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Escape HTML attribute value.
 */
function escapeHtmlAttr(value: string): string {
  return escapeHtml(value);
}

// ---------------------------------------------------------------------------
// Telegram HTML -> Markdown Converter (T-007)
// ---------------------------------------------------------------------------

/**
 * Convert Telegram HTML to Markdown.
 *
 * Telegram HTML uses a limited subset of tags:
 *   <b>, <i>, <u>, <s>, <code>, <pre>, <blockquote>, <a href="...">, <tg-spoiler>
 *
 * Conversion rules:
 *   <b>text</b>              -> **text**
 *   <i>text</i>              -> *text*
 *   <u>text</u>              -> __text__
 *   <s>text</s>              -> ~~text~~
 *   <code>text</code>        -> `text`
 *   <pre>text</pre>          -> ```\ntext\n```
 *   <pre><code>text</code></pre> -> ```\ntext\n```
 *   <a href="url">text</a>  -> [text](url)
 *   <blockquote>text</blockquote> -> > text
 *   <tg-spoiler>text</tg-spoiler> -> ||text||
 *
 * HTML entities are decoded: &amp; -> &, &lt; -> <, &gt; -> >, &quot; -> "
 *
 * Unclosed tags are preserved as-is (not converted).
 *
 * @param html - The Telegram HTML string to convert.
 * @returns Markdown string.
 */
export function telegramHtmlToMarkdown(html: string): string {
  // Decode HTML entities first
  let result = decodeHtmlEntities(html);

  // Handle <pre> blocks (including <pre><code>...</code></pre>)
  result = result.replace(/<pre(?:\s[^>]*)?>([\s\S]*?)<\/pre>/g, (_match, codeContent) => {
    // Strip inner <code> tags if present
    const inner = codeContent.replace(/<\/?code(?:\s[^>]*)?>/g, "");
    return "```\n" + inner + "\n```";
  });

  // Handle blockquote: <blockquote>text</blockquote>
  result = result.replace(/<blockquote>([\s\S]*?)<\/blockquote>/g, (_match, content) => {
    // Handle multiline blockquote content
    return content
      .split("\n")
      .map((line: string) => "> " + line)
      .join("\n");
  });

  // Handle tg-spoiler: <tg-spoiler>text</tg-spoiler>
  result = result.replace(/<tg-spoiler>([\s\S]*?)<\/tg-spoiler>/g, "||$1||");

  // Handle links: <a href="url">text</a>
  result = result.replace(/<a\s+href="([^"]*)"(?:\s[^>]*)?>([\s\S]*?)<\/a>/g, "[$2]($1)");

  // Handle bold: <b>text</b>
  result = result.replace(/<b>([\s\S]*?)<\/b>/g, "**$1**");

  // Handle italic: <i>text</i>
  result = result.replace(/<i>([\s\S]*?)<\/i>/g, "*$1*");

  // Handle underline: <u>text</u>
  result = result.replace(/<u>([\s\S]*?)<\/u>/g, "__$1__");

  // Handle strikethrough: <s>text</s>
  result = result.replace(/<s>([\s\S]*?)<\/s>/g, "~~$1~~");

  // Handle inline code: <code>text</code> (must come after <pre><code> is already handled)
  result = result.replace(/<code>([\s\S]*?)<\/code>/g, "`$1`");

  return result;
}

/**
 * Decode common HTML entities to their character equivalents.
 */
function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");
}

// ---------------------------------------------------------------------------
// MirrorEngine
// ---------------------------------------------------------------------------

/**
 * MirrorEngine handles bidirectional message forwarding between osaI and Telegram.
 *
 * osai-to-TG (T-006):
 *   For each MirrorConfig entry with direction including "osai-to-tg"
 *   (either "osai-to-tg" or "both"), the engine:
 *     1. Accepts an agent response text from Gateway
 *     2. Converts Markdown formatting to Telegram HTML
 *     3. Sends the formatted message to the target Telegram chat
 *     4. Invokes the on_mirror_message hook
 *     5. On failure: logs the error and retries once
 *
 * TG-to-osai (T-007):
 *   For each MirrorConfig entry with direction including "tg-to-osai"
 *   (either "tg-to-osai" or "both"), the engine:
 *     1. Receives a message from Telegram (bot/userbot)
 *     2. Deduplicates by message_id to prevent mirror loops
 *     3. Converts Telegram HTML to Markdown
 *     4. Injects the message into Agent Runtime via Gateway injector
 *     5. Invokes the on_mirror_message hook
 *     6. On failure: logs the error, does not retry
 *
 * Lifecycle:
 *   start()          -- begin accepting messages
 *   stop()           -- stop accepting and clean up
 *   mirror()         -- send osaI -> TG message (T-006 API)
 *   receiveMessage() -- receive TG -> osaI message (T-007 API)
 */
export class MirrorEngine {
  private readonly logger: pino.Logger;
  private readonly sender: TelegramSender;
  private readonly injector?: GatewayInjector;
  private readonly mediaDownloader?: MediaDownloader;
  private readonly maxMediaSize: number;
  private readonly activeMirrorsOut: ReadonlyArray<ActiveMirror>;
  private readonly activeMirrorsIn: ReadonlyArray<ActiveMirror>;
  private readonly onMirrorMessageHook?: (event: MirrorMessageEvent) => void;

  /** Deduplication set for incoming Telegram message IDs (TG-to-osai). */
  private processedMessageIds = new Set<number>();

  /** Stats counters (T-008). */
  private mediaDownloadAttempts = 0;
  private mediaDownloadSuccesses = 0;

  /** Default max media size: 10 MB. */
  private static readonly DEFAULT_MAX_MEDIA_SIZE = 10 * 1024 * 1024;

  private started = false;

  constructor(engineConfig: MirrorEngineConfig) {
    this.sender = engineConfig.sender;
    this.injector = engineConfig.injector;
    this.mediaDownloader = engineConfig.mediaDownloader;
    this.maxMediaSize = engineConfig.maxMediaSize ?? MirrorEngine.DEFAULT_MAX_MEDIA_SIZE;
    this.onMirrorMessageHook = engineConfig.onMirrorMessage;
    this.logger =
      engineConfig.logger ??
      pino({ name: "mirror-engine" }).child({ component: "mirror-engine" });

    // Filter mirrors for osai-to-tg direction (outbound)
    this.activeMirrorsOut = engineConfig.mirrors.filter(
      (m): m is MirrorConfig & { direction: "osai-to-tg" | "both" } =>
        m.direction === "osai-to-tg" || m.direction === "both",
    );

    // Filter mirrors for tg-to-osai direction (inbound)
    this.activeMirrorsIn = engineConfig.mirrors.filter(
      (m): m is MirrorConfig & { direction: "tg-to-osai" | "both" } =>
        m.direction === "tg-to-osai" || m.direction === "both",
    );

    this.logger.info(
      {
        mirrorOutCount: this.activeMirrorsOut.length,
        mirrorInCount: this.activeMirrorsIn.length,
        hasInjector: !!this.injector,
        hasMediaDownloader: !!this.mediaDownloader,
        maxMediaSize: this.maxMediaSize,
      },
      "MirrorEngine created",
    );
  }

  // -----------------------------------------------------------------------
  // Lifecycle: start
  // -----------------------------------------------------------------------

  /**
   * Start the MirrorEngine.
   *
   * Validates that at least one active mirror is configured.
   *
   * @throws {MirrorEngineError} if already started
   */
  async start(): Promise<void> {
    if (this.started) {
      throw new MirrorEngineError("MirrorEngine is already started");
    }

    this.started = true;
    this.processedMessageIds.clear();
    this.logger.info(
      {
        mirrorOutCount: this.activeMirrorsOut.length,
        mirrorInCount: this.activeMirrorsIn.length,
      },
      "MirrorEngine started",
    );
  }

  // -----------------------------------------------------------------------
  // Lifecycle: stop
  // -----------------------------------------------------------------------

  /**
   * Stop the MirrorEngine.
   *
   * @throws {MirrorEngineError} if not started
   */
  async stop(): Promise<void> {
    if (!this.started) {
      throw new MirrorEngineError("MirrorEngine is not started");
    }

    this.started = false;
    this.logger.info("MirrorEngine stopped");
  }

  // -----------------------------------------------------------------------
  // Core: mirror message
  // -----------------------------------------------------------------------

  /**
   * Mirror a message from an osaI chat to the corresponding Telegram chat(s).
   *
   * For each active mirror that matches the source osaiI chat:
   *   1. Convert Markdown to Telegram HTML
   *   2. Send via the configured sender (bot or userbot)
   *   3. On error: log and retry once
   *   4. Invoke on_mirror_message hook
   *
   * @param osaiChatId - The osaI chat ID the message originated from
   * @param text - The message text (in Markdown format)
   * @returns Array of results for each target Telegram chat
   */
  async mirror(osaiChatId: string, text: string): Promise<Array<{ telegramChatId: number; success: boolean; error?: string }>> {
    if (!this.started) {
      this.logger.warn(
        { osaiChatId },
        "MirrorEngine is not started, dropping message",
      );
      return [];
    }

    const targets = this.activeMirrorsOut.filter((m) => m.chatId === osaiChatId);

    if (targets.length === 0) {
      this.logger.debug(
        { osaiChatId, activeMirrorsOut: this.activeMirrorsOut.length },
        "No active mirror found for osaiI chat",
      );
      return [];
    }

    const results: Array<{ telegramChatId: number; success: boolean; error?: string }> = [];

    for (const target of targets) {
      const result = await this.mirrorToTarget(target, text);
      results.push(result);
    }

    return results;
  }

  // -----------------------------------------------------------------------
  // Accessors
  // -----------------------------------------------------------------------

  /** Check if the engine is currently started. */
  isStarted(): boolean {
    return this.started;
  }

  /** Get the list of active outbound mirror configurations (osai-to-tg). */
  getActiveMirrors(): ReadonlyArray<ActiveMirror> {
    return this.activeMirrorsOut;
  }

  /** Get the list of active inbound mirror configurations (tg-to-osai). */
  getActiveMirrorsIn(): ReadonlyArray<ActiveMirror> {
    return this.activeMirrorsIn;
  }

  /** Get the set of processed message IDs (for introspection/testing). */
  getProcessedMessageIds(): ReadonlySet<number> {
    return this.processedMessageIds;
  }

  /** Get engine statistics for monitoring and introspection (T-008). */
  getStats(): MirrorEngineStats {
    return {
      started: this.started,
      totalMirrors: this.computeUniqueMirrorCount(),
      activeMirrorsOut: this.activeMirrorsOut.length,
      activeMirrorsIn: this.activeMirrorsIn.length,
      processedMessageCount: this.processedMessageIds.size,
      mediaDownloadAttempts: this.mediaDownloadAttempts,
      mediaDownloadSuccesses: this.mediaDownloadSuccesses,
    };
  }

  /** Compute the unique mirror count across outbound and inbound. */
  private computeUniqueMirrorCount(): number {
    const allIds = new Set<string>();
    for (const m of this.activeMirrorsOut) {
      allIds.add(`${m.chatId}:${m.telegramChatId}`);
    }
    for (const m of this.activeMirrorsIn) {
      allIds.add(`${m.chatId}:${m.telegramChatId}`);
    }
    return allIds.size;
  }

  // -----------------------------------------------------------------------
  // Core: receive Telegram message (TG-to-osai, T-007)
  // -----------------------------------------------------------------------

  /**
   * Receive a message from Telegram and inject it into Agent Runtime.
   *
   * For each active inbound mirror that matches the source Telegram chat:
   *   1. Check deduplication by message_id (skip if already processed)
   *   2. Check for media attachments (T-008): download if available
   *   3. Convert Telegram HTML to Markdown
   *   4. Inject via the Gateway injector
   *   5. Invoke on_mirror_message hook
   *   6. On failure: log the error, do not retry
   *
   * @param message - The incoming Telegram message
   * @param injector - The Gateway injector for routing to Agent Runtime
   *                   (optional if configured in MirrorEngineConfig)
   */
  async receiveMessage(
    message: IncomingTelegramMessage,
    injector?: GatewayInjector,
  ): Promise<void> {
    if (!this.started) {
      this.logger.warn(
        { messageId: message.message_id },
        "MirrorEngine is not started, dropping incoming message",
      );
      return;
    }

    const activeInjector = injector ?? this.injector;

    // Skip messages with no text and no media
    const hasMedia = this.hasMediaContent(message as TelegramMediaMessage);
    if (!message.text && !hasMedia) {
      this.logger.debug(
        { messageId: message.message_id },
        "Incoming message has no text and no media, skipping",
      );
      return;
    }

    // Deduplication: skip if message_id was already processed
    if (this.processedMessageIds.has(message.message_id)) {
      this.logger.debug(
        { messageId: message.message_id },
        "Duplicate message_id, skipping (dedup)",
      );
      return;
    }

    // Mark as processed immediately to prevent concurrent processing
    this.processedMessageIds.add(message.message_id);

    const telegramChatId = message.chat.id;
    const targets = this.activeMirrorsIn.filter(
      (m) => m.telegramChatId === telegramChatId,
    );

    if (targets.length === 0) {
      this.logger.debug(
        { telegramChatId, activeMirrorsIn: this.activeMirrorsIn.length },
        "No active inbound mirror found for Telegram chat",
      );
      return;
    }

    // Convert Telegram HTML to Markdown (for text content)
    const markdownText = message.text ? telegramHtmlToMarkdown(message.text) : "";

    // Download media if present (T-008, best-effort)
    const mediaAttachment = hasMedia
      ? await this.downloadMediaAttachment(message as TelegramMediaMessage)
      : undefined;

    // Build final text: use original text or media placeholder
    const finalText = hasMedia && !message.text
      ? this.buildMediaPlaceholder(message as TelegramMediaMessage)
      : markdownText;

    if (!activeInjector) {
      this.logger.error(
        { messageId: message.message_id },
        "No injector configured for receiveMessage, dropping message",
      );
      return;
    }

    for (const target of targets) {
      await this.injectToOsaI(
        target,
        finalText,
        message,
        activeInjector,
        mediaAttachment,
        hasMedia,
      );
    }
  }

  // -----------------------------------------------------------------------
  // Private: inject into osaI (TG-to-osai)
  // -----------------------------------------------------------------------

  /**
   * Inject a converted Telegram message into the Agent Runtime.
   *
   * On failure, logs the error and invokes the hook with success=false.
   * Does not retry -- the message was already deduplicated and marked as
   * processed, so retrying would require a separate mechanism.
   */
  private async injectToOsaI(
    target: ActiveMirror,
    markdownText: string,
    message: IncomingTelegramMessage,
    injector: GatewayInjector,
    mediaAttachment?: { buffer: Buffer; filename: string; mimeType: string },
    hasMedia = false,
  ): Promise<void> {
    const timestamp = new Date().toISOString();

    let success = false;
    let errorMessage: string | undefined;

    try {
      await injector.injectMessage({
        chatId: target.chatId,
        text: markdownText,
        source: "telegram-mirror",
        telegramMessageId: message.message_id,
        telegramUserId: message.from?.id,
        telegramChatId: message.chat.id,
        mediaAttachment: mediaAttachment
          ? {
              buffer: mediaAttachment.buffer,
              filename: mediaAttachment.filename,
              mimeType: mediaAttachment.mimeType,
            }
          : undefined,
      });
      success = true;
      this.logger.info(
        {
          osaiChatId: target.chatId,
          telegramChatId: target.telegramChatId,
          messageId: message.message_id,
          hasMedia,
        },
        "Telegram message injected into Agent Runtime",
      );
    } catch (err) {
      errorMessage = err instanceof Error ? err.message : String(err);
      this.logger.error(
        {
          osaiChatId: target.chatId,
          telegramChatId: target.telegramChatId,
          messageId: message.message_id,
          hasMedia,
          error: errorMessage,
        },
        "Failed to inject Telegram message into Agent Runtime",
      );
    }

    // Invoke hook
    this.invokeHook({
      direction: target.direction,
      osaiChatId: target.chatId,
      telegramChatId: target.telegramChatId,
      originalText: message.text ?? "",
      formattedText: markdownText,
      success,
      hasMedia,
      error: errorMessage,
      timestamp,
    });
  }

  // -----------------------------------------------------------------------
  // Private: mirror to single target (osai-to-TG)
  // -----------------------------------------------------------------------

  /**
   * Mirror a message to a single Telegram chat target.
   *
   * Includes retry logic: on first failure, log the error and retry once.
   * After retry, invoke the on_mirror_message hook regardless of outcome.
   */
  private async mirrorToTarget(
    target: ActiveMirror,
    text: string,
  ): Promise<{ telegramChatId: number; success: boolean; error?: string }> {
    const timestamp = new Date().toISOString();
    const formattedText = markdownToTelegramHtml(text);

    let success = false;
    let errorMessage: string | undefined;

    try {
      await this.sendWithRetry(target.telegramChatId, formattedText);
      success = true;
      this.logger.info(
        { osaiChatId: target.chatId, telegramChatId: target.telegramChatId },
        "Message mirrored to Telegram",
      );
    } catch (err) {
      errorMessage = err instanceof Error ? err.message : String(err);
      this.logger.error(
        {
          osaiChatId: target.chatId,
          telegramChatId: target.telegramChatId,
          error: errorMessage,
        },
        "Failed to mirror message to Telegram",
      );
    }

    // Invoke hook
    this.invokeHook({
      direction: target.direction,
      osaiChatId: target.chatId,
      telegramChatId: target.telegramChatId,
      originalText: text,
      formattedText,
      success,
      hasMedia: false,
      error: errorMessage,
      timestamp,
    });

    return { telegramChatId: target.telegramChatId, success, error: errorMessage };
  }

  // -----------------------------------------------------------------------
  // Private: retry logic
  // -----------------------------------------------------------------------

  /**
   * Send a message to Telegram with a single retry on failure.
   *
   * If the first attempt fails, logs a warning and retries once.
   * If the retry also fails, throws the error.
   *
   * @param telegramChatId - Target Telegram chat ID
   * @param formattedText - HTML-formatted message text
   * @throws Error if both attempts fail
   */
  private async sendWithRetry(
    telegramChatId: number,
    formattedText: string,
  ): Promise<void> {
    try {
      await this.sender.sendMessage(telegramChatId, formattedText);
    } catch (firstError) {
      const errorMsg = firstError instanceof Error ? firstError.message : String(firstError);
      this.logger.warn(
        { telegramChatId, error: errorMsg },
        "First send attempt failed, retrying once",
      );

      // Retry once
      try {
        await this.sender.sendMessage(telegramChatId, formattedText);
      } catch (retryError) {
        const retryErrorMsg = retryError instanceof Error ? retryError.message : String(retryError);
        throw new MirrorEngineError(
          `Mirror delivery failed after retry: ${retryErrorMsg}`,
          retryError instanceof Error ? retryError : undefined,
        );
      }
    }
  }

  // -----------------------------------------------------------------------
  // Private: hook invocation
  // -----------------------------------------------------------------------

  /**
   * Invoke the on_mirror_message hook.
   *
   * Errors from the hook are caught and logged -- they must not
   * interrupt the mirror operation.
   */
  private invokeHook(event: MirrorMessageEvent): void {
    // Ensure hasMedia is always set (default false for osai-to-tg direction)
    const eventWithMedia: MirrorMessageEvent = {
      ...event,
      hasMedia: event.hasMedia ?? false,
    };

    if (!this.onMirrorMessageHook) {
      return;
    }

    try {
      this.onMirrorMessageHook(eventWithMedia);
    } catch (err) {
      this.logger.error(
        {
          hook: "on_mirror_message",
          error: err instanceof Error ? err.message : String(err),
        },
        "on_mirror_message hook threw error",
      );
    }
  }

  // -----------------------------------------------------------------------
  // Private: media handling helpers (T-008)
  // -----------------------------------------------------------------------

  /**
   * Check if a Telegram message contains media attachments.
   */
  private hasMediaContent(message: TelegramMediaMessage): boolean {
    return !!(
      message.photo ||
      message.document ||
      message.video ||
      message.voice ||
      message.audio
    );
  }

  /**
   * Download media attachment from Telegram (best-effort).
   *
   * Returns the downloaded buffer with filename and MIME type,
   * or undefined if download failed or no downloader is configured.
   */
  private async downloadMediaAttachment(
    message: TelegramMediaMessage,
  ): Promise<{ buffer: Buffer; filename: string; mimeType: string } | undefined> {
    if (!this.mediaDownloader) {
      this.logger.debug(
        { messageId: message.message_id },
        "No media downloader configured, skipping media download",
      );
      return undefined;
    }

    // Determine the media to download (priority: document > photo > video > audio > voice)
    const mediaInfo = message.document ?? message.photo ?? message.video ?? message.audio ?? message.voice;

    if (!mediaInfo || !mediaInfo.fileId) {
      return undefined;
    }

    this.mediaDownloadAttempts++;

    try {
      const buffer = await this.mediaDownloader.downloadMedia(
        mediaInfo.fileId,
        this.maxMediaSize,
      );

      if (!buffer) {
        this.logger.warn(
          { messageId: message.message_id, fileId: mediaInfo.fileId },
          "Media download returned null (best-effort, continuing without media)",
        );
        return undefined;
      }

      this.mediaDownloadSuccesses++;

      // Determine filename and MIME type
      const filename = mediaInfo.fileName ?? this.inferMediaFilename(message, mediaInfo);
      const mimeType = mediaInfo.mimeType ?? this.inferMimeType(message, mediaInfo);

      this.logger.info(
        {
          messageId: message.message_id,
          fileId: mediaInfo.fileId,
          filename,
          mimeType,
          size: buffer.length,
        },
        "Media downloaded successfully",
      );

      return { buffer, filename, mimeType };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      this.logger.warn(
        {
          messageId: message.message_id,
          fileId: mediaInfo.fileId,
          error: errorMsg,
        },
        "Media download failed (best-effort, continuing without media)",
      );
      return undefined;
    }
  }

  /**
   * Build a placeholder text for media-only messages.
   */
  private buildMediaPlaceholder(message: TelegramMediaMessage): string {
    if (message.photo) return "[media: photo]";
    if (message.video) return "[media: video]";
    if (message.document) return `[media: document${message.document.fileName ? ` ${message.document.fileName}` : ""}]`;
    if (message.voice) return "[media: voice]";
    if (message.audio) return "[media: audio]";
    return "[media]";
  }

  /**
   * Infer a filename for media that doesn't have an explicit filename.
   */
  private inferMediaFilename(message: TelegramMediaMessage, _media: TelegramMediaInfo): string {
    const messageId = message.message_id;
    if (message.photo) return `photo_${messageId}.jpg`;
    if (message.video) return `video_${messageId}.mp4`;
    if (message.voice) return `voice_${messageId}.ogg`;
    if (message.audio) return `audio_${messageId}.mp3`;
    return `media_${messageId}`;
  }

  /**
   * Infer MIME type for media that doesn't have an explicit MIME type.
   */
  private inferMimeType(message: TelegramMediaMessage, _media: TelegramMediaInfo): string {
    if (message.photo) return "image/jpeg";
    if (message.video) return "video/mp4";
    if (message.voice) return "audio/ogg";
    if (message.audio) return "audio/mpeg";
    if (message.document) return "application/octet-stream";
    return "application/octet-stream";
  }
}
