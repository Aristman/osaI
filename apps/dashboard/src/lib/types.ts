/**
 * WebSocket message types for Gateway communication.
 *
 * Based on Gateway WS Protocol (inherited from OpenClaw):
 * - message: user message to agent
 * - command: control commands
 * - permission_response: user approval/denial
 * - subscribe: event subscription
 * - tool_stream: real-time tool execution results
 * - block: structured content blocks
 * - permission_request: tool execution permission prompt
 */

// --- Base message types ---

export interface WsMessage {
  type: string;
  timestamp: string;
  sessionId: string;
  payload: unknown;
}

// --- Outgoing messages (Client -> Gateway) ---

export type OutgoingMessage =
  | UserMessage
  | CommandMessage
  | PermissionResponseMessage
  | SubscribeMessage;

export interface UserMessage {
  type: 'message';
  sessionId: string;
  content: string;
  metadata?: Record<string, unknown>;
}

export interface CommandMessage {
  type: 'command';
  sessionId: string;
  command: string;
  args?: Record<string, unknown>;
}

export interface PermissionResponseMessage {
  type: 'permission_response';
  requestId: string;
  decision: 'approved' | 'denied';
  reason?: string;
}

export interface SubscribeMessage {
  type: 'subscribe';
  events: string[];
  sessionId?: string;
}

// --- Incoming messages (Gateway -> Client) ---

export type IncomingMessage =
  | BlockMessage
  | ToolStreamMessage
  | PermissionRequestMessage
  | StatusMessage
  | EventMessage
  | ErrorMessage;

export interface BlockMessage {
  type: 'block';
  sessionId: string;
  blockId: string;
  blockType: 'text' | 'code' | 'image' | 'card' | 'table';
  content: unknown;
  timestamp: string;
}

export interface ToolStreamMessage {
  type: 'tool_stream';
  sessionId: string;
  toolCallId: string;
  toolName: string;
  status: 'started' | 'progress' | 'completed' | 'error';
  data: unknown;
  duration?: number;
  timestamp: string;
}

export interface PermissionRequestMessage {
  type: 'permission_request';
  requestId: string;
  sessionId: string;
  toolName: string;
  action: string;
  params: Record<string, unknown>;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  timestamp: string;
}

export interface StatusMessage {
  type: 'status';
  status: 'ok' | 'warning' | 'error';
  data: Record<string, unknown>;
  timestamp: string;
}

export interface EventMessage {
  type: 'event';
  event: string;
  sessionId?: string;
  data: unknown;
  timestamp: string;
}

export interface ErrorMessage {
  type: 'error';
  code: string;
  message: string;
  sessionId?: string;
  timestamp: string;
}

// --- Connection state ---

export type ConnectionState =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'error';

// --- Session types ---

export interface Session {
  id: string;
  label: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  channel: 'cli' | 'dashboard' | 'telegram' | 'whatsapp';
  status: 'active' | 'archived';
}
