export {
  ensureOsaiDir,
  initOsai,
  OSAI_SUBDIRS,
  // Re-exports from config for convenience
  createDefaultConfig,
  getOsaiDir,
  getConfigPath,
  DEFAULT_CONFIG,
} from "./init.js";

export {
  // Error class
  ConfigError,
  // Zod schema and type
  osaiConfigSchema,
  type OsaiConfig,
  type ConfigSection,
  // Config loading and caching
  loadConfig,
  validateConfig,
  getConfig,
  reloadConfig,
  resetConfigCache,
  // Section / provider accessors
  getProviderConfig,
  getConfigSection,
} from "./config.js";

export {
  WsServer,
  type WsServerConfig,
  type ConnectionCallback,
  type DisconnectionCallback,
} from "./server/index.js";

export {
  ChatService,
  ChatContextManager,
  ChatArchiveService,
  MAX_ACTIVE_CHATS,
  ActiveChatLimitError,
  ChatNotFoundError,
  type Chat,
  type ChatFilter,
  type ChatMessage,
  type CreateChatInput,
  type UpdateChatInput,
  type AddMessageInput,
  type ToolCall,
  type ChatContextManagerConfig,
  type ChatContext,
} from "./chat/index.js";

export {
  // Protocol message types
  MessageType,
  type ClientMessage,
  type ServerMessage,
  // Message handler
  MessageHandler,
  type MessageHandlerFn,
  type MessageHandlerConfig,
} from "./protocol/index.js";

export {
  // Channel router
  ChannelRouter,
  type ChannelRouterConfig,
  // CLI channel handler
  CliHandler,
  type CliHandlerConfig,
  // Channel types
  type ChannelHandler,
  type ChannelContext,
  type ChannelResult,
  // Channel errors
  ChannelHandlerError,
} from "./channels/index.js";
