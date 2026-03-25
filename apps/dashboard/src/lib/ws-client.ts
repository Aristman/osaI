/**
 * WebSocket client for Gateway communication.
 *
 * Features:
 * - connect/disconnect/send
 * - Auto-reconnect with exponential backoff (1s, 2s, 4s, 8s, max 30s)
 * - Event emitter pattern (on/off/emit)
 * - Connection state management
 */

import type { OutgoingMessage, IncomingMessage } from './types';

export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';

type EventMap = {
  connected: undefined;
  disconnected: { code: number; wasClean: boolean };
  reconnecting: { attempt: number; delay: number };
  error: Error;
  message: IncomingMessage;
  stateChange: ConnectionState;
};

type EventHandler<T> = (data: T) => void;

const INITIAL_BACKOFF_MS = 1000;
const MAX_BACKOFF_MS = 30000;
const BACKOFF_MULTIPLIER = 2;

export class WsClient {
  private ws: WebSocket | null = null;
  private _state: ConnectionState = 'disconnected';
  private _url = '';
  private listeners = new Map<string, Set<EventHandler<unknown>>>();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempt = 0;
  private currentBackoff = INITIAL_BACKOFF_MS;
  private intentionalClose = false;

  get state(): ConnectionState {
    return this._state;
  }

  private setState(newState: ConnectionState): void {
    if (this._state === newState) return;
    this._state = newState;
    this.emit('stateChange', newState);
  }

  connect(url: string): void {
    if (this._state === 'connected' || this._state === 'connecting') {
      return;
    }

    this._url = url;
    this.intentionalClose = false;
    this.setState('connecting');

    try {
      this.ws = new WebSocket(url);
      this.setupWsHandlers();
    } catch (err) {
      this.setState('disconnected');
      this.emit('error', err instanceof Error ? err : new Error(String(err)));
      this.scheduleReconnect();
    }
  }

  disconnect(): void {
    this.intentionalClose = true;
    this.clearReconnectTimer();

    if (this.ws) {
      try {
        this.ws.close(1000, 'Client disconnect');
      } catch {
        // Ignore errors on close
      }
      this.ws = null;
    }

    this.reconnectAttempt = 0;
    this.currentBackoff = INITIAL_BACKOFF_MS;
    this.setState('disconnected');
  }

  send(message: OutgoingMessage): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket is not connected');
    }
    this.ws.send(JSON.stringify(message));
  }

  on<K extends keyof EventMap>(event: K, handler: EventHandler<EventMap[K]>): void {
    const handlers = this.listeners.get(event) ?? new Set();
    handlers.add(handler as EventHandler<unknown>);
    this.listeners.set(event, handlers);
  }

  off<K extends keyof EventMap>(event: K, handler: EventHandler<EventMap[K]>): void {
    const handlers = this.listeners.get(event);
    if (handlers) {
      handlers.delete(handler as EventHandler<unknown>);
      if (handlers.size === 0) {
        this.listeners.delete(event);
      }
    }
  }

  protected emit<K extends keyof EventMap>(event: K, data: EventMap[K]): void {
    const handlers = this.listeners.get(event);
    if (handlers) {
      for (const handler of handlers) {
        try {
          handler(data);
        } catch {
          // Prevent handler errors from breaking event loop
        }
      }
    }
  }

  private setupWsHandlers(): void {
    if (!this.ws) return;

    this.ws.onopen = () => {
      this.setState('connected');
      this.emit('connected', undefined);

      // Reset backoff on successful connection
      this.reconnectAttempt = 0;
      this.currentBackoff = INITIAL_BACKOFF_MS;
    };

    this.ws.onmessage = (event: MessageEvent) => {
      try {
        const data = JSON.parse(String(event.data)) as IncomingMessage;
        this.emit('message', data);
      } catch {
        // Ignore malformed messages
      }
    };

    this.ws.onclose = (event: CloseEvent) => {
      this.ws = null;
      this.emit('disconnected', { code: event.code, wasClean: event.wasClean });

      if (!this.intentionalClose && !event.wasClean) {
        // Only reconnect on abnormal closure
        this.scheduleReconnect();
      } else {
        this.setState('disconnected');
      }
    };

    this.ws.onerror = () => {
      // Error event is followed by close, which handles reconnect
      this.emit('error', new Error('WebSocket error'));
    };
  }

  private scheduleReconnect(): void {
    this.clearReconnectTimer();
    this.reconnectAttempt++;
    this.currentBackoff = Math.min(
      INITIAL_BACKOFF_MS * Math.pow(BACKOFF_MULTIPLIER, this.reconnectAttempt - 1),
      MAX_BACKOFF_MS
    );

    this.setState('reconnecting');
    this.emit('reconnecting', { attempt: this.reconnectAttempt, delay: this.currentBackoff });

    this.reconnectTimer = setTimeout(() => {
      if (this._state === 'reconnecting' && !this.intentionalClose) {
        this.setState('connecting');
        try {
          this.ws = new WebSocket(this._url);
          this.setupWsHandlers();
        } catch (err) {
          this.emit('error', err instanceof Error ? err : new Error(String(err)));
          this.scheduleReconnect();
        }
      }
    }, this.currentBackoff);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }
}
