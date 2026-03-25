/**
 * Settings store for Dashboard configuration.
 * Persists all settings to localStorage.
 */
import { writable, get } from 'svelte/store';

export type ThemeOption = 'dark' | 'light' | 'system';

export interface AppSettings {
  /** Gateway WebSocket URL */
  gatewayUrl: string;
  /** Whether auto-reconnect is enabled */
  reconnectEnabled: boolean;
  /** Maximum number of reconnect attempts */
  maxReconnectAttempts: number;
  /** UI theme: dark, light, or system */
  theme: ThemeOption;
  /** Whether desktop notifications are enabled */
  notificationsEnabled: boolean;
}

const STORAGE_KEY = 'osai-dashboard-settings';

const DEFAULT_SETTINGS: AppSettings = {
  gatewayUrl: 'ws://127.0.0.1:18789',
  reconnectEnabled: true,
  maxReconnectAttempts: 5,
  theme: 'dark',
  notificationsEnabled: true
};

function loadFromStorage(): AppSettings {
  if (typeof localStorage === 'undefined') {
    return { ...DEFAULT_SETTINGS };
  }

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return { ...DEFAULT_SETTINGS };
    }
    const parsed = JSON.parse(raw) as Partial<AppSettings>;
    return {
      gatewayUrl: typeof parsed.gatewayUrl === 'string' ? parsed.gatewayUrl : DEFAULT_SETTINGS.gatewayUrl,
      reconnectEnabled: typeof parsed.reconnectEnabled === 'boolean' ? parsed.reconnectEnabled : DEFAULT_SETTINGS.reconnectEnabled,
      maxReconnectAttempts: typeof parsed.maxReconnectAttempts === 'number' ? parsed.maxReconnectAttempts : DEFAULT_SETTINGS.maxReconnectAttempts,
      theme: parsed.theme === 'dark' || parsed.theme === 'light' || parsed.theme === 'system' ? parsed.theme : DEFAULT_SETTINGS.theme,
      notificationsEnabled: typeof parsed.notificationsEnabled === 'boolean' ? parsed.notificationsEnabled : DEFAULT_SETTINGS.notificationsEnabled
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function createSettingsStore() {
  const { subscribe, set, update } = writable<AppSettings>(loadFromStorage());

  return {
    subscribe,
    set,

    /**
     * Save current settings to localStorage.
     */
    save(): void {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(get(this)));
    },

    /**
     * Load settings from localStorage and update store.
     */
    load(): void {
      set(loadFromStorage());
    },

    /**
     * Update a single setting by key.
     * @param key - The setting key to update
     * @param value - The new value
     */
    update<K extends keyof AppSettings>(key: K, value: AppSettings[K]): void {
      update((s) => {
        const updated = { ...s, [key]: value };
        return updated;
      });
    },

    /**
     * Reset all settings to defaults and persist.
     */
    reset(): void {
      set({ ...DEFAULT_SETTINGS });
      localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_SETTINGS));
    },

    /**
     * Get the current settings snapshot (non-reactive).
     */
    getSnapshot(): AppSettings {
      return get(this);
    }
  };
}

export const settingsStore = createSettingsStore();

// Convenience exports
export const updateSetting = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) =>
  settingsStore.update(key, value);
export const saveSettings = () => settingsStore.save();
export const loadSettings = () => settingsStore.load();
export const resetSettings = () => settingsStore.reset();
