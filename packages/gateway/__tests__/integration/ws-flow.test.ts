/**
 * Integration Tests for osaI Gateway -- WS Message Flow
 *
 * Tests the full end-to-end flow: connect -> send message -> receive response,
 * Session Router + Protocol interaction, Channel Manager + broadcast,
 * Session Persistence + Session Router.
 *
 * Test IDs: T007-01 through T007-10
 *
 * These tests exercise the actual GatewayServer + MessageRouter + SessionRouter
 * + ChannelManager + SessionPersistence together, using real WebSocket
 * connections and (for persistence tests) a real SQLite database.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import type { Database as DatabaseType } from 'better-sqlite3';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { rmSync } from 'node:fs';

import { GatewayServer } from '../../src/server/server.js';
import {
  parseMessage,
  serializeMessage,
  buildStatusMessage,
  buildBlockMessage,
  buildErrorResponse,
  buildEventMessage,
  buildPermissionRequest,
  MessageRouter,
} from '../../src/protocol/protocol.js';
import type { WsInboundMessage, ClientMessage } from '@osai/types';
import { Session, SessionRouter } from '../../src/session/router.js';
import { SessionPersistence } from '../../src/session/persistence.js';
import { ChannelManager } from '../../src/channels/channel.js';
import type { IChannelHandler, OutboundMessage } from '../../src/channels/channel.js';
import { WsTestClient } from '../helpers/ws-client.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Create a GatewayServer bound to a random available port (port 0).
 * Uses short heartbeat intervals so heartbeat-related tests finish quickly.
 */
function createTestServer(): GatewayServer {
  return new GatewayServer(
    { host: '127.0.0.1', port: 0 },
    { interval: 60_000, maxMissedPongs: 999 }, // effectively disable heartbeat in integration tests
  );
}

/** Extract the actual listening port from a started GatewayServer */
async function startAndGetPort(server: GatewayServer): Promise<number> {
  await server.start();
  const addr = (server as unknown as { wsServer: { address: () => unknown } }).wsServer.address() as {
    port: number;
  };
  return addr.port;
}

/**
 * Create a MessageRouter wired to a SessionRouter and ChannelManager.
 * - 'message' handler: finds session, adds message, returns status + block response
 * - 'subscribe' handler: returns an event acknowledgement
 * - 'command' handler: handles 'session.create' and 'session.list' commands
 */
function createWiredMessageRouter(
  sessionRouter: SessionRouter,
  channelManager: ChannelManager,
  broadcastFn: (msg: string) => void,
): MessageRouter {
  const router = new MessageRouter();

  // Message handler: routes to session, returns status + block
  router.register('message', (msg, _client) => {
    const clientMsg = msg as ClientMessage;
    const session = sessionRouter.getSession(clientMsg.session_id);

    if (!session) {
      return [buildErrorResponse(clientMsg.session_id, 'SESSION_NOT_FOUND', `Session '${clientMsg.session_id}' not found`, 'medium')];
    }

    if (!session.shouldProcess(clientMsg.content)) {
      return []; // filtered by activation mode
    }

    session.addMessage({ role: 'user', content: clientMsg.content, timestamp: Date.now() });
    session.setState('processing');

    // Simulate processing: add assistant response
    session.addMessage({ role: 'assistant', content: `Echo: ${clientMsg.content}`, timestamp: Date.now() });
    session.setState('idle');

    return [
      buildStatusMessage(clientMsg.session_id, 'processing'),
      buildBlockMessage(clientMsg.session_id, 'text', `Echo: ${clientMsg.content}`),
    ];
  });

  // Subscribe handler: acknowledge and broadcast
  router.register('subscribe', (msg, _client) => {
    const sub = msg as { events: string[] };
    return [
      buildEventMessage('system', 'subscribed', { events: sub.events }),
    ];
  });

  // Command handler: session management
  router.register('command', (msg, _client) => {
    const cmd = msg as { command: string; params?: Record<string, unknown> };

    if (cmd.command === 'session.create') {
      const type = (cmd.params?.type as 'main' | 'group' | 'isolated') ?? 'isolated';
      const session = sessionRouter.createSession(type);
      return [
        buildEventMessage('system', 'session.created', {
          session_id: session.id,
          type: session.type,
        }),
      ];
    }

    if (cmd.command === 'session.list') {
      return [
        buildEventMessage('system', 'session.list', {
          sessions: sessionRouter.listSessions().map((s) => ({
            id: s.id,
            type: s.type,
            state: s.state,
          })),
        }),
      ];
    }

    return [buildErrorResponse('system', 'UNKNOWN_COMMAND', `Command '${cmd.command}' not recognized`, 'low')];
  });

  // Permission response handler
  router.register('permission_response', (msg, _client) => {
    const resp = msg as { request_id: string; decision: 'approved' | 'denied' };
    return [
      buildEventMessage('system', 'permission_handled', {
        request_id: resp.request_id,
        decision: resp.decision,
      }),
    ];
  });

  return router;
}

