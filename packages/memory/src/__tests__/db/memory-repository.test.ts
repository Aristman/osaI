/**
 * @osai/memory -- MemoryRepository Unit Tests (T-005)
 *
 * Test cases from ROADMAP_TASKS_F-005.md:
 *   TC-001: store() saves MemoryEntry to memory_entries table
 *   TC-002: findById() returns entry by id or null
 *   TC-003: findByChat() returns all entries for chat_id
 *   TC-004: findBySession() returns all entries for session_id
 *   TC-005: findLongTerm() returns entries with tier='long-term'
 *   TC-006: delete() removes entry by id
 *   TC-007: searchByTags() filters entries by tags (JSON contains)
 *   TC-008: schema migration is idempotent (no error on re-init)
 *
 * Uses in-memory SQLite for isolation.
 */

import Database from 'better-sqlite3';
import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryRepository } from '../../db/memory-repository.js';
import type { MemoryEntry, StoreMemoryEntry } from '../../db/memory-repository.js';

function createTestDb(): Database.Database {
  // better-sqlite3 supports ':memory:' for in-memory databases
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  return db;
}

function makeEntry(overrides: Partial<StoreMemoryEntry> = {}): StoreMemoryEntry {
  return {
    id: `mem_${Math.random().toString(36).slice(2, 10)}`,
    content: 'Test memory content',
    tier: 'long-term',
    tags: ['test', 'important'],
    metadata: { source: 'unit-test' },
    ...overrides,
  };
}

