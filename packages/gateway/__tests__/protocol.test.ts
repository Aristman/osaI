/**
 * Unit tests for WS Protocol: parsing, validation, message building, routing
 */

import { describe, it, expect, vi } from 'vitest';
import {
  parseMessage,
  isWsInboundMessage,
  serializeMessage,
  buildToolStreamMessage,
  buildBlockMessage,
  buildPermissionRequest,
  buildErrorResponse,
  buildStatusMessage,
  buildEventMessage,
  MessageRouter,
} from '../src/protocol/protocol.js';
import type { ClientInfo } from '../src/index.js';
import type { ClientMessage } from '@osai/types';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

function createMockClient(overrides?: Partial<ClientInfo>): ClientInfo {
  return {
    id: 'test-conn-1',
    ws: {} as unknown as ClientInfo['ws'],
    isAlive: true,
    connectedAt: new Date(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// isWsInboundMessage
// ---------------------------------------------------------------------------

describe('isWsInboundMessage', () => {
  it('should return true for valid message type', () => {
    expect(isWsInboundMessage({ type: 'message', session_id: 's1', content: 'hi' })).toBe(true);
  });

  it('should return true for valid command type', () => {
    expect(isWsInboundMessage({ type: 'command', command: 'start' })).toBe(true);
  });

  it('should return true for valid permission_response type', () => {
    expect(
      isWsInboundMessage({ type: 'permission_response', request_id: 'r1', decision: 'approved' }),
    ).toBe(true);
  });

  it('should return true for valid subscribe type', () => {
    expect(isWsInboundMessage({ type: 'subscribe', events: ['tool_stream'] })).toBe(true);
  });

  it('should return false for unknown type', () => {
    expect(isWsInboundMessage({ type: 'unknown' })).toBe(false);
  });

  it('should return false for null', () => {
    expect(isWsInboundMessage(null)).toBe(false);
  });

  it('should return false for non-object', () => {
    expect(isWsInboundMessage('string')).toBe(false);
  });

  it('should return false for object without type', () => {
    expect(isWsInboundMessage({ data: 123 })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// parseMessage
// ---------------------------------------------------------------------------

describe('parseMessage', () => {
  it('should parse a valid client message', () => {
    const raw = JSON.stringify({ type: 'message', session_id: 's1', content: 'hello' });
    const result = parseMessage(raw);

    if (result.success) {
      expect(result.message.type).toBe('message');
      expect((result.message as ClientMessage).session_id).toBe('s1');
    } else {
      expect.unreachable('Expected success');
    }
  });

  it('should parse a valid command', () => {
    const raw = JSON.stringify({ type: 'command', command: 'stop', params: { force: true } });
    const result = parseMessage(raw);

    if (result.success) {
      expect(result.message.type).toBe('command');
      expect((result.message as { command: string }).command).toBe('stop');
    } else {
      expect.unreachable('Expected success');
    }
  });

  it('should parse a valid permission_response', () => {
    const raw = JSON.stringify({ type: 'permission_response', request_id: 'r1', decision: 'denied' });
    const result = parseMessage(raw);

    if (result.success) {
      expect(result.message.type).toBe('permission_response');
    } else {
      expect.unreachable('Expected success');
    }
  });

  it('should parse a valid subscribe', () => {
    const raw = JSON.stringify({ type: 'subscribe', events: ['tool_stream', 'block'] });
    const result = parseMessage(raw);

    if (result.success) {
      expect(result.message.type).toBe('subscribe');
    } else {
      expect.unreachable('Expected success');
    }
  });

  it('should return error for empty string', () => {
    const result = parseMessage('');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('Empty');
    }
  });

  it('should return error for invalid JSON', () => {
    const result = parseMessage('{invalid json');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('Invalid JSON');
    }
  });

  it('should return error for unknown type', () => {
    const result = parseMessage(JSON.stringify({ type: 'not_a_type' }));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('Unknown');
    }
  });

  it('should return error for message without session_id', () => {
    const raw = JSON.stringify({ type: 'message', content: 'hi' });
    const result = parseMessage(raw);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('session_id');
    }
  });

  it('should return error for message with empty session_id', () => {
    const raw = JSON.stringify({ type: 'message', session_id: '', content: 'hi' });
    const result = parseMessage(raw);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('session_id');
    }
  });

  it('should return error for command without command field', () => {
    const raw = JSON.stringify({ type: 'command' });
    const result = parseMessage(raw);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('command');
    }
  });

  it('should return error for permission_response with invalid decision', () => {
    const raw = JSON.stringify({ type: 'permission_response', request_id: 'r1', decision: 'maybe' });
    const result = parseMessage(raw);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('decision');
    }
  });

  it('should return error for subscribe without events array', () => {
    const raw = JSON.stringify({ type: 'subscribe', events: 'not-array' });
    const result = parseMessage(raw);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('events');
    }
  });
});

