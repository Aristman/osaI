/**
 * @osai/skills-osai -- MemorySkill
 *
 * Provides memory management tools: remember, recall, forget, summarize_session.
 * Delegates to MemoryManager from @osai/memory.
 */

import type {
  SkillDefinition,
  ToolExecutor,
  ToolResult,
} from '@osai/agent';
import type {
  MemoryManager,
  RagResult,
  Fact,
} from '@osai/memory';

// ---------------------------------------------------------------------------
// Skill Definition
// ---------------------------------------------------------------------------

export function createMemorySkillDefinition(): SkillDefinition {
  return {
    name: 'memory',
    version: '1.0.0',
    description:
      'Provides memory management capabilities: store facts and preferences, recall relevant memories, forget specific entries, and summarize session context.',
    category: 'system',
    tools: [
      {
        name: 'remember',
        description:
          'Store a fact, preference, or information in long-term memory. Optionally categorize and tag it.',
        category: 'system',
        parameters: {
          type: 'object',
          properties: {
            content: {
              type: 'string',
              description: 'The content to remember.',
            },
            category: {
              type: 'string',
              enum: ['fact', 'preference', 'knowledge', 'error', 'pattern'],
              description: 'Category for the memory entry. Default: fact.',
            },
            tags: {
              type: 'array',
              items: { type: 'string' },
              description: 'Optional tags for categorization.',
            },
          },
          required: ['content'],
        },
      },
      {
        name: 'recall',
        description:
          'Recall relevant memories matching a query. Uses RAG pipeline for semantic search.',
        category: 'system',
        parameters: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Search query for relevant memories.',
            },
            top_k: {
              type: 'number',
              description: 'Maximum number of results. Default: 5.',
              minimum: 1,
              maximum: 50,
            },
            category: {
              type: 'string',
              enum: ['fact', 'preference', 'knowledge', 'error', 'pattern'],
              description: 'Optional category filter.',
            },
          },
          required: ['query'],
        },
      },
      {
        name: 'forget',
        description:
          'Remove a specific memory entry by its ID. This action requires user confirmation.',
        category: 'write',
        parameters: {
          type: 'object',
          properties: {
            memory_id: {
              type: 'string',
              description: 'The ID of the memory entry to remove.',
            },
          },
          required: ['memory_id'],
        },
      },
      {
        name: 'summarize_session',
        description:
          'Generate a summary of the current session context from short-term memory.',
        category: 'system',
        parameters: {
          type: 'object',
          properties: {
            session_id: {
              type: 'string',
              description: 'The session ID to summarize. Uses current session if not provided.',
            },
          },
        },
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const VALID_CATEGORIES = ['fact', 'preference', 'knowledge', 'error', 'pattern'] as const;

function isValidCategory(value: unknown): value is Fact['category'] {
  return typeof value === 'string' && (VALID_CATEGORIES as readonly string[]).includes(value);
}

// ---------------------------------------------------------------------------
// Tool Executors
// ---------------------------------------------------------------------------

function createExecutors(manager: MemoryManager): Record<string, ToolExecutor> {
  return {
    remember: async (params, context): Promise<ToolResult> => {
      const content = String(params['content'] ?? '');
      const categoryRaw = params['category'];

      if (!content) {
        return {
          success: false,
          error: 'Missing required parameter: content is required.',
        };
      }

      const category = categoryRaw !== undefined ? categoryRaw : 'fact';
      if (!isValidCategory(category)) {
        return {
          success: false,
          error: `Invalid category: "${String(categoryRaw)}". Must be one of: ${VALID_CATEGORIES.join(', ')}.`,
        };
      }

      const tags = Array.isArray(params['tags'])
        ? (params['tags'] as unknown[]).map(String)
        : undefined;

      try {
        const sessionId = context.sessionId;
        const longTerm = manager.getLongTerm();
        const factId = longTerm.addFact({
          content,
          category,
          source: 'agent',
          confidence: 0.8,
          sessionId,
          tags,
        });
        return {
          success: true,
          output: `Memory stored with ID: ${factId}`,
          metadata: { memory_id: factId, category, tags },
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to store memory';
        return { success: false, error: message };
      }
    },

    recall: async (params, context): Promise<ToolResult> => {
      const query = String(params['query'] ?? '');
      const topK = typeof params['top_k'] === 'number'
        ? Math.min(Math.max(params['top_k'], 1), 50)
        : 5;

      if (!query) {
        return {
          success: false,
          error: 'Missing required parameter: query is required.',
        };
      }

      try {
        const sessionId = context.sessionId;
        const ragResult: RagResult = await manager.recall(sessionId, query, {
          maxResults: topK,
        });
        return {
          success: true,
          output: ragResult.context || `Found ${ragResult.totalFacts} fact(s).`,
          metadata: {
            facts: ragResult.facts,
            total_facts: ragResult.totalFacts,
          },
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to recall memories';
        return { success: false, error: message };
      }
    },

    forget: async (params, context): Promise<ToolResult> => {
      const memoryId = String(params['memory_id'] ?? '');

      if (!memoryId) {
        return {
          success: false,
          error: 'Missing required parameter: memory_id is required.',
        };
      }

      try {
        const sessionId = context.sessionId;
        const result = await manager.forget(sessionId, memoryId);
        if (!result) {
          return {
            success: false,
            error: `Memory entry "${memoryId}" not found or does not belong to this session.`,
          };
        }
        return {
          success: true,
          output: `Memory entry "${memoryId}" forgotten successfully.`,
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to forget memory';
        return { success: false, error: message };
      }
    },

    summarize_session: async (params, context): Promise<ToolResult> => {
      const sessionId = params['session_id']
        ? String(params['session_id'])
        : context.sessionId;

      try {
        const shortTerm = manager.getShortTerm();
        const messages = shortTerm.getSessionMessages(sessionId);

        if (messages.length === 0) {
          return {
            success: true,
            output: 'No session messages to summarize.',
            metadata: { summary: '', message_count: 0 },
          };
        }

        // Build a summary from session messages
        const userMessages = messages.filter((m) => m.role === 'user');
        const assistantMessages = messages.filter((m) => m.role === 'assistant');

        const summary = [
          `Session: ${sessionId}`,
          `Messages: ${messages.length} total (${userMessages.length} user, ${assistantMessages.length} assistant)`,
          `Time range: ${messages[0]?.timestamp ?? 'N/A'} - ${messages[messages.length - 1]?.timestamp ?? 'N/A'}`,
        ].join('\n');

        return {
          success: true,
          output: summary,
          metadata: {
            summary,
            message_count: messages.length,
            session_id: sessionId,
          },
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to summarize session';
        return { success: false, error: message };
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createMemorySkill(manager: MemoryManager): {
  definition: SkillDefinition;
  executors: Record<string, ToolExecutor>;
} {
  return {
    definition: createMemorySkillDefinition(),
    executors: createExecutors(manager),
  };
}
