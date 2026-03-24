/**
 * OsIntegrationSkill tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createOsIntegrationSkill, createOsIntegrationSkillDefinition } from '../skills/OsIntegrationSkill.js';
import type { OsIntegrationManager } from '@osai/os-integration';
import type { ToolContext } from '@osai/agent';

// ---------------------------------------------------------------------------
// Mock OsIntegrationManager
// ---------------------------------------------------------------------------

function createMockOsIntegrationManager(): OsIntegrationManager {
  return {
    notify: vi.fn(),
    watchDirectory: vi.fn(),
    listProcesses: vi.fn(),
    getSystemInfo: vi.fn(),
    getProcessManager: vi.fn(),
    getCapabilities: vi.fn().mockReturnValue({
      platform: 'linux',
      displayServer: 'x11',
      traySupported: true,
      notificationsSupported: true,
      fileWatcherSupported: true,
      serviceManagementSupported: true,
      hasSystemd: true,
      hasLaunchd: false,
      isDesktopEnvironment: true,
    }),
    isCapable: vi.fn(),
    initialize: vi.fn(),
    shutdown: vi.fn(),
    createTray: vi.fn(),
    getTray: vi.fn(),
    updateTrayStatus: vi.fn(),
    getNotifications: vi.fn(),
    getFileWatcher: vi.fn(),
    getServiceManager: vi.fn(),
    isInitialized: vi.fn().mockReturnValue(true),
    installService: vi.fn(),
    uninstallService: vi.fn(),
  } as unknown as OsIntegrationManager;
}

const defaultContext: ToolContext = {
  sessionId: 'test-session-001',
  toolCall: {
    id: 'tool-1',
    name: 'os-integration.show_notification',
    parameters: {},
  },
  config: {},
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('OsIntegrationSkill', () => {
  let manager: OsIntegrationManager;

  beforeEach(() => {
    manager = createMockOsIntegrationManager();
    vi.clearAllMocks();
  });

  describe('SkillDefinition', () => {
    it('TC-T004-001: should return definition with 5 tools', () => {
      const definition = createOsIntegrationSkillDefinition();
      expect(definition.name).toBe('os-integration');
      expect(definition.version).toBe('1.0.0');
      expect(definition.tools).toHaveLength(5);
      expect(definition.category).toBe('system');
    });

    it('should have correct tool names', () => {
      const definition = createOsIntegrationSkillDefinition();
      const toolNames = definition.tools.map((t) => t.name);
      expect(toolNames).toContain('show_notification');
      expect(toolNames).toContain('watch_directory');
      expect(toolNames).toContain('list_processes');
      expect(toolNames).toContain('open_application');
      expect(toolNames).toContain('get_system_info');
    });

    it('should have all tools with system category', () => {
      const definition = createOsIntegrationSkillDefinition();
      for (const tool of definition.tools) {
        expect(tool.category).toBe('system');
      }
    });

    it('should have valid JSON Schema parameters for each tool', () => {
      const definition = createOsIntegrationSkillDefinition();
      for (const tool of definition.tools) {
        expect(tool.parameters).toBeDefined();
        expect(tool.parameters).toHaveProperty('type', 'object');
        expect(tool.parameters).toHaveProperty('properties');
      }
    });
  });

  describe('show_notification', () => {
    it('TC-T001-001: should show notification with valid parameters', async () => {
      vi.mocked(manager.notify).mockResolvedValue({
        success: true,
      });

      const { executors } = createOsIntegrationSkill(manager);
      const result = await executors['show_notification'](
        { title: 'Test', body: 'Message', urgency: 'normal' },
        defaultContext,
      );

      expect(result.success).toBe(true);
      expect(manager.notify).toHaveBeenCalledWith('Test', 'Message', 'normal');
    });

    it('TC-T001-002: should reject invalid urgency', async () => {
      const { executors } = createOsIntegrationSkill(manager);
      const result = await executors['show_notification'](
        { title: 'Test', body: 'Message', urgency: 'invalid' },
        defaultContext,
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('urgency');
    });

    it('should default urgency to normal when not provided', async () => {
      vi.mocked(manager.notify).mockResolvedValue({
        success: true,
      });

      const { executors } = createOsIntegrationSkill(manager);
      await executors['show_notification'](
        { title: 'Test', body: 'Message' },
        defaultContext,
      );

      expect(manager.notify).toHaveBeenCalledWith('Test', 'Message', 'normal');
    });

    it('should fail when title is missing', async () => {
      const { executors } = createOsIntegrationSkill(manager);
      const result = await executors['show_notification'](
        { body: 'Message' },
        defaultContext,
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('title');
    });

    it('should fail when body is missing', async () => {
      const { executors } = createOsIntegrationSkill(manager);
      const result = await executors['show_notification'](
        { title: 'Test' },
        defaultContext,
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('body');
    });

    it('should handle notification not supported', async () => {
      vi.mocked(manager.notify).mockResolvedValue(null);

      const { executors } = createOsIntegrationSkill(manager);
      const result = await executors['show_notification'](
        { title: 'Test', body: 'Message' },
        defaultContext,
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('not supported');
    });

    it('should handle manager error', async () => {
      vi.mocked(manager.notify).mockRejectedValue(
        new Error('Notification service unavailable'),
      );

      const { executors } = createOsIntegrationSkill(manager);
      const result = await executors['show_notification'](
        { title: 'Test', body: 'Message' },
        defaultContext,
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Notification service unavailable');
    });
  });

  describe('watch_directory', () => {
    it('TC-T001-003: should watch directory and return watcher ID', async () => {
      vi.mocked(manager.watchDirectory).mockResolvedValue({
        id: 'watcher-001',
        path: '/tmp/test',
        close: vi.fn(),
      });

      const { executors } = createOsIntegrationSkill(manager);
      const result = await executors['watch_directory'](
        { path: '/tmp/test', events: ['create', 'modify'] },
        defaultContext,
      );

      expect(result.success).toBe(true);
      expect(result.metadata).toHaveProperty('watcher_id', 'watcher-001');
      expect(manager.watchDirectory).toHaveBeenCalledWith(
        '/tmp/test',
        ['create', 'modify'],
      );
    });

    it('should handle file watcher not available', async () => {
      vi.mocked(manager.watchDirectory).mockResolvedValue(null);

      const { executors } = createOsIntegrationSkill(manager);
      const result = await executors['watch_directory'](
        { path: '/tmp/test' },
        defaultContext,
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('not available');
    });

    it('should filter invalid event types', async () => {
      vi.mocked(manager.watchDirectory).mockResolvedValue({
        id: 'watcher-002',
        path: '/tmp/test',
        close: vi.fn(),
      });

      const { executors } = createOsIntegrationSkill(manager);
      await executors['watch_directory'](
        { path: '/tmp/test', events: ['create', 'invalid', 'modify'] },
        defaultContext,
      );

      expect(manager.watchDirectory).toHaveBeenCalledWith(
        '/tmp/test',
        ['create', 'modify'],
      );
    });
  });

  describe('list_processes', () => {
    it('TC-T001-004: should list processes with optional filter', async () => {
      const mockProcesses = [
        { pid: 1, name: 'node', cpu: 5.0, mem: 2.5, command: 'node app.js', user: 'user', started: '2026-01-01', status: 'running' },
        { pid: 2, name: 'node', cpu: 1.0, mem: 1.0, command: 'node test.js', user: 'user', started: '2026-01-01', status: 'running' },
      ];
      vi.mocked(manager.listProcesses).mockResolvedValue(mockProcesses);

      const { executors } = createOsIntegrationSkill(manager);
      const result = await executors['list_processes'](
        { filter: 'node' },
        defaultContext,
      );

      expect(result.success).toBe(true);
      expect(result.metadata).toHaveProperty('processes');
      expect((result.metadata as Record<string, unknown>)['processes']).toHaveLength(2);
      expect(manager.listProcesses).toHaveBeenCalledWith('node');
    });

    it('should list all processes without filter', async () => {
      vi.mocked(manager.listProcesses).mockResolvedValue([]);

      const { executors } = createOsIntegrationSkill(manager);
      const result = await executors['list_processes']({}, defaultContext);

      expect(result.success).toBe(true);
      expect(manager.listProcesses).toHaveBeenCalledWith(undefined);
    });

    it('should handle list processes error', async () => {
      vi.mocked(manager.listProcesses).mockRejectedValue(
        new Error('Process list failed'),
      );

      const { executors } = createOsIntegrationSkill(manager);
      const result = await executors['list_processes']({}, defaultContext);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Process list failed');
    });
  });

  describe('open_application', () => {
    it('TC-T001-005: should open application', async () => {
      const mockProcessManager = { listProcesses: vi.fn().mockResolvedValue([]) };
      vi.mocked(manager.getProcessManager).mockReturnValue(
        mockProcessManager as unknown as ReturnType<NonNullable<OsIntegrationManager['getProcessManager']>>,
      );

      const { executors } = createOsIntegrationSkill(manager);
      const result = await executors['open_application'](
        { app_name: 'code', args: ['/path/to/project'] },
        defaultContext,
      );

      expect(result.success).toBe(true);
      expect(result.metadata).toHaveProperty('app_name', 'code');
    });

    it('should fail without app_name', async () => {
      const { executors } = createOsIntegrationSkill(manager);
      const result = await executors['open_application']({}, defaultContext);

      expect(result.success).toBe(false);
      expect(result.error).toContain('app_name');
    });

    it('should handle process manager not available', async () => {
      vi.mocked(manager.getProcessManager).mockReturnValue(null);

      const { executors } = createOsIntegrationSkill(manager);
      const result = await executors['open_application'](
        { app_name: 'code' },
        defaultContext,
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('not available');
    });
  });

  describe('get_system_info', () => {
    it('TC-T001-006: should return system info', async () => {
      const mockSysInfo = {
        cpu: { model: 'Intel i7', cores: 8, speed: 3.5, usage: 45 },
        memory: { total: 16384, used: 8192, free: 8192, usagePercent: 50 },
        disk: { total: 512000, used: 256000, free: 256000, usagePercent: 50 },
        uptime: 86400,
        hostname: 'test-host',
        platform: 'linux',
      };
      vi.mocked(manager.getSystemInfo).mockResolvedValue(mockSysInfo);

      const { executors } = createOsIntegrationSkill(manager);
      const result = await executors['get_system_info']({}, defaultContext);

      expect(result.success).toBe(true);
      expect(result.metadata).toHaveProperty('cpu');
      expect(result.metadata).toHaveProperty('memory');
      expect(result.metadata).toHaveProperty('disk');
      expect(result.metadata).toHaveProperty('os');
    });

    it('should handle system info not available', async () => {
      vi.mocked(manager.getSystemInfo).mockResolvedValue(null);

      const { executors } = createOsIntegrationSkill(manager);
      const result = await executors['get_system_info']({}, defaultContext);

      expect(result.success).toBe(false);
      expect(result.error).toContain('not available');
    });

    it('should handle get system info error', async () => {
      vi.mocked(manager.getSystemInfo).mockRejectedValue(
        new Error('System info failed'),
      );

      const { executors } = createOsIntegrationSkill(manager);
      const result = await executors['get_system_info']({}, defaultContext);

      expect(result.success).toBe(false);
      expect(result.error).toContain('System info failed');
    });
  });
});
