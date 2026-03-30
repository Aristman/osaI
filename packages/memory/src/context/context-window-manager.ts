/**
 * Context Window Manager.
 *
 * Assembles the LLM context from messages, system prompt, and auxiliary
 * entries (RAG results, KB chunks, tool calls). Applies priority-based
 * pruning when the context exceeds available tokens, and triggers
 * summarization when the raw context crosses the threshold.
 */

import {
  PruningPriority,
  CONTEXT_DEFAULTS,
  type ContextWindowConfig,
  type ContextResult,
  type ContextEntry,
  type PruningResult,
  type Summarizer,
} from '../types/context.js';
import { estimateTokens } from './token-counter.js';
import { pruneByPriority } from './pruning.js';

/** Options for constructing a ContextWindowManager. */
export interface ContextWindowManagerOptions {
  /** Summarizer implementation (injectable). Required for summarization trigger. */
  summarizer: Summarizer;
  /** Override default configuration values. */
  config?: Partial<ContextWindowConfig>;
}

/**
 * Manages the context window for LLM inference.
 *
 * Responsibilities:
 * - Assemble context from system prompt + messages
 * - Estimate total token usage
 * - Apply priority-based pruning when budget is exceeded
 * - Trigger summarization at the configured threshold (default: 80%)
 * - Ensure system prompt is never pruned
 */
export class ContextWindowManager {
  private readonly summarizer: Summarizer;
  private readonly config: ContextWindowConfig;

  constructor(options: ContextWindowManagerOptions) {
    this.summarizer = options.summarizer;
    this.config = {
      ...CONTEXT_DEFAULTS,
      ...options.config,
      pruningOrder: options.config?.pruningOrder
        ? [...options.config.pruningOrder]
        : [...CONTEXT_DEFAULTS.pruningOrder],
    };
  }

  /**
   * Build the final context for LLM inference.
   *
   * Steps:
   * 1. Prepend system prompt with SystemPrompt priority.
   * 2. Calculate total tokens (without system prompt counted separately).
   * 3. If total tokens exceed the summarization threshold (80% of available),
   *    trigger summarization and replace early history with the summary.
   * 4. If total tokens still exceed available budget, apply priority-based pruning.
   * 5. Return the assembled context with metadata.
   *
   * @param messages - Input context entries (RAG, KB, tool calls, history, etc.).
   * @param systemPrompt - The system prompt text. Always included, never pruned.
   * @param maxTokens - Maximum context window size in tokens.
   * @returns The assembled context with metadata.
   */
  buildContext(
    messages: readonly ContextEntry[],
    systemPrompt: string,
    maxTokens: number,
  ): ContextResult {
    // Step 1: Build system prompt entry (always first, never pruned)
    const systemEntry: ContextEntry = {
      role: 'system',
      content: systemPrompt,
      priority: PruningPriority.SystemPrompt,
      tokenCount: estimateTokens(systemPrompt),
    };

    // Step 2: Calculate available tokens
    const availableForContent = maxTokens - this.config.reservedForResponse;
    const totalInputTokens =
      systemEntry.tokenCount +
      messages.reduce((sum, m) => sum + m.tokenCount, 0);

    // Step 3: Check summarization threshold
    const summarizationTriggered =
      totalInputTokens > availableForContent * this.config.summarizationThreshold;

    let workingMessages = [...messages];

    if (summarizationTriggered) {
      // Find history messages suitable for summarization
      const historyMessages = workingMessages.filter(
        (m) => m.priority === PruningPriority.EarlyHistory,
      );
      const nonHistoryMessages = workingMessages.filter(
        (m) => m.priority !== PruningPriority.EarlyHistory,
      );

      if (historyMessages.length > 0) {
        // Split: keep last N messages, summarize the rest
        const keepCount = Math.min(
          this.config.minMessages,
          historyMessages.length,
        );
        const toKeep = historyMessages.slice(-keepCount);

        // In the synchronous buildContext, we drop older history entries
        // and keep only the last N messages. The summarizationTriggered flag
        // signals to the caller that summarization should be performed.

        workingMessages = [
          ...nonHistoryMessages,
          ...toKeep,
        ];
      }
    }

    // Step 4: Assemble full context and apply pruning
    const fullContext: ContextEntry[] = [systemEntry, ...workingMessages];
    const totalAfterThreshold = fullContext.reduce(
      (sum, m) => sum + m.tokenCount,
      0,
    );

    let pruningResult: PruningResult | undefined;

    let finalContext: ContextEntry[];

    if (totalAfterThreshold > availableForContent) {
      const result = pruneByPriority(
        fullContext,
        maxTokens,
        this.config.reservedForResponse,
        this.config.minMessages,
      );
      pruningResult = result;
      finalContext = result.context;
    } else {
      finalContext = fullContext;
    }

    const totalTokens = finalContext.reduce(
      (sum, m) => sum + m.tokenCount,
      0,
    );

    return {
      context: finalContext,
      totalTokens,
      pruningResult,
      summarizationTriggered,
    };
  }

