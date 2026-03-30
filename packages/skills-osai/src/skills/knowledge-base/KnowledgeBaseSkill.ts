/**
 * @osai/skills-osai -- Knowledge Base Skill (DOMAIN-003)
 *
 * osaI skill providing access to the Knowledge Base system.
 * 4 tools: ingest_document, query_knowledge, list_sources, remove_source.
 *
 * All tools delegate to KnowledgeBase service (injectable dependency).
 */

import type {
  SkillDefinition,
  ToolDefinitionWithHandler,
  ToolResult,
  PermissionPolicy,
  ToolParameters,
} from '@osai/skills-core';
import { LoggerFactory } from '@osai/observability';
import type { Logger as PinoLogger } from 'pino';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Interface for the Knowledge Base service that this skill delegates to.
 * Mirrors the combined API of SourceManager + KBSearch from packages/knowledge-base.
 */
export interface KnowledgeBaseService {
  /**
   * Ingest a document into the knowledge base.
   * Mirrors SourceManager.addSource().
   */
  ingestDocument(path: string, format?: string, tags?: string[]): Promise<{ documentId: string }>;

  /**
   * Perform a semantic search in the knowledge base.
   * Mirrors KBSearch.search().
   */
  search(query: string, config?: { topK?: number; minSimilarity?: number }): Promise<Array<{
    chunk: { id: string; content: string; chunkIndex: number };
    source: { documentId: string; title: string; path: string; tags: readonly string[] };
    similarity: number;
  }>>;

  /**
   * List document sources, optionally filtered by tag.
   * Mirrors SourceManager.listSources().
   */
  listSources(filter?: { tags?: string[] }): Promise<Array<{
    documentId: string;
    title: string;
    path: string;
    format: string;
    tags: readonly string[];
  }>>;

  /**
   * Remove a document source and all associated data.
   * Mirrors SourceManager.removeSource().
   */
  removeSource(documentId: string): Promise<void>;
}

/** Options for creating a KnowledgeBaseSkill instance. */
export interface KnowledgeBaseSkillOptions {
  /** KnowledgeBase service instance for delegation. */
  knowledgeBaseService: KnowledgeBaseService;
}

// ---------------------------------------------------------------------------
// Tool parameter schemas (JSON Schema for LLM function calling)
// ---------------------------------------------------------------------------

const INGEST_DOCUMENT_PARAMS: ToolParameters = {
  type: 'object',
  properties: {
    path: {
      type: 'string',
      description: 'File path to the document to ingest',
    },
    format: {
      type: 'string',
      description: 'Document format (auto-detected if not provided)',
    },
    tags: {
      type: 'array',
      items: { type: 'string' },
      description: 'Tags for categorization',
    },
  },
  required: ['path'],
};

const QUERY_KNOWLEDGE_PARAMS: ToolParameters = {
  type: 'object',
  properties: {
    query: {
      type: 'string',
      description: 'Natural-language search query',
    },
    topK: {
      type: 'number',
      description: 'Maximum number of results (default: 5)',
    },
    minSimilarity: {
      type: 'number',
      description: 'Minimum cosine similarity threshold (default: 0.7)',
    },
  },
  required: ['query'],
};

const LIST_SOURCES_PARAMS: ToolParameters = {
  type: 'object',
  properties: {
    tag: {
      type: 'string',
      description: 'Filter by tag (returns sources containing this tag)',
    },
  },
};

const REMOVE_SOURCE_PARAMS: ToolParameters = {
  type: 'object',
  properties: {
    documentId: {
      type: 'string',
      description: 'The document ID to remove',
    },
  },
  required: ['documentId'],
};

// ---------------------------------------------------------------------------
// KnowledgeBaseSkill
// ---------------------------------------------------------------------------

/**
 * KnowledgeBaseSkill -- osaI skill for the Knowledge Base system.
 *
 * Creates a SkillDefinition programmatically with 4 tools that delegate
 * to KnowledgeBaseService.
 */
export class KnowledgeBaseSkill {
  private readonly knowledgeBaseService: KnowledgeBaseService;
  private readonly logger: PinoLogger;

