/**
 * Gateway Client -- WebSocket client for osaI Gateway
 *
 * Connects to the Gateway WS endpoint, sends/receives messages
 * per the WS protocol defined in F-002.
 */

import type {
  WsInboundMessage,
  WsOutboundMessage,
  ToolStreamMessage,
  BlockStreamMessage,
  PermissionRequest,
  ErrorResponse,
  StatusMessage,
  EventMessage,
} from '@osai/types';
import WebSocket from 'ws';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface GatewayClientConfig {
  host?: string;
  port?: number;
  reconnectMaxAttempts?: number;
  reconnectBaseDelay?: number;
  reconnectMaxDelay?: number;
}

type EventHandler<T> = (data: T) => void;

// ---------------------------------------------------------------------------
// GatewayClient
// ---------------------------------------------------------------------------

export class GatewayClient {
  private ws: WebSocket | null = null;
  private state: ConnectionState = 'disconnected';
  private config: Required<GatewayClientConfig>;

  private messageHandlers = new Set<EventHandler<WsOutboundMessage>>();
  private toolStreamHandlers = new Set<EventHandler<ToolStreamMessage>>();
  private blockHandlers = new Set<EventHandler<BlockStreamMessage>>();
  private permissionRequestHandlers = new Set<EventHandler<PermissionRequest>>();
  private errorHandlers = new Set<EventHandler<ErrorResponse>>();
  private statusHandlers = new Set<EventHandler<StatusMessage>>();
  private eventHandlers = new Set<EventHandler<EventMessage>>();
  private stateChangeHandlers = new Set<EventHandler<ConnectionState>>();

  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private intentionalDisconnect = false;

  constructor(config?: GatewayClientConfig) {
    this.config = {
      host: config?.host ?? '127.0.0.1',
      port: config?.port ?? 18789,
      reconnectMaxAttempts: config?.reconnectMaxAttempts ?? 10,
      reconnectBaseDelay: config?.reconnectBaseDelay ?? 1000,
      reconnectMaxDelay: config?.reconnectMaxDelay ?? 30_000,
    };
  }

  get connectionState(): ConnectionState {
    return this.state;
  }

  get url(): string {
    return `ws://${this.config.host}:${this.config.port}`;
  }

  // ---------------------------------------------------------------------------
  // Connection
  // ---------------------------------------------------------------------------

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.intentionalDisconnect = false;
      this.setState('connecting');

      try {
        this.ws = new WebSocket(this.url);
      } catch (err) {
        this.setState('error');
        reject(new Error(`Failed to create WebSocket: ${err instanceof Error ? err.message : String(err)}`));
        return;
      }

      const onOpen = () => {
        this.reconnectAttempts = 0;
        this.setState('connected');
        this.ws?.off('open', onOpen);
        this.ws?.off('error', onError);
        resolve();
      };

      const onError = (err: Error) => {
        this.ws?.off('open', onOpen);
        this.ws?.off('error', onError);
        this.setState('error');
        reject(new Error(`Connection error: ${err.message}`));
      };

      this.ws.on('open', onOpen);
      this.ws.on('error', onError);

