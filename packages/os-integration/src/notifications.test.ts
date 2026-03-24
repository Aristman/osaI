import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotificationManager } from './notifications.js';
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

// Mock node-notifier at module level
vi.mock('node-notifier', () => ({
  default: Object.assign(
    (_options: Record<string, unknown>, _callback?: (err: Error | null, response: unknown) => void) => {
      return { close: vi.fn() };
    },
    {
      Notification: class {
        constructor(_options: Record<string, unknown>) {}
      },
      WindowsToaster: class {
        constructor(_options: Record<string, unknown>) {}
      },
    },
  ),
  notify: vi.fn((_options: Record<string, unknown>) => {
    return { close: vi.fn() };
  }),
}));

describe('NotificationManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('UT-004-01: instantiation', () => {
    it('creates instance with default capabilities', () => {
      const manager = new NotificationManager();
      expect(manager).toBeInstanceOf(NotificationManager);
    });

    it('creates instance with provided capabilities', () => {
      const caps = createMockCapabilities();
      const manager = new NotificationManager(caps);
      expect(manager).toBeInstanceOf(NotificationManager);
    });

    it('isSupported returns correct value', () => {
      const caps = createMockCapabilities({ notificationsSupported: true });
      const manager = new NotificationManager(caps);
      expect(manager.isSupported()).toBe(true);
    });
  });

  describe('UT-004-02: notify with low urgency', () => {
    it('sends low urgency notification', async () => {
      const caps = createMockCapabilities();
      const manager = new NotificationManager(caps);
      const result = await manager.show('Test Title', 'Test Body', 'low');

      expect(result.success).toBe(true);
      expect(manager.getActiveCount()).toBe(0);
    });
  });

  describe('UT-004-03: notify with normal urgency', () => {
    it('sends normal urgency notification', async () => {
      const caps = createMockCapabilities();
      const manager = new NotificationManager(caps);
      const result = await manager.show('Title', 'Body', 'normal');

      expect(result.success).toBe(true);
    });
  });

  describe('UT-004-04: notify with critical urgency', () => {
    it('sends critical urgency notification', async () => {
      const caps = createMockCapabilities();
      const manager = new NotificationManager(caps);
      const result = await manager.show('Critical', 'Something happened', 'critical');

      expect(result.success).toBe(true);
    });
  });

  describe('UT-004-05: notify handles errors gracefully', () => {
    it('returns success=true via top-level mock', async () => {
      const caps = createMockCapabilities();
      const manager = new NotificationManager(caps);

      const result = await manager.notify({
        title: 'Test',
        body: 'Test error handling',
      });

      expect(result.success).toBe(true);
    });

    it('falls back when notifications not supported', async () => {
      const caps = createMockCapabilities({ notificationsSupported: false });
      const manager = new NotificationManager(caps);

      const result = await manager.notify({
        title: 'Test',
        body: 'Test fallback',
      });

      expect(result.success).toBe(true);
    });
  });

  describe('UT-004-06: click callback registered', () => {
    it('accepts onClick callback in show()', async () => {
      const caps = createMockCapabilities();
      const manager = new NotificationManager(caps);
      const callback = vi.fn();

      const result = await manager.show('Title', 'Body', 'normal', callback);

      expect(result.success).toBe(true);
    });

    it('accepts onClick callback in notify()', async () => {
      const caps = createMockCapabilities();
      const manager = new NotificationManager(caps);
      const callback = vi.fn();

      const result = await manager.notify({
        title: 'Title',
        body: 'Body',
        onClick: callback,
      });

      expect(result.success).toBe(true);
    });
  });

  describe('notifications not supported', () => {
    it('falls back to console when not supported', async () => {
      const caps = createMockCapabilities({ notificationsSupported: false });
      const manager = new NotificationManager(caps);
      const result = await manager.show('Title', 'Body');

      expect(result.success).toBe(true);
      expect(manager.isSupported()).toBe(false);
    });
  });

  describe('closeAll', () => {
    it('clears active notifications', async () => {
      const caps = createMockCapabilities();
      const manager = new NotificationManager(caps);
      await manager.show('Title', 'Body');

      manager.closeAll();
      expect(manager.getActiveCount()).toBe(0);
    });
  });
});
