/**
 * Session Manager -- manages CLI-side session state
 *
 * Tracks active session, message history, and integrates with GatewayClient.
 */

import type { WsOutboundMessage, BlockStreamMessage } from '@osai/types';
import type { GatewayClient } from './gateway-client.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SessionInfo {
  sessionId: string;
  model?: string;
  tokenUsageInput?: number;
  tokenUsageOutput?: number;
  state: string;
}

export interface SessionManagerOptions {
  client: GatewayClient;
  defaultSessionId?: string;
}

// ---------------------------------------------------------------------------
// SessionManager
// ---------------------------------------------------------------------------

export class SessionManager {
  private client: GatewayClient;
  private activeSessionId: string;
  private sessions = new Map<string, SessionInfo>();
  private messageHistory: Array<{ role: 'user' | 'assistant'; content: string }> = [];
  private unsubscribers: Array<() => void> = [];

  constructor(options: SessionManagerOptions) {
    this.client = options.client;
    this.activeSessionId = options.defaultSessionId ?? crypto.randomUUID();
    this.sessions.set(this.activeSessionId, {
      sessionId: this.activeSessionId,
      state: 'active',
    });
  }

  getActiveSessionId(): string {
    return this.activeSessionId;
  }

  getActiveSession(): SessionInfo | undefined {
    return this.sessions.get(this.activeSessionId);
  }

  getAllSessions(): SessionInfo[] {
    return Array.from(this.sessions.values());
  }

  getSession(id: string): SessionInfo | undefined {
    return this.sessions.get(id);
  }

  createSession(_type?: string): SessionInfo {
    const id = crypto.randomUUID();
    const info: SessionInfo = {
      sessionId: id,
      state: 'active',
    };
    this.sessions.set(id, info);
    return info;
  }

  switchSession(id: string): boolean {
    const info = this.sessions.get(id);
    if (!info) return false;
    this.activeSessionId = id;
    return true;
  }

  deleteSession(id: string): boolean {
    if (id === this.activeSessionId) return false;
    return this.sessions.delete(id);
  }

  addMessage(role: 'user' | 'assistant', content: string): void {
    this.messageHistory.push({ role, content });
  }

  getMessageHistory(): Array<{ role: 'user' | 'assistant'; content: string }> {
    return [...this.messageHistory];
  }

  clearHistory(): void {
    this.messageHistory = [];
  }

  // ---------------------------------------------------------------------------
  // Integration with GatewayClient
  // ---------------------------------------------------------------------------

  startListening(): void {
    const unsub1 = this.client.onMessage((msg: WsOutboundMessage) => {
      this.handleGatewayMessage(msg);
    });
    this.unsubscribers.push(unsub1);
  }

  stopListening(): void {
    for (const unsub of this.unsubscribers) {
      unsub();
    }
    this.unsubscribers = [];
  }

  private handleGatewayMessage(msg: WsOutboundMessage): void {
    switch (msg.type) {
      case 'block': {
        const blockMsg = msg as BlockStreamMessage;
        this.addMessage('assistant', blockMsg.content);
        break;
      }
      case 'status': {
        const session = this.sessions.get(msg.session_id);
        if (session) {
          session.state = msg.state;
        }
        break;
      }
      case 'event': {
        if (msg.event === 'session_created' && msg.data.sessionId) {
          const id = String(msg.data.sessionId);
          if (!this.sessions.has(id)) {
            this.sessions.set(id, {
              sessionId: id,
              state: 'active',
            });
          }
        }
        break;
      }
    }
  }
}
