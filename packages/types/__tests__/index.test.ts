/**
 * Integration test: verifies all types are exported from barrel index.ts
 * Maps to test cases T002-01, T002-02, T002-03
 */
import { describe, it, expectTypeOf } from 'vitest';
import type {
  // WS Inbound types
  ClientMessage,
  ClientCommand,
  PermissionResponse,
  ClientSubscribe,
  WsInboundMessage,
  // WS Outbound types
  ToolStreamMessage,
  BlockStreamMessage,
  PermissionRequest,
  ErrorResponse,
  StatusMessage,
  EventMessage,
  WsOutboundMessage,
  // Error types
  Severity,
  OsaIError,
  ModelError,
  SandboxError,
  SkillError,
  // Domain types
  SessionType,
  ActivationMode,
  ToolCategory,
  RiskLevel,
  MemoryCategory,
  // Config types
  OsaIConfig,
  ModelConfig,
  GatewayConfig,
  SessionConfig,
  SkillsConfig,
  SecurityConfig,
} from '../src/index.js';

describe('Barrel Exports (index.ts)', () => {
  it('T002-01: All WS inbound types are exported', () => {
    expectTypeOf<ClientMessage>().not.toBeAny();
    expectTypeOf<ClientCommand>().not.toBeAny();
    expectTypeOf<PermissionResponse>().not.toBeAny();
    expectTypeOf<ClientSubscribe>().not.toBeAny();
    expectTypeOf<WsInboundMessage>().not.toBeAny();
  });

  it('T002-02: All WS outbound types are exported', () => {
    expectTypeOf<ToolStreamMessage>().not.toBeAny();
    expectTypeOf<BlockStreamMessage>().not.toBeAny();
    expectTypeOf<PermissionRequest>().not.toBeAny();
    expectTypeOf<ErrorResponse>().not.toBeAny();
    expectTypeOf<StatusMessage>().not.toBeAny();
    expectTypeOf<EventMessage>().not.toBeAny();
    expectTypeOf<WsOutboundMessage>().not.toBeAny();
  });

  it('T002-03: All error types are exported', () => {
    expectTypeOf<Severity>().not.toBeAny();
    expectTypeOf<OsaIError>().not.toBeAny();
    expectTypeOf<ModelError>().not.toBeAny();
    expectTypeOf<SandboxError>().not.toBeAny();
    expectTypeOf<SkillError>().not.toBeAny();
  });

  it('All domain types are exported', () => {
    expectTypeOf<SessionType>().not.toBeAny();
    expectTypeOf<ActivationMode>().not.toBeAny();
    expectTypeOf<ToolCategory>().not.toBeAny();
    expectTypeOf<RiskLevel>().not.toBeAny();
    expectTypeOf<MemoryCategory>().not.toBeAny();
  });

  it('All config types are exported', () => {
    expectTypeOf<OsaIConfig>().not.toBeAny();
    expectTypeOf<ModelConfig>().not.toBeAny();
    expectTypeOf<GatewayConfig>().not.toBeAny();
    expectTypeOf<SessionConfig>().not.toBeAny();
    expectTypeOf<SkillsConfig>().not.toBeAny();
    expectTypeOf<SecurityConfig>().not.toBeAny();
  });
});
