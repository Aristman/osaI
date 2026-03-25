/**
 * Sessions store for session list and active session management.
 */
import { writable, derived } from 'svelte/store';
import type { Session } from '../types';

export interface SessionsState {
  sessions: Session[];
  activeSessionId: string | null;
}

const initialState: SessionsState = {
  sessions: [],
  activeSessionId: null
};

function createSessionsStore() {
  const { subscribe, set, update } = writable<SessionsState>({ ...initialState });

  return {
    subscribe,
    set,

    setSessions(sessions: Session[]): void {
      update((s) => ({ ...s, sessions }));
    },

    setActiveSession(sessionId: string | null): void {
      update((s) => ({ ...s, activeSessionId: sessionId }));
    },

    addSession(session: Session): void {
      update((s) => {
        const exists = s.sessions.some((existing) => existing.id === session.id);
        if (exists) return s;
        return { ...s, sessions: [...s.sessions, session] };
      });
    },

    updateSession(sessionId: string, updates: Partial<Session>): void {
      update((s) => ({
        ...s,
        sessions: s.sessions.map((session) =>
          session.id === sessionId ? { ...session, ...updates, updatedAt: new Date().toISOString() } : session
        )
      }));
    },

    removeSession(sessionId: string): void {
      update((s) => ({
        ...s,
        sessions: s.sessions.filter((session) => session.id !== sessionId),
        activeSessionId: s.activeSessionId === sessionId ? null : s.activeSessionId
      }));
    },

    reset(): void {
      set({ ...initialState });
    }
  };
}

export const sessionsStore = createSessionsStore();

export const activeSession = derived(sessionsStore, ($sessions) => {
  if (!$sessions.activeSessionId) return null;
  return $sessions.sessions.find((s) => s.id === $sessions.activeSessionId) ?? null;
});

// Standalone action helpers
export const setSessions = (sessions: Session[]) => sessionsStore.setSessions(sessions);
export const setActiveSession = (sessionId: string | null) => sessionsStore.setActiveSession(sessionId);
export const addSession = (session: Session) => sessionsStore.addSession(session);
export const updateSession = (sessionId: string, updates: Partial<Session>) => sessionsStore.updateSession(sessionId, updates);
export const removeSession = (sessionId: string) => sessionsStore.removeSession(sessionId);
export const resetSessionsStore = () => sessionsStore.reset();
