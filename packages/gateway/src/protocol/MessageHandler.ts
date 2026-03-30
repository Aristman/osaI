import pino from "pino";
import type { WsServer } from "../server/ws-server.js";
import type { ClientMessage, ServerMessage } from "./types.js";
import { MessageType } from "./types.js";

// ---------------------------------------------------------------------------
// Handler type
// ---------------------------------------------------------------------------

/**
 * A handler function that processes a validated client message.
 *
 * Must return a `ServerMessage` (or `void` if no response is needed).
 * Errors thrown inside a handler are caught by `handleMessage` and
 * converted to an `ERROR` server message.
 */
export type MessageHandlerFn = (
  clientId: string,
  message: ClientMessage,
) => Promise<ServerMessage | void>;

// ---------------------------------------------------------------------------
// MessageHandler
// ---------------------------------------------------------------------------

export interface MessageHandlerConfig {
  /** WsServer instance used to send responses back to clients. */
  readonly server: WsServer;
  /** Optional map of pre-registered handlers keyed by message type. */
  readonly handlers?: ReadonlyMap<string, MessageHandlerFn>;
  /** Custom pino logger. If omitted, a default child logger is created. */
  readonly logger?: pino.Logger;
}

/**
 * Central message handler for the Gateway WebSocket protocol.
 *
 * Responsibilities:
 * - Parse and validate incoming JSON messages
 * - Dispatch to registered handlers by message `type`
 * - Send PONG in response to PING (built-in)
 * - Return ERROR responses for unknown / invalid messages
 * - Never close the client connection on protocol errors
 */
export class MessageHandler {
  private readonly server: WsServer;
  private readonly logger: pino.Logger;
  private readonly registry = new Map<string, MessageHandlerFn>();

  constructor(config: MessageHandlerConfig) {
    this.server = config.server;
    this.logger = config.logger ?? pino({ name: "message-handler" }).child({ component: "message-handler" });

    // Register pre-supplied handlers.
    if (config.handlers !== undefined) {
      for (const [type, handler] of config.handlers) {
        this.registry.set(type, handler);
      }
    }
  }

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  /** Register (or overwrite) a handler for the given message type. */
  registerHandler(type: string, handler: MessageHandlerFn): void {
    this.registry.set(type, handler);
    this.logger.debug({ type }, "Handler registered");
  }

  /**
   * Process a raw string received from a WebSocket client.
   *
   * 1. Parse JSON
   * 2. Validate the `type` field
   * 3. Dispatch to registered handler or respond with ERROR
   */
  async handleMessage(clientId: string, rawMessage: string): Promise<void> {
    // --- Step 1: Parse JSON ---
    let parsed: unknown;
    try {
      parsed = JSON.parse(rawMessage);
    } catch {
      this.sendError(clientId, undefined, "Invalid JSON");
      return;
    }

    // --- Step 2: Validate shape ---
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      this.sendError(clientId, undefined, "Message must be a JSON object");
      return;
    }

    const msg = parsed as Record<string, unknown>;

    if (typeof msg["type"] !== "string" || msg["type"].length === 0) {
      this.sendError(clientId, this.extractId(msg), "Missing or invalid 'type' field");
      return;
    }

    const clientMessage: ClientMessage = {
      type: msg["type"],
      id: typeof msg["id"] === "string" ? msg["id"] : undefined,
      chatId: typeof msg["chatId"] === "string" ? msg["chatId"] : undefined,
      payload: this.extractPayload(msg),
    };

    // --- Step 3: Dispatch ---
    try {
      if (clientMessage.type === MessageType.PING) {
        const response: ServerMessage = { type: MessageType.PONG, id: clientMessage.id };
        this.server.send(clientId, response);
        return;
      }

      const handler = this.registry.get(clientMessage.type);
      if (handler === undefined) {
        this.sendError(clientId, clientMessage.id, `Unknown message type: ${clientMessage.type}`);
        return;
      }

      const result = await handler(clientId, clientMessage);
      if (result !== undefined) {
        this.server.send(clientId, result);
      }
    } catch (err) {
      const description = err instanceof Error ? err.message : "Internal handler error";
      this.sendError(clientId, clientMessage.id, description);
    }
  }

  /**
   * Create and register a PONG handler.
   *
   * Normally PING -> PONG is handled inline inside `handleMessage`,
   * but this factory allows callers to override the default behaviour
   * (e.g., add logging or metrics).
   *
   * @returns the handler function for further reference if needed.
   */
  createPongHandler(): MessageHandlerFn {
    const pongHandler: MessageHandlerFn = async (_clientId, message) => {
      const response: ServerMessage = { type: MessageType.PONG, id: message.id };
      return response;
    };
    this.registerHandler(MessageType.PING, pongHandler);
    return pongHandler;
  }

  // -----------------------------------------------------------------------
  // Internals
  // -----------------------------------------------------------------------

  private sendError(clientId: string, id: string | undefined, error: string): void {
    const response: ServerMessage = { type: MessageType.ERROR, id, error };
    this.server.send(clientId, response);
    this.logger.warn({ clientId, error }, "Protocol error sent to client");
  }

  private extractId(msg: Record<string, unknown>): string | undefined {
    const id = msg["id"];
    return typeof id === "string" ? id : undefined;
  }

  private extractPayload(msg: Record<string, unknown>): Record<string, unknown> | undefined {
    const payload = msg["payload"];
    if (typeof payload === "object" && payload !== null && !Array.isArray(payload)) {
      return payload as Record<string, unknown>;
    }
    return undefined;
  }
}
