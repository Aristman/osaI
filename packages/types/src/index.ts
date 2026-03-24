/**
 * @osai/types -- Shared TypeScript interfaces for osaI monorepo
 *
 * Barrel export of all domain types.
 */

// WS Message Types (Inbound)
export type {
  ClientMessage,
  ClientCommand,
  PermissionResponse,
  ClientSubscribe,
  WsInboundMessage,
} from './ws.js';

// WS Message Types (Outbound)
export type {
  ToolStreamMessage,
  BlockStreamMessage,
  PermissionRequest,
  ErrorResponse,
  StatusMessage,
  EventMessage,
  WsOutboundMessage,
} from './ws.js';

// Error Types
export type { Severity, OsaIError, ModelError, SandboxError, SkillError } from './errors.js';

// Domain Interfaces
export type {
  SessionType,
  ActivationMode,
  ToolCategory,
  RiskLevel,
  MemoryCategory,
} from './session.js';

// Config Types
export type {
  OsaIConfig,
  ModelConfig,
  GatewayConfig,
  SessionConfig,
  SkillsConfig,
  SkillsEntry,
  SecurityConfig,
  SecurityShellConfig,
  MemoryConfig,
  MemoryShortTermConfig,
  MemoryLongTermConfig,
  MemoryEmbeddingConfig,
  ObservabilityConfig,
  ObservabilityTracesConfig,
  ObservabilityMetricsConfig,
  ObservabilityLogsConfig,
  ObservabilityAuditConfig,
} from './config.js';
