/**
 * Hook tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  createBeforeMemoryQueryHook,
  createAfterMemoryExtractHook,
  createOnFileAccessHook,
  createOnDesktopNotificationHook,
  registerOsaiHooks,
} from '../hooks/index.js';
import type { HookContext } from '@osai/agent';
import type { MemoryManager, RagResult } from '@osai/memory';
import type { OsIntegrationManager } from '@osai/os-integration';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

function createMockMemoryManager(): MemoryManager {
  return {
    remember: vi.fn().mockResolvedValue('mem_001'),
    recall: vi.fn().mockResolvedValue({
      facts: [{ id: 'f1', content: 'test', category: 'fact' as const, source: 'agent', confidence: 0.8, createdAt: '2026-01-01', updatedAt: '2026-01-01' }],
      context: 'test context',
      totalFacts: 1,
      queryTokens: 5,
    }),
    forget: vi.fn().mockResolvedValue(true),
    getShortTerm: vi.fn().mockReturnValue({
      add: vi.fn(),
      get: vi.fn(),
      getSessionMessages: vi.fn().mockReturnValue([]),
      search: vi.fn().mockReturnValue([]),
      clearSession: vi.fn(),
      prune: vi.fn(),
      getCount: vi.fn().mockReturnValue(0),
      close: vi.fn(),
    }),
    getLongTerm: vi.fn().mockReturnValue({
      addFact: vi.fn().mockReturnValue('fact_hook'),
      getFact: vi.fn(),
      updateFact: vi.fn(),
      deleteFact: vi.fn(),
      search: vi.fn().mockReturnValue([]),
      semanticSearch: vi.fn().mockResolvedValue([]),
      getStats: vi.fn().mockReturnValue({ total: 0, byCategory: {} }),
      close: vi.fn(),
    }),
    getRagPipeline: vi.fn(),
    close: vi.fn(),
  } as unknown as MemoryManager;
}

function createMockOsIntegrationManager(): OsIntegrationManager {
  return {
    notify: vi.fn().mockResolvedValue({ success: true }),
    initialize: vi.fn(),
    shutdown: vi.fn(),
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

function createContext(overrides: Partial<HookContext> = {}): HookContext {
  return {
    hookPoint: 'before_memory_query',
    sessionId: 'test-session-001',
    data: {},
    abort: false,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Hooks', () => {
  let memoryManager: MemoryManager;
  let osIntegrationManager: OsIntegrationManager;

  beforeEach(() => {
    memoryManager = createMockMemoryManager();
    osIntegrationManager = createMockOsIntegrationManager();
    vi.clearAllMocks();
  });

  describe('before_memory_query hook', () => {
    it('TC-T005-001: should enrich context with memory_context', async () => {
      const hook = createBeforeMemoryQueryHook(memoryManager);
      const context = createContext({ data: { query: 'test query' } });

      const result = await hook.handler(context);

      expect(result.data.memory_context).toBeDefined();
      expect((result.data.memory_context as RagResult).facts).toHaveLength(1);
      expect(memoryManager.recall).toHaveBeenCalledWith(
        'test-session-001',
        'test query',
        { maxResults: 5 },
      );
    });

    it('should return unchanged context when no query provided', async () => {
      const hook = createBeforeMemoryQueryHook(memoryManager);
      const context = createContext({ data: {} });

      const result = await hook.handler(context);

      expect(result.data.memory_context).toBeUndefined();
      expect(memoryManager.recall).not.toHaveBeenCalled();
    });

    it('should not crash when recall throws', async () => {
      vi.mocked(memoryManager.recall).mockRejectedValue(
        new Error('RAG error'),
      );

      const hook = createBeforeMemoryQueryHook(memoryManager);
      const context = createContext({ data: { query: 'test' } });

      // Should not throw
      const result = await hook.handler(context);
      expect(result).toBeDefined();
    });

    it('should have priority 10', () => {
      const hook = createBeforeMemoryQueryHook(memoryManager);
      expect(hook.priority).toBe(10);
    });
  });

  describe('after_memory_extract hook', () => {
    it('TC-T005-002: should store extracted fact in MemoryManager', async () => {
      const hook = createAfterMemoryExtractHook(memoryManager);
      const context = createContext({
        data: { content: 'Important fact extracted', category: 'fact' },
      });

      const result = await hook.handler(context);

      expect(result.data.extracted_fact_id).toBe('fact_hook');
      const longTerm = memoryManager.getLongTerm();
      expect(longTerm.addFact).toHaveBeenCalledWith(
        expect.objectContaining({
          content: 'Important fact extracted',
          category: 'fact',
          source: 'hook:after_memory_extract',
        }),
      );
    });

    it('should return unchanged context when no content provided', async () => {
      const hook = createAfterMemoryExtractHook(memoryManager);
      const context = createContext({ data: {} });

      const result = await hook.handler(context);

      expect(result.data.extracted_fact_id).toBeUndefined();
    });

    it('should default category to fact', async () => {
      const hook = createAfterMemoryExtractHook(memoryManager);
      const context = createContext({
        data: { content: 'Some content' },
      });

      await hook.handler(context);

      const longTerm = memoryManager.getLongTerm();
      expect(longTerm.addFact).toHaveBeenCalledWith(
        expect.objectContaining({
          category: 'fact',
        }),
      );
    });

    it('should have priority 50', () => {
      const hook = createAfterMemoryExtractHook(memoryManager);
      expect(hook.priority).toBe(50);
    });
  });

  describe('on_file_access hook', () => {
    it('TC-T005-003: should create audit log entry for file access', async () => {
      const hook = createOnFileAccessHook();
      const context = createContext({
        data: { path: '/test/file.txt', tool: 'read_file', action: 'file_access' },
      });

      const result = await hook.handler(context);

      const auditLog = result.data.audit_log as Array<Record<string, unknown>>;
      expect(auditLog).toBeDefined();
      expect(auditLog).toHaveLength(1);
      expect(auditLog[0]!.action).toBe('file_access');
      expect(auditLog[0]!.path).toBe('/test/file.txt');
      expect(auditLog[0]!.tool).toBe('read_file');
      expect(auditLog[0]!.timestamp).toBeDefined();
    });

    it('should accumulate audit entries', async () => {
      const hook = createOnFileAccessHook();
      const context = createContext({
        data: {
          audit_log: [{ action: 'previous', path: '/old', tool: 't', timestamp: '2026-01-01' }],
          path: '/new/file.txt',
          tool: 'write_file',
          action: 'file_access',
        },
      });

      const result = await hook.handler(context);

      const auditLog = result.data.audit_log as unknown[];
      expect(auditLog).toHaveLength(2);
    });

    it('should have priority 20', () => {
      const hook = createOnFileAccessHook();
      expect(hook.priority).toBe(20);
    });
  });

  describe('on_desktop_notification hook', () => {
    it('TC-T005-004: should send notification via OsIntegrationManager', async () => {
      const hook = createOnDesktopNotificationHook(osIntegrationManager);
      const context = createContext({
        data: {
          notification: { title: 'Test', body: 'Body', urgency: 'normal' },
        },
      });

      const result = await hook.handler(context);

      expect(osIntegrationManager.notify).toHaveBeenCalledWith(
        'Test',
        'Body',
        'normal',
      );
      expect(result.data.notification_result).toBeDefined();
    });

    it('should return unchanged context when no notification data', async () => {
      const hook = createOnDesktopNotificationHook(osIntegrationManager);
      const context = createContext({ data: {} });

      const result = await hook.handler(context);

      expect(result.data.notification_result).toBeUndefined();
      expect(osIntegrationManager.notify).not.toHaveBeenCalled();
    });

    it('should not crash when notify throws', async () => {
      vi.mocked(osIntegrationManager.notify).mockRejectedValue(
        new Error('Notification error'),
      );

      const hook = createOnDesktopNotificationHook(osIntegrationManager);
      const context = createContext({
        data: { notification: { title: 'Test', body: 'Body' } },
      });

      const result = await hook.handler(context);
      expect(result).toBeDefined();
    });

    it('should have priority 90', () => {
      const hook = createOnDesktopNotificationHook(osIntegrationManager);
      expect(hook.priority).toBe(90);
    });
  });

  describe('registerOsaiHooks', () => {
    it('should register all hooks with managers provided', () => {
      const mockHookManager = {
        registerHook: vi.fn().mockReturnValue('hook-id'),
      };

      const registrations = registerOsaiHooks(mockHookManager, {
        memoryManager,
        osIntegrationManager,
      });

      expect(registrations).toHaveLength(4);
      expect(mockHookManager.registerHook).toHaveBeenCalledTimes(4);
    });

    it('should register only file access hook without managers', () => {
      const mockHookManager = {
        registerHook: vi.fn().mockReturnValue('hook-id'),
      };

      const registrations = registerOsaiHooks(mockHookManager);

      expect(registrations).toHaveLength(1);
      expect(registrations[0]!.id).toBe('osai-on-file-access');
    });

    it('should register memory hooks without os integration', () => {
      const mockHookManager = {
        registerHook: vi.fn().mockReturnValue('hook-id'),
      };

      const registrations = registerOsaiHooks(mockHookManager, {
        memoryManager,
      });

      expect(registrations).toHaveLength(3);
    });
  });
});
