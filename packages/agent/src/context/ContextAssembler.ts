/**
 * ContextAssembler -- Assembles the full LLM context
 *
 * Composes system prompt (AGENTS.md + SOUL.md), tool schemas,
 * and session history into an AssembledContext for model inference.
 * Supports before_prompt_build hook and token estimation.
 *
 * @module context/ContextAssembler
 */

import type {
  AssembledContext,
  ToolSchema,
  ModelMessage,
  AgentMessage,
} from '../types.js';
import type { SkillRegistry } from '../skills/SkillRegistry.js';
import type { HookManager } from '../hooks/HookManager.js';
import { SystemPromptLoader } from './SystemPromptLoader.js';

/** Approximate chars per token for estimation */
const CHARS_PER_TOKEN = 4;

export class ContextAssembler {
  private readonly promptLoader: SystemPromptLoader;

  constructor(
    private skillRegistry: SkillRegistry,
    private hookManager: HookManager | null = null,
  ) {
    this.promptLoader = new SystemPromptLoader();
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Access the underlying prompt loader for programmatic content injection.
   */
  get systemPromptLoader(): SystemPromptLoader {
    return this.promptLoader;
  }

  /**
   * Main method -- assemble the full LLM context.
   *
   * @param sessionId - The current session identifier
   * @param history - Array of AgentMessage from the session
   * @returns Fully assembled context ready for model inference
   * @throws Error if before_prompt_build hook aborts
   */
  async assemble(
    sessionId: string,
    history: AgentMessage[],
  ): Promise<AssembledContext> {
    const systemPrompt = this.buildSystemPrompt();
    const toolSchemas = this.skillRegistry.getToolSchemas();
    const modelMessages = this.historyToModelMessages(history);

    // Hook: before_prompt_build
    if (this.hookManager) {
      const hookContext = {
        hookPoint: 'before_prompt_build' as const,
        sessionId,
        data: {
          systemPrompt,
          toolSchemas,
          history: modelMessages,
        },
        abort: false,
      };
      const result = await this.hookManager.executeHooks(
        'before_prompt_build',
        hookContext,
      );
      if (result.abort) {
        throw new Error('Context assembly aborted by hook');
      }
    }

    const totalTokens =
      this.estimateTokens(systemPrompt) +
      this.estimateTokens(JSON.stringify(toolSchemas)) +
      modelMessages.reduce(
        (sum, m) => sum + this.estimateTokens(m.content),
        0,
      );

    return {
      systemPrompt,
      toolSchemas,
      history: modelMessages,
      totalTokens,
    };
  }

  /**
   * Build the system prompt from AGENTS.md and SOUL.md components.
   *
   * Order: AGENTS.md + SOUL.md
   *
   * @returns Composed system prompt string
   */
  buildSystemPrompt(): string {
    return [this.promptLoader.getAgentsMd(), this.promptLoader.getSoulMd()]
      .filter(Boolean)
      .join('\n\n');
  }

  /**
   * Load AGENTS.md content. Returns default if not set.
   *
   * @returns AGENTS.md content string
   */
  loadAgentsMd(): string {
    return this.promptLoader.getAgentsMd();
  }

  /**
   * Load SOUL.md content. Returns default if not set.
   *
   * @returns SOUL.md content string
   */
  loadSoulMd(): string {
    return this.promptLoader.getSoulMd();
  }

  /**
   * Convert AgentMessage[] to ModelMessage[] for LLM consumption.
   *
   * @param history - Array of AgentMessage from session
   * @returns Array of ModelMessage
   */
  historyToModelMessages(history: AgentMessage[]): ModelMessage[] {
    return history.map((msg) => {
      const modelMessage: ModelMessage = {
        role: msg.role,
        content: msg.content,
      };
      if (msg.metadata?.toolCallId) {
        modelMessage.toolCallId = msg.metadata.toolCallId as string;
      }
      if (msg.metadata?.toolCalls) {
        modelMessage.toolCalls = msg.metadata.toolCalls as ModelMessage['toolCalls'];
      }
      return modelMessage;
    });
  }

  /**
   * Estimate the number of tokens in a text string.
   * Uses simple heuristic: ~4 characters per token.
   *
   * @param text - The text to estimate tokens for
   * @returns Estimated token count (rounded up, minimum 0)
   */
  estimateTokens(text: string): number {
    if (!text || text.length === 0) return 0;
    return Math.ceil(text.length / CHARS_PER_TOKEN);
  }

  /**
   * Load tool schemas from the SkillRegistry.
   *
   * @returns Array of ToolSchema
   */
  loadToolSchemas(): ToolSchema[] {
    return this.skillRegistry.getToolSchemas();
  }
}
