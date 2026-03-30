/**
 * @osai/agent -- Context Assembler
 *
 * Responsible for building the final messages array that is sent to the LLM.
 *
 * Pipeline steps:
 *   1. Create base system prompt from input.systemPrompt.
 *   2. Load chat history from input.messages.
 *   3. Call BEFORE_CONTEXT_ASSEMBLY hook.
 *   4. Query RAG (if query function provided) -> BEFORE_MEMORY_QUERY hook.
 *   5. Inject RAG results into system prompt (## Relevant Memory section).
 *   6. Call AFTER_CONTEXT_ASSEMBLY hook.
 *   7. Return final messages array [system, ...history, ...user].
 */

import type { ChatMessage } from '@osai/providers';
import { HookPoint } from '../hooks/types.js';
import type { HookContext, HookRegistry } from '../hooks/index.js';
import type {
  ContextAssemblyInput,
  ContextAssemblyResult,
  RAGQueryFn,
  RAGResult,
} from './types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a HookContext for a given hook point. */
function makeHookContext(
  hookPoint: HookPoint,
  input: ContextAssemblyInput,
  extra: Record<string, unknown> = {},
): HookContext {
  return {
    hookPoint,
    sessionId: input.sessionId,
    chatId: input.chatId,
    traceId: input.traceId,
    timestamp: new Date().toISOString(),
    data: { ...extra },
  };
}

/** Build the ## Relevant Memory section from RAG results. */
function buildRAGSection(results: readonly RAGResult[]): string {
  if (results.length === 0) {
    return '';
  }

  const lines = ['## Relevant Memory', ''];

  for (const result of results) {
    lines.push(`- ${result.content}`);
  }

  lines.push('');

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// ContextAssembler
// ---------------------------------------------------------------------------

export class ContextAssembler {
  private readonly hooks: HookRegistry;
  private readonly ragQuery: RAGQueryFn | undefined;

  /**
   * @param hooks    - HookRegistry for calling pipeline hooks.
   * @param ragQuery - Optional RAG query function. When provided, the
   *                   assembler will query for relevant memory and inject
   *                   results into the system prompt.
   */
  constructor(hooks: HookRegistry, ragQuery?: RAGQueryFn) {
    this.hooks = hooks;
    this.ragQuery = ragQuery;
  }

  // -----------------------------------------------------------------------
  // assemble
  // -----------------------------------------------------------------------

  /**
   * Build the final messages array for LLM inference.
   *
   * @param input - All data needed for context assembly.
   * @returns The assembled messages and metadata.
   */
  async assemble(input: ContextAssemblyInput): Promise<ContextAssemblyResult> {
    // Step 1: Start with the base system prompt.
    let systemPrompt = input.systemPrompt;

    // Step 2: Load chat history from input.
    const chatHistory = [...input.messages];

    // Step 3: Call BEFORE_CONTEXT_ASSEMBLY hook.
    const beforeContext = await this.hooks.execute(
      HookPoint.BEFORE_CONTEXT_ASSEMBLY,
      makeHookContext(HookPoint.BEFORE_CONTEXT_ASSEMBLY, input, {
        systemPrompt,
        historyLength: chatHistory.length,
      }),
    );

    // Allow hooks to override the system prompt.
    if (typeof beforeContext.data.systemPrompt === 'string') {
      systemPrompt = beforeContext.data.systemPrompt as string;
    }

    // Step 4-5: Query RAG and inject results.
    let ragResultCount = 0;
    let ragQueried = false;

    if (this.ragQuery !== undefined) {
      ragQueried = true;

      // Step 4: Call BEFORE_MEMORY_QUERY hook.
      const beforeMemoryCtx = await this.hooks.execute(
        HookPoint.BEFORE_MEMORY_QUERY,
        makeHookContext(HookPoint.BEFORE_MEMORY_QUERY, input, {
          query: input.userMessage,
        }),
      );

      // Allow hooks to override the query string.
      const ragQuery = typeof beforeMemoryCtx.data.query === 'string'
        ? beforeMemoryCtx.data.query as string
        : input.userMessage;

      try {
        const ragResults = await this.ragQuery(ragQuery);
        ragResultCount = ragResults.length;

        // Step 5: Inject RAG results into system prompt.
        if (ragResults.length > 0) {
          const ragSection = buildRAGSection(ragResults);
          systemPrompt = systemPrompt + '\n\n' + ragSection;
        }
      } catch (error: unknown) {
        // Graceful degradation: RAG failure should not break context assembly.
        console.error(
          '[ContextAssembler] RAG query failed:',
          error instanceof Error ? error.message : String(error),
        );
      }
    }

    // Step 6: Call AFTER_CONTEXT_ASSEMBLY hook.
    const afterContext = await this.hooks.execute(
      HookPoint.AFTER_CONTEXT_ASSEMBLY,
      makeHookContext(HookPoint.AFTER_CONTEXT_ASSEMBLY, input, {
        systemPrompt,
        historyLength: chatHistory.length,
        ragResultCount,
      }),
    );

    // Allow hooks to override the system prompt one final time.
    if (typeof afterContext.data.systemPrompt === 'string') {
      systemPrompt = afterContext.data.systemPrompt as string;
    }

    // Step 7: Build final messages array.
    const messages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      ...chatHistory,
      { role: 'user', content: input.userMessage },
    ];

    return {
      messages,
      ragResultCount,
      ragQueried,
    };
  }
}
