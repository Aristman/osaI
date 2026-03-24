/**
 * Test WebSocket client helper for integration tests.
 *
 * Provides a convenient wrapper around the 'ws' WebSocket for testing
 * message flows: connect, send, receive, disconnect.
 *
 * Uses an internal message buffer so that incoming messages are never lost
 * even when the server sends multiple responses before the test awaits them.
 */

import { WebSocket } from 'ws';

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

export interface WsTestClientOptions {
  /** Server host (default: '127.0.0.1') */
  host?: string;
  /** Server port (required) */
  port: number;
  /** Timeout for connection and messages in ms (default: 2000) */
  timeout?: number;
}

// ---------------------------------------------------------------------------
// WsTestClient
// ---------------------------------------------------------------------------

/**
 * A thin wrapper around ws.WebSocket for test scenarios.
 *
 * Incoming messages are buffered internally, so they are never lost even
 * when the server sends multiple messages before the consumer awaits them.
 *
 * Usage:
 * ```ts
 * const client = await WsTestClient.connect({ port: 18789 });
 * const response = await client.sendAndWait({ type: 'message', ... });
 * await client.close();
 * ```
 */
export class WsTestClient {
  private ws: WebSocket;
  private readonly timeout: number;

  /** Buffer for incoming messages that have not yet been consumed */
  private messageBuffer: string[] = [];

  /** Pending consumers waiting for the next message from the buffer */
  private pendingConsumers: Array<{
    resolve: (value: string) => void;
    reject: (reason: unknown) => void;
    timer: ReturnType<typeof setTimeout>;
  }> = [];

  private constructor(ws: WebSocket, timeout: number) {
    this.ws = ws;
    this.timeout = timeout;
    ws.on('message', (data: Buffer | string) => {
      const text = typeof data === 'string' ? data : data.toString('utf-8');
      const pending = this.pendingConsumers.shift();
      if (pending) {
        clearTimeout(pending.timer);
        pending.resolve(text);
      } else {
        // No consumer yet -- buffer the message
        this.messageBuffer.push(text);
      }
    });
  }

  /**
   * Connect to the WS server and return a ready-to-use WsTestClient.
   */
  static connect(options: WsTestClientOptions): Promise<WsTestClient> {
    const { host = '127.0.0.1', port, timeout = 2000 } = options;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        ws.terminate();
        reject(new Error(`WsTestClient: connection timed out after ${timeout}ms`));
      }, timeout);

      const ws = new WebSocket(`ws://${host}:${port}`);

      ws.on('open', () => {
        clearTimeout(timer);
        resolve(new WsTestClient(ws, timeout));
      });

      ws.on('error', (err) => {
        clearTimeout(timer);
        reject(err);
      });
    });
  }

  /**
   * Send a JSON-serializable message and wait for the next message from the server.
   * Returns the raw text of the first received message.
   */
  sendAndWait(message: unknown): Promise<string> {
    this.ws.send(typeof message === 'string' ? message : JSON.stringify(message));
    return this.nextMessage();
  }

  /**
   * Send a message without waiting for a response.
   */
  send(message: unknown): void {
    this.ws.send(typeof message === 'string' ? message : JSON.stringify(message));
  }

  /**
   * Wait for the next message from the server.
   * If a message is already buffered, it is returned immediately.
   * Otherwise waits until a message arrives or the timeout expires.
   * Returns the raw text.
   */
  waitForMessage(): Promise<string> {
    return this.nextMessage();
  }

  /**
   * Wait for all currently buffered messages to be drained.
   * Returns the number of buffered messages that were drained.
   */
  drainBuffer(): number {
    const count = this.messageBuffer.length;
    this.messageBuffer = [];
    return count;
  }

  /**
   * Get the number of currently buffered (unconsumed) messages.
   */
  get bufferedCount(): number {
    return this.messageBuffer.length;
  }

  /**
   * Close the client connection.
   */
  close(): Promise<void> {
    return new Promise((resolve) => {
      // Reject any pending consumers
      for (const pending of this.pendingConsumers) {
        clearTimeout(pending.timer);
        pending.reject(new Error('WsTestClient: connection closed'));
      }
      this.pendingConsumers = [];
      this.messageBuffer = [];

      if (this.ws.readyState === this.ws.OPEN || this.ws.readyState === this.ws.CONNECTING) {
        this.ws.on('close', () => resolve());
        this.ws.close();
      } else {
        resolve();
      }
    });
  }

  /**
   * Get the raw readyState of the underlying WebSocket.
   */
  get readyState(): number {
    return this.ws.readyState;
  }

  /**
   * Check if the client is still connected.
   */
  get isOpen(): boolean {
    return this.ws.readyState === WebSocket.OPEN;
  }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  /**
   * Return a promise that resolves with the next message.
   * Checks the buffer first; if empty, registers a pending consumer.
   */
  private nextMessage(): Promise<string> {
    // If there is a buffered message, return it immediately
    if (this.messageBuffer.length > 0) {
      return Promise.resolve(this.messageBuffer.shift()!);
    }

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const idx = this.pendingConsumers.findIndex((p) => p.reject === reject);
        if (idx >= 0) this.pendingConsumers.splice(idx, 1);
        reject(new Error(`WsTestClient: timed out waiting for message after ${this.timeout}ms`));
      }, this.timeout);

      this.pendingConsumers.push({ resolve, reject, timer });
    });
  }
}
