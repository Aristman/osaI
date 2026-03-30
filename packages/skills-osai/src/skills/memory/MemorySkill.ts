/**
 * @osai/skills-osai -- Memory Skill (DOMAIN-003)
 *
 * osaI skill providing access to the three-tier memory system.
 * 4 tools: remember, recall, forget, summarize_session.
 *
 * All tools delegate to MemoryService (packages/memory).
 * summarize_session is a placeholder for TDD (real implementation in F-008).
 */

import type {
  SkillDefinition,
  ToolDefinitionWithHandler,
  ToolResult,
  PermissionPolicy,
} from '@osai/skills-core';
import type { MemoryService } from '@osai/memory';
import type { MemoryEntry } from '@osai/memory';
import { MemoryTier, MemoryCategory } from '@osai/memory';
import type { RAGResult } from '@osai/memory';
import { LoggerFactory } from '@osai/observability';
import type { Logger as PinoLogger } from 'pino';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Options for creating a MemorySkill instance. */
export interface MemorySkillOptions {
  /** MemoryService instance for delegation. */
  memoryService: MemoryService;
}

// ---------------------------------------------------------------------------
// Tool parameter schemas (JSON Schema for LLM function calling)
// ---------------------------------------------------------------------------

const REMEMBER_PARAMS = {
  type: 'object' as const,
  properties: {
    content: {
      type: 'string',
      description: 'The content to remember',
    },
    tags: {
      type: 'array',
      items: { type: 'string' },
      description: 'Tags for categorization',
    },
  },
  required: ['content'],
} satisfies import('@osai/skills-core').ToolParameters;

const RECALL_PARAMS = {
  type: 'object' as const,
  properties: {
    query: {
      type: 'string',
      description: 'Natural-language search query',
    },
    topK: {
      type: 'number',
      description: 'Maximum number of results (default: 5)',
    },
  },
  required: ['query'],
} satisfies import('@osai/skills-core').ToolParameters;

const FORGET_PARAMS = {
  type: 'object' as const,
  properties: {
    memoryId: {
      type: 'string',
      description: 'The unique identifier of the memory to delete',
    },
  },
  required: ['memoryId'],
} satisfies import('@osai/skills-core').ToolParameters;

const SUMMARIZE_SESSION_PARAMS = {
  type: 'object' as const,
  properties: {
    sessionId: {
      type: 'string',
      description: 'The session identifier to summarize',
    },
  },
  required: ['sessionId'],
} satisfies import('@osai/skills-core').ToolParameters;

// ---------------------------------------------------------------------------
// MemorySkill
// ---------------------------------------------------------------------------

/**
 * MemorySkill -- osaI skill for the three-tier memory system.
 *
 * Creates a SkillDefinition programmatically with 4 tools that delegate
 * to MemoryService.
 */
export class MemorySkill {
  private readonly memoryService: MemoryService;
  private readonly logger: PinoLogger;

