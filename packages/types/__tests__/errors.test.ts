import { describe, it, expect, expectTypeOf } from 'vitest';
import type { Severity, OsaIError, ModelError, SandboxError, SkillError } from '../src/errors.js';

describe('Error Types', () => {
  it('T002-03: All error types are exported', () => {
    expectTypeOf<OsaIError>().not.toBeAny();
    expectTypeOf<ModelError>().not.toBeAny();
    expectTypeOf<SandboxError>().not.toBeAny();
    expectTypeOf<SkillError>().not.toBeAny();
  });

  it('Severity has exactly 4 values', () => {
    const low: Severity = 'LOW';
    const medium: Severity = 'MEDIUM';
    const high: Severity = 'HIGH';
    const critical: Severity = 'CRITICAL';
    expect([low, medium, high, critical]).toEqual(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']);
  });

  it('OsaIError has code, message, severity', () => {
    type RequiredFields = 'code' | 'message' | 'severity';
    expectTypeOf<OsaIError>().toMatchTypeOf<{ [K in RequiredFields]: unknown }>();
  });

  it('ModelError extends OsaIError with provider, statusCode, retryable', () => {
    expectTypeOf<ModelError>().toMatchTypeOf<OsaIError>();
    type ModelFields = 'provider' | 'statusCode' | 'retryable';
    expectTypeOf<ModelError>().toMatchTypeOf<{
      [K in ModelFields]: unknown;
    }>();
  });

  it('SandboxError extends OsaIError with operation and optional path', () => {
    expectTypeOf<SandboxError>().toMatchTypeOf<OsaIError>();
    type SandboxFields = 'operation';
    expectTypeOf<SandboxError>().toMatchTypeOf<{
      [K in SandboxFields]: unknown;
    }>();
  });

  it('SkillError extends OsaIError with skillName and optional toolName', () => {
    expectTypeOf<SkillError>().toMatchTypeOf<OsaIError>();
    type SkillFields = 'skillName';
    expectTypeOf<SkillError>().toMatchTypeOf<{
      [K in SkillFields]: unknown;
    }>();
  });
});
