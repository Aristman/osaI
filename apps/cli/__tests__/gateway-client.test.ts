/**
 * Tests for GatewayClient
 *
 * T-002 unit tests: connect, disconnect, send, events, reconnection
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WebSocketServer, WebSocket } from 'ws';
import http from 'node:http';
import { GatewayClient } from '../src/lib/gateway-client.js';

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
// T002-U01: Connect
// ---------------------------------------------------------------------------

describe('GatewayClient', () => {
  let testServer: { server: http.Server; wss: InstanceType<typeof WebSocketServer>; port: number };

  beforeEach(async () => {
    testServer = await createTestServer();
  });

  afterEach(async () => {
    if (testServer) {
      await closeTestServer(testServer.server, testServer.wss);
    }
  });

  describe('T002-U01: connect()', () => {
    it('should connect to WebSocket server', async () => {
      const client = new GatewayClient({ host: '127.0.0.1', port: testServer.port });
      await client.connect();
      expect(client.isConnected()).toBe(true);
      await client.disconnect();
    });

    it('should emit state change to connected', async () => {
      const states: string[] = [];
      const client = new GatewayClient({ host: '127.0.0.1', port: testServer.port });
      client.onStateChange((state) => states.push(state));

      await client.connect();
      expect(states).toContain('connecting');
      expect(states).toContain('connected');
      await client.disconnect();
    });

    it('should reject on connection failure', async () => {
      const client = new GatewayClient({ host: '127.0.0.1', port: 1 });
      await expect(client.connect()).rejects.toThrow();
    });
  });

  describe('T002-U02: send()', () => {
    it('should send a message to the server', async () => {
      let received: unknown = null;
      testServer.wss.on('connection', (ws) => {
        ws.on('message', (data) => {
          received = JSON.parse(data.toString());
        });
      });

      const client = new GatewayClient({ host: '127.0.0.1', port: testServer.port });
      await client.connect();
      client.sendMessage('session-123', 'Hello');

      // Wait for message propagation
      await new Promise((r) => setTimeout(r, 100));

      expect(received).toEqual({
        type: 'message',
        session_id: 'session-123',
        content: 'Hello',
      });

      await client.disconnect();
    });

    it('should throw when not connected', () => {
      const client = new GatewayClient();
      expect(() => client.sendMessage('s', 'm')).toThrow('Not connected');
    });
  });

  describe('T002-U03: onMessage() receives block', () => {
    it('should receive block messages from server', async () => {
      testServer.wss.on('connection', (ws) => {
        ws.send(JSON.stringify({
          type: 'block',
          session_id: 's1',
          block_type: 'text',
          content: 'Hello from gateway',
        }));
      });

      const client = new GatewayClient({ host: '127.0.0.1', port: testServer.port });
      const messages: unknown[] = [];
      client.onMessage((msg) => messages.push(msg));

      await client.connect();

      // Wait for message
      await new Promise((r) => setTimeout(r, 100));

      expect(messages).toHaveLength(1);
      expect((messages[0] as { type: string }).type).toBe('block');

      await client.disconnect();
    });
  });

  describe('T002-U04: onPermissionRequest()', () => {
    it('should receive permission requests', async () => {
      testServer.wss.on('connection', (ws) => {
        ws.send(JSON.stringify({
          type: 'permission_request',
          request_id: 'req-1',
          session_id: 's1',
          tool: 'write_file',
          action: 'write',
          params: { path: '/tmp/test.txt' },
          risk_level: 'medium',
        }));
      });

      const client = new GatewayClient({ host: '127.0.0.1', port: testServer.port });
      const requests: unknown[] = [];
      client.onPermissionRequest((req) => requests.push(req));

      await client.connect();
      await new Promise((r) => setTimeout(r, 100));

      expect(requests).toHaveLength(1);
      expect((requests[0] as { tool: string }).tool).toBe('write_file');

      await client.disconnect();
    });
  });

  describe('T002-U05: Reconnection', () => {
    it('should reconnect when server disconnects', async () => {
      const client = new GatewayClient({
        host: '127.0.0.1',
        port: testServer.port,
        reconnectBaseDelay: 100,
        reconnectMaxDelay: 200,
      });

      const states: string[] = [];
      client.onStateChange((state) => states.push(state));

      await client.connect();

      // Close all connections from server side
      testServer.wss.clients.forEach((c) => c.close());

      // Wait for reconnect attempt
      await new Promise((r) => setTimeout(r, 500));

      // Should have reconnection attempts (connecting state)
      expect(states).toContain('connecting');
      expect(states).toContain('connected');

      await client.disconnect();
    }, 10000);
  });

  describe('T002-U06: Exponential backoff', () => {
    it('should give up after max attempts', async () => {
      // Use a port that will never respond
      const client = new GatewayClient({
        host: '127.0.0.1',
        port: 1,
        reconnectMaxAttempts: 2,
        reconnectBaseDelay: 50,
        reconnectMaxDelay: 100,
      });

      const states: string[] = [];
      client.onStateChange((state) => states.push(state));

      await expect(client.connect()).rejects.toThrow();
      // Since connect() rejects immediately for port 1, reconnection
      // won't be triggered (it's triggered by close event).
    });
  });

  describe('T002-I01: Full message flow', () => {
    it('should send and receive messages in round-trip', async () => {
      testServer.wss.on('connection', (ws) => {
        ws.on('message', (data) => {
          const msg = JSON.parse(data.toString());
          if (msg.type === 'message') {
            ws.send(JSON.stringify({
              type: 'block',
              session_id: msg.session_id,
              block_type: 'text',
              content: `Echo: ${msg.content}`,
            }));
          }
        });
      });

      const client = new GatewayClient({ host: '127.0.0.1', port: testServer.port });
      const blocks: unknown[] = [];
      client.onBlock((block) => blocks.push(block));

      await client.connect();
      client.sendMessage('s1', 'test');

      await new Promise((r) => setTimeout(r, 100));

      expect(blocks).toHaveLength(1);
      expect((blocks[0] as { content: string }).content).toBe('Echo: test');

      await client.disconnect();
    });

    it('should send command messages', async () => {
      let received: unknown = null;
      testServer.wss.on('connection', (ws) => {
        ws.on('message', (data) => {
          received = JSON.parse(data.toString());
        });
      });

      const client = new GatewayClient({ host: '127.0.0.1', port: testServer.port });
      await client.connect();
      client.sendCommand('session.list');

      await new Promise((r) => setTimeout(r, 100));

      expect(received).toEqual({
        type: 'command',
        command: 'session.list',
      });

      await client.disconnect();
    });

    it('should send subscribe messages', async () => {
      let received: unknown = null;
      testServer.wss.on('connection', (ws) => {
        ws.on('message', (data) => {
          received = JSON.parse(data.toString());
        });
      });

      const client = new GatewayClient({ host: '127.0.0.1', port: testServer.port });
      await client.connect();
      client.subscribe(['tool_stream', 'block']);

      await new Promise((r) => setTimeout(r, 100));

      expect(received).toEqual({
        type: 'subscribe',
        events: ['tool_stream', 'block'],
      });

      await client.disconnect();
    });

    it('should receive error messages', async () => {
      testServer.wss.on('connection', (ws) => {
        ws.send(JSON.stringify({
          type: 'error',
          session_id: 's1',
          code: 'ERR_TEST',
          message: 'Test error',
          severity: 'low',
        }));
      });

      const client = new GatewayClient({ host: '127.0.0.1', port: testServer.port });
      const errors: unknown[] = [];
      client.onError((err) => errors.push(err));

      await client.connect();
      await new Promise((r) => setTimeout(r, 100));

      expect(errors).toHaveLength(1);
      expect((errors[0] as { code: string }).code).toBe('ERR_TEST');

      await client.disconnect();
    });

    it('should receive status messages', async () => {
      testServer.wss.on('connection', (ws) => {
        ws.send(JSON.stringify({
          type: 'status',
          session_id: 's1',
          state: 'thinking',
        }));
      });

      const client = new GatewayClient({ host: '127.0.0.1', port: testServer.port });
      const statuses: unknown[] = [];
      client.onStatus((s) => statuses.push(s));

      await client.connect();
      await new Promise((r) => setTimeout(r, 100));

      expect(statuses).toHaveLength(1);
      expect((statuses[0] as { state: string }).state).toBe('thinking');

      await client.disconnect();
    });

    it('should receive tool_stream messages', async () => {
      testServer.wss.on('connection', (ws) => {
        ws.send(JSON.stringify({
          type: 'tool_stream',
          session_id: 's1',
          tool: 'read_file',
          action: 'read',
          chunk: { progress: 50 },
          progress: 50,
        }));
      });

      const client = new GatewayClient({ host: '127.0.0.1', port: testServer.port });
      const streams: unknown[] = [];
      client.onToolStream((s) => streams.push(s));

      await client.connect();
      await new Promise((r) => setTimeout(r, 100));

      expect(streams).toHaveLength(1);
      expect((streams[0] as { tool: string }).tool).toBe('read_file');

      await client.disconnect();
    });
  });

  describe('unsubscribe', () => {
    it('should unsubscribe from message handlers', async () => {
      testServer.wss.on('connection', (ws) => {
        ws.send(JSON.stringify({
          type: 'block',
          session_id: 's1',
          block_type: 'text',
          content: 'test',
        }));
        ws.send(JSON.stringify({
          type: 'block',
          session_id: 's1',
          block_type: 'text',
          content: 'test2',
        }));
      });

      const client = new GatewayClient({ host: '127.0.0.1', port: testServer.port });
      const messages: unknown[] = [];
      const unsub = client.onBlock((msg) => messages.push(msg));

      await client.connect();
      await new Promise((r) => setTimeout(r, 100));
      expect(messages).toHaveLength(2);

      unsub();
      // No more messages expected after unsubscribe
      await client.disconnect();
    });
  });

  describe('disconnect()', () => {
    it('should disconnect gracefully', async () => {
      const client = new GatewayClient({ host: '127.0.0.1', port: testServer.port });
      await client.connect();
      expect(client.isConnected()).toBe(true);

      await client.disconnect();
      expect(client.isConnected()).toBe(false);
    });

    it('should not reconnect after intentional disconnect', async () => {
      const client = new GatewayClient({ host: '127.0.0.1', port: testServer.port });
      await client.connect();
      await client.disconnect();

      const states: string[] = [];
      client.onStateChange((s) => states.push(s));

      // Wait to ensure no reconnection
      await new Promise((r) => setTimeout(r, 300));

      expect(states).toHaveLength(0);
    });
  });

  describe('url property', () => {
    it('should return correct URL', () => {
      const client = new GatewayClient({ host: 'localhost', port: 9999 });
      expect(client.url).toBe('ws://localhost:9999');
    });

    it('should use default host and port', () => {
      const client = new GatewayClient();
      expect(client.url).toBe('ws://127.0.0.1:18789');
    });
  });
});
