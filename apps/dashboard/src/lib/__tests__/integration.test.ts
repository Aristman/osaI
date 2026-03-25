/**
 * Integration Tests for Web Dashboard -- Task T-010.
 *
 * Cross-module integration tests that verify:
 * - WS Client -> Stores integration (connect -> messages flow)
 * - Stores -> Components data flow (store update -> derived values)
 * - Cross-component integration (Sidebar -> Session switch -> Messages update)
 * - Permission flow (request -> store update -> response)
 * - Memory search flow (search -> results -> filters)
 * - Status panel flow (connect -> auto-refresh -> status display)
 * - Settings persistence flow (update -> save -> load -> restore)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { get } from 'svelte/store';
import type {
  BlockMessage,
  ToolStreamMessage,
  PermissionRequestMessage,
  Session
} from '../types';
import type { SystemInfo } from '../components/status/status-utils';

// --- Shared Test Data ---

const MOCK_SESSION_1: Session = {
  id: 'session-1',
  label: 'Chat Session',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  messageCount: 0,
  channel: 'dashboard',
  status: 'active'
};

const MOCK_SESSION_2: Session = {
  id: 'session-2',
  label: 'Work Session',
  createdAt: '2026-01-02T00:00:00Z',
  updatedAt: '2026-01-02T00:00:00Z',
  messageCount: 5,
  channel: 'cli',
  status: 'active'
};

const MOCK_BLOCK_MSG: BlockMessage = {
  type: 'block',
  sessionId: 'session-1',
  blockId: 'block-1',
  blockType: 'text',
  content: { text: 'Hello from agent' },
  timestamp: '2026-01-01T00:00:01Z'
};

const MOCK_TOOL_STARTED: ToolStreamMessage = {
  type: 'tool_stream',
  sessionId: 'session-1',
  toolCallId: 'tc-1',
  toolName: 'shell',
  status: 'started',
  data: { command: 'ls -la' },
  timestamp: '2026-01-01T00:00:02Z'
};

const MOCK_TOOL_COMPLETED: ToolStreamMessage = {
  type: 'tool_stream',
  sessionId: 'session-1',
  toolCallId: 'tc-1',
  toolName: 'shell',
  status: 'completed',
  data: { output: 'file1.txt\nfile2.txt' },
  duration: 150,
  timestamp: '2026-01-01T00:00:03Z'
};

const MOCK_PERMISSION_REQUEST: PermissionRequestMessage = {
  type: 'permission_request',
  requestId: 'perm-1',
  sessionId: 'session-1',
  toolName: 'filesystem',
  action: 'write',
  params: { path: '/home/user/test.txt', content: 'test data' },
  riskLevel: 'medium',
  description: 'Agent wants to write to /home/user/test.txt',
  timestamp: '2026-01-01T00:00:04Z'
};

// --- Mock WebSocket for integration tests ---

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

  simulateOpen(): void {
    this.readyState = MockWebSocket.OPEN;
    if (this.onopen) this.onopen({ type: 'open' });
  }

  simulateMessage(data: string): void {
    if (this.onmessage) this.onmessage({ type: 'message', data });
  }

  simulateClose(code = 1000, reason = ''): void {
    this.readyState = MockWebSocket.CLOSED;
    if (this.onclose) {
      this.onclose({ type: 'close', code, reason, wasClean: code === 1000 });
    }
  }

  simulateError(): void {
    if (this.onerror) this.onerror({ type: 'error' });
  }

  send(data: string): void {
    if (this.readyState !== MockWebSocket.OPEN) {
      throw new Error('WebSocket is not open');
    }
    this.sentMessages.push(data);
  }

  close(_code = 1000, _reason = ''): void {
    this.readyState = MockWebSocket.CLOSING;
    setTimeout(() => {
      this.readyState = MockWebSocket.CLOSED;
      if (this.onclose) {
        this.onclose({ type: 'close', code: _code, reason: _reason, wasClean: true });
      }
    }, 0);
  }
}

// Helper to capture WS instances
function createCapturingWs(captured: MockWebSocket[]) {
  return class extends MockWebSocket {
    constructor(url: string) {
      super(url);
      captured.push(this);
    }
  };
}

// --- localStorage mock ---

function createLocalStorageMock() {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; },
    _store: () => store
  };
}

// ========================================================
// Test Suite: WS Client -> Stores Integration
// ========================================================

describe('WS Client -> Stores Integration', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.resetModules();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('connect -> stateChange events update connectionStore', async () => {
    const capturedWs: MockWebSocket[] = [];
    vi.stubGlobal('WebSocket', createCapturingWs(capturedWs));

    const { connectionStore } = await import('../stores/connection');
    const { WsClient } = await import('../ws-client');

    // Initial state
    expect(get(connectionStore).state).toBe('disconnected');

    // Simulate WsClient -> connectionStore wiring
    const client = new WsClient();
    client.on('stateChange', (state) => {
      connectionStore.setState(state);
    });

    // Connect
    client.connect('ws://127.0.0.1:18789');
    await vi.advanceTimersByTimeAsync(0);
    expect(get(connectionStore).state).toBe('connecting');

    // Open
    capturedWs[0]!.simulateOpen();
    expect(get(connectionStore).state).toBe('connected');
    expect(get(connectionStore).connectedAt).toBeTruthy();

    // Disconnect
    capturedWs[0]!.simulateClose();
    expect(get(connectionStore).state).toBe('disconnected');
  });

  it('incoming WS messages dispatch to correct stores', async () => {
    const capturedWs: MockWebSocket[] = [];
    vi.stubGlobal('WebSocket', createCapturingWs(capturedWs));

    const { messagesStore } = await import('../stores/messages');
    const { tracesStore } = await import('../stores/traces');
    const { permissionsStore } = await import('../stores/permissions');
    const { WsClient } = await import('../ws-client');

    const client = new WsClient();
    client.on('message', (msg) => {
      // Simulate the message router that would be in the app
      if (msg.type === 'block') {
        messagesStore.addBlockMessage(msg as BlockMessage);
      } else if (msg.type === 'tool_stream') {
        messagesStore.addToolStreamMessage(msg as ToolStreamMessage);
        tracesStore.addTrace(msg as ToolStreamMessage);
      } else if (msg.type === 'permission_request') {
        permissionsStore.addPermissionRequest(msg as PermissionRequestMessage);
      }
    });

    client.connect('ws://127.0.0.1:18789');
    await vi.advanceTimersByTimeAsync(0);
    capturedWs[0]!.simulateOpen();

    // Send block message
    capturedWs[0]!.simulateMessage(JSON.stringify(MOCK_BLOCK_MSG));
    let msgs = get(messagesStore);
    expect(msgs.messages['block-1']).toBeDefined();
    expect((msgs.messages['block-1']!.data as { blockType: string }).blockType).toBe('text');

    // Send tool_stream (started)
    capturedWs[0]!.simulateMessage(JSON.stringify(MOCK_TOOL_STARTED));
    let traces = get(tracesStore);
    expect(traces.traces['tc-1']).toBeDefined();
    expect(traces.traces['tc-1']!.status).toBe('started');

    // Send tool_stream (completed)
    capturedWs[0]!.simulateMessage(JSON.stringify(MOCK_TOOL_COMPLETED));
    traces = get(tracesStore);
    expect(traces.traces['tc-1']!.status).toBe('completed');
    expect(traces.traces['tc-1']!.duration).toBe(150);

    // Send permission request
    capturedWs[0]!.simulateMessage(JSON.stringify(MOCK_PERMISSION_REQUEST));
    const perms = get(permissionsStore);
    expect(perms.pendingRequests).toHaveLength(1);
    expect(perms.pendingRequests[0]!.requestId).toBe('perm-1');
  });

  it('outgoing messages flow through WS client send()', async () => {
    const capturedWs: MockWebSocket[] = [];
    vi.stubGlobal('WebSocket', createCapturingWs(capturedWs));

    const { WsClient } = await import('../ws-client');

    const client = new WsClient();
    client.connect('ws://127.0.0.1:18789');
    await vi.advanceTimersByTimeAsync(0);
    capturedWs[0]!.simulateOpen();

    // Send user message
    client.send({ type: 'message', sessionId: 'session-1', content: 'Hello' });
    const sent = JSON.parse(capturedWs[0]!.sentMessages[0]!);
    expect(sent.type).toBe('message');
    expect(sent.content).toBe('Hello');

    // Send permission response (approved)
    client.send({
      type: 'permission_response',
      requestId: 'perm-1',
      decision: 'approved'
    });
    const sent2 = JSON.parse(capturedWs[0]!.sentMessages[1]!);
    expect(sent2.type).toBe('permission_response');
    expect(sent2.decision).toBe('approved');
  });

  it('reconnect state propagates to connectionStore', async () => {
    const capturedWs: MockWebSocket[] = [];
    vi.stubGlobal('WebSocket', createCapturingWs(capturedWs));

    const { connectionStore } = await import('../stores/connection');
    const { WsClient } = await import('../ws-client');

    const client = new WsClient();
    client.on('stateChange', (state) => {
      connectionStore.setState(state);
    });

    client.connect('ws://127.0.0.1:18789');
    await vi.advanceTimersByTimeAsync(0);
    capturedWs[0]!.simulateOpen();
    expect(get(connectionStore).state).toBe('connected');

    // Abnormal close triggers reconnect
    capturedWs[0]!.simulateClose(1006);
    expect(get(connectionStore).state).toBe('reconnecting');

    // After backoff, reconnecting -> connecting
    await vi.advanceTimersByTimeAsync(1000);
    expect(capturedWs.length).toBe(2);
    expect(get(connectionStore).state).toBe('connecting');

    // Reconnect succeeds
    capturedWs[1]!.simulateOpen();
    expect(get(connectionStore).state).toBe('connected');
  });
});

// ========================================================
// Test Suite: Stores -> Derived Values Integration
// ========================================================

describe('Stores -> Derived Values Integration', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('sessionMessages derived store reflects messages store updates', async () => {
    const { messagesStore, sessionMessages } = await import('../stores/messages');

    // Initially empty for any session
    expect(get(sessionMessages('session-1'))).toEqual([]);

    // Add user message
    messagesStore.addUserMessage({
      id: 'msg-u1',
      sessionId: 'session-1',
      type: 'user',
      timestamp: '2026-01-01T00:00:00Z',
      data: { text: 'Hello' }
    });

    let msgs = get(sessionMessages('session-1'));
    expect(msgs).toHaveLength(1);
    expect(msgs[0]!.type).toBe('user');

    // Add block message
    messagesStore.addBlockMessage(MOCK_BLOCK_MSG);
    msgs = get(sessionMessages('session-1'));
    expect(msgs).toHaveLength(2);

    // Add tool stream (started, then completed)
    messagesStore.addToolStreamMessage(MOCK_TOOL_STARTED);
    messagesStore.addToolStreamMessage(MOCK_TOOL_COMPLETED);
    msgs = get(sessionMessages('session-1'));
    expect(msgs).toHaveLength(3); // No duplicate for tool_stream

    // Different session should be independent
    messagesStore.addUserMessage({
      id: 'msg-u2',
      sessionId: 'session-2',
      type: 'user',
      timestamp: '2026-01-01T00:00:05Z',
      data: { text: 'Different session' }
    });

    expect(get(sessionMessages('session-2'))).toHaveLength(1);
    expect(get(sessionMessages('session-1'))).toHaveLength(3);
  });

  it('activeSession derived store reflects sessions store', async () => {
    const { sessionsStore, activeSession } = await import('../stores/sessions');

    // Initially null
    expect(get(activeSession)).toBeNull();

    // Add sessions
    sessionsStore.addSession(MOCK_SESSION_1);
    sessionsStore.addSession(MOCK_SESSION_2);
    expect(get(activeSession)).toBeNull(); // No active set yet

    // Set active
    sessionsStore.setActiveSession('session-1');
    const session = get(activeSession);
    expect(session).not.toBeNull();
    expect(session!.id).toBe('session-1');
    expect(session!.label).toBe('Chat Session');

    // Switch active session
    sessionsStore.setActiveSession('session-2');
    const session2 = get(activeSession);
    expect(session2!.id).toBe('session-2');
    expect(session2!.channel).toBe('cli');

    // Remove active session -> null
    sessionsStore.removeSession('session-2');
    expect(get(activeSession)).toBeNull();
  });

  it('pendingPermissionCount derived store updates correctly', async () => {
    const { permissionsStore, pendingPermissionCount } = await import('../stores/permissions');

    expect(get(pendingPermissionCount)).toBe(0);

    permissionsStore.addPermissionRequest(MOCK_PERMISSION_REQUEST);
    expect(get(pendingPermissionCount)).toBe(1);

    // Add another
    permissionsStore.addPermissionRequest({
      ...MOCK_PERMISSION_REQUEST,
      requestId: 'perm-2',
      toolName: 'shell',
      action: 'exec',
      params: { command: 'rm -rf /tmp/test' },
      riskLevel: 'high'
    });
    expect(get(pendingPermissionCount)).toBe(2);

    // Resolve one
    permissionsStore.resolvePermissionRequest('perm-1', 'approved');
    expect(get(pendingPermissionCount)).toBe(1);

    // Resolve second
    permissionsStore.resolvePermissionRequest('perm-2', 'denied', 'Too dangerous');
    expect(get(pendingPermissionCount)).toBe(0);
  });

  it('sessionTraces derived store filters by session', async () => {
    const { tracesStore, sessionTraces } = await import('../stores/traces');

    expect(get(sessionTraces('session-1'))).toEqual([]);

    // Add trace for session-1
    tracesStore.addTrace(MOCK_TOOL_STARTED);
    tracesStore.addTrace(MOCK_TOOL_COMPLETED);

    // Add trace for session-2
    tracesStore.addTrace({
      ...MOCK_TOOL_STARTED,
      sessionId: 'session-2',
      toolCallId: 'tc-2',
      timestamp: '2026-01-01T00:00:04Z'
    });

    expect(get(sessionTraces('session-1'))).toHaveLength(1);
    expect(get(sessionTraces('session-2'))).toHaveLength(1);

    // Clear session-1 traces
    tracesStore.clearSessionTraces('session-1');
    expect(get(sessionTraces('session-1'))).toEqual([]);
    expect(get(sessionTraces('session-2'))).toHaveLength(1);
  });

  it('hasMore and hasSearched derived stores for memory', async () => {
    const { hasMore, hasSearched } = await import('../stores/memory');

    // Initially
    expect(get(hasMore)).toBe(false); // 0 < 0 is false
    expect(get(hasSearched)).toBe(false);
  });
});

// ========================================================
// Test Suite: Cross-Component Integration
// Sidebar -> Session Switch -> Messages Update
// ========================================================

describe('Cross-Component: Session Switch -> Messages Update', () => {
  beforeEach(async () => {
    vi.resetModules();
    const { resetMessagesStore } = await import('../stores/messages');
    const { resetSessionsStore } = await import('../stores/sessions');
    const { resetTracesStore } = await import('../stores/traces');
    const { resetPermissionsStore } = await import('../stores/permissions');
    resetMessagesStore();
    resetSessionsStore();
    resetTracesStore();
    resetPermissionsStore();
  });

  it('switching sessions changes the messages context', async () => {
    const { sessionsStore, activeSession } = await import('../stores/sessions');
    const { messagesStore, sessionMessages } = await import('../stores/messages');

    // Setup two sessions with different messages
    sessionsStore.addSession(MOCK_SESSION_1);
    sessionsStore.addSession(MOCK_SESSION_2);

    // Add messages to session-1
    messagesStore.addUserMessage({
      id: 'm1',
      sessionId: 'session-1',
      type: 'user',
      timestamp: '2026-01-01T00:00:00Z',
      data: { text: 'Message in session 1' }
    });

    // Add messages to session-2
    messagesStore.addUserMessage({
      id: 'm2',
      sessionId: 'session-2',
      type: 'user',
      timestamp: '2026-01-01T00:00:01Z',
      data: { text: 'Message in session 2' }
    });

    // Active session -> session-1
    sessionsStore.setActiveSession('session-1');
    expect(get(activeSession)!.id).toBe('session-1');
    expect(get(sessionMessages('session-1'))).toHaveLength(1);
    expect(get(sessionMessages('session-2'))).toHaveLength(1);

    // Simulate ChatArea reading from activeSession-derived messages
    const activeSessionId = get(activeSession)!.id;
    const activeMsgs = get(sessionMessages(activeSessionId));
    expect(activeMsgs[0]!.data).toEqual({ text: 'Message in session 1' });

    // Switch to session-2
    sessionsStore.setActiveSession('session-2');
    const newActiveSessionId = get(activeSession)!.id;
    const newActiveMsgs = get(sessionMessages(newActiveSessionId));
    expect(newActiveMsgs[0]!.data).toEqual({ text: 'Message in session 2' });
  });

  it('messages are isolated between sessions', async () => {
    const { messagesStore, sessionMessages } = await import('../stores/messages');

    // Add messages to both sessions
    messagesStore.addUserMessage({
      id: 'iso-1',
      sessionId: 'session-1',
      type: 'user',
      timestamp: '2026-01-01T00:00:00Z',
      data: { text: 'Session 1 message' }
    });

    messagesStore.addBlockMessage(MOCK_BLOCK_MSG); // session-1

    messagesStore.addUserMessage({
      id: 'iso-2',
      sessionId: 'session-2',
      type: 'user',
      timestamp: '2026-01-01T00:00:01Z',
      data: { text: 'Session 2 message' }
    });

    // Clear session-1 should not affect session-2
    messagesStore.clearSessionMessages('session-1');

    expect(get(sessionMessages('session-1'))).toEqual([]);
    expect(get(sessionMessages('session-2'))).toHaveLength(1);
  });

  it('new session creation and selection flow', async () => {
    const { sessionsStore, activeSession } = await import('../stores/sessions');
    const { messagesStore, sessionMessages } = await import('../stores/messages');

    // Create a new session (simulating NewSessionButton click)
    const newSession: Session = {
      id: 'session-new',
      label: 'New Chat',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      messageCount: 0,
      channel: 'dashboard',
      status: 'active'
    };

    sessionsStore.addSession(newSession);
    sessionsStore.setActiveSession('session-new');

    expect(get(activeSession)!.id).toBe('session-new');
    expect(get(activeSession)!.label).toBe('New Chat');

    // Send first message
    messagesStore.addUserMessage({
      id: 'first-msg',
      sessionId: 'session-new',
      type: 'user',
      timestamp: new Date().toISOString(),
      data: { text: 'First message in new session' }
    });

    expect(get(sessionMessages('session-new'))).toHaveLength(1);
  });
});

// ========================================================
// Test Suite: Permission Flow
// request -> store update -> response
// ========================================================

describe('Permission Flow: request -> store -> response', () => {
  beforeEach(async () => {
    vi.resetModules();
    const { resetPermissionsStore } = await import('../stores/permissions');
    resetPermissionsStore();
  });

  it('full permission lifecycle: receive -> approve -> history', async () => {
    const { permissionsStore, pendingPermissionCount } = await import('../stores/permissions');

    // 1. Receive permission request
    permissionsStore.addPermissionRequest(MOCK_PERMISSION_REQUEST);

    let state = get(permissionsStore);
    expect(state.pendingRequests).toHaveLength(1);
    expect(state.pendingRequests[0]!.requestId).toBe('perm-1');
    expect(state.pendingRequests[0]!.toolName).toBe('filesystem');
    expect(state.pendingRequests[0]!.riskLevel).toBe('medium');
    expect(state.history).toHaveLength(0);
    expect(get(pendingPermissionCount)).toBe(1);

    // 2. Approve the request
    permissionsStore.resolvePermissionRequest('perm-1', 'approved');

    state = get(permissionsStore);
    expect(state.pendingRequests).toHaveLength(0);
    expect(state.history).toHaveLength(1);
    expect(state.history[0]!.requestId).toBe('perm-1');
    expect(state.history[0]!.decision).toBe('approved');
    expect(state.history[0]!.resolvedAt).toBeTruthy();
    expect(get(pendingPermissionCount)).toBe(0);
  });

  it('full permission lifecycle: receive -> deny -> history with reason', async () => {
    const { permissionsStore } = await import('../stores/permissions');

    permissionsStore.addPermissionRequest(MOCK_PERMISSION_REQUEST);
    permissionsStore.resolvePermissionRequest('perm-1', 'denied', 'Security concern');

    const state = get(permissionsStore);
    expect(state.pendingRequests).toHaveLength(0);
    expect(state.history).toHaveLength(1);
    expect(state.history[0]!.decision).toBe('denied');
    expect(state.history[0]!.reason).toBe('Security concern');
  });

  it('multiple pending requests queue correctly', async () => {
    const { permissionsStore, pendingPermissionCount } = await import('../stores/permissions');

    // Add 3 requests
    for (let i = 1; i <= 3; i++) {
      permissionsStore.addPermissionRequest({
        ...MOCK_PERMISSION_REQUEST,
        requestId: `perm-${i}`,
        riskLevel: i === 3 ? 'critical' : 'low'
      });
    }

    expect(get(pendingPermissionCount)).toBe(3);

    // Resolve middle one first
    permissionsStore.resolvePermissionRequest('perm-2', 'approved');
    expect(get(permissionsStore).pendingRequests).toHaveLength(2);
    expect(get(permissionsStore).history).toHaveLength(1);

    // Resolve the rest
    permissionsStore.resolvePermissionRequest('perm-1', 'denied');
    permissionsStore.resolvePermissionRequest('perm-3', 'approved');
    expect(get(permissionsStore).pendingRequests).toHaveLength(0);
    expect(get(permissionsStore).history).toHaveLength(3);

    // History should be in reverse chronological order
    expect(get(permissionsStore).history[0]!.requestId).toBe('perm-3');
    expect(get(permissionsStore).history[1]!.requestId).toBe('perm-1');
    expect(get(permissionsStore).history[2]!.requestId).toBe('perm-2');
  });

  it('resolve non-existent request is a no-op', async () => {
    const { permissionsStore } = await import('../stores/permissions');

    permissionsStore.addPermissionRequest(MOCK_PERMISSION_REQUEST);
    permissionsStore.resolvePermissionRequest('non-existent', 'approved');

    expect(get(permissionsStore).pendingRequests).toHaveLength(1);
    expect(get(permissionsStore).history).toHaveLength(0);
  });
});

// ========================================================
// Test Suite: Memory Search Flow
// search -> results -> filters
// ========================================================

describe('Memory Search Flow: search -> results -> filters', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  const mockResults = [
    {
      id: 'mem-1',
      content: 'User prefers dark mode',
      category: 'preference' as const,
      confidence: 0.92,
      tags: ['ui', 'theme'],
      source: 'session-1',
      createdAt: '2026-01-15T10:00:00Z'
    },
    {
      id: 'mem-2',
      content: 'User works at Acme Corp',
      category: 'fact' as const,
      confidence: 0.85,
      tags: ['work'],
      source: 'session-2',
      createdAt: '2026-01-16T10:00:00Z'
    },
    {
      id: 'mem-3',
      content: 'Error: failed to connect to database',
      category: 'error' as const,
      confidence: 0.99,
      tags: ['database'],
      source: 'session-3',
      createdAt: '2026-01-17T10:00:00Z'
    }
  ];

  beforeEach(() => {
    vi.resetModules();
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  it('full search flow: query -> loading -> results', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ results: mockResults, total: 3, page: 1, pageSize: 20 })
    });

    const { memoryStore, searchMemory, hasMore, hasSearched } = await import('../stores/memory');

    // Before search
    expect(get(memoryStore).isSearching).toBe(false);
    expect(get(hasSearched)).toBe(false);

    // Trigger search
    const promise = searchMemory('user preferences');

    // During search
    expect(get(memoryStore).isSearching).toBe(true);
    expect(get(memoryStore).searchQuery).toBe('user preferences');

    await promise;

    // After search
    expect(get(memoryStore).isSearching).toBe(false);
    expect(get(memoryStore).searchResults).toHaveLength(3);
    expect(get(memoryStore).error).toBeNull();
    expect(get(hasSearched)).toBe(true);
    expect(get(hasMore)).toBe(false); // 3 results, total 3

    // Verify API was called correctly
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const calledUrl = fetchMock.mock.calls[0]?.[0] as string;
    expect(calledUrl).toContain('q=user+preferences');
    expect(calledUrl).toContain('page=1');
  });

  it('category filter integration: set filter -> search -> clear filter', async () => {
    // First search: all results
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ results: mockResults, total: 3, page: 1, pageSize: 20 })
    });

    const { memoryStore, searchMemory, setSelectedCategory } = await import('../stores/memory');

    await searchMemory('user');

    // Set category filter
    setSelectedCategory('fact');

    // Second search with filter
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ results: [mockResults[1]], total: 1, page: 1, pageSize: 20 })
    });

    await searchMemory('user');

    // Verify category was sent in request
    const secondUrl = fetchMock.mock.calls[1]?.[0] as string;
    expect(secondUrl).toContain('category=fact');

    // Results should be filtered
    expect(get(memoryStore).searchResults).toHaveLength(1);
    expect(get(memoryStore).searchResults[0]!.category).toBe('fact');

    // Clear filter
    setSelectedCategory(null);
    expect(get(memoryStore).selectedCategory).toBe(null);
  });

  it('error handling and retry flow', async () => {
    fetchMock.mockRejectedValueOnce(new Error('Network error'));

    const { memoryStore, searchMemory, clearError } = await import('../stores/memory');

    await searchMemory('test');

    expect(get(memoryStore).error).toBe('Network error');
    expect(get(memoryStore).isSearching).toBe(false);
    expect(get(memoryStore).searchResults).toEqual([]);

    // Clear error
    clearError();
    expect(get(memoryStore).error).toBeNull();

    // Retry with success
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ results: mockResults.slice(0, 1), total: 1, page: 1, pageSize: 20 })
    });

    await searchMemory('test');

    expect(get(memoryStore).error).toBeNull();
    expect(get(memoryStore).searchResults).toHaveLength(1);
  });

  it('empty query clears results', async () => {
    const { memoryStore, searchMemory } = await import('../stores/memory');

    // First get some results
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ results: mockResults, total: 3, page: 1, pageSize: 20 })
    });
    await searchMemory('test');
    expect(get(memoryStore).searchResults).toHaveLength(3);

    // Empty query should clear
    await searchMemory('');
    expect(get(memoryStore).searchResults).toEqual([]);
    expect(get(memoryStore).searchQuery).toBe('');
    expect(fetchMock).toHaveBeenCalledTimes(1); // No second call for empty query
  });

  it('pagination: search -> load more -> accumulate results', async () => {
    // Initial search with page 1
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ results: mockResults, total: 5, page: 1, pageSize: 3 })
    });

    const { memoryStore, searchMemory, loadMore, hasMore } = await import('../stores/memory');

    await searchMemory('test');
    expect(get(memoryStore).searchResults).toHaveLength(3);
    expect(get(memoryStore).totalFacts).toBe(5);
    expect(get(hasMore)).toBe(true); // 3 < 5

    // Load more
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        results: [
          { id: 'mem-4', content: 'More 1', category: 'knowledge' as const, confidence: 0.7, tags: [], source: 's4', createdAt: '2026-01-18T10:00:00Z' },
          { id: 'mem-5', content: 'More 2', category: 'pattern' as const, confidence: 0.6, tags: [], source: 's5', createdAt: '2026-01-19T10:00:00Z' }
        ],
        total: 5,
        page: 2,
        pageSize: 3
      })
    });

    await loadMore();
    expect(get(memoryStore).searchResults).toHaveLength(5);
    expect(get(hasMore)).toBe(false); // 5 == 5
    expect(fetchMock).toHaveBeenCalledTimes(2);

    // Verify second call has page=2
    const secondUrl = fetchMock.mock.calls[1]?.[0] as string;
    expect(secondUrl).toContain('page=2');
  });

  it('HTTP error response handling', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error'
    });

    const { memoryStore, searchMemory } = await import('../stores/memory');

    await searchMemory('test');

    expect(get(memoryStore).error).toBe('Search failed: 500');
    expect(get(memoryStore).isSearching).toBe(false);
    expect(get(memoryStore).searchResults).toEqual([]);
  });
});

// ========================================================
// Test Suite: Status Panel Flow
// connect -> auto-refresh -> status display
// ========================================================

describe('Status Panel Flow: connect -> auto-refresh -> status display', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.resetModules();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  const MOCK_SYSTEM_INFO: SystemInfo = {
    cpu: { model: 'Intel Core i7', cores: 8, speed: 3600, usage: 45 },
    memory: { total: 16_777_216_000, used: 8_388_608_000, free: 8_388_608_000, usage: 50 },
    disk: { total: 512_000_000_000, used: 256_000_000_000, free: 256_000_000_000, usage: 50 },
    uptime: 90061,
    hostname: 'dev-machine',
    platform: 'linux'
  };

  it('status response updates store and computes health', async () => {
    const { statusStore } = await import('../stores/status');
    const { handleSystemStatus } = await import('../stores/status');

    // Initial state
    expect(get(statusStore).systemInfo).toBeNull();
    expect(get(statusStore).healthStatus).toBe('healthy');

    // Handle status response (simulating WS message)
    handleSystemStatus(MOCK_SYSTEM_INFO as unknown as Record<string, unknown>);

    const state = get(statusStore);
    expect(state.systemInfo).not.toBeNull();
    expect(state.systemInfo!.cpu.usage).toBe(45);
    expect(state.healthStatus).toBe('healthy'); // All < 85
    expect(state.lastUpdated).toBeTruthy();
  });

  it('health computation: healthy, degraded, error', async () => {
    const { statusStore, handleSystemStatus, resetStatusStore } = await import('../stores/status');

    // Healthy: all metrics < 85
    handleSystemStatus({
      ...MOCK_SYSTEM_INFO,
      cpu: { ...MOCK_SYSTEM_INFO.cpu, usage: 50 },
      memory: { ...MOCK_SYSTEM_INFO.memory, usage: 50 },
      disk: { ...MOCK_SYSTEM_INFO.disk, usage: 50 }
    } as unknown as Record<string, unknown>);
    expect(get(statusStore).healthStatus).toBe('healthy');

    resetStatusStore();

    // Degraded: one metric > 85
    handleSystemStatus({
      ...MOCK_SYSTEM_INFO,
      cpu: { ...MOCK_SYSTEM_INFO.cpu, usage: 88 },
      memory: { ...MOCK_SYSTEM_INFO.memory, usage: 50 },
      disk: { ...MOCK_SYSTEM_INFO.disk, usage: 50 }
    } as unknown as Record<string, unknown>);
    expect(get(statusStore).healthStatus).toBe('degraded');

    resetStatusStore();

    // Error: one metric > 95
    handleSystemStatus({
      ...MOCK_SYSTEM_INFO,
      cpu: { ...MOCK_SYSTEM_INFO.cpu, usage: 50 },
      memory: { ...MOCK_SYSTEM_INFO.memory, usage: 96 },
      disk: { ...MOCK_SYSTEM_INFO.disk, usage: 50 }
    } as unknown as Record<string, unknown>);
    expect(get(statusStore).healthStatus).toBe('error');
  });

  it('auto-refresh sends status commands at interval', async () => {
    const { startStatusAutoRefresh, stopStatusAutoRefresh } = await import('../stores/status');
    const { resetStatusStore } = await import('../stores/status');
    resetStatusStore();

    const sentMessages: unknown[] = [];
    const mockSend = (msg: unknown) => sentMessages.push(msg);

    // Start auto-refresh
    startStatusAutoRefresh(mockSend);

    // Immediate fetch
    expect(sentMessages).toHaveLength(1);
    expect((sentMessages[0] as Record<string, unknown>).command).toBe('system_status');

    // After 30s, should send again
    await vi.advanceTimersByTimeAsync(30_000);
    expect(sentMessages).toHaveLength(2);

    // After another 30s
    await vi.advanceTimersByTimeAsync(30_000);
    expect(sentMessages).toHaveLength(3);

    // Stop auto-refresh
    stopStatusAutoRefresh();

    // After another 30s, should NOT send
    await vi.advanceTimersByTimeAsync(30_000);
    expect(sentMessages).toHaveLength(3);
  });

  it('fetchStatus sends command through provided sender', async () => {
    const { refreshStatus } = await import('../stores/status');

    const sentMessages: unknown[] = [];
    const mockSend = (msg: unknown) => sentMessages.push(msg);

    refreshStatus(mockSend);

    expect(sentMessages).toHaveLength(1);
    const msg = sentMessages[0] as Record<string, unknown>;
    expect(msg.type).toBe('command');
    expect(msg.command).toBe('system_status');
    expect(msg.sessionId).toBe('_system');
  });

  it('reset clears all status data', async () => {
    const { statusStore, handleSystemStatus, resetStatusStore } = await import('../stores/status');

    handleSystemStatus(MOCK_SYSTEM_INFO as unknown as Record<string, unknown>);
    expect(get(statusStore).systemInfo).not.toBeNull();

    resetStatusStore();

    expect(get(statusStore).systemInfo).toBeNull();
    expect(get(statusStore).healthStatus).toBe('healthy');
    expect(get(statusStore).lastUpdated).toBeNull();
  });
});

// ========================================================
// Test Suite: Settings Persistence Flow
// update -> save -> load -> restore
// ========================================================

describe('Settings Persistence Flow: update -> save -> load -> restore', () => {
  let localStorageMock: ReturnType<typeof createLocalStorageMock>;

  beforeEach(() => {
    vi.resetModules();
    localStorageMock = createLocalStorageMock();
    vi.stubGlobal('localStorage', localStorageMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('end-to-end: update -> save -> reload -> verify', async () => {
    const { settingsStore } = await import('../stores/settings');

    // Update settings
    settingsStore.update('gatewayUrl', 'ws://test-host:9999');
    settingsStore.update('maxReconnectAttempts', 10);
    settingsStore.update('theme', 'light');
    settingsStore.update('notificationsEnabled', false);

    // Save to localStorage
    settingsStore.save();

    // Verify localStorage contents
    const raw = localStorageMock.getItem('osai-dashboard-settings');
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw!);
    expect(parsed.gatewayUrl).toBe('ws://test-host:9999');
    expect(parsed.maxReconnectAttempts).toBe(10);
    expect(parsed.theme).toBe('light');
    expect(parsed.notificationsEnabled).toBe(false);

    // Modify in-memory store (simulate new page load with different values)
    settingsStore.update('gatewayUrl', 'ws://modified:1234');

    // Load from localStorage
    settingsStore.load();

    // Verify loaded values restored
    let settings = settingsStore.getSnapshot();
    expect(settings.gatewayUrl).toBe('ws://test-host:9999');
    expect(settings.maxReconnectAttempts).toBe(10);
    expect(settings.theme).toBe('light');
    expect(settings.notificationsEnabled).toBe(false);
  });

  it('end-to-end: modify -> reset -> verify defaults persisted', async () => {
    const { settingsStore } = await import('../stores/settings');

    // Modify everything
    settingsStore.update('gatewayUrl', 'ws://before-reset:5678');
    settingsStore.update('reconnectEnabled', false);
    settingsStore.update('maxReconnectAttempts', 99);
    settingsStore.update('theme', 'system');
    settingsStore.update('notificationsEnabled', false);

    // Save
    settingsStore.save();

    // Reset
    settingsStore.reset();

    // Verify store has defaults
    const settings = settingsStore.getSnapshot();
    expect(settings.gatewayUrl).toBe('ws://127.0.0.1:18789');
    expect(settings.reconnectEnabled).toBe(true);
    expect(settings.maxReconnectAttempts).toBe(5);
    expect(settings.theme).toBe('dark');
    expect(settings.notificationsEnabled).toBe(true);

    // Verify localStorage also has defaults
    const raw = localStorageMock.getItem('osai-dashboard-settings');
    const parsed = JSON.parse(raw!);
    expect(parsed.gatewayUrl).toBe('ws://127.0.0.1:18789');
    expect(parsed.reconnectEnabled).toBe(true);
  });

  it('load handles corrupted localStorage gracefully', async () => {
    // Put invalid JSON in localStorage
    localStorageMock.setItem('osai-dashboard-settings', 'not-valid-json{');

    const { settingsStore } = await import('../stores/settings');

    // Load should fall back to defaults
    settingsStore.load();

    const settings = settingsStore.getSnapshot();
    expect(settings.gatewayUrl).toBe('ws://127.0.0.1:18789');
  });

  it('load handles partial settings (missing fields) with defaults', async () => {
    // Save partial settings
    localStorageMock.setItem('osai-dashboard-settings', JSON.stringify({
      gatewayUrl: 'ws://partial:1234'
      // missing other fields
    }));

    const { settingsStore } = await import('../stores/settings');

    settingsStore.load();

    const settings = settingsStore.getSnapshot();
    expect(settings.gatewayUrl).toBe('ws://partial:1234');
    // Missing fields should use defaults
    expect(settings.reconnectEnabled).toBe(true);
    expect(settings.maxReconnectAttempts).toBe(5);
    expect(settings.theme).toBe('dark');
    expect(settings.notificationsEnabled).toBe(true);
  });

  it('load handles invalid field values with defaults', async () => {
    localStorageMock.setItem('osai-dashboard-settings', JSON.stringify({
      gatewayUrl: 'ws://ok:1234',
      maxReconnectAttempts: 'not-a-number' as unknown as number,
      theme: 'invalid-theme',
      reconnectEnabled: 'true' as unknown as boolean
    }));

    const { settingsStore } = await import('../stores/settings');

    settingsStore.load();

    const settings = settingsStore.getSnapshot();
    expect(settings.gatewayUrl).toBe('ws://ok:1234');
    // Invalid values should fall back to defaults
    expect(settings.maxReconnectAttempts).toBe(5);
    expect(settings.theme).toBe('dark');
    expect(settings.reconnectEnabled).toBe(true);
  });

  it('getSnapshot returns current state without subscription', async () => {
    const { settingsStore } = await import('../stores/settings');

    settingsStore.update('gatewayUrl', 'ws://snapshot-test:8080');

    const snapshot = settingsStore.getSnapshot();
    expect(snapshot.gatewayUrl).toBe('ws://snapshot-test:8080');
  });
});

// ========================================================
// Test Suite: Traces + Messages Integration
// ========================================================

describe('Traces + Messages Integration', () => {
  beforeEach(async () => {
    vi.resetModules();
    const { resetMessagesStore } = await import('../stores/messages');
    const { resetTracesStore } = await import('../stores/traces');
    resetMessagesStore();
    resetTracesStore();
  });

  it('tool_stream message updates both messages and traces stores', async () => {
    const { messagesStore, sessionMessages } = await import('../stores/messages');
    const { tracesStore, sessionTraces } = await import('../stores/traces');

    // Started
    messagesStore.addToolStreamMessage(MOCK_TOOL_STARTED);
    tracesStore.addTrace(MOCK_TOOL_STARTED);

    expect(get(sessionMessages('session-1'))).toHaveLength(1);
    expect(get(sessionTraces('session-1'))).toHaveLength(1);
    expect(get(tracesStore).traces['tc-1']!.status).toBe('started');

    // Completed
    messagesStore.addToolStreamMessage(MOCK_TOOL_COMPLETED);
    tracesStore.addTrace(MOCK_TOOL_COMPLETED);

    // Messages: no duplicate (same toolCallId)
    expect(get(sessionMessages('session-1'))).toHaveLength(1);
    expect((get(sessionMessages('session-1'))[0]!.data as { status: string }).status).toBe('completed');

    // Traces: updated (same toolCallId)
    expect(get(sessionTraces('session-1'))).toHaveLength(1);
    expect(get(tracesStore).traces['tc-1']!.status).toBe('completed');
    expect(get(tracesStore).traces['tc-1']!.duration).toBe(150);
  });

  it('token usage updates on traces store', async () => {
    const { tracesStore } = await import('../stores/traces');

    tracesStore.addTrace(MOCK_TOOL_STARTED);
    tracesStore.addTrace(MOCK_TOOL_COMPLETED);

    expect(get(tracesStore).traces['tc-1']!.tokenUsage).toBeNull();

    // Update tokens
    tracesStore.updateTraceTokens('tc-1', {
      inputTokens: 1500,
      outputTokens: 320
    });

    expect(get(tracesStore).traces['tc-1']!.tokenUsage).toEqual({
      inputTokens: 1500,
      outputTokens: 320
    });

    // Update on non-existent trace is a no-op
    tracesStore.updateTraceTokens('non-existent', {
      inputTokens: 100,
      outputTokens: 200
    });

    // Should not create a new trace
    expect(get(tracesStore).traces['non-existent']).toBeUndefined();
  });

  it('computeTokenSummary from trace-utils aggregates correctly', async () => {
    const { tracesStore } = await import('../stores/traces');
    const { sessionTraces } = await import('../stores/traces');
    const { computeTokenSummary } = await import('../components/traces/trace-utils');

    // Add multiple traces
    tracesStore.addTrace({
      type: 'tool_stream',
      sessionId: 'session-1',
      toolCallId: 'tc-sum-1',
      toolName: 'shell',
      status: 'completed',
      data: {},
      duration: 200,
      timestamp: '2026-01-01T00:00:00Z'
    });
    tracesStore.updateTraceTokens('tc-sum-1', { inputTokens: 1000, outputTokens: 500 });

    tracesStore.addTrace({
      type: 'tool_stream',
      sessionId: 'session-1',
      toolCallId: 'tc-sum-2',
      toolName: 'filesystem',
      status: 'completed',
      data: {},
      duration: 100,
      timestamp: '2026-01-01T00:00:01Z'
    });
    tracesStore.updateTraceTokens('tc-sum-2', { inputTokens: 500, outputTokens: 200 });

    tracesStore.addTrace({
      type: 'tool_stream',
      sessionId: 'session-1',
      toolCallId: 'tc-err-1',
      toolName: 'browser',
      status: 'error',
      data: {},
      duration: 5000,
      timestamp: '2026-01-01T00:00:02Z'
    });

    const traces = get(sessionTraces('session-1'));
    const summary = computeTokenSummary(traces);

    expect(summary.inputTokens).toBe(1500);
    expect(summary.outputTokens).toBe(700);
    expect(summary.totalTokens).toBe(2200);
    expect(summary.traceCount).toBe(3);
    expect(summary.errorCount).toBe(1);
    expect(summary.totalDuration).toBe(5300);
    expect(summary.estimatedCost).toBeGreaterThan(0);
  });
});

// ========================================================
// Test Suite: Chat Utils Integration
// ========================================================

describe('Chat Utils Integration', () => {
  it('generateMessageId produces unique IDs', async () => {
    const { generateMessageId } = await import('../components/chat-utils');

    const id1 = generateMessageId();
    const id2 = generateMessageId();

    expect(id1).toBeTruthy();
    expect(id2).toBeTruthy();
    expect(id1).not.toBe(id2);
    expect(id1).toMatch(/^msg-/);
  });

  it('formatTimestamp produces correct format', async () => {
    const { formatTimestamp } = await import('../components/chat-utils');

    // Today's timestamp
    const today = new Date();
    today.setHours(14, 30, 0, 0);
    const formatted = formatTimestamp(today.toISOString());
    expect(formatted).toContain('14:30');

    // Old timestamp (different day)
    const old = new Date('2026-01-15T10:30:00Z');
    const oldFormatted = formatTimestamp(old.toISOString());
    expect(oldFormatted).toContain('Jan');
    expect(oldFormatted).toContain('15');
  });
});

// ========================================================
// Test Suite: Render Markdown Integration
// ========================================================

describe('Render Markdown Integration', () => {
  it('renders basic markdown to HTML', async () => {
    const { renderMarkdown } = await import('../components/render-markdown');

    const html = renderMarkdown('**bold** and *italic*');
    expect(html).toContain('<strong>bold</strong>');
    expect(html).toContain('<em>italic</em>');
  });

  it('renders code blocks', async () => {
    const { renderMarkdown } = await import('../components/render-markdown');

    const html = renderMarkdown('```js\nconsole.log("hello");\n```');
    expect(html).toContain('<code');
    expect(html).toContain('console.log');
  });

  it('renders links safely', async () => {
    const { renderMarkdown } = await import('../components/render-markdown');

    const html = renderMarkdown('[click here](https://example.com)');
    expect(html).toContain('href="https://example.com"');
    expect(html).toContain('click here');
  });
});

// ========================================================
// Test Suite: Barrel Exports Integration
// ========================================================

describe('Barrel Exports Integration', () => {
  it('stores/index.ts exports all stores and actions', async () => {
    const stores = await import('../stores/index');

    // Connection
    expect(stores.connectionStore).toBeDefined();
    expect(stores.setConnectionUrl).toBeDefined();
    expect(stores.resetConnectionStore).toBeDefined();

    // Sessions
    expect(stores.sessionsStore).toBeDefined();
    expect(stores.activeSession).toBeDefined();
    expect(stores.setActiveSession).toBeDefined();
    expect(stores.resetSessionsStore).toBeDefined();

    // Messages
    expect(stores.messagesStore).toBeDefined();
    expect(stores.sessionMessages).toBeDefined();
    expect(stores.addUserMessage).toBeDefined();
    expect(stores.resetMessagesStore).toBeDefined();

    // Permissions
    expect(stores.permissionsStore).toBeDefined();
    expect(stores.pendingPermissionCount).toBeDefined();
    expect(stores.addPermissionRequest).toBeDefined();
    expect(stores.resolvePermissionRequest).toBeDefined();
    expect(stores.resetPermissionsStore).toBeDefined();

    // Traces
    expect(stores.tracesStore).toBeDefined();
    expect(stores.sessionTraces).toBeDefined();
    expect(stores.addTrace).toBeDefined();
    expect(stores.resetTracesStore).toBeDefined();

    // Status
    expect(stores.statusStore).toBeDefined();
    expect(stores.refreshStatus).toBeDefined();
    expect(stores.handleSystemStatus).toBeDefined();
    expect(stores.startStatusAutoRefresh).toBeDefined();
    expect(stores.stopStatusAutoRefresh).toBeDefined();
    expect(stores.resetStatusStore).toBeDefined();

    // Settings
    expect(stores.settingsStore).toBeDefined();
    expect(stores.updateSetting).toBeDefined();
    expect(stores.saveSettings).toBeDefined();
    expect(stores.loadSettings).toBeDefined();
    expect(stores.resetSettings).toBeDefined();

    // Memory
    expect(stores.memoryStore).toBeDefined();
    expect(stores.hasMore).toBeDefined();
    expect(stores.hasSearched).toBeDefined();
    expect(stores.searchMemory).toBeDefined();
    expect(stores.loadMore).toBeDefined();
    expect(stores.resetMemoryStore).toBeDefined();
  });

  it('components/index.ts exports all components', async () => {
    const components = await import('../components/index');

    // Core components
    expect(components.ChatArea).toBeDefined();
    expect(components.ChatInput).toBeDefined();
    expect(components.ChatMessage).toBeDefined();
    expect(components.PermissionList).toBeDefined();
    expect(components.PermissionPrompt).toBeDefined();
    expect(components.RiskBadge).toBeDefined();

    // Settings components
    expect(components.SettingsPage).toBeDefined();
    expect(components.SettingSection).toBeDefined();
    expect(components.SettingToggle).toBeDefined();
    expect(components.SettingInput).toBeDefined();
    expect(components.SettingSelect).toBeDefined();

    // Sidebar components
    expect(components.Sidebar).toBeDefined();
    expect(components.SessionList).toBeDefined();
    expect(components.SessionItem).toBeDefined();
    expect(components.NewSessionButton).toBeDefined();
    expect(components.SidebarNav).toBeDefined();

    // Status components
    expect(components.SystemStatus).toBeDefined();
    expect(components.StatusCard).toBeDefined();
    expect(components.HealthIndicator).toBeDefined();

    // Memory components
    expect(components.MemorySearch).toBeDefined();
    expect(components.MemoryResult).toBeDefined();
    expect(components.MemoryFilters).toBeDefined();

    // Trace components
    expect(components.TraceList).toBeDefined();
    expect(components.TraceEntry).toBeDefined();
    expect(components.TraceTimeline).toBeDefined();
    expect(components.TokenUsage).toBeDefined();
  });
});

// ========================================================
// Test Suite: Cross-Store Reset Integration
// ========================================================

describe('Cross-Store Reset Integration', () => {
  it('all stores can be reset independently', async () => {
    vi.resetModules();

    const {
      resetConnectionStore,
      resetSessionsStore,
      resetMessagesStore,
      resetPermissionsStore,
      resetTracesStore,
      resetStatusStore,
      resetMemoryStore,
      connectionStore,
      sessionsStore,
      messagesStore,
      permissionsStore,
      tracesStore,
      statusStore,
      memoryStore
    } = await import('../stores/index');

    // Populate all stores
    connectionStore.setState('connected');
    connectionStore.setConnectionUrl('ws://test:1234');
    sessionsStore.addSession(MOCK_SESSION_1);
    messagesStore.addUserMessage({
      id: 'reset-test',
      sessionId: 'session-1',
      type: 'user',
      timestamp: '2026-01-01T00:00:00Z',
      data: { text: 'test' }
    });
    permissionsStore.addPermissionRequest(MOCK_PERMISSION_REQUEST);
    tracesStore.addTrace(MOCK_TOOL_STARTED);

    // Reset all
    resetConnectionStore();
    resetSessionsStore();
    resetMessagesStore();
    resetPermissionsStore();
    resetTracesStore();
    resetStatusStore();
    resetMemoryStore();

    // Verify all are clean
    expect(get(connectionStore).state).toBe('disconnected');
    expect(get(connectionStore).url).toBe('');
    expect(get(sessionsStore).sessions).toEqual([]);
    expect(get(sessionsStore).activeSessionId).toBeNull();
    expect(get(messagesStore).messages).toEqual({});
    expect(get(messagesStore).messagesBySession).toEqual({});
    expect(get(permissionsStore).pendingRequests).toEqual([]);
    expect(get(permissionsStore).history).toEqual([]);
    expect(get(tracesStore).traces).toEqual({});
    expect(get(tracesStore).tracesBySession).toEqual({});
    expect(get(statusStore).systemInfo).toBeNull();
    expect(get(memoryStore).searchQuery).toBe('');
    expect(get(memoryStore).searchResults).toEqual([]);
  });
});
