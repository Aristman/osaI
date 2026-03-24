/**
 * GatewayServer -- WebSocket server for osaI Gateway Control Plane
 *
 * Manages WebSocket connections on a configured host:port.
 * Implements connection lifecycle (connect, disconnect, error),
 * heartbeat/ping-pong keepalive, and message dispatch.
 */

import type { Server as HttpServer } from 'node:http';
import type { WebSocket, WebSocketServer as WsServer, ServerOptions } from 'ws';
import { WebSocketServer } from 'ws';
import type { GatewayConfig } from '@osai/types';
import type {
  ClientInfo,
  ConnectionHandler,
  DisconnectionHandler,
  ErrorHandler,
  MessageHandler,
  HeartbeatConfig,
} from './ws-types.js';
import { DEFAULT_HEARTBEAT } from './ws-types.js';

/** Internal state for the server, not exposed publicly */
interface ConnectionState {
  connections: Map<WebSocket, ClientInfo>;
  pingTimer: ReturnType<typeof setInterval> | null;
  missedPongs: Map<WebSocket, number>;
}

/**
 * GatewayServer provides a WebSocket server with:
 * - Configurable host:port binding
 * - Connection lifecycle management
 * - Heartbeat (ping/pong) keepalive
 * - Message routing to registered handlers
 * - Graceful shutdown
 */
export class GatewayServer {
  private wsServer: WsServer | null = null;
  private httpServer: HttpServer | null = null;
  private readonly config: GatewayConfig;
  private readonly heartbeat: HeartbeatConfig;
  private state: ConnectionState = {
    connections: new Map(),
    pingTimer: null,
    missedPongs: new Map(),
  };

  // Lifecycle handlers
  private onConnectHandler: ConnectionHandler | null = null;
  private onDisconnectHandler: DisconnectionHandler | null = null;
  private onErrorHandler: ErrorHandler | null = null;
  private onMessageHandler: MessageHandler | null = null;

  constructor(config: GatewayConfig, heartbeat?: Partial<HeartbeatConfig>) {
    this.config = config;
    this.heartbeat = { ...DEFAULT_HEARTBEAT, ...heartbeat };
  }

  /**
   * Register a handler for new client connections.
   */
  onConnect(handler: ConnectionHandler): this {
    this.onConnectHandler = handler;
    return this;
  }

  /**
   * Register a handler for client disconnections.
   */
  onDisconnect(handler: DisconnectionHandler): this {
    this.onDisconnectHandler = handler;
    return this;
  }

  /**
   * Register a handler for connection errors.
   */
  onError(handler: ErrorHandler): this {
    this.onErrorHandler = handler;
    return this;
  }

  /**
   * Register a handler for incoming text messages from clients.
   */
  onMessage(handler: MessageHandler): this {
    this.onMessageHandler = handler;
    return this;
  }

  /**
   * Start the WebSocket server, binding to configured host:port.
   * Optionally attaches to an existing HTTP server.
   */
  async start(httpServer?: HttpServer): Promise<void> {
    if (this.wsServer) {
      throw new Error('GatewayServer is already running');
    }

    return new Promise<void>((resolve, reject) => {
      this.httpServer = httpServer ?? null;

      const serverOptions: ServerOptions = this.httpServer
        ? { server: this.httpServer }
        : { port: this.config.port, host: this.config.host };

      this.wsServer = new WebSocketServer(serverOptions);

      this.wsServer.on('error', (error) => {
        // Server-level errors (e.g., EADDRINUSE)
        this.onErrorHandler?.(undefined, error as Error);
        reject(error as Error);
      });

      this.wsServer.on('connection', (ws: WebSocket, request) => {
        this.handleConnection(ws, request);
      });

      if (this.httpServer) {
        // When attached to an existing HTTP server, 'listening' is never emitted.
        // The server is immediately ready.
        this.startHeartbeat();
        resolve();
      } else {
        // Standalone mode: wait for the server to start listening
        this.wsServer.on('listening', () => {
          this.startHeartbeat();
          resolve();
        });
      }
    });
  }

  /**
   * Stop the WebSocket server gracefully.
   * Closes all active connections and stops heartbeat.
   */
  async stop(): Promise<void> {
    if (!this.wsServer) {
      return;
    }

    this.stopHeartbeat();

    return new Promise<void>((resolve) => {
      // Close all active connections
      for (const [ws] of this.state.connections) {
        this.closeConnection(ws, 1001, 'Server shutting down');
      }

      const server = this.wsServer!;
      server.close(() => {
        this.wsServer = null;
        this.httpServer = null;
        this.state.connections.clear();
        this.state.missedPongs.clear();
        resolve();
      });
    });
  }

