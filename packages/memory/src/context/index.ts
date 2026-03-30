/**
 * Context Window Manager module (T-007).
 *
 * Exports:
 * - estimateTokens: conservative token estimation for UTF-8 text
 * - pruneByPriority: priority-based context pruning
 * - ContextWindowManager: full context assembly with pruning + summarization
 */

export { estimateTokens } from './token-counter.js';
export { pruneByPriority } from './pruning.js';
export { ContextWindowManager } from './context-window-manager.js';
export type { ContextWindowManagerOptions } from './context-window-manager.js';