// ---------------------------------------------------------------------------
// Message Builders
// ---------------------------------------------------------------------------

describe('Message Builders', () => {
  it('buildToolStreamMessage should create a valid tool_stream message', () => {
    const msg = buildToolStreamMessage('s1', 'shell', 'execute', { output: 'hello' }, 50);
    expect(msg).toEqual({
      type: 'tool_stream',
      session_id: 's1',
      tool: 'shell',
      action: 'execute',
      chunk: { output: 'hello' },
      progress: 50,
    });
  });

  it('buildBlockMessage should create a valid block message', () => {
    const msg = buildBlockMessage('s1', 'code', 'console.log("hi")', 'javascript');
    expect(msg).toEqual({
      type: 'block',
      session_id: 's1',
      block_type: 'code',
      content: 'console.log("hi")',
      language: 'javascript',
    });
  });

  it('buildPermissionRequest should create a valid permission_request', () => {
    const msg = buildPermissionRequest('r1', 's1', 'shell', 'execute', { cmd: 'rm' }, 'high');
    expect(msg).toEqual({
      type: 'permission_request',
      request_id: 'r1',
      session_id: 's1',
      tool: 'shell',
      action: 'execute',
      params: { cmd: 'rm' },
      risk_level: 'high',
    });
  });

  it('buildErrorResponse should create a valid error message', () => {
    const msg = buildErrorResponse('s1', 'ERR_TIMEOUT', 'Operation timed out', 'medium');
    expect(msg).toEqual({
      type: 'error',
      session_id: 's1',
      code: 'ERR_TIMEOUT',
      message: 'Operation timed out',
      severity: 'medium',
    });
  });

  it('buildStatusMessage should create a valid status message', () => {
    const msg = buildStatusMessage('s1', 'processing');
    expect(msg).toEqual({
      type: 'status',
      session_id: 's1',
      state: 'processing',
    });
  });

  it('buildEventMessage should create a valid event message', () => {
    const msg = buildEventMessage('s1', 'tool_completed', { tool: 'shell', duration: 1200 });
    expect(msg).toEqual({
      type: 'event',
      session_id: 's1',
      event: 'tool_completed',
      data: { tool: 'shell', duration: 1200 },
    });
  });
});

// ---------------------------------------------------------------------------
// serializeMessage
// ---------------------------------------------------------------------------

describe('serializeMessage', () => {
  it('should serialize an outbound message to JSON string', () => {
    const msg = buildStatusMessage('s1', 'idle');
    const serialized = serializeMessage(msg);
    const parsed = JSON.parse(serialized);
    expect(parsed).toEqual({ type: 'status', session_id: 's1', state: 'idle' });
  });
});

// ---------------------------------------------------------------------------
// MessageRouter
// ---------------------------------------------------------------------------

