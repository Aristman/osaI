/**
 * @osai/memory -- MemoryManager (T-006)
 *
 * Coordinates the three-tier memory system (Chat, Session, Long-term).
 * Provides unified API for storing, querying, remembering, and forgetting memories.
 *
 * Dependencies are injected via constructor (DI pattern).
 * All operations are logged through pino logger with trace_id from @osai/observability.
 */

import type { MemoryEntry, MemoryTier } from '../types/memory.js';
import { MemoryCategory, MemoryTier as MemoryTierEnum } from '../types/memory.js';
import type { RAGPipeline, RAGQueryOptions } from '../rag/rag-pipeline.js';
import type { EmbeddingProvider } from '../embeddings/embedding-provider.js';
import type { VectorStorage } from '../vector-storage/vector-storage.js';
import type { MemoryRepository, StoreMemoryEntry } from '../db/memory-repository.js';
import type { RAGResult } from '../types/rag.js';
import type { Logger as PinoLogger } from 'pino';
import { LoggerFactory, TraceContext } from '@osai/observability';

// ---------------------------------------------------------------------------
// Error
// ---------------------------------------------------------------------------

/**
 * Thrown when the MemoryManager encounters an error during store/query/forget operations.
 *
 * Wraps the original error as {@link cause} to preserve context.
 */
export class MemoryManagerError extends Error {
  /** The original error that caused the operation failure. */
  public readonly cause?: Error;

  constructor(message: string, cause?: Error) {
    super(message);
    this.name = 'MemoryManagerError';
    if (cause !== undefined) {
      this.cause = cause;
    }
  }
}

// ---------------------------------------------------------------------------
// Metadata builder
// ---------------------------------------------------------------------------

/**
 * Build vector storage metadata from a MemoryEntry.
 */
function buildVectorMetadata(entry: MemoryEntry): Record<string, string | number | boolean> {
  const metadata: Record<string, string | number | boolean> = {
    content: entry.content,
    tier: entry.tier,
    category: entry.category,
    tags: JSON.stringify(entry.tags),
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
  };

  if (entry.chatId !== undefined) {
    metadata.chatId = entry.chatId;
  }
  if (entry.sessionId !== undefined) {
    metadata.sessionId = entry.sessionId;
  }
  if (entry.summary !== undefined) {
    metadata.summary = entry.summary;
  }

  return metadata;
}

// ---------------------------------------------------------------------------
// MemoryManager
// ---------------------------------------------------------------------------

/**
 * MemoryManager coordinates the three-tier memory system.
 *
 * Provides unified API for:
 *   - store(entry, tier): persist memory with embedding
 *   - query(text): semantic search via RAG pipeline
 *   - remember(content, chatId): quick long-term memory creation
 *   - forget(id): remove from SQLite + vector storage
 *   - recall(chatId, query): search chat + long-term memory via RAG
 *
 * Dependencies (RAGPipeline, MemoryRepository, EmbeddingProvider, VectorStorage)
 * are injected via constructor.
 */
export class MemoryManager {
  private readonly ragPipeline: RAGPipeline;
  private readonly repository: MemoryRepository;
  private readonly embedder: EmbeddingProvider;
  private readonly vectorStorage: VectorStorage;
  private readonly logger: PinoLogger;

  /**
   * @param ragPipeline    RAG pipeline for semantic search.
   * @param repository     Memory repository for CRUD operations.
   * @param embedder       Embedding provider for generating vectors.
   * @param vectorStorage  Vector storage for upsert/delete operations.
   */
  constructor(
    ragPipeline: RAGPipeline,
    repository: MemoryRepository,
    embedder: EmbeddingProvider,
    vectorStorage: VectorStorage,
  ) {
    this.ragPipeline = ragPipeline;
    this.repository = repository;
    this.embedder = embedder;
    this.vectorStorage = vectorStorage;
    this.logger = LoggerFactory.create('memory', 'manager');
  }

