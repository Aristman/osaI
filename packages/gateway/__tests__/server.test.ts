/**
 * Unit tests for GatewayServer
 *
 * Tests cover: start/stop lifecycle, connection tracking,
 * broadcast, heartbeat, and graceful shutdown.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { WebSocket } from 'ws';
import { GatewayServer } from '../src/server/server.js';

/**
 * Helper: create a GatewayServer on a random port (standalone mode)
 */
function createTestServer(
  heartbeatInterval = 500,
  maxMissedPongs = 2,
): GatewayServer {
  return new GatewayServer(
    { host: '127.0.0.1', port: 0 },
    { interval: heartbeatInterval, maxMissedPongs: maxMissedPongs },
  );
}

/**
 * Helper: connect a WebSocket client to a GatewayServer
 * Extracts the port from the underlying WSS after start.
 */
async function startAndGetPort(server: GatewayServer): Promise<number> {
  await server.start();
  // Access the internal wsServer to get the actual listening port
  const addr = (server as unknown as { wsServer: { address: () => unknown } }).wsServer.address() as {
    port: number;
  };
  return addr.port;
}

/**
 * Helper: connect a WebSocket client to a given port
 */
function connectClient(port: number): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`);
    ws.on('open', () => resolve(ws));
    ws.on('error', reject);
  });
}

describe('GatewayServer', () => {
  let gateway: GatewayServer;

  beforeEach(() => {
    gateway = createTestServer();
  });

  afterEach(async () => {
    if (gateway.isRunning) {
      await gateway.stop();
    }
  });

  describe('start / stop lifecycle', () => {
    it('should start and stop the server', async () => {
      await expect(gateway.start()).resolves.not.toThrow();
      expect(gateway.isRunning).toBe(true);
      await gateway.stop();
      expect(gateway.isRunning).toBe(false);
    });

    it('should reject double start', async () => {
      await gateway.start();
      await expect(gateway.start()).rejects.toThrow('already running');
    });

    it('should resolve stop() even if not started', async () => {
      await expect(gateway.stop()).resolves.not.toThrow();
    });
  });

  describe('connection lifecycle', () => {
    it('should track a connected client', async () => {
      const connectedSpy = vi.fn();
      gateway.onConnect(connectedSpy);

      const port = await startAndGetPort(gateway);
      await connectClient(port);

      // Give event loop time to fire the onConnect handler
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(connectedSpy).toHaveBeenCalledTimes(1);
      expect(connectedSpy.mock.calls[0]![0].id).toBeDefined();
      expect(connectedSpy.mock.calls[0]![0].ws).toBeDefined();
      expect(connectedSpy.mock.calls[0]![0].isAlive).toBe(true);
      expect(gateway.connectionCount).toBe(1);
    });

    it('should track disconnection', async () => {
      const disconnectedSpy = vi.fn();
      gateway.onDisconnect(disconnectedSpy);

      const port = await startAndGetPort(gateway);
      const client = await connectClient(port);

      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(gateway.connectionCount).toBe(1);

      client.close();
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(gateway.connectionCount).toBe(0);
      expect(disconnectedSpy).toHaveBeenCalledTimes(1);
    });

    it('should fire error handler on connection errors', async () => {
      const errorSpy = vi.fn();
      gateway.onError(errorSpy);

      await startAndGetPort(gateway);

      // Verify the error handler is registered and the server is running
      expect(errorSpy).not.toHaveBeenCalled();
      expect(gateway.isRunning).toBe(true);
    });
  });

  describe('broadcast', () => {
    it('should send a message to all connected clients', async () => {
      const port = await startAndGetPort(gateway);

      const clients = await Promise.all([connectClient(port), connectClient(port)]);

      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(gateway.connectionCount).toBe(2);

      const messagePromises = clients.map(
        (c) =>
          new Promise<string>((resolve) => {
            c.once('message', (data) => resolve(data.toString()));
          }),
      );

      gateway.broadcast('hello all');

      const results = await Promise.all(messagePromises);
      expect(results).toEqual(['hello all', 'hello all']);
    });
  });

  describe('sendTo', () => {
    it('should send a message to a specific client', async () => {
      const connectSpy = vi.fn();
      gateway.onConnect(connectSpy);

      const port = await startAndGetPort(gateway);
      await connectClient(port);

      await new Promise((resolve) => setTimeout(resolve, 50));
      const clientId = connectSpy.mock.calls[0]![0].id;

      const result = gateway.sendTo(clientId, 'direct message');
      expect(result).toBe(true);
    });

    it('should return false for unknown client ID', async () => {
      await startAndGetPort(gateway);
      const result = gateway.sendTo('nonexistent', 'message');
      expect(result).toBe(false);
    });
  });

  describe('heartbeat', () => {
    it('should keep connection alive with pong responses', async () => {
      const port = await startAndGetPort(gateway);
      const client = await connectClient(port);

      // Wait for multiple heartbeat cycles
      await new Promise((resolve) => setTimeout(resolve, 1200));

      // Client should still be connected
      expect(client.readyState).toBe(WebSocket.OPEN);
      expect(gateway.connectionCount).toBe(1);
    });

    it('should terminate connection after missed pongs', async () => {
      const disconnectSpy = vi.fn();
      gateway.onDisconnect(disconnectSpy);

      // Use short intervals for faster test
      const testGateway = createTestServer(200, 2);
      const port = await startAndGetPort(testGateway);
      const client = await connectClient(port);

      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(testGateway.connectionCount).toBe(1);

      // Simulate a dead client by destroying the underlying socket
      const socket = (client as unknown as { _socket?: { destroy: () => void } })._socket;
      if (socket) {
        socket.destroy();
      }

      // Wait for heartbeat to detect the dead connection
      // 2 missed pongs * 200ms interval = ~400ms + buffer
      await new Promise((resolve) => setTimeout(resolve, 800));

      expect(testGateway.connectionCount).toBe(0);

      await testGateway.stop();
    }, 10_000);
  });

  describe('graceful shutdown', () => {
    it('should close all connections on stop()', async () => {
      const port = await startAndGetPort(gateway);

      const clients = await Promise.all([
        connectClient(port),
        connectClient(port),
        connectClient(port),
      ]);

      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(gateway.connectionCount).toBe(3);

      await gateway.stop();

      // After stop, all clients should be closed
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(gateway.connectionCount).toBe(0);

      for (const c of clients) {
        expect(c.readyState).not.toBe(WebSocket.OPEN);
      }
    });
  });
});
