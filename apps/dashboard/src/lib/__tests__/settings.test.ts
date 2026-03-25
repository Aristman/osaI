/**
 * Tests for settings store.
 * Task T-008: Settings Page
 *
 * Test IDs:
 * - T008-UNIT-001: Settings load from LocalStorage
 * - T008-UNIT-002: Save persists to LocalStorage
 * - T008-UNIT-003: Reset restores defaults
 * - Validation tests
 * - Integration: update key/value
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
    get _store() {
      return store;
    }
  };
})();

vi.stubGlobal('localStorage', localStorageMock);

describe('settings store', () => {
  beforeEach(() => {
    localStorageMock.clear();
    // Re-import store to reset state between tests
    vi.resetModules();
  });

  describe('T008-UNIT-001: Settings load from LocalStorage', () => {
    it('loads default settings when localStorage is empty', async () => {
      const { settingsStore } = await import('../stores/settings');
      let settings: import('../stores/settings').AppSettings | undefined;
      const unsub = settingsStore.subscribe((s) => {
        settings = s;
      });
      unsub();

      expect(settings).toBeDefined();
      expect(settings!.gatewayUrl).toBe('ws://127.0.0.1:18789');
      expect(settings!.reconnectEnabled).toBe(true);
      expect(settings!.maxReconnectAttempts).toBe(5);
      expect(settings!.theme).toBe('dark');
      expect(settings!.notificationsEnabled).toBe(true);
    });

    it('loads saved settings from localStorage', async () => {
      localStorageMock.setItem('osai-dashboard-settings', JSON.stringify({
        gatewayUrl: 'ws://192.168.1.1:8080',
        reconnectEnabled: false,
        maxReconnectAttempts: 10,
        theme: 'light',
        notificationsEnabled: false
      }));

      const { settingsStore } = await import('../stores/settings');
      let settings: import('../stores/settings').AppSettings | undefined;
      const unsub = settingsStore.subscribe((s) => {
        settings = s;
      });
      unsub();

      expect(settings!.gatewayUrl).toBe('ws://192.168.1.1:8080');
      expect(settings!.reconnectEnabled).toBe(false);
      expect(settings!.maxReconnectAttempts).toBe(10);
      expect(settings!.theme).toBe('light');
      expect(settings!.notificationsEnabled).toBe(false);
    });

    it('handles corrupted localStorage data gracefully', async () => {
      localStorageMock.setItem('osai-dashboard-settings', 'not-valid-json');

      const { settingsStore } = await import('../stores/settings');
      let settings: import('../stores/settings').AppSettings | undefined;
      const unsub = settingsStore.subscribe((s) => {
        settings = s;
      });
      unsub();

      expect(settings!.gatewayUrl).toBe('ws://127.0.0.1:18789');
      expect(settings!.reconnectEnabled).toBe(true);
    });

    it('handles partial settings data with defaults for missing fields', async () => {
      localStorageMock.setItem('osai-dashboard-settings', JSON.stringify({
        gatewayUrl: 'ws://custom:9999'
      }));

      const { settingsStore } = await import('../stores/settings');
      let settings: import('../stores/settings').AppSettings | undefined;
      const unsub = settingsStore.subscribe((s) => {
        settings = s;
      });
      unsub();

      expect(settings!.gatewayUrl).toBe('ws://custom:9999');
      expect(settings!.reconnectEnabled).toBe(true);
      expect(settings!.maxReconnectAttempts).toBe(5);
      expect(settings!.theme).toBe('dark');
    });
  });

  describe('T008-UNIT-002: Save persists to LocalStorage', () => {
    it('saves current settings to localStorage', async () => {
      const { settingsStore } = await import('../stores/settings');

      settingsStore.save();

      const saved = JSON.parse(localStorageMock.getItem('osai-dashboard-settings')!);
      expect(saved.gatewayUrl).toBe('ws://127.0.0.1:18789');
      expect(saved.reconnectEnabled).toBe(true);
      expect(saved.maxReconnectAttempts).toBe(5);
      expect(saved.theme).toBe('dark');
      expect(saved.notificationsEnabled).toBe(true);
    });

    it('persists updated settings after save', async () => {
      const { settingsStore } = await import('../stores/settings');

      settingsStore.update('gatewayUrl', 'ws://custom:9999');
      settingsStore.update('maxReconnectAttempts', 15);
      settingsStore.save();

      const saved = JSON.parse(localStorageMock.getItem('osai-dashboard-settings')!);
      expect(saved.gatewayUrl).toBe('ws://custom:9999');
      expect(saved.maxReconnectAttempts).toBe(15);
    });
  });

  describe('T008-UNIT-003: Reset restores defaults', () => {
    it('resets all settings to defaults', async () => {
      const { settingsStore } = await import('../stores/settings');

      settingsStore.update('gatewayUrl', 'ws://custom:9999');
      settingsStore.update('reconnectEnabled', false);
      settingsStore.update('theme', 'light');
      settingsStore.reset();

      let settings: import('../stores/settings').AppSettings | undefined;
      const unsub = settingsStore.subscribe((s) => {
        settings = s;
      });
      unsub();

      expect(settings!.gatewayUrl).toBe('ws://127.0.0.1:18789');
      expect(settings!.reconnectEnabled).toBe(true);
      expect(settings!.maxReconnectAttempts).toBe(5);
      expect(settings!.theme).toBe('dark');
      expect(settings!.notificationsEnabled).toBe(true);
    });

    it('persists defaults to localStorage after reset', async () => {
      const { settingsStore } = await import('../stores/settings');

      settingsStore.update('gatewayUrl', 'ws://custom:9999');
      settingsStore.reset();

      const saved = JSON.parse(localStorageMock.getItem('osai-dashboard-settings')!);
      expect(saved.gatewayUrl).toBe('ws://127.0.0.1:18789');
      expect(saved.reconnectEnabled).toBe(true);
    });
  });

  describe('update key/value', () => {
    it('updates gatewayUrl', async () => {
      const { settingsStore } = await import('../stores/settings');

      settingsStore.update('gatewayUrl', 'ws://new-host:3000');

      let settings: import('../stores/settings').AppSettings | undefined;
      const unsub = settingsStore.subscribe((s) => {
        settings = s;
      });
      unsub();

      expect(settings!.gatewayUrl).toBe('ws://new-host:3000');
    });

    it('updates reconnectEnabled', async () => {
      const { settingsStore } = await import('../stores/settings');

      settingsStore.update('reconnectEnabled', false);

      let settings: import('../stores/settings').AppSettings | undefined;
      const unsub = settingsStore.subscribe((s) => {
        settings = s;
      });
      unsub();

      expect(settings!.reconnectEnabled).toBe(false);
    });

    it('updates maxReconnectAttempts', async () => {
      const { settingsStore } = await import('../stores/settings');

      settingsStore.update('maxReconnectAttempts', 20);

      let settings: import('../stores/settings').AppSettings | undefined;
      const unsub = settingsStore.subscribe((s) => {
        settings = s;
      });
      unsub();

      expect(settings!.maxReconnectAttempts).toBe(20);
    });

    it('updates theme', async () => {
      const { settingsStore } = await import('../stores/settings');

      settingsStore.update('theme', 'system');

      let settings: import('../stores/settings').AppSettings | undefined;
      const unsub = settingsStore.subscribe((s) => {
        settings = s;
      });
      unsub();

      expect(settings!.theme).toBe('system');
    });

    it('updates notificationsEnabled', async () => {
      const { settingsStore } = await import('../stores/settings');

      settingsStore.update('notificationsEnabled', false);

      let settings: import('../stores/settings').AppSettings | undefined;
      const unsub = settingsStore.subscribe((s) => {
        settings = s;
      });
      unsub();

      expect(settings!.notificationsEnabled).toBe(false);
    });

    it('does not affect other settings when updating one', async () => {
      const { settingsStore } = await import('../stores/settings');

      settingsStore.update('theme', 'light');

      let settings: import('../stores/settings').AppSettings | undefined;
      const unsub = settingsStore.subscribe((s) => {
        settings = s;
      });
      unsub();

      expect(settings!.theme).toBe('light');
      expect(settings!.gatewayUrl).toBe('ws://127.0.0.1:18789');
      expect(settings!.reconnectEnabled).toBe(true);
      expect(settings!.maxReconnectAttempts).toBe(5);
      expect(settings!.notificationsEnabled).toBe(true);
    });
  });

  describe('load method', () => {
    it('reloads settings from localStorage', async () => {
      const { settingsStore } = await import('../stores/settings');

      // Change store state
      settingsStore.update('gatewayUrl', 'ws://modified:9999');

      // Update localStorage independently
      localStorageMock.setItem('osai-dashboard-settings', JSON.stringify({
        gatewayUrl: 'ws://reloaded:1234',
        reconnectEnabled: false,
        maxReconnectAttempts: 8,
        theme: 'system',
        notificationsEnabled: false
      }));

      settingsStore.load();

      let settings: import('../stores/settings').AppSettings | undefined;
      const unsub = settingsStore.subscribe((s) => {
        settings = s;
      });
      unsub();

      expect(settings!.gatewayUrl).toBe('ws://reloaded:1234');
      expect(settings!.reconnectEnabled).toBe(false);
      expect(settings!.maxReconnectAttempts).toBe(8);
      expect(settings!.theme).toBe('system');
    });
  });

  describe('getSnapshot', () => {
    it('returns current settings without subscription', async () => {
      const { settingsStore } = await import('../stores/settings');

      settingsStore.update('gatewayUrl', 'ws://snapshot:5000');
      const snapshot = settingsStore.getSnapshot();

      expect(snapshot.gatewayUrl).toBe('ws://snapshot:5000');
      expect(snapshot.reconnectEnabled).toBe(true);
    });
  });

  describe('convenience exports', () => {
    it('updateSetting updates a setting', async () => {
      const { updateSetting, settingsStore } = await import('../stores/settings');

      updateSetting('theme', 'light');

      let settings: import('../stores/settings').AppSettings | undefined;
      const unsub = settingsStore.subscribe((s) => {
        settings = s;
      });
      unsub();

      expect(settings!.theme).toBe('light');
    });

    it('saveSettings persists to localStorage', async () => {
      const { saveSettings } = await import('../stores/settings');

      saveSettings();

      const saved = JSON.parse(localStorageMock.getItem('osai-dashboard-settings')!);
      expect(saved).toBeDefined();
      expect(saved.gatewayUrl).toBe('ws://127.0.0.1:18789');
    });

    it('resetSettings resets to defaults', async () => {
      const { resetSettings, settingsStore } = await import('../stores/settings');

      settingsStore.update('gatewayUrl', 'ws://custom:9999');
      resetSettings();

      let settings: import('../stores/settings').AppSettings | undefined;
      const unsub = settingsStore.subscribe((s) => {
        settings = s;
      });
      unsub();

      expect(settings!.gatewayUrl).toBe('ws://127.0.0.1:18789');
    });

    it('loadSettings reloads from localStorage', async () => {
      const { loadSettings, settingsStore } = await import('../stores/settings');

      localStorageMock.setItem('osai-dashboard-settings', JSON.stringify({
        gatewayUrl: 'ws://loaded:7000',
        reconnectEnabled: false,
        maxReconnectAttempts: 3,
        theme: 'system',
        notificationsEnabled: false
      }));

      loadSettings();

      let settings: import('../stores/settings').AppSettings | undefined;
      const unsub = settingsStore.subscribe((s) => {
        settings = s;
      });
      unsub();

      expect(settings!.gatewayUrl).toBe('ws://loaded:7000');
    });
  });

  describe('validation', () => {
    it('validates theme values on load - invalid theme falls back to default', async () => {
      localStorageMock.setItem('osai-dashboard-settings', JSON.stringify({
        gatewayUrl: 'ws://127.0.0.1:18789',
        reconnectEnabled: true,
        maxReconnectAttempts: 5,
        theme: 'invalid',
        notificationsEnabled: true
      }));

      const { settingsStore } = await import('../stores/settings');
      let settings: import('../stores/settings').AppSettings | undefined;
      const unsub = settingsStore.subscribe((s) => {
        settings = s;
      });
      unsub();

      expect(settings!.theme).toBe('dark');
    });

    it('validates maxReconnectAttempts - non-number falls back to default', async () => {
      localStorageMock.setItem('osai-dashboard-settings', JSON.stringify({
        gatewayUrl: 'ws://127.0.0.1:18789',
        reconnectEnabled: true,
        maxReconnectAttempts: 'not-a-number',
        theme: 'dark',
        notificationsEnabled: true
      }));

      const { settingsStore } = await import('../stores/settings');
      let settings: import('../stores/settings').AppSettings | undefined;
      const unsub = settingsStore.subscribe((s) => {
        settings = s;
      });
      unsub();

      expect(settings!.maxReconnectAttempts).toBe(5);
    });
  });
});
