/**
 * @osai/cli -- Gateway WebSocket Client (DOMAIN-011, T-001)
 *
 * WebSocket client for connecting to the osaI Gateway.
 * Provides automatic reconnect with exponential backoff.
 *
 * Events emitted:
 *   - "connected"   -- WS connection established
 *   - "disconnected" -- WS connection closed (before reconnect attempt)
 *   - "reconnecting" -- attempting reconnect (retry number in payload)
 *   - "failed"       -- all retries exhausted
 *   - "message"      -- received message from gateway (data: unknown)
 */

import { EventEmitter } from "node:events";
import WebSocket from "ws";
import pino from "pino";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Default Gateway address */
const DEFAULT_GATEWAY_URL = "ws://127.0.0.1:18790";

/** Maximum reconnect attempts */
const MAX_RETRIES = 3;

/** Exponential backoff base delay in ms */
const BASE_BACKOFF_MS = 1000;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GatewayClientOptions {
  /** Gateway WebSocket URL (default: ws://127.0.0.1:18789) */
  url?: string;
  /** Maximum reconnect attempts (default: 3) */
  maxRetries?: number;
  /** Base backoff delay in ms (default: 1000) */
  baseBackoffMs?: number;
  /** Logger instance (optional, will create default if not provided) */
  logger?: pino.Logger;
}

export type GatewayClientEvents = {
  connected: [];
  disconnected: [];
  reconnecting: [attempt: number];
  failed: [];
  message: [data: WebSocket.Data];
};

// ---------------------------------------------------------------------------
// GatewayClient
// ---------------------------------------------------------------------------

export class GatewayClient extends EventEmitter<GatewayClientEvents> {
  private readonly url: string;
  private readonly maxRetries: number;
  private readonly baseBackoffMs: number;
  private readonly logger: pino.Logger;

  private ws: WebSocket | null = null;
  private retryCount = 0;
  private isClosed = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(options: GatewayClientOptions = {}) {
    super();
    this.url = options.url ?? DEFAULT_GATEWAY_URL;
    this.maxRetries = options.maxRetries ?? MAX_RETRIES;
    this.baseBackoffMs = options.baseBackoffMs ?? BASE_BACKOFF_MS;
    this.logger = options.logger ?? pino({ name: "gateway-client" });
  }

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  /**
   * Connect to the Gateway WebSocket server.
   * If the connection fails or drops, automatic reconnect will be attempted.
   */
  connect(): void {
    if (this.isClosed) {
      this.logger.warn("Cannot connect: client is closed");
      return;
    }

    this.retryCount = 0;
    this.createConnection();
  }

  /**
   * Disconnect from the Gateway.
   * Stops any pending reconnect attempts.
   */
  disconnect(): void {
    this.isClosed = true;
    this.clearReconnectTimer();

    if (this.ws) {
      this.ws.removeAllListeners();
      if (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING) {
        this.ws.close();
      }
      this.ws = null;
    }

    this.logger.info("Client disconnected");
  }

  /**
   * Send a message to the Gateway.
   *
   * @param data - Data to send (will be serialized as JSON if object)
   * @throws {Error} If WebSocket is not connected
   */
  send(data: unknown): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error("Cannot send: WebSocket is not connected");
    }

    const payload = typeof data === "string" ? data : JSON.stringify(data);
    this.ws.send(payload);
    this.logger.debug({ size: payload.length }, "Message sent");
  }

  /**
   * Check if the WebSocket is currently connected.
   */
  get isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  // -----------------------------------------------------------------------
  // Connection lifecycle (private)
  // -----------------------------------------------------------------------

  private createConnection(): void {
    this.logger.info({ url: this.url }, "Connecting to Gateway");

    try {
      this.ws = new WebSocket(this.url);
    } catch (err: unknown) {
      this.logger.error({ error: err }, "Failed to create WebSocket");
      this.handleReconnect();
      return;
    }

    this.ws.on("open", () => {
      this.logger.info("Connected to Gateway");
      this.retryCount = 0;
      this.emit("connected");
    });

    this.ws.on("close", (code: number, reason: Buffer) => {
      this.logger.info({ code, reason: reason.toString() }, "Disconnected from Gateway");
      this.emit("disconnected");
      this.handleReconnect();
    });

    this.ws.on("error", (err: Error) => {
      this.logger.error({ error: err.message }, "WebSocket error");
    });

    this.ws.on("message", (data: WebSocket.Data) => {
      this.emit("message", data);
    });

    // Respond to server heartbeat pings to avoid 1008 disconnect
    this.ws.on("ping", () => {
      this.ws?.pong();
    });
  }

  private handleReconnect(): void {
    if (this.isClosed) {
      return;
    }

    if (this.retryCount >= this.maxRetries) {
      this.logger.error(
        { retries: this.retryCount },
        "Max reconnect attempts reached",
      );
      this.emit("failed");
      return;
    }

    const attempt = this.retryCount + 1;
    const delay = this.baseBackoffMs * Math.pow(2, this.retryCount);

    this.logger.info({ attempt, delay, maxRetries: this.maxRetries }, "Scheduling reconnect");
    this.emit("reconnecting", attempt);

    this.reconnectTimer = setTimeout(() => {
      this.retryCount = attempt;
      this.createConnection();
    }, delay);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }
}
