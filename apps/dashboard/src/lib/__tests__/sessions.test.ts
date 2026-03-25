/**
 * Tests for sessions store.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import type { Session } from '../types';

const mockSession: Session = {
  id: 's1',
  label: 'Test Session',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  messageCount: 0,
  channel: 'dashboard',
  status: 'active'
};

describe('sessionsStore', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('initial state has empty sessions array and no active session', async () => {
    const { sessionsStore } = await import('../stores/sessions');
    const state = get(sessionsStore);
    expect(state.sessions).toEqual([]);
    expect(state.activeSessionId).toBeNull();
  });

  it('can set sessions list', async () => {
    const { sessionsStore, setSessions } = await import('../stores/sessions');
    setSessions([mockSession]);
    const state = get(sessionsStore);
    expect(state.sessions).toHaveLength(1);
    expect(state.sessions[0]!.id).toBe('s1');
  });

  it('can set active session', async () => {
    const { sessionsStore, setSessions, setActiveSession } = await import('../stores/sessions');
    setSessions([mockSession]);
    setActiveSession('s1');
    expect(get(sessionsStore).activeSessionId).toBe('s1');
  });

  it('returns active session from derived store', async () => {
    const { activeSession, setSessions, setActiveSession } = await import('../stores/sessions');
    setSessions([mockSession]);
    setActiveSession('s1');
    const session = get(activeSession);
    expect(session).not.toBeNull();
    expect(session!.id).toBe('s1');
  });

  it('activeSession is null when no active session set', async () => {
    const { activeSession } = await import('../stores/sessions');
    expect(get(activeSession)).toBeNull();
  });

  it('can add a session', async () => {
    const { sessionsStore, addSession } = await import('../stores/sessions');
    addSession(mockSession);
    expect(get(sessionsStore).sessions).toHaveLength(1);
  });

  it('can update a session', async () => {
    const { sessionsStore, addSession, updateSession } = await import('../stores/sessions');
    addSession(mockSession);
    updateSession('s1', { messageCount: 5, label: 'Updated' });
    const session = get(sessionsStore).sessions[0];
    expect(session!.messageCount).toBe(5);
    expect(session!.label).toBe('Updated');
  });

  it('can remove a session', async () => {
    const { sessionsStore, addSession, removeSession, setActiveSession } = await import('../stores/sessions');
    addSession(mockSession);
    setActiveSession('s1');
    removeSession('s1');
    expect(get(sessionsStore).sessions).toHaveLength(0);
    expect(get(sessionsStore).activeSessionId).toBeNull();
  });

  it('can reset store', async () => {
    const { sessionsStore, addSession, setActiveSession, resetSessionsStore } = await import('../stores/sessions');
    addSession(mockSession);
    setActiveSession('s1');
    resetSessionsStore();
    const state = get(sessionsStore);
    expect(state.sessions).toEqual([]);
    expect(state.activeSessionId).toBeNull();
  });
});
