/**
 * SessionRouter -- In-memory session management for osaI Gateway
 *
 * Manages sessions (main, group, isolated) with activation modes,
 * queue modes, state transitions, and message history tracking.
 */

import type { SessionType, ActivationMode } from '@osai/types';

// ---------------------------------------------------------------------------
// Additional domain types not yet in @osai/types
// ---------------------------------------------------------------------------

/** How messages are queued for processing within a session */
export type QueueMode = 'sequential' | 'parallel';

/** Session lifecycle states */
export type SessionState = 'idle' | 'processing' | 'waiting_permission' | 'error';

// ---------------------------------------------------------------------------
// Session Message
// ---------------------------------------------------------------------------

/** A single message stored in session history */
export interface SessionMessage {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Session Options
// ---------------------------------------------------------------------------

/** Options for creating a new session */
export interface SessionOptions {
  activationMode?: ActivationMode;
  queueMode?: QueueMode;
  maxHistory?: number;
  wakeWord?: string;
}

// ---------------------------------------------------------------------------
// Session
// ---------------------------------------------------------------------------

/** Represents a single session with its state and message history */
export class Session {
  readonly id: string;
  readonly type: SessionType;
  readonly activationMode: ActivationMode;
  readonly queueMode: QueueMode;
  readonly createdAt: number;
  updatedAt: number;

  private _state: SessionState = 'idle';
  private _history: SessionMessage[] = [];
  private readonly _maxHistory: number;
  private readonly _wakeWord: string | undefined;

  constructor(
    id: string,
    type: SessionType,
    options: SessionOptions = {},
    createdAt?: number,
  ) {
    this.id = id;
    this.type = type;
    this.activationMode = options.activationMode ?? 'always';
    this.queueMode = options.queueMode ?? 'sequential';
    this._maxHistory = options.maxHistory ?? 1000;
    this._wakeWord = options.wakeWord;
    this.createdAt = createdAt ?? Date.now();
    this.updatedAt = this.createdAt;
  }

  /** Current session state */
  get state(): SessionState {
    return this._state;
  }

  /** Message history (read-only copy) */
  get history(): readonly SessionMessage[] {
    return this._history;
  }

  /** Wake word for 'wake_word' activation mode */
  get wakeWord(): string | undefined {
    return this._wakeWord;
  }

  /**
   * Check whether a message should be processed based on activation mode.
   * Returns true if the message passes the activation filter.
   */
  shouldProcess(content: string): boolean {
    switch (this.activationMode) {
      case 'always':
        return true;
      case 'passive':
        return false;
      case 'mention':
        return /@\w+/.test(content);
      case 'wake_word':
        if (!this._wakeWord) return false;
        return content.toLowerCase().includes(this._wakeWord.toLowerCase());
    }
  }

  /**
   * Add a message to session history.
   * Evicts oldest messages when history exceeds maxHistory.
   */
  addMessage(message: SessionMessage): void {
    this._history.push(message);
    this.updatedAt = Date.now();

    if (this._history.length > this._maxHistory) {
      this._history = this._history.slice(this._history.length - this._maxHistory);
    }
  }

  /** Transition session state. Validates allowed transitions. No-op if state is already the target. */
  setState(newState: SessionState): void {
    if (this._state === newState) return;

    const allowedTransitions: Record<SessionState, SessionState[]> = {
      idle: ['processing', 'error'],
      processing: ['idle', 'waiting_permission', 'error'],
      waiting_permission: ['idle', 'processing', 'error'],
      error: ['idle', 'processing'],
    };

    const allowed = allowedTransitions[this._state];
    if (!allowed.includes(newState)) {
      throw new Error(
        `Invalid state transition: ${this._state} -> ${newState}. ` +
        `Allowed: ${allowed.join(', ')}`,
      );
    }

    this._state = newState;
    this.updatedAt = Date.now();
  }

  /** Clear all message history */
  clearHistory(): void {
    this._history = [];
    this.updatedAt = Date.now();
  }

