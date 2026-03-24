/**
 * AuditTrail unit tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { AuditTrail } from '../audit/AuditTrail.js';
import type { AuditFilter } from '../audit/types.js';

describe('AuditTrail', () => {
  let trail: AuditTrail;

  beforeEach(() => {
    trail = new AuditTrail(':memory:');
  });

  afterEach(() => {
    trail.close();
  });

  describe('record', () => {
    it('records an entry and returns its ID', () => {
      const id = trail.record({
        sessionId: 's1',
        action: 'permission_check',
        actor: 'system',
        category: 'permission',
        level: 'low',
        details: { tool: 'test' },
      });

      expect(id).toBeTruthy();
      expect(typeof id).toBe('string');
      expect(id.startsWith('audit-')).toBe(true);
    });

    it('auto-generates timestamp', () => {
      const before = new Date().toISOString();
      const id = trail.record({
        sessionId: 's1',
        action: 'test_action',
        actor: 'agent',
        category: 'tool',
        level: 'medium',
        details: {},
      });
      const entry = trail.getEntry(id);
      expect(entry).toBeDefined();
      expect(entry!.timestamp).toBeTruthy();
      const after = new Date().toISOString();
      expect(entry!.timestamp >= before).toBe(true);
      expect(entry!.timestamp <= after).toBe(true);
    });

    it('entry has immutable set to true', () => {
      const id = trail.record({
        sessionId: 's1',
        action: 'test',
        actor: 'system',
        category: 'security',
        level: 'high',
        details: {},
      });

      const entry = trail.getEntry(id);
      expect(entry!.immutable).toBe(true);
    });

    it('preserves details JSON', () => {
      const details = { tool: 'bash', params: { cmd: 'ls' }, nested: { a: 1 } };
      const id = trail.record({
        sessionId: 's1',
        action: 'tool_call',
        actor: 'agent',
        category: 'tool',
        level: 'low',
        details,
      });

      const entry = trail.getEntry(id);
      expect(entry!.details).toEqual(details);
    });

    it('throws after close', () => {
      trail.close();
      expect(() =>
        trail.record({
          sessionId: 's1',
          action: 'test',
          actor: 'system',
          category: 'security',
          level: 'low',
          details: {},
        }),
      ).toThrow('AuditTrail is closed');
    });
  });

  describe('getEntry', () => {
    it('returns entry by ID', () => {
      const id = trail.record({
        sessionId: 's1',
        action: 'test_action',
        actor: 'user',
        category: 'config',
        level: 'medium',
        details: { key: 'value' },
      });

      const entry = trail.getEntry(id);
      expect(entry).toBeDefined();
      expect(entry!.id).toBe(id);
      expect(entry!.sessionId).toBe('s1');
      expect(entry!.action).toBe('test_action');
      expect(entry!.actor).toBe('user');
      expect(entry!.category).toBe('config');
      expect(entry!.level).toBe('medium');
    });

    it('returns undefined for non-existent ID', () => {
      const entry = trail.getEntry('non-existent');
      expect(entry).toBeUndefined();
    });

    it('throws after close', () => {
      trail.close();
      expect(() => trail.getEntry('any-id')).toThrow('AuditTrail is closed');
    });
  });

  describe('query', () => {
    beforeEach(() => {
      trail.record({
        sessionId: 's1',
        action: 'perm_check',
        actor: 'system',
        category: 'permission',
        level: 'low',
        details: {},
      });
      trail.record({
        sessionId: 's1',
        action: 'tool_exec',
        actor: 'agent',
        category: 'tool',
        level: 'medium',
        details: {},
      });
      trail.record({
        sessionId: 's2',
        action: 'config_change',
        actor: 'user',
        category: 'config',
        level: 'high',
        details: {},
      });
      trail.record({
        sessionId: 's2',
        action: 'security_alert',
        actor: 'system',
        category: 'security',
        level: 'critical',
        details: {},
      });
    });

    it('returns all entries with no filter', () => {
      const results = trail.query();
      expect(results).toHaveLength(4);
    });

    it('filters by sessionId', () => {
      const results = trail.query({ sessionId: 's1' });
      expect(results).toHaveLength(2);
      expect(results.every((r) => r.sessionId === 's1')).toBe(true);
    });

    it('filters by category', () => {
      const results = trail.query({ category: 'tool' });
      expect(results).toHaveLength(1);
      expect(results[0]!.category).toBe('tool');
    });

    it('filters by level', () => {
      const results = trail.query({ level: 'critical' });
      expect(results).toHaveLength(1);
      expect(results[0]!.level).toBe('critical');
    });

    it('filters by multiple criteria', () => {
      const results = trail.query({ sessionId: 's1', level: 'low' });
      expect(results).toHaveLength(1);
      expect(results[0]!.sessionId).toBe('s1');
      expect(results[0]!.level).toBe('low');
    });

    it('limits results', () => {
      const results = trail.query({ limit: 2 });
      expect(results).toHaveLength(2);
    });

    it('returns empty for no matches', () => {
      const results = trail.query({ sessionId: 'non-existent' });
      expect(results).toHaveLength(0);
    });

    it('filters by date range', () => {
      // Use wide range to capture all entries
      const from = '2000-01-01T00:00:00.000Z';
      const to = '2099-12-31T23:59:59.999Z';
      const results = trail.query({ from, to });
      expect(results).toHaveLength(4);
    });

    it('throws after close', () => {
      trail.close();
      expect(() => trail.query()).toThrow('AuditTrail is closed');
    });
  });

  describe('getStats', () => {
    it('returns correct total', () => {
      trail.record({
        sessionId: 's1',
        action: 'a1',
        actor: 'system',
        category: 'permission',
        level: 'low',
        details: {},
      });
      trail.record({
        sessionId: 's1',
        action: 'a2',
        actor: 'agent',
        category: 'tool',
        level: 'medium',
        details: {},
      });
      trail.record({
        sessionId: 's2',
        action: 'a3',
        actor: 'system',
        category: 'permission',
        level: 'high',
        details: {},
      });

      const stats = trail.getStats();
      expect(stats.total).toBe(3);
    });

    it('returns correct byCategory', () => {
      trail.record({
        sessionId: 's1',
        action: 'a1',
        actor: 'system',
        category: 'permission',
        level: 'low',
        details: {},
      });
      trail.record({
        sessionId: 's1',
        action: 'a2',
        actor: 'agent',
        category: 'tool',
        level: 'medium',
        details: {},
      });
      trail.record({
        sessionId: 's2',
        action: 'a3',
        actor: 'system',
        category: 'permission',
        level: 'high',
        details: {},
      });

      const stats = trail.getStats();
      expect(stats.byCategory['permission']).toBe(2);
      expect(stats.byCategory['tool']).toBe(1);
    });

    it('returns correct byLevel', () => {
      trail.record({
        sessionId: 's1',
        action: 'a1',
        actor: 'system',
        category: 'permission',
        level: 'low',
        details: {},
      });
      trail.record({
        sessionId: 's1',
        action: 'a2',
        actor: 'agent',
        category: 'tool',
        level: 'low',
        details: {},
      });
      trail.record({
        sessionId: 's2',
        action: 'a3',
        actor: 'system',
        category: 'security',
        level: 'critical',
        details: {},
      });

      const stats = trail.getStats();
      expect(stats.byLevel['low']).toBe(2);
      expect(stats.byLevel['critical']).toBe(1);
    });

    it('last24h counts recent entries', () => {
      trail.record({
        sessionId: 's1',
        action: 'a1',
        actor: 'system',
        category: 'permission',
        level: 'low',
        details: {},
      });
      trail.record({
        sessionId: 's2',
        action: 'a2',
        actor: 'agent',
        category: 'tool',
        level: 'medium',
        details: {},
      });

      const stats = trail.getStats();
      expect(stats.last24h).toBe(2);
    });

    it('returns zero stats for empty trail', () => {
      const stats = trail.getStats();
      expect(stats.total).toBe(0);
      expect(stats.byCategory).toEqual({});
      expect(stats.byLevel).toEqual({});
      expect(stats.last24h).toBe(0);
    });

    it('throws after close', () => {
      trail.close();
      expect(() => trail.getStats()).toThrow('AuditTrail is closed');
    });
  });

  describe('immutability', () => {
    it('readonly immutable field cannot be changed at type level', () => {
      // This test verifies the type constraint:
      // AuditEntry.immutable is `true` (literal type), not boolean.
      const id = trail.record({
        sessionId: 's1',
        action: 'test',
        actor: 'system',
        category: 'security',
        level: 'low',
        details: {},
      });
      const entry = trail.getEntry(id)!;
      // TypeScript would not allow: entry.immutable = false;
      expect(entry.immutable).toBe(true);
    });

    it('no public methods to update or delete entries exist', () => {
      const id = trail.record({
        sessionId: 's1',
        action: 'test',
        actor: 'system',
        category: 'security',
        level: 'low',
        details: {},
      });

      // Verify the entry exists
      expect(trail.getEntry(id)).toBeDefined();

      // AuditTrail does not expose update/delete methods.
      // This is a design constraint verified by API surface inspection.
      const api = Object.getOwnPropertyNames(AuditTrail.prototype);
      expect(api).not.toContain('update');
      expect(api).not.toContain('delete');
      expect(api).not.toContain('remove');
      expect(api).not.toContain('modify');
    });
  });

  describe('close', () => {
    it('closes the trail', () => {
      expect(trail.isClosed()).toBe(false);
      trail.close();
      expect(trail.isClosed()).toBe(true);
    });

    it('double close is safe', () => {
      trail.close();
      trail.close();
      expect(trail.isClosed()).toBe(true);
    });
  });
});