describe('MessageRouter', () => {
  it('should route message to registered handler', () => {
    const router = new MessageRouter();
    const handler = vi.fn().mockReturnValue([]);
    router.register('message', handler as Parameters<typeof router.register>[1]);

    const client = createMockClient();
    const outbound = router.route(
      { type: 'message', session_id: 's1', content: 'hello' },
      client,
    );

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(
      { type: 'message', session_id: 's1', content: 'hello' },
      client,
    );
    expect(outbound).toEqual([]);
  });

  it('should return handler result as outbound array', () => {
    const router = new MessageRouter();
    const response = buildStatusMessage('s1', 'received');
    router.register('message', () => response);

    const outbound = router.route(
      { type: 'message', session_id: 's1', content: 'hello' },
      createMockClient(),
    );

    expect(outbound).toEqual([response]);
  });

  it('should return empty array when handler returns void', () => {
    const router = new MessageRouter();
    router.register('command', (_msg) => {
      // void return
    });

    const outbound = router.route(
      { type: 'command', command: 'status' },
      createMockClient(),
    );

    expect(outbound).toEqual([]);
  });

  it('should return empty array for unregistered message type', () => {
    const router = new MessageRouter();
    // No handlers registered

    const outbound = router.route(
      { type: 'message', session_id: 's1', content: 'hello' },
      createMockClient(),
    );

    expect(outbound).toEqual([]);
  });

  it('should support multiple handlers for different types', () => {
    const router = new MessageRouter();
    const messageHandler = vi.fn().mockReturnValue([]);
    const commandHandler = vi.fn().mockReturnValue([]);

    router.register('message', messageHandler as Parameters<typeof router.register>[1]);
    router.register('command', commandHandler as Parameters<typeof router.register>[1]);

    const client = createMockClient();

    router.route({ type: 'message', session_id: 's1', content: 'hi' }, client);
    router.route({ type: 'command', command: 'stop' }, client);

    expect(messageHandler).toHaveBeenCalledTimes(1);
    expect(commandHandler).toHaveBeenCalledTimes(1);
  });

  it('hasHandler should return true for registered types', () => {
    const router = new MessageRouter();
    router.register('message', () => []);

    expect(router.hasHandler('message')).toBe(true);
    expect(router.hasHandler('command')).toBe(false);
  });

  it('should return multiple outbound messages from handler', () => {
    const router = new MessageRouter();
    router.register('message', (msg) => {
      const clientMsg = msg as ClientMessage;
      return [
        buildStatusMessage(clientMsg.session_id, 'received'),
        buildEventMessage(clientMsg.session_id, 'user_message', { content: clientMsg.content }),
      ];
    });

    const outbound = router.route(
      { type: 'message', session_id: 's1', content: 'hello' } as ClientMessage,
      createMockClient(),
    );

    expect(outbound).toHaveLength(2);
    expect(outbound[0]!.type).toBe('status');
    expect(outbound[1]!.type).toBe('event');
  });
});

// ---------------------------------------------------------------------------
// Streaming Support
// ---------------------------------------------------------------------------

describe('Streaming support', () => {
  it('should build tool_stream messages for streaming chunks', () => {
    const chunks = [
      buildToolStreamMessage('s1', 'shell', 'execute', { output: 'line1\n' }, 33),
      buildToolStreamMessage('s1', 'shell', 'execute', { output: 'line2\n' }, 66),
      buildToolStreamMessage('s1', 'shell', 'execute', { output: 'line3', final: true }, 100),
    ];

    for (const chunk of chunks) {
      expect(chunk.type).toBe('tool_stream');
      expect(chunk.session_id).toBe('s1');
      const serialized = serializeMessage(chunk);
      const parsed = JSON.parse(serialized);
      expect(parsed.type).toBe('tool_stream');
    }
  });

  it('should build block messages for different block types', () => {
    const blockTypes = ['text', 'code', 'image', 'card', 'table'] as const;

    for (const blockType of blockTypes) {
      const msg = buildBlockMessage('s1', blockType, 'content');
      expect(msg.block_type).toBe(blockType);
    }
  });
});

// ---------------------------------------------------------------------------
// Permission request/response handling
// ---------------------------------------------------------------------------

describe('Permission request/response handling', () => {
  it('should build permission request with all risk levels', () => {
    const riskLevels = ['low', 'medium', 'high'] as const;

    for (const riskLevel of riskLevels) {
      const msg = buildPermissionRequest('r1', 's1', 'fs', 'write', { path: '/tmp' }, riskLevel);
      expect(msg.risk_level).toBe(riskLevel);
    }
  });

  it('should parse permission_response correctly', () => {
    const approved = parseMessage(
      JSON.stringify({ type: 'permission_response', request_id: 'r1', decision: 'approved' }),
    );
    expect(approved.success).toBe(true);
    if (approved.success) {
      expect(approved.message.type).toBe('permission_response');
      expect((approved.message as { decision: string }).decision).toBe('approved');
    }

    const denied = parseMessage(
      JSON.stringify({ type: 'permission_response', request_id: 'r2', decision: 'denied' }),
    );
    expect(denied.success).toBe(true);
    if (denied.success) {
      expect((denied.message as { decision: string }).decision).toBe('denied');
    }
  });
});
