import { describe, it, expect, expectTypeOf } from 'vitest';
import type {
  ClientMessage,
  ClientCommand,
  ClientSubscribe,
  PermissionResponse,
  ToolStreamMessage,
  BlockStreamMessage,
  PermissionRequest,
  ErrorResponse,
  StatusMessage,
  EventMessage,
  WsInboundMessage,
  WsOutboundMessage,
} from '../src/ws.js';

describe('WS Message Types -- Inbound (client -> gateway)', () => {
  it('T002-01: All 4 inbound types are defined and exported', () => {
    expectTypeOf<ClientMessage>().not.toBeAny();
    expectTypeOf<ClientCommand>().not.toBeAny();
    expectTypeOf<PermissionResponse>().not.toBeAny();
    expectTypeOf<ClientSubscribe>().not.toBeAny();
  });

  it('ClientMessage has type, session_id, content; optional channel', () => {
    const msg: ClientMessage = {
      type: 'message',
      session_id: 's1',
      content: 'hello',
    };
    expect(msg.type).toBe('message');
    expect(msg.session_id).toBe('s1');
    expect(msg.content).toBe('hello');

    const msgWithChannel: ClientMessage = {
      type: 'message',
      session_id: 's2',
      content: 'hello',
      channel: 'general',
    };
    expect(msgWithChannel.channel).toBe('general');
  });

  it('ClientCommand has type, command; optional params', () => {
    const cmd: ClientCommand = {
      type: 'command',
      command: 'reset',
    };
    expect(cmd.type).toBe('command');
    expect(cmd.command).toBe('reset');

    const cmdWithParams: ClientCommand = {
      type: 'command',
      command: 'configure',
      params: { key: 'value' },
    };
    expect(cmdWithParams.params).toEqual({ key: 'value' });
  });

  it('PermissionResponse has decision: "approved" | "denied"', () => {
    const approved: PermissionResponse = {
      type: 'permission_response',
      request_id: 'r1',
      decision: 'approved',
    };
    expect(approved.decision).toBe('approved');

    const denied: PermissionResponse = {
      type: 'permission_response',
      request_id: 'r2',
      decision: 'denied',
    };
    expect(denied.decision).toBe('denied');

    // Compile-time: decision must be string literal, not boolean
    expectTypeOf<PermissionResponse['decision']>().toEqualTypeOf<'approved' | 'denied'>();
  });

  it('ClientSubscribe has type and events array', () => {
    const sub: ClientSubscribe = {
      type: 'subscribe',
      events: ['tool_stream', 'status'],
    };
    expect(sub.events).toEqual(['tool_stream', 'status']);
  });
});

describe('WS Message Types -- Outbound (gateway -> client)', () => {
  it('All 6 outbound types are defined and exported', () => {
    expectTypeOf<ToolStreamMessage>().not.toBeAny();
    expectTypeOf<BlockStreamMessage>().not.toBeAny();
    expectTypeOf<PermissionRequest>().not.toBeAny();
    expectTypeOf<ErrorResponse>().not.toBeAny();
    expectTypeOf<StatusMessage>().not.toBeAny();
    expectTypeOf<EventMessage>().not.toBeAny();
  });

  it('ToolStreamMessage has session_id, tool, action, chunk; optional progress', () => {
    const stream: ToolStreamMessage = {
      type: 'tool_stream',
      session_id: 's1',
      tool: 'filesystem',
      action: 'read',
      chunk: { data: 'file contents' },
    };
    expect(stream.session_id).toBe('s1');
    expect(stream.tool).toBe('filesystem');
    expect(stream.action).toBe('read');
    expect(stream.chunk).toEqual({ data: 'file contents' });

    // Compile-time: chunk is Record<string, unknown>, not string
    expectTypeOf<ToolStreamMessage['chunk']>().toEqualTypeOf<Record<string, unknown>>();
  });

  it('BlockStreamMessage has session_id and all block_type values', () => {
    const textBlock: BlockStreamMessage = {
      type: 'block',
      session_id: 's1',
      block_type: 'text',
      content: 'hello',
    };
    expect(textBlock.session_id).toBe('s1');
    expect(textBlock.block_type).toBe('text');

    const codeBlock: BlockStreamMessage = {
      type: 'block',
      session_id: 's1',
      block_type: 'code',
      content: 'console.log("hi")',
      language: 'typescript',
    };
    expect(codeBlock.language).toBe('typescript');
  });

  it('PermissionRequest has session_id and risk_level from allowed values', () => {
    const req: PermissionRequest = {
      type: 'permission_request',
      request_id: 'r1',
      session_id: 's1',
      tool: 'filesystem',
      action: 'read',
      params: { path: '/tmp' },
      risk_level: 'low',
    };
    expect(req.session_id).toBe('s1');
    expect(req.risk_level).toBe('low');
  });

  it('ErrorResponse has session_id, code, message, severity', () => {
    const err: ErrorResponse = {
      type: 'error',
      session_id: 's1',
      code: 'E001',
      message: 'Something went wrong',
      severity: 'high',
    };
    expect(err.session_id).toBe('s1');
    expect(err.code).toBe('E001');
    expect(err.severity).toBe('high');
  });

  it('StatusMessage has session_id and state', () => {
    const status: StatusMessage = {
      type: 'status',
      session_id: 's1',
      state: 'processing',
    };
    expect(status.session_id).toBe('s1');
    expect(status.state).toBe('processing');
  });

  it('EventMessage has session_id, event, and data', () => {
    const evt: EventMessage = {
      type: 'event',
      session_id: 's1',
      event: 'tool_completed',
      data: { tool: 'filesystem', duration: 123 },
    };
    expect(evt.session_id).toBe('s1');
    expect(evt.event).toBe('tool_completed');
    expect(evt.data).toEqual({ tool: 'filesystem', duration: 123 });
  });
});

