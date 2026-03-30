import { randomUUID } from "node:crypto";
import { WebSocket, WebSocketServer as WsLibServer } from "ws";
import pino from "pino";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Configuration options for the WebSocket server. */
export interface WsServerConfig {
  /** Host to bind to. Default: "127.0.0.1". */
  readonly host?: string;
  /** Port to listen on. Default: 18789. */
  readonly port?: number;
  /** Heartbeat ping interval in milliseconds. Default: 30_000. */
  readonly heartbeatIntervalMs?: number;
  /** Custom pino logger instance. If omitted, a default child logger is created. */
  readonly logger?: pino.Logger;
}

/** Callback invoked when a new client connects. */
export type ConnectionCallback = (clientId: string, ws: WebSocket) => void;

/** Callback invoked when a client disconnects. */
export type DisconnectionCallback = (clientId: string, code: number, reason: Buffer) => void;

/** Internal bookkeeping for a connected client. */
interface ClientEntry {
  readonly id: string;
  readonly ws: WebSocket;
  readonly isAlive: { value: boolean };
}

// ---------------------------------------------------------------------------
// WsServer
// ---------------------------------------------------------------------------

/**
 * WebSocket server wrapping the `ws` library.
 *
 * Responsibilities:
 * - Bind to configured host:port
 * - Manage client connections (connect / disconnect)
 * - Heartbeat (ping/pong) to detect dead connections
 * - send() to a specific client by id
 * - broadcast() to all connected clients
 * - Graceful shutdown
 */
export class WsServer {
  private readonly config: Required<Pick<WsServerConfig, "host" | "port" | "heartbeatIntervalMs">>;
  private readonly logger: pino.Logger;

  private server: WsLibServer | null = null;
  private readonly clients = new Map<string, ClientEntry>();
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  private readonly onConnectionCallbacks: ConnectionCallback[] = [];
  private readonly onDisconnectionCallbacks: DisconnectionCallback[] = [];

  constructor(config: WsServerConfig = {}) {
    this.config = {
      host: config.host ?? "127.0.0.1",
      port: config.port ?? 18789,
      heartbeatIntervalMs: config.heartbeatIntervalMs ?? 30_000,
    };
    this.logger = config.logger ?? pino({ name: "ws-server" }).child({ component: "ws-server" });
  }

  // -----------------------------------------------------------------------
  // Lifecycle
  // -----------------------------------------------------------------------

  /**
   * Start the WebSocket server.
   * Binds to the configured host:port and starts the heartbeat loop.
   */
  async start(): Promise<void> {
    if (this.server !== null) {
      this.logger.warn({ host: this.config.host, port: this.config.port }, "WsServer already running");
      return;
    }

    await new Promise<void>((resolve, reject) => {
      this.server = new WsLibServer(
        { host: this.config.host, port: this.config.port },
        () => {
          this.logger.info(
            { host: this.config.host, port: this.config.port },
            "WsServer listening",
          );
          this.startHeartbeat();
          resolve();
        },
      );

      this.server.on("error", (error: NodeJS.ErrnoException) => {
        this.logger.error(
          { err: error, host: this.config.host, port: this.config.port },
          "WsServer failed to start",
        );
        this.server = null;
        reject(error);
      });

      this.server.on("connection", (ws: WebSocket) => {
        this.handleConnection(ws);
      });
    });
  }

  /**
   * Gracefully stop the WebSocket server.
   * Closes all client connections, stops the heartbeat, and shuts down the server.
   */
  async stop(): Promise<void> {
    if (this.server === null) {
      this.logger.debug("WsServer not running, nothing to stop");
      return;
    }

    this.logger.info("WsServer shutting down");

    this.stopHeartbeat();

    // Close all client connections.
    for (const client of this.clients.values()) {
      this.closeClient(client, 1001, "Server shutting down");
    }

    await new Promise<void>((resolve) => {
      this.server!.close(() => {
        this.logger.info("WsServer stopped");
        this.server = null;
        resolve();
      });
    });
  }