  /** Serialize session to a plain object for persistence */
  toJSON(): SessionData {
    return {
      id: this.id,
      type: this.type,
      activationMode: this.activationMode,
      queueMode: this.queueMode,
      state: this._state,
      wakeWord: this._wakeWord,
      maxHistory: this._maxHistory,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      history: this._history,
    };
  }
}

// ---------------------------------------------------------------------------
// Session Data (serializable)
// ---------------------------------------------------------------------------

/** Serializable representation of a Session for persistence */
export interface SessionData {
  id: string;
  type: SessionType;
  activationMode: ActivationMode;
  queueMode: QueueMode;
  state: SessionState;
  wakeWord?: string;
  maxHistory: number;
  createdAt: number;
  updatedAt: number;
  history: SessionMessage[];
}

// ---------------------------------------------------------------------------
// SessionRouter
// ---------------------------------------------------------------------------

/**
 * SessionRouter manages all sessions for the gateway.
 *
 * Responsibilities:
 * - Create / get / remove / list sessions
 * - Enforce session type constraints (only one 'main' session)
 * - Route messages to sessions based on activation mode
 */
export class SessionRouter {
  private sessions: Map<string, Session> = new Map();
  private mainSessionId: string | null = null;

  /**
   * Create a new session.
   * For type='main', only one main session is allowed at a time.
   */
  createSession(
    type: SessionType,
    id?: string,
    options: SessionOptions = {},
  ): Session {
    if (type === 'main' && this.mainSessionId !== null) {
      throw new Error('A main session already exists. Only one main session is allowed.');
    }

    const sessionId = id ?? this.generateSessionId(type);
    if (this.sessions.has(sessionId)) {
      throw new Error(`Session with id '${sessionId}' already exists.`);
    }

    const session = new Session(sessionId, type, options);
    this.sessions.set(sessionId, session);

    if (type === 'main') {
      this.mainSessionId = sessionId;
    }

    return session;
  }

  /**
   * Restore a session from persisted data.
   * Used during session resume after restart.
   */
  restoreSession(data: SessionData): Session {
    if (this.sessions.has(data.id)) {
      throw new Error(`Session with id '${data.id}' already exists.`);
    }

    const session = new Session(data.id, data.type, {
      activationMode: data.activationMode,
      queueMode: data.queueMode,
      maxHistory: data.maxHistory,
      wakeWord: data.wakeWord,
    }, data.createdAt);

    // Restore state (no-op if state is already 'idle', which is the default)
    session.setState(data.state);
    for (const msg of data.history) {
      session.addMessage(msg);
    }

    this.sessions.set(data.id, session);
    if (data.type === 'main') {
      this.mainSessionId = data.id;
    }

    return session;
  }

  /** Get a session by ID, or undefined if not found. */
  getSession(id: string): Session | undefined {
    return this.sessions.get(id);
  }

  /** Remove a session by ID. Returns true if the session existed. */
  removeSession(id: string): boolean {
    const session = this.sessions.get(id);
    if (!session) return false;

    if (session.type === 'main') {
      this.mainSessionId = null;
    }

    this.sessions.delete(id);
    return true;
  }

  /** List all sessions. Returns a read-only copy. */
  listSessions(): readonly Session[] {
    return Array.from(this.sessions.values());
  }

  /** Get the main session, if one exists. */
  getMainSession(): Session | undefined {
    if (this.mainSessionId === null) return undefined;
    return this.sessions.get(this.mainSessionId);
  }

  /** Get all sessions of a specific type. */
  getSessionsByType(type: SessionType): readonly Session[] {
    return this.listSessions().filter((s) => s.type === type);
  }

  /** Get the total number of sessions. */
  get sessionCount(): number {
    return this.sessions.size;
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private generateSessionId(type: SessionType): string {
    const prefix = type === 'main' ? 'main' : type === 'group' ? 'grp' : 'iso';
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  }
}
