/**
 * @osai/cli -- CLI Client (DOMAIN-011)
 *
 * Interactive CLI chat, TUI layout (ink),
 * commands: chat, session, config, skills, memory, channel, status.
 */

export { runChannelAddTelegram } from "./commands/channel/add-telegram.js";
export { GatewayClient } from "./ws/gateway-client.js";
export type { GatewayClientOptions, GatewayClientEvents } from "./ws/gateway-client.js";

// T-002: Gateway Protocol + Message Router
export {
  sendUserMessage,
  sendCommand,
  sendPermissionResponse,
  sendSubscribe,
} from "./ws/protocol.js";
export type {
  ClientMessage,
  ClientCommand,
  ClientPermissionResponse,
  ClientSubscribe,
  GatewayOutgoingMessage,
  ToolStreamMessage,
  BlockStreamMessage,
  PermissionRequestMessage,
  GatewayIncomingMessage,
} from "./ws/protocol.js";

export { MessageRouter } from "./ws/message-router.js";
export type {
  ToolStreamHandler,
  BlockHandler,
  PermissionRequestHandler,
  UnknownMessageHandler,
  MessageRouterOptions,
  MessageRouterEvents,
} from "./ws/message-router.js";

// T-004: Gateway Connector + Chat Commands
export { executeGatewayCommand } from "./ws/gateway-connector.js";
export type { GatewayConnectorOptions, CommandResponse } from "./ws/gateway-connector.js";

export {
  runChatList,
  runChatCreate,
  runChatSwitch,
  runChatDelete,
  runChatArchive,
} from "./commands/chat/index.js";

// T-003: Interactive Chat TUI
export { runChat } from "./commands/chat.js";
export type { RunChatOptions } from "./commands/chat.js";

// T-003: TUI Components (for testing)
export { TUIApp } from "./tui/app.js";
export type { TUIAppProps } from "./tui/app.js";
export { ChatArea } from "./tui/chat-area.js";
export type { ChatAreaProps } from "./tui/chat-area.js";
export { InputArea } from "./tui/input-area.js";
export type { InputAreaProps } from "./tui/input-area.js";
export { StatusBar } from "./tui/status-bar.js";
export type { StatusBarProps } from "./tui/status-bar.js";

// T-003: TUI State
export { tuiReducer, initialTUIState } from "./tui/tui-state.js";
export type { TUIState, TUIAction, ChatMessage, CodeBlock, ConnectionStatus, ToolProgress } from "./tui/types.js";

// T-005: Management Commands (session, config, skills, memory, status, init)
export { runInit } from "./commands/init.js";
export type { InitOptions } from "./commands/init.js";
export { runStatus } from "./commands/status.js";
export type { StatusOptions } from "./commands/status.js";
export { runConfig } from "./commands/config.js";
export type { ConfigOptions } from "./commands/config.js";
export { runSessionList, runSessionResume } from "./commands/session/index.js";
export { runSkillsList } from "./commands/skills/index.js";
export { runMemorySearch } from "./commands/memory/index.js";
export type { MemorySearchOptions } from "./commands/memory/index.js";

// T-005: Utils
export { formatTable as formatTableV2 } from "./utils/table.js";
export type { TableColumn, TableRow } from "./utils/table.js";
export { formatKeyValueTable } from "./utils/table.js";

// T-006: Permission Prompt UI
export { PermissionPrompt } from "./tui/permission-prompt.js";
export type {
  PermissionPromptProps,
  PermissionPromptResult,
  PermissionDecision,
  PermissionQueueItem,
} from "./tui/permission-prompt.js";

// T-006: Quick Command Mode
export { runQuickCommand } from "./commands/quick.js";
export type { QuickCommandOptions, QuickCommandResult } from "./commands/quick.js";
