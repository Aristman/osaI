/**
 * WebSocket test utilities for Gateway testing.
 *
 * Provides a factory to create mock WS server/client pairs
 * with helpers for common testing patterns (send, wait, close).
 */
import { WebSocketServer, WebSocket } from "ws";
import type { Server } from "node:http";
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
export declare function createWsPair(): Promise<MockWsPair>;
/**
 * Wait for the next message on a WebSocket.
 *
 * @param ws - WebSocket to listen on
 * @param timeoutMs - Maximum wait time in milliseconds (default: 5000)
 * @returns Parsed JSON message or raw string
 */
export declare function waitForMessage(ws: WebSocket, timeoutMs?: number): Promise<string>;
/**
 * Send a JSON message over a WebSocket.
 *
 * @param ws - WebSocket to send on
 * @param data - Object to serialize and send
 */
export declare function sendJson(ws: WebSocket, data: Record<string, unknown>): void;
/**
 * Create a mock osaI protocol message.
 *
 * @param type - Message type (e.g., "chat:message", "chat:switch")
 * @param payload - Message payload
 * @returns Full osaI protocol message object
 */
export declare function createProtocolMessage(type: string, payload?: Record<string, unknown>): Record<string, unknown>;
//# sourceMappingURL=mock-ws.d.ts.map