/**
 * T005-UNIT-001: Permission prompt displays request data
 * Tests for permission prompt data rendering and formatting utilities.
 */
import { describe, it, expect } from 'vitest';
import { formatParams, truncateParams, getPermissionSummary } from '../components/permissions/permission-actions';
import type { PendingPermission } from '../stores/permissions';

describe('formatParams', () => {
  it('formats simple object as JSON', () => {
    const result = formatParams({ command: 'ls -la' });
    expect(result).toContain('"command"');
    expect(result).toContain('"ls -la"');
  });

  it('formats nested object', () => {
    const result = formatParams({ config: { key: 'value', nested: { deep: true } } });
    expect(result).toContain('"config"');
    expect(result).toContain('"nested"');
  });

  it('formats empty object', () => {
    const result = formatParams({});
    expect(result).toBe('{}');
  });

  it('formats array params', () => {
    const result = formatParams({ files: ['a.txt', 'b.txt'] });
    expect(result).toContain('"a.txt"');
    expect(result).toContain('"b.txt"');
  });
});

describe('truncateParams', () => {
  it('returns full string when within limit', () => {
    const short = '{"key": "value"}';
    expect(truncateParams(short, 100)).toBe(short);
  });

  it('truncates long strings with ellipsis', () => {
    const long = JSON.stringify({ key: 'x'.repeat(200) });
    const truncated = truncateParams(long, 100);
    expect(truncated.length).toBeLessThanOrEqual(103); // 100 + '...'
    expect(truncated.endsWith('...')).toBe(true);
  });

  it('returns empty string for empty input', () => {
    expect(truncateParams('', 100)).toBe('');
  });
});

describe('getPermissionSummary', () => {
  const lowRiskRequest: PendingPermission = {
    requestId: 'req-1',
    sessionId: 's1',
    toolName: 'filesystem',
    action: 'read',
    params: { path: '/tmp/data.json' },
    riskLevel: 'low',
    description: 'Read file /tmp/data.json',
    timestamp: '2026-01-01T00:00:00Z'
  };

  const highRiskRequest: PendingPermission = {
    requestId: 'req-2',
    sessionId: 's1',
    toolName: 'shell',
    action: 'execute',
    params: { command: 'rm -rf /tmp' },
    riskLevel: 'high',
    description: 'Remove directory',
    timestamp: '2026-01-01T00:00:00Z'
  };

  it('T005-UNIT-001: returns summary with tool name, action, and description', () => {
    const summary = getPermissionSummary(lowRiskRequest);
    expect(summary.toolName).toBe('filesystem');
    expect(summary.action).toBe('read');
    expect(summary.description).toBe('Read file /tmp/data.json');
  });

  it('includes risk level in summary', () => {
    const summary = getPermissionSummary(lowRiskRequest);
    expect(summary.riskLevel).toBe('low');
    expect(summary.riskLabel).toBe('Auto');
  });

  it('includes formatted params in summary', () => {
    const summary = getPermissionSummary(lowRiskRequest);
    expect(summary.params).toContain('/tmp/data.json');
  });

  it('correctly identifies high risk', () => {
    const summary = getPermissionSummary(highRiskRequest);
    expect(summary.riskLevel).toBe('high');
    expect(summary.riskLabel).toBe('Danger');
  });
});

describe('T005-UNIT-001: Prompt modal displays request data', () => {
  it('extracts all required fields from pending permission', () => {
    const request: PendingPermission = {
      requestId: 'req-123',
      sessionId: 'session-abc',
      toolName: 'filesystem',
      action: 'write',
      params: { path: '/output.txt', content: 'test data' },
      riskLevel: 'medium',
      description: 'Write file to disk',
      timestamp: '2026-03-25T12:00:00Z'
    };

    const summary = getPermissionSummary(request);

    // All fields visible and correct
    expect(summary.toolName).toBe('filesystem');
    expect(summary.action).toBe('write');
    expect(summary.description).toBe('Write file to disk');
    expect(summary.riskLevel).toBe('medium');
    expect(summary.riskLabel).toBe('Confirm');
    expect(summary.requestId).toBe('req-123');
    expect(summary.params).toContain('/output.txt');
    expect(summary.params).toContain('test data');
  });
});
