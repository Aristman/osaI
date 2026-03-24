import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  detectPlatform,
  detectDisplayServer,
  detectDesktopEnvironment,
  hasSystemd,
  hasLaunchd,
  getCapabilities,
} from './capability.js';

describe('detectPlatform', () => {
  const originalPlatform = process.platform;

  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true });
  });

  it('UT-002-01a: returns "linux" on linux', () => {
    Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });
    expect(detectPlatform()).toBe('linux');
  });

  it('UT-002-01b: returns "macos" on darwin', () => {
    Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });
    expect(detectPlatform()).toBe('macos');
  });

  it('UT-002-01c: returns "unknown" on other platforms', () => {
    Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
    expect(detectPlatform()).toBe('unknown');
  });
});

describe('detectDisplayServer', () => {
  const envBackup = { ...process.env };

  beforeEach(() => {
    // Clear display-related env vars
    delete process.env['XDG_SESSION_TYPE'];
    delete process.env['WAYLAND_DISPLAY'];
    delete process.env['DISPLAY'];
    delete process.env['SSH_TTY'];
    delete process.env['SSH_CONNECTION'];
  });

  afterEach(() => {
    // Restore env
    for (const key of Object.keys(process.env)) {
      if (!(key in envBackup)) {
        delete process.env[key];
      }
    }
    for (const [key, value] of Object.entries(envBackup)) {
      process.env[key] = value;
    }
  });

  it('UT-002-02: returns "wayland" when WAYLAND_DISPLAY is set', () => {
    process.env['WAYLAND_DISPLAY'] = 'wayland-1';
    expect(detectDisplayServer()).toBe('wayland');
  });

  it('UT-002-02b: returns "wayland" when XDG_SESSION_TYPE=wayland', () => {
    process.env['XDG_SESSION_TYPE'] = 'wayland';
    expect(detectDisplayServer()).toBe('wayland');
  });

  it('UT-002-03: returns "x11" when DISPLAY is set', () => {
    process.env['DISPLAY'] = ':0';
    expect(detectDisplayServer()).toBe('x11');
  });

  it('UT-002-03b: returns "x11" when XDG_SESSION_TYPE=x11', () => {
    process.env['XDG_SESSION_TYPE'] = 'x11';
    expect(detectDisplayServer()).toBe('x11');
  });

  it('UT-002-04: returns "headless" when no display env is set', () => {
    expect(detectDisplayServer()).toBe('headless');
  });

  it('UT-002-04b: returns "headless" on SSH session', () => {
    process.env['SSH_TTY'] = '/dev/pts/0';
    expect(detectDisplayServer()).toBe('headless');
  });

  it('prioritizes Wayland over X11 when both are set', () => {
    process.env['WAYLAND_DISPLAY'] = 'wayland-1';
    process.env['DISPLAY'] = ':0';
    expect(detectDisplayServer()).toBe('wayland');
  });
});

describe('detectDesktopEnvironment', () => {
  const envBackup = { ...process.env };

  beforeEach(() => {
    delete process.env['XDG_CURRENT_DESKTOP'];
    delete process.env['DESKTOP_SESSION'];
    delete process.env['DISPLAY'];
    delete process.env['WAYLAND_DISPLAY'];
  });

  afterEach(() => {
    for (const key of Object.keys(process.env)) {
      if (!(key in envBackup)) {
        delete process.env[key];
      }
    }
    for (const [key, value] of Object.entries(envBackup)) {
      process.env[key] = value;
    }
  });

  it('returns true when XDG_CURRENT_DESKTOP is set', () => {
    process.env['XDG_CURRENT_DESKTOP'] = 'sway';
    expect(detectDesktopEnvironment()).toBe(true);
  });

  it('returns true when DESKTOP_SESSION is set', () => {
    process.env['DESKTOP_SESSION'] = 'gnome';
    expect(detectDesktopEnvironment()).toBe(true);
  });

  it('returns true when DISPLAY is set', () => {
    process.env['DISPLAY'] = ':0';
    expect(detectDesktopEnvironment()).toBe(true);
  });

  it('returns false when no desktop env vars are set', () => {
    expect(detectDesktopEnvironment()).toBe(false);
  });
});

describe('hasSystemd', () => {
  const originalPlatform = process.platform;
  const envBackup = { ...process.env };

  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true });
    for (const key of Object.keys(process.env)) {
      if (!(key in envBackup)) {
        delete process.env[key];
      }
    }
    for (const [key, value] of Object.entries(envBackup)) {
      process.env[key] = value;
    }
  });

  it('returns true on Linux with XDG_RUNTIME_DIR', () => {
    Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });
    process.env['XDG_RUNTIME_DIR'] = '/run/user/1000';
    expect(hasSystemd()).toBe(true);
  });

  it('returns false on Linux without XDG_RUNTIME_DIR', () => {
    Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });
    delete process.env['XDG_RUNTIME_DIR'];
    expect(hasSystemd()).toBe(false);
  });

  it('returns false on macOS', () => {
    Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });
    expect(hasSystemd()).toBe(false);
  });
});

describe('hasLaunchd', () => {
  const originalPlatform = process.platform;

  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true });
  });

  it('returns true on macOS', () => {
    Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });
    expect(hasLaunchd()).toBe(true);
  });

  it('returns false on Linux', () => {
    Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });
    expect(hasLaunchd()).toBe(false);
  });
});

describe('getCapabilities', () => {
  it('UT-002-07: returns complete OsCapabilities object', () => {
    const caps = getCapabilities();
    expect(caps).toHaveProperty('platform');
    expect(caps).toHaveProperty('displayServer');
    expect(caps).toHaveProperty('traySupported');
    expect(caps).toHaveProperty('notificationsSupported');
    expect(caps).toHaveProperty('fileWatcherSupported');
    expect(caps).toHaveProperty('serviceManagementSupported');
    expect(caps).toHaveProperty('hasSystemd');
    expect(caps).toHaveProperty('hasLaunchd');
    expect(caps).toHaveProperty('isDesktopEnvironment');
  });

  it('fileWatcherSupported is always true', () => {
    const caps = getCapabilities();
    expect(caps.fileWatcherSupported).toBe(true);
  });

  it('UT-002-05: traySupported is false on Wayland', () => {
    const envBackup = { ...process.env };
    process.env['WAYLAND_DISPLAY'] = 'wayland-1';
    process.env['DISPLAY'] = ':0';
    const originalPlatform = process.platform;
    Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });

    const caps = getCapabilities();
    expect(caps.traySupported).toBe(false);

    Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true });
    for (const key of Object.keys(process.env)) {
      if (!(key in envBackup)) {
        delete process.env[key];
      }
    }
    for (const [key, value] of Object.entries(envBackup)) {
      process.env[key] = value;
    }
  });

  it('UT-002-06: traySupported is true on X11', () => {
    const envBackup = { ...process.env };
    delete process.env['WAYLAND_DISPLAY'];
    process.env['DISPLAY'] = ':0';
    const originalPlatform = process.platform;
    Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });

    const caps = getCapabilities();
    expect(caps.traySupported).toBe(true);

    Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true });
    for (const key of Object.keys(process.env)) {
      if (!(key in envBackup)) {
        delete process.env[key];
      }
    }
    for (const [key, value] of Object.entries(envBackup)) {
      process.env[key] = value;
    }
  });
});
