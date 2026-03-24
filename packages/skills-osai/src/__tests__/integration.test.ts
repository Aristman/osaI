/**
 * Integration tests for all skills together
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createOsIntegrationSkill } from '../skills/OsIntegrationSkill.js';
import { createMemorySkill } from '../skills/MemorySkill.js';
import { createKnowledgeSkill } from '../skills/KnowledgeSkill.js';
import { registerOsaiSkills } from '../register.js';
import { SkillRegistry } from '@osai/agent';
import type { OsIntegrationManager } from '@osai/os-integration';
import type { MemoryManager, LongTermMemory, ShortTermMemory } from '@osai/memory';
import type { ToolContext } from '@osai/agent';

// ---------------------------------------------------------------------------
// Mock factories
// ---------------------------------------------------------------------------

function createMockOsManager(): OsIntegrationManager {
  return {
    notify: vi.fn().mockResolvedValue({ success: true }),
    watchDirectory: vi.fn().mockResolvedValue({ id: 'w1', path: '/tmp', close: vi.fn() }),
    listProcesses: vi.fn().mockResolvedValue([
      { pid: 1, name: 'node', cpu: 5.0, mem: 2.5, command: 'node', user: 'u', started: '2026-01-01', status: 'running' },
    ]),
    getSystemInfo: vi.fn().mockResolvedValue({
      cpu: { model: 'i7', cores: 8, speed: 3.5, usage: 45 },
      memory: { total: 16384, used: 8192, free: 8192, usagePercent: 50 },
      disk: { total: 512000, used: 256000, free: 256000, usagePercent: 50 },
      uptime: 86400,
      hostname: 'test',
      platform: 'linux',
    }),
    getProcessManager: vi.fn().mockReturnValue({ listProcesses: vi.fn().mockResolvedValue([]) }),
    getCapabilities: vi.fn().mockReturnValue({
      platform: 'linux', displayServer: 'x11', traySupported: true,
      notificationsSupported: true, fileWatcherSupported: true,
      serviceManagementSupported: true, hasSystemd: true, hasLaunchd: false,
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

function createMockShortTerm(): ShortTermMemory {
  return {
    add: vi.fn().mockReturnValue('mem_001'),
    get: vi.fn().mockReturnValue({ id: 'mem_001', sessionId: 's1', role: 'user', content: 'test', timestamp: '2026-01-01', category: 'message' }),
    getSessionMessages: vi.fn().mockReturnValue([
      { id: 'm1', sessionId: 's1', role: 'user', content: 'Hello', timestamp: '2026-01-01', category: 'message' },
      { id: 'm2', sessionId: 's1', role: 'assistant', content: 'Hi!', timestamp: '2026-01-01', category: 'message' },
    ]),
    search: vi.fn().mockReturnValue([]),
    clearSession: vi.fn(),
    prune: vi.fn(),
    getCount: vi.fn().mockReturnValue(2),
    close: vi.fn(),
  } as unknown as ShortTermMemory;
}

function createMockLongTerm(): LongTermMemory {
  return {
    addFact: vi.fn().mockReturnValue('fact_integration_001'),
    getFact: vi.fn().mockImplementation((id: string) => {
      if (id === 'fact_integration_001') {
        return { id: 'fact_integration_001', content: 'Integration test fact', category: 'fact' as const, source: 'agent', confidence: 0.8, createdAt: '2026-01-01', updatedAt: '2026-01-01', tags: ['test'] };
      }
      return undefined;
    }),
    updateFact: vi.fn(),
    deleteFact: vi.fn().mockReturnValue(true),
    search: vi.fn().mockImplementation((query: string) => {
      if (query === 'Integration test') {
        return [{ id: 'fact_integration_001', content: 'Integration test fact', category: 'fact' as const, source: 'agent', confidence: 0.8, createdAt: '2026-01-01', updatedAt: '2026-01-01', tags: ['test'] }];
      }
      return [];
    }),
    semanticSearch: vi.fn().mockResolvedValue([]),
    getStats: vi.fn().mockReturnValue({ total: 1, byCategory: { fact: 1 } }),
    close: vi.fn(),
  } as unknown as LongTermMemory;
}

function createMockMemoryManager(): MemoryManager {
  const shortTerm = createMockShortTerm();
  const longTerm = createMockLongTerm();

  return {
    remember: vi.fn().mockResolvedValue('mem_001'),
    recall: vi.fn().mockImplementation(async (_sid, query) => {
      if (query === 'Integration test') {
        return {
          facts: [{ id: 'f1', content: 'Integration test fact', category: 'fact' as const, source: 'agent', confidence: 0.8, createdAt: '2026-01-01', updatedAt: '2026-01-01' }],
          context: 'Integration test fact',
          totalFacts: 1,
          queryTokens: 5,
        };
      }
      return { facts: [], context: '', totalFacts: 0, queryTokens: 0 };
    }),
    forget: vi.fn().mockResolvedValue(true),
    getShortTerm: vi.fn().mockReturnValue(shortTerm),
    getLongTerm: vi.fn().mockReturnValue(longTerm),
    getRagPipeline: vi.fn(),
    close: vi.fn(),
  } as unknown as MemoryManager;
}

const ctx: ToolContext = {
  sessionId: 'integration-session',
  toolCall: { id: 't1', name: 'test', parameters: {} },
  config: {},
};

// ---------------------------------------------------------------------------
// Integration Tests
// ---------------------------------------------------------------------------

describe('Integration Tests', () => {
  let osManager: OsIntegrationManager;
  let memoryManager: MemoryManager;
  let longTerm: LongTermMemory;

  beforeEach(() => {
    osManager = createMockOsManager();
    memoryManager = createMockMemoryManager();
    longTerm = memoryManager.getLongTerm();
    vi.clearAllMocks();
  });

  describe('TC-T006-001: End-to-end memory flow', () => {
    it('should support remember -> recall -> forget flow', async () => {
      const { executors } = createMemorySkill(memoryManager);

      // Step 1: remember
      const rememberResult = await executors['remember']!(
        { content: 'Test memory' },
        ctx,
      );
      expect(rememberResult.success).toBe(true);
      expect(rememberResult.metadata).toHaveProperty('memory_id', 'fact_integration_001');

      // Step 2: recall
      const recallResult = await executors['recall']!(
        { query: 'Integration test' },
        ctx,
      );
      expect(recallResult.success).toBe(true);
      expect((recallResult.metadata as Record<string, unknown>)['total_facts']).toBe(1);

      // Step 3: forget
      const forgetResult = await executors['forget']!(
        { memory_id: 'mem_001' },
        ctx,
      );
      expect(forgetResult.success).toBe(true);
    });
  });

  describe('TC-T006-002: End-to-end knowledge base flow', () => {
    it('should support ingest -> query -> list -> remove flow', async () => {
      const { executors } = createKnowledgeSkill(longTerm);

      // Step 1: ingest
      const ingestResult = await executors['ingest_document']!(
        { content: 'Test document content for integration.', source: '/test.md', tags: ['spec'] },
        ctx,
      );
      expect(ingestResult.success).toBe(true);
      expect(ingestResult.metadata).toHaveProperty('document_id');
      expect(ingestResult.metadata).toHaveProperty('chunks_count');

      // Step 2: query
      const queryResult = await executors['query_knowledge']!(
        { query: 'Integration test' },
        ctx,
      );
      expect(queryResult.success).toBe(true);
      expect(queryResult.metadata).toHaveProperty('results');

      // Step 3: list
      const listResult = await executors['list_sources']!({}, ctx);
      expect(listResult.success).toBe(true);
      expect(listResult.metadata).toHaveProperty('sources');

      // Step 4: remove
      const removeResult = await executors['remove_source']!(
        { document_id: 'fact_integration_001' },
        ctx,
      );
      expect(removeResult.success).toBe(true);
    });
  });

  describe('TC-T006-003: End-to-end OS integration flow', () => {
    it('should support get_system_info and show_notification', async () => {
      const { executors } = createOsIntegrationSkill(osManager);

      // Step 1: get_system_info
      const sysInfoResult = await executors['get_system_info']!({}, ctx);
      expect(sysInfoResult.success).toBe(true);
      expect(sysInfoResult.metadata).toHaveProperty('cpu');
      expect(sysInfoResult.metadata).toHaveProperty('memory');
      expect(sysInfoResult.metadata).toHaveProperty('disk');
      expect(sysInfoResult.metadata).toHaveProperty('os');

      // Step 2: show_notification
      const notifResult = await executors['show_notification']!(
        { title: 'Info', body: 'System check complete.' },
        ctx,
      );
      expect(notifResult.success).toBe(true);
    });
  });

  describe('TC-T006-004: All skills together via registry', () => {
    it('should register all skills and resolve executors', () => {
      const registry = new SkillRegistry();
      registerOsaiSkills(registry, { osIntegration: osManager, memoryManager });

      const skills = registry.listSkills();
      expect(skills).toHaveLength(3);

      const skillNames = skills.map((s) => s.name);
      expect(skillNames).toContain('os-integration');
      expect(skillNames).toContain('memory');
      expect(skillNames).toContain('knowledge-base');
    });

    it('should provide namespaced tool schemas', () => {
      const registry = new SkillRegistry();
      registerOsaiSkills(registry, { osIntegration: osManager, memoryManager });

      const schemas = registry.getToolSchemas();

      // Should have 5 os-integration + 4 memory + 4 knowledge-base = 13 tools
      expect(schemas).toHaveLength(13);

      // Check namespace format
      expect(schemas.some((s) => s.name === 'os-integration.show_notification')).toBe(true);
      expect(schemas.some((s) => s.name === 'memory.remember')).toBe(true);
      expect(schemas.some((s) => s.name === 'knowledge-base.ingest_document')).toBe(true);
    });

    it('should resolve executors for namespaced tools', async () => {
      const registry = new SkillRegistry();
      registerOsaiSkills(registry, { osIntegration: osManager, memoryManager });

      const executor = registry.getToolExecutor('memory.remember');
      expect(executor).toBeDefined();

      const result = await executor!(
        { content: 'Test' },
        ctx,
      );
      expect(result.success).toBe(true);
    });

    it('should resolve os-integration executors', async () => {
      const registry = new SkillRegistry();
      registerOsaiSkills(registry, { osIntegration: osManager, memoryManager });

      const executor = registry.getToolExecutor('os-integration.get_system_info');
      expect(executor).toBeDefined();

      const result = await executor!({}, ctx);
      expect(result.success).toBe(true);
    });

    it('should resolve knowledge-base executors', async () => {
      const registry = new SkillRegistry();
      registerOsaiSkills(registry, { osIntegration: osManager, memoryManager });

      const executor = registry.getToolExecutor('knowledge-base.list_sources');
      expect(executor).toBeDefined();

      const result = await executor!({}, ctx);
      expect(result.success).toBe(true);
    });

    it('should return undefined for unknown tool', () => {
      const registry = new SkillRegistry();
      registerOsaiSkills(registry, { osIntegration: osManager, memoryManager });

      const executor = registry.getToolExecutor('unknown.tool');
      expect(executor).toBeUndefined();
    });

    it('should support unregistering skills', () => {
      const registry = new SkillRegistry();
      registerOsaiSkills(registry, { osIntegration: osManager, memoryManager });

      const removed = registry.unregister('memory');
      expect(removed).toBe(true);
      expect(registry.listSkills()).toHaveLength(2);
      expect(registry.getToolExecutor('memory.remember')).toBeUndefined();
    });

    it('should handle partial registration (OS only)', () => {
      const registry = new SkillRegistry();
      registerOsaiSkills(registry, { osIntegration: osManager });

      const skills = registry.listSkills();
      expect(skills).toHaveLength(1);
      expect(skills[0]!.name).toBe('os-integration');
    });

    it('should handle partial registration (memory only)', () => {
      const registry = new SkillRegistry();
      registerOsaiSkills(registry, { memoryManager });

      const skills = registry.listSkills();
      expect(skills).toHaveLength(2);
      const names = skills.map((s) => s.name);
      expect(names).toContain('memory');
      expect(names).toContain('knowledge-base');
    });

    it('should handle empty config', () => {
      const registry = new SkillRegistry();
      registerOsaiSkills(registry);

      expect(registry.listSkills()).toHaveLength(0);
    });
  });
});
