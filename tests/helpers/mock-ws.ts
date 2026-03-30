/**
 * WebSocket test utilities for Gateway testing.
 *
 * Provides a factory to create mock WS server/client pairs
 * with helpers for common testing patterns (send, wait, close).
 */
import { WebSocketServer, WebSocket } from "ws";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";

/**
 * A connected WS server + client pair for testing.
 */
export interface MockWsPair {
  /** The underlying HTTP server (must be closed by caller) */
  server: Server;
  /** The WebSocket server instance */
  wss: WebSocketServer;
  /** A connected client WebSocket */
  client: WebSocket;
  /** Server-side reference to the connected client */
  serverClient: WebSocket | undefined;
  /** Close all connections and the server */
  close: () => Promise<void>;
}

/**
 * Create a mock WebSocket server + connected client pair.
 *
 * The server listens on a random available port.
 * A single client connection is established automatically.
 *
 * @returns A connected WS pair with cleanup helper
 *
 * @example
 * ```ts
 * import { createWsPair } from "../../tests/helpers/mock-ws.js";
 *
 * let pair: MockWsPair;
 *
 * beforeEach(async () => {
 *   pair = await createWsPair();
 * });
 *
 * afterEach(async () => {
 *   await pair.close();
 * });
 *
 * it("receives messages", () => {
 *   pair.client.send("hello");
 *   // test server-side handling
 * });
 * ```
 */
export function createWsPair(): Promise<MockWsPair> {
  return new Promise((resolve, reject) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const http = require("node:http") as typeof import("node:http");

    const server = http.createServer();
    const wss = new WebSocketServer({ server });

    let serverClient: WebSocket | undefined;

    wss.on("connection", (ws) => {
      serverClient = ws;
    });

    server.listen(0, "127.0.0.1", () => {
      const address = server.address() as AddressInfo;
      const port = address.port;
      const client = new WebSocket(`ws://127.0.0.1:${port}`);

      client.on("open", () => {
        resolve({
          server,
          wss,
          client,
          serverClient,
          close: async () => {
            client.terminate();
            wss.clients.forEach((c) => c.terminate());
            wss.close();
            await new Promise<void>((res) => server.close(() => res()));
          },
        });
      });

      client.on("error", (err) => {
        reject(new Error(`Client connection error: ${err.message}`));
      });
    });
  });
}

/**
 * Wait for the next message on a WebSocket.
 *
 * @param ws - WebSocket to listen on
 * @param timeoutMs - Maximum wait time in milliseconds (default: 5000)
 * @returns Parsed JSON message or raw string
 */
export function waitForMessage(
  ws: WebSocket,
  timeoutMs = 5000,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      ws.removeEventListener("message", handler);
      reject(new Error(`waitForMessage timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    function handler(data: unknown) {
      clearTimeout(timer);
      ws.removeEventListener("message", handler);
      resolve(typeof data === "string" ? data : String(data));
    }

    ws.on("message", handler);
  });
}

/**
 * Send a JSON message over a WebSocket.
 *
 * @param ws - WebSocket to send on
 * @param data - Object to serialize and send
 */
export function sendJson(ws: WebSocket, data: Record<string, unknown>): void {
  ws.send(JSON.stringify(data));
}

/**
 * Create a mock osaI protocol message.
 *
 * @param type - Message type (e.g., "chat:message", "chat:switch")
 * @param payload - Message payload
 * @returns Full osaI protocol message object
 */
export function createProtocolMessage(
  type: string,
  payload: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    type,
    payload,
    timestamp: new Date().toISOString(),
    id: crypto.randomUUID(),
  };
}
