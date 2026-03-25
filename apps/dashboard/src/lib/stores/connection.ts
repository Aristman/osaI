/**
 * Connection store for WebSocket connection state.
 */
import { writable } from 'svelte/store';
import type { ConnectionState } from '../types';

export interface ConnectionStateData {
  state: ConnectionState;
  url: string;
  reconnectAttempts: number;
  lastError: string | null;
  connectedAt: string | null;
}

const initialState: ConnectionStateData = {
  state: 'disconnected',
  url: '',
  reconnectAttempts: 0,
  lastError: null,
  connectedAt: null
};

function createConnectionStore() {
  const { subscribe, set, update } = writable<ConnectionStateData>({ ...initialState });

  return {
    subscribe,
    set,

    setState(state: ConnectionState): void {
      update((s) => {
        const changes: Partial<ConnectionStateData> = { state };
        if (state === 'connected') {
          changes.connectedAt = new Date().toISOString();
          changes.lastError = null;
        }
        return { ...s, ...changes };
      });
    },

    setConnectionUrl(url: string): void {
      update((s) => ({ ...s, url }));
    },

    incrementReconnectAttempts(): void {
      update((s) => ({
        ...s,
        reconnectAttempts: s.reconnectAttempts + 1
      }));
    },

    resetReconnectAttempts(): void {
      update((s) => ({ ...s, reconnectAttempts: 0 }));
    },

    setLastError(error: Error | string): void {
      update((s) => ({
        ...s,
        lastError: typeof error === 'string' ? error : error.message
      }));
    },

    clearLastError(): void {
      update((s) => ({ ...s, lastError: null }));
    },

    reset(): void {
      set({ ...initialState });
    }
  };
}

export const connectionStore = createConnectionStore();

// Action helpers (re-exported as standalone functions for convenience)
export const setConnectionUrl = (url: string) => connectionStore.setConnectionUrl(url);
export const incrementReconnectAttempts = () => connectionStore.incrementReconnectAttempts();
export const resetReconnectAttempts = () => connectionStore.resetReconnectAttempts();
export const setLastError = (error: Error | string) => connectionStore.setLastError(error);
export const clearLastError = () => connectionStore.clearLastError();
export const resetConnectionStore = () => connectionStore.reset();
