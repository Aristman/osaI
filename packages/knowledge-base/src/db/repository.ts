/**
 * @osai/knowledge-base -- KnowledgeRepository (T-003)
 *
 * Data access layer for knowledge base document and chunk storage.
 * Provides CRUD operations over knowledge_documents and knowledge_chunks.
 *
 * Uses synchronous better-sqlite3 API (intentional per architecture).
 * All queries are parameterized for security.
 */

import type Database from 'better-sqlite3';
import { KB_SCHEMA_SQL } from './schema.js';
import type {
  KnowledgeDocument,
  InsertKnowledgeDocument,
  UpdateKnowledgeDocument,
  ListDocumentsFilter,
  KnowledgeChunk,
  InsertKnowledgeChunk,
} from '../types/index.js';

/** Row shape from knowledge_documents SELECT */
interface KnowledgeDocumentRow {
  id: string;
  title: string;
  path: string;
  format: string;
  status: string;
  chunks_count: number;
  total_size: number;
  tags: string;
  created_at: number;
  updated_at: number;
  checksum: string | null;
}

/** Row shape from knowledge_chunks SELECT */
interface KnowledgeChunkRow {
  id: string;
  document_id: string;
  content: string;
  chunk_index: number;
  created_at: number;
}

/**
 * Parse a database row into a KnowledgeDocument.
 */
function parseDocumentRow(row: KnowledgeDocumentRow): KnowledgeDocument {
  let tags: string[] = [];
  try {
    const parsed = JSON.parse(row.tags) as unknown;
    if (Array.isArray(parsed)) {
      tags = parsed as string[];
    }
  } catch {
    tags = [];
  }

  return {
    id: row.id,
    title: row.title,
    path: row.path,
    format: row.format as KnowledgeDocument['format'],
    status: row.status as KnowledgeDocument['status'],
    chunksCount: row.chunks_count,
    totalSize: row.total_size,
    tags,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    checksum: row.checksum ?? undefined,
  };
}

/**
 * Parse a database row into a KnowledgeChunk.
 */
function parseChunkRow(row: KnowledgeChunkRow): KnowledgeChunk {
  return {
    id: row.id,
    documentId: row.document_id,
    content: row.content,
    chunkIndex: row.chunk_index,
    createdAt: row.created_at,
  };
}

/**
 * KnowledgeRepository -- data access for the knowledge base.
 *
 * Accepts a raw better-sqlite3 Database connection.
 * Callers are responsible for database lifecycle (open/close).
 */
export class KnowledgeRepository {
  private readonly db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  /**
   * Initialize the knowledge base schema.
   * Idempotent: safe to call multiple times.
   */
  initSchema(): void {
    this.db.exec(KB_SCHEMA_SQL);
  }

  /**
   * Insert a new document into the knowledge base.
   *
   * @param doc - Document data to insert
   * @returns The inserted document id
   */
  insertDocument(doc: InsertKnowledgeDocument): string {
    const now = Math.floor(Date.now() / 1000);
    const tagsJson = JSON.stringify(doc.tags ?? []);

    this.db.prepare(
      'INSERT INTO knowledge_documents (id, title, path, format, status, chunks_count, total_size, tags, created_at, updated_at, checksum) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(
      doc.id,
      doc.title,
      doc.path,
      doc.format,
      doc.status ?? 'pending',
      doc.chunksCount ?? 0,
      doc.totalSize ?? 0,
      tagsJson,
      now,
      now,
      doc.checksum ?? null,
    );

    return doc.id;
  }

