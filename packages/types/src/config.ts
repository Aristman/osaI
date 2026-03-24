/**
 * Configuration Types for osaI
 *
 * Top-level and section-specific configuration interfaces.
 */

// ---------------------------------------------------------------------------
// Model Configuration
// ---------------------------------------------------------------------------

export interface ModelConfig {
  provider: string;
  model: string;
  apiKey: string;
  fallbacks?: ModelConfig[];
}

// ---------------------------------------------------------------------------
// Gateway Configuration
// ---------------------------------------------------------------------------

export interface GatewayConfig {
  host: string;
  port: number;
  cors?: string[];
}

// ---------------------------------------------------------------------------
// Session Configuration
// ---------------------------------------------------------------------------

export interface SessionConfig {
  maxHistory?: number;
  timeout?: number;
}

// ---------------------------------------------------------------------------
// Skills Configuration
// ---------------------------------------------------------------------------

export interface SkillsConfig {
  enabled?: string[];
  disabled?: string[];
}

// ---------------------------------------------------------------------------
// Security Configuration
// ---------------------------------------------------------------------------

export interface SecurityConfig {
  sandboxEnabled?: boolean;
  fileSandbox?: {
    allowedDirs: string[];
    blockedPatterns: string[];
  };
}

// ---------------------------------------------------------------------------
// Top-Level osaI Configuration
// ---------------------------------------------------------------------------

export interface OsaIConfig {
  gateway: GatewayConfig;
  model: ModelConfig;
  session?: SessionConfig;
  skills?: SkillsConfig;
  security?: SecurityConfig;
}
