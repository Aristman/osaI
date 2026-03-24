/**
 * Unit tests for SessionRouter
 *
 * Tests cover: session creation, retrieval, removal, listing,
 * activation modes, queue modes, state transitions, message history.
 *
 * Test IDs: T004-01 through T004-11
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { SessionRouter, Session } from '../../src/session/router.js';

describe('SessionRouter', () => {
  let router: SessionRouter;

  beforeEach(() => {
    router = new SessionRouter();
  });

  // -------------------------------------------------------------------------
  // T004-01: createSession main
  // -------------------------------------------------------------------------

  describe('createSession', () => {
    it('T004-01: should create a main session with type=main', () => {
      const session = router.createSession('main');
      expect(session).toBeDefined();
      expect(session.id).toBeDefined();
      expect(session.type).toBe('main');
      expect(session.state).toBe('idle');
      expect(session.history).toHaveLength(0);
    });

    it('T004-02: should create a group session', () => {
      const session = router.createSession('group');
      expect(session).toBeDefined();
      expect(session.type).toBe('group');
    });

    it('T004-03: should create an isolated session', () => {
      const session = router.createSession('isolated');
      expect(session).toBeDefined();
      expect(session.type).toBe('isolated');
    });

    it('should create session with custom id', () => {
      const session = router.createSession('group', 'my-custom-id');
      expect(session.id).toBe('my-custom-id');
    });

    it('should reject duplicate custom id', () => {
      router.createSession('group', 'custom-id');
      expect(() => router.createSession('group', 'custom-id')).toThrow('already exists');
    });

    it('should reject creating a second main session', () => {
      router.createSession('main');
      expect(() => router.createSession('main')).toThrow('A main session already exists');
    });

    it('should allow multiple group sessions', () => {
      const s1 = router.createSession('group', 'grp-1');
      const s2 = router.createSession('group', 'grp-2');
      expect(s1.id).toBe('grp-1');
      expect(s2.id).toBe('grp-2');
      expect(router.sessionCount).toBe(2);
    });

    it('should allow multiple isolated sessions', () => {
      router.createSession('isolated', 'iso-1');
      router.createSession('isolated', 'iso-2');
      expect(router.sessionCount).toBe(2);
    });
  });

  // -------------------------------------------------------------------------
  // T004-04: getSession returns session
  // T004-05: getSession unknown returns undefined
  // -------------------------------------------------------------------------

  describe('getSession', () => {
    it('T004-04: should return session by id', () => {
      const created = router.createSession('main', 'main-1');
      const fetched = router.getSession('main-1');
      expect(fetched).toBeDefined();
      expect(fetched!.id).toBe(created.id);
    });

    it('T004-05: should return undefined for unknown id', () => {
      const result = router.getSession('nonexistent');
      expect(result).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // T004-06: deleteSession removes session
  // -------------------------------------------------------------------------

  describe('removeSession', () => {
    it('T004-06: should remove an existing session', () => {
      router.createSession('group', 'grp-1');
      expect(router.getSession('grp-1')).toBeDefined();

      const removed = router.removeSession('grp-1');
      expect(removed).toBe(true);
      expect(router.getSession('grp-1')).toBeUndefined();
    });

    it('should return false for nonexistent session', () => {
      const removed = router.removeSession('nonexistent');
      expect(removed).toBe(false);
    });

    it('should allow creating a new main session after removing the old one', () => {
      router.createSession('main', 'main-1');
      router.removeSession('main-1');
      expect(router.sessionCount).toBe(0);

      // Should succeed -- no main session exists now
      const newMain = router.createSession('main', 'main-2');
      expect(newMain.id).toBe('main-2');
      expect(router.sessionCount).toBe(1);
    });
  });

  // -------------------------------------------------------------------------
  // listSessions / getSessionsByType
  // -------------------------------------------------------------------------

  describe('listSessions', () => {
    it('should return all sessions', () => {
      router.createSession('main', 'main-1');
      router.createSession('group', 'grp-1');
      router.createSession('isolated', 'iso-1');

      const sessions = router.listSessions();
      expect(sessions).toHaveLength(3);
    });

    it('should return empty array when no sessions exist', () => {
      const sessions = router.listSessions();
      expect(sessions).toHaveLength(0);
    });
  });

  describe('getSessionsByType', () => {
    it('should filter sessions by type', () => {
      router.createSession('main', 'main-1');
      router.createSession('group', 'grp-1');
      router.createSession('group', 'grp-2');

      const groups = router.getSessionsByType('group');
      expect(groups).toHaveLength(2);

      const mains = router.getSessionsByType('main');
      expect(mains).toHaveLength(1);
    });
  });

  describe('getMainSession', () => {
    it('should return the main session', () => {
      router.createSession('main', 'main-1');
      const main = router.getMainSession();
      expect(main).toBeDefined();
      expect(main!.id).toBe('main-1');
    });

    it('should return undefined when no main session exists', () => {
      const main = router.getMainSession();
      expect(main).toBeUndefined();
    });
  });
});

// ---------------------------------------------------------------------------
// Session class tests
// ---------------------------------------------------------------------------

describe('Session', () => {
  let session: Session;

  beforeEach(() => {
    session = new Session('test-session', 'main');
  });

  // -------------------------------------------------------------------------
  // T004-07: Activation mode 'always'
  // -------------------------------------------------------------------------

  describe('shouldProcess (activation modes)', () => {
    it('T004-07: should process all messages in always mode', () => {
      const alwaysSession = new Session('s-always', 'main', { activationMode: 'always' });
      expect(alwaysSession.shouldProcess('hello')).toBe(true);
      expect(alwaysSession.shouldProcess('@mention test')).toBe(true);
      expect(alwaysSession.shouldProcess('')).toBe(true);
    });

    it('T004-08: should filter messages in mention mode', () => {
      const mentionSession = new Session('s-mention', 'main', { activationMode: 'mention' });
      expect(mentionSession.shouldProcess('hello world')).toBe(false);
      expect(mentionSession.shouldProcess('@osai help me')).toBe(true);
      expect(mentionSession.shouldProcess('check @bot status')).toBe(true);
    });

    it('should reject all messages in passive mode', () => {
      const passiveSession = new Session('s-passive', 'main', { activationMode: 'passive' });
      expect(passiveSession.shouldProcess('hello')).toBe(false);
      expect(passiveSession.shouldProcess('@osai help')).toBe(false);
    });

    it('should filter by wake word in wake_word mode', () => {
      const wakeSession = new Session('s-wake', 'main', {
        activationMode: 'wake_word',
        wakeWord: 'hey osai',
      });
      expect(wakeSession.shouldProcess('hello world')).toBe(false);
      expect(wakeSession.shouldProcess('Hey Osai, what is the weather?')).toBe(true);
      expect(wakeSession.shouldProcess('HEY OSAI status')).toBe(true);
    });

    it('should return false in wake_word mode when no wake word is set', () => {
      const noWakeSession = new Session('s-nowake', 'main', {
        activationMode: 'wake_word',
      });
      expect(noWakeSession.shouldProcess('anything')).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Message history
  // -------------------------------------------------------------------------

  describe('addMessage', () => {
    it('should add a message to history', () => {
      session.addMessage({ role: 'user', content: 'hello', timestamp: Date.now() });
      expect(session.history).toHaveLength(1);
      expect(session.history[0]!.role).toBe('user');
      expect(session.history[0]!.content).toBe('hello');
    });

    it('should evict oldest messages when exceeding maxHistory', () => {
      const limitedSession = new Session('s-limited', 'main', { maxHistory: 3 });

      limitedSession.addMessage({ role: 'user', content: 'msg1', timestamp: 1 });
      limitedSession.addMessage({ role: 'assistant', content: 'msg2', timestamp: 2 });
      limitedSession.addMessage({ role: 'user', content: 'msg3', timestamp: 3 });
      expect(limitedSession.history).toHaveLength(3);

      // Adding a 4th message should evict the oldest
      limitedSession.addMessage({ role: 'user', content: 'msg4', timestamp: 4 });
      expect(limitedSession.history).toHaveLength(3);
      expect(limitedSession.history[0]!.content).toBe('msg2');
    });

    it('should support messages with metadata', () => {
      session.addMessage({
        role: 'tool',
        content: 'result',
        timestamp: Date.now(),
        metadata: { toolName: 'shell', exitCode: 0 },
      });
      expect(session.history[0]!.metadata).toEqual({ toolName: 'shell', exitCode: 0 });
    });
  });

  describe('clearHistory', () => {
    it('should clear all messages', () => {
      session.addMessage({ role: 'user', content: 'msg1', timestamp: 1 });
      session.addMessage({ role: 'assistant', content: 'msg2', timestamp: 2 });
      expect(session.history).toHaveLength(2);

      session.clearHistory();
      expect(session.history).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // T004-11: State transitions
  // -------------------------------------------------------------------------

  describe('setState (state machine)', () => {
    it('T004-11: should transition idle -> processing -> idle', () => {
      expect(session.state).toBe('idle');
      session.setState('processing');
      expect(session.state).toBe('processing');
      session.setState('idle');
      expect(session.state).toBe('idle');
    });

    it('should transition idle -> processing -> waiting_permission -> idle', () => {
      session.setState('processing');
      session.setState('waiting_permission');
      session.setState('idle');
      expect(session.state).toBe('idle');
    });

    it('should transition any state to error', () => {
      session.setState('processing');
      session.setState('error');
      expect(session.state).toBe('error');
    });

    it('should reject invalid transition idle -> waiting_permission', () => {
      expect(() => session.setState('waiting_permission')).toThrow('Invalid state transition');
    });

    it('should be a no-op when transitioning to the same state', () => {
      session.setState('idle');
      expect(session.state).toBe('idle');
    });

    it('should update updatedAt on state change', () => {
      const before = session.updatedAt;
      // Small delay to ensure timestamp difference
      session.setState('processing');
      expect(session.updatedAt).toBeGreaterThanOrEqual(before);
    });
  });

  // -------------------------------------------------------------------------
  // toJSON serialization
  // -------------------------------------------------------------------------

  describe('toJSON', () => {
    it('should serialize session data', () => {
      session.addMessage({ role: 'user', content: 'hello', timestamp: 1000 });
      session.setState('processing');

      const data = session.toJSON();
      expect(data.id).toBe('test-session');
      expect(data.type).toBe('main');
      expect(data.state).toBe('processing');
      expect(data.history).toHaveLength(1);
      expect(data.history[0]!.content).toBe('hello');
    });
  });
});

// ---------------------------------------------------------------------------
// restoreSession
// ---------------------------------------------------------------------------

describe('SessionRouter.restoreSession', () => {
  let router: SessionRouter;

  beforeEach(() => {
    router = new SessionRouter();
  });

  it('should restore a session from data', () => {
    const data = {
      id: 'restored-1',
      type: 'main' as const,
      activationMode: 'always' as const,
      queueMode: 'sequential' as const,
      state: 'idle' as const,
      wakeWord: undefined,
      maxHistory: 1000,
      createdAt: Date.now() - 1000,
      updatedAt: Date.now(),
      history: [
        { role: 'user' as const, content: 'hello', timestamp: Date.now() - 500 },
      ],
    };

    const session = router.restoreSession(data);
    expect(session.id).toBe('restored-1');
    expect(session.type).toBe('main');
    expect(session.history).toHaveLength(1);
    expect(router.getMainSession()?.id).toBe('restored-1');
  });

  it('should reject restoring a session with duplicate id', () => {
    const data = {
      id: 'dup-1',
      type: 'group' as const,
      activationMode: 'always' as const,
      queueMode: 'sequential' as const,
      state: 'idle' as const,
      wakeWord: undefined,
      maxHistory: 1000,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      history: [],
    };

    router.restoreSession(data);
    expect(() => router.restoreSession(data)).toThrow('already exists');
  });
});