  constructor(options: KnowledgeBaseSkillOptions) {
    this.knowledgeBaseService = options.knowledgeBaseService;
    this.logger = LoggerFactory.create('skills-osai', 'knowledge-base');
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Build the SkillDefinition for registration in SkillRegistry.
   */
  getDefinition(): SkillDefinition {
    return {
      name: 'knowledge-base',
      version: '1.0.0',
      description: 'osaI Knowledge Base Skill -- document ingestion, semantic search, source management',
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
   * ingest_document -- ingest a document into the KB.
   * Delegates to KnowledgeBaseService.ingestDocument().
   */
  private async handleIngestDocument(params: Record<string, unknown>): Promise<ToolResult> {
    try {
      const path = params['path'] as string;
      const format = params['format'] as string | undefined;
      const tags = params['tags'] as string[] | undefined;

      if (!path || typeof path !== 'string') {
        return { success: false, error: 'Parameter "path" is required and must be a string' };
      }

      const result = await this.knowledgeBaseService.ingestDocument(path, format, tags);

      this.logger.info(
        { action: 'ingest_document', documentId: result.documentId, path },
        'Document ingested successfully',
      );

      return { success: true, data: result };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error({ action: 'ingest_document', error: message }, 'Failed to ingest document');
      return { success: false, error: message };
    }
  }

  /**
   * query_knowledge -- semantic search in the KB.
   * Delegates to KnowledgeBaseService.search().
   */
  private async handleQueryKnowledge(params: Record<string, unknown>): Promise<ToolResult> {
    try {
      const query = params['query'] as string;
      const topK = params['topK'] as number | undefined;
      const minSimilarity = params['minSimilarity'] as number | undefined;

      if (!query || typeof query !== 'string') {
        return { success: false, error: 'Parameter "query" is required and must be a string' };
      }

      const config: { topK?: number; minSimilarity?: number } = {};
      if (topK !== undefined) config.topK = topK;
      if (minSimilarity !== undefined) config.minSimilarity = minSimilarity;

      const results = await this.knowledgeBaseService.search(query, config);

      this.logger.info(
        { action: 'query_knowledge', query, resultCount: results.length },
        'Knowledge query completed',
      );

      return {
        success: true,
        data: results.map(r => ({
          content: r.chunk.content,
          source: r.source,
          similarity: r.similarity,
        })),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error({ action: 'query_knowledge', error: message }, 'Failed to query knowledge');
      return { success: false, error: message };
    }
  }

  /**
   * list_sources -- list KB document sources.
   * Delegates to KnowledgeBaseService.listSources().
   */
  private async handleListSources(params: Record<string, unknown>): Promise<ToolResult> {
    try {
      const tag = params['tag'] as string | undefined;

      const filter = tag ? { tags: [tag] } : undefined;
      const sources = await this.knowledgeBaseService.listSources(filter);

      this.logger.info(
        { action: 'list_sources', count: sources.length, tag: tag ?? null },
        'List sources completed',
      );

      return {
        success: true,
        data: sources.map(s => ({
          documentId: s.documentId,
          title: s.title,
          path: s.path,
          format: s.format,
          tags: s.tags,
        })),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error({ action: 'list_sources', error: message }, 'Failed to list sources');
      return { success: false, error: message };
    }
  }

  /**
   * remove_source -- remove a document from KB.
   * Delegates to KnowledgeBaseService.removeSource().
   */
  private async handleRemoveSource(params: Record<string, unknown>): Promise<ToolResult> {
    try {
      const documentId = params['documentId'] as string;

      if (!documentId || typeof documentId !== 'string') {
        return { success: false, error: 'Parameter "documentId" is required and must be a string' };
      }

      await this.knowledgeBaseService.removeSource(documentId);

      this.logger.info(
        { action: 'remove_source', documentId },
        'Source removed successfully',
      );

      return { success: true, data: { removed: true, documentId } };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error({ action: 'remove_source', error: message }, 'Failed to remove source');
      return { success: false, error: message };
    }
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  private buildTools(): ToolDefinitionWithHandler[] {
    return [
      {
        name: 'ingest_document',
        description: 'Ingest a document into the Knowledge Base for semantic search',
        parameters: INGEST_DOCUMENT_PARAMS,
        handler: (params) => this.handleIngestDocument(params),
      },
      {
        name: 'query_knowledge',
        description: 'Perform a semantic search in the Knowledge Base',
        parameters: QUERY_KNOWLEDGE_PARAMS,
        handler: (params) => this.handleQueryKnowledge(params),
      },
      {
        name: 'list_sources',
        description: 'List document sources in the Knowledge Base',
        parameters: LIST_SOURCES_PARAMS,
        handler: (params) => this.handleListSources(params),
      },
      {
        name: 'remove_source',
        description: 'Remove a document source from the Knowledge Base',
        parameters: REMOVE_SOURCE_PARAMS,
        handler: (params) => this.handleRemoveSource(params),
      },
    ];
  }

  private buildPermissions(): PermissionPolicy {
    return {
      ingest_document: 'confirm',
      query_knowledge: 'auto',
      list_sources: 'auto',
      remove_source: 'confirm',
    };
  }
}