  constructor(options: MemorySkillOptions) {
    this.memoryService = options.memoryService;
    this.logger = LoggerFactory.create('skills-osai', 'memory');
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Build the SkillDefinition for registration in SkillRegistry.
   *
   * Returns a complete SkillDefinition with 4 tool handlers
   * that delegate to MemoryService methods.
   */
  getDefinition(): SkillDefinition {
    return {
      name: 'memory',
      version: '1.0.0',
      description: 'osaI Memory Skill -- three-tier memory access (remember, recall, forget, summarize)',
      category: 'osaI',
      enabled: true,
      tools: this.buildTools(),
      permissions: this.buildPermissions(),
    };
  }

  // -------------------------------------------------------------------------
  // Tool handlers
  // -------------------------------------------------------------------------

  /**
   * remember -- store a fact in long-term memory.
   * Delegates to MemoryService.store().
   */
  private async handleRemember(params: Record<string, unknown>): Promise<ToolResult> {
    try {
      const content = params['content'] as string;
      const tags = (params['tags'] as string[] | undefined) ?? [];

      if (!content || typeof content !== 'string') {
        return { success: false, error: 'Parameter "content" is required and must be a string' };
      }

      const now = new Date().toISOString();
      const entry: MemoryEntry = {
        id: crypto.randomUUID(),
        content,
        category: MemoryCategory.Fact,
        tier: MemoryTier.LongTerm,
        tags,
        createdAt: now,
        updatedAt: now,
      };

      const stored = await this.memoryService.store(entry, MemoryTier.LongTerm);

      this.logger.info(
        { action: 'remember', memoryId: stored.id },
        'Memory stored successfully',
      );

      return {
        success: true,
        data: { id: stored.id, content: stored.content, tier: stored.tier },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error({ action: 'remember', error: message }, 'Failed to store memory');
      return { success: false, error: message };
    }
  }

  /**
   * recall -- search memories by natural-language query.
   * Delegates to MemoryService.query().
   */
  private async handleRecall(params: Record<string, unknown>): Promise<ToolResult> {
    try {
      const query = params['query'] as string;
      const topK = (params['topK'] as number | undefined) ?? 5;

      if (!query || typeof query !== 'string') {
        return { success: false, error: 'Parameter "query" is required and must be a string' };
      }

      const results: RAGResult[] = await this.memoryService.query(query, { topK });

      this.logger.info(
        { action: 'recall', query, resultCount: results.length },
        'Memory query completed',
      );

      return {
        success: true,
        data: results.map((r) => ({
          id: r.entry.id,
          content: r.entry.content,
          score: r.similarity,
          tier: r.entry.tier,
        })),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error({ action: 'recall', error: message }, 'Failed to query memory');
      return { success: false, error: message };
    }
  }

  /**
   * forget -- delete a specific memory entry.
   * Delegates to MemoryService.forget().
   */
  private async handleForget(params: Record<string, unknown>): Promise<ToolResult> {
    try {
      const memoryId = params['memoryId'] as string;

      if (!memoryId || typeof memoryId !== 'string') {
        return { success: false, error: 'Parameter "memoryId" is required and must be a string' };
      }

      const deleted = await this.memoryService.forget(memoryId);

      this.logger.info(
        { action: 'forget', memoryId, deleted },
        'Memory forget completed',
      );

      return {
        success: true,
        data: { deleted },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error({ action: 'forget', error: message }, 'Failed to forget memory');
      return { success: false, error: message };
    }
  }

  /**
   * summarize_session -- create a summary of a session's context.
   * Placeholder for TDD; real implementation deferred to F-008.
   */
  private async handleSummarizeSession(params: Record<string, unknown>): Promise<ToolResult> {
    try {
      const sessionId = params['sessionId'] as string;

      if (!sessionId || typeof sessionId !== 'string') {
        return { success: false, error: 'Parameter "sessionId" is required and must be a string' };
      }

      // Placeholder: query session-scoped memories and return as summary
      const results: RAGResult[] = await this.memoryService.query(
        `session context summary for ${sessionId}`,
        { topK: 10 },
      );

      this.logger.info(
        { action: 'summarize_session', sessionId, factCount: results.length },
        'Session summarize completed (placeholder)',
      );

      return {
        success: true,
        data: {
          sessionId,
          summary: `Session summary for ${sessionId} based on ${results.length} retrieved memories.`,
          facts: results.map((r) => ({
            id: r.entry.id,
            content: r.entry.content,
            score: r.similarity,
          })),
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        { action: 'summarize_session', error: message },
        'Failed to summarize session',
      );
      return { success: false, error: message };
    }
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  private buildTools(): ToolDefinitionWithHandler[] {
    return [
      {
        name: 'remember',
        description: 'Store a fact or piece of information in long-term memory',
        parameters: REMEMBER_PARAMS,
        handler: (params) => this.handleRemember(params),
      },
      {
        name: 'recall',
        description: 'Search memory for facts matching a natural-language query',
        parameters: RECALL_PARAMS,
        handler: (params) => this.handleRecall(params),
      },
      {
        name: 'forget',
        description: 'Delete a specific memory entry by its ID',
        parameters: FORGET_PARAMS,
        handler: (params) => this.handleForget(params),
      },
      {
        name: 'summarize_session',
        description: 'Create a summary of the current session context',
        parameters: SUMMARIZE_SESSION_PARAMS,
        handler: (params) => this.handleSummarizeSession(params),
      },
    ];
  }

  private buildPermissions(): PermissionPolicy {
    return {
      remember: 'confirm',
      recall: 'confirm',
      forget: 'confirm',
      summarize_session: 'confirm',
    };
  }
}