  /**
   * Store a memory entry.
   *
   * For long-term tier: generates embedding, upserts into vector storage,
   * then stores in repository.
   *
   * For chat tier: stores only in repository (no vector storage).
   *
   * @param entry  The memory entry to store.
   * @param tier   The storage tier.
   * @returns The stored memory entry with timestamps.
   * @throws {MemoryManagerError} When embedding generation or storage fails.
   */
  async store(entry: MemoryEntry, tier: MemoryTier): Promise<MemoryEntry> {
    const traceId = this.getTraceId();

    this.logger.info(
      { action: 'store', memoryId: entry.id, tier, trace_id: traceId },
      'Storing memory entry',
    );

    try {
      if (tier === MemoryTierEnum.Chat) {
        // Chat tier: store only in repository, no vector storage
        this.logger.debug(
          { action: 'store_chat', memoryId: entry.id, trace_id: traceId },
          'Storing chat-tier memory (no vector storage)',
        );

        const stored = this.repository.store({
          id: entry.id,
          content: entry.content,
          tier: 'chat',
          chatId: entry.chatId,
          sessionId: entry.sessionId,
          tags: entry.tags,
          metadata: this.entryToMetadata(entry),
        });

        this.logger.info(
          { action: 'store_chat_complete', memoryId: entry.id, trace_id: traceId },
          'Chat memory stored successfully',
        );

        return this.repositoryEntryToMemoryEntry(stored);
      }

      // Session and Long-term tiers: generate embedding + upsert vector
      const embeddingResult = await this.embedder.embed(entry.content);
      const vector = embeddingResult.vector;

      // Upsert into vector storage
      const vectorMetadata = buildVectorMetadata({ ...entry, tier });
      this.vectorStorage.upsert(entry.id, vector, vectorMetadata);

      // Store in repository
      const stored = this.repository.store({
        id: entry.id,
        content: entry.content,
        tier: tier as StoreMemoryEntry['tier'],
        chatId: entry.chatId,
        sessionId: entry.sessionId,
        tags: entry.tags,
        metadata: this.entryToMetadata(entry),
      });

      this.logger.info(
        {
          action: 'store_complete',
          memoryId: entry.id,
          tier,
          dimensions: embeddingResult.dimensions,
          durationMs: embeddingResult.durationMs,
          trace_id: traceId,
        },
        'Memory stored with embedding',
      );

      return this.repositoryEntryToMemoryEntry(stored);
    } catch (error) {
      const cause = error instanceof Error ? error : new Error(String(error));
      this.logger.error(
        { action: 'store_error', memoryId: entry.id, tier, trace_id: traceId, err: cause.message },
        'Failed to store memory entry',
      );
      throw new MemoryManagerError(`Failed to store memory entry ${entry.id}: ${cause.message}`, cause);
    }
  }

  /**
   * Query the RAG pipeline for semantically relevant memories.
   *
   * @param text     Natural-language query text.
   * @param options  Optional RAG query overrides (topK, minSimilarity).
   * @returns Array of RAGResult with matching entries, similarity scores, and ranks.
   * @throws {MemoryManagerError} When RAG pipeline fails.
   */
  async query(text: string, options?: RAGQueryOptions): Promise<RAGResult[]> {
    const traceId = this.getTraceId();

    this.logger.info(
      { action: 'query', trace_id: traceId, textLength: text.length },
      'Querying memory via RAG pipeline',
    );

    try {
      const results = await this.ragPipeline.query(text, options);

      this.logger.info(
        { action: 'query_complete', trace_id: traceId, resultCount: results.length },
        'RAG query completed',
      );

      return results;
    } catch (error) {
      const cause = error instanceof Error ? error : new Error(String(error));
      this.logger.error(
        { action: 'query_error', trace_id: traceId, err: cause.message },
        'RAG query failed',
      );
      throw new MemoryManagerError(`Memory query failed: ${cause.message}`, cause);
    }
  }

  /**
   * Create a long-term memory entry and store it.
   *
   * Convenience method that creates a MemoryEntry with tier=long-term
   * and stores it with embedding generation.
   *
   * @param content  The memory content text.
   * @param chatId   Optional chat ID to associate with this memory.
   * @returns The stored memory entry.
   */
  async remember(content: string, chatId?: string): Promise<MemoryEntry> {
    const traceId = this.getTraceId();

    this.logger.info(
      { action: 'remember', trace_id: traceId, chatId, contentLength: content.length },
      'Creating long-term memory',
    );

    const now = new Date().toISOString();
    const id = `mem_${crypto.randomUUID()}`;

    const entry: MemoryEntry = {
      id,
      content,
      category: MemoryCategory.General,
      tier: MemoryTierEnum.LongTerm,
      chatId,
      tags: [],
      createdAt: now,
      updatedAt: now,
    };

    return this.store(entry, MemoryTierEnum.LongTerm);
  }

  /**
   * Delete a memory entry from both SQLite and vector storage.
   *
   * @param id  The unique identifier of the memory to delete.
   * @returns true if the entry was deleted, false if not found.
   * @throws {MemoryManagerError} When deletion fails unexpectedly.
   */
  async forget(id: string): Promise<boolean> {
    const traceId = this.getTraceId();

    this.logger.info(
      { action: 'forget', memoryId: id, trace_id: traceId },
      'Forgetting memory entry',
    );

    try {
      // Delete from vector storage (best-effort, ignore if not found)
      this.vectorStorage.delete(id);

      // Delete from repository
      const deleted = this.repository.delete(id);

      this.logger.info(
        { action: 'forget_complete', memoryId: id, trace_id: traceId, deleted },
        'Memory forget completed',
      );

      return deleted;
    } catch (error) {
      const cause = error instanceof Error ? error : new Error(String(error));
      this.logger.error(
        { action: 'forget_error', memoryId: id, trace_id: traceId, err: cause.message },
        'Failed to forget memory entry',
      );
      throw new MemoryManagerError(`Failed to forget memory entry ${id}: ${cause.message}`, cause);
    }
  }

