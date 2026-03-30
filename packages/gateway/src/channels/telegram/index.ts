export {
  TelegramManager,
  TelegramManagerError,
  type TelegramManagerConfig,
} from "./manager.js";

export {
  TelegramBot,
  TelegramBotError,
  type TelegramBotOptions,
} from "./bot.js";

export {
  UserbotBridge,
  UserbotBridgeError,
  type UserbotBridgeConfig,
} from "./userbot.js";

export {
  AuthFlow,
  AuthFlowError,
  type AuthFlowConfig,
  type AuthFlowResult,
  type PromptFunction,
  type SendAuthRequestFunction,
} from "./auth-flow.js";

export {
  MirrorEngine,
  MirrorEngineError,
  markdownToTelegramHtml,
  telegramHtmlToMarkdown,
  type MirrorEngineConfig,
  type MirrorMessageEvent,
  type TelegramSender,
  type IncomingTelegramMessage,
  type TelegramMediaMessage,
  type TelegramMediaInfo,
  type MediaDownloader,
  type GatewayInjector,
  type MirrorEngineStats,
} from "./mirror.js";

export type {
  // Configuration types
  TelegramBotConfig,
  TelegramUserbotConfig,
  TelegramConfig,
  MirrorConfig,
  MirrorDirection,
  // Bridge protocol types
  BridgeRequestType,
  BridgeResponseType,
  BridgeRequest,
  BridgeResponse,
  // Manager status types
  TelegramManagerMode,
  ComponentStatus,
  ComponentStatusInfo,
  TelegramManagerStatus,
} from "./types.js";
