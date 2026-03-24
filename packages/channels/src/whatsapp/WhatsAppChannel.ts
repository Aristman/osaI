/**
 * WhatsAppChannel -- Mock WhatsApp channel handler.
 *
 * Provides a mock implementation of BaseChannelHandler for WhatsApp.
 * No real WhatsApp API calls are made -- all operations are simulated
 * for testing purposes.
 */

import type { OutboundMessage, ChannelMessageHandler } from '@osai/gateway';
import { BaseChannelHandler } from '../ChannelHandler.js';

// ---------------------------------------------------------------------------
// WhatsApp Configuration
// ---------------------------------------------------------------------------

export interface WhatsAppChannelConfig {
  phoneNumber?: string;
  sessionName?: string;
}

// ---------------------------------------------------------------------------
// WhatsApp Channel
// ---------------------------------------------------------------------------

/**
 * Mock WhatsApp channel handler.
 *
 * Simulates WhatsApp operations without real network calls.
 * Useful for testing message flows and channel lifecycle.
 */
export class WhatsAppChannel extends BaseChannelHandler {
  private readonly _phoneNumber: string | undefined;
  private messageHandler: ChannelMessageHandler | null = null;
  private readonly sentMessages: OutboundMessage[] = [];

  constructor(config: WhatsAppChannelConfig = {}) {
    const id = `whatsapp_${config.sessionName ?? 'default'}_${Date.now().toString(36)}`;
    super(id, config.sessionName ?? 'whatsapp', 'whatsapp');
    this._phoneNumber = config.phoneNumber;
  }

  /** Phone number associated with this WhatsApp session */
  get phoneNumber(): string | undefined {
    return this._phoneNumber;
  }

  /**
   * Connect to WhatsApp (mock).
   * Sets status to 'connected'.
   */
  async connect(): Promise<void> {
    this.setStatus('connecting');
    // Simulate async connection
    await Promise.resolve();
    this.setStatus('connected');
  }

  /**
   * Disconnect from WhatsApp (mock).
   * Sets status to 'disconnected'.
   */
  async disconnect(): Promise<void> {
    this.setStatus('disconnected');
    this.messageHandler = null;
  }

  /**
   * Send a message through WhatsApp (mock).
   * Stores the message in sentMessages array.
   */
  send(message: OutboundMessage): void {
    if (this.getStatus() !== 'connected') {
      throw new Error(
        `WhatsAppChannel '${this.name}' is not connected (status: ${this.getStatus()})`
      );
    }
    this.sentMessages.push(message);
  }

  /**
   * Register a handler for incoming WhatsApp messages.
   */
  onMessage(handler: ChannelMessageHandler): void {
    this.messageHandler = handler;
  }

  // -----------------------------------------------------------------------
  // WhatsApp-specific methods
  // -----------------------------------------------------------------------

  /**
   * Send a text message to a WhatsApp chat (mock).
   */
  async sendMessage(chatId: string, text: string): Promise<void> {
    const message: OutboundMessage = {
      sessionId: chatId,
      content: text,
      type: 'text',
    };
    this.send(message);
  }

  /**
   * Send a presence update (typing indicator or available) (mock).
   */
  async sendPresence(
    chatId: string,
    type: 'composing' | 'available'
  ): Promise<void> {
    const message: OutboundMessage = {
      sessionId: chatId,
      content: '',
      type: 'event',
      metadata: { presence: type },
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
        channel: 'whatsapp',
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
