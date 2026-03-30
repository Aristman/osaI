// ---------------------------------------------------------------------------
// WebSocket Protocol -- Type Definitions (T-003)
// ---------------------------------------------------------------------------

/** All recognized message types in the Gateway <-> Client protocol. */
export enum MessageType {
  PING = "PING",
  PONG = "PONG",
  TEXT = "TEXT",
  TOOL_CALL = "TOOL_CALL",
  TOOL_RESULT = "TOOL_RESULT",
  STREAM_START = "STREAM_START",
  STREAM_CHUNK = "STREAM_CHUNK",
  STREAM_END = "STREAM_END",
  ERROR = "ERROR",
  CHAT_CREATE = "CHAT_CREATE",
  CHAT_LIST = "CHAT_LIST",
  CHAT_SWITCH = "CHAT_SWITCH",
  CHAT_DELETE = "CHAT_DELETE",
  CHAT_ARCHIVE = "CHAT_ARCHIVE",
  STATE = "STATE",
}

// ---------------------------------------------------------------------------
// Client -> Gateway
// ---------------------------------------------------------------------------

/** Message sent from a connected client to the Gateway. */
export interface ClientMessage {
  readonly type: string;
  readonly id?: string;
  readonly chatId?: string;
  readonly payload?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Gateway -> Client
// ---------------------------------------------------------------------------

/** Message sent from the Gateway back to a client. */
export interface ServerMessage {
  readonly type: string;
  readonly id?: string;
  readonly chatId?: string;
  readonly payload?: Record<string, unknown>;
  readonly error?: string;
}
