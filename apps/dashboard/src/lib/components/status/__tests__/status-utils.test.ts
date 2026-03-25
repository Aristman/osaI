/**
 * T-007 System Status Panel: Utility function tests.
 *
 * Tests for formatting helpers, color coding, health computation,
 * and trend detection used by status components.
 */
import { describe, it, expect } from 'vitest';
import {
  getUsageColorClass,
  getUsageBgClass,
  getUsageBarBgClass,
  getUsageBorderClass,
  getHealthColorClass,
  getHealthLabel,
  getHealthTextClass,
  formatBytes,
  formatUptime,
  formatCpuSpeed,
  formatPercent,
  computeHealthStatus,
  detectTrend,
  getTrendIndicator,
  type SystemInfo
} from '../status-utils';

// --- Test factory ---

function makeSystemInfo(overrides: Partial<SystemInfo> = {}): SystemInfo {
  return {
    cpu: { model: 'Test CPU', cores: 8, speed: 3600, usage: 45 },
    memory: { total: 16_388_608_000, used: 8_194_304_000, free: 8_194_304_000, usage: 50 },
    disk: { total: 500_000_000_000, used: 100_000_000_000, free: 400_000_000_000, usage: 20 },
    uptime: 90061,
    hostname: 'test-host',
    platform: 'linux',
    ...overrides
  };
}

// --- Color coding tests ---

describe('getUsageColorClass', () => {
  it('returns green class for usage < 70%', () => {
    expect(getUsageColorClass(0)).toBe('text-osai-success');
    expect(getUsageColorClass(50)).toBe('text-osai-success');
    expect(getUsageColorClass(69.9)).toBe('text-osai-success');
  });

  it('returns yellow class for usage 70-90%', () => {
    expect(getUsageColorClass(70)).toBe('text-osai-warning');
    expect(getUsageColorClass(80)).toBe('text-osai-warning');
    expect(getUsageColorClass(90)).toBe('text-osai-warning');
  });

  it('returns red class for usage > 90%', () => {
    expect(getUsageColorClass(90.1)).toBe('text-osai-error');
    expect(getUsageColorClass(100)).toBe('text-osai-error');
  });
});

describe('getUsageBgClass', () => {
  it('returns green bg for low usage', () => {
    expect(getUsageBgClass(30)).toBe('bg-osai-success');
  });

  it('returns yellow bg for medium usage', () => {
    expect(getUsageBgClass(75)).toBe('bg-osai-warning');
  });

  it('returns red bg for high usage', () => {
    expect(getUsageBgClass(95)).toBe('bg-osai-error');
  });
});

describe('getUsageBarBgClass', () => {
  it('returns light green bar bg for low usage', () => {
    expect(getUsageBarBgClass(30)).toBe('bg-green-500/20');
  });

  it('returns light yellow bar bg for medium usage', () => {
    expect(getUsageBarBgClass(75)).toBe('bg-amber-500/20');
  });

  it('returns light red bar bg for high usage', () => {
    expect(getUsageBarBgClass(95)).toBe('bg-red-500/20');
  });
});

describe('getUsageBorderClass', () => {
  it('returns green border for low usage', () => {
    expect(getUsageBorderClass(30)).toBe('border-osai-success');
  });

  it('returns yellow border for medium usage', () => {
    expect(getUsageBorderClass(75)).toBe('border-osai-warning');
  });

  it('returns red border for high usage', () => {
    expect(getUsageBorderClass(95)).toBe('border-osai-error');
  });
});

// --- Health status tests ---

describe('getHealthColorClass', () => {
  it('returns success color for healthy', () => {
    expect(getHealthColorClass('healthy')).toBe('bg-osai-success');
  });

  it('returns warning color for degraded', () => {
    expect(getHealthColorClass('degraded')).toBe('bg-osai-warning');
  });

  it('returns error color for error', () => {
    expect(getHealthColorClass('error')).toBe('bg-osai-error');
  });
});

describe('getHealthLabel', () => {
  it('returns correct labels', () => {
    expect(getHealthLabel('healthy')).toBe('Healthy');
    expect(getHealthLabel('degraded')).toBe('Degraded');
    expect(getHealthLabel('error')).toBe('Error');
  });
});

describe('getHealthTextClass', () => {
  it('returns correct text color classes', () => {
    expect(getHealthTextClass('healthy')).toBe('text-osai-success');
    expect(getHealthTextClass('degraded')).toBe('text-osai-warning');
    expect(getHealthTextClass('error')).toBe('text-osai-error');
  });
});

