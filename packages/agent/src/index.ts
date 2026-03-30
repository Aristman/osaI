/**
 * @osai/agent -- Agent Runtime (DOMAIN-002)
 *
 * Agent loop, hook system (13 hook points), context assembly,
 * model inference integration, tool execution, streaming, persistence.
 */

export {
  HookPoint,
  HookRegistry,
} from './hooks/index.js';

export type {
  HookContext,
  HookHandler,
  HookResult,
} from './hooks/index.js';

export { ContextAssembler } from './context/index.js';

export type {
  ContextAssemblyInput,
  ContextAssemblyResult,
  RAGQueryFn,
  RAGResult,
} from './context/index.js';

export { InferenceService } from './inference/index.js';

export type {
  InferenceInput,
  InferenceResult,
  InferenceChunk,
} from './inference/index.js';

export { AgentLoop } from './loop/index.js';

export type {
  AgentLoopConfig,
  AgentLoopInput,
  AgentLoopOutput,
} from './loop/index.js';

export { ToolExecutor } from './loop/index.js';

export type {
  ToolExecutorConfig,
  ToolExecutorInput,
  ToolExecutorOutput,
} from './loop/index.js';

export { StreamManager } from './streaming/index.js';

export type {
  StreamChunk,
  StreamCallback,
  StreamEvent,
} from './streaming/index.js';

export { PersistenceService } from './persistence/index.js';

export type { ChatMessage } from './persistence/index.js';

export { FactExtractor } from './memory/index.js';

export type {
  Fact,
  FactCategory,
  ExtractionResult,
  StoreFactsFunction,
} from './memory/index.js';