  // -----------------------------------------------------------------------
  // Event registration
  // -----------------------------------------------------------------------

  /** Register a callback for new client connections. */
  onConnection(callback: ConnectionCallback): void {
    this.onConnectionCallbacks.push(callback);
  }

  /** Register a callback for client disconnections. */
  onDisconnection(callback: DisconnectionCallback): void {
    this.onDisconnectionCallbacks.push(callback);
  }

  // -----------------------------------------------------------------------
  // Client info
  // -----------------------------------------------------------------------

  /** Returns the current number of connected clients. */
  getConnections(): number {
    return this.clients.size;
  }

  // -----------------------------------------------------------------------
  // Messaging
  // -----------------------------------------------------------------------

  /** Send a JSON-serializable message to a specific client by id. */
  send(clientId: string, message: object): void {
    const client = this.clients.get(clientId);
    if (client === undefined) {
      this.logger.warn({ clientId }, "send() target client not found");
      return;
    }

    const data = JSON.stringify(message);
    if (client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(data);
    } else {
      this.logger.warn({ clientId, state: client.ws.readyState }, "send() client not in OPEN state");
    }
  }

  /** Broadcast a JSON-serializable message to all connected clients. */
  broadcast(message: object): void {
    const data = JSON.stringify(message);
    for (const client of this.clients.values()) {
      if (client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(data);
      }
    }
    this.logger.debug({ clientCount: this.clients.size }, "broadcast() sent");
  }

  // -----------------------------------------------------------------------
  // Heartbeat
  // -----------------------------------------------------------------------

  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => {
      for (const client of this.clients.values()) {
        if (!client.isAlive.value) {
          this.logger.info({ clientId: client.id }, "Heartbeat timeout -- terminating client");
          this.closeClient(client, 1008, "Heartbeat timeout");
          continue;
        }

        client.isAlive.value = false;
        if (client.ws.readyState === WebSocket.OPEN) {
          client.ws.ping();
        }
      }
    }, this.config.heartbeatIntervalMs);

    // Allow the process to exit even if the heartbeat timer is running.
    if (this.heartbeatTimer.unref !== undefined) {
      this.heartbeatTimer.unref();
    }
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer !== null) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  // -----------------------------------------------------------------------
  // Connection handling
  // -----------------------------------------------------------------------

  private handleConnection(ws: WebSocket): void {
    const clientId = randomUUID();

    this.logger.info({ clientId }, "Client connected");

    const entry: ClientEntry = {
      id: clientId,
      ws,
      isAlive: { value: true },
    };

    this.clients.set(clientId, entry);

    ws.on("pong", () => {
      entry.isAlive.value = true;
    });

    ws.on("close", (code: number, reason: Buffer) => {
      this.handleDisconnection(clientId, code, reason);
    });

    ws.on("error", (error: Error) => {
      this.logger.error({ err: error, clientId }, "Client WebSocket error");
      // The 'close' event will follow automatically.
    });

    for (const cb of this.onConnectionCallbacks) {
      try {
        cb(clientId, ws);
      } catch (err) {
        this.logger.error({ err, clientId }, "onConnection callback error");
      }
    }
  }

  private handleDisconnection(
    clientId: string,
    code: number,
    reason: Buffer,
  ): void {
    const existed = this.clients.delete(clientId);
    if (!existed) {
      // Already removed (e.g. by heartbeat timeout).
      return;
    }

    this.logger.info({ clientId, code, reason: reason.toString() }, "Client disconnected");

    for (const cb of this.onDisconnectionCallbacks) {
      try {
        cb(clientId, code, reason);
      } catch (err) {
        this.logger.error({ err, clientId }, "onDisconnection callback error");
      }
    }
  }

  private closeClient(client: ClientEntry, code: number, reason: string): void {
    try {
      client.ws.close(code, reason);
    } catch {
      // Ignore close errors on already-closing connections.
    }
    this.clients.delete(client.id);
  }
}
