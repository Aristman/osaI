/**
 * Priority-based context pruning.
 *
 * Removes entries from the context in priority order to fit within
 * the available token budget. System prompt entries are never pruned.
 *
 * Priority order (lower = pruned first):
 *   1. PruningPriority.LongTermRAG (1)
 *   2. PruningPriority.KnowledgeBase (2)
 *   3. PruningPriority.ToolCalls (3)
 *   4. PruningPriority.EarlyHistory (4)
 *   5. PruningPriority.SystemPrompt (5) -- NEVER pruned
 */

import {
  PruningPriority,
  CONTEXT_DEFAULTS,
  type ContextEntry,
  type PruningResult,
} from '../types/context.js';

/**
 * Prune context entries by priority to fit within the token budget.
 *
 * @param messages - All context entries (including system prompt, RAG, KB, etc.)
 * @param maxTokens - Maximum total tokens allowed (includes reservedForResponse).
 * @param reservedForResponse - Tokens to reserve for the LLM response.
 * @param minMessages - Minimum number of non-system messages to keep.
 * @returns PruningResult with the pruned context and metadata.
 */
export function pruneByPriority(
  messages: readonly ContextEntry[],
  maxTokens: number,
  reservedForResponse: number = CONTEXT_DEFAULTS.reservedForResponse,
  minMessages: number = CONTEXT_DEFAULTS.minMessages,
): PruningResult {
  const tokensBefore = messages.reduce((sum, m) => sum + m.tokenCount, 0);
  const availableTokens = maxTokens - reservedForResponse;

  // If already within budget, no pruning needed
  if (tokensBefore <= availableTokens) {
    return {
      wasPruned: false,
      tokensBefore,
      tokensAfter: tokensBefore,
      tokensRemoved: 0,
      prunedLevels: [],
      description: 'No pruning needed.',
      context: [...messages],
    };
  }

  // Separate system prompts (never pruned) from prunable entries
  const systemEntries = messages.filter(
    (m) => m.priority === PruningPriority.SystemPrompt,
  );
  const prunableEntries = messages.filter(
    (m) => m.priority !== PruningPriority.SystemPrompt,
  );

  const systemTokens = systemEntries.reduce((sum, m) => sum + m.tokenCount, 0);

  // Group prunable entries by priority
  const priorityGroups = new Map<PruningPriority, ContextEntry[]>();

  for (const entry of prunableEntries) {
    const group = priorityGroups.get(entry.priority);
    if (group) {
      group.push(entry);
    } else {
      priorityGroups.set(entry.priority, [entry]);
    }
  }

  // Pruning order: lowest priority first (LongTermRAG=1, ..., EarlyHistory=4)
  const pruningOrder: PruningPriority[] = [
    PruningPriority.LongTermRAG,
    PruningPriority.KnowledgeBase,
    PruningPriority.ToolCalls,
    PruningPriority.EarlyHistory,
  ];

  const prunedLevels: PruningPriority[] = [];
  let removedTokens = 0;
  const keptEntries: ContextEntry[] = [];

  // Process each priority group from lowest to highest
  for (const priority of pruningOrder) {
    const group = priorityGroups.get(priority);
    if (!group) continue;

    // Current total tokens: system + all kept so far
    const currentTotal =
      systemTokens +
      keptEntries.reduce((sum, m) => sum + m.tokenCount, 0);

    // Group total tokens
    const groupTokens = group.reduce((sum, m) => sum + m.tokenCount, 0);

    // Remaining budget from the available token limit
    const remainingBudget = availableTokens - currentTotal;

    // Check if the entire group fits within the remaining budget
    if (remainingBudget >= groupTokens) {
      // All entries in this group fit
      keptEntries.push(...group);
    } else {
      // This group does not fit -- prune it
      prunedLevels.push(priority);

      // If this is the last prunable group (EarlyHistory), enforce minMessages
      if (priority === PruningPriority.EarlyHistory) {
        const messagesNeeded = Math.max(0, minMessages - keptEntries.length);

        // Keep the LAST messagesNeeded entries from this group (most recent)
        if (messagesNeeded > 0 && group.length > messagesNeeded) {
          const keepSlice = group.slice(-messagesNeeded);
          keptEntries.push(...keepSlice);

          // Count tokens of removed entries
          for (const entry of group) {
            if (!keepSlice.includes(entry)) {
              removedTokens += entry.tokenCount;
            }
          }
        } else if (messagesNeeded > 0) {
          // Keep all entries (even if they exceed budget) to satisfy minMessages
          keptEntries.push(...group);
        } else {
          // No minMessages requirement, prune all
          for (const entry of group) {
            removedTokens += entry.tokenCount;
          }
        }
      } else {
        // Not the last group -- prune all entries in this priority level
        for (const entry of group) {
          removedTokens += entry.tokenCount;
        }
      }
    }
  }

  // Assemble final context: system prompts first, then kept prunable entries
  const finalContext: ContextEntry[] = [...systemEntries, ...keptEntries];
  const tokensAfter = finalContext.reduce((sum, m) => sum + m.tokenCount, 0);

  // Build description
  const levelDescriptions: string[] = [];
  for (const level of prunedLevels) {
    switch (level) {
      case PruningPriority.LongTermRAG:
        levelDescriptions.push('long-term RAG results');
        break;
      case PruningPriority.KnowledgeBase:
        levelDescriptions.push('knowledge base chunks');
        break;
      case PruningPriority.ToolCalls:
        levelDescriptions.push('tool call results');
        break;
      case PruningPriority.EarlyHistory:
        levelDescriptions.push('early conversation history');
        break;
      default:
        levelDescriptions.push(`priority level ${level}`);
    }
  }

  return {
    wasPruned: true,
    tokensBefore,
    tokensAfter,
    tokensRemoved: removedTokens,
    prunedLevels,
    description:
      prunedLevels.length > 0
        ? `Pruned: ${levelDescriptions.join(', ')}.`
        : 'No pruning needed.',
    context: finalContext,
  };
}
