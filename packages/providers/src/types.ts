/**
 * @osai/providers -- LLM Provider Types (DOMAIN-008)
 *
 * Core interfaces and types for the LLM Provider System.
 * Covers: streaming, non-streaming, tool calling, token counting.
 */

// ---------------------------------------------------------------------------
// Message Types
// ---------------------------------------------------------------------------

/** Role of a chat message participant. */
export type ChatRole = 'system' | 'user' | 'assistant' | 'tool';

/** A single chat message in a conversation. */
export interface ChatMessage {
  role: ChatRole;
  content: string;
  toolCallId?: string;
  toolCalls?: readonly ToolCall[];
  name?: string;
}

// ---------------------------------------------------------------------------
// Tool Calling
// ---------------------------------------------------------------------------

/** A tool/function call requested by the LLM. */
export interface ToolCall {
  /** Unique identifier for this tool call. */
  id: string;
  /** Name of the tool/function to invoke. */
  name: string;
  /** JSON-encoded arguments string. */
  arguments: string;
}

/** Schema describing a tool available to the LLM. */
export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description?: string;
    parameters?: Record<string, unknown>;
  };
}

// ---------------------------------------------------------------------------
// Token Usage
// ---------------------------------------------------------------------------

/** Token consumption statistics for a single LLM call. */
export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

// ---------------------------------------------------------------------------
// Streaming Chunk
// ---------------------------------------------------------------------------

/** A single streaming chunk emitted during a streaming response. */
export interface LLMChunk {
  /** Incremental content delta (may be empty string). */
  content: string;
  /** Tool calls accumulated so far in this stream. */
  toolCalls?: readonly ToolCall[];
  /** Cumulative token usage (may be absent mid-stream). */
  usage?: TokenUsage;
  /** Indicates this is the final chunk. */
  finishReason?: 'stop' | 'length' | 'tool_calls' | 'content_filter' | string;
  /** Model identifier that produced this chunk. */
  model: string;
  /** Provider identifier. */
  provider: string;
}

// ---------------------------------------------------------------------------
// Request / Response
// ---------------------------------------------------------------------------

/** Configuration for a single LLM completion request. */
export interface LLMRequest {
  /** Model identifier (e.g. 'glm-5', 'gpt-4o'). */
  model: string;
  /** Ordered conversation messages. */
  messages: readonly ChatMessage[];
  /** Tools available for the LLM to call. */
  tools?: readonly ToolDefinition[];
  /** Sampling temperature (0-2). */
  temperature?: number;
  /** Maximum tokens in the completion. */
  maxTokens?: number;
  /** Request streaming response. */
  stream?: boolean;
  /** Optional stop sequences. */
  stopSequences?: readonly string[];
  /** Optional request-level metadata. */
  metadata?: Record<string, unknown>;
}

/** A complete (non-streaming) LLM response. */
export interface LLMResponse {
  /** Generated text content. */
  content: string;
  /** Tool calls requested by the LLM (if any). */
  toolCalls?: readonly ToolCall[];
  /** Token usage statistics. */
  usage: TokenUsage;
  /** Model identifier that produced this response. */
  model: string;
  /** Provider identifier. */
  provider: string;
  /** Reason the generation finished. */
  finishReason?: 'stop' | 'length' | 'tool_calls' | 'content_filter' | string;
  /** Optional response-level metadata. */
  metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Provider Configuration
// ---------------------------------------------------------------------------

/** Configuration for a single provider instance. */
export interface ProviderConfig {
  /** Unique provider identifier (e.g. 'z-ai', 'openai'). */
  id: string;
  /** Human-readable provider name. */
  name: string;
  /** API endpoint base URL. */
  baseUrl: string;
  /** API key(s) for authentication. Multiple keys enable rotation. */
  apiKeys: readonly string[];
  /** Default model for this provider. */
  defaultModel: string;
  /** Optional request timeout in milliseconds. */
  timeoutMs?: number;
  /** Provider-specific extra configuration. */
  extra?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Provider Status
// ---------------------------------------------------------------------------

/** Runtime status of a single LLM provider. */
export enum ProviderStatus {
  /** Provider is available and healthy. */
  Available = 'available',
  /** Provider is temporarily unavailable (circuit breaker open). */
  Unavailable = 'unavailable',
  /** Provider has been rate-limited. */
  RateLimited = 'rate_limited',
  /** Provider is in degraded mode. */
  Degraded = 'degraded',
  /** Provider health is unknown (not yet checked). */
  Unknown = 'unknown',
}

// ---------------------------------------------------------------------------
// LLM Provider Interface
// ---------------------------------------------------------------------------

/**
 * Unified interface for all LLM providers.
 *
 * Every provider (Z.ai, OpenAI, Anthropic, Yandex, Ollama) must implement
 * this interface to participate in the failover chain.
 */
export interface LLMProvider {
  /** Unique provider identifier. */
  readonly id: string;
  /** Human-readable provider name. */
  readonly name: string;

  /**
   * Check whether the provider is currently available.
   * Should perform a lightweight health check (e.g. GET /models).
   */
  isAvailable(): Promise<boolean>;

  /**
   * Perform a non-streaming completion request.
   *
   * @param request - The completion request parameters.
   * @returns A complete LLM response with content and usage.
   * @throws {ProviderError} On provider-specific errors.
   */
  complete(request: LLMRequest): Promise<LLMResponse>;

  /**
   * Perform a streaming completion request.
   *
   * @param request - The completion request parameters (stream is implied).
   * @returns An async iterable of streaming chunks.
   * @throws {ProviderError} On provider-specific errors.
   */
  stream(request: LLMRequest): AsyncIterable<LLMChunk>;

  /**
   * Estimate the number of tokens in a text string.
   *
   * @param text - The text to count tokens for.
   * @returns Estimated token count.
   */
  countTokens(text: string): number;

  /**
   * Get the current status of this provider.
   */
  getStatus(): ProviderStatus;
}
