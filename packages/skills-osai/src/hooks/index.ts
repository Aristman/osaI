/**
 * @osai/skills-osai -- osaI-specific hooks
 *
 * Provides hooks for memory integration, file access auditing,
 * and desktop notification handling.
 */

import type {
  HookPoint,
  HookContext,
  HookHandler,
} from '@osai/agent';
import type { MemoryManager } from '@osai/memory';
import type { OsIntegrationManager } from '@osai/os-integration';

// ---------------------------------------------------------------------------
// Hook Definitions
// ---------------------------------------------------------------------------

export interface OsaiHookRegistration {
  point: HookPoint;
  id: string;
  handler: HookHandler;
  priority: number;
}

// ---------------------------------------------------------------------------
// Hook Creators
// ---------------------------------------------------------------------------

/**
 * Create a before_memory_query hook.
 * Extracts query from context, calls MemoryManager.recall,
 * and injects results into context.data.memory_context.
 */
export function createBeforeMemoryQueryHook(
  memoryManager: MemoryManager,
): OsaiHookRegistration {
  return {
    point: 'before_memory_query',
    id: 'osai-before-memory-query',
    priority: 10,
    handler: async (context: HookContext): Promise<HookContext> => {
      const query = context.data['query'] as string | undefined;
      if (!query) return context;

      try {
        const result = await memoryManager.recall(context.sessionId, query, {
          maxResults: 5,
        });

        return {
          ...context,
          data: {
            ...context.data,
            memory_context: {
              facts: result.facts,
              context: result.context,
              totalFacts: result.totalFacts,
            },
          },
        };
      } catch {
        // Hooks should not crash the agent loop
        return context;
      }
    },
  };
}

/**
 * Create an after_memory_extract hook.
 * Extracts facts from toolResult and stores them in MemoryManager.
 */
export function createAfterMemoryExtractHook(
  memoryManager: MemoryManager,
): OsaiHookRegistration {
  return {
    point: 'after_memory_extract',
    id: 'osai-after-memory-extract',
    priority: 50,
    handler: async (context: HookContext): Promise<HookContext> => {
      const content = context.data['content'] as string | undefined;
      const category = context.data['category'] as string | undefined;

      if (!content) return context;

      try {
        const longTerm = memoryManager.getLongTerm();
        const factId = longTerm.addFact({
          content,
          category: (category as 'fact' | 'preference' | 'knowledge' | 'error' | 'pattern') ?? 'fact',
          source: 'hook:after_memory_extract',
          confidence: 0.7,
          sessionId: context.sessionId,
        });

        return {
          ...context,
          data: {
            ...context.data,
            extracted_fact_id: factId,
          },
        };
      } catch {
        return context;
      }
    },
  };
}

/**
 * Create an on_file_access hook.
 * Logs file access actions to audit log in context data.
 */
export function createOnFileAccessHook(): OsaiHookRegistration {
  return {
    point: 'on_file_access',
    id: 'osai-on-file-access',
    priority: 20,
    handler: async (context: HookContext): Promise<HookContext> => {
      const path = context.data['path'] as string | undefined;
      const tool = context.data['tool'] as string | undefined;
      const action = context.data['action'] as string | undefined;

      const auditEntry = {
        action: action ?? 'file_access',
        path: path ?? 'unknown',
        tool: tool ?? 'unknown',
        timestamp: new Date().toISOString(),
        session_id: context.sessionId,
      };

      const existingAudit = (context.data['audit_log'] as Array<Record<string, unknown>>) ?? [];
      return {
        ...context,
        data: {
          ...context.data,
          audit_log: [...existingAudit, auditEntry],
        },
      };
    },
  };
}

/**
 * Create an on_desktop_notification hook.
 * Extracts notification data from context and sends via OsIntegrationManager.
 */
export function createOnDesktopNotificationHook(
  osIntegrationManager: OsIntegrationManager,
): OsaiHookRegistration {
  return {
    point: 'on_desktop_notification',
    id: 'osai-on-desktop-notification',
    priority: 90,
    handler: async (context: HookContext): Promise<HookContext> => {
      const notification = context.data['notification'] as
        | { title: string; body: string; urgency?: string }
        | undefined;

      if (!notification) return context;

      try {
        const result = await osIntegrationManager.notify(
          notification.title,
          notification.body,
          notification.urgency as 'low' | 'normal' | 'critical' | undefined,
        );

        return {
          ...context,
          data: {
            ...context.data,
            notification_result: result,
          },
        };
      } catch {
        return context;
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Hook Registration Helper
// ---------------------------------------------------------------------------

/**
 * Register all osaI-specific hooks with a HookManager-compatible object.
 * Returns an array of hook registration IDs for later cleanup.
 */
export function registerOsaiHooks(
  hookManager: {
    registerHook: (point: HookPoint, handler: HookHandler, priority: number) => string;
  },
  config: {
    memoryManager?: MemoryManager;
    osIntegrationManager?: OsIntegrationManager;
  } = {},
): OsaiHookRegistration[] {
  const registrations: OsaiHookRegistration[] = [];

  if (config.memoryManager) {
    const memoryQueryHook = createBeforeMemoryQueryHook(config.memoryManager);
    hookManager.registerHook(memoryQueryHook.point, memoryQueryHook.handler, memoryQueryHook.priority);
    registrations.push(memoryQueryHook);

    const memoryExtractHook = createAfterMemoryExtractHook(config.memoryManager);
    hookManager.registerHook(memoryExtractHook.point, memoryExtractHook.handler, memoryExtractHook.priority);
    registrations.push(memoryExtractHook);
  }

  const fileAccessHook = createOnFileAccessHook();
  hookManager.registerHook(fileAccessHook.point, fileAccessHook.handler, fileAccessHook.priority);
  registrations.push(fileAccessHook);

  if (config.osIntegrationManager) {
    const notifHook = createOnDesktopNotificationHook(config.osIntegrationManager);
    hookManager.registerHook(notifHook.point, notifHook.handler, notifHook.priority);
    registrations.push(notifHook);
  }

  return registrations;
}