/** Create a mock IChannelHandler for integration tests */
function createTestChannelHandler(id: string): IChannelHandler {
  let status: IChannelHandler['status'] = 'disconnected';
  const sentMessages: OutboundMessage[] = [];
  let handler: ((msg: OutboundMessage) => void) | null = null;

  return {
    id,
    type: 'ws',
    name: id,
    get status() { return status; },
    async connect() { status = 'connected'; },
    async disconnect() { status = 'disconnected'; handler = null; },
    send(msg: OutboundMessage) {
      if (status !== 'connected') throw new Error(`Channel ${id} not connected`);
      sentMessages.push(msg);
    },
    onMessage(h) { handler = h; },
    getStatus() { return status; },
    // Test helpers
    getSentMessages() { return sentMessages; },
    simulateIncoming(msg: OutboundMessage) { handler?.(msg); },
  };
}

// ---------------------------------------------------------------------------
// T007-01: Full message flow (connect -> send message -> receive response)
// T007-02: Session creation flow
// T007-03: Session routing
// T007-05: Multiple connections
// T007-06: Broadcast event
// T007-07: Graceful shutdown
// T007-08: Invalid message handling
// T007-09: Unknown session handling
// T007-10: Permission request flow
// ---------------------------------------------------------------------------

describe('Integration: WS Message Flow', () => {
  let server: GatewayServer;
  let port: number;
  let sessionRouter: SessionRouter;
  let channelManager: ChannelManager;
  let messageRouter: MessageRouter;

  beforeEach(async () => {
    server = createTestServer();
    sessionRouter = new SessionRouter();
    channelManager = new ChannelManager();
    messageRouter = createWiredMessageRouter(
      sessionRouter,
      channelManager,
      (msg) => server.broadcast(msg),
    );

    // Wire up the server to use MessageRouter for incoming messages
    server.onMessage((client, data) => {
      const result = parseMessage(data);
      if (!result.success) {
        client.ws.send(serializeMessage(
          buildErrorResponse('system', 'PARSE_ERROR', result.error, 'medium'),
        ));
        return;
      }

      const outbound = messageRouter.route(result.message, client);
      for (const msg of outbound) {
        client.ws.send(serializeMessage(msg));
      }
    });

    port = await startAndGetPort(server);
  });

  afterEach(async () => {
    if (server.isRunning) {
      await server.stop();
    }
  });

  // -------------------------------------------------------------------------
  // T007-01: Full message flow
  // -------------------------------------------------------------------------

  describe('T007-01: Full message flow', () => {
    it('should connect, send message, and receive response', async () => {
      // Create a session first
      const session = sessionRouter.createSession('main', 'main-1');

      // Connect client
      const client = await WsTestClient.connect({ port });
      expect(client.isOpen).toBe(true);

      // Send a message to the session
      const responseText = await client.sendAndWait({
        type: 'message',
        session_id: 'main-1',
        content: 'Hello, Gateway!',
      });

      const response = JSON.parse(responseText);

      // First response should be status
      expect(response.type).toBe('status');
      expect(response.session_id).toBe('main-1');
      expect(response.state).toBe('processing');

      // Wait for the second response (block)
      const blockResponse = JSON.parse(await client.waitForMessage());
      expect(blockResponse.type).toBe('block');
      expect(blockResponse.session_id).toBe('main-1');
      expect(blockResponse.content).toBe('Echo: Hello, Gateway!');

      // Verify the session has the messages
      expect(session.history).toHaveLength(2);
      expect(session.history[0]!.role).toBe('user');
      expect(session.history[0]!.content).toBe('Hello, Gateway!');
      expect(session.history[1]!.role).toBe('assistant');

      await client.close();
    });
  });

  // -------------------------------------------------------------------------
  // T007-02: Session creation flow via command
  // -------------------------------------------------------------------------

  describe('T007-02: Session creation flow', () => {
    it('should create a session via command and use it', async () => {
      const client = await WsTestClient.connect({ port });

      // Create a session via command
      const createResponse = JSON.parse(await client.sendAndWait({
        type: 'command',
        command: 'session.create',
        params: { type: 'group' },
      }));

      expect(createResponse.type).toBe('event');
      expect(createResponse.event).toBe('session.created');
      expect(createResponse.data.type).toBe('group');
      expect(createResponse.data.session_id).toBeDefined();

      const sessionId = createResponse.data.session_id as string;

      // Verify the session exists in the router
      const session = sessionRouter.getSession(sessionId);
      expect(session).toBeDefined();
      expect(session!.type).toBe('group');

      // Send a message to the new session
      const msgResponse = JSON.parse(await client.sendAndWait({
        type: 'message',
        session_id: sessionId,
        content: 'Hello group!',
      }));

      expect(msgResponse.type).toBe('status');

      await client.close();
    });
  });

  // -------------------------------------------------------------------------
  // T007-03: Session routing (message routed to correct session)
  // -------------------------------------------------------------------------

  describe('T007-03: Session routing', () => {
    it('should route message to the correct session', async () => {
      // Create two sessions
      const sessionA = sessionRouter.createSession('isolated', 'session-a');
      const sessionB = sessionRouter.createSession('isolated', 'session-b');

      const client = await WsTestClient.connect({ port });

      // Send message to session-a
      const responseA = JSON.parse(await client.sendAndWait({
        type: 'message',
        session_id: 'session-a',
        content: 'Message for A',
      }));

      expect(responseA.type).toBe('status');
      expect(responseA.session_id).toBe('session-a');

      // Wait for block response
      const blockA = JSON.parse(await client.waitForMessage());
      expect(blockA.content).toBe('Echo: Message for A');

      // Send message to session-b
      const responseB = JSON.parse(await client.sendAndWait({
        type: 'message',
        session_id: 'session-b',
        content: 'Message for B',
      }));

      expect(responseB.type).toBe('status');
      expect(responseB.session_id).toBe('session-b');

      // Verify history is separated
      expect(sessionA.history).toHaveLength(2); // user + assistant
      expect(sessionB.history).toHaveLength(2);
      expect(sessionA.history[0]!.content).toBe('Message for A');
      expect(sessionB.history[0]!.content).toBe('Message for B');

      await client.close();
    });

    it('should respect activation mode filtering', async () => {
      // Create a mention-mode session
      sessionRouter.createSession('isolated', 'mention-session', {
        activationMode: 'mention',
      });

      const client = await WsTestClient.connect({ port });

      // Send message without @mention -- should be filtered (no response sent)
      client.send({
        type: 'message',
        session_id: 'mention-session',
        content: 'This should be filtered',
      });

      // Wait a bit to ensure the message was processed
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Verify the session was not updated (no messages added)
      const session = sessionRouter.getSession('mention-session');
      expect(session!.history).toHaveLength(0);

      // Drain any buffered messages (there should be none)
      client.drainBuffer();

      // Now send with a mention -- should be processed
      const responseWithMention = JSON.parse(await client.sendAndWait({
        type: 'message',
        session_id: 'mention-session',
        content: '@osai help me',
      }));

      expect(responseWithMention.type).toBe('status');
      expect(session!.history).toHaveLength(2); // user + assistant

      await client.close();
    });
  });

  // -------------------------------------------------------------------------
  // T007-05: Multiple connections
  // -------------------------------------------------------------------------

  describe('T007-05: Multiple concurrent connections', () => {
    it('should handle multiple concurrent connections', async () => {
      const session = sessionRouter.createSession('main', 'multi-test');

      // Connect 3 clients
      const clients = await Promise.all([
        WsTestClient.connect({ port }),
        WsTestClient.connect({ port }),
        WsTestClient.connect({ port }),
      ]);

      for (const c of clients) {
        expect(c.isOpen).toBe(true);
      }

      expect(server.connectionCount).toBe(3);

      // Each client sends a message
      const responses = await Promise.all(
        clients.map((c) =>
          c.sendAndWait({
            type: 'message',
            session_id: 'multi-test',
            content: 'Hello from client',
          }).then((r) => JSON.parse(r)),
        ),
      );

      // All should get status response
      for (const resp of responses) {
        expect(resp.type).toBe('status');
        expect(resp.session_id).toBe('multi-test');
      }

      // Session should have accumulated messages from all clients
      expect(session.history.length).toBeGreaterThanOrEqual(2); // at least one user + assistant pair

      // Close all clients
      await Promise.all(clients.map((c) => c.close()));

      // Wait for disconnection to propagate
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(server.connectionCount).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // T007-06: Broadcast event
  // -------------------------------------------------------------------------

  describe('T007-06: Broadcast event', () => {
    it('should broadcast a message to all connected clients', async () => {
      const clients = await Promise.all([
        WsTestClient.connect({ port }),
        WsTestClient.connect({ port }),
        WsTestClient.connect({ port }),
      ]);

      expect(server.connectionCount).toBe(3);

      // Set up broadcast by subscribing all clients
      const broadcastMsg = JSON.stringify({
        type: 'event',
        session_id: 'system',
        event: 'broadcast_test',
        data: { message: 'Hello everyone!' },
      });

      // Server broadcasts directly
      server.broadcast(broadcastMsg);

      // All clients should receive the broadcast
      const results = await Promise.all(
        clients.map((c) => c.waitForMessage().then((r) => JSON.parse(r))),
      );

      for (const result of results) {
        expect(result.type).toBe('event');
        expect(result.event).toBe('broadcast_test');
        expect(result.data.message).toBe('Hello everyone!');
      }

      await Promise.all(clients.map((c) => c.close()));
    });
  });

  // -------------------------------------------------------------------------
  // T007-07: Graceful shutdown
  // -------------------------------------------------------------------------

  describe('T007-07: Graceful shutdown', () => {
    it('should gracefully shut down with connected clients', async () => {
      const clients = await Promise.all([
        WsTestClient.connect({ port }),
        WsTestClient.connect({ port }),
        WsTestClient.connect({ port }),
      ]);

      expect(server.connectionCount).toBe(3);

      // Stop the server
      await server.stop();

      // Server should no longer be running
      expect(server.isRunning).toBe(false);
      expect(server.connectionCount).toBe(0);

      // All clients should be closed
      for (const c of clients) {
        expect(c.isOpen).toBe(false);
      }
    });
  });

  // -------------------------------------------------------------------------
  // T007-08: Invalid message handling
  // -------------------------------------------------------------------------

  describe('T007-08: Invalid message handling', () => {
    it('should return error for invalid JSON', async () => {
      const client = await WsTestClient.connect({ port });

      const response = JSON.parse(await client.sendAndWait('{invalid json!!!'));

      expect(response.type).toBe('error');
      expect(response.code).toBe('PARSE_ERROR');

      await client.close();
    });

    it('should return error for unknown message type', async () => {
      const client = await WsTestClient.connect({ port });

      const response = JSON.parse(await client.sendAndWait(JSON.stringify({
        type: 'unknown_type',
        payload: 'test',
      })));

      // The parseMessage function rejects unknown types
      expect(response.type).toBe('error');
      expect(response.code).toBe('PARSE_ERROR');

      await client.close();
    });

    it('should return error for message with empty session_id', async () => {
      const client = await WsTestClient.connect({ port });

      const response = JSON.parse(await client.sendAndWait(JSON.stringify({
        type: 'message',
        session_id: '',
        content: 'hello',
      })));

      expect(response.type).toBe('error');
      expect(response.code).toBe('PARSE_ERROR');

      await client.close();
    });
  });

  // -------------------------------------------------------------------------
  // T007-09: Unknown session handling
  // -------------------------------------------------------------------------

  describe('T007-09: Unknown session handling', () => {
    it('should return SESSION_NOT_FOUND for unknown session_id', async () => {
      const client = await WsTestClient.connect({ port });

      const response = JSON.parse(await client.sendAndWait({
        type: 'message',
        session_id: 'nonexistent-session',
        content: 'hello',
      }));

      expect(response.type).toBe('error');
      expect(response.code).toBe('SESSION_NOT_FOUND');
      expect(response.severity).toBe('medium');

      await client.close();
    });
  });

  // -------------------------------------------------------------------------
  // T007-10: Permission request flow
  // -------------------------------------------------------------------------

  describe('T007-10: Permission request flow', () => {
    it('should handle permission_response message', async () => {
      const client = await WsTestClient.connect({ port });

      const response = JSON.parse(await client.sendAndWait({
        type: 'permission_response',
        request_id: 'req-123',
        decision: 'approved',
      }));

      expect(response.type).toBe('event');
      expect(response.event).toBe('permission_handled');
      expect(response.data.request_id).toBe('req-123');
      expect(response.data.decision).toBe('approved');

      // Test denied
      const deniedResponse = JSON.parse(await client.sendAndWait({
        type: 'permission_response',
        request_id: 'req-456',
        decision: 'denied',
      }));

      expect(deniedResponse.type).toBe('event');
      expect(deniedResponse.data.decision).toBe('denied');

      await client.close();
    });

    it('should build and receive permission_request via broadcast', async () => {
      const client = await WsTestClient.connect({ port });

      // Simulate a permission request being sent to the client
      const permRequest = buildPermissionRequest(
        'req-789',
        'main-1',
        'shell',
        'execute',
        { command: 'rm -rf /tmp/test' },
        'high',
      );

      server.broadcast(serializeMessage(permRequest));

      const received = JSON.parse(await client.waitForMessage());
      expect(received.type).toBe('permission_request');
      expect(received.request_id).toBe('req-789');
      expect(received.tool).toBe('shell');
      expect(received.risk_level).toBe('high');
      expect(received.params.command).toBe('rm -rf /tmp/test');

      await client.close();
    });
  });
});

// ---------------------------------------------------------------------------
// Channel Manager + Broadcast integration
// ---------------------------------------------------------------------------

describe('Integration: Channel Manager + Broadcast', () => {
  it('should broadcast events through channel manager', async () => {
    const channelManager = new ChannelManager();
    const channel1 = createTestChannelHandler('ch-1');
    const channel2 = createTestChannelHandler('ch-2');
    const channel3 = createTestChannelHandler('ch-3');

    channelManager.registerChannel(channel1);
    channelManager.registerChannel(channel2);
    channelManager.registerChannel(channel3);

    await channelManager.connectAll();

    // Broadcast an event
    const message: OutboundMessage = {
      sessionId: 'system',
      content: 'broadcast test',
      type: 'event',
      metadata: { event: 'test_broadcast' },
    };

    const sentCount = channelManager.broadcastEvent(message);
    expect(sentCount).toBe(3);

    // Verify all channels received the message
    const typedCh1 = channel1 as ReturnType<typeof createTestChannelHandler>;
    const typedCh2 = channel2 as ReturnType<typeof createTestChannelHandler>;
    const typedCh3 = channel3 as ReturnType<typeof createTestChannelHandler>;

    expect(typedCh1.getSentMessages()).toHaveLength(1);
    expect(typedCh2.getSentMessages()).toHaveLength(1);
    expect(typedCh3.getSentMessages()).toHaveLength(1);

    expect(typedCh1.getSentMessages()[0]!.content).toBe('broadcast test');

    // Unregister a channel and broadcast again
    await channelManager.unregisterChannel('ch-2');

    const sentCount2 = channelManager.broadcastEvent(message);
    expect(sentCount2).toBe(2);

    await channelManager.disconnectAll();
  });

  it('should skip disconnected channels during broadcast', async () => {
    const channelManager = new ChannelManager();
    const channel1 = createTestChannelHandler('ch-active');
    const channel2 = createTestChannelHandler('ch-inactive');

    channelManager.registerChannel(channel1);
    channelManager.registerChannel(channel2);

    // Only connect channel1
    await channel1.connect();

    const message: OutboundMessage = {
      sessionId: 'system',
      content: 'test',
      type: 'text',
    };

    const sentCount = channelManager.broadcastEvent(message);
    expect(sentCount).toBe(1);

    await channelManager.disconnectAll();
  });
});

// ---------------------------------------------------------------------------
// Session Persistence + Session Router integration
// ---------------------------------------------------------------------------

describe('Integration: Session Persistence + Session Router', () => {
  // T007-04: Persistence + resume

  let db: DatabaseType;
  let dbPath: string;

  beforeEach(() => {
    dbPath = join(tmpdir(), `osai-integ-test-${Date.now()}-${Math.random().toString(36).slice(2, 6)}.db`);
    db = Database(dbPath) as unknown as DatabaseType;
  });

  afterEach(() => {
    try {
      (db as unknown as { close: () => void }).close();
    } catch {
      // ignore
    }
    try {
      rmSync(dbPath, { force: true });
    } catch {
      // ignore
    }
    // Clean up WAL and SHM files
    try { rmSync(dbPath + '-wal', { force: true }); } catch { /* ignore */ }
    try { rmSync(dbPath + '-shm', { force: true }); } catch { /* ignore */ }
  });

  it('T007-04: should persist and resume sessions across router restarts', () => {
    // Phase 1: Create router, sessions, persist
    const persistence1 = new SessionPersistence(db);
    const router1 = new SessionRouter();

    // Create sessions
    const mainSession = router1.createSession('main', 'main-1', {
      activationMode: 'always',
    });
    mainSession.addMessage({ role: 'user', content: 'Hello', timestamp: 1000 });
    mainSession.addMessage({ role: 'assistant', content: 'Hi there!', timestamp: 2000 });

    const groupSession = router1.createSession('group', 'grp-1', {
      activationMode: 'mention',
    });
    groupSession.addMessage({ role: 'user', content: '@osai status', timestamp: 3000 });
    groupSession.addMessage({ role: 'assistant', content: 'All systems nominal.', timestamp: 4000 });

    // Persist all sessions
    persistence1.saveSession(mainSession);
    persistence1.saveSession(groupSession);

    // Phase 2: Simulate restart by creating a new router
    const router2 = new SessionRouter();
    const persistence2 = new SessionPersistence(db); // reuse same db

    // Load all sessions from DB and restore into new router
    const allSessions = persistence2.loadAllSessions();
    expect(allSessions).toHaveLength(2);

    for (const data of allSessions) {
      router2.restoreSession(data);
    }

    // Verify restored sessions
    expect(router2.sessionCount).toBe(2);

    const restoredMain = router2.getSession('main-1');
    expect(restoredMain).toBeDefined();
    expect(restoredMain!.type).toBe('main');
    expect(restoredMain!.activationMode).toBe('always');
    expect(restoredMain!.history).toHaveLength(2);
    expect(restoredMain!.history[0]!.content).toBe('Hello');
    expect(restoredMain!.history[1]!.content).toBe('Hi there!');

    const restoredGroup = router2.getSession('grp-1');
    expect(restoredGroup).toBeDefined();
    expect(restoredGroup!.type).toBe('group');
    expect(restoredGroup!.activationMode).toBe('mention');
    expect(restoredGroup!.history).toHaveLength(2);
    expect(restoredGroup!.history[0]!.content).toBe('@osai status');

    // Verify main session constraint is preserved
    expect(router2.getMainSession()?.id).toBe('main-1');

    // Phase 3: Add more data and persist again
    restoredMain!.addMessage({ role: 'user', content: 'Goodbye', timestamp: 5000 });
    persistence2.saveSession(restoredMain!);

    // Phase 4: Yet another restart to verify update persistence
    const router3 = new SessionRouter();
    const persistence3 = new SessionPersistence(db);
    const allSessions3 = persistence3.loadAllSessions();
    for (const data of allSessions3) {
      router3.restoreSession(data);
    }

    const finalMain = router3.getSession('main-1');
    expect(finalMain!.history).toHaveLength(3);
    expect(finalMain!.history[2]!.content).toBe('Goodbye');
  });

  it('should handle session deletion from persistence', () => {
    const persistence = new SessionPersistence(db);
    const router = new SessionRouter();

    const session = router.createSession('isolated', 'iso-del');
    persistence.saveSession(session);

    expect(persistence.loadSession('iso-del')).toBeDefined();
    expect(router.sessionCount).toBe(1);

    // Delete from persistence
    persistence.deleteSession('iso-del');
    expect(persistence.loadSession('iso-del')).toBeUndefined();

    // Delete from router
    router.removeSession('iso-del');
    expect(router.sessionCount).toBe(0);
  });

  it('should persist session state changes', () => {
    const persistence = new SessionPersistence(db);
    const router = new SessionRouter();

    const session = router.createSession('main', 'state-test');
    session.setState('processing');
    persistence.saveSession(session);

    // Reload
    const loaded = persistence.loadSession('state-test');
    expect(loaded!.state).toBe('processing');

    // Change state and re-persist
    session.setState('waiting_permission');
    persistence.saveSession(session);

    const loaded2 = persistence.loadSession('state-test');
    expect(loaded2!.state).toBe('waiting_permission');
  });

  it('should handle persistence with empty sessions', () => {
    const persistence = new SessionPersistence(db);

    // Load when no sessions exist
    const sessions = persistence.loadAllSessions();
    expect(sessions).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Full end-to-end: GatewayServer + SessionRouter + Persistence
// ---------------------------------------------------------------------------

describe('Integration: Full stack (Server + Router + Persistence)', () => {
  let server: GatewayServer;
  let port: number;
  let sessionRouter: SessionRouter;
  let channelManager: ChannelManager;
  let messageRouter: MessageRouter;
  let db: DatabaseType;
  let dbPath: string;

  beforeEach(async () => {
    dbPath = join(tmpdir(), `osai-full-test-${Date.now()}-${Math.random().toString(36).slice(2, 6)}.db`);
    db = Database(dbPath) as unknown as DatabaseType;

    server = createTestServer();
    sessionRouter = new SessionRouter();
    channelManager = new ChannelManager();
    messageRouter = createWiredMessageRouter(
      sessionRouter,
      channelManager,
      (msg) => server.broadcast(msg),
    );

    server.onMessage((client, data) => {
      const result = parseMessage(data);
      if (!result.success) {
        client.ws.send(serializeMessage(
          buildErrorResponse('system', 'PARSE_ERROR', result.error, 'medium'),
        ));
        return;
      }

      const outbound = messageRouter.route(result.message, client);
      for (const msg of outbound) {
        client.ws.send(serializeMessage(msg));
      }
    });

    port = await startAndGetPort(server);
  });

  afterEach(async () => {
    if (server.isRunning) {
      await server.stop();
    }
    try {
      (db as unknown as { close: () => void }).close();
    } catch {
      // ignore
    }
    try { rmSync(dbPath, { force: true }); } catch { /* ignore */ }
    try { rmSync(dbPath + '-wal', { force: true }); } catch { /* ignore */ }
    try { rmSync(dbPath + '-shm', { force: true }); } catch { /* ignore */ }
  });

  it('should complete full lifecycle: create session, exchange messages, persist, resume', async () => {
    const persistence = new SessionPersistence(db);

    // Step 1: Create session via command
    const client = await WsTestClient.connect({ port });

    const createResp = JSON.parse(await client.sendAndWait({
      type: 'command',
      command: 'session.create',
      params: { type: 'main' },
    }));

    expect(createResp.type).toBe('event');
    expect(createResp.event).toBe('session.created');
    const sessionId = createResp.data.session_id as string;

    // Step 2: Exchange messages
    const statusResp = JSON.parse(await client.sendAndWait({
      type: 'message',
      session_id: sessionId,
      content: 'First message',
    }));
    expect(statusResp.type).toBe('status');

    const blockResp = JSON.parse(await client.waitForMessage());
    expect(blockResp.type).toBe('block');
    expect(blockResp.content).toBe('Echo: First message');

    // Step 3: Persist session
    const session = sessionRouter.getSession(sessionId);
    expect(session).toBeDefined();
    persistence.saveSession(session!);

    // Step 4: Disconnect client
    await client.close();
    await server.stop();

    // Step 5: Simulate restart -- new server, new router, load from persistence
    const server2 = createTestServer();
    const router2 = new SessionRouter();

    // Load sessions from persistence
    const loadedSessions = persistence.loadAllSessions();
    for (const data of loadedSessions) {
      router2.restoreSession(data);
    }

    expect(router2.sessionCount).toBe(1);
    const restoredSession = router2.getSession(sessionId);
    expect(restoredSession).toBeDefined();
    expect(restoredSession!.history).toHaveLength(2);
    expect(restoredSession!.history[0]!.content).toBe('First message');

    // Step 6: Start new server and verify the session works
    const messageRouter2 = createWiredMessageRouter(
      router2,
      new ChannelManager(),
      (msg) => server2.broadcast(msg),
    );

    server2.onMessage((client, data) => {
      const result = parseMessage(data);
      if (!result.success) {
        client.ws.send(serializeMessage(
          buildErrorResponse('system', 'PARSE_ERROR', result.error, 'medium'),
        ));
        return;
      }

      const outbound = messageRouter2.route(result.message, client);
      for (const msg of outbound) {
        client.ws.send(serializeMessage(msg));
      }
    });

    const port2 = await startAndGetPort(server2);
    const client2 = await WsTestClient.connect({ port: port2 });

    // Send another message to the resumed session
    const statusResp2 = JSON.parse(await client2.sendAndWait({
      type: 'message',
      session_id: sessionId,
      content: 'Message after resume',
    }));
    expect(statusResp2.type).toBe('status');

    // Verify session now has 4 messages (2 from before + 2 from after resume)
    expect(restoredSession!.history).toHaveLength(4);
    expect(restoredSession!.history[2]!.content).toBe('Message after resume');

    await client2.close();
    await server2.stop();
  }, 15_000);

  it('should handle subscribe events end-to-end', async () => {
    const client = await WsTestClient.connect({ port });

    const subscribeResp = JSON.parse(await client.sendAndWait({
      type: 'subscribe',
      events: ['tool_stream', 'block', 'permission_request'],
    }));

    expect(subscribeResp.type).toBe('event');
    expect(subscribeResp.event).toBe('subscribed');
    expect(subscribeResp.data.events).toEqual(['tool_stream', 'block', 'permission_request']);

    await client.close();
  });

  it('should handle session.list command end-to-end', async () => {
    sessionRouter.createSession('main', 's1');
    sessionRouter.createSession('group', 's2');
    sessionRouter.createSession('isolated', 's3');

    const client = await WsTestClient.connect({ port });

    const listResp = JSON.parse(await client.sendAndWait({
      type: 'command',
      command: 'session.list',
    }));

    expect(listResp.type).toBe('event');
    expect(listResp.event).toBe('session.list');
    expect(listResp.data.sessions).toHaveLength(3);

    await client.close();
  });
});
