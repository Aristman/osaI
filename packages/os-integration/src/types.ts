/**
 * @osai/os-integration -- OS Integration types for osaI
 */

/** Supported display server types */
export type DisplayServer = 'x11' | 'wayland' | 'headless' | 'unknown';

/** Supported platforms */
export type Platform = 'linux' | 'macos' | 'unknown';

/** Notification urgency levels */
export type NotificationUrgency = 'low' | 'normal' | 'critical';

/** System tray status indicators */
export type TrayStatus = 'active' | 'inactive' | 'error';

/** File watcher event types */
export type FileWatcherEvent = 'create' | 'modify' | 'delete';

/** OS capabilities detected at runtime */
export interface OsCapabilities {
  platform: Platform;
  displayServer: DisplayServer;
  traySupported: boolean;
  notificationsSupported: boolean;
  fileWatcherSupported: boolean;
  serviceManagementSupported: boolean;
  hasSystemd: boolean;
  hasLaunchd: boolean;
  isDesktopEnvironment: boolean;
}

/** Tray menu item definition */
export interface TrayMenuItem {
  id: string;
  label: string;
  enabled?: boolean;
  checked?: boolean;
  separator?: boolean;
}

/** Tray handle returned on creation */
export interface TrayHandle {
  id: string;
  status: TrayStatus;
  destroy: () => void;
}

/** Notification options */
export interface NotificationOptions {
  title: string;
  body: string;
  urgency?: NotificationUrgency;
  icon?: string;
  actions?: string[];
  onClick?: (action?: string) => void;
  onClose?: () => void;
  timeout?: number;
}

/** Notification result */
export interface NotificationResult {
  success: boolean;
  error?: string;
}

/** File watcher callback */
export interface FileWatcherEventPayload {
  event: FileWatcherEvent;
  path: string;
  stats?: {
    size: number;
    mtime: number;
  };
}

export type FileWatcherCallback = (payload: FileWatcherEventPayload) => void;

/** File watcher handle */
export interface WatcherHandle {
  id: string;
  path: string;
  close: () => void;
}

/** File watcher configuration */
export interface FileWatcherConfig {
  debounceMs?: number;
  maxFiles?: number;
  persistent?: boolean;
  ignoreInitial?: boolean;
  ignored?: string[];
}

/** Process information */
export interface ProcessInfo {
  pid: number;
  name: string;
  cpu: number;
  mem: number;
  command: string;
  user: string;
  started: string;
  status: string;
}

/** System information */
export interface SystemInfo {
  cpu: {
    model: string;
    cores: number;
    speed: number;
    usage: number;
  };
  memory: {
    total: number;
    used: number;
    free: number;
    usagePercent: number;
  };
  disk: {
    total: number;
    used: number;
    free: number;
    usagePercent: number;
  };
  uptime: number;
  hostname: string;
  platform: string;
}

/** Service status */
export type ServiceStatus = 'running' | 'stopped' | 'not-installed' | 'unknown' | 'error';

/** Service management options */
export interface ServiceOptions {
  execPath: string;
  args?: string[];
  env?: Record<string, string>;
  workingDirectory?: string;
  autoRestart?: boolean;
}

/** OsIntegration configuration */
export interface OsIntegrationConfig {
  enabled?: boolean;
  tray?: {
    enabled?: boolean;
    menuItems?: TrayMenuItem[];
    onMenuClick?: (itemId: string) => void;
  };
  notifications?: {
    enabled?: boolean;
    defaultUrgency?: NotificationUrgency;
  };
  fileWatcher?: FileWatcherConfig;
  service?: ServiceOptions;
}
