/**
 * SessionPruner — T-008: Session Pruning
 *
 * Removes older messages from a session when the estimated token count
 * exceeds the configured threshold (80% of maxTokens).
 *
 * Pruning rules:
 *   1. System messages are ALWAYS preserved.
 *   2. The last `preserveRecentCount` messages are ALWAYS preserved.
 *   3. Removal priority (lowest priority removed first):
 *      - Tool results (role='tool')
 *      - Older user/assistant messages (by index)
 *   4. Minimum guarantee: at least 1 system + 1 last message.
 */

import type { ModelMessage } from '../types.js';

export class SessionPruner {
  /** Threshold as a fraction of maxTokens. */
  private static readonly THRESHOLD_RATIO = 0.8;

  constructor(
    private maxTokens: number = 128000,
    private preserveRecentCount: number = 4,
    private charsPerToken: number = 4,
  ) {}

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  /** Returns true when the estimated tokens exceed 80% of maxTokens. */
  needsPruning(messages: ModelMessage[]): boolean {
    return this.estimateTokens(messages) > this.threshold();
  }

  /** Returns a pruned copy of the message array. */
  prune(messages: ModelMessage[]): ModelMessage[] {
    if (messages.length === 0) {
      return [];
    }

    if (!this.needsPruning(messages)) {
      return [...messages];
    }

    const totalTokens = this.estimateTokens(messages);
    const tokensToRemove = totalTokens - this.threshold();

    if (tokensToRemove <= 0) {
      return [...messages];
    }

    const removalIndices = this.selectMessagesToRemove(messages, tokensToRemove);
    return messages.filter((_, idx) => !removalIndices.has(idx));
  }

  /** Estimates total tokens for an array of messages. */
  estimateTokens(messages: ModelMessage[]): number {
    let total = 0;
    for (const msg of messages) {
      total += this.estimateTextTokens(msg.content);
    }
    return total;
  }

  /** Estimates tokens for a single text string. */
  estimateTextTokens(text: string): number {
    if (text.length === 0) {
      return 0;
    }
    return Math.ceil(text.length / this.charsPerToken);
  }

  /**
   * Selects indices of messages to remove to free at least `tokensToRemove` tokens.
   *
   * Selection order (removed first):
   *   1. Tool results (role='tool') — oldest first
   *   2. Older user/assistant messages — oldest first
   *
   * Protected: system messages, last `preserveRecentCount` messages,
   * and the absolute minimum (1 system + 1 last message).
   */
  selectMessagesToRemove(messages: ModelMessage[], tokensToRemove: number): Set<number> {
    const result = new Set<number>();
    let removedTokens = 0;

    // Collect removable candidates split by type
    const toolCandidates: Array<{ idx: number; tokens: number }> = [];
    const chatCandidates: Array<{ idx: number; tokens: number }> = [];

    const protectedSet = this.buildProtectedSet(messages);

    for (let i = 0; i < messages.length; i++) {
      if (protectedSet.has(i)) {
        continue;
      }

      const msg = messages[i]!;
      const tokens = this.estimateTextTokens(msg.content);

      if (msg.role === 'tool') {
        toolCandidates.push({ idx: i, tokens });
      } else {
        chatCandidates.push({ idx: i, tokens });
      }
    }

    // Phase 1: Remove tool results first (oldest first)
    for (const candidate of toolCandidates) {
      if (removedTokens >= tokensToRemove) {
        break;
      }
      result.add(candidate.idx);
      removedTokens += candidate.tokens;
    }

    // Phase 2: Remove old chat messages (oldest first)
    for (const candidate of chatCandidates) {
      if (removedTokens >= tokensToRemove) {
        break;
      }
      result.add(candidate.idx);
      removedTokens += candidate.tokens;
    }

    // Safety: ensure we still meet the minimum guarantee
    // If all removable messages were removed and we still need more,
    // the minimum guarantee means we stop here.
    return result;
  }

  /** Returns true if the message is a system message. */
  isSystemMessage(msg: ModelMessage): boolean {
    return msg.role === 'system';
  }

  // -----------------------------------------------------------------------
  // Private helpers
  // -----------------------------------------------------------------------

  /** The token threshold = maxTokens * THRESHOLD_RATIO. */
  private threshold(): number {
    return Math.floor(this.maxTokens * SessionPruner.THRESHOLD_RATIO);
  }

  /**
   * Builds the set of protected indices that must NOT be removed.
   *
   * Protected indices:
   *   - All system messages
   *   - Last `preserveRecentCount` messages
   *   - At least 1 system message (first system found)
   *   - The very last message (minimum guarantee)
   */
  private buildProtectedSet(messages: ModelMessage[]): Set<number> {
    const protected_ = new Set<number>();

    // All system messages
    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i]!;
      if (this.isSystemMessage(msg)) {
        protected_.add(i);
      }
    }

    // Last N messages (preserveRecentCount from the end)
    const recentStart = Math.max(0, messages.length - this.preserveRecentCount);
    for (let i = recentStart; i < messages.length; i++) {
      protected_.add(i);
    }

    // Absolute minimum: first system + last message
    if (protected_.size === 0 && messages.length > 0) {
      // No system messages found -- protect the last message at minimum
      protected_.add(messages.length - 1);
    }

    return protected_;
  }
}
