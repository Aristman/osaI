/**
 * Capability Detection Module
 *
 * Detects OS capabilities: display server, platform,
 * desktop environment, systemd/launchd availability.
 */

import type { DisplayServer, OsCapabilities, Platform } from './types.js';

/**
 * Detect the current platform.
 */
export function detectPlatform(): Platform {
  const p = process.platform;
  if (p === 'linux') return 'linux';
  if (p === 'darwin') return 'macos';
  return 'unknown';
}

/**
 * Detect the display server (X11, Wayland, headless).
 *
 * Checks environment variables:
 * - XDG_SESSION_TYPE
 * - WAYLAND_DISPLAY
 * - DISPLAY
 */
export function detectDisplayServer(): DisplayServer {
  const xdgSessionType = process.env['XDG_SESSION_TYPE'] ?? '';
  const waylandDisplay = process.env['WAYLAND_DISPLAY'] ?? '';
  const display = process.env['DISPLAY'] ?? '';

  if (xdgSessionType.toLowerCase().includes('wayland') || waylandDisplay.length > 0) {
    return 'wayland';
  }

  if (xdgSessionType.toLowerCase().includes('x11') || xdgSessionType.toLowerCase() === 'x-wayland') {
    return 'x11';
  }

  if (display.length > 0) {
    return 'x11';
  }

  if (process.env['SSH_TTY'] || process.env['SSH_CONNECTION']) {
    return 'headless';
  }

  // No display-related env vars -- assume headless
  return 'headless';
}

/**
 * Detect if a desktop environment is available.
 *
 * Checks for XDG_CURRENT_DESKTOP, DESKTOP_SESSION,
 * or DISPLAY env vars.
 */
export function detectDesktopEnvironment(): boolean {
  const xdgDesktop = process.env['XDG_CURRENT_DESKTOP'] ?? '';
  const desktopSession = process.env['DESKTOP_SESSION'] ?? '';
  const display = process.env['DISPLAY'] ?? '';
  const waylandDisplay = process.env['WAYLAND_DISPLAY'] ?? '';

  return xdgDesktop.length > 0
    || desktopSession.length > 0
    || display.length > 0
    || waylandDisplay.length > 0;
}

/**
 * Check if systemd is available (user-level).
 */
export function hasSystemd(): boolean {
  const platform = detectPlatform();
  if (platform !== 'linux') return false;

  // Check for systemd by looking at expected paths/env
  const xdgRuntimeDir = process.env['XDG_RUNTIME_DIR'] ?? '';
  return xdgRuntimeDir.length > 0;
}

/**
 * Check if launchd is available (macOS).
 */
export function hasLaunchd(): boolean {
  return detectPlatform() === 'macos';
}

/**
 * Aggregate all capability checks into a single object.
 */
export function getCapabilities(): OsCapabilities {
  const platform = detectPlatform();
  const displayServer = detectDisplayServer();
  const isDesktopEnv = detectDesktopEnvironment();
  const systemdAvailable = hasSystemd();
  const launchdAvailable = hasLaunchd();

  // Tray support: X11 or macOS only
  const traySupported = (platform === 'linux' && displayServer === 'x11') || platform === 'macos';

  // Notifications: require desktop environment
  const notificationsSupported = isDesktopEnv;

  // File watcher: always supported (Node.js fs)
  const fileWatcherSupported = true;

  // Service management: systemd on Linux, launchd on macOS
  const serviceManagementSupported = systemdAvailable || launchdAvailable;

  return {
    platform,
    displayServer,
    traySupported,
    notificationsSupported,
    fileWatcherSupported,
    serviceManagementSupported,
    hasSystemd: systemdAvailable,
    hasLaunchd: launchdAvailable,
    isDesktopEnvironment: isDesktopEnv,
  };
}