  /**
   * Broadcast a message to all connected clients.
   */
  broadcast(message: string): void {
    const data = typeof message === 'string' ? message : JSON.stringify(message);
    for (const [, client] of this.state.connections) {
      if (client.ws.readyState === client.ws.OPEN) {
        client.ws.send(data);
      }
    }
  }

  /**
   * Send a message to a specific client by connection ID.
   */
  sendTo(clientId: string, message: string): boolean {
    for (const [, client] of this.state.connections) {
      if (client.id === clientId && client.ws.readyState === client.ws.OPEN) {
        client.ws.send(message);
        return true;
      }
    }
    return false;
  }

  /**
   * Get the number of currently active connections.
   */
  get connectionCount(): number {
    return this.state.connections.size;
  }

  /**
   * Check if the server is currently running.
   */
  get isRunning(): boolean {
    return this.wsServer !== null;
  }

  // ---------------------------------------------------------------------------
  // Private: Connection handling
  // ---------------------------------------------------------------------------

  private handleConnection(ws: WebSocket, _request: unknown): void {
    const clientId = this.generateClientId();
    const client: ClientInfo = {
      id: clientId,
      ws,
      isAlive: true,
      connectedAt: new Date(),
    };

    this.state.connections.set(ws, client);
    this.state.missedPongs.set(ws, 0);

    // Handle pong responses for heartbeat
    ws.on('pong', () => {
      client.isAlive = true;
      this.state.missedPongs.set(ws, 0);
    });

    // Handle incoming text messages
    ws.on('message', (data: Buffer | string) => {
      const text = typeof data === 'string' ? data : data.toString('utf-8');
      this.onMessageHandler?.(client, text);
    });

    // Handle connection errors (per-socket)
    ws.on('error', (error) => {
      this.onErrorHandler?.(client, error as Error);
    });

    // Handle close
    ws.on('close', (code: number, reason: Buffer) => {
      const reasonStr = reason.toString('utf-8') || 'Unknown';
      this.state.connections.delete(ws);
      this.state.missedPongs.delete(ws);
      this.onDisconnectHandler?.(client, code, reasonStr);
    });

    this.onConnectHandler?.(client);
  }

  private closeConnection(ws: WebSocket, code: number, reason: string): void {
    // Remove pong/pong handlers
    ws.removeAllListeners('pong');
    ws.removeAllListeners('message');
    ws.removeAllListeners('error');
    ws.removeAllListeners('close');

    if (ws.readyState === ws.OPEN || ws.readyState === ws.CONNECTING) {
      ws.close(code, reason);
    }

    this.state.connections.delete(ws);
    this.state.missedPongs.delete(ws);
  }

  // ---------------------------------------------------------------------------
  // Private: Heartbeat / ping-pong keepalive
  // ---------------------------------------------------------------------------

  private startHeartbeat(): void {
    this.stopHeartbeat();

    this.state.pingTimer = setInterval(() => {
      if (!this.wsServer) {
        return;
      }

      for (const [ws, client] of this.state.connections) {
        if (!client.isAlive) {
          // Client did not respond to previous ping
          const missed = (this.state.missedPongs.get(ws) ?? 0) + 1;
          this.state.missedPongs.set(ws, missed);

          if (missed >= this.heartbeat.maxMissedPongs) {
            // Terminate connection -- exceeded max missed pongs
            this.closeConnection(ws, 4008, 'Heartbeat timeout');
            this.onDisconnectHandler?.(client, 4008, 'Heartbeat timeout');
            continue;
          }
        }

        // Reset alive flag and send ping
        client.isAlive = false;
        if (ws.readyState === ws.OPEN) {
          ws.ping();
        }
      }
    }, this.heartbeat.interval);
  }

  private stopHeartbeat(): void {
    if (this.state.pingTimer) {
      clearInterval(this.state.pingTimer);
      this.state.pingTimer = null;
    }
  }

  // ---------------------------------------------------------------------------
  // Private: Utilities
  // ---------------------------------------------------------------------------

  private generateClientId(): string {
    return `conn_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  }
}
