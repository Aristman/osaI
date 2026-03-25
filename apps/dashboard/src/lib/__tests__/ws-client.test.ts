/**
 * T002-UNIT-001: WS client connects to Gateway
 * T002-UNIT-002: WS client handles disconnection
 * T002-UNIT-005: Exponential backoff on reconnect
 *
 * All tests use mocked WebSocket to run in Node environment.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// --- WebSocket mock ---

class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  url: string;
  readyState = MockWebSocket.CONNECTING;
  onopen: ((ev: { type: string }) => void) | null = null;
  onclose: ((ev: { type: string; code: number; reason: string; wasClean: boolean }) => void) | null = null;
  onerror: ((ev: { type: string }) => void) | null = null;
  onmessage: ((ev: { type: string; data: string }) => void) | null = null;

  sentMessages: string[] = [];

  constructor(url: string) {
    this.url = url;
  }

  // Simulate server opening connection
  simulateOpen(): void {
    this.readyState = MockWebSocket.OPEN;
    if (this.onopen) {
      this.onopen({ type: 'open' });
    }
  }

  // Simulate receiving a message from server
  simulateMessage(data: string): void {
    if (this.onmessage) {
      this.onmessage({ type: 'message', data });
    }
  }

  // Simulate server closing connection
  simulateClose(code = 1000, reason = ''): void {
    this.readyState = MockWebSocket.CLOSED;
    if (this.onclose) {
      this.onclose({ type: 'close', code, reason, wasClean: code === 1000 });
    }
  }

  // Simulate error
  simulateError(): void {
    if (this.onerror) {
      this.onerror({ type: 'error' });
    }
  }

  send(data: string): void {
    if (this.readyState !== MockWebSocket.OPEN) {
      throw new Error('WebSocket is not open');
    }
    this.sentMessages.push(data);
  }

  close(_code = 1000, _reason = ''): void {
    this.readyState = MockWebSocket.CLOSING;
    // Simulate async close
    setTimeout(() => {
      this.readyState = MockWebSocket.CLOSED;
      if (this.onclose) {
        this.onclose({ type: 'close', code: _code, reason: _reason, wasClean: true });
      }
    }, 0);
  }
}

// Helper to capture WebSocket instances
function createCapturingWebSocket(capturedWs: MockWebSocket[]) {
  const OrigWs = MockWebSocket;
  return class extends OrigWs {
    constructor(url: string) {
      super(url);
      capturedWs.push(this);
    }
  };
}

describe('WsClient', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('WebSocket', MockWebSocket);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  describe('T002-UNIT-001: WS client connects to Gateway', () => {
    it('initializes in disconnected state', async () => {
      const { WsClient } = await import('../ws-client');
      const client = new WsClient();
      expect(client.state).toBe('disconnected');
    });

    it('transitions to connecting when connect() is called', async () => {
      const { WsClient } = await import('../ws-client');
      const client = new WsClient();
      client.connect('ws://127.0.0.1:18789');
      expect(client.state).toBe('connecting');
    });

    it('transitions to connected on successful connection', async () => {
      const { WsClient } = await import('../ws-client');
      const client = new WsClient();
      client.connect('ws://127.0.0.1:18789');

      // Get the WS instance created by connect()
      // The connect is sync in our implementation, so the WS should exist
      // We need to trigger the open event
      await vi.advanceTimersByTimeAsync(0);

      // Find the WebSocket instance
      // Since WebSocket was called, we can get it from the global
      // But we need to capture it. Let's use a different approach.
      // We'll trigger events via the client's internal ws reference.
      // For testing, we'll expose a test helper.

      // Actually, we need to capture the ws instance when it's created.
      // Let's patch the WebSocket constructor to capture.
      const OriginalWebSocket = globalThis.WebSocket as unknown as typeof MockWebSocket;
      const capturedWs: MockWebSocket[] = [];
      vi.stubGlobal('WebSocket', class extends OriginalWebSocket {
        constructor(url: string) {
          super(url);
          capturedWs.push(this);
        }
      });

      const client2 = new (await import('../ws-client')).WsClient();
      client2.connect('ws://127.0.0.1:18789');
      await vi.advanceTimersByTimeAsync(0);

      expect(capturedWs.length).toBeGreaterThan(0);
      capturedWs[capturedWs.length - 1]!.simulateOpen();
      expect(client2.state).toBe('connected');
    });

    it('emits "connected" event on successful connection', async () => {
      const OriginalWebSocket = globalThis.WebSocket as unknown as typeof MockWebSocket;
      const capturedWs: MockWebSocket[] = [];
      vi.stubGlobal('WebSocket', class extends OriginalWebSocket {
        constructor(url: string) {
          super(url);
          capturedWs.push(this);
        }
      });

      const { WsClient } = await import('../ws-client');
      const client = new WsClient();
      const connectedSpy = vi.fn();
      client.on('connected', connectedSpy);

      client.connect('ws://127.0.0.1:18789');
      await vi.advanceTimersByTimeAsync(0);

      capturedWs[capturedWs.length - 1]!.simulateOpen();
      expect(connectedSpy).toHaveBeenCalledOnce();
    });
  });

  describe('T002-UNIT-002: WS client handles disconnection', () => {
    it('transitions to disconnected on close event', async () => {
      const OriginalWebSocket = globalThis.WebSocket as unknown as typeof MockWebSocket;
      const capturedWs: MockWebSocket[] = [];
      vi.stubGlobal('WebSocket', class extends OriginalWebSocket {
        constructor(url: string) {
          super(url);
          capturedWs.push(this);
        }
      });

      const { WsClient } = await import('../ws-client');
      const client = new WsClient();
      client.connect('ws://127.0.0.1:18789');
      await vi.advanceTimersByTimeAsync(0);

      capturedWs[capturedWs.length - 1]!.simulateOpen();
      expect(client.state).toBe('connected');

      capturedWs[capturedWs.length - 1]!.simulateClose();
      expect(client.state).toBe('disconnected');
    });

    it('transitions to reconnecting and attempts reconnect', async () => {
      const OriginalWebSocket = globalThis.WebSocket as unknown as typeof MockWebSocket;
      const capturedWs: MockWebSocket[] = [];
      vi.stubGlobal('WebSocket', class extends OriginalWebSocket {
        constructor(url: string) {
          super(url);
          capturedWs.push(this);
        }
      });

      const { WsClient } = await import('../ws-client');
      const client = new WsClient();
      client.connect('ws://127.0.0.1:18789');
      await vi.advanceTimersByTimeAsync(0);

      capturedWs[capturedWs.length - 1]!.simulateOpen();
      capturedWs[capturedWs.length - 1]!.simulateClose(1006); // abnormal close

      expect(client.state).toBe('reconnecting');

      // After 1s (first backoff), should attempt reconnect
      await vi.advanceTimersByTimeAsync(1000);
      expect(capturedWs.length).toBe(2); // new WS created
      expect(client.state).toBe('connecting');
    });

    it('emits "disconnected" event', async () => {
      const OriginalWebSocket = globalThis.WebSocket as unknown as typeof MockWebSocket;
      const capturedWs: MockWebSocket[] = [];
      vi.stubGlobal('WebSocket', class extends OriginalWebSocket {
        constructor(url: string) {
          super(url);
          capturedWs.push(this);
        }
      });

      const { WsClient } = await import('../ws-client');
      const client = new WsClient();
      const disconnectedSpy = vi.fn();
      client.on('disconnected', disconnectedSpy);

      client.connect('ws://127.0.0.1:18789');
      await vi.advanceTimersByTimeAsync(0);

      capturedWs[capturedWs.length - 1]!.simulateOpen();
      capturedWs[capturedWs.length - 1]!.simulateClose();

      expect(disconnectedSpy).toHaveBeenCalledOnce();
    });
  });

  describe('send()', () => {
    it('sends JSON message through WebSocket', async () => {
      const OriginalWebSocket = globalThis.WebSocket as unknown as typeof MockWebSocket;
      const capturedWs: MockWebSocket[] = [];
      vi.stubGlobal('WebSocket', class extends OriginalWebSocket {
        constructor(url: string) {
          super(url);
          capturedWs.push(this);
        }
      });

      const { WsClient } = await import('../ws-client');
      const client = new WsClient();
      client.connect('ws://127.0.0.1:18789');
      await vi.advanceTimersByTimeAsync(0);

      capturedWs[capturedWs.length - 1]!.simulateOpen();

      client.send({ type: 'message', sessionId: 's1', content: 'hello' });

      expect(capturedWs[capturedWs.length - 1]!.sentMessages).toHaveLength(1);
      const sent = JSON.parse(capturedWs[capturedWs.length - 1]!.sentMessages[0]!);
      expect(sent.type).toBe('message');
      expect(sent.content).toBe('hello');
    });

    it('throws when not connected', async () => {
      const { WsClient } = await import('../ws-client');
      const client = new WsClient();
      expect(() => client.send({ type: 'message', sessionId: 's1', content: 'hello' })).toThrow();
    });
  });

  describe('Event emitter', () => {
    it('supports on/off pattern', async () => {
      const capturedWs: MockWebSocket[] = [];
      vi.stubGlobal('WebSocket', createCapturingWebSocket(capturedWs));

      const { WsClient } = await import('../ws-client');
      const client = new WsClient();
      const spy = vi.fn();

      client.on('message', spy);
      client.connect('ws://127.0.0.1:18789');
      await vi.advanceTimersByTimeAsync(0);
      capturedWs[capturedWs.length - 1]!.simulateOpen();

      // Send a valid message to trigger the 'message' event
      const validMsg = JSON.stringify({
        type: 'block',
        sessionId: 's1',
        blockId: 'b1',
        blockType: 'text',
        content: {},
        timestamp: new Date().toISOString()
      });
      capturedWs[capturedWs.length - 1]!.simulateMessage(validMsg);
      expect(spy).toHaveBeenCalledOnce();

      // Unsubscribe
      client.off('message', spy);
      capturedWs[capturedWs.length - 1]!.simulateMessage(validMsg);
      expect(spy).toHaveBeenCalledOnce(); // still 1, not called again
    });
  });

  describe('T002-UNIT-005: Exponential backoff on reconnect', () => {
    it('increases delay: 1s, 2s, 4s, 8s', async () => {
      const OriginalWebSocket = globalThis.WebSocket as unknown as typeof MockWebSocket;
      const capturedWs: MockWebSocket[] = [];
      vi.stubGlobal('WebSocket', class extends OriginalWebSocket {
        constructor(url: string) {
          super(url);
          capturedWs.push(this);
        }
      });

      const { WsClient } = await import('../ws-client');
      const client = new WsClient();
      client.connect('ws://127.0.0.1:18789');
      await vi.advanceTimersByTimeAsync(0);

      // First connection succeeds then fails
      capturedWs[capturedWs.length - 1]!.simulateOpen();
      capturedWs[capturedWs.length - 1]!.simulateClose(1006);

      // Reconnect attempt 1: after 1s
      await vi.advanceTimersByTimeAsync(1000);
      expect(capturedWs.length).toBe(2);

      // Fail again
      capturedWs[capturedWs.length - 1]!.simulateOpen();
      capturedWs[capturedWs.length - 1]!.simulateClose(1006);

      // Reconnect attempt 2: after additional 2s
      await vi.advanceTimersByTimeAsync(2000);
      expect(capturedWs.length).toBe(3);

      // Fail again
      capturedWs[capturedWs.length - 1]!.simulateOpen();
      capturedWs[capturedWs.length - 1]!.simulateClose(1006);

      // Reconnect attempt 3: after additional 4s
      await vi.advanceTimersByTimeAsync(4000);
      expect(capturedWs.length).toBe(4);

      // Fail again
      capturedWs[capturedWs.length - 1]!.simulateOpen();
      capturedWs[capturedWs.length - 1]!.simulateClose(1006);

      // Reconnect attempt 4: after additional 8s
      await vi.advanceTimersByTimeAsync(8000);
      expect(capturedWs.length).toBe(5);
    });

    it('resets backoff on successful connection', async () => {
      const OriginalWebSocket = globalThis.WebSocket as unknown as typeof MockWebSocket;
      const capturedWs: MockWebSocket[] = [];
      vi.stubGlobal('WebSocket', class extends OriginalWebSocket {
        constructor(url: string) {
          super(url);
          capturedWs.push(this);
        }
      });

      const { WsClient } = await import('../ws-client');
      const client = new WsClient();
      client.connect('ws://127.0.0.1:18789');
      await vi.advanceTimersByTimeAsync(0);

      // Connect, fail, reconnect (1s delay)
      capturedWs[capturedWs.length - 1]!.simulateOpen();
      capturedWs[capturedWs.length - 1]!.simulateClose(1006);
      await vi.advanceTimersByTimeAsync(1000);
      capturedWs[capturedWs.length - 1]!.simulateOpen();

      // Now connected, fail again -- backoff should reset
      capturedWs[capturedWs.length - 1]!.simulateClose(1006);

      // Next reconnect should be 1s (reset), not 2s
      await vi.advanceTimersByTimeAsync(1000);
      expect(capturedWs.length).toBe(3);
    });
  });

  describe('disconnect()', () => {
    it('closes the connection and stops reconnecting', async () => {
      const OriginalWebSocket = globalThis.WebSocket as unknown as typeof MockWebSocket;
      const capturedWs: MockWebSocket[] = [];
      vi.stubGlobal('WebSocket', class extends OriginalWebSocket {
        constructor(url: string) {
          super(url);
          capturedWs.push(this);
        }
      });

      const { WsClient } = await import('../ws-client');
      const client = new WsClient();
      client.connect('ws://127.0.0.1:18789');
      await vi.advanceTimersByTimeAsync(0);

      capturedWs[capturedWs.length - 1]!.simulateOpen();
      client.disconnect();
      await vi.advanceTimersByTimeAsync(0);

      expect(client.state).toBe('disconnected');

      // Wait long enough that a reconnect would have happened
      await vi.advanceTimersByTimeAsync(30000);
      expect(capturedWs.length).toBe(1); // no new WS created
    });
  });

  describe('Message parsing', () => {
    it('parses and emits incoming JSON messages', async () => {
      const OriginalWebSocket = globalThis.WebSocket as unknown as typeof MockWebSocket;
      const capturedWs: MockWebSocket[] = [];
      vi.stubGlobal('WebSocket', class extends OriginalWebSocket {
        constructor(url: string) {
          super(url);
          capturedWs.push(this);
        }
      });

      const { WsClient } = await import('../ws-client');
      const client = new WsClient();
      const messageSpy = vi.fn();
      client.on('message', messageSpy);

      client.connect('ws://127.0.0.1:18789');
      await vi.advanceTimersByTimeAsync(0);
      capturedWs[capturedWs.length - 1]!.simulateOpen();

      const incomingMsg = {
        type: 'block',
        sessionId: 's1',
        blockId: 'b1',
        blockType: 'text',
        content: { text: 'Hello' },
        timestamp: new Date().toISOString()
      };

      capturedWs[capturedWs.length - 1]!.simulateMessage(JSON.stringify(incomingMsg));

      expect(messageSpy).toHaveBeenCalledOnce();
      expect(messageSpy).toHaveBeenCalledWith(incomingMsg);
    });
  });
});