  /**
   * Update an existing document by id.
   * Only the provided fields are updated.
   * Automatically updates the updated_at timestamp.
   *
   * @param id - Document id to update
   * @param updates - Fields to update
   */
  updateDocument(id: string, updates: UpdateKnowledgeDocument): void {
    const now = Math.floor(Date.now() / 1000);
    const setClauses: string[] = ['updated_at = ?'];
    const values: unknown[] = [now];

    if (updates.title !== undefined) {
      setClauses.push('title = ?');
      values.push(updates.title);
    }
    if (updates.status !== undefined) {
      setClauses.push('status = ?');
      values.push(updates.status);
    }
    if (updates.chunksCount !== undefined) {
      setClauses.push('chunks_count = ?');
      values.push(updates.chunksCount);
    }
    if (updates.totalSize !== undefined) {
      setClauses.push('total_size = ?');
      values.push(updates.totalSize);
    }
    if (updates.tags !== undefined) {
      setClauses.push('tags = ?');
      values.push(JSON.stringify(updates.tags));
    }
    if (updates.checksum !== undefined) {
      setClauses.push('checksum = ?');
      values.push(updates.checksum);
    }

    values.push(id);

    const sql = 'UPDATE knowledge_documents SET ' + setClauses.join(', ') + ' WHERE id = ?';
    this.db.prepare(sql).run(...values);
  }

  /**
   * Delete a document by id.
   * All associated chunks are deleted via FOREIGN KEY ON DELETE CASCADE.
   *
   * @param id - Document id to delete
   */
  deleteDocument(id: string): void {
    this.db.prepare('DELETE FROM knowledge_documents WHERE id = ?').run(id);
  }

  /**
   * Get a single document by id.
   *
   * @param id - Document id to retrieve
   * @returns The document, or null if not found
   */
  getDocument(id: string): KnowledgeDocument | null {
    const row = this.db
      .prepare('SELECT * FROM knowledge_documents WHERE id = ?')
      .get(id) as KnowledgeDocumentRow | undefined;

    return row ? parseDocumentRow(row) : null;
  }

  /**
   * List documents, optionally filtered by format, status, or tag.
   *
   * @param filter - Optional filter criteria
   * @returns Array of matching documents, ordered by created_at DESC
   */
  listDocuments(filter?: ListDocumentsFilter): KnowledgeDocument[] {
    const conditions: string[] = [];
    const values: unknown[] = [];

    if (filter?.format !== undefined) {
      conditions.push('format = ?');
      values.push(filter.format);
    }
    if (filter?.status !== undefined) {
      conditions.push('status = ?');
      values.push(filter.status);
    }
    if (filter?.tag !== undefined) {
      conditions.push(
        'EXISTS (SELECT 1 FROM json_each(knowledge_documents.tags) WHERE json_each.value = ?)'
      );
      values.push(filter.tag);
    }

    const whereClause = conditions.length > 0
      ? 'WHERE ' + conditions.join(' AND ')
      : '';

    const sql = 'SELECT * FROM knowledge_documents ' + whereClause + ' ORDER BY created_at DESC';
    const rows = this.db
      .prepare(sql)
      .all(...values) as KnowledgeDocumentRow[];

    return rows.map(parseDocumentRow);
  }

  /**
   * Insert a new chunk linked to a document.
   *
   * @param chunk - Chunk data to insert
   * @returns The inserted chunk id
   */
  insertChunk(chunk: InsertKnowledgeChunk): string {
    const now = Math.floor(Date.now() / 1000);

    this.db.prepare(
      'INSERT INTO knowledge_chunks (id, document_id, content, chunk_index, created_at) VALUES (?, ?, ?, ?, ?)'
    ).run(
      chunk.id,
      chunk.documentId,
      chunk.content,
      chunk.chunkIndex,
      now,
    );

    return chunk.id;
  }

  /**
   * Get all chunks for a specific document.
   *
   * @param documentId - The parent document id
   * @returns Array of chunks ordered by chunk_index ASC
   */
  getChunksByDocument(documentId: string): KnowledgeChunk[] {
    const rows = this.db
      .prepare('SELECT * FROM knowledge_chunks WHERE document_id = ? ORDER BY chunk_index ASC')
      .all(documentId) as KnowledgeChunkRow[];

    return rows.map(parseChunkRow);
  }

  /**
   * Delete all chunks for a specific document.
   *
   * @param documentId - The parent document id
   * @returns The number of deleted chunks
   */
  deleteChunksByDocument(documentId: string): number {
    const result = this.db
      .prepare('DELETE FROM knowledge_chunks WHERE document_id = ?')
      .run(documentId);

    return result.changes;
  }
}
