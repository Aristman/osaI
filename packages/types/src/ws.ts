/**
 * WebSocket Message Types for osaI Gateway Protocol
 *
 * Defines all message types exchanged between clients and the gateway.
 * Messages are separated into:
 * - Inbound (client -> gateway): message, command, permission_response, subscribe
 * - Outbound (gateway -> client): tool_stream, block, permission_request, error, status, event
 *
 * Based on ARCHITECTURE_OVERVIEW.md Section 4.1 WS Protocol Specification.
 */

// ---------------------------------------------------------------------------
// Inbound Message Types (client -> gateway)
// ---------------------------------------------------------------------------

/** Client text/content message sent to the gateway */
export interface ClientMessage {
  type: 'message';
  session_id: string;
  content: string;
  channel?: string;
}

/** Client command sent to the gateway */
export interface ClientCommand {
  type: 'command';
  command: string;
  params?: Record<string, unknown>;
}

/** Client response to a gateway permission request */
export interface PermissionResponse {
  type: 'permission_response';
  request_id: string;
  decision: 'approved' | 'denied';
}

/** Client subscription request for gateway events */
export interface ClientSubscribe {
  type: 'subscribe';
  events: string[];
}

// ---------------------------------------------------------------------------
// Outbound Message Types (gateway -> client)
// ---------------------------------------------------------------------------

/** Gateway forwards a tool execution chunk to the client */
export interface ToolStreamMessage {
  type: 'tool_stream';
  session_id: string;
  tool: string;
  action: string;
  chunk: Record<string, unknown>;
  progress?: number;
}

/** Gateway sends a content block (text, code, image, card, table) to the client */
export interface BlockStreamMessage {
  type: 'block';
  session_id: string;
  block_type: 'text' | 'code' | 'image' | 'card' | 'table';
  content: string;
  language?: string;
}

/** Gateway requests client permission for a tool action */
export interface PermissionRequest {
  type: 'permission_request';
  request_id: string;
  session_id: string;
  tool: string;
  action: string;
  params: Record<string, unknown>;
  risk_level: 'low' | 'medium' | 'high';
}

/** Gateway sends an error to the client */
export interface ErrorResponse {
  type: 'error';
  session_id: string;
  code: string;
  message: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
}

/** Gateway sends a session status update to the client */
export interface StatusMessage {
  type: 'status';
  session_id: string;
  state: string;
}

/** Gateway sends an event notification to the client */
export interface EventMessage {
  type: 'event';
  session_id: string;
  event: string;
  data: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Union types: inbound and outbound
// ---------------------------------------------------------------------------

/** Union of all inbound WS message types (client -> gateway) */
export type WsInboundMessage =
  | ClientMessage
  | ClientCommand
  | PermissionResponse
  | ClientSubscribe;

/** Union of all outbound WS message types (gateway -> client) */
export type WsOutboundMessage =
  | ToolStreamMessage
  | BlockStreamMessage
  | PermissionRequest
  | ErrorResponse
  | StatusMessage
  | EventMessage;