      this.setupMessageHandler();
      this.setupCloseHandler();
    });
  }

  disconnect(): Promise<void> {
    this.intentionalDisconnect = true;
    this.clearReconnectTimer();

    return new Promise((resolve) => {
      if (!this.ws || this.ws.readyState === WebSocket.CLOSED) {
        this.setState('disconnected');
        resolve();
        return;
      }

      this.ws.once('close', () => {
        this.setState('disconnected');
        resolve();
      });

      this.ws.close();
    });
  }

  // ---------------------------------------------------------------------------
  // Sending Messages
  // ---------------------------------------------------------------------------

  sendMessage(sessionId: string, content: string): void {
    this.sendRaw({ type: 'message', session_id: sessionId, content });
  }

  sendCommand(command: string, params?: Record<string, unknown>): void {
    this.sendRaw({ type: 'command', command, params });
  }

  sendPermissionResponse(requestId: string, decision: 'approved' | 'denied'): void {
    this.sendRaw({ type: 'permission_response', request_id: requestId, decision });
  }

  subscribe(events: string[]): void {
    this.sendRaw({ type: 'subscribe', events });
  }

  // ---------------------------------------------------------------------------
  // Event Subscription
  // ---------------------------------------------------------------------------

  onMessage(handler: EventHandler<WsOutboundMessage>): () => void {
    this.messageHandlers.add(handler);
    return () => { this.messageHandlers.delete(handler); };
  }

  onToolStream(handler: EventHandler<ToolStreamMessage>): () => void {
    this.toolStreamHandlers.add(handler);
    return () => { this.toolStreamHandlers.delete(handler); };
  }

  onBlock(handler: EventHandler<BlockStreamMessage>): () => void {
    this.blockHandlers.add(handler);
    return () => { this.blockHandlers.delete(handler); };
  }

  onPermissionRequest(
    handler: EventHandler<PermissionRequest>,
  ): (decision: 'approved' | 'denied') => void {
    this.permissionRequestHandlers.add(handler);
    return (decision: 'approved' | 'denied') => {
      this.sendPermissionResponse(
        // We store the last requestId on the handler map for resolution
        (handler as unknown as { __requestId?: string }).__requestId ?? '',
        decision,
      );
    };
  }

  onError(handler: EventHandler<ErrorResponse>): () => void {
    this.errorHandlers.add(handler);
    return () => { this.errorHandlers.delete(handler); };
  }

  onStatus(handler: EventHandler<StatusMessage>): () => void {
    this.statusHandlers.add(handler);
    return () => { this.statusHandlers.delete(handler); };
  }

  onEvent(handler: EventHandler<EventMessage>): () => void {
    this.eventHandlers.add(handler);
    return () => { this.eventHandlers.delete(handler); };
  }

  onStateChange(handler: EventHandler<ConnectionState>): () => void {
    this.stateChangeHandlers.add(handler);
    return () => { this.stateChangeHandlers.delete(handler); };
  }

  // ---------------------------------------------------------------------------
  // State Query
  // ---------------------------------------------------------------------------

  isConnected(): boolean {
    return this.state === 'connected' && this.ws?.readyState === WebSocket.OPEN;
  }

  // ---------------------------------------------------------------------------
  // Private Helpers
  // ---------------------------------------------------------------------------

  private sendRaw(message: WsInboundMessage): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('Not connected to gateway');
    }
    this.ws.send(JSON.stringify(message));
  }

  private setState(state: ConnectionState): void {
    const prev = this.state;
    this.state = state;
    if (prev !== state) {
      for (const handler of this.stateChangeHandlers) {
        handler(state);
      }
    }
  }

  private setupMessageHandler(): void {
    if (!this.ws) return;

    this.ws.on('message', (raw: WebSocket.RawData) => {
      let parsed: WsOutboundMessage;
      try {
        parsed = JSON.parse(raw.toString()) as WsOutboundMessage;
      } catch {
        return; // ignore malformed messages
      }

      // Notify generic handlers
      for (const handler of this.messageHandlers) {
        handler(parsed);
      }

      // Route to specific handlers
      switch (parsed.type) {
        case 'tool_stream':
          for (const handler of this.toolStreamHandlers) {
            handler(parsed);
          }
          break;
        case 'block':
          for (const handler of this.blockHandlers) {
            handler(parsed);
          }
          break;
        case 'permission_request':
          // Attach requestId for unsubscribe resolution
          for (const handler of this.permissionRequestHandlers) {
            (handler as unknown as { __requestId?: string }).__requestId = parsed.request_id;
            handler(parsed);
          }
          break;
        case 'error':
          for (const handler of this.errorHandlers) {
            handler(parsed);
          }
          break;
        case 'status':
          for (const handler of this.statusHandlers) {
            handler(parsed);
          }
          break;
        case 'event':
          for (const handler of this.eventHandlers) {
            handler(parsed);
          }
          break;
      }
    });
  }

  private setupCloseHandler(): void {
    if (!this.ws) return;

    this.ws.on('close', () => {
      if (this.intentionalDisconnect) {
        this.setState('disconnected');
        return;
      }

      this.setState('disconnected');
      this.attemptReconnect();
    });
  }

  private attemptReconnect(): void {
    if (this.intentionalDisconnect) return;
    if (this.reconnectAttempts >= this.config.reconnectMaxAttempts) {
      this.setState('error');
      return;
    }

    const jitter = 1 - 0.25 + Math.random() * 0.5; // +/- 25%
    const baseDelay = Math.min(
      this.config.reconnectBaseDelay * Math.pow(2, this.reconnectAttempts),
      this.config.reconnectMaxDelay,
    );
    const delay = baseDelay * jitter;

    this.reconnectAttempts++;
    this.setState('connecting');

    this.reconnectTimer = setTimeout(() => {
      if (this.intentionalDisconnect) return;

      this.connect().catch(() => {
        // connect() failed (e.g. port not yet available), retry
        this.attemptReconnect();
      });
    }, delay);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }
}
