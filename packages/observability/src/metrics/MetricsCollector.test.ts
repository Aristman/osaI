import { describe, it, expect, beforeEach } from 'vitest';
import { MetricsCollector } from './MetricsCollector.js';

describe('MetricsCollector', () => {
  let collector: MetricsCollector;

  beforeEach(() => {
    collector = new MetricsCollector();
  });

  describe('counters', () => {
    it('should increment counter by default value of 1', () => {
      collector.increment('requests_total');
      expect(collector.getCounter('requests_total')).toBe(1);
    });

    it('should increment counter by custom value', () => {
      collector.increment('bytes', 42);
      collector.increment('bytes', 8);
      expect(collector.getCounter('bytes')).toBe(50);
    });

    it('should track counters with different labels separately', () => {
      collector.increment('http_requests', 1, { method: 'GET', path: '/api' });
      collector.increment('http_requests', 3, { method: 'POST', path: '/api' });
      collector.increment('http_requests', 2, { method: 'GET', path: '/api' });

      expect(collector.getCounter('http_requests', { method: 'GET', path: '/api' })).toBe(3);
      expect(collector.getCounter('http_requests', { method: 'POST', path: '/api' })).toBe(3);
    });

    it('should return 0 for non-existent counter', () => {
      expect(collector.getCounter('nonexistent')).toBe(0);
    });
  });

  describe('gauges', () => {
    it('should set gauge value', () => {
      collector.gauge('temperature', 36.6);
      expect(collector.getGauge('temperature')).toBe(36.6);
    });

    it('should overwrite gauge value', () => {
      collector.gauge('active_sessions', 5);
      collector.gauge('active_sessions', 8);
      expect(collector.getGauge('active_sessions')).toBe(8);
    });

    it('should track gauges with labels separately', () => {
      collector.gauge('cpu_usage', 45.2, { host: 'server1' });
      collector.gauge('cpu_usage', 78.1, { host: 'server2' });

      expect(collector.getGauge('cpu_usage', { host: 'server1' })).toBe(45.2);
      expect(collector.getGauge('cpu_usage', { host: 'server2' })).toBe(78.1);
    });

    it('should return 0 for non-existent gauge', () => {
      expect(collector.getGauge('nonexistent')).toBe(0);
    });
  });

  describe('histograms', () => {
    it('should record histogram observations', () => {
      collector.observe('duration_ms', 100);
      collector.observe('duration_ms', 200);
      collector.observe('duration_ms', 300);

      const data = collector.getHistogram('duration_ms');
      expect(data.count).toBe(3);
      expect(data.min).toBe(100);
      expect(data.max).toBe(300);
      expect(data.avg).toBe(200);
    });

    it('should calculate percentiles correctly', () => {
      // 100 observations: 1..100
      for (let i = 1; i <= 100; i++) {
        collector.observe('latency', i);
      }

      const data = collector.getHistogram('latency');
      expect(data.count).toBe(100);
      expect(data.p50).toBeCloseTo(50.5, 1);
      expect(data.p95).toBeCloseTo(95.05, 1);
      expect(data.p99).toBeCloseTo(99.01, 1);
    });

    it('should track histograms with labels separately', () => {
      collector.observe('response_time', 50, { endpoint: '/health' });
      collector.observe('response_time', 150, { endpoint: '/api/data' });
      collector.observe('response_time', 200, { endpoint: '/api/data' });

      const healthData = collector.getHistogram('response_time', { endpoint: '/health' });
      expect(healthData.count).toBe(1);

      const apiData = collector.getHistogram('response_time', { endpoint: '/api/data' });
      expect(apiData.count).toBe(2);
      expect(apiData.avg).toBe(175);
    });

    it('should return empty histogram for non-existent', () => {
      const data = collector.getHistogram('nonexistent');
      expect(data.count).toBe(0);
      expect(data.min).toBe(0);
      expect(data.max).toBe(0);
      expect(data.avg).toBe(0);
      expect(data.p50).toBe(0);
      expect(data.p95).toBe(0);
      expect(data.p99).toBe(0);
    });
  });

  describe('timer', () => {
    it('should return a stop function', () => {
      const stop = collector.time('operation_ms');
      expect(typeof stop).toBe('function');
    });

    it('should record elapsed time when stop is called', () => {
      const stop = collector.time('operation_ms');
      stop();

      const data = collector.getHistogram('operation_ms');
      expect(data.count).toBe(1);
      expect(data.min).toBeGreaterThanOrEqual(0);
    });

    it('should record timer with labels', () => {
      const stop = collector.time('tool_duration', { tool: 'bash' });
      stop();

      const data = collector.getHistogram('tool_duration', { tool: 'bash' });
      expect(data.count).toBe(1);
    });
  });

  describe('getAll', () => {
    it('should return all metric points', () => {
      collector.increment('counter_a');
      collector.gauge('gauge_b', 42);
      collector.observe('hist_c', 100);

      const all = collector.getAll();
      expect(all.length).toBeGreaterThanOrEqual(3);

      const names = all.map((m) => m.name);
      expect(names).toContain('counter_a');
      expect(names).toContain('gauge_b');
      expect(names).toContain('hist_c');
    });

    it('should include timestamps in metric points', () => {
      collector.increment('test_metric');

      const all = collector.getAll();
      const point = all.find((m) => m.name === 'test_metric');
      expect(point).toBeDefined();
      expect(point?.timestamp).toBeDefined();
    });

    it('should include labels in metric points', () => {
      collector.increment('labeled', 1, { env: 'test' });

      const all = collector.getAll();
      const point = all.find((m) => m.name === 'labeled');
      expect(point?.labels).toEqual({ env: 'test' });
    });
  });

  describe('clear', () => {
    it('should clear all metrics', () => {
      collector.increment('a');
      collector.gauge('b', 1);
      collector.observe('c', 1);

      collector.clear();

      expect(collector.getCounter('a')).toBe(0);
      expect(collector.getGauge('b')).toBe(0);
      expect(collector.getHistogram('c').count).toBe(0);
      expect(collector.getAll()).toHaveLength(0);
    });
  });
});
