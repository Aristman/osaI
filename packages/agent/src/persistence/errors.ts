/**
 * @osai/agent -- Session persistence error classes
 */

export class SessionNotFoundError extends Error {
  public readonly sessionId: string;

  constructor(sessionId: string) {
    super(`Session '${sessionId}' not found`);
    this.name = 'SessionNotFoundError';
    this.sessionId = sessionId;
  }
}