describe('computeHealthStatus', () => {
  it('returns healthy when all metrics are low', () => {
    const info = makeSystemInfo({
      cpu: { ...makeSystemInfo().cpu, usage: 30 },
      memory: { ...makeSystemInfo().memory, usage: 40 },
      disk: { ...makeSystemInfo().disk, usage: 50 }
    });
    expect(computeHealthStatus(info)).toBe('healthy');
  });

  it('returns degraded when any metric is between 85-95%', () => {
    const info = makeSystemInfo({
      cpu: { ...makeSystemInfo().cpu, usage: 87 },
      memory: { ...makeSystemInfo().memory, usage: 40 },
      disk: { ...makeSystemInfo().disk, usage: 50 }
    });
    expect(computeHealthStatus(info)).toBe('degraded');
  });

  it('returns error when any metric is > 95%', () => {
    const info = makeSystemInfo({
      cpu: { ...makeSystemInfo().cpu, usage: 30 },
      memory: { ...makeSystemInfo().memory, usage: 40 },
      disk: { ...makeSystemInfo().disk, usage: 96 }
    });
    expect(computeHealthStatus(info)).toBe('error');
  });

  it('returns error when CPU > 95%', () => {
    const info = makeSystemInfo({
      cpu: { ...makeSystemInfo().cpu, usage: 98 }
    });
    expect(computeHealthStatus(info)).toBe('error');
  });

  it('returns healthy at exactly 85% threshold (boundary)', () => {
    const info = makeSystemInfo({
      cpu: { ...makeSystemInfo().cpu, usage: 85 },
      memory: { ...makeSystemInfo().memory, usage: 85 },
      disk: { ...makeSystemInfo().disk, usage: 85 }
    });
    expect(computeHealthStatus(info)).toBe('healthy');
  });
});

// --- Formatting tests ---

describe('formatBytes', () => {
  it('formats zero bytes', () => {
    expect(formatBytes(0)).toBe('0 B');
  });

  it('formats bytes', () => {
    expect(formatBytes(500)).toBe('500 B');
  });

  it('formats kilobytes', () => {
    expect(formatBytes(1024)).toBe('1.00 KB');
  });

  it('formats megabytes', () => {
    expect(formatBytes(1048576)).toBe('1.00 MB');
  });

  it('formats gigabytes', () => {
    expect(formatBytes(1073741824)).toBe('1.00 GB');
  });

  it('formats terabytes', () => {
    expect(formatBytes(1099511627776)).toBe('1.00 TB');
  });

  it('formats mixed values', () => {
    // 16 GB
    expect(formatBytes(16388608000)).toBe('15.26 GB');
  });
});

describe('formatUptime', () => {
  it('formats zero uptime', () => {
    expect(formatUptime(0)).toBe('0m');
  });

  it('formats minutes only', () => {
    expect(formatUptime(300)).toBe('5m');
  });

  it('formats hours and minutes', () => {
    expect(formatUptime(3661)).toBe('1h 1m');
  });

  it('formats days, hours, minutes', () => {
    expect(formatUptime(90061)).toBe('1d 1h 1m');
  });

  it('formats very long uptime (exactly 3 days, no hours/minutes)', () => {
    expect(formatUptime(259200)).toBe('3d');
  });

  it('handles negative input', () => {
    expect(formatUptime(-1)).toBe('0m');
  });
});

describe('formatCpuSpeed', () => {
  it('formats MHz for values < 1000', () => {
    expect(formatCpuSpeed(800)).toBe('800 MHz');
  });

  it('formats GHz for values >= 1000', () => {
    expect(formatCpuSpeed(3600)).toBe('3.60 GHz');
  });

  it('formats exactly 1000 MHz', () => {
    expect(formatCpuSpeed(1000)).toBe('1.00 GHz');
  });
});

describe('formatPercent', () => {
  it('formats percentage', () => {
    expect(formatPercent(45.678)).toBe('45.7%');
  });

  it('formats zero', () => {
    expect(formatPercent(0)).toBe('0.0%');
  });

  it('formats 100 percent', () => {
    expect(formatPercent(100)).toBe('100.0%');
  });
});

// --- Trend detection tests ---

describe('detectTrend', () => {
  it('returns up when current > previous + threshold', () => {
    expect(detectTrend(55, 50)).toBe('up');
  });

  it('returns down when current < previous - threshold', () => {
    expect(detectTrend(45, 50)).toBe('down');
  });

  it('returns stable when within threshold', () => {
    expect(detectTrend(51, 50)).toBe('stable');
  });

  it('returns stable at exact threshold boundary', () => {
    expect(detectTrend(52, 50)).toBe('stable');
    expect(detectTrend(48, 50)).toBe('stable');
  });

  it('returns up for large increase', () => {
    expect(detectTrend(100, 10)).toBe('up');
  });
});

describe('getTrendIndicator', () => {
  it('returns up arrow', () => {
    expect(getTrendIndicator('up')).toBe('\u2191');
  });

  it('returns down arrow', () => {
    expect(getTrendIndicator('down')).toBe('\u2193');
  });

  it('returns right arrow for stable', () => {
    expect(getTrendIndicator('stable')).toBe('\u2192');
  });
});
