/**
 * T005-UNIT-001 / T005-UNIT-005: RiskBadge utility functions tests
 * Tests for risk level mapping, color coding, and label logic.
 */
import { describe, it, expect } from 'vitest';
import { getRiskLabel, getRiskColorClass, getRiskBgClass, getRiskBorderClass, getActionCategory } from '../components/permissions/permission-actions';

describe('getRiskLabel', () => {
  it('returns "Auto" for low risk', () => {
    expect(getRiskLabel('low')).toBe('Auto');
  });

  it('returns "Confirm" for medium risk', () => {
    expect(getRiskLabel('medium')).toBe('Confirm');
  });

  it('returns "Danger" for high risk', () => {
    expect(getRiskLabel('high')).toBe('Danger');
  });

  it('returns "Critical" for critical risk', () => {
    expect(getRiskLabel('critical')).toBe('Critical');
  });
});

describe('getRiskColorClass', () => {
  it('returns green text class for low risk', () => {
    expect(getRiskColorClass('low')).toBe('text-osai-success');
  });

  it('returns yellow text class for medium risk', () => {
    expect(getRiskColorClass('medium')).toBe('text-osai-warning');
  });

  it('returns red text class for high risk', () => {
    expect(getRiskColorClass('high')).toBe('text-osai-error');
  });

  it('returns red text class for critical risk', () => {
    expect(getRiskColorClass('critical')).toBe('text-osai-error');
  });
});

describe('getRiskBgClass', () => {
  it('returns green background class for low risk', () => {
    const cls = getRiskBgClass('low');
    expect(cls).toContain('bg-green-');
    expect(cls).toContain('/'); // TailwindCSS v4 opacity modifier
  });

  it('returns yellow background class for medium risk', () => {
    const cls = getRiskBgClass('medium');
    expect(cls).toContain('bg-yellow-');
    expect(cls).toContain('/'); // TailwindCSS v4 opacity modifier
  });

  it('returns red background class for high risk', () => {
    const cls = getRiskBgClass('high');
    expect(cls).toContain('bg-red-');
    expect(cls).toContain('/'); // TailwindCSS v4 opacity modifier
  });

  it('returns red background class for critical risk', () => {
    const cls = getRiskBgClass('critical');
    expect(cls).toContain('bg-red-');
    expect(cls).toContain('/'); // TailwindCSS v4 opacity modifier
  });
});

describe('getRiskBorderClass', () => {
  it('returns green border class for low risk', () => {
    const cls = getRiskBorderClass('low');
    expect(cls).toContain('border-green-');
  });

  it('returns yellow border class for medium risk', () => {
    const cls = getRiskBorderClass('medium');
    expect(cls).toContain('border-yellow-');
  });

  it('returns red border class for high risk', () => {
    const cls = getRiskBorderClass('high');
    expect(cls).toContain('border-red-');
  });

  it('returns red border class for critical risk', () => {
    const cls = getRiskBorderClass('critical');
    expect(cls).toContain('border-red-');
  });
});

describe('T005-UNIT-005: Risk level color coding', () => {
  it('low risk uses green color scheme', () => {
    expect(getRiskLabel('low')).toBe('Auto');
    expect(getRiskColorClass('low')).toContain('success');
    expect(getRiskBgClass('low')).toContain('green');
    expect(getRiskBorderClass('low')).toContain('green');
  });

  it('medium risk uses yellow color scheme', () => {
    expect(getRiskLabel('medium')).toBe('Confirm');
    expect(getRiskColorClass('medium')).toContain('warning');
    expect(getRiskBgClass('medium')).toContain('yellow');
    expect(getRiskBorderClass('medium')).toContain('yellow');
  });

  it('high risk uses red color scheme', () => {
    expect(getRiskLabel('high')).toBe('Danger');
    expect(getRiskColorClass('high')).toContain('error');
    expect(getRiskBgClass('high')).toContain('red');
    expect(getRiskBorderClass('high')).toContain('red');
  });

  it('critical risk uses red color scheme', () => {
    expect(getRiskLabel('critical')).toBe('Critical');
    expect(getRiskColorClass('critical')).toContain('error');
    expect(getRiskBgClass('critical')).toContain('red');
    expect(getRiskBorderClass('critical')).toContain('red');
  });
});

describe('getActionCategory', () => {
  it('maps action to category correctly', () => {
    expect(getActionCategory('read')).toBe('read');
    expect(getActionCategory('write')).toBe('write');
    expect(getActionCategory('execute')).toBe('exec');
    expect(getActionCategory('system')).toBe('system');
  });

  it('defaults to unknown for unrecognized action', () => {
    expect(getActionCategory('unknown_action')).toBe('unknown');
  });
});
