/**
 * @osai/knowledge-base -- KBSearch (T-005)
 *
 * Semantic search with source attribution for the Knowledge Base.
 *
 * Pipeline: Query -> Embed -> Vector search -> Filter (top_k, min_similarity)
 *           -> Source attribution -> KBSearchResult[]
 *
 * Features:
 * - Constructor-based dependency injection
 * - Configurable top_k and min_similarity thresholds
 * - Source attribution from KnowledgeRepository
 * - RAG formatting: results as markdown for system prompt injection
 */

import type { EmbeddingProvider, VectorStorage } from '@osai/memory';
import type { KnowledgeRepository } from '../db/repository.js';
import type {
  KBSearchConfig,
  KBSearchResult,
} from '../types/search.js';
import { resolveKBSearchConfig } from '../types/search.js';

// ---------------------------------------------------------------------------
// Error types
// ---------------------------------------------------------------------------

/**
 * Thrown when an empty query is provided to KBSearch.
 */
export class EmptyQueryError extends Error {
  constructor() {
    super('Search query must not be empty');
    this.name = 'EmptyQueryError';
  }
}

// ---------------------------------------------------------------------------
// KBSearch
// ---------------------------------------------------------------------------

/**
 * Semantic search engine for the Knowledge Base.
 *
 * Orchestrates: Query -> EmbeddingProvider.embed() -> VectorStorage.search()
 *             -> KnowledgeRepository.getDocument() -> KBSearchResult[]
 */
export class KBSearch {
  private readonly embeddingProvider: EmbeddingProvider;
  private readonly vectorStorage: VectorStorage;
  private readonly repository: KnowledgeRepository;
  private readonly defaultConfig: KBSearchConfig;

  constructor(
    embeddingProvider: EmbeddingProvider,
    vectorStorage: VectorStorage,
    repository: KnowledgeRepository,
    defaultConfig?: KBSearchConfig,
  ) {
    this.embeddingProvider = embeddingProvider;
    this.vectorStorage = vectorStorage;
    this.repository = repository;
    this.defaultConfig = defaultConfig ?? {};
  }

  /**
   * Perform a semantic search in the Knowledge Base.
   *
   * Pipeline:
   * 1. Validate query (non-empty)
   * 2. Embed the query via EmbeddingProvider
   * 3. Search vectors via VectorStorage (top_k, min_similarity)
   * 4. Enrich each result with source attribution from KnowledgeRepository
   *
   * @param query  - Natural language search query (non-empty)
   * @param config - Optional search configuration overrides (merged with defaults)
   * @returns Array of KBSearchResult sorted by similarity descending
   * @throws EmptyQueryError if query is empty or whitespace-only
   */
  async search(
    query: string,
    config?: KBSearchConfig,
  ): Promise<KBSearchResult[]> {
    // Step 1: Validate query
    if (!query || query.trim().length === 0) {
      throw new EmptyQueryError();
    }

    // Merge config: caller overrides > constructor defaults > built-in defaults
    const mergedConfig = {
      topK: config?.topK ?? this.defaultConfig.topK,
      minSimilarity: config?.minSimilarity ?? this.defaultConfig.minSimilarity,
      tags: config?.tags ?? this.defaultConfig.tags,
    };
    const resolved = resolveKBSearchConfig(mergedConfig);

    // Step 2: Embed the query
    const embeddingResult = await this.embeddingProvider.embed(query);

    // Step 3: Vector search
    // Pass topK and minSimilarity as hints to VectorStorage.
    // Apply our own filtering afterwards as defence in depth (VectorStorage
    // implementations may not honour the parameters strictly).
    const vectorResults = this.vectorStorage.search(
      embeddingResult.vector,
      resolved.topK,
      resolved.minSimilarity,
    );

    // Step 4: Filter by minSimilarity (enforce threshold locally)
    const filtered = vectorResults.filter(vr => vr.score >= resolved.minSimilarity);

    // Step 5: Apply topK limit
    const limited = filtered.slice(0, resolved.topK);

    // Step 6: Source attribution -- enrich each result with document info
    const results: KBSearchResult[] = [];

    for (const vr of limited) {
      const documentId = String(vr.metadata['documentId'] ?? '');
      const chunkIndex = Number(vr.metadata['chunkIndex'] ?? 0);

      const document = this.repository.getDocument(documentId);
      if (!document) {
        // Skip results whose source document no longer exists
        continue;
      }

      // Filter by tags if specified
      if (resolved.tags.length > 0) {
        const hasMatchingTag = resolved.tags.some(
          tag => document.tags.includes(tag),
        );
        if (!hasMatchingTag) {
          continue;
        }
      }

      // Get chunk content from the repository
      const chunks = this.repository.getChunksByDocument(documentId);
      const chunk = chunks.find(c => c.chunkIndex === chunkIndex);
      const content = chunk?.content ?? '';

      results.push({
        chunk: {
          id: vr.id,
          content,
          chunkIndex,
        },
        source: {
          documentId: document.id,
          title: document.title,
          path: document.path,
          tags: document.tags,
        },
        similarity: vr.score,
      });
    }

    // Results are already sorted by similarity descending from VectorStorage
    return results;
  }

  /**
   * Format search results as markdown for RAG injection into system prompts.
   *
   * Output format:
   * ```
   * ## Source: {title}
   * > {content}
   * > _Path: {path}, Chunk: {index}, Similarity: {score}_
   * ```
   *
   * @param results - Array of KBSearchResult to format
   * @returns Markdown-formatted string suitable for system prompt injection
   */
  formatForRAG(results: KBSearchResult[]): string {
    if (results.length === 0) {
      return '';
    }

    const sections = results.map(result => {
      const { title, path } = result.source;
      const { content, chunkIndex } = result.chunk;
      const similarity = result.similarity.toFixed(4);

      return [
        `## Source: ${title}`,
        `> ${content}`,
        `> _Path: ${path}, Chunk: ${chunkIndex}, Similarity: ${similarity}_`,
      ].join('\n');
    });

    return sections.join('\n\n');
  }
}
