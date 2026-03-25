/**
 * T-007 System Status Panel: Status store tests.
 *
 * Tests for the status store: initial state, handleStatusResponse,
 * auto-refresh lifecycle, and reset.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { get } from 'svelte/store';
import { statusStore, resetStatusStore } from '../status';

function makeSystemInfo() {
  return {
    cpu: { model: 'Test CPU', cores: 8, speed: 3600, usage: 45 },
    memory: { total: 16388608000, used: 8194304000, free: 8194304000, usage: 50 },
    disk: { total: 500000000000, used: 100000000000, free: 400000000000, usage: 20 },
    uptime: 90061,
    hostname: 'test-host',
    platform: 'linux'
  };
}

describe('statusStore', () => {
  beforeEach(() => {
    resetStatusStore();
    vi.useFakeTimers();
  });

  afterEach(() => {
    resetStatusStore();
    vi.useRealTimers();
  });

  it('has correct initial state', () => {
    const state = get(statusStore);
    expect(state.systemInfo).toBeNull();
    expect(state.healthStatus).toBe('healthy');
    expect(state.lastUpdated).toBeNull();
  });

  it('updates systemInfo on handleStatusResponse', () => {
    const info = makeSystemInfo();
    statusStore.handleStatusResponse(info as unknown as Record<string, unknown>);

    const state = get(statusStore);
    expect(state.systemInfo).not.toBeNull();
    expect(state.systemInfo!.hostname).toBe('test-host');
    expect(state.systemInfo!.platform).toBe('linux');
    expect(state.systemInfo!.cpu.cores).toBe(8);
    expect(state.systemInfo!.cpu.usage).toBe(45);
  });

  it('computes health status on handleStatusResponse', () => {
    const info = makeSystemInfo();
    statusStore.handleStatusResponse(info as unknown as Record<string, unknown>);

    const state = get(statusStore);
    // All metrics are well below thresholds, should be healthy
    expect(state.healthStatus).toBe('healthy');
  });

  it('computes degraded health when usage is high', () => {
    const info = makeSystemInfo();
    info.cpu.usage = 87;
    statusStore.handleStatusResponse(info as unknown as Record<string, unknown>);

    const state = get(statusStore);
    expect(state.healthStatus).toBe('degraded');
  });

  it('computes error health when usage is critical', () => {
    const info = makeSystemInfo();
    info.disk.usage = 96;
    statusStore.handleStatusResponse(info as unknown as Record<string, unknown>);

    const state = get(statusStore);
    expect(state.healthStatus).toBe('error');
  });

  it('sets lastUpdated on handleStatusResponse', () => {
    const before = new Date().toISOString();
    const info = makeSystemInfo();
    statusStore.handleStatusResponse(info as unknown as Record<string, unknown>);
    const after = new Date().toISOString();

    const state = get(statusStore);
    expect(state.lastUpdated).not.toBeNull();
    expect(state.lastUpdated! >= before).toBe(true);
    expect(state.lastUpdated! <= after).toBe(true);
  });

  it('fetchStatus sends command message via wsSend', () => {
    const wsSend = vi.fn();
    statusStore.fetchStatus(wsSend);

    expect(wsSend).toHaveBeenCalledOnce();
    expect(wsSend).toHaveBeenCalledWith({
      type: 'command',
      sessionId: '_system',
      command: 'system_status'
    });
  });

  it('startAutoRefresh calls fetchStatus immediately and then on interval', () => {
    const wsSend = vi.fn();
    statusStore.startAutoRefresh(wsSend);

    // Immediate call
    expect(wsSend).toHaveBeenCalledTimes(1);

    // After 30 seconds, second call
    vi.advanceTimersByTime(30_000);
    expect(wsSend).toHaveBeenCalledTimes(2);

    // After 60 seconds, third call
    vi.advanceTimersByTime(30_000);
    expect(wsSend).toHaveBeenCalledTimes(3);
  });

  it('stopAutoRefresh stops the interval', () => {
    const wsSend = vi.fn();
    statusStore.startAutoRefresh(wsSend);
    statusStore.stopAutoRefresh();

    // Immediate call was made
    expect(wsSend).toHaveBeenCalledTimes(1);

    // After 30 seconds, no more calls
    vi.advanceTimersByTime(60_000);
    expect(wsSend).toHaveBeenCalledTimes(1);
  });

  it('startAutoRefresh clears previous interval if called twice', () => {
    const wsSend1 = vi.fn();
    const wsSend2 = vi.fn();

    statusStore.startAutoRefresh(wsSend1);
    statusStore.startAutoRefresh(wsSend2);

    // Only the second start's immediate call
    expect(wsSend1).toHaveBeenCalledTimes(1);
    expect(wsSend2).toHaveBeenCalledTimes(1);

    // After 30 seconds, only wsSend2 should be called again
    vi.advanceTimersByTime(30_000);
    expect(wsSend1).toHaveBeenCalledTimes(1);
    expect(wsSend2).toHaveBeenCalledTimes(2);
  });

  it('reset clears state and stops auto-refresh', () => {
    const wsSend = vi.fn();
    statusStore.startAutoRefresh(wsSend);

    const info = makeSystemInfo();
    statusStore.handleStatusResponse(info as unknown as Record<string, unknown>);

    // Verify data is set
    expect(get(statusStore).systemInfo).not.toBeNull();

    // Reset
    resetStatusStore();

    const state = get(statusStore);
    expect(state.systemInfo).toBeNull();
    expect(state.healthStatus).toBe('healthy');
    expect(state.lastUpdated).toBeNull();

    // Auto-refresh should be stopped
    vi.advanceTimersByTime(60_000);
    expect(wsSend).toHaveBeenCalledTimes(1); // only the initial call
  });

  it('updates lastUpdated on subsequent handleStatusResponse calls', async () => {
    const info = makeSystemInfo();
    statusStore.handleStatusResponse(info as unknown as Record<string, unknown>);

    const firstUpdated = get(statusStore).lastUpdated;

    // Advance time slightly
    vi.advanceTimersByTime(1000);

    statusStore.handleStatusResponse(info as unknown as Record<string, unknown>);

    const secondUpdated = get(statusStore).lastUpdated;

    expect(secondUpdated).not.toBeNull();
    expect(secondUpdated! > firstUpdated!).toBe(true);
  });
});
