/**
 * @osai/cli -- Gateway Protocol (DOMAIN-011, T-002)
 *
 * Типы сообщений протокола Gateway (Client -> Gateway) и
 * функции для отправки сообщений через GatewayClient.
 *
 * Типы исходящих сообщений (Client -> Gateway):
 *   - message              -- пользовательское сообщение в чат
 *   - command              -- системная команда
 *   - permission_response  -- ответ на permission_request
 *   - subscribe            -- подписка на события
 *
 * Типы входящих сообщений (Gateway -> Client):
 *   - tool_stream          -- потоковый прогресс выполнения tool
 *   - block                -- контентный блок (text, code, image, card, table)
 *   - permission_request   -- запрос разрешения на операцию
 */

import type { GatewayClient } from "./gateway-client.js";

// ---------------------------------------------------------------------------
// Client -> Gateway message types
// ---------------------------------------------------------------------------

/** Пользовательское сообщение в чат */
export interface ClientMessage {
  type: "message";
  session_id: string;
  chat_id?: string;
  payload: { content: string };
}

/** Системная команда */
export interface ClientCommand {
  type: "command";
  session_id: string;
  chat_id?: string;
  payload: { command: string; args?: Record<string, unknown> };
}

/** Ответ на permission_request */
export interface ClientPermissionResponse {
  type: "permission_response";
  session_id: string;
  request_id: string;
  payload: { allow: boolean };
}

/** Подписка на события */
export interface ClientSubscribe {
  type: "subscribe";
  session_id: string;
  chat_id?: string;
  payload: { events: string[] };
}

/** Union всех исходящих типов */
export type GatewayOutgoingMessage =
  | ClientMessage
  | ClientCommand
  | ClientPermissionResponse
  | ClientSubscribe;

// ---------------------------------------------------------------------------
// Gateway -> Client message types
// ---------------------------------------------------------------------------

/** Потоковый прогресс выполнения tool */
export interface ToolStreamMessage {
  type: "tool_stream";
  session_id: string;
  chat_id?: string;
  tool: string;
  action: string;
  chunk: unknown;
  progress?: number;
}

/** Контентный блок */
export interface BlockStreamMessage {
  type: "block";
  session_id: string;
  chat_id?: string;
  block_type: "text" | "code" | "image" | "card" | "table";
  content: string;
  language?: string;
}

/** Запрос разрешения на операцию */
export interface PermissionRequestMessage {
  type: "permission_request";
  request_id: string;
  session_id: string;
  chat_id?: string;
  tool: string;
  action: string;
  params: unknown;
  risk_level: "low" | "medium" | "high";
}

/** Union всех входящих типов */
export type GatewayIncomingMessage =
  | ToolStreamMessage
  | BlockStreamMessage
  | PermissionRequestMessage;

// ---------------------------------------------------------------------------
// Protocol Sender
// ---------------------------------------------------------------------------

/**
 * Отправляет пользовательское сообщение в Gateway.
 *
 * @param client - Экземпляр GatewayClient с активным соединением
 * @param sessionId - Идентификатор текущей сессии
 * @param content - Текст сообщения
 * @param chatId - Опциональный идентификатор чата
 */
export function sendUserMessage(
  client: GatewayClient,
  sessionId: string,
  content: string,
  chatId?: string,
): void {
  const message: ClientMessage = {
    type: "message",
    session_id: sessionId,
    ...(chatId !== undefined && { chat_id: chatId }),
    payload: { content },
  };
  client.send(message);
}

/**
 * Отправляет системную команду в Gateway.
 *
 * @param client - Экземпляр GatewayClient с активным соединением
 * @param sessionId - Идентификатор текущей сессии
 * @param command - Имя команды
 * @param args - Опциональные аргументы команды
 * @param chatId - Опциональный идентификатор чата
 */
export function sendCommand(
  client: GatewayClient,
  sessionId: string,
  command: string,
  args?: Record<string, unknown>,
  chatId?: string,
): void {
  const message: ClientCommand = {
    type: "command",
    session_id: sessionId,
    ...(chatId !== undefined && { chat_id: chatId }),
    payload: { command, ...(args !== undefined && { args }) },
  };
  client.send(message);
}

/**
 * Отправляет ответ на permission_request в Gateway.
 *
 * @param client - Экземпляр GatewayClient с активным соединением
 * @param sessionId - Идентификатор текущей сессии
 * @param requestId - Идентификатор запроса разрешения
 * @param allow - true = разрешить, false = запретить
 */
export function sendPermissionResponse(
  client: GatewayClient,
  sessionId: string,
  requestId: string,
  allow: boolean,
): void {
  const message: ClientPermissionResponse = {
    type: "permission_response",
    session_id: sessionId,
    request_id: requestId,
    payload: { allow },
  };
  client.send(message);
}

/**
 * Отправляет запрос на подписку на события.
 *
 * @param client - Экземпляр GatewayClient с активным соединением
 * @param sessionId - Идентификатор текущей сессии
 * @param events - Список событий для подписки
 * @param chatId - Опциональный идентификатор чата
 */
export function sendSubscribe(
  client: GatewayClient,
  sessionId: string,
  events: string[],
  chatId?: string,
): void {
  const message: ClientSubscribe = {
    type: "subscribe",
    session_id: sessionId,
    ...(chatId !== undefined && { chat_id: chatId }),
    payload: { events },
  };
  client.send(message);
}
