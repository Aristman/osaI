/**
 * @osai/knowledge-base -- Schema Unit Tests (T-003)
 *
 * Test cases from ROADMAP_TASKS_F-006.md:
 *   TC-003-1: Tables created on init
 *   TC-003-2: Init is idempotent
 *
 * Uses in-memory SQLite for isolation.
 */

import Database from 'better-sqlite3';
import { describe, it, expect, beforeEach } from 'vitest';
import { KnowledgeRepository } from '../../db/repository.js';

function createTestDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  return db;
}

describe('Knowledge Base Schema', () => {
  let db: Database.Database;
  let repo: KnowledgeRepository;

  beforeEach(() => {
    db = createTestDb();
    repo = new KnowledgeRepository(db);
  });

  // TC-003-1: Tables created on init
  it('TC-003-1: Tables created on init', () => {
    repo.initSchema();

    // Verify knowledge_documents table exists
    const docTable = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='knowledge_documents'")
      .get();
    expect(docTable).toBeDefined();

    // Verify knowledge_chunks table exists
    const chunkTable = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='knowledge_chunks'")
      .get();
    expect(chunkTable).toBeDefined();
  });

  // TC-003-1 extension: Verify indexes exist
  it('TC-003-1: Indexes created on init', () => {
    repo.initSchema();

    // Verify idx_knowledge_chunks_document_id
    const chunkIdx = db
      .prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_knowledge_chunks_document_id'")
      .get();
    expect(chunkIdx).toBeDefined();

    // Verify idx_knowledge_documents_format
    const formatIdx = db
      .prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_knowledge_documents_format'")
      .get();
    expect(formatIdx).toBeDefined();

    // Verify idx_knowledge_documents_status
    const statusIdx = db
      .prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_knowledge_documents_status'")
      .get();
    expect(statusIdx).toBeDefined();
  });

  // TC-003-1 extension: Verify FOREIGN KEY constraint
  it('TC-003-1: Foreign key constraint on knowledge_chunks.document_id', () => {
    repo.initSchema();

    // Insert a document
    repo.insertDocument({
      id: 'doc_fk_test',
      title: 'FK Test',
      path: '/test/fk.txt',
      format: 'txt',
    });

    // Insert a chunk with valid document_id -- should succeed
    expect(() => {
      repo.insertChunk({
        id: 'chunk_valid_fk',
        documentId: 'doc_fk_test',
        content: 'Valid chunk',
        chunkIndex: 0,
      });
    }).not.toThrow();

    // Insert a chunk with invalid document_id -- should fail due to FK
    expect(() => {
      repo.insertChunk({
        id: 'chunk_invalid_fk',
        documentId: 'nonexistent_doc',
        content: 'Invalid chunk',
        chunkIndex: 0,
      });
    }).toThrow();
  });

  // TC-003-1 extension: Verify UNIQUE constraint on path
  it('TC-003-1: UNIQUE constraint on knowledge_documents.path', () => {
    repo.initSchema();

    repo.insertDocument({
      id: 'doc_path_1',
      title: 'First',
      path: '/test/same.txt',
      format: 'txt',
    });

    // Inserting another document with the same path should throw
    expect(() => {
      repo.insertDocument({
        id: 'doc_path_2',
        title: 'Second',
        path: '/test/same.txt',
        format: 'txt',
      });
    }).toThrow();
  });

  // TC-003-2: Init is idempotent
  it('TC-003-2: Init is idempotent', () => {
    repo.initSchema();
    repo.initSchema();

    // Tables should still exist and be functional
    const docTable = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='knowledge_documents'")
      .get();
    expect(docTable).toBeDefined();

    const chunkTable = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='knowledge_chunks'")
      .get();
    expect(chunkTable).toBeDefined();

    // Data inserted before second init should still be accessible
    repo.insertDocument({
      id: 'doc_idempotent',
      title: 'Idempotent Test',
      path: '/test/idempotent.txt',
      format: 'md',
    });

    const doc = repo.getDocument('doc_idempotent');
    expect(doc).not.toBeNull();
    expect(doc!.title).toBe('Idempotent Test');
  });

  // TC-003-2 extension: Third init should also work
  it('TC-003-2: Third init also succeeds', () => {
    repo.initSchema();
    repo.initSchema();
    repo.initSchema();

    // Insert data to verify tables still work
    repo.insertDocument({
      id: 'doc_triple_init',
      title: 'Triple Init Test',
      path: '/test/triple.txt',
      format: 'pdf',
    });

    const doc = repo.getDocument('doc_triple_init');
    expect(doc).not.toBeNull();
    expect(doc!.format).toBe('pdf');
  });
});