  /**
   * Asynchronously build context with summarization applied.
   *
   * Unlike buildContext(), this method actually invokes the summarizer
   * and injects the summary into the context. Use this when async
   * operation is acceptable (e.g., pre-processing before LLM call).
   *
   * @param messages - Input context entries.
   * @param systemPrompt - The system prompt text.
   * @param maxTokens - Maximum context window size in tokens.
   * @returns The assembled context with summary injected if triggered.
   */
  async buildContextAsync(
    messages: readonly ContextEntry[],
    systemPrompt: string,
    maxTokens: number,
  ): Promise<ContextResult> {
    // Step 1: Build system prompt entry
    const systemEntry: ContextEntry = {
      role: 'system',
      content: systemPrompt,
      priority: PruningPriority.SystemPrompt,
      tokenCount: estimateTokens(systemPrompt),
    };

    // Step 2: Calculate available tokens
    const availableForContent = maxTokens - this.config.reservedForResponse;
    const totalInputTokens =
      systemEntry.tokenCount +
      messages.reduce((sum, m) => sum + m.tokenCount, 0);

    // Step 3: Check summarization threshold
    const summarizationTriggered =
      totalInputTokens > availableForContent * this.config.summarizationThreshold;

    let workingMessages: ContextEntry[] = [...messages];

    if (summarizationTriggered) {
      const historyMessages = workingMessages.filter(
        (m) => m.priority === PruningPriority.EarlyHistory,
      );
      const nonHistoryMessages = workingMessages.filter(
        (m) => m.priority !== PruningPriority.EarlyHistory,
      );

      if (historyMessages.length > 0) {
        const keepCount = Math.min(
          this.config.minMessages,
          historyMessages.length,
        );
        const toSummarize = historyMessages.slice(
          0,
          Math.max(0, historyMessages.length - keepCount),
        );
        const toKeep = historyMessages.slice(-keepCount);

        if (toSummarize.length > 0) {
          try {
            const summaryText = await this.summarizer.summarize(toSummarize);
            const summaryEntry: ContextEntry = {
              role: 'system',
              content: `[Previous conversation summary]\n${summaryText}`,
              priority: PruningPriority.EarlyHistory,
              tokenCount: estimateTokens(
                `[Previous conversation summary]\n${summaryText}`,
              ),
            };
            workingMessages = [...nonHistoryMessages, summaryEntry, ...toKeep];
          } catch {
            // Graceful degradation: if summarization fails, keep original messages
            workingMessages = [...messages];
          }
        }
      }
    }

    // Step 4: Assemble full context and apply pruning
    const fullContext: ContextEntry[] = [systemEntry, ...workingMessages];
    const totalAfterThreshold = fullContext.reduce(
      (sum, m) => sum + m.tokenCount,
      0,
    );

    let pruningResult: PruningResult | undefined;

    let finalContext: ContextEntry[];

    if (totalAfterThreshold > availableForContent) {
      const result = pruneByPriority(
        fullContext,
        maxTokens,
        this.config.reservedForResponse,
        this.config.minMessages,
      );
      pruningResult = result;
      finalContext = result.context;
    } else {
      finalContext = fullContext;
    }

    const totalTokens = finalContext.reduce(
      (sum, m) => sum + m.tokenCount,
      0,
    );

    return {
      context: finalContext,
      totalTokens,
      pruningResult,
      summarizationTriggered,
    };
  }
}
