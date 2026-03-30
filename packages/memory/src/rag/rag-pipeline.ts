/**
 * @osai/memory -- RAG Pipeline
 *
 * Orchestrates the Retrieval-Augmented Generation flow:
 *   1. Embed the query text via EmbeddingProvider
 *   2. Search the vector store via VectorStorage
 *   3. Filter results by minSimilarity and topK
 *   4. Format results as RAGResult[]
 *
 * Dependencies are injected via constructor (DI pattern).
 */

import type { EmbeddingProvider } from '../embeddings/embedding-provider.js';
import type { VectorStorage } from '../vector-storage/vector-storage.js';
import type { RAGConfig, RAGResult } from '../types/rag.js';
import type { MemoryEntry, MemoryTier as MemoryTierType, MemoryCategory as MemoryCategoryType } from '../types/memory.js';
import { MemoryCategory, MemoryTier } from '../types/memory.js';

// ---------------------------------------------------------------------------
// Error
// ---------------------------------------------------------------------------

/**
 * Thrown when the RAG pipeline encounters an error during embedding or search.
 *
 * Wraps the original error as {@link cause} to preserve context.
 */
export class RAGError extends Error {
  /** The original error that caused the pipeline failure. */
  public readonly cause: Error;

  constructor(message: string, cause: Error) {
    super(message);
    this.name = 'RAGError';
    this.cause = cause;
  }
}

// ---------------------------------------------------------------------------
// Query Options
// ---------------------------------------------------------------------------

/** Options that override the default RAG config for a single query. */
export interface RAGQueryOptions {
  /** Override default topK for this query. */
  topK?: number;
  /** Override default minSimilarity for this query. */
  minSimilarity?: number;
}

// ---------------------------------------------------------------------------
// RAGPipeline
// ---------------------------------------------------------------------------

/**
 * RAG Pipeline orchestrates retrieval-augmented generation.
 *
 * Takes a natural-language query, generates an embedding, performs vector
 * similarity search, filters and ranks results.
 *
 * Dependencies (EmbeddingProvider, VectorStorage) are injected via constructor.
 */
export class RAGPipeline {
  private readonly embedder: EmbeddingProvider;
  private readonly storage: VectorStorage;
  private readonly config: RAGConfig;

  /**
   * @param embedder  EmbeddingProvider for generating query embeddings.
   * @param storage   VectorStorage for similarity search.
   * @param config    RAG pipeline configuration.
   */
  constructor(
    embedder: EmbeddingProvider,
    storage: VectorStorage,
    config: RAGConfig,
  ) {
    this.embedder = embedder;
    this.storage = storage;
    this.config = config;
  }

  /**
   * Execute a RAG query: embed text, search vectors, filter and format results.
   *
   * @param text     The natural-language query text.
   * @param options  Optional overrides for topK and minSimilarity.
   * @returns Array of RAGResult sorted by similarity descending, with rank.
   * @throws {RAGError} When embedding or vector search fails.
   */
  async query(text: string, options?: RAGQueryOptions): Promise<RAGResult[]> {
    const topK = options?.topK ?? this.config.defaultTopK;
    const minSimilarity = options?.minSimilarity ?? this.config.defaultMinSimilarity;

    // Step 1: Generate embedding for the query text
    const embeddingResult = await this.embedQuery(text);

    // Step 2: Search vector storage
    const searchResults = this.searchVectors(embeddingResult.vector, topK, minSimilarity);

    // Step 3: Filter by minSimilarity and limit to topK
    const filtered = searchResults.filter((r) => r.score >= minSimilarity);
    const limited = filtered.slice(0, topK);

    // Step 4: Format as RAGResult[]
    return limited.map((result, index) => this.formatResult(result, index));
  }

  /**
   * Generate an embedding for the query text.
   *
   * @throws {RAGError} When the embedding provider fails.
   */
  private async embedQuery(text: string) {
    try {
      return await this.embedder.embed(text);
    } catch (error) {
      const cause = error instanceof Error ? error : new Error(String(error));
      throw new RAGError(
        `RAG pipeline embedding failed for query: ${text}`,
        cause,
      );
    }
  }

  /**
   * Search the vector storage with the query embedding.
   *
   * @throws {RAGError} When vector search fails.
   */
  private searchVectors(
    queryVector: number[],
    topK: number,
    minSimilarity: number,
  ) {
    try {
      return this.storage.search(queryVector, topK, minSimilarity);
    } catch (error) {
      const cause = error instanceof Error ? error : new Error(String(error));
      throw new RAGError(
        'RAG pipeline vector search failed',
        cause,
      );
    }
  }

  /**
   * Convert a SearchResult into a RAGResult with a properly typed MemoryEntry.
   */
  private formatResult(
    result: { id: string; score: number; metadata: Record<string, string | number | boolean> },
    rank: number,
  ): RAGResult {
    const meta = result.metadata;
    const content = this.extractString(meta, 'content') ?? '';
    const tierStr = this.extractString(meta, 'tier');
    const categoryStr = this.extractString(meta, 'category');
    const tagsStr = this.extractString(meta, 'tags');

    // Parse tags from JSON string
    let tags: string[] = [];
    if (tagsStr) {
      try {
        const parsed = JSON.parse(tagsStr);
        if (Array.isArray(parsed)) {
          tags = parsed.map(String);
        }
      } catch {
        tags = [];
      }
    }

    // Map tier string to MemoryTier enum
    const tier = this.parseTier(tierStr);
    const category = this.parseCategory(categoryStr);

    const entry: MemoryEntry = {
      id: result.id,
      content,
      tier,
      category,
      tags,
      createdAt: this.extractString(meta, 'createdAt') ?? new Date().toISOString(),
      updatedAt: this.extractString(meta, 'updatedAt') ?? new Date().toISOString(),
      chatId: this.extractString(meta, 'chatId'),
      sessionId: this.extractString(meta, 'sessionId'),
      summary: this.extractString(meta, 'summary'),
    };

    return {
      entry,
      similarity: result.score,
      rank,
    };
  }

  private extractString(
    metadata: Record<string, string | number | boolean>,
    key: string,
  ): string | undefined {
    const value = metadata[key];
    return typeof value === 'string' ? value : undefined;
  }

  private parseTier(value: string | undefined): MemoryTierType {
    switch (value) {
      case MemoryTier.Chat:
        return MemoryTier.Chat;
      case MemoryTier.Session:
        return MemoryTier.Session;
      case MemoryTier.LongTerm:
        return MemoryTier.LongTerm;
      default:
        return MemoryTier.LongTerm;
    }
  }

  private parseCategory(value: string | undefined): MemoryCategoryType {
    switch (value) {
      case MemoryCategory.Fact:
        return MemoryCategory.Fact;
      case MemoryCategory.Preference:
        return MemoryCategory.Preference;
      case MemoryCategory.Context:
        return MemoryCategory.Context;
      case MemoryCategory.Skill:
        return MemoryCategory.Skill;
      case MemoryCategory.Event:
        return MemoryCategory.Event;
      case MemoryCategory.General:
        return MemoryCategory.General;
      default:
        return MemoryCategory.General;
    }
  }
}
