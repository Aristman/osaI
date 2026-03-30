/**
 * @osai/knowledge-base -- SourceManager (T-006)
 *
 * CRUD operations for managing knowledge base document sources:
 *   - addSource: triggers the full ingest pipeline
 *   - removeSource: cascading delete (document + chunks + vectors)
 *   - listSources: filter by tags (ALL must match), sort by date
 *   - getSourceStats: aggregate statistics
 *
 * Constructor-based dependency injection per profile constraints.
 */

import type { IngestPipeline } from '../ingest/ingest-pipeline.js';
import type { KnowledgeRepository } from '../db/repository.js';
import type { VectorStorage } from '@osai/memory';
import type { SourceInfo, SourceTag } from '../types/source.js';
import type { KnowledgeDocument } from '../types/document.js';

// ---------------------------------------------------------------------------
// Error types
// ---------------------------------------------------------------------------

/**
 * Thrown when attempting to remove a document that does not exist.
 */
export class SourceNotFoundError extends Error {
  constructor(public readonly documentId: string) {
    super(`Source not found: ${documentId}`);
    this.name = 'SourceNotFoundError';
  }
}

// ---------------------------------------------------------------------------
// Filter types
// ---------------------------------------------------------------------------

/** Filter options for listing sources. */
export interface ListSourcesFilter {
  /** Only return documents containing ALL specified tags. */
  tags?: string[];
}

/** Statistics about the knowledge base. */
export interface SourceStats {
  /** Total number of documents. */
  total: number;
  /** Documents grouped by format. */
  byFormat: Record<string, number>;
  /** Documents grouped by tag. */
  byTag: Record<string, number>;
}

// ---------------------------------------------------------------------------
// SourceManager
// ---------------------------------------------------------------------------

/**
 * SourceManager -- high-level CRUD for knowledge base sources.
 *
 * Coordinates between IngestPipeline (add), KnowledgeRepository (read/delete),
 * and VectorStorage (vector cleanup on remove).
 */
export class SourceManager {
  private readonly ingestPipeline: IngestPipeline;
  private readonly repository: KnowledgeRepository;
  private readonly vectorStorage: VectorStorage;

  constructor(
    ingestPipeline: IngestPipeline,
    repository: KnowledgeRepository,
    vectorStorage: VectorStorage,
  ) {
    this.ingestPipeline = ingestPipeline;
    this.repository = repository;
    this.vectorStorage = vectorStorage;
  }

  /**
   * Add a new document source to the knowledge base.
   *
   * Delegates to IngestPipeline for the full ingestion:
   *   Parse -> Chunk -> Embed -> Store.
   *
   * @param path   - File path (used for dedup and title fallback).
   * @param buffer - Raw document bytes.
   * @param format - Document format (auto-detected from extension if not provided).
   * @param tags   - Optional tags for categorization.
   * @returns Object containing the document ID.
   * @throws DocumentAlreadyExistsError if a document with the same path exists.
   */
  async addSource(
    path: string,
    buffer: Buffer,
    format?: string,
    tags?: string[],
  ): Promise<{ documentId: string }> {
    const result = await this.ingestPipeline.ingestDocument(path, buffer, format, tags);
    return { documentId: result.documentId };
  }

  /**
   * Remove a document source and all associated data.
   *
   * Cascade deletion order:
   *   1. Fetch chunks from DB (to get vector IDs)
   *   2. Delete vectors from VectorStorage
   *   3. Delete document from DB (chunks cascade via FK ON DELETE CASCADE)
   *
   * @param documentId - The document ID to remove.
   * @throws SourceNotFoundError if the document does not exist.
   */
  async removeSource(documentId: string): Promise<void> {
    const document = this.repository.getDocument(documentId);
    if (!document) {
      throw new SourceNotFoundError(documentId);
    }

    // Step 1: Fetch chunks to determine vector IDs
    const chunks = this.repository.getChunksByDocument(documentId);

    // Step 2: Delete vectors from VectorStorage
    for (const chunk of chunks) {
      this.vectorStorage.delete(chunk.id);
    }

    // Step 3: Delete document (chunks cascade via FK)
    this.repository.deleteDocument(documentId);
  }

  /**
   * List document sources, optionally filtered by tags.
   *
   * When tags filter is provided, only documents containing ALL specified tags
   * are returned (AND logic).
   *
   * Results are sorted by createdAt DESC (newest first).
   *
   * @param filter - Optional filter criteria.
   * @returns Array of SourceInfo objects.
   */
  listSources(filter?: ListSourcesFilter): SourceInfo[] {
    const documents = this.repository.listDocuments();

    // Apply tag filtering: ALL specified tags must be present
    const filtered = filter?.tags && filter.tags.length > 0
      ? documents.filter(doc => this.documentHasAllTags(doc, filter.tags!))
      : documents;

    // Sort by createdAt DESC (listDocuments already returns DESC, but ensure it)
    return filtered
      .sort((a, b) => b.createdAt - a.createdAt)
      .map(doc => this.toSourceInfo(doc));
  }

  /**
   * Get aggregate statistics about the knowledge base.
   *
   * @returns SourceStats with total count, counts by format, and counts by tag.
   */
  getSourceStats(): SourceStats {
    const documents = this.repository.listDocuments();

    const byFormat: Record<string, number> = {};
    const byTag: Record<string, number> = {};

    for (const doc of documents) {
      // Count by format
      byFormat[doc.format] = (byFormat[doc.format] ?? 0) + 1;

      // Count by tag
      for (const tag of doc.tags) {
        byTag[tag] = (byTag[tag] ?? 0) + 1;
      }
    }

    return {
      total: documents.length,
      byFormat,
      byTag,
    };
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Check if a document contains ALL specified tags.
   */
  private documentHasAllTags(doc: KnowledgeDocument, tags: string[]): boolean {
    const docTags = new Set(doc.tags);
    return tags.every(tag => docTags.has(tag));
  }

  /**
   * Convert a KnowledgeDocument to a SourceInfo.
   */
  private toSourceInfo(doc: KnowledgeDocument): SourceInfo {
    const sourceTags: SourceTag[] = doc.tags.map(tag => ({ name: tag }));

    return {
      documentId: doc.id,
      title: doc.title,
      path: doc.path,
      format: doc.format,
      status: doc.status,
      chunksCount: doc.chunksCount,
      totalSize: doc.totalSize,
      tags: sourceTags,
      createdAt: new Date(doc.createdAt * 1000).toISOString(),
      updatedAt: new Date(doc.updatedAt * 1000).toISOString(),
    };
  }
}
