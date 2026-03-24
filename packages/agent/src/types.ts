/**
 * @osai/agent -- Core types for the Agent Runtime
 *
 * Defines agent interfaces, hook system, model providers,
 * tools, skills, and session management types.
 */

// ---------------------------------------------------------------------------
// Hook System
// ---------------------------------------------------------------------------

export type HookPoint =
  | 'before_model_resolve'
  | 'before_prompt_build'
  | 'before_agent_start'
  | 'before_tool_call'
  | 'after_tool_call'
  | 'agent_end'
  | 'on_error'
  | 'before_memory_query'
  | 'after_memory_extract'
  | 'on_file_access'
  | 'on_desktop_notification';

export interface HookContext {
  hookPoint: HookPoint;
  sessionId: string;
  data: Record<string, unknown>;
  abort: boolean;
}

export type HookHandler = (context: HookContext) => Promise<HookContext | null>;

export interface HookRegistration {
  id: string;
  handler: HookHandler;
  priority: number;
}

// ---------------------------------------------------------------------------
// Agent Messages
// ---------------------------------------------------------------------------

export interface AgentMessage {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  timestamp: Date;
  metadata?: Record<string, unknown>;
}

export interface AgentResponse {
  id: string;
  sessionId: string;
  content: string;
  toolCalls?: ToolCall[];
  usage?: TokenUsage;
  timestamp: Date;
}

export type SessionState = 'idle' | 'processing' | 'streaming' | 'error' | 'closed';

// ---------------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------------

export interface ToolSchema {
  name: string;
  description: string;
  category: 'read' | 'write' | 'execute' | 'system';
  parameters: Record<string, unknown>;
}

export interface ToolCall {
  id: string;
  name: string;
  parameters: Record<string, unknown>;
}

export interface ToolResult {
  success: boolean;
  output?: string;
  error?: string;
  metadata?: Record<string, unknown>;
}

export interface ToolContext {
  sessionId: string;
  toolCall: ToolCall;
  config: Record<string, unknown>;
}

export type ToolExecutor = (
  params: Record<string, unknown>,
  context: ToolContext,
) => Promise<ToolResult>;

// ---------------------------------------------------------------------------
// Model Provider
// ---------------------------------------------------------------------------

export interface ModelProvider {
  name: string;
  model: string;
  complete(messages: ModelMessage[], options?: ModelOptions): Promise<ModelResponse>;
  stream?(
    messages: ModelMessage[],
    options?: ModelOptions,
  ): AsyncIterable<StreamChunk>;
}

export interface ModelMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  toolCallId?: string;
  toolCalls?: ToolCall[];
}

export interface ModelOptions {
  maxTokens?: number;
  temperature?: number;
  tools?: ToolSchema[];
}

export interface ModelResponse {
  content: string;
  toolCalls?: ToolCall[];
  usage: TokenUsage;
  finishReason: 'stop' | 'tool_calls' | 'length' | 'error';
}

export interface StreamChunk {
  type: 'content' | 'tool_call' | 'done' | 'error';
  content?: string;
  toolCall?: Partial<ToolCall>;
  usage?: TokenUsage;
  error?: string;
}

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface ModelInfo {
  name: string;
  provider: string;
  model: string;
  active: boolean;
}

// ---------------------------------------------------------------------------
// Agent Config
// ---------------------------------------------------------------------------

export interface AgentConfig {
  model: {
    provider: string;
    model: string;
    apiKey?: string;
    maxTokens?: number;
    temperature?: number;
    fallbacks?: Array<{
      provider: string;
      model: string;
      apiKey?: string;
    }>;
  };
  session?: {
    maxHistory?: number;
    timeout?: number;
    maxTokens?: number;
  };
  skills?: {
    enabled?: string[];
    disabled?: string[];
    extraDirs?: string[];
  };
  errorHandling?: {
    maxRetries?: number;
    baseDelay?: number;
  };
}

// ---------------------------------------------------------------------------
// Skill Definition
// ---------------------------------------------------------------------------

export interface SkillDefinition {
  name: string;
  version: string;
  description: string;
  category: string;
  tools: Array<{
    name: string;
    description: string;
    category: 'read' | 'write' | 'execute' | 'system';
    parameters: Record<string, unknown>;
  }>;
  hooks?: Array<{
    point: HookPoint;
    priority: number;
  }>;
  permissions?: string[];
}

// ---------------------------------------------------------------------------
// Assembled Context
// ---------------------------------------------------------------------------

export interface AssembledContext {
  systemPrompt: string;
  toolSchemas: ToolSchema[];
  history: ModelMessage[];
  totalTokens: number;
}

// ---------------------------------------------------------------------------
// Stream Output
// ---------------------------------------------------------------------------

export interface BlockMessage {
  type: 'text' | 'code' | 'image' | 'card' | 'table';
  content: string;
  language?: string;
}

export interface ToolStreamMessage {
  sessionId: string;
  tool: string;
  action: string;
  chunk: Record<string, unknown>;
  progress?: number;
}
