/**
 * TelegramChannel -- Mock Telegram Bot channel handler.
 *
 * Provides a mock implementation of BaseChannelHandler for Telegram.
 * No real Telegram API calls are made -- all operations are simulated
 * for testing purposes.
 */

import type { OutboundMessage, ChannelMessageHandler } from '@osai/gateway';
import { BaseChannelHandler } from '../ChannelHandler.js';

// ---------------------------------------------------------------------------
// Telegram Configuration
// ---------------------------------------------------------------------------

export interface TelegramChannelConfig {
  token: string;
  botName?: string;
}

// ---------------------------------------------------------------------------
// Telegram Channel
// ---------------------------------------------------------------------------

/**
 * Mock Telegram channel handler.
 *
 * Simulates Telegram Bot API operations without real network calls.
 * Useful for testing message flows and channel lifecycle.
 */
export class TelegramChannel extends BaseChannelHandler {
  private readonly _token: string;
  private messageHandler: ChannelMessageHandler | null = null;
  private readonly sentMessages: OutboundMessage[] = [];

  constructor(config: TelegramChannelConfig) {
    const id = `telegram_${config.botName ?? 'bot'}_${Date.now().toString(36)}`;
    super(id, config.botName ?? 'telegram-bot', 'telegram');
    this._token = config.token;
  }

  /** Bot token used for Telegram API */
  get token(): string {
    return this._token;
  }

  /**
   * Connect to Telegram (mock).
   * Sets status to 'connected'.
   */
  async connect(): Promise<void> {
    this.setStatus('connecting');
    // Simulate async connection
    await Promise.resolve();
    this.setStatus('connected');
  }

  /**
   * Disconnect from Telegram (mock).
   * Sets status to 'disconnected'.
   */
  async disconnect(): Promise<void> {
    this.setStatus('disconnected');
    this.messageHandler = null;
  }

  /**
   * Send a message through Telegram (mock).
   * Stores the message in sentMessages array.
   */
  send(message: OutboundMessage): void {
    if (this.getStatus() !== 'connected') {
      throw new Error(
        `TelegramChannel '${this.name}' is not connected (status: ${this.getStatus()})`
      );
    }
    this.sentMessages.push(message);
  }

  /**
   * Register a handler for incoming Telegram messages.
   */
  onMessage(handler: ChannelMessageHandler): void {
    this.messageHandler = handler;
  }

  // -----------------------------------------------------------------------
  // Telegram-specific methods
  // -----------------------------------------------------------------------

  /**
   * Send a text message to a Telegram chat (mock).
   */
  async sendMessage(
    chatId: string,
    text: string,
    options?: { parseMode?: string }
  ): Promise<void> {
    const message: OutboundMessage = {
      sessionId: chatId,
      content: text,
      type: 'text',
      metadata: options
        ? { parseMode: options.parseMode }
        : undefined,
    };
    this.send(message);
  }

  /**
   * Send a photo to a Telegram chat (mock).
   */
  async sendPhoto(
    chatId: string,
    photoUrl: string,
    caption?: string
  ): Promise<void> {
    const message: OutboundMessage = {
      sessionId: chatId,
      content: photoUrl,
      type: 'text',
      metadata: caption ? { caption, mediaType: 'photo' } : { mediaType: 'photo' },
    };
    this.send(message);
  }

  // -----------------------------------------------------------------------
  // Test helpers
  // -----------------------------------------------------------------------

  /**
   * Simulate receiving an incoming message (for testing).
   */
  simulateIncomingMessage(chatId: string, text: string, from: string): void {
    if (!this.messageHandler || this.getStatus() !== 'connected') {
      return;
    }

    const message: OutboundMessage = {
      sessionId: chatId,
      content: text,
      type: 'text',
      metadata: {
        from,
        channel: 'telegram',
        timestamp: new Date().toISOString(),
      },
    };

    this.messageHandler(message);
  }

  /**
   * Get all messages sent through this channel (for testing).
   */
  getSentMessages(): OutboundMessage[] {
    return [...this.sentMessages];
  }

  /**
   * Clear sent messages history (for testing).
   */
  clearSentMessages(): void {
    this.sentMessages.length = 0;
  }
}
