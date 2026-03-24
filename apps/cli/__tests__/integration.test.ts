/**
 * Integration tests for CLI
 *
 * T-007: full flow, permission flow, session lifecycle
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { WebSocketServer } from 'ws';
import http from 'node:http';
import { GatewayClient } from '../src/lib/gateway-client.js';
import { SessionManager } from '../src/lib/session-manager.js';
import { renderPermissionRequest } from '../src/lib/permission-prompt.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createTestServer(): Promise<{ server: http.Server; wss: InstanceType<typeof WebSocketServer>; port: number }> {
  return new Promise((resolve) => {
    const server = http.createServer();
    const wss = new WebSocketServer({ server });
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address() as { port: number };
      resolve({ server, wss, port: addr.port });
    });
  });
}

function closeTestServer(server: http.Server, wss: InstanceType<typeof WebSocketServer>): Promise<void> {
  return new Promise((resolve) => {
    wss.close();
    server.close(() => resolve());
  });
}

// ---------------------------------------------------------------------------
// T007-I01: Full chat session
// ---------------------------------------------------------------------------

describe('Integration: Full chat session', () => {
  let testServer: { server: http.Server; wss: InstanceType<typeof WebSocketServer>; port: number };

  beforeEach(async () => {
    testServer = await createTestServer();
  });

  afterEach(async () => {
    if (testServer) {
      await closeTestServer(testServer.server, testServer.wss);
    }
  });

  it('T007-I01: should complete full message flow', async () => {
    testServer.wss.on('connection', (ws) => {
      ws.on('message', (data) => {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'message') {
          // Send block response
          ws.send(JSON.stringify({
            type: 'block',
            session_id: msg.session_id,
            block_type: 'text',
            content: `Response to: ${msg.content}`,
          }));
          // Send status update
          ws.send(JSON.stringify({
            type: 'status',
            session_id: msg.session_id,
            state: 'idle',
          }));
        }
      });
    });

    const client = new GatewayClient({ host: '127.0.0.1', port: testServer.port });
    const manager = new SessionManager({ client });
    manager.startListening();

    const blocks: unknown[] = [];
    client.onBlock((b) => blocks.push(b));

    await client.connect();
    manager.addMessage('user', 'Hello world');
    client.sendMessage(manager.getActiveSessionId(), 'Hello world');

    await new Promise((r) => setTimeout(r, 200));

    expect(blocks).toHaveLength(1);
    expect(manager.getMessageHistory()).toHaveLength(2); // user + assistant

    manager.stopListening();
    await client.disconnect();
  });

  it('T007-I02: should handle permission request flow', async () => {
    let permissionDecision: string | null = null;

    testServer.wss.on('connection', (ws) => {
      // Send permission request
      ws.send(JSON.stringify({
        type: 'permission_request',
        request_id: 'pr-1',
        session_id: 's1',
        tool: 'write_file',
        action: 'write',
        params: { path: '/tmp/test.txt', content: 'hello' },
        risk_level: 'high',
      }));

      ws.on('message', (data) => {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'permission_response') {
          permissionDecision = msg.decision;
        }
      });
    });

    const client = new GatewayClient({ host: '127.0.0.1', port: testServer.port });

    let receivedRequest: unknown = null;
    client.onPermissionRequest((req) => {
      receivedRequest = req;
      // Auto-approve for test
      client.sendPermissionResponse(req.request_id, 'approved');
    });

    await client.connect();
    await new Promise((r) => setTimeout(r, 200));

    expect(receivedRequest).not.toBeNull();
    expect(permissionDecision).toBe('approved');

    await client.disconnect();
  });
});

// ---------------------------------------------------------------------------
// T007-I03: Reconnection test (separate describe for independent lifecycle)
// ---------------------------------------------------------------------------

describe('Integration: Reconnection', () => {
  it('T007-I03: should attempt reconnection on server disconnect', async () => {
    const srv = await createTestServer();
    const port = srv.port;

    const client = new GatewayClient({
      host: '127.0.0.1',
      port,
      reconnectBaseDelay: 50,
      reconnectMaxDelay: 100,
      reconnectMaxAttempts: 3,
    });

    const states: string[] = [];
    client.onStateChange((s) => states.push(s));

    await client.connect();
    expect(client.isConnected()).toBe(true);

    // Force-close all WS connections from server side
    srv.wss.clients.forEach((c) => c.terminate());

    // Wait for reconnect attempts
    await new Promise((r) => setTimeout(r, 1000));

    // Client should have transitioned through connecting states
    expect(states).toContain('disconnected');
    expect(states.filter((s) => s === 'connecting').length).toBeGreaterThanOrEqual(1);

    // After all attempts fail (server is gone), should end in error or keep trying
    // Clean up
    await client.disconnect();
    await closeTestServer(srv.server, srv.wss);
  }, 15000);
});

// ---------------------------------------------------------------------------
// T007-I04: Multiple sessions
// ---------------------------------------------------------------------------

describe('Integration: Multiple sessions', () => {
  it('should manage multiple sessions', () => {
    const mockClient = {
      onMessage: () => () => {},
      onBlock: () => () => {},
      connectionState: 'connected',
    } as unknown as GatewayClient;

    const manager = new SessionManager({ client: mockClient });
    const s1 = manager.createSession();
    const s2 = manager.createSession();

    expect(manager.getAllSessions()).toHaveLength(3); // default + 2 new

    expect(manager.switchSession(s1.sessionId)).toBe(true);
    expect(manager.getActiveSessionId()).toBe(s1.sessionId);

    manager.addMessage('user', 'msg to s1');
    manager.switchSession(s2.sessionId);
    manager.addMessage('user', 'msg to s2');

    // History should contain all messages
    expect(manager.getMessageHistory()).toHaveLength(2);
  });

  it('should not delete active session', () => {
    const mockClient = {
      onMessage: () => () => {},
      connectionState: 'connected',
    } as unknown as GatewayClient;

    const manager = new SessionManager({ client: mockClient });
    const activeId = manager.getActiveSessionId();

    expect(manager.deleteSession(activeId)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// T007-I05: Edge cases
// ---------------------------------------------------------------------------

describe('Integration: Edge cases', () => {
  it('T007-I05: Gateway down should result in error', async () => {
    const client = new GatewayClient({ host: '127.0.0.1', port: 1 });
    await expect(client.connect()).rejects.toThrow();
  });

  it('T007-I06: Invalid session ID should not switch', () => {
    const mockClient = {
      onMessage: () => () => {},
      connectionState: 'connected',
    } as unknown as GatewayClient;

    const manager = new SessionManager({ client: mockClient });
    expect(manager.switchSession('non-existent')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// renderPermissionRequest
// ---------------------------------------------------------------------------

describe('renderPermissionRequest', () => {
  it('should render low risk', () => {
    const output = renderPermissionRequest({
      type: 'permission_request',
      request_id: 'r1',
      session_id: 's1',
      tool: 'read_file',
      action: 'read',
      params: { path: '/tmp/a.txt' },
      risk_level: 'low',
    });
    expect(output).toContain('LOW');
    expect(output).toContain('read_file');
  });

  it('should render high risk', () => {
    const output = renderPermissionRequest({
      type: 'permission_request',
      request_id: 'r2',
      session_id: 's1',
      tool: 'execute',
      action: 'exec',
      params: { cmd: 'rm -rf /' },
      risk_level: 'high',
    });
    expect(output).toContain('HIGH');
    expect(output).toContain('execute');
  });

  it('should truncate long params', () => {
    const longParams: Record<string, unknown> = { data: 'x'.repeat(500) };
    const output = renderPermissionRequest({
      type: 'permission_request',
      request_id: 'r3',
      session_id: 's1',
      tool: 'write',
      action: 'write',
      params: longParams,
      risk_level: 'medium',
    });
    // The truncated output should be shorter
    const jsonLen = output.indexOf('...') + 3 - output.indexOf('{');
    expect(jsonLen).toBeLessThan(210);
  });
});

// ---------------------------------------------------------------------------
// SessionManager message history
// ---------------------------------------------------------------------------

describe('SessionManager', () => {
  it('should track message history', () => {
    const mockClient = {
      onMessage: () => () => {},
      connectionState: 'connected',
    } as unknown as GatewayClient;

    const manager = new SessionManager({ client: mockClient });
    manager.addMessage('user', 'hello');
    manager.addMessage('assistant', 'hi there');

    const history = manager.getMessageHistory();
    expect(history).toHaveLength(2);
    expect(history[0]?.role).toBe('user');
    expect(history[1]?.role).toBe('assistant');
  });

  it('should clear history', () => {
    const mockClient = {
      onMessage: () => () => {},
      connectionState: 'connected',
    } as unknown as GatewayClient;

    const manager = new SessionManager({ client: mockClient });
    manager.addMessage('user', 'hello');
    manager.clearHistory();
    expect(manager.getMessageHistory()).toHaveLength(0);
  });

  it('should start/stop listening without errors', () => {
    const mockClient = {
      onMessage: () => () => {},
      connectionState: 'connected',
    } as unknown as GatewayClient;

    const manager = new SessionManager({ client: mockClient });
    manager.startListening();
    manager.stopListening();
    // No errors expected
  });
});
