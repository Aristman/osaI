import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { OsIntegrationManager } from './manager.js';

describe('OsIntegrationManager', () => {
  let manager: OsIntegrationManager;

  beforeEach(() => {
    manager = new OsIntegrationManager({ enabled: true });
  });

  afterEach(async () => {
    if (manager.isInitialized()) {
      await manager.shutdown();
    }
  });

  describe('UT-008-01: instantiation', () => {
    it('creates instance with default config', () => {
      const mgr = new OsIntegrationManager();
      expect(mgr).toBeInstanceOf(OsIntegrationManager);
      expect(mgr.isInitialized()).toBe(false);
    });

    it('creates instance with provided config', () => {
      const mgr = new OsIntegrationManager({ enabled: true });
      expect(mgr).toBeInstanceOf(OsIntegrationManager);
    });
  });

  describe('UT-008-02: initialize sets up subsystems', () => {
    it('initializes all subsystems', async () => {
      await manager.initialize();

      expect(manager.isInitialized()).toBe(true);
      expect(manager.getCapabilities()).toBeDefined();
      // File watcher is always available
      expect(manager.getFileWatcher()).not.toBeNull();
      expect(manager.getProcessManager()).not.toBeNull();
    });

    it('is idempotent (multiple initialize calls)', async () => {
      await manager.initialize();
      await manager.initialize();

      expect(manager.isInitialized()).toBe(true);
    });
  });

  describe('UT-008-04: shutdown cleans up all subsystems', () => {
    it('shuts down all subsystems', async () => {
      await manager.initialize();
      expect(manager.isInitialized()).toBe(true);

      await manager.shutdown();
      expect(manager.isInitialized()).toBe(false);
      expect(manager.getTray()).toBeNull();
      expect(manager.getNotifications()).toBeNull();
      expect(manager.getFileWatcher()).toBeNull();
      expect(manager.getProcessManager()).toBeNull();
      expect(manager.getServiceManager()).toBeNull();
    });

    it('is safe to call shutdown without initialize', async () => {
      await expect(manager.shutdown()).resolves.not.toThrow();
    });
  });

  describe('UT-008-05: getCapabilities returns capabilities', () => {
    it('returns valid capabilities object', () => {
      const caps = manager.getCapabilities();
      expect(caps).toHaveProperty('platform');
      expect(caps).toHaveProperty('displayServer');
      expect(caps).toHaveProperty('traySupported');
      expect(caps).toHaveProperty('notificationsSupported');
      expect(caps).toHaveProperty('fileWatcherSupported');
      expect(caps).toHaveProperty('serviceManagementSupported');
    });
  });

  describe('UT-008-03: initialize respects capabilities', () => {
    it('respects tray capability', async () => {
      await manager.initialize();
      const caps = manager.getCapabilities();

      // If tray is not supported, getTray should return null
      if (!caps.traySupported) {
        expect(manager.getTray()).toBeNull();
      }
    });

    it('respects notifications capability', async () => {
      await manager.initialize();
      const caps = manager.getCapabilities();

      if (!caps.notificationsSupported) {
        expect(manager.getNotifications()).toBeNull();
      }
    });
  });

  describe('isCapable', () => {
    it('returns correct boolean for known features', () => {
      expect(typeof manager.isCapable('tray')).toBe('boolean');
      expect(typeof manager.isCapable('notifications')).toBe('boolean');
      expect(typeof manager.isCapable('fileWatcher')).toBe('boolean');
      expect(typeof manager.isCapable('serviceManagement')).toBe('boolean');
      expect(typeof manager.isCapable('systemd')).toBe('boolean');
      expect(typeof manager.isCapable('launchd')).toBe('boolean');
    });

    it('returns false for unknown features', () => {
      expect(manager.isCapable('unknownFeature')).toBe(false);
    });
  });

  describe('UT-008-06: notify delegates to NotificationManager', () => {
    it('returns null when notifications not available', async () => {
      const result = await manager.notify('Title', 'Body');
      // Before initialize, notifications are null
      expect(result).toBeNull();
    });
  });

  describe('UT-008-07: watchDirectory delegates to FileWatcher', () => {
    it('returns null when file watcher not available', async () => {
      const result = await manager.watchDirectory('/tmp/test');
      expect(result).toBeNull();
    });
  });

  describe('listProcesses delegates', () => {
    it('returns empty array when not initialized', async () => {
      const result = await manager.listProcesses();
      expect(result).toEqual([]);
    });
  });

  describe('getSystemInfo delegates', () => {
    it('returns null when not initialized', async () => {
      const result = await manager.getSystemInfo();
      expect(result).toBeNull();
    });
  });

  describe('installService delegates', () => {
    it('throws when not supported', async () => {
      await expect(
        manager.installService({ execPath: '/usr/bin/node' }),
      ).rejects.toThrow('not supported');
    });
  });
});
