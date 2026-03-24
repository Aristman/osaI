/**
 * Configuration Types for osaI
 *
 * Top-level and section-specific configuration interfaces.
 * Extended for F-003: Configuration System.
 */

// ---------------------------------------------------------------------------
// Model Configuration
// ---------------------------------------------------------------------------

export interface ModelConfig {
  provider: string;
  model: string;
  apiKey: string;
  maxTokens?: number;
  temperature?: number;
  fallbacks?: ModelConfig[];
}

// ---------------------------------------------------------------------------
// Gateway Configuration
// ---------------------------------------------------------------------------

export interface GatewayConfig {
  host: string;
  port: number;
  cors?: string[];
  heartbeat?: number;
}

// ---------------------------------------------------------------------------
// Session Configuration
// ---------------------------------------------------------------------------

export interface SessionConfig {
  maxHistory?: number;
  timeout?: number;
  pruning?: number;
  activationMode?: 'always' | 'mention' | 'wake_word' | 'passive';
}

// ---------------------------------------------------------------------------
// Skills Configuration
// ---------------------------------------------------------------------------

export interface SkillsConfig {
  enabled?: string[];
  disabled?: string[];
  extraDirs?: string[];
  watch?: boolean;
  entries?: SkillsEntry[];
}

export interface SkillsEntry {
  name: string;
  path: string;
  enabled?: boolean;
}

// ---------------------------------------------------------------------------
// Security Configuration
// ---------------------------------------------------------------------------

export interface SecurityConfig {
  sandboxEnabled?: boolean;
  shell?: SecurityShellConfig;
  fileSandbox?: {
    allowedDirs: string[];
    blockedPatterns: string[];
  };
  blockedCommands?: string[];
  allowedDirectories?: string[];
  blockedPatterns?: string[];
}

export interface SecurityShellConfig {
  blockedCommands: string[];
  timeout: number;
}

// ---------------------------------------------------------------------------
// Memory Configuration
// ---------------------------------------------------------------------------

export interface MemoryConfig {
  enabled?: boolean;
  provider?: 'sqlite' | 'qdrant';
  qdrantUrl?: string;
  embeddingModel?: string;
  shortTerm?: MemoryShortTermConfig;
  longTerm?: MemoryLongTermConfig;
  embedding?: MemoryEmbeddingConfig;
}

export interface MemoryShortTermConfig {
  maxMessages?: number;
  ttl?: number;
}

export interface MemoryLongTermConfig {
  enabled?: boolean;
  provider?: 'qdrant' | 'sqlite-vec';
  qdrantUrl?: string;
  collection?: string;
}

export interface MemoryEmbeddingConfig {
  provider?: 'openai' | 'ollama' | 'onnx';
  model?: string;
}

// ---------------------------------------------------------------------------
// Observability Configuration
// ---------------------------------------------------------------------------

export interface ObservabilityConfig {
  traces?: ObservabilityTracesConfig;
  metrics?: ObservabilityMetricsConfig;
  logs?: ObservabilityLogsConfig;
  audit?: ObservabilityAuditConfig;
}

export interface ObservabilityTracesConfig {
  enabled?: boolean;
  exporter?: 'console' | 'jaeger' | 'zipkin' | 'otlp';
  endpoint?: string;
}

export interface ObservabilityMetricsConfig {
  enabled?: boolean;
  port?: number;
}

export interface ObservabilityLogsConfig {
  level?: 'trace' | 'debug' | 'info' | 'warn' | 'error';
  format?: 'json' | 'pretty';
  file?: string;
}

export interface ObservabilityAuditConfig {
  enabled?: boolean;
  retention?: number;
}

// ---------------------------------------------------------------------------
// Top-Level osaI Configuration
// ---------------------------------------------------------------------------

export interface OsaIConfig {
  version?: string;
  gateway: GatewayConfig;
  model: ModelConfig;
  session?: SessionConfig;
  skills?: SkillsConfig;
  security?: SecurityConfig;
  memory?: MemoryConfig;
  observability?: ObservabilityConfig;
}
