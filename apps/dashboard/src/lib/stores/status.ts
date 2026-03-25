/**
 * Status store for system status data.
 *
 * Manages system metrics (CPU, memory, disk, uptime, etc.),
 * health status, and auto-refresh logic.
 */
import { writable } from 'svelte/store';
import type {
  SystemInfo,
  HealthStatus,
  SystemStatusData
} from '../components/status/status-utils';
import { computeHealthStatus } from '../components/status/status-utils';

export type { SystemInfo, HealthStatus, SystemStatusData };

const REFRESH_INTERVAL_MS = 30_000; // 30 seconds

const initialState: SystemStatusData = {
  systemInfo: null,
  healthStatus: 'healthy',
  lastUpdated: null
};

function createStatusStore() {
  const { subscribe, set, update } = writable<SystemStatusData>({ ...initialState });
  let refreshTimer: ReturnType<typeof setInterval> | null = null;

  /**
   * Fetch system status data via WebSocket command.
   * Sends a 'command' message with command='system_status' to the gateway.
   */
  async function fetchStatus(wsSend: (msg: unknown) => void): Promise<void> {
    try {
      wsSend({
        type: 'command',
        sessionId: '_system',
        command: 'system_status'
      });
    } catch {
      // Silently handle - status will be updated when response arrives
    }
  }

  /**
   * Handle incoming status response from the gateway.
   * Updates systemInfo, computes health, and sets lastUpdated.
   */
  function handleStatusResponse(data: Record<string, unknown>): void {
    const systemInfo = data as unknown as SystemInfo;
    const healthStatus = computeHealthStatus(systemInfo);

    update((state) => ({
      ...state,
      systemInfo,
      healthStatus,
      lastUpdated: new Date().toISOString()
    }));
  }

  /**
   * Start auto-refresh at the configured interval.
   */
  function startAutoRefresh(wsSend: (msg: unknown) => void): void {
    stopAutoRefresh();
    fetchStatus(wsSend);
    refreshTimer = setInterval(() => {
      fetchStatus(wsSend);
    }, REFRESH_INTERVAL_MS);
  }

  /**
   * Stop auto-refresh.
   */
  function stopAutoRefresh(): void {
    if (refreshTimer !== null) {
      clearInterval(refreshTimer);
      refreshTimer = null;
    }
  }

  /**
   * Reset store to initial state and stop auto-refresh.
   */
  function reset(): void {
    stopAutoRefresh();
    set({ ...initialState });
  }

  return {
    subscribe,
    set,
    update,
    fetchStatus,
    handleStatusResponse,
    startAutoRefresh,
    stopAutoRefresh,
    reset
  };
}

export const statusStore = createStatusStore();

// Standalone action helpers
export const refreshStatus = (wsSend: (msg: unknown) => void) =>
  statusStore.fetchStatus(wsSend);

export const handleSystemStatus = (data: Record<string, unknown>) =>
  statusStore.handleStatusResponse(data);

export const startStatusAutoRefresh = (wsSend: (msg: unknown) => void) =>
  statusStore.startAutoRefresh(wsSend);

export const stopStatusAutoRefresh = () => statusStore.stopAutoRefresh();

export const resetStatusStore = () => statusStore.reset();
