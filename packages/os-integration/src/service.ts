/**
 * Service Management Module
 *
 * Manages osaI as a user service:
 * - Linux: systemd --user unit file
 * - macOS: launchd plist
 */

import type { Platform, ServiceOptions, ServiceStatus } from './types.js';
import { detectPlatform } from './capability.js';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/** Logger interface */
interface ServiceLogger {
  warn(message: string, ...args: unknown[]): void;
  info(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
}

const defaultLogger: ServiceLogger = {
  // eslint-disable-next-line no-console
  warn: (msg, ...args) => console.warn(`[ServiceManager] ${msg}`, ...args),
  // eslint-disable-next-line no-console
  info: (msg, ...args) => console.info(`[ServiceManager] ${msg}`, ...args),
  // eslint-disable-next-line no-console
  error: (msg, ...args) => console.error(`[ServiceManager] ${msg}`, ...args),
};

/** Service name */
const SERVICE_NAME = 'osai';

/** systemd unit file name */
const SYSTEMD_UNIT_NAME = 'osai.service';

/** launchd plist name */
const LAUNCHD_PLIST_NAME = 'com.osai.osai.plist';

/**
 * ServiceManager -- manages osaI as a user-level service.
 *
 * Supports systemd --user on Linux and launchd on macOS.
 */
export class ServiceManager {
  private platform: Platform;
  private logger: ServiceLogger;
  private useSystemd: boolean;
  private useLaunchd: boolean;

  constructor(platform?: Platform, logger?: ServiceLogger) {
    this.platform = platform ?? detectPlatform();
    this.logger = logger ?? defaultLogger;
    // Determine service backend from platform parameter
    this.useSystemd = this.platform === 'linux';
    this.useLaunchd = this.platform === 'macos';
  }

  /**
   * Get the service file installation path.
   */
  getServicePath(): string {
    if (this.useSystemd) {
      return path.join(os.homedir(), '.config', 'systemd', 'user');
    }
    if (this.useLaunchd) {
      return path.join(os.homedir(), 'Library', 'LaunchAgents');
    }
    throw new Error(`Service management not supported on platform: ${this.platform}`);
  }

  /**
   * Get the full path to the service file.
   */
  getServiceFilePath(): string {
    if (this.useSystemd) {
      return path.join(this.getServicePath(), SYSTEMD_UNIT_NAME);
    }
    if (this.useLaunchd) {
      return path.join(this.getServicePath(), LAUNCHD_PLIST_NAME);
    }
    throw new Error(`Service management not supported on platform: ${this.platform}`);
  }

  /**
   * Generate systemd unit file content.
   */
  generateSystemdUnit(options: ServiceOptions): string {
    const execPath = options.execPath;
    const args = (options.args ?? []).join(' ');
    const workingDir = options.workingDirectory ?? process.cwd();
    const envStr = Object.entries(options.env ?? {})
      .map(([k, v]) => `Environment=${k}=${v}`)
      .join('\n');

    const autoRestart = options.autoRestart !== false ? 'always' : 'no';

    return `[Unit]
Description=osaI - Operation System AI
After=network.target

[Service]
Type=simple
ExecStart=${execPath} ${args}
WorkingDirectory=${workingDir}
Restart=${autoRestart}
RestartSec=5
${envStr}
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=default.target
`;
  }

  /**
   * Generate launchd plist content.
   */
  generateLaunchdPlist(options: ServiceOptions): string {
    const execPath = options.execPath;
    const args = options.args ?? [];
    const workingDir = options.workingDirectory ?? process.cwd();

    const programArgs = [execPath, ...args]
      .map((arg) => `    <string>${escapeXml(arg)}</string>`)
      .join('\n');

    const envPairs = Object.entries(options.env ?? {})
      .map(
        ([k, v]) =>
          `      <key>${escapeXml(k)}</key>\n      <string>${escapeXml(v)}</string>`,
      )
      .join('\n');

    const keepAlive = options.autoRestart !== false ? 'true' : 'false';

    return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.osai.osai</string>
    <key>ProgramArguments</key>
    <array>
${programArgs}
    </array>
    <key>WorkingDirectory</key>
    <string>${escapeXml(workingDir)}</string>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <${keepAlive}/>
${envPairs ? `    <key>EnvironmentVariables</key>\n    <dict>\n${envPairs}\n    </dict>\n` : ''}</dict>
</plist>
`;
  }

  /**
   * Install the osaI service.
   */
  async install(options: ServiceOptions): Promise<void> {
    if (!this.useSystemd && !this.useLaunchd) {
      throw new Error(
        `Service management not supported on this platform (platform=${this.platform}, systemd=${this.useSystemd}, launchd=${this.useLaunchd})`,
      );
    }

    const serviceDir = this.getServicePath();
    const serviceFile = this.getServiceFilePath();

    // Create service directory if it doesn't exist
    try {
      await fs.promises.mkdir(serviceDir, { recursive: true });
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to create service directory "${serviceDir}": ${errMsg}`);
    }

