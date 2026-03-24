/**
 * @osai/channels -- Messaging channel handlers for osaI
 *
 * Provides mock implementations for Telegram and WhatsApp channel handlers
 * that integrate with the Gateway's IChannelHandler interface.
 *
 * Barrel export of all public API.
 */

// Base
export { BaseChannelHandler } from './ChannelHandler.js';
export type { ChannelConfig } from './ChannelHandler.js';

// Telegram
export { TelegramChannel } from './telegram/TelegramChannel.js';
export type { TelegramChannelConfig } from './telegram/TelegramChannel.js';

// WhatsApp
export { WhatsAppChannel } from './whatsapp/WhatsAppChannel.js';
export type { WhatsAppChannelConfig } from './whatsapp/WhatsAppChannel.js';

// Manager
export { ChannelManager } from './ChannelManager.js';
export type { ChannelInfo } from './ChannelManager.js';
