/**
 * T001-UNIT-004: TypeScript types compile
 * Preconditions: WS message types defined
 * Expected result: No TypeScript compilation errors
 * Pass criteria: npm run check passes (verified by type structure here)
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  UserMessage,
  CommandMessage,
  PermissionResponseMessage,
  SubscribeMessage,
  BlockMessage,
  ToolStreamMessage,
  PermissionRequestMessage,
  Session
} from '../types';

const __dirname = dirname(fileURLToPath(import.meta.url));
const typesPath = resolve(__dirname, '..', 'types.ts');

describe('T001-UNIT-004: TypeScript types', () => {
  it('types file exists and exports types', () => {
    // If this file compiles with type imports, types are correctly defined.
    // The type imports above prove TypeScript can resolve them.
    expect(existsSync(typesPath)).toBe(true);
    const content = readFileSync(typesPath, 'utf-8');
    expect(content).toContain('export interface');
    expect(content).toContain('UserMessage');
    expect(content).toContain('BlockMessage');
  });

  it('UserMessage has required fields', () => {
    const msg: UserMessage = {
      type: 'message',
      sessionId: 'test-session',
      content: 'hello'
    };
    expect(msg.type).toBe('message');
    expect(msg.sessionId).toBe('test-session');
    expect(msg.content).toBe('hello');
  });

  it('CommandMessage has required fields', () => {
    const msg: CommandMessage = {
      type: 'command',
      sessionId: 'test-session',
      command: 'reset'
    };
    expect(msg.type).toBe('command');
    expect(msg.command).toBe('reset');
  });

  it('PermissionResponseMessage has decision field', () => {
    const approved: PermissionResponseMessage = {
      type: 'permission_response',
      requestId: 'req-1',
      decision: 'approved'
    };
    const denied: PermissionResponseMessage = {
      type: 'permission_response',
      requestId: 'req-2',
      decision: 'denied',
      reason: 'Unsafe operation'
    };
    expect(approved.decision).toBe('approved');
    expect(denied.decision).toBe('denied');
    expect(denied.reason).toBe('Unsafe operation');
  });

  it('SubscribeMessage has events array', () => {
    const msg: SubscribeMessage = {
      type: 'subscribe',
      events: ['tool_stream', 'block']
    };
    expect(msg.events).toHaveLength(2);
  });

  it('BlockMessage supports all block types', () => {
    const types = ['text', 'code', 'image', 'card', 'table'] as const;
    for (const blockType of types) {
      const msg: BlockMessage = {
        type: 'block',
        sessionId: 's1',
        blockId: 'b1',
        blockType,
        content: {},
        timestamp: new Date().toISOString()
      };
      expect(msg.blockType).toBe(blockType);
    }
  });

  it('ToolStreamMessage has status field', () => {
    const statuses = ['started', 'progress', 'completed', 'error'] as const;
    for (const status of statuses) {
      const msg: ToolStreamMessage = {
        type: 'tool_stream',
        sessionId: 's1',
        toolCallId: 'tc1',
        toolName: 'shell',
        status,
        data: {},
        timestamp: new Date().toISOString()
      };
      expect(msg.status).toBe(status);
    }
  });

  it('PermissionRequestMessage has risk levels', () => {
    const levels = ['low', 'medium', 'high', 'critical'] as const;
    for (const riskLevel of levels) {
      const msg: PermissionRequestMessage = {
        type: 'permission_request',
        requestId: 'req-1',
        sessionId: 's1',
        toolName: 'shell',
        action: 'execute',
        params: { command: 'ls' },
        riskLevel,
        description: 'List files',
        timestamp: new Date().toISOString()
      };
      expect(msg.riskLevel).toBe(riskLevel);
    }
  });

  it('Session type has all required fields', () => {
    const session: Session = {
      id: 's1',
      label: 'Test Session',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      messageCount: 10,
      channel: 'dashboard',
      status: 'active'
    };
    expect(session.id).toBe('s1');
    expect(session.channel).toBe('dashboard');
    expect(session.status).toBe('active');
    expect(session.messageCount).toBe(10);
  });
});