describe('WS Message Union Types', () => {
  it('WsInboundMessage includes all 4 inbound message types', () => {
    const asMessage: WsInboundMessage = {
      type: 'message',
      session_id: 's1',
      content: 'hello',
    };
    expect(asMessage.type).toBe('message');

    const asCommand: WsInboundMessage = {
      type: 'command',
      command: 'reset',
    };
    expect(asCommand.type).toBe('command');

    const asPermRes: WsInboundMessage = {
      type: 'permission_response',
      request_id: 'r1',
      decision: 'denied',
    };
    expect(asPermRes.type).toBe('permission_response');

    const asSubscribe: WsInboundMessage = {
      type: 'subscribe',
      events: ['status'],
    };
    expect(asSubscribe.type).toBe('subscribe');
  });

  it('WsOutboundMessage includes all 6 outbound message types', () => {
    const asTool: WsOutboundMessage = {
      type: 'tool_stream',
      session_id: 's1',
      tool: 'fs',
      action: 'read',
      chunk: { data: 'text' },
    };
    expect(asTool.type).toBe('tool_stream');

    const asBlock: WsOutboundMessage = {
      type: 'block',
      session_id: 's1',
      block_type: 'text',
      content: 'hello',
    };
    expect(asBlock.type).toBe('block');

    const asPermReq: WsOutboundMessage = {
      type: 'permission_request',
      request_id: 'r1',
      session_id: 's1',
      tool: 'shell',
      action: 'execute',
      params: {},
      risk_level: 'low',
    };
    expect(asPermReq.type).toBe('permission_request');

    const asError: WsOutboundMessage = {
      type: 'error',
      session_id: 's1',
      code: 'E001',
      message: 'fail',
      severity: 'medium',
    };
    expect(asError.type).toBe('error');

    const asStatus: WsOutboundMessage = {
      type: 'status',
      session_id: 's1',
      state: 'idle',
    };
    expect(asStatus.type).toBe('status');

    const asEvent: WsOutboundMessage = {
      type: 'event',
      session_id: 's1',
      event: 'done',
      data: {},
    };
    expect(asEvent.type).toBe('event');
  });

  it('DEF-002: All outbound messages contain session_id', () => {
    // Compile-time: verify session_id exists on each outbound type
    expectTypeOf<ToolStreamMessage>().toHaveProperty('session_id');
    expectTypeOf<BlockStreamMessage>().toHaveProperty('session_id');
    expectTypeOf<PermissionRequest>().toHaveProperty('session_id');
    expectTypeOf<ErrorResponse>().toHaveProperty('session_id');
    expectTypeOf<StatusMessage>().toHaveProperty('session_id');
    expectTypeOf<EventMessage>().toHaveProperty('session_id');
  });
});
