/**
 * @osai/knowledge-base -- Ingest Pipeline (T-004)
 *
 * Full document ingestion pipeline:
 *   Parse -> Chunk -> Embed (batch) -> Store (SQLite + VectorStorage)
 *
 * Features:
 * - Constructor-based dependency injection
 * - Rollback on failure (better-sqlite3 transaction)
 * - Progress reporting via EventEmitter
 * - Checksum-based dedup detection
 * - Document title extraction from parsed content
 */

import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { createHash } from 'node:crypto';
import path from 'node:path';
import type Database from 'better-sqlite3';

import type { KnowledgeRepository } from '../db/repository.js';
import type { ParserRegistry } from '../parsers/parser-registry.js';
import type { EmbeddingProvider, VectorStorage } from '@osai/memory';
import type { DocumentFormat } from '../types/document.js';
import { DocumentStatus } from '../types/document.js';
import { splitTextIntoChunks } from './chunker.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Result of a document ingestion. */
export interface IngestResult {
  /** The ingested document ID. */
  documentId: string;
  /** Number of chunks stored. */
  chunksStored: number;
  /** Final status of the document. */
  status: 'completed' | 'error';
  /** Total time taken in milliseconds. */
  durationMs: number;
  /** Number of tokens across all chunks. */
  totalTokens: number;
}

/** Progress event payload. */
export interface IngestProgressEvent {
  /** Current step name. */
  step: 'parsing' | 'chunking' | 'embedding' | 'storing';
  /** Current progress (0-1). */
  progress: number;
  /** Additional message. */
  message?: string;
}

/** Chunk embedded event payload. */
export interface ChunkEmbeddedEvent {
  /** Chunk index (0-based). */
  chunkIndex: number;
  /** Total number of chunks. */
  totalChunks: number;
}

/** Document stored event payload. */
export interface DocumentStoredEvent {
  /** Document ID. */
  documentId: string;
  /** Number of chunks stored. */
  chunksStored: number;
}

// ---------------------------------------------------------------------------
// Error types
// ---------------------------------------------------------------------------

/**
 * Thrown when a document with the same path already exists in the knowledge base.
 */
export class DocumentAlreadyExistsError extends Error {
  constructor(public readonly documentPath: string) {
    super(`Document already exists: ${documentPath}`);
    this.name = 'DocumentAlreadyExistsError';
  }
}

// ---------------------------------------------------------------------------
// IngestPipeline
// ---------------------------------------------------------------------------

export interface IngestPipelineEvents {
  progress: [IngestProgressEvent];
  'chunk:embedded': [ChunkEmbeddedEvent];
  'document:stored': [DocumentStoredEvent];
}

/**
 * Document ingestion pipeline.
 *
 * Orchestrates: Parse -> Chunk -> Embed (batch) -> Store.
 * Uses better-sqlite3 transactions for atomicity.
 * Emits progress events via EventEmitter.
 */
export class IngestPipeline extends EventEmitter<IngestPipelineEvents> {
  private readonly repository: KnowledgeRepository;
  private readonly parserRegistry: ParserRegistry;
  private readonly embeddingProvider: EmbeddingProvider;
  private readonly vectorStorage: VectorStorage;
  private readonly db: Database.Database;

  constructor(
    repository: KnowledgeRepository,
    parserRegistry: ParserRegistry,
    embeddingProvider: EmbeddingProvider,
    vectorStorage: VectorStorage,
    db: Database.Database,
  ) {
    super();
    this.repository = repository;
    this.parserRegistry = parserRegistry;
    this.embeddingProvider = embeddingProvider;
    this.vectorStorage = vectorStorage;
    this.db = db;
  }

