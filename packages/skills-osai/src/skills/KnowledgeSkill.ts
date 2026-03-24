/**
 * @osai/skills-osai -- KnowledgeSkill
 *
 * Provides knowledge base tools: ingest_document, query_knowledge,
 * list_sources, remove_source.
 * Delegates to LongTermMemory from @osai/memory.
 */

import type {
  SkillDefinition,
  ToolExecutor,
  ToolResult,
} from '@osai/agent';
import type {
  LongTermMemory,
  Fact,
} from '@osai/memory';

// ---------------------------------------------------------------------------
// Skill Definition
// ---------------------------------------------------------------------------

export function createKnowledgeSkillDefinition(): SkillDefinition {
  return {
    name: 'knowledge-base',
    version: '1.0.0',
    description:
      'Provides knowledge base capabilities: ingest documents for long-term storage, query stored knowledge, list document sources, and remove sources.',
    category: 'system',
    tools: [
      {
        name: 'ingest_document',
        description:
          'Ingest a document into the knowledge base. The content is chunked and stored for later retrieval. Requires user confirmation.',
        category: 'write',
        parameters: {
          type: 'object',
          properties: {
            content: {
              type: 'string',
              description: 'The document content to ingest.',
            },
            source: {
              type: 'string',
              description: 'Source identifier (e.g., file path, URL, description).',
            },
            title: {
              type: 'string',
              description: 'Optional document title.',
            },
            tags: {
              type: 'array',
              items: { type: 'string' },
              description: 'Optional tags for the document.',
            },
          },
          required: ['content'],
        },
      },
      {
        name: 'query_knowledge',
        description:
          'Query the knowledge base for relevant information using text search.',
        category: 'system',
        parameters: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Search query for the knowledge base.',
            },
            top_k: {
              type: 'number',
              description: 'Maximum number of results. Default: 5.',
              minimum: 1,
              maximum: 50,
            },
            category: {
              type: 'string',
              description: 'Optional category filter for knowledge entries.',
            },
            tags: {
              type: 'array',
              items: { type: 'string' },
              description: 'Optional tag filter.',
            },
          },
          required: ['query'],
        },
      },
      {
        name: 'list_sources',
        description:
          'List all unique sources in the knowledge base.',
        category: 'system',
        parameters: {
          type: 'object',
          properties: {
            category: {
              type: 'string',
              description: 'Optional category filter.',
            },
            tag: {
              type: 'string',
              description: 'Optional tag filter.',
            },
          },
        },
      },
      {
        name: 'remove_source',
        description:
          'Remove a document (fact) from the knowledge base by its ID. Requires user confirmation.',
        category: 'write',
        parameters: {
          type: 'object',
          properties: {
            document_id: {
              type: 'string',
              description: 'The document/fact ID to remove.',
            },
          },
          required: ['document_id'],
        },
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Tool Executors
// ---------------------------------------------------------------------------

function createExecutors(longTermMemory: LongTermMemory): Record<string, ToolExecutor> {
  return {
    ingest_document: async (params): Promise<ToolResult> => {
      const content = String(params['content'] ?? '');
      const source = params['source'] ? String(params['source']) : 'unknown';
      const tags = Array.isArray(params['tags'])
        ? (params['tags'] as unknown[]).map(String)
        : undefined;

      if (!content) {
        return {
          success: false,
          error: 'Missing required parameter: content is required.',
        };
      }

      try {
        // Simple chunking: split content into paragraphs or fixed-size chunks
        const chunks = chunkContent(content, 512);
        const factIds: string[] = [];

        for (let i = 0; i < chunks.length; i++) {
          const factId = longTermMemory.addFact({
            content: chunks[i]!,
            category: 'knowledge',
            source,
            confidence: 0.9,
            tags: tags ?? [],
          });
          factIds.push(factId);
        }

        return {
          success: true,
          output: `Document ingested successfully: ${factIds.length} chunk(s) stored from source "${source}".`,
          metadata: {
            document_id: factIds[0] ?? '',
            chunks_count: factIds.length,
            source,
            tags,
          },
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to ingest document';
        if (message.includes('not found') || message.includes('not exist')) {
          return {
            success: false,
            error: `File not found: ${String(params['content'] ?? '')}`,
          };
        }
        return { success: false, error: message };
      }
    },

    query_knowledge: async (params): Promise<ToolResult> => {
      const query = String(params['query'] ?? '');
      const topK = typeof params['top_k'] === 'number'
        ? Math.min(Math.max(params['top_k'], 1), 50)
        : 5;
      const category = params['category'] ? String(params['category']) : undefined;
      const tags = Array.isArray(params['tags'])
        ? (params['tags'] as unknown[]).map(String)
        : undefined;

      if (!query) {
        return {
          success: false,
          error: 'Missing required parameter: query is required.',
        };
      }

      try {
        const facts: Fact[] = longTermMemory.search(query, {
          limit: topK,
          category,
          tags,
        });

        const results = facts.map((f) => ({
          id: f.id,
          content: f.content,
          category: f.category,
          source: f.source,
          confidence: f.confidence,
          tags: f.tags ?? [],
        }));

        return {
          success: true,
          output: `Found ${results.length} result(s) for "${query}".`,
          metadata: { results, total: results.length },
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to query knowledge base';
        return { success: false, error: message };
      }
    },

    list_sources: async (params): Promise<ToolResult> => {
      const tag = params['tag'] ? String(params['tag']) : undefined;

      try {
        // Search all facts to extract unique sources
        const facts: Fact[] = longTermMemory.search('', {
          limit: 1000,
          tags: tag !== undefined ? [tag] : undefined,
        });

        const sourceMap = new Map<string, { count: number; tags: Set<string> }>();
        for (const fact of facts) {
          const existing = sourceMap.get(fact.source);
          const factTags = new Set(fact.tags ?? []);
          if (existing) {
            existing.count++;
            for (const t of factTags) {
              existing.tags.add(t);
            }
          } else {
            sourceMap.set(fact.source, { count: 1, tags: factTags });
          }
        }

        const sources = Array.from(sourceMap.entries()).map(
          ([name, info]) => ({
            name,
            document_count: info.count,
            tags: Array.from(info.tags),
          }),
        );

        return {
          success: true,
          output: `Found ${sources.length} unique source(s).`,
          metadata: { sources },
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to list sources';
        return { success: false, error: message };
      }
    },

    remove_source: async (params): Promise<ToolResult> => {
      const documentId = String(params['document_id'] ?? '');

      if (!documentId) {
        return {
          success: false,
          error: 'Missing required parameter: document_id is required.',
        };
      }

      try {
        const fact = longTermMemory.getFact(documentId);
        if (fact === undefined) {
          return {
            success: false,
            error: `Document "${documentId}" not found.`,
          };
        }

        const deleted = longTermMemory.deleteFact(documentId);
        if (!deleted) {
          return {
            success: false,
            error: `Failed to delete document "${documentId}".`,
          };
        }

        return {
          success: true,
          output: `Document "${documentId}" (source: "${fact.source}") removed successfully.`,
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to remove source';
        return { success: false, error: message };
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Chunking
// ---------------------------------------------------------------------------

function chunkContent(content: string, maxChunkSize: number): string[] {
  const chunks: string[] = [];
  const lines = content.split('\n');
  let current = '';

  for (const line of lines) {
    if (current.length + line.length + 1 > maxChunkSize && current.length > 0) {
      chunks.push(current.trim());
      current = '';
    }
    current += (current ? '\n' : '') + line;
  }

  if (current.trim().length > 0) {
    chunks.push(current.trim());
  }

  return chunks.length > 0 ? chunks : [content];
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createKnowledgeSkill(longTermMemory: LongTermMemory): {
  definition: SkillDefinition;
  executors: Record<string, ToolExecutor>;
} {
  return {
    definition: createKnowledgeSkillDefinition(),
    executors: createExecutors(longTermMemory),
  };
}
