/**
 * @osai/agent -- Error Handling barrel export
 */

export {
  AgentError,
  TransientError,
  PermanentError,
  CriticalError,
  ValidationError,
  TimeoutError,
  ContextOverflowError,
} from './AgentError.js';

export type { ErrorSeverity } from './AgentError.js';

export { ErrorHandler } from './ErrorHandler.js';
export type { IHookManager, ErrorLogEntry } from './ErrorHandler.js';
