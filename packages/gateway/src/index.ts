/**
 * @osai/gateway -- WebSocket Control Plane for osaI
 *
 * Barrel export of all public API.
 */

// Re-export WS protocol types from @osai/types for convenience
export type {
  ClientMessage,
  ClientCommand,
  PermissionResponse,
  ClientSubscribe,
  WsInboundMessage,
  ToolStreamMessage,
  BlockStreamMessage,
  PermissionRequest,
  ErrorResponse,
  StatusMessage,
  EventMessage,
  WsOutboundMessage,
  GatewayConfig,
  OsaIConfig,
} from '@osai/types';

// Server
export { GatewayServer } from './server/server.js';
export type {
  ClientInfo,
  ConnectionHandler,
  DisconnectionHandler,
  ErrorHandler,
  MessageHandler,
  HeartbeatConfig,
} from './server/ws-types.js';
export { DEFAULT_HEARTBEAT } from './server/ws-types.js';

// Protocol
export {
  parseMessage,
  serializeMessage,
  isWsInboundMessage,
  buildToolStreamMessage,
  buildBlockMessage,
  buildPermissionRequest,
  buildErrorResponse,
  buildStatusMessage,
  buildEventMessage,
  MessageRouter,
} from './protocol/protocol.js';
export type {
  ParseResult,
  ParseError,
  InboundMessageType,
  MessageHandlerFn,
} from './protocol/protocol.js';

// Session
export { Session, SessionRouter } from './session/router.js';
export type {
  QueueMode,
  SessionState,
  SessionMessage,
  SessionOptions,
  SessionData,
} from './session/router.js';

// Channel
export { StdioChannel, ChannelManager } from './channels/channel.js';
export type {
  ChannelType,
  ChannelStatus,
  ChannelConfig,
  OutboundMessage,
  ChannelMessageHandler,
  IChannelHandler,
} from './channels/channel.js';

// Persistence
export { SessionPersistence } from './session/persistence.js';
export type {
  SessionRow,
  SessionMessageRow,
} from './session/persistence.js';
