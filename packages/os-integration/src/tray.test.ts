import { describe, it, expect, vi } from 'vitest';
import { SystemTray, DEFAULT_MENU_ITEMS } from './tray.js';
import type { OsCapabilities } from './types.js';

const createMockCapabilities = (overrides: Partial<OsCapabilities> = {}): OsCapabilities => ({
  platform: 'linux',
  displayServer: 'x11',
  traySupported: true,
  notificationsSupported: true,
  fileWatcherSupported: true,
  serviceManagementSupported: true,
  hasSystemd: true,
  hasLaunchd: false,
  isDesktopEnvironment: true,
  ...overrides,
});

describe('SystemTray', () => {
  describe('UT-003-01: instantiation', () => {
    it('creates instance with default capabilities', () => {
      const tray = new SystemTray();
      expect(tray).toBeInstanceOf(SystemTray);
      expect(tray.isActive()).toBe(false);
    });

    it('creates instance with provided capabilities', () => {
      const caps = createMockCapabilities();
      const tray = new SystemTray(caps);
      expect(tray).toBeInstanceOf(SystemTray);
    });
  });

  describe('UT-003-02: createTray returns handle on X11', () => {
    it('returns TrayHandle when tray is supported', () => {
      const caps = createMockCapabilities({ traySupported: true });
      const tray = new SystemTray(caps);
      const handle = tray.createTray();

      expect(handle).not.toBeNull();
      expect(handle!.id).toMatch(/^osai-tray-/);
      expect(handle!.status).toBe('active');
      expect(typeof handle!.destroy).toBe('function');
    });
  });

  describe('UT-003-03: createTray returns null on Wayland', () => {
    it('returns null when tray is not supported (Wayland)', () => {
      const caps = createMockCapabilities({ traySupported: false, displayServer: 'wayland' });
      const tray = new SystemTray(caps);
      const handle = tray.createTray();

      expect(handle).toBeNull();
    });

    it('returns null on headless', () => {
      const caps = createMockCapabilities({ traySupported: false, displayServer: 'headless' });
      const tray = new SystemTray(caps);
      const handle = tray.createTray();

      expect(handle).toBeNull();
    });
  });

  describe('UT-003-04: updateStatus changes status', () => {
    it('updates status from active to error', () => {
      const caps = createMockCapabilities({ traySupported: true });
      const tray = new SystemTray(caps);
      tray.createTray();

      tray.updateStatus('error');
      expect(tray.getStatus()).toBe('error');
    });

    it('updates status to inactive', () => {
      const caps = createMockCapabilities({ traySupported: true });
      const tray = new SystemTray(caps);
      tray.createTray();

      tray.updateStatus('inactive');
      expect(tray.getStatus()).toBe('inactive');
    });

    it('warns when tray not created', () => {
      const caps = createMockCapabilities({ traySupported: true });
      const tray = new SystemTray(caps);

      // Should not throw
      tray.updateStatus('active');
      expect(tray.getStatus()).toBe('inactive');
    });
  });

  describe('UT-003-05: destroy cleans up resources', () => {
    it('destroys tray and clears state', () => {
      const caps = createMockCapabilities({ traySupported: true });
      const tray = new SystemTray(caps);
      const handle = tray.createTray();
      expect(handle).not.toBeNull();

      tray.destroy();
      expect(tray.isActive()).toBe(false);
      expect(tray.getStatus()).toBe('inactive');
    });

    it('cannot create tray after destroy', () => {
      const caps = createMockCapabilities({ traySupported: true });
      const tray = new SystemTray(caps);
      tray.createTray();
      tray.destroy();

      const handle = tray.createTray();
      expect(handle).toBeNull();
    });
  });

  describe('UT-003-06: Menu item click triggers callback', () => {
    it('calls registered callback on menu click', () => {
      const caps = createMockCapabilities({ traySupported: true });
      const tray = new SystemTray(caps);
      const callback = vi.fn();
      tray.onMenuClick('quit', callback);

      tray.createTray();
      tray.simulateMenuClick('quit');

      expect(callback).toHaveBeenCalledWith('quit');
    });

    it('uses callbacks map from createTray', () => {
      const caps = createMockCapabilities({ traySupported: true });
      const tray = new SystemTray(caps);
      const callback = vi.fn();
      const callbacks = new Map([['open-chat', callback]]);

      tray.createTray(undefined, callbacks);
      tray.simulateMenuClick('open-chat');

      expect(callback).toHaveBeenCalledWith('open-chat');
    });

    it('warns for unregistered callback', () => {
      const caps = createMockCapabilities({ traySupported: true });
      const tray = new SystemTray(caps);
      tray.createTray();

      // Should not throw
      tray.simulateMenuClick('nonexistent');
    });
  });

  describe('getMenuItems', () => {
    it('returns default menu items', () => {
      const caps = createMockCapabilities({ traySupported: true });
      const tray = new SystemTray(caps);
      const items = tray.getMenuItems();

      expect(items).toHaveLength(DEFAULT_MENU_ITEMS.length);
      expect(items[0]!.id).toBe('open-chat');
      expect(items[items.length - 1]!.id).toBe('quit');
    });

    it('returns custom menu items when provided', () => {
      const caps = createMockCapabilities({ traySupported: true });
      const tray = new SystemTray(caps);
      const customItems = [{ id: 'custom', label: 'Custom Item', enabled: true }];

      tray.createTray(customItems);
      const items = tray.getMenuItems();

      expect(items).toHaveLength(1);
      expect(items[0]!.id).toBe('custom');
    });
  });
});