describe('MemoryRepository', () => {
  let db: Database.Database;
  let repo: MemoryRepository;

  beforeEach(() => {
    db = createTestDb();
    repo = new MemoryRepository(db);
    repo.initSchema();
  });

  // TC-001: store() saves MemoryEntry to memory_entries table
  it('TC-001: store() saves MemoryEntry to memory_entries table', () => {
    const entry = makeEntry({
      id: 'mem_store_test',
      content: 'Stored content',
      tier: 'long-term',
    });

    const result = repo.store(entry);

    expect(result.id).toBe('mem_store_test');
    expect(result.content).toBe('Stored content');
    expect(result.tier).toBe('long-term');
    expect(result.tags).toEqual(['test', 'important']);
    expect(result.metadata).toEqual({ source: 'unit-test' });
    expect(result.createdAt).toBeDefined();
    expect(result.updatedAt).toBeDefined();

    // Verify it's actually in the database
    const found = repo.findById('mem_store_test');
    expect(found).not.toBeNull();
    expect(found!.content).toBe('Stored content');
    expect(found!.tier).toBe('long-term');
  });

  // TC-002: findById() returns entry by id or null
  it('TC-002: findById() returns entry by id or null', () => {
    // Not found
    const notFound = repo.findById('nonexistent');
    expect(notFound).toBeNull();

    // Found
    const entry = makeEntry({ id: 'mem_find_test', content: 'Find me' });
    repo.store(entry);

    const found = repo.findById('mem_find_test');
    expect(found).not.toBeNull();
    expect(found!.id).toBe('mem_find_test');
    expect(found!.content).toBe('Find me');
    expect(found!.tags).toEqual(['test', 'important']);
    expect(found!.metadata).toEqual({ source: 'unit-test' });
  });

  // TC-003: findByChat() returns all entries for chat_id
  it('TC-003: findByChat() returns all entries for chat_id', () => {
    const chatId = 'chat_123';

    // Store entries for chat_123
    repo.store(makeEntry({ id: 'mem_chat_1', tier: 'chat', chatId, content: 'Chat entry 1' }));
    repo.store(makeEntry({ id: 'mem_chat_2', tier: 'chat', chatId, content: 'Chat entry 2' }));

    // Store entry for different chat
    repo.store(makeEntry({ id: 'mem_chat_other', tier: 'chat', chatId: 'chat_456', content: 'Other chat' }));

    // Store long-term entry (no chatId)
    repo.store(makeEntry({ id: 'mem_lt', tier: 'long-term', content: 'Long term' }));

    const results = repo.findByChat(chatId);

    expect(results).toHaveLength(2);
    const ids = results.map((e: MemoryEntry) => e.id);
    expect(ids).toContain('mem_chat_1');
    expect(ids).toContain('mem_chat_2');
    expect(ids).not.toContain('mem_chat_other');
    expect(ids).not.toContain('mem_lt');
  });

  // TC-004: findBySession() returns all entries for session_id
  it('TC-004: findBySession() returns all entries for session_id', () => {
    const sessionId = 'sess_abc';

    // Store entries for sess_abc
    repo.store(makeEntry({ id: 'mem_sess_1', tier: 'session', sessionId, content: 'Session entry 1' }));
    repo.store(makeEntry({ id: 'mem_sess_2', tier: 'session', sessionId, content: 'Session entry 2' }));

    // Store entry for different session
    repo.store(makeEntry({ id: 'mem_sess_other', tier: 'session', sessionId: 'sess_xyz', content: 'Other session' }));

    const results = repo.findBySession(sessionId);

    expect(results).toHaveLength(2);
    const ids = results.map((e: MemoryEntry) => e.id);
    expect(ids).toContain('mem_sess_1');
    expect(ids).toContain('mem_sess_2');
    expect(ids).not.toContain('mem_sess_other');
  });

  // TC-005: findLongTerm() returns entries with tier='long-term'
  it('TC-005: findLongTerm() returns entries with tier long-term (shared across chats)', () => {
    repo.store(makeEntry({ id: 'mem_lt_1', tier: 'long-term', content: 'Long term 1' }));
    repo.store(makeEntry({ id: 'mem_lt_2', tier: 'long-term', content: 'Long term 2' }));
    repo.store(makeEntry({ id: 'mem_chat_1', tier: 'chat', chatId: 'chat_1', content: 'Chat entry' }));
    repo.store(makeEntry({ id: 'mem_sess_1', tier: 'session', sessionId: 'sess_1', content: 'Session entry' }));

    const results = repo.findLongTerm();

    expect(results).toHaveLength(2);
    expect(results.every((e: MemoryEntry) => e.tier === 'long-term')).toBe(true);
    const ids = results.map((e: MemoryEntry) => e.id);
    expect(ids).toContain('mem_lt_1');
    expect(ids).toContain('mem_lt_2');
    expect(ids).not.toContain('mem_chat_1');
    expect(ids).not.toContain('mem_sess_1');
  });

  // TC-006: delete() removes entry by id
  it('TC-006: delete() removes entry by id', () => {
    const entry = makeEntry({ id: 'mem_delete_test', content: 'Delete me' });
    repo.store(entry);

    // Verify it exists
    expect(repo.findById('mem_delete_test')).not.toBeNull();

    // Delete it
    const deleted = repo.delete('mem_delete_test');
    expect(deleted).toBe(true);

    // Verify it's gone
    expect(repo.findById('mem_delete_test')).toBeNull();

    // Delete non-existent should return false
    const deletedAgain = repo.delete('mem_delete_test');
    expect(deletedAgain).toBe(false);
  });

  // TC-007: searchByTags() filters entries by tags (JSON contains)
  it('TC-007: searchByTags() filters entries by tags (JSON contains)', () => {
    repo.store(makeEntry({
      id: 'mem_tag_1',
      tags: ['python', 'programming'],
      content: 'Python content',
    }));
    repo.store(makeEntry({
      id: 'mem_tag_2',
      tags: ['rust', 'programming'],
      content: 'Rust content',
    }));
    repo.store(makeEntry({
      id: 'mem_tag_3',
      tags: ['cooking'],
      content: 'Cooking content',
    }));

    // Search for 'programming' -- should find 2 entries
    const progResults = repo.searchByTags(['programming']);
    expect(progResults).toHaveLength(2);
    const progIds = progResults.map((e: MemoryEntry) => e.id);
    expect(progIds).toContain('mem_tag_1');
    expect(progIds).toContain('mem_tag_2');

    // Search for 'rust' -- should find 1 entry
    const rustResults = repo.searchByTags(['rust']);
    expect(rustResults).toHaveLength(1);
    expect(rustResults[0]!.id).toBe('mem_tag_2');

    // Search for multiple tags (OR logic)
    const multiResults = repo.searchByTags(['python', 'cooking']);
    expect(multiResults).toHaveLength(2);
    const multiIds = multiResults.map((e: MemoryEntry) => e.id);
    expect(multiIds).toContain('mem_tag_1');
    expect(multiIds).toContain('mem_tag_3');

    // Search with empty tags -- should return empty
    const emptyResults = repo.searchByTags([]);
    expect(emptyResults).toHaveLength(0);

    // Search for non-existent tag
    const noResults = repo.searchByTags(['nonexistent']);
    expect(noResults).toHaveLength(0);
  });

  // TC-008: schema migration is idempotent
  it('TC-008: schema migration is idempotent (no error on re-init)', () => {
    // First init was in beforeEach, call initSchema() again
    expect(() => repo.initSchema()).not.toThrow();

    // Verify tables still work correctly after double init
    const entry = makeEntry({ id: 'mem_idempotent', content: 'After double init' });
    repo.store(entry);

    const found = repo.findById('mem_idempotent');
    expect(found).not.toBeNull();
    expect(found!.content).toBe('After double init');

    // Third init should also be fine
    expect(() => repo.initSchema()).not.toThrow();

    // Data should still be intact
    expect(repo.findById('mem_idempotent')).not.toBeNull();
  });
});
