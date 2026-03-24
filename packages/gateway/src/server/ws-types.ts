/**
 * Internal types for Gateway WebSocket Server
 */

import type { WebSocket } from 'ws';

/** Connection metadata associated with each WebSocket client */
export interface ClientInfo {
  /** Unique connection identifier */
  id: string;
  /** WebSocket instance */
  ws: WebSocket;
  /** Whether this client is alive (responds to ping) */
  isAlive: boolean;
  /** Connection timestamp */
  connectedAt: Date;
  /** Optional session ID assigned to this connection */
  sessionId?: string;
}

/** Callback type for connection events */
export type ConnectionHandler = (client: ClientInfo) => void;

/** Callback type for disconnection events */
export type DisconnectionHandler = (client: ClientInfo, code: number, reason: string) => void;

/** Callback type for error events */
export type ErrorHandler = (client: ClientInfo | undefined, error: Error) => void;

/** Callback type for message events */
export type MessageHandler = (client: ClientInfo, data: string) => void;

/** Configuration for the heartbeat/ping-pong keepalive mechanism */
export interface HeartbeatConfig {
  /** Interval in ms between pings (default: 30000) */
  interval: number;
  /** Maximum number of consecutive missed pongs before disconnect (default: 3) */
  maxMissedPongs: number;
}

/** Default heartbeat configuration */
export const DEFAULT_HEARTBEAT: HeartbeatConfig = {
  interval: 30_000,
  maxMissedPongs: 3,
};
