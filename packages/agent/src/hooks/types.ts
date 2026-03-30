/**
 * @osai/agent -- Hook System Types
 *
 * Defines 13 hook points for the Agent Runtime pipeline.
 * 7 OpenClaw hooks + 6 osaI-specific hooks.
 */

// ---------------------------------------------------------------------------
// Hook Point Enum (13 values)
// ---------------------------------------------------------------------------

/**
 * All hook points in the Agent Runtime pipeline.
 *
 * OpenClaw hooks (7):
 *   - BEFORE_MODEL_RESOLVE, BEFORE_PROMPT_BUILD, BEFORE_AGENT_START,
 *     BEFORE_TOOL_CALL, AFTER_TOOL_CALL, AGENT_END, ON_ERROR
 *
 * osaI hooks (6):
 *   - BEFORE_MEMORY_QUERY, AFTER_MEMORY_EXTRACT, ON_FILE_ACCESS,
 *     ON_DESKTOP_NOTIFICATION, ON_CHAT_SWITCH, ON_MIRROR_MESSAGE
 */
export enum HookPoint {
  // OpenClaw hooks
  BEFORE_INTAKE = 'before_intake',
  AFTER_INTAKE = 'after_intake',
  BEFORE_CONTEXT_ASSEMBLY = 'before_context_assembly',
  AFTER_CONTEXT_ASSEMBLY = 'after_context_assembly',
  BEFORE_MODEL_INFERENCE = 'before_model_inference',
  AFTER_MODEL_INFERENCE = 'after_model_inference',
  BEFORE_TOOL_EXECUTION = 'before_tool_execution',
  AFTER_TOOL_EXECUTION = 'after_tool_execution',
  BEFORE_RESPONSE_STREAMING = 'before_response_streaming',
  AFTER_RESPONSE_STREAMING = 'after_response_streaming',
  BEFORE_MEMORY_QUERY = 'before_memory_query',
  AFTER_MEMORY_QUERY = 'after_memory_query',
  BEFORE_FACT_EXTRACTION = 'before_fact_extraction',
}

// ---------------------------------------------------------------------------
// Hook Context
// ---------------------------------------------------------------------------

/**
 * Context passed through the hook pipeline.
 *
 * Contains correlation IDs (traceId, sessionId, chatId) and an extensible
 * data bag for hook-specific payloads.
 */
export interface HookContext {
  /** The hook point that is currently being executed. */
  readonly hookPoint: HookPoint;
  /** Correlation: session identifier. */
  readonly sessionId: string;
  /** Correlation: chat identifier. */
  readonly chatId: string;
  /** Correlation: trace identifier (spans the full agent loop). */
  readonly traceId: string;
  /** ISO-8601 timestamp of when this context was created. */
  readonly timestamp: string;
  /** Extensible data bag for hook-specific payloads. */
  data: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Hook Handler
// ---------------------------------------------------------------------------

/**
 * A hook handler function.
 *
 * Receives the current HookContext and may return a modified copy.
 * Supports both sync and async implementations.
 */
export type HookHandler = (
  context: HookContext,
) => HookContext | Promise<HookContext>;

// ---------------------------------------------------------------------------
// Hook Result
// ---------------------------------------------------------------------------

/**
 * Result produced after executing a handler.
 */
export interface HookResult {
  /** Whether the handler modified the context. */
  readonly modified: boolean;
  /** The (possibly modified) context after handler execution. */
  readonly context: HookContext;
}