  /**
   * Recall memories for a specific chat using both chat-scoped and long-term memory.
   *
   * Searches:
   *   1. Chat memory entries for the given chatId via repository
   *   2. Long-term memories via RAG pipeline
   *
   * Combines and deduplicates results, returning MemoryEntry[] with relevance scores.
   *
   * @param chatId  The chat ID to search within.
   * @param query   Natural-language query for semantic search.
   * @returns Combined array of matching MemoryEntry with relevanceScore.
   */
  async recall(chatId: string, query: string): Promise<MemoryEntry[]> {
    const traceId = this.getTraceId();

    this.logger.info(
      { action: 'recall', chatId, trace_id: traceId, queryLength: query.length },
      'Recalling memories for chat',
    );

    try {
      const resultMap = new Map<string, MemoryEntry>();

      // 1. Get chat-scoped memories from repository
      const chatEntries = this.repository.findByChat(chatId);
      for (const entry of chatEntries) {
        const memoryEntry = this.repositoryEntryToMemoryEntry(entry);
        // Assign a base relevance score for chat entries (not RAG-ranked)
        memoryEntry.relevanceScore = 0.5;
        resultMap.set(entry.id, memoryEntry);
      }

      // 2. Search long-term memory via RAG pipeline
      const ragResults = await this.ragPipeline.query(query);
      for (const result of ragResults) {
        // Only include long-term or session memories from RAG (not chat duplicates)
        if (result.entry.tier !== MemoryTierEnum.Chat || !resultMap.has(result.entry.id)) {
          const entry = result.entry;
          entry.relevanceScore = result.similarity;
          resultMap.set(entry.id, entry);
        }
      }

      // Convert map to sorted array by relevanceScore descending
      const entries = Array.from(resultMap.values());
      entries.sort((a, b) => (b.relevanceScore ?? 0) - (a.relevanceScore ?? 0));

      this.logger.info(
        { action: 'recall_complete', chatId, trace_id: traceId, resultCount: entries.length },
        'Memory recall completed',
      );

      return entries;
    } catch (error) {
      const cause = error instanceof Error ? error : new Error(String(error));
      this.logger.error(
        { action: 'recall_error', chatId, trace_id: traceId, err: cause.message },
        'Memory recall failed',
      );
      throw new MemoryManagerError(`Memory recall failed for chat ${chatId}: ${cause.message}`, cause);
    }
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Get trace_id from current async context if available.
   */
  private getTraceId(): string | undefined {
    const ctx = TraceContext.get();
    return ctx?.trace_id;
  }

  /**
   * Convert domain MemoryEntry to repository StoreMemoryEntry metadata.
   */
  private entryToMetadata(entry: MemoryEntry): Record<string, unknown> {
    const metadata: Record<string, unknown> = {};
    if (entry.summary !== undefined) {
      metadata.summary = entry.summary;
    }
    if (entry.embedding !== undefined) {
      metadata.embeddingDimensions = entry.embedding.length;
    }
    return metadata;
  }

  /**
   * Convert repository MemoryEntry (which uses string tier) to domain MemoryEntry.
   */
  private repositoryEntryToMemoryEntry(repoEntry: {
    id: string;
    content: string;
    tier: string;
    chatId?: string;
    sessionId?: string;
    tags?: string[];
    createdAt: string;
    updatedAt: string;
    metadata?: Record<string, unknown>;
  }): MemoryEntry {
    const tier = this.mapTier(repoEntry.tier);
    const category = this.extractCategory(repoEntry.metadata);

    return {
      id: repoEntry.id,
      content: repoEntry.content,
      tier,
      category,
      chatId: repoEntry.chatId,
      sessionId: repoEntry.sessionId,
      tags: repoEntry.tags ?? [],
      createdAt: repoEntry.createdAt,
      updatedAt: repoEntry.updatedAt,
      summary: repoEntry.metadata?.summary as string | undefined,
    };
  }

  /**
   * Map repository tier string to MemoryTier enum.
   */
  private mapTier(tier: string): MemoryTier {
    switch (tier) {
      case MemoryTierEnum.Chat:
        return MemoryTierEnum.Chat;
      case MemoryTierEnum.Session:
        return MemoryTierEnum.Session;
      case MemoryTierEnum.LongTerm:
        return MemoryTierEnum.LongTerm;
      default:
        return MemoryTierEnum.LongTerm;
    }
  }

  /**
   * Extract category from repository metadata if present.
   */
  private extractCategory(metadata?: Record<string, unknown>): MemoryCategory {
    if (metadata?.category !== undefined && typeof metadata.category === 'string') {
      const cat = metadata.category as string;
      if (Object.values(MemoryCategory).includes(cat as MemoryCategory)) {
        return cat as MemoryCategory;
      }
    }
    return MemoryCategory.General;
  }
}
