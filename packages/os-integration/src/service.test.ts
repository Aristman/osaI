import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Platform } from './types.js';

// Mock child_process to avoid calling real systemctl/launchctl
const mockExecFile = vi.fn();
vi.mock('node:child_process', () => ({
  execFile: (...args: unknown[]) => {
    mockExecFile(...args);
    // Extract callback from args
    const callback = args.find((a) => typeof a === 'function') as (err: Error | null, stdout?: string, stderr?: string) => void;
    if (callback) {
      const err = new Error('Command not available in test');
      (err as unknown as Record<string, unknown>).code = 'ENOENT';
      callback(err, '', '');
    }
  },
}));

// Import after mock setup
const { ServiceManager } = await import('./service.js');

describe('ServiceManager', () => {
  beforeEach(() => {
    mockExecFile.mockClear();
  });

  describe('UT-007-01: instantiation', () => {
    it('creates instance on linux', () => {
      const manager = new ServiceManager('linux');
      expect(manager).toBeInstanceOf(ServiceManager);
    });

    it('creates instance on macOS', () => {
      const manager = new ServiceManager('macos');
      expect(manager).toBeInstanceOf(ServiceManager);
    });
  });

  describe('UT-007-02: generateSystemdUnit creates valid content', () => {
    it('generates valid systemd unit file', () => {
      const manager = new ServiceManager('linux');
      const content = manager.generateSystemdUnit({
        execPath: '/usr/bin/node',
        args: ['/opt/osai/index.js'],
      });

      expect(content).toContain('[Unit]');
      expect(content).toContain('[Service]');
      expect(content).toContain('[Install]');
      expect(content).toContain('ExecStart=/usr/bin/node /opt/osai/index.js');
      expect(content).toContain('Description=osaI');
      expect(content).toContain('WantedBy=default.target');
    });

    it('includes environment variables', () => {
      const manager = new ServiceManager('linux');
      const content = manager.generateSystemdUnit({
        execPath: '/usr/bin/node',
        env: { NODE_ENV: 'production', PORT: '3000' },
      });

      expect(content).toContain('Environment=NODE_ENV=production');
      expect(content).toContain('Environment=PORT=3000');
    });

    it('includes working directory', () => {
      const manager = new ServiceManager('linux');
      const content = manager.generateSystemdUnit({
        execPath: '/usr/bin/node',
        workingDirectory: '/opt/osai',
      });

      expect(content).toContain('WorkingDirectory=/opt/osai');
    });

    it('sets Restart=always by default', () => {
      const manager = new ServiceManager('linux');
      const content = manager.generateSystemdUnit({
        execPath: '/usr/bin/node',
      });

      expect(content).toContain('Restart=always');
    });

    it('sets Restart=no when autoRestart=false', () => {
      const manager = new ServiceManager('linux');
      const content = manager.generateSystemdUnit({
        execPath: '/usr/bin/node',
        autoRestart: false,
      });

      expect(content).toContain('Restart=no');
    });
  });

  describe('UT-007-03: generateLaunchdPlist creates valid XML', () => {
    it('generates valid plist XML', () => {
      const manager = new ServiceManager('macos');
      const content = manager.generateLaunchdPlist({
        execPath: '/usr/local/bin/node',
        args: ['/opt/osai/index.js'],
      });

      expect(content).toContain('<?xml version="1.0"');
      expect(content).toContain('<plist version="1.0">');
      expect(content).toContain('<key>Label</key>');
      expect(content).toContain('<string>com.osai.osai</string>');
      expect(content).toContain('<key>ProgramArguments</key>');
      expect(content).toContain('<string>/usr/local/bin/node</string>');
      expect(content).toContain('<string>/opt/osai/index.js</string>');
    });

    it('escapes XML special characters', () => {
      const manager = new ServiceManager('macos');
      const content = manager.generateLaunchdPlist({
        execPath: '/usr/local/bin/node',
        workingDirectory: '/path with & special < chars > "here"',
      });

      expect(content).not.toContain('& special');
      expect(content).toContain('&amp;');
    });

    it('includes KeepAlive=true by default', () => {
      const manager = new ServiceManager('macos');
      const content = manager.generateLaunchdPlist({
        execPath: '/usr/local/bin/node',
      });

      expect(content).toContain('<true/>');
      expect(content).toContain('KeepAlive');
    });

    it('sets KeepAlive=false when autoRestart=false', () => {
      const manager = new ServiceManager('macos');
      const content = manager.generateLaunchdPlist({
        execPath: '/usr/local/bin/node',
        autoRestart: false,
      });

      expect(content).toContain('<false/>');
    });
  });

  describe('UT-007-04: getServicePath returns correct paths', () => {
    it('returns Linux systemd path', () => {
      const manager = new ServiceManager('linux');
      const servicePath = manager.getServicePath();
      expect(servicePath).toContain('.config');
      expect(servicePath).toContain('systemd');
      expect(servicePath).toContain('user');
    });

    it('returns macOS launchd path', () => {
      const manager = new ServiceManager('macos');
      const servicePath = manager.getServicePath();
      expect(servicePath).toContain('Library');
      expect(servicePath).toContain('LaunchAgents');
    });

    it('throws on unsupported platform', () => {
      const manager = new ServiceManager('unknown' as Platform);
      expect(() => manager.getServicePath()).toThrow('not supported');
    });
  });

  describe('UT-007-05: isSupported', () => {
    it('returns true for linux (systemd)', () => {
      const linuxManager = new ServiceManager('linux');
      expect(linuxManager.isSupported()).toBe(true);
    });

    it('returns true for macOS (launchd)', () => {
      const macManager = new ServiceManager('macos');
      expect(macManager.isSupported()).toBe(true);
    });

    it('returns false for unknown platform', () => {
      const manager = new ServiceManager('unknown' as Platform);
      expect(manager.isSupported()).toBe(false);
    });
  });

  describe('UT-007-06: install handles errors', () => {
    it('throws when platform is unsupported', async () => {
      const manager = new ServiceManager('unknown' as Platform);
      await expect(
        manager.install({ execPath: '/usr/bin/node' }),
      ).rejects.toThrow('not supported');
    });
  });

  describe('status', () => {
    it('returns not-installed when systemctl fails', async () => {
      const manager = new ServiceManager('linux');
      const result = await manager.status();
      expect(result).toBe('not-installed');
    });

    it('returns not-installed on unsupported platform', async () => {
      const manager = new ServiceManager('unknown' as Platform);
      const result = await manager.status();
      expect(result).toBe('not-installed');
    });
  });

  describe('uninstall', () => {
    it('does not throw when service file does not exist', async () => {
      const manager = new ServiceManager('linux');
      // Service file doesn't exist in ~/.config/systemd/user/
      // fs.promises.access will fail, and manager will return early
      await manager.uninstall();
    });
  });
});
