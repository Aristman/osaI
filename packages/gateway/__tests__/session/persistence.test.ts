/**
 * Unit tests for SessionPersistence (SQLite)
 *
 * Tests cover: save/load sessions, save/load messages, delete sessions,
 * WAL mode, serialization/deserialization.
 *
 * Test IDs: T006-01 through T006-07
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import type { Database as DatabaseType } from 'better-sqlite3';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { rmSync } from 'node:fs';
import { SessionPersistence } from '../../src/session/persistence.js';
import { Session } from '../../src/session/router.js';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function createTestSession(
  id: string,
  type: 'main' | 'group' | 'isolated' = 'main',
  options?: { activationMode?: string; wakeWord?: string },
): Session {
  return new Session(id, type, {
    activationMode: options?.activationMode as Session['activationMode'],
    wakeWord: options?.wakeWord,
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SessionPersistence', () => {
  let db: DatabaseType;
  let persistence: SessionPersistence;
  let dbPath: string;

  beforeEach(() => {
    dbPath = join(tmpdir(), `osai-persist-test-${Date.now()}-${Math.random().toString(36).slice(2, 6)}.db`);
    db = Database(dbPath) as unknown as DatabaseType;
    persistence = new SessionPersistence(db);
  });

  afterEach(() => {
    try {
      persistence.close();
    } catch {
      // Ignore close errors
    }
    try {
      rmSync(dbPath, { force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  // -------------------------------------------------------------------------
  // T006-01: serializeSession (via saveSession)
  // -------------------------------------------------------------------------

  describe('saveSession / loadSession', () => {
    it('T006-01: should serialize and save a session', () => {
      const session = createTestSession('s1', 'main', {
        activationMode: 'always',
        wakeWord: 'hey osai',
      });

      persistence.saveSession(session);

      // Verify row exists in DB
      const rows = db.prepare('SELECT * FROM sessions WHERE id = ?').all('s1');
      expect(rows).toHaveLength(1);
    });

    it('T006-03: should save session with correct fields', () => {
      const session = createTestSession('s2', 'group');
      session.addMessage({ role: 'user', content: 'hello', timestamp: Date.now() });

      persistence.saveSession(session);

      const rows = db.prepare('SELECT * FROM sessions WHERE id = ?').all('s2');
      expect(rows).toHaveLength(1);
      const row = rows[0] as Record<string, unknown>;
      expect(row.type).toBe('group');
      expect(row.activation_mode).toBe('always');
      expect(row.queue_mode).toBe('sequential');
      expect(row.state).toBe('idle');
    });

    it('T006-04: should load a saved session', () => {
      const session = createTestSession('s3', 'isolated');
      session.addMessage({ role: 'user', content: 'test message', timestamp: 1000 });
      session.addMessage({ role: 'assistant', content: 'test reply', timestamp: 2000 });

      persistence.saveSession(session);

      const loaded = persistence.loadSession('s3');
      expect(loaded).toBeDefined();
      expect(loaded!.id).toBe('s3');
      expect(loaded!.type).toBe('isolated');
      expect(loaded!.activationMode).toBe('always');
      expect(loaded!.history).toHaveLength(2);
      expect(loaded!.history[0]!.content).toBe('test message');
      expect(loaded!.history[1]!.content).toBe('test reply');
    });

    it('should return undefined for nonexistent session', () => {
      const loaded = persistence.loadSession('nonexistent');
      expect(loaded).toBeUndefined();
    });

    it('should update session on re-save (upsert)', () => {
      const session = createTestSession('s4', 'main');
      session.addMessage({ role: 'user', content: 'first', timestamp: 1000 });
      persistence.saveSession(session);

      // Add more messages and re-save
      session.addMessage({ role: 'assistant', content: 'second', timestamp: 2000 });
      session.addMessage({ role: 'user', content: 'third', timestamp: 3000 });
      persistence.saveSession(session);

      const loaded = persistence.loadSession('s4');
      expect(loaded).toBeDefined();
      expect(loaded!.history).toHaveLength(3);
    });

    it('should save session state', () => {
      const session = createTestSession('s5', 'main');
      session.setState('processing');
      persistence.saveSession(session);

      const loaded = persistence.loadSession('s5');
      expect(loaded!.state).toBe('processing');
    });

    it('should save session with wake_word activation mode', () => {
      const session = new Session('s6', 'main', {
        activationMode: 'wake_word',
        wakeWord: 'hey osai',
      });
      persistence.saveSession(session);

      const loaded = persistence.loadSession('s6');
      expect(loaded!.activationMode).toBe('wake_word');
      expect(loaded!.wakeWord).toBe('hey osai');
    });

    it('should save session with mention activation mode', () => {
      const session = new Session('s7', 'main', { activationMode: 'mention' });
      persistence.saveSession(session);

      const loaded = persistence.loadSession('s7');
      expect(loaded!.activationMode).toBe('mention');
    });
  });

  // -------------------------------------------------------------------------
  // T006-05: loadAllSessions
  // -------------------------------------------------------------------------

  describe('loadAllSessions', () => {
    it('T006-05: should load all saved sessions', () => {
      persistence.saveSession(createTestSession('s-all-1', 'main'));
      persistence.saveSession(createTestSession('s-all-2', 'group'));
      persistence.saveSession(createTestSession('s-all-3', 'isolated'));

      const sessions = persistence.loadAllSessions();
      expect(sessions).toHaveLength(3);

      const ids = sessions.map((s) => s.id);
      expect(ids).toContain('s-all-1');
      expect(ids).toContain('s-all-2');
      expect(ids).toContain('s-all-3');
    });

    it('should return empty array when no sessions exist', () => {
      const sessions = persistence.loadAllSessions();
      expect(sessions).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // T006-06: deleteSession
  // -------------------------------------------------------------------------

  describe('deleteSession', () => {
    it('T006-06: should delete a session and its messages', () => {
      const session = createTestSession('s-del', 'main');
      session.addMessage({ role: 'user', content: 'msg1', timestamp: 1000 });
      persistence.saveSession(session);
      persistence.saveMessage('s-del', { role: 'user', content: 'extra', timestamp: 2000 });

      expect(persistence.loadSession('s-del')).toBeDefined();

      const deleted = persistence.deleteSession('s-del');
      expect(deleted).toBe(true);
      expect(persistence.loadSession('s-del')).toBeUndefined();

      // Verify messages also deleted
      const messages = persistence.loadMessages('s-del');
      expect(messages).toHaveLength(0);
    });

    it('should return false for nonexistent session', () => {
      const deleted = persistence.deleteSession('nonexistent');
      expect(deleted).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // T006-07: WAL mode
  // -------------------------------------------------------------------------

  describe('WAL mode', () => {
    it('T006-07: should have WAL mode enabled', () => {
      const result = db.pragma('journal_mode') as { journal_mode: string }[];
      expect(result[0]!.journal_mode).toBe('wal');
    });
  });

  // -------------------------------------------------------------------------
  // saveMessage / loadMessages
  // -------------------------------------------------------------------------

  describe('saveMessage / loadMessages', () => {
    it('should save and load a message', () => {
      persistence.saveSession(createTestSession('s-msg', 'main'));
      persistence.saveMessage('s-msg', {
        role: 'user',
        content: 'hello world',
        timestamp: 1000,
      });

      const messages = persistence.loadMessages('s-msg');
      expect(messages).toHaveLength(1);
      expect(messages[0]!.role).toBe('user');
      expect(messages[0]!.content).toBe('hello world');
      expect(messages[0]!.timestamp).toBe(1000);
    });

    it('should save messages with metadata', () => {
      persistence.saveSession(createTestSession('s-meta', 'main'));
      persistence.saveMessage('s-meta', {
        role: 'tool',
        content: 'output',
        timestamp: 1000,
        metadata: { toolName: 'shell', exitCode: 0 },
      });

      const messages = persistence.loadMessages('s-meta');
      expect(messages[0]!.metadata).toEqual({ toolName: 'shell', exitCode: 0 });
    });

    it('should load messages ordered by timestamp', () => {
      persistence.saveSession(createTestSession('s-order', 'main'));
      persistence.saveMessage('s-order', { role: 'user', content: 'first', timestamp: 3000 });
      persistence.saveMessage('s-order', { role: 'assistant', content: 'second', timestamp: 1000 });
      persistence.saveMessage('s-order', { role: 'user', content: 'third', timestamp: 2000 });

      const messages = persistence.loadMessages('s-order');
      expect(messages).toHaveLength(3);
      expect(messages[0]!.content).toBe('second'); // timestamp 1000
      expect(messages[1]!.content).toBe('third');  // timestamp 2000
      expect(messages[2]!.content).toBe('first');  // timestamp 3000
    });

    it('should return empty array for session with no messages', () => {
      persistence.saveSession(createTestSession('s-no-msg', 'main'));
      const messages = persistence.loadMessages('s-no-msg');
      expect(messages).toHaveLength(0);
    });
  });
});