  /**
   * Ingest a document into the knowledge base.
   *
   * Pipeline steps:
   * 1. Check for duplicate path
   * 2. Parse document (detect format from extension if not provided)
   * 3. Chunk parsed text
   * 4. Embed all chunks (batch)
   * 5. Store document + chunks in DB, vectors in VectorStorage
   *
   * All DB operations are wrapped in a transaction.
   * On failure, the transaction is rolled back.
   *
   * @param filePath  - File path for the document (used for dedup and title fallback).
   * @param buffer    - Raw document bytes.
   * @param format    - Document format (auto-detected from extension if not provided).
   * @param tags      - Optional tags for categorization.
   * @returns IngestResult with document ID and statistics.
   * @throws DocumentAlreadyExistsError if a document with the same path exists.
   * @throws ParseError if parsing fails.
   * @throws Error if embedding or storage fails (triggers rollback).
   */
  async ingestDocument(
    filePath: string,
    buffer: Buffer,
    format?: DocumentFormat | string,
    tags?: string[],
  ): Promise<IngestResult> {
    const startTime = Date.now();

    // Detect format from file extension if not provided
    const rawFormat = format ?? this.detectFormat(filePath);
    if (!rawFormat) {
      throw new Error(`Cannot detect document format for: ${filePath}`);
    }
    const resolvedFormat = rawFormat as DocumentFormat;

    // Step 0: Check for duplicate
    this.emit('progress', {
      step: 'parsing',
      progress: 0,
      message: 'Checking for duplicates...',
    });

    const existing = this.repository.listDocuments();
    const duplicate = existing.find(d => d.path === filePath);
    if (duplicate) {
      throw new DocumentAlreadyExistsError(filePath);
    }

    // Compute checksum
    const checksum = this.computeChecksum(buffer);

    // Step 1: Parse
    this.emit('progress', {
      step: 'parsing',
      progress: 0.1,
      message: 'Parsing document...',
    });

    const parsed = await this.parserRegistry.parseAsync(resolvedFormat, buffer);
    const title = parsed.title ?? path.basename(filePath);

    // Step 2: Chunk
    this.emit('progress', {
      step: 'chunking',
      progress: 0.3,
      message: 'Chunking text...',
    });

    const chunks = splitTextIntoChunks(parsed.content);

    if (chunks.length === 0) {
      // Empty document: store it with 0 chunks
      const documentId = randomUUID();
      this.repository.insertDocument({
        id: documentId,
        title,
        path: filePath,
        format: resolvedFormat,
        status: DocumentStatus.Completed,
        chunksCount: 0,
        totalSize: buffer.length,
        tags,
        checksum,
      });

      const durationMs = Date.now() - startTime;
      this.emit('document:stored', { documentId, chunksStored: 0 });

      return {
        documentId,
        chunksStored: 0,
        status: 'completed',
        durationMs,
        totalTokens: 0,
      };
    }

    // Step 3: Embed chunks
    this.emit('progress', {
      step: 'embedding',
      progress: 0.5,
      message: `Embedding ${chunks.length} chunks...`,
    });

    const chunkTexts = chunks.map(c => c.content);
    const embeddings = await this.embeddingProvider.embed(chunkTexts);

    // Step 4: Store in transaction
    this.emit('progress', {
      step: 'storing',
      progress: 0.8,
      message: 'Storing document and chunks...',
    });

    const documentId = randomUUID();

    try {
      this.db.exec('BEGIN');

      // Insert document
      this.repository.insertDocument({
        id: documentId,
        title,
        path: filePath,
        format: resolvedFormat,
        status: DocumentStatus.Processing,
        chunksCount: chunks.length,
        totalSize: buffer.length,
        tags,
        checksum,
      });

      // Insert chunks and vectors
      let totalTokens = 0;

      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i]!;
        const embedding = embeddings[i]!;
        const chunkId = `chunk_${documentId}_${i}`;

        // Store chunk in SQLite
        this.repository.insertChunk({
          id: chunkId,
          documentId,
          content: chunk.content,
          chunkIndex: chunk.metadata.chunkIndex,
        });

        // Store vector in VectorStorage
        this.vectorStorage.upsert(chunkId, embedding.vector, {
          documentId,
          chunkIndex: chunk.metadata.chunkIndex,
          format: resolvedFormat,
        });

        totalTokens += chunk.metadata.tokenCount;

        this.emit('chunk:embedded', {
          chunkIndex: i,
          totalChunks: chunks.length,
        });

        this.emit('progress', {
          step: 'storing',
          progress: 0.8 + (0.2 * (i + 1)) / chunks.length,
          message: `Stored chunk ${i + 1}/${chunks.length}`,
        });
      }

      // Update document status to completed
      this.repository.updateDocument(documentId, {
        status: DocumentStatus.Completed,
      });

      this.db.exec('COMMIT');

      this.emit('document:stored', { documentId, chunksStored: chunks.length });

      const durationMs = Date.now() - startTime;

      this.emit('progress', {
        step: 'storing',
        progress: 1,
        message: 'Ingestion complete.',
      });

      return {
        documentId,
        chunksStored: chunks.length,
        status: 'completed',
        durationMs,
        totalTokens,
      };
    } catch (error) {
      // Rollback on any failure
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  /**
   * Detect document format from file extension.
   */
  private detectFormat(filePath: string): DocumentFormat | null {
    const ext = path.extname(filePath).toLowerCase().slice(1);
    if (['txt', 'md', 'pdf'].includes(ext)) {
      return ext as DocumentFormat;
    }
    return null;
  }

  /**
   * Compute SHA-256 checksum for a buffer.
   */
  private computeChecksum(buffer: Buffer): string {
    return createHash('sha256').update(buffer).digest('hex');
  }
}
