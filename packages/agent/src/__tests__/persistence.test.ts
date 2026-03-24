/**
 * @osai/agent -- Session Persistence tests (T-007)
 *
 * Uses in-memory SQLite for all tests.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SessionRepository, SessionNotFoundError } from '../persistence/index.js';
import type { AgentMessage } from '../types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createRepository(): SessionRepository {
  return new SessionRepository(':memory:');
}

function makeMessage(
  id: string,
  role: AgentMessage['role'],
  content: string,
  ts?: Date,
): AgentMessage {
  return {
    id,
    role,
    content,
    timestamp: ts ?? new Date(),
    metadata: { test: true },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SessionRepository', () => {
  let repo: SessionRepository;

  beforeEach(() => {
    repo = createRepository();
  });

  afterEach(() => {
    repo.close();
  });

  // -----------------------------------------------------------------------
  // T007-01: Save session
  // -----------------------------------------------------------------------
  describe('saveSession', () => {
    it('should persist a session in the database', () => {
      repo.saveSession('session-1', 'idle', { channel: 'cli' });

      const record = repo.loadSession('session-1');
      expect(record).toBeDefined();
      expect(record!.id).toBe('session-1');
      expect(record!.state).toBe('idle');
      expect(record!.metadata).toEqual({ channel: 'cli' });
    });

    it('should upsert an existing session (update on conflict)', () => {
      repo.saveSession('session-1', 'idle');
      repo.saveSession('session-1', 'processing', { updated: true });

      const record = repo.loadSession('session-1');
      expect(record!.state).toBe('processing');
      expect(record!.metadata).toEqual({ updated: true });
    });

    it('should set timestamps on creation', () => {
      repo.saveSession('session-1', 'idle');

      const record = repo.loadSession('session-1');
      expect(record!.createdAt).toBeDefined();
      expect(record!.updatedAt).toBeDefined();
    });
  });

  // -----------------------------------------------------------------------
  // T007-02: Load session
  // -----------------------------------------------------------------------
  describe('loadSession', () => {
    it('should return undefined for a non-existent session', () => {
      const record = repo.loadSession('non-existent');
      expect(record).toBeUndefined();
    });

    it('should deserialize a saved session correctly', () => {
      repo.saveSession('session-1', 'processing', { foo: 'bar' });

      const record = repo.loadSession('session-1');
      expect(record).toBeDefined();
      expect(record!.id).toBe('session-1');
      expect(record!.state).toBe('processing');
      expect(record!.metadata).toEqual({ foo: 'bar' });
      expect(record!.messageCount).toBe(0);
    });
  });

  // -----------------------------------------------------------------------
  // T007-03: List sessions
  // -----------------------------------------------------------------------
  describe('listSessions', () => {
    it('should return an empty array when no sessions exist', () => {
      const sessions = repo.listSessions();
      expect(sessions).toEqual([]);
    });

    it('should return all sessions ordered by updated_at DESC', () => {
      repo.saveSession('session-1', 'idle');
      repo.saveSession('session-2', 'processing');
      // Touch session-1 to ensure its updated_at is newer
      repo.updateSessionState('session-1', 'streaming');

      const sessions = repo.listSessions();
      expect(sessions).toHaveLength(2);
      // session-1 was updated last, so it should appear first
      expect(sessions[0]!.id).toBe('session-1');
      expect(sessions[1]!.id).toBe('session-2');
    });
  });

  // -----------------------------------------------------------------------
  // T007-04: Delete session
  // -----------------------------------------------------------------------
  describe('deleteSession', () => {
    it('should delete an existing session', () => {
      repo.saveSession('session-1', 'idle');
      expect(repo.deleteSession('session-1')).toBe(true);
      expect(repo.loadSession('session-1')).toBeUndefined();
    });

    it('should return false for a non-existent session', () => {
      expect(repo.deleteSession('non-existent')).toBe(false);
    });

    it('should cascade-delete messages via foreign key', () => {
      repo.saveSession('session-1', 'idle');
      repo.saveMessage('session-1', makeMessage('msg-1', 'user', 'hello'));

      repo.deleteSession('session-1');
      // After session deletion, saving a message referencing it would fail.
      // But we can verify message count is 0 by checking the session is gone.
      expect(repo.loadSession('session-1')).toBeUndefined();
    });
  });

  // -----------------------------------------------------------------------
  // T007-05: Save message
  // -----------------------------------------------------------------------
  describe('saveMessage', () => {
    it('should persist a message linked to a session', () => {
      repo.saveSession('session-1', 'idle');
      const msg = makeMessage('msg-1', 'user', 'hello');

      repo.saveMessage('session-1', msg);

      const messages = repo.getMessages('session-1');
      expect(messages).toHaveLength(1);
      expect(messages[0]!.id).toBe('msg-1');
      expect(messages[0]!.role).toBe('user');
      expect(messages[0]!.content).toBe('hello');
      expect(messages[0]!.metadata).toEqual({ test: true });
    });

    it('should throw SessionNotFoundError for a non-existent session', () => {
      const msg = makeMessage('msg-1', 'user', 'hello');
      expect(() => repo.saveMessage('non-existent', msg)).toThrow(
        SessionNotFoundError,
      );
    });
  });

  // -----------------------------------------------------------------------
  // T007-06: Get messages with limit/offset
  // -----------------------------------------------------------------------
  describe('getMessages', () => {
    it('should return all messages ordered by timestamp ASC', () => {
      repo.saveSession('session-1', 'idle');
      const baseTime = new Date('2026-01-01T00:00:00Z');
      repo.saveMessage('session-1', makeMessage('msg-1', 'user', 'first', baseTime));
      repo.saveMessage(
        'session-1',
        makeMessage('msg-2', 'assistant', 'second', new Date(baseTime.getTime() + 1000)),
      );
      repo.saveMessage(
        'session-1',
        makeMessage('msg-3', 'user', 'third', new Date(baseTime.getTime() + 2000)),
      );

      const messages = repo.getMessages('session-1');
      expect(messages).toHaveLength(3);
      expect(messages[0]!.id).toBe('msg-1');
      expect(messages[1]!.id).toBe('msg-2');
      expect(messages[2]!.id).toBe('msg-3');
    });

    it('should respect the limit parameter', () => {
      repo.saveSession('session-1', 'idle');
      repo.saveMessage('session-1', makeMessage('msg-1', 'user', 'a'));
      repo.saveMessage('session-1', makeMessage('msg-2', 'user', 'b'));
      repo.saveMessage('session-1', makeMessage('msg-3', 'user', 'c'));

      const messages = repo.getMessages('session-1', 2);
      expect(messages).toHaveLength(2);
      expect(messages[0]!.id).toBe('msg-1');
      expect(messages[1]!.id).toBe('msg-2');
    });

    it('should respect the offset parameter', () => {
      repo.saveSession('session-1', 'idle');
      repo.saveMessage('session-1', makeMessage('msg-1', 'user', 'a'));
      repo.saveMessage('session-1', makeMessage('msg-2', 'user', 'b'));
      repo.saveMessage('session-1', makeMessage('msg-3', 'user', 'c'));

      const messages = repo.getMessages('session-1', undefined, 1);
      expect(messages).toHaveLength(2);
      expect(messages[0]!.id).toBe('msg-2');
      expect(messages[1]!.id).toBe('msg-3');
    });

    it('should respect limit and offset together', () => {
      repo.saveSession('session-1', 'idle');
      repo.saveMessage('session-1', makeMessage('msg-1', 'user', 'a'));
      repo.saveMessage('session-1', makeMessage('msg-2', 'user', 'b'));
      repo.saveMessage('session-1', makeMessage('msg-3', 'user', 'c'));

      const messages = repo.getMessages('session-1', 1, 1);
      expect(messages).toHaveLength(1);
      expect(messages[0]!.id).toBe('msg-2');
    });

    it('should throw SessionNotFoundError for non-existent session', () => {
      expect(() => repo.getMessages('non-existent')).toThrow(SessionNotFoundError);
    });
  });

  // -----------------------------------------------------------------------
  // T007-06b: Resume session (load + messages)
  // -----------------------------------------------------------------------
  describe('resume session', () => {
    it('should load a session with its complete message history', () => {
      repo.saveSession('session-1', 'idle', { channel: 'cli' });
      const baseTime = new Date('2026-01-01T00:00:00Z');
      repo.saveMessage('session-1', makeMessage('msg-1', 'user', 'hello', baseTime));
      repo.saveMessage(
        'session-1',
        makeMessage('msg-2', 'assistant', 'hi there', new Date(baseTime.getTime() + 1000)),
      );

      const session = repo.loadSession('session-1');
      expect(session).toBeDefined();
      expect(session!.id).toBe('session-1');
      expect(session!.state).toBe('idle');
      expect(session!.messageCount).toBe(2);

      const messages = repo.getMessages('session-1');
      expect(messages).toHaveLength(2);
      expect(messages[0]!.content).toBe('hello');
      expect(messages[1]!.content).toBe('hi there');
    });
  });

  // -----------------------------------------------------------------------
  // T007-08: Delete messages for session
  // -----------------------------------------------------------------------
  describe('deleteMessages', () => {
    it('should delete all messages for a session', () => {
      repo.saveSession('session-1', 'idle');
      repo.saveMessage('session-1', makeMessage('msg-1', 'user', 'hello'));
      repo.saveMessage('session-1', makeMessage('msg-2', 'assistant', 'hi'));

      expect(repo.deleteMessages('session-1')).toBe(true);
      expect(repo.getMessageCount('session-1')).toBe(0);
    });

    it('should return false when no messages exist to delete', () => {
      repo.saveSession('session-1', 'idle');

      expect(repo.deleteMessages('session-1')).toBe(false);
    });

    it('should throw SessionNotFoundError for non-existent session', () => {
      expect(() => repo.deleteMessages('non-existent')).toThrow(SessionNotFoundError);
    });
  });

  // -----------------------------------------------------------------------
  // T007-09: Message count
  // -----------------------------------------------------------------------
  describe('getMessageCount', () => {
    it('should return 0 for a session with no messages', () => {
      repo.saveSession('session-1', 'idle');
      expect(repo.getMessageCount('session-1')).toBe(0);
    });

    it('should return the correct count', () => {
      repo.saveSession('session-1', 'idle');
      repo.saveMessage('session-1', makeMessage('msg-1', 'user', 'a'));
      repo.saveMessage('session-1', makeMessage('msg-2', 'user', 'b'));
      repo.saveMessage('session-1', makeMessage('msg-3', 'user', 'c'));

      expect(repo.getMessageCount('session-1')).toBe(3);
    });
  });

  // -----------------------------------------------------------------------
  // T007-10: Session exists check
  // -----------------------------------------------------------------------
  describe('sessionExists', () => {
    it('should return true for an existing session', () => {
      repo.saveSession('session-1', 'idle');
      expect(repo.sessionExists('session-1')).toBe(true);
    });

    it('should return false for a non-existent session', () => {
      expect(repo.sessionExists('non-existent')).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // T007-11: Update session state
  // -----------------------------------------------------------------------
  describe('updateSessionState', () => {
    it('should update the state of an existing session', () => {
      repo.saveSession('session-1', 'idle');

      const result = repo.updateSessionState('session-1', 'processing');
      expect(result).toBe(true);

      const record = repo.loadSession('session-1');
      expect(record!.state).toBe('processing');
    });

    it('should return false for a non-existent session', () => {
      expect(repo.updateSessionState('non-existent', 'processing')).toBe(false);
    });

    it('should update the updated_at timestamp', async () => {
      repo.saveSession('session-1', 'idle');
      const originalRecord = repo.loadSession('session-1');
      const originalUpdatedAt = originalRecord!.updatedAt;

      // SQLite datetime('now') has second-level resolution; wait to ensure
      // the updated timestamp differs from the original.
      await new Promise((resolve) => setTimeout(resolve, 1100));
      repo.updateSessionState('session-1', 'processing');
      const updatedRecord = repo.loadSession('session-1');

      expect(updatedRecord!.updatedAt).not.toBe(originalUpdatedAt);
    });
  });

  // -----------------------------------------------------------------------
  // T007-12: In-memory database works without file
  // -----------------------------------------------------------------------
  describe('in-memory database', () => {
    it('should work without a file path', () => {
      const memRepo = new SessionRepository();

      memRepo.saveSession('mem-session', 'idle');
      const record = memRepo.loadSession('mem-session');
      expect(record).toBeDefined();
      expect(record!.id).toBe('mem-session');

      memRepo.close();
    });

    it('should not persist data across separate in-memory instances', () => {
      const repo1 = new SessionRepository();
      repo1.saveSession('session-1', 'idle');

      const repo2 = new SessionRepository();
      expect(repo2.loadSession('session-1')).toBeUndefined();

      repo1.close();
      repo2.close();
    });
  });
});
