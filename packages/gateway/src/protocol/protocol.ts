/**
 * WS Protocol -- Message parsing, validation, routing, and sending
 *
 * Implements the osaI Gateway WS protocol:
 * - Parsing inbound messages (client -> gateway)
 * - Building outbound messages (gateway -> client)
 * - Message routing by type
 * - Validation of message structure
 */

import type {
  WsInboundMessage,
  WsOutboundMessage,
  ClientMessage,
  ClientCommand,
  PermissionResponse,
  ClientSubscribe,
  ToolStreamMessage,
  BlockStreamMessage,
  PermissionRequest,
  ErrorResponse,
  StatusMessage,
  EventMessage,
} from '@osai/types';
import type { ClientInfo } from '../server/ws-types.js';

// ---------------------------------------------------------------------------
// Inbound message type discriminator
// ---------------------------------------------------------------------------

const INBOUND_MESSAGE_TYPES = ['message', 'command', 'permission_response', 'subscribe'] as const;

/**
 * Type guard: check if a parsed object is a valid WsInboundMessage.
 */
export function isWsInboundMessage(obj: unknown): obj is WsInboundMessage {
  if (typeof obj !== 'object' || obj === null) return false;
  const record = obj as Record<string, unknown>;
  return (
    typeof record.type === 'string' &&
    (INBOUND_MESSAGE_TYPES as readonly string[]).includes(record.type)
  );
}

/**
 * Type discriminator for specific inbound message types
 */
export type InboundMessageType = WsInboundMessage['type'];

// ---------------------------------------------------------------------------
// Message Parser
// ---------------------------------------------------------------------------

export interface ParseResult {
  success: true;
  message: WsInboundMessage;
}

export interface ParseError {
  success: false;
  error: string;
  raw: string;
}

/**
 * Parse a raw text message into a validated WsInboundMessage.
 * Returns ParseResult on success or ParseError on failure.
 */
export function parseMessage(raw: string): ParseResult | ParseError {
  if (typeof raw !== 'string' || raw.length === 0) {
    return { success: false, error: 'Empty message', raw };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { success: false, error: 'Invalid JSON', raw };
  }

  if (!isWsInboundMessage(parsed)) {
    return {
      success: false,
      error: `Unknown or invalid message type: ${(parsed as Record<string, unknown>).type}`,
      raw,
    };
  }

  // Additional per-type validation
  const validationError = validateInboundMessage(parsed);
  if (validationError) {
    return { success: false, error: validationError, raw };
  }

  return { success: true, message: parsed };
}

/**
 * Validate structural requirements for each inbound message type.
 */
function validateInboundMessage(message: WsInboundMessage): string | null {
  switch (message.type) {
    case 'message': {
      const msg = message as ClientMessage;
      if (typeof msg.session_id !== 'string' || msg.session_id.length === 0) {
        return 'message.session_id is required and must be a non-empty string';
      }
      if (typeof msg.content !== 'string') {
        return 'message.content is required and must be a string';
      }
      return null;
    }
    case 'command': {
      const cmd = message as ClientCommand;
      if (typeof cmd.command !== 'string' || cmd.command.length === 0) {
        return 'command.command is required and must be a non-empty string';
      }
      return null;
    }
    case 'permission_response': {
      const resp = message as PermissionResponse;
      if (typeof resp.request_id !== 'string' || resp.request_id.length === 0) {
        return 'permission_response.request_id is required and must be a non-empty string';
      }
      if (resp.decision !== 'approved' && resp.decision !== 'denied') {
        return "permission_response.decision must be 'approved' or 'denied'";
      }
      return null;
    }
    case 'subscribe': {
      const sub = message as ClientSubscribe;
      if (!Array.isArray(sub.events)) {
        return 'subscribe.events is required and must be an array';
      }
      return null;
    }
    default: {
      // Exhaustiveness check -- should never reach here due to isWsInboundMessage guard
      const _exhaustive: never = message;
      return `Unknown message type: ${String(_exhaustive)}`;
    }
  }
}

