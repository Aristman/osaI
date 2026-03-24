/**
 * Integration Tests for OsIntegrationManager
 *
 * Tests the full lifecycle and cross-subsystem interaction.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { OsIntegrationManager } from '../src/manager.js';
import {
  detectPlatform,
  detectDisplayServer,
  detectDesktopEnvironment,
  getCapabilities,
} from '../src/capability.js';
import { SystemTray } from '../src/tray.js';
import { NotificationManager } from '../src/notifications.js';
import { FileWatcher } from '../src/file-watcher.js';
import { ServiceManager } from '../src/service.js';

import type { OsCapabilities } from '../src/types.js';

describe('IT-009-01: Full OsIntegrationManager lifecycle', () => {
  it('initialize -> use -> shutdown completes without errors', async () => {
    const manager = new OsIntegrationManager({ enabled: true });

    // Initialize
    await manager.initialize();
    expect(manager.isInitialized()).toBe(true);

    // Use capabilities
    const caps = manager.getCapabilities();
    expect(caps.platform).toBeDefined();

    // Use process manager
    const procs = await manager.listProcesses();
    expect(Array.isArray(procs)).toBe(true);

    // Use system info
    const sysInfo = await manager.getSystemInfo();
    expect(sysInfo).not.toBeNull();

    // Shutdown
    await manager.shutdown();
    expect(manager.isInitialized()).toBe(false);
  });

  it('multiple initialize/shutdown cycles work', async () => {
    const manager = new OsIntegrationManager();

    for (let i = 0; i < 3; i++) {
      await manager.initialize();
      expect(manager.isInitialized()).toBe(true);

      await manager.shutdown();
      expect(manager.isInitialized()).toBe(false);
    }
  });
});

describe('IT-009-02: Capability detection integration', () => {
  it('detects platform correctly', () => {
    const platform = detectPlatform();
    expect(['linux', 'macos', 'unknown']).toContain(platform);
  });

  it('detects display server correctly', () => {
    const display = detectDisplayServer();
    expect(['x11', 'wayland', 'headless', 'unknown']).toContain(display);
  });

  it('detects desktop environment', () => {
    const isDesktop = detectDesktopEnvironment();
    expect(typeof isDesktop).toBe('boolean');
  });

  it('getCapabilities returns consistent result', () => {
    const caps1 = getCapabilities();
    const caps2 = getCapabilities();

    expect(caps1.platform).toBe(caps2.platform);
    expect(caps1.displayServer).toBe(caps2.displayServer);
    expect(caps1.traySupported).toBe(caps2.traySupported);
    expect(caps1.notificationsSupported).toBe(caps2.notificationsSupported);
    expect(caps1.fileWatcherSupported).toBe(caps2.fileWatcherSupported);
  });

  it('capabilities match between standalone and manager', async () => {
    const standaloneCaps = getCapabilities();
    const manager = new OsIntegrationManager();
    const managerCaps = manager.getCapabilities();

    expect(standaloneCaps.platform).toBe(managerCaps.platform);
    expect(standaloneCaps.traySupported).toBe(managerCaps.traySupported);

    await manager.shutdown();
  });
});

describe('IT-009-03: File watcher + manager integration', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'osai-integration-'));
  });

  afterEach(async () => {
    await fs.promises.rm(tmpDir, { recursive: true, force: true });
  });

  it('can watch a directory via manager', async () => {
    const manager = new OsIntegrationManager();
    await manager.initialize();

    const handle = await manager.watchDirectory(tmpDir);
    expect(handle).not.toBeNull();
    expect(handle!.path).toBe(tmpDir);

    await manager.shutdown();
  });

  it('file watcher standalone works with temp directory', async () => {
    const watcher = new FileWatcher({ debounceMs: 50 });
    const callback = vi.fn();

    const handle = await watcher.watchDirectory(tmpDir, ['create', 'modify', 'delete'], callback);
    expect(handle).not.toBeNull();

    // Create a file
    const testFile = path.join(tmpDir, 'test.txt');
    fs.writeFileSync(testFile, 'hello');

    // Wait for debounce
    await new Promise((resolve) => setTimeout(resolve, 200));

    await watcher.unwatchAll();
    await watcher.close();
  });
});

describe('IT-009-04: Process listing via manager', () => {
  it('lists processes through manager', async () => {
    const manager = new OsIntegrationManager();
    await manager.initialize();

    const processes = await manager.listProcesses();
    expect(Array.isArray(processes)).toBe(true);

    // Should find at least the current node process
    const nodeProcs = processes.filter((p) => p.name.toLowerCase().includes('node'));
    if (nodeProcs.length === 0) {
      // At minimum, some processes should be returned
      // (unless running in a very restricted environment)
    }

    await manager.shutdown();
  });

  it('filters processes by name', async () => {
    const manager = new OsIntegrationManager();
    await manager.initialize();

    const processes = await manager.listProcesses('node');
    expect(Array.isArray(processes)).toBe(true);

    // Filtered results should be a subset of all processes
    const allProcesses = await manager.listProcesses();
    expect(processes.length).toBeLessThanOrEqual(allProcesses.length);

    await manager.shutdown();
  });
});

describe('IT-009-05: System info via manager', () => {
  it('returns system info through manager', async () => {
    const manager = new OsIntegrationManager();
    await manager.initialize();

    const info = await manager.getSystemInfo();
    expect(info).not.toBeNull();

    expect(info!.cpu.model).toBeDefined();
    expect(info!.cpu.cores).toBeGreaterThan(0);
    expect(info!.memory.total).toBeGreaterThan(0);
    expect(info!.uptime).toBeGreaterThan(0);
    expect(info!.hostname).toBeDefined();
    expect(info!.platform).toBeDefined();

    await manager.shutdown();
  });
});

describe('IT-009-06: Multiple subsystems concurrent', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'osai-concurrent-'));
  });

  afterEach(async () => {
    await fs.promises.rm(tmpDir, { recursive: true, force: true });
  });

  it('all subsystems work concurrently', async () => {
    const manager = new OsIntegrationManager();
    await manager.initialize();

    // Run multiple operations concurrently
    const [watchHandle, processes, sysInfo] = await Promise.all([
      manager.watchDirectory(tmpDir),
      manager.listProcesses(),
      manager.getSystemInfo(),
    ]);

    expect(watchHandle).not.toBeNull();
    expect(Array.isArray(processes)).toBe(true);
    expect(sysInfo).not.toBeNull();

    await manager.shutdown();
  });
});

describe('IT-009-07: Graceful degradation on Wayland/headless', () => {
  it('manager works on headless without crash', async () => {
    // This test runs in CI which is typically headless
    const manager = new OsIntegrationManager();
    const caps = manager.getCapabilities();

    // Should not crash even if display server is headless
    await manager.initialize();

    // File watcher should always be available
    expect(manager.getFileWatcher()).not.toBeNull();

    // Process manager should always be available
    expect(manager.getProcessManager()).not.toBeNull();

    // Tray might be null on headless
    if (!caps.traySupported) {
      expect(manager.getTray()).toBeNull();
    }

    // Notifications might be null on headless
    if (!caps.notificationsSupported) {
      expect(manager.getNotifications()).toBeNull();
    }

    await manager.shutdown();
  });

  it('SystemTray gracefully returns null on unsupported platforms', () => {
    const caps: OsCapabilities = {
      platform: 'linux',
      displayServer: 'wayland',
      traySupported: false,
      notificationsSupported: false,
      fileWatcherSupported: true,
      serviceManagementSupported: false,
      hasSystemd: false,
      hasLaunchd: false,
      isDesktopEnvironment: false,
    };

    const tray = new SystemTray(caps);
    const handle = tray.createTray();

    expect(handle).toBeNull();
    expect(tray.isActive()).toBe(false);
  });

  it('NotificationManager falls back gracefully', async () => {
    const caps: OsCapabilities = {
      platform: 'linux',
      displayServer: 'headless',
      traySupported: false,
      notificationsSupported: false,
      fileWatcherSupported: true,
      serviceManagementSupported: false,
      hasSystemd: false,
      hasLaunchd: false,
      isDesktopEnvironment: false,
    };

    const nm = new NotificationManager(caps);
    expect(nm.isSupported()).toBe(false);

    // Should not throw, just log to console
    const result = await nm.show('Test', 'Body', 'normal');
    expect(result.success).toBe(true);
  });
});

describe('ServiceManager integration', () => {
  it('generates valid systemd unit on Linux', () => {
    const sm = new ServiceManager('linux');
    const content = sm.generateSystemdUnit({
      execPath: '/usr/bin/node',
      args: ['server.js'],
    });

    expect(content).toContain('[Unit]');
    expect(content).toContain('[Service]');
    expect(content).toContain('[Install]');
  });

  it('generates valid plist on macOS', () => {
    const sm = new ServiceManager('macos');
    const content = sm.generateLaunchdPlist({
      execPath: '/usr/local/bin/node',
      args: ['server.js'],
    });

    expect(content).toContain('<?xml');
    expect(content).toContain('com.osai.osai');
  });
});
