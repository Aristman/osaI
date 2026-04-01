/**
 * @osai/cli -- Message Router (DOMAIN-011, T-002)
 *
 * Маршрутизатор входящих сообщений от Gateway.
 * Распределяет сообщения по типу: tool_stream, block, permission_request.
 *
 * Невалидный JSON логируется без краша приложения.
 */

import { EventEmitter } from "node:events";
import pino from "pino";
import type { WebSocket } from "ws";
import type { GatewayClient } from "./gateway-client.js";
import type {
  ToolStreamMessage,
  BlockStreamMessage,
  PermissionRequestMessage,
} from "./protocol.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Handler для tool_stream сообщений */
export type ToolStreamHandler = (msg: ToolStreamMessage) => void;

/** Handler для block сообщений */
export type BlockHandler = (msg: BlockStreamMessage) => void;

/** Handler для permission_request сообщений */
export type PermissionRequestHandler = (msg: PermissionRequestMessage) => void;

/** Handler для невалидных/неизвестных сообщений */
export type UnknownMessageHandler = (raw: string, error?: Error) => void;

export interface MessageRouterOptions {
  /** Logger instance (optional, will create default if not provided) */
  logger?: pino.Logger;
}

/** Gateway event message (system events like connect.challenge) */
export interface GatewayEventMessage {
  type: "event";
  event: string;
  payload: Record<string, unknown>;
}

/** Handler для gateway event сообщений */
export type GatewayEventHandler = (msg: GatewayEventMessage) => void;

/** config.ack сообщение от Gateway */
export interface ConfigAckMessage {
  type: "config.ack";
  session_id: string;
  payload: {
    status: "ok" | "error";
    providersLoaded?: number;
    model?: string;
    error?: string;
  };
}

/** Handler для config_ack сообщений */
export type ConfigAckHandler = (msg: ConfigAckMessage) => void;

export type MessageRouterEvents = {
  tool_stream: [msg: ToolStreamMessage];
  block: [msg: BlockStreamMessage];
  permission_request: [msg: PermissionRequestMessage];
  event: [msg: GatewayEventMessage];
  config_ack: [msg: ConfigAckMessage];
  error: [raw: string, error: Error];
};

// ---------------------------------------------------------------------------
// MessageRouter
// ---------------------------------------------------------------------------

export class MessageRouter extends EventEmitter<MessageRouterEvents> {
  private readonly logger: pino.Logger;
  private client: GatewayClient | null = null;
  private boundMessageHandler: ((data: WebSocket.Data) => void) | null = null;

  constructor(options: MessageRouterOptions = {}) {
    super();
    this.logger = options.logger ?? pino({ name: "message-router" });
  }

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  /**
   * Подключает роутер к GatewayClient.
   * Начинает прослушивание входящих сообщений и маршрутизацию по типу.
   *
   * @param client - Экземпляр GatewayClient
   */
  attach(client: GatewayClient): void {
    if (this.client !== null) {
      this.logger.warn("MessageRouter is already attached to a client");
      return;
    }

    this.client = client;

    this.boundMessageHandler = (data: WebSocket.Data) => {
      this.routeMessage(data);
    };

    this.client.on("message", this.boundMessageHandler);
    this.logger.info("MessageRouter attached to GatewayClient");
  }

  /**
   * Отключает роутер от GatewayClient.
   */
  detach(): void {
    if (this.client === null || this.boundMessageHandler === null) {
      return;
    }

    this.client.removeListener("message", this.boundMessageHandler);
    this.client = null;
    this.boundMessageHandler = null;
    this.logger.info("MessageRouter detached from GatewayClient");
  }

  // -----------------------------------------------------------------------
  // Message routing
  // -----------------------------------------------------------------------

  /**
   * Разбирает и маршрутизирует входящее сообщение.
   * Невалидный JSON логируется через logger.error, приложение не крашится.
   */
  private routeMessage(data: WebSocket.Data): void {
    const raw = data.toString();

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(raw) as Record<string, unknown>;
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.logger.error({ raw, error: error.message }, "Invalid JSON received from Gateway");
      this.emit("error", raw, error);
      return;
    }

    const type = parsed["type"] as string | undefined;

    if (type === undefined) {
      const error = new Error("Message has no 'type' field");
      this.logger.warn({ raw }, "Unknown message format: missing 'type' field");
      this.emit("error", raw, error);
      return;
    }

    switch (type) {
      case "tool_stream": {
        const msg = parsed as unknown as ToolStreamMessage;
        this.emit("tool_stream", msg);
        break;
      }

      case "block": {
        const msg = parsed as unknown as BlockStreamMessage;
        this.emit("block", msg);
        break;
      }

      case "permission_request": {
        const msg = parsed as unknown as PermissionRequestMessage;
        this.emit("permission_request", msg);
        break;
      }

      case "event": {
        const msg = parsed as unknown as GatewayEventMessage;
        this.logger.debug({ event: msg.event }, "Gateway event received");
        this.emit("event", msg);
        break;
      }

      case "config.ack": {
        const msg = parsed as unknown as ConfigAckMessage;
        const status = msg.payload?.status;
        if (status === "ok") {
          this.logger.info(
            { providers: msg.payload?.providersLoaded, model: msg.payload?.model },
            "Config push accepted by Gateway",
          );
        } else {
          this.logger.warn(
            { error: msg.payload?.error },
            "Config push rejected by Gateway",
          );
        }
        this.emit("config_ack", msg);
        break;
      }

      default: {
        const error = new Error(`Unknown message type: ${type}`);
        this.logger.warn({ type, raw }, "Unknown message type received");
        this.emit("error", raw, error);
        break;
      }
    }
  }
}
