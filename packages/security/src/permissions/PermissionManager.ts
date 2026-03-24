/**
 * @osai/security -- PermissionManager
 *
 * In-memory permission manager with category-based rules,
 * manual approval callbacks, and permission history tracking.
 */

import type {
  PermissionCategory,
  PermissionDecision,
  PermissionManagerConfig,
  PermissionRequest,
  PermissionResponse,
} from './types.js';

interface HistoryEntry {
  request: PermissionRequest;
  response: PermissionResponse;
}

let idCounter = 0;

function generateId(prefix: string): string {
  return `${prefix}-${++idCounter}-${Date.now()}`;
}

export class PermissionManager {
  private readonly autoApprove: Set<PermissionCategory>;
  private readonly requireConfirm: Set<PermissionCategory>;
  private readonly pendingRequests: Map<
    string,
    { request: PermissionRequest; resolve: (decision: PermissionDecision) => void }
  > = new Map();
  private readonly history: HistoryEntry[] = [];
  private permissionCallback:
    | ((request: PermissionRequest) => Promise<PermissionDecision>)
    | null = null;

  constructor(config?: PermissionManagerConfig) {
    this.autoApprove = new Set(config?.autoApprove ?? ['read', 'system']);
    this.requireConfirm = new Set(config?.requireConfirm ?? ['write', 'execute']);
  }

  /**
   * Check a permission request against configured rules.
   *
   * - If category is in autoApprove and riskLevel is not 'critical': approved immediately.
   * - If riskLevel is 'critical': always requires confirmation (pending).
   * - If category is in requireConfirm: pending (awaits manual approval).
   * - Otherwise: denied.
   */
  check(request: PermissionRequest): PermissionResponse {
    // Critical risk always requires confirmation
    if (request.riskLevel === 'critical') {
      this.addToPending(request);
      this.addToHistory(request, {
        requestId: request.id,
        decision: 'pending',
        reason: 'Critical risk level requires manual confirmation',
      });
      return {
        requestId: request.id,
        decision: 'pending',
        reason: 'Critical risk level requires manual confirmation',
      };
    }

    // Auto-approve categories
    if (this.autoApprove.has(request.category)) {
      const response: PermissionResponse = {
        requestId: request.id,
        decision: 'approved',
        reason: `Category '${request.category}' is auto-approved`,
      };
      this.addToHistory(request, response);
      return response;
    }

    // Require confirmation categories
    if (this.requireConfirm.has(request.category)) {
      this.addToPending(request);
      const response: PermissionResponse = {
        requestId: request.id,
        decision: 'pending',
        reason: `Category '${request.category}' requires confirmation`,
      };
      this.addToHistory(request, response);
      return response;
    }

    // Unknown category -- deny by default
    const response: PermissionResponse = {
      requestId: request.id,
      decision: 'denied',
      reason: `Category '${request.category}' is not permitted`,
    };
    this.addToHistory(request, response);
    return response;
  }

  /**
   * Register a callback for manual approval of pending requests.
   * The callback will be invoked when a permission request is pending
   * and needs user confirmation.
   */
  onPermissionRequest(
    callback: (request: PermissionRequest) => Promise<PermissionDecision>,
  ): void {
    this.permissionCallback = callback;
  }

  /**
   * Manually approve a pending permission request.
   */
  approve(requestId: string): void {
    const pending = this.pendingRequests.get(requestId);
    if (!pending) return;
    pending.resolve('approved');
    this.pendingRequests.delete(requestId);
    // Update history with final decision
    this.updateHistoryDecision(requestId, 'approved');
  }

  /**
   * Manually deny a pending permission request.
   */
  deny(requestId: string, reason?: string): void {
    const pending = this.pendingRequests.get(requestId);
    if (!pending) return;
    pending.resolve('denied');
    this.pendingRequests.delete(requestId);
    this.updateHistoryDecision(requestId, 'denied', reason);
  }

  /**
   * Get all currently pending permission requests.
   */
  getPendingRequests(): PermissionRequest[] {
    return [...this.pendingRequests.values()].map((p) => p.request);
  }

  /**
   * Get permission history, optionally filtered by session ID.
   */
  getHistory(
    sessionId?: string,
  ): Array<{ request: PermissionRequest; response: PermissionResponse }> {
    if (sessionId === undefined) {
      return [...this.history];
    }
    return this.history.filter((entry) => entry.request.sessionId === sessionId);
  }

  /**
   * Asynchronously check permission, awaiting manual callback if needed.
   * Returns the final decision (approved/denied) after any pending resolution.
   */
  async checkAsync(request: PermissionRequest): Promise<PermissionResponse> {
    const response = this.check(request);

    if (response.decision === 'pending' && this.permissionCallback) {
      try {
        const decision = await this.permissionCallback(request);
        if (decision === 'approved') {
          this.approve(request.id);
          return {
            requestId: request.id,
            decision: 'approved',
          };
        } else {
          this.deny(request.id, 'Denied by user callback');
          return {
            requestId: request.id,
            decision: 'denied',
            reason: 'Denied by user callback',
          };
        }
      } catch {
        this.deny(request.id, 'Permission callback error');
        return {
          requestId: request.id,
          decision: 'denied',
          reason: 'Permission callback error',
        };
      }
    }

    return response;
  }

  /**
   * Clear all history and pending requests.
   */
  clear(): void {
    this.history.length = 0;
    this.pendingRequests.clear();
  }

  private addToPending(request: PermissionRequest): void {
    this.pendingRequests.set(request.id, {
      request,
      resolve: () => {
        // Resolved externally via approve/deny
      },
    });
  }

  private addToHistory(request: PermissionRequest, response: PermissionResponse): void {
    this.history.push({ request, response });
  }

  private updateHistoryDecision(
    requestId: string,
    decision: PermissionDecision,
    reason?: string,
  ): void {
    const entry = this.history.find((h) => h.request.id === requestId);
    if (entry) {
      entry.response.decision = decision;
      if (reason) {
        entry.response.reason = reason;
      }
    }
  }
}

export { generateId };
