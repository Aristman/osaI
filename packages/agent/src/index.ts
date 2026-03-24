/**
 * @osai/agent -- Agent Runtime
 *
 * Barrel export of all agent runtime types.
 */

// Hook System
export { HookManager } from './hooks/index.js';
export type {
  HookPoint,
  HookContext,
  HookHandler,
  HookRegistration,
} from './types.js';

// Agent Messages
export type {
  AgentMessage,
  AgentResponse,
  SessionState,
} from './types.js';

// Tools
export type {
  ToolSchema,
  ToolCall,
  ToolResult,
  ToolContext,
  ToolExecutor,
} from './types.js';

// Model Provider
export type {
  ModelProvider,
  ModelMessage,
  ModelOptions,
  ModelResponse,
  StreamChunk,
  TokenUsage,
  ModelInfo,
} from './types.js';

// Agent Config
export type { AgentConfig } from './types.js';

// Skill Definition
export type { SkillDefinition } from './types.js';

// Assembled Context
export type { AssembledContext } from './types.js';

// Stream Output
export type {
  BlockMessage,
  ToolStreamMessage,
} from './types.js';

// Model Resolver
export {
  ModelResolver,
  ModelError,
  AllProvidersExhaustedError,
  ClaudeProvider,
  OpenAIProvider,
  OllamaProvider,
} from './model/index.js';
export type {
  ModelProviderConfig,
  ModelResolverOptions,
  ProviderAttempt,
  ClaudeProviderConfig,
  OpenAIProviderConfig,
  OllamaProviderConfig,
} from './model/index.js';

// Error Handling
export {
  AgentError,
  TransientError,
  PermanentError,
  CriticalError,
  ValidationError,
  TimeoutError,
  ContextOverflowError,
  ErrorHandler,
} from './errors/index.js';
export type { ErrorSeverity, IHookManager, ErrorLogEntry } from './errors/index.js';

// Skills
export {
  SkillLoader,
  SkillRegistry,
  SkillParseError,
  SkillNotFoundError,
  ToolNotFoundError,
} from './skills/index.js';

// Context Assembly
export { ContextAssembler, SystemPromptLoader } from './context/index.js';

// Persistence
export { SessionRepository, SessionNotFoundError } from './persistence/index.js';
export type { SessionRecord } from './persistence/index.js';

// Session Pruning
export { SessionPruner } from './pruning/index.js';

// Streaming
export { StreamProcessor, StreamAggregator } from './streaming/index.js';
export type { StreamHandler, StreamOutput } from './streaming/index.js';

// Agent Runtime
export { AgentRuntime } from './AgentRuntime.js';
export type { AgentRuntimeDeps } from './AgentRuntime.js';
