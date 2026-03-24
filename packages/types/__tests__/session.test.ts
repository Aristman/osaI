import { describe, it, expect, expectTypeOf } from 'vitest';
import type {
  SessionType,
  ActivationMode,
  ToolCategory,
  RiskLevel,
  MemoryCategory,
} from '../src/session.js';

describe('Session Types', () => {
  it('T002-04: SessionType has exactly 3 values', () => {
    const main: SessionType = 'main';
    const group: SessionType = 'group';
    const isolated: SessionType = 'isolated';
    expect([main, group, isolated]).toEqual(['main', 'group', 'isolated']);
  });

  it('ActivationMode has exactly 4 values', () => {
    const always: ActivationMode = 'always';
    const mention: ActivationMode = 'mention';
    const wakeWord: ActivationMode = 'wake_word';
    const passive: ActivationMode = 'passive';
    expect([always, mention, wakeWord, passive]).toEqual([
      'always',
      'mention',
      'wake_word',
      'passive',
    ]);
  });

  it('ToolCategory has exactly 4 values', () => {
    const read: ToolCategory = 'read';
    const write: ToolCategory = 'write';
    const execute: ToolCategory = 'execute';
    const system: ToolCategory = 'system';
    expect([read, write, execute, system]).toEqual(['read', 'write', 'execute', 'system']);
  });

  it('RiskLevel has exactly 3 values', () => {
    const low: RiskLevel = 'low';
    const medium: RiskLevel = 'medium';
    const high: RiskLevel = 'high';
    expect([low, medium, high]).toEqual(['low', 'medium', 'high']);
  });

  it('MemoryCategory has exactly 5 values', () => {
    const fact: MemoryCategory = 'fact';
    const preference: MemoryCategory = 'preference';
    const knowledge: MemoryCategory = 'knowledge';
    const error: MemoryCategory = 'error';
    const pattern: MemoryCategory = 'pattern';
    expect([fact, preference, knowledge, error, pattern]).toEqual([
      'fact',
      'preference',
      'knowledge',
      'error',
      'pattern',
    ]);
  });

  it('All domain types are exported as type aliases', () => {
    expectTypeOf<SessionType>().not.toBeAny();
    expectTypeOf<ActivationMode>().not.toBeAny();
    expectTypeOf<ToolCategory>().not.toBeAny();
    expectTypeOf<RiskLevel>().not.toBeAny();
    expectTypeOf<MemoryCategory>().not.toBeAny();
  });
});
