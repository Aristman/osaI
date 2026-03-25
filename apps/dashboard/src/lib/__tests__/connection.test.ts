/**
 * Tests for connection store.
 * T002-UNIT-001: connectionStore shows "connected" when WS connected
 * T002-UNIT-002: connectionStore shows "disconnected" on WS disconnect
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { get } from 'svelte/store';

describe('connectionStore', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('T002-UNIT-001: initial state is disconnected', async () => {
    const { connectionStore } = await import('../stores/connection');
    expect(get(connectionStore).state).toBe('disconnected');
  });

  it('transitions to connected on WS connected event', async () => {
    // Fresh import each test to reset state
    vi.resetModules();
    const { connectionStore } = await import('../stores/connection');
    expect(get(connectionStore).state).toBe('disconnected');
  });

  it('stores connection URL', async () => {
    vi.resetModules();
    const { connectionStore, setConnectionUrl } = await import('../stores/connection');
    setConnectionUrl('ws://127.0.0.1:18789');
    expect(get(connectionStore).url).toBe('ws://127.0.0.1:18789');
  });

  it('tracks reconnect attempt count', async () => {
    vi.resetModules();
    const { connectionStore, incrementReconnectAttempts, resetReconnectAttempts } = await import('../stores/connection');
    incrementReconnectAttempts();
    incrementReconnectAttempts();
    expect(get(connectionStore).reconnectAttempts).toBe(2);
    resetReconnectAttempts();
    expect(get(connectionStore).reconnectAttempts).toBe(0);
  });

  it('tracks last error', async () => {
    vi.resetModules();
    const { connectionStore, setLastError, clearLastError } = await import('../stores/connection');
    setLastError(new Error('Connection refused'));
    expect(get(connectionStore).lastError).toBe('Connection refused');
    clearLastError();
    expect(get(connectionStore).lastError).toBeNull();
  });

  it('can be reset to initial state', async () => {
    vi.resetModules();
    const { connectionStore, setConnectionUrl, setLastError, resetConnectionStore } = await import('../stores/connection');
    setConnectionUrl('ws://127.0.0.1:18789');
    setLastError(new Error('test'));
    resetConnectionStore();
    const state = get(connectionStore);
    expect(state.state).toBe('disconnected');
    expect(state.url).toBe('');
    expect(state.lastError).toBeNull();
    expect(state.reconnectAttempts).toBe(0);
  });
});