    // Generate service file content
    const content = this.useSystemd
      ? this.generateSystemdUnit(options)
      : this.generateLaunchdPlist(options);

    // Write service file
    try {
      await fs.promises.writeFile(serviceFile, content, 'utf-8');
      this.logger.info(`Service file written to ${serviceFile}`);
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to write service file "${serviceFile}": ${errMsg}`);
    }

    // Enable service
    if (this.useSystemd) {
      await this.runSystemdCommand('daemon-reload');
      await this.runSystemdCommand('enable', '--user', SYSTEMD_UNIT_NAME);
      this.logger.info('systemd service enabled');
    } else if (this.useLaunchd) {
      await this.runLaunchdCommand('load', '-w', serviceFile);
      this.logger.info('launchd service loaded');
    }
  }

  /**
   * Uninstall the osaI service.
   */
  async uninstall(): Promise<void> {
    const serviceFile = this.getServiceFilePath();

    // Check if service file exists
    try {
      await fs.promises.access(serviceFile);
    } catch {
      this.logger.info('Service file not found, nothing to uninstall');
      return;
    }

    if (this.useSystemd) {
      try {
        await this.runSystemdCommand('disable', '--user', SERVICE_NAME);
      } catch {
        // Service may not be enabled
      }
      try {
        await this.runSystemdCommand('stop', '--user', SERVICE_NAME);
      } catch {
        // Service may not be running
      }
      try {
        await this.runSystemdCommand('daemon-reload');
      } catch {
        // Ignore errors
      }
    } else if (this.useLaunchd) {
      try {
        await this.runLaunchdCommand('unload', '-w', serviceFile);
      } catch {
        // Service may not be loaded
      }
    }

    // Remove service file
    try {
      await fs.promises.rm(serviceFile);
      this.logger.info(`Service file removed: ${serviceFile}`);
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to remove service file: ${errMsg}`);
    }
  }

  /**
   * Start the service.
   */
  async start(): Promise<void> {
    if (this.useSystemd) {
      await this.runSystemdCommand('start', '--user', SERVICE_NAME);
    } else if (this.useLaunchd) {
      await this.runLaunchdCommand('start', LAUNCHD_PLIST_NAME);
    }
  }

  /**
   * Stop the service.
   */
  async stop(): Promise<void> {
    if (this.useSystemd) {
      await this.runSystemdCommand('stop', '--user', SERVICE_NAME);
    } else if (this.useLaunchd) {
      await this.runLaunchdCommand('stop', LAUNCHD_PLIST_NAME);
    }
  }

  /**
   * Get service status.
   */
  async status(): Promise<ServiceStatus> {
    if (this.useSystemd) {
      try {
        const { stdout } = await execFileAsync('systemctl', [
          '--user',
          'is-active',
          SERVICE_NAME,
        ], { timeout: 5000 });
        const trimmed = stdout.trim();
        if (trimmed === 'active') return 'running';
        if (trimmed === 'inactive') return 'stopped';
        return 'unknown';
      } catch {
        return 'not-installed';
      }
    }
    return 'not-installed';
  }

  /**
   * Check if service management is supported on this platform.
   */
  isSupported(): boolean {
    return this.useSystemd || this.useLaunchd;
  }

  /**
   * Run a systemctl command.
   */
  private async runSystemdCommand(...args: string[]): Promise<void> {
    try {
      await execFileAsync('systemctl', args, { timeout: 10000 });
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      throw new Error(`systemctl ${args.join(' ')} failed: ${errMsg}`);
    }
  }

  /**
   * Run a launchctl command.
   */
  private async runLaunchdCommand(...args: string[]): Promise<void> {
    try {
      await execFileAsync('launchctl', args, { timeout: 10000 });
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      throw new Error(`launchctl ${args.join(' ')} failed: ${errMsg}`);
    }
  }
}

/**
 * Escape special XML characters.
 */
function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