// ---------------------------------------------------------------------------
// Outbound Message Builders
// ---------------------------------------------------------------------------

/**
 * Build a ToolStreamMessage for sending to a client.
 */
export function buildToolStreamMessage(
  sessionId: string,
  tool: string,
  action: string,
  chunk: Record<string, unknown>,
  progress?: number,
): ToolStreamMessage {
  return {
    type: 'tool_stream',
    session_id: sessionId,
    tool,
    action,
    chunk,
    progress,
  };
}

/**
 * Build a BlockStreamMessage for sending to a client.
 */
export function buildBlockMessage(
  sessionId: string,
  blockType: BlockStreamMessage['block_type'],
  content: string,
  language?: string,
): BlockStreamMessage {
  return {
    type: 'block',
    session_id: sessionId,
    block_type: blockType,
    content,
    language,
  };
}

/**
 * Build a PermissionRequest for sending to a client.
 */
export function buildPermissionRequest(
  requestId: string,
  sessionId: string,
  tool: string,
  action: string,
  params: Record<string, unknown>,
  riskLevel: PermissionRequest['risk_level'],
): PermissionRequest {
  return {
    type: 'permission_request',
    request_id: requestId,
    session_id: sessionId,
    tool,
    action,
    params,
    risk_level: riskLevel,
  };
}
export function buildErrorResponse(
  sessionId: string,
  code: string,
  message: string,
  severity: ErrorResponse['severity'],
): ErrorResponse {
  return {
    type: 'error',
    session_id: sessionId,
    code,
    message,
    severity,
  };
}

/**
 * Build a StatusMessage for sending to a client.
 */
export function buildStatusMessage(sessionId: string, state: string): StatusMessage {
  return {
    type: 'status',
    session_id: sessionId,
    state,
  };
}

/**
 * Build an EventMessage for sending to a client.
 */
export function buildEventMessage(
  sessionId: string,
  event: string,
  data: Record<string, unknown>,
): EventMessage {
  return {
    type: 'event',
    session_id: sessionId,
    event,
    data,
  };
}

/**
 * Serialize an outbound message to a JSON string for WS transmission.
 */
export function serializeMessage(message: WsOutboundMessage): string {
  return JSON.stringify(message);
}

// ---------------------------------------------------------------------------
// Message Handler Type
// ---------------------------------------------------------------------------

/**
 * Handler function for a specific inbound message type.
 * Returns optional outbound message(s) to send back.
 */
export type MessageHandlerFn<T extends WsInboundMessage = WsInboundMessage> = (
  message: T,
  client: ClientInfo,
) => WsOutboundMessage[] | WsOutboundMessage | void;

// ---------------------------------------------------------------------------
// Message Router
// ---------------------------------------------------------------------------

/**
 * MessageRouter dispatches inbound messages to registered handlers by type.
 *
 * Usage:
 * ```ts
 * const router = new MessageRouter();
 * router.register('message', (msg, client) => {
 *   return buildStatusMessage(msg.session_id, 'received');
 * });
 *
 * const outbound = router.route(parsedMessage, clientInfo);
 * ```
 */
export class MessageRouter {
  private handlers: Map<InboundMessageType, MessageHandlerFn> = new Map();

  /**
   * Register a handler for a specific inbound message type.
   */
  register<T extends InboundMessageType>(
    type: T,
    handler: MessageHandlerFn,
  ): this {
    this.handlers.set(type, handler);
    return this;
  }

  /**
   * Route a parsed inbound message to the appropriate handler.
   * Returns an array of outbound messages (may be empty).
   */
  route(message: WsInboundMessage, client: ClientInfo): WsOutboundMessage[] {
    const handler = this.handlers.get(message.type as InboundMessageType);
    if (!handler) {
      return [];
    }

    const result = handler(message, client);

    if (result === undefined || result === null) {
      return [];
    }

    if (Array.isArray(result)) {
      return result;
    }

    return [result];
  }

  /**
   * Check if a handler is registered for the given message type.
   */
  hasHandler(type: InboundMessageType): boolean {
    return this.handlers.has(type);
  }
}
