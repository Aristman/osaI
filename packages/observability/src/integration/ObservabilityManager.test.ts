import { describe, it, expect, beforeEach } from 'vitest';
import { ObservabilityManager } from './ObservabilityManager.js';
import { StructuredLogger } from '../logging/StructuredLogger.js';
import { MetricsCollector } from '../metrics/MetricsCollector.js';
import { Tracer } from '../tracing/Tracer.js';

describe('ObservabilityManager', () => {
  let manager: ObservabilityManager;

  beforeEach(() => {
    manager = new ObservabilityManager();
  });

  describe('initialization', () => {
    it('should create with default components', () => {
      expect(manager.getLogger()).toBeDefined();
      expect(manager.getMetrics()).toBeDefined();
      expect(manager.getTracer()).toBeDefined();
    });

    it('should accept custom components', () => {
      const customLogger = new StructuredLogger({ level: 'debug', jsonFormat: false });
      const customMetrics = new MetricsCollector();
      const customTracer = new Tracer({ enabled: false });

      const customManager = new ObservabilityManager({
        logger: customLogger,
        metrics: customMetrics,
        tracer: customTracer,
      });

      expect(customManager.getLogger()).toBe(customLogger);
      expect(customManager.getMetrics()).toBe(customMetrics);
      expect(customManager.getTracer()).toBe(customTracer);
    });
  });

  describe('recordToolCall', () => {
    it('should record tool call metrics', () => {
      manager.recordToolCall('bash', 150, true);

      const metrics = manager.getMetrics();
      expect(metrics.getCounter('osai.agent.tool_call.total', { tool: 'bash' })).toBe(1);
      expect(metrics.getCounter('osai.agent.tool_call.success', { tool: 'bash' })).toBe(1);
      expect(metrics.getCounter('osai.agent.tool_call.errors', { tool: 'bash' })).toBe(0);

      const hist = metrics.getHistogram('osai.agent.tool_call.duration_ms', { tool: 'bash' });
      expect(hist.count).toBe(1);
    });

    it('should record failed tool calls', () => {
      manager.recordToolCall('python', 300, false);

      const metrics = manager.getMetrics();
      expect(metrics.getCounter('osai.agent.tool_call.total', { tool: 'python' })).toBe(1);
      expect(metrics.getCounter('osai.agent.tool_call.errors', { tool: 'python' })).toBe(1);
      expect(metrics.getCounter('osai.agent.tool_call.success', { tool: 'python' })).toBe(0);
    });

    it('should accumulate multiple tool calls', () => {
      manager.recordToolCall('bash', 100, true);
      manager.recordToolCall('bash', 200, true);
      manager.recordToolCall('bash', 50, false);

      const metrics = manager.getMetrics();
      expect(metrics.getCounter('osai.agent.tool_call.total', { tool: 'bash' })).toBe(3);
      expect(metrics.getCounter('osai.agent.tool_call.success', { tool: 'bash' })).toBe(2);
      expect(metrics.getCounter('osai.agent.tool_call.errors', { tool: 'bash' })).toBe(1);
    });

    it('should create tracing span for tool call', () => {
      manager.recordToolCall('bash', 100, true);

      const tracer = manager.getTracer();
      const completed = tracer.getCompletedSpans();
      const toolSpan = completed.find((s) => s.name === 'tool:bash');

      expect(toolSpan).toBeDefined();
      expect(toolSpan?.status).toBe('ok');
      expect(toolSpan?.duration).toBeDefined();
    });
  });

  describe('recordModelInference', () => {
    it('should record model inference metrics', () => {
      manager.recordModelInference('claude-3', 1500, 2000);

      const metrics = manager.getMetrics();
      expect(metrics.getCounter('osai.agent.llm.tokens_total', { model: 'claude-3' })).toBe(1500);
      expect(
        metrics.getHistogram('osai.agent.llm.duration_ms', { model: 'claude-3' }).count,
      ).toBe(1);
    });

    it('should create tracing span for model inference', () => {
      manager.recordModelInference('gpt-4', 500, 1000);

      const tracer = manager.getTracer();
      const completed = tracer.getCompletedSpans();
      const inferenceSpan = completed.find((s) => s.name === 'llm-inference');

      expect(inferenceSpan).toBeDefined();
      expect(inferenceSpan?.attributes).toEqual(
        expect.objectContaining({ model: 'gpt-4', tokens: 500 }),
      );
    });
  });

  describe('recordAgentLoop', () => {
    it('should record agent loop metrics', () => {
      manager.recordAgentLoop('session-1', 5000, 10);

      const metrics = manager.getMetrics();
      expect(
        metrics.getHistogram('osai.agent.session.duration_ms', { session_id: 'session-1' })
          .count,
      ).toBe(1);
      expect(
        metrics.getCounter('osai.agent.tool_call.total', { session_id: 'session-1' }),
      ).toBe(10);
    });

    it('should create tracing span for agent loop', () => {
      manager.recordAgentLoop('session-x', 3000, 5);

      const tracer = manager.getTracer();
      const completed = tracer.getCompletedSpans();
      const loopSpan = completed.find((s) => s.name === 'agent-loop');

      expect(loopSpan).toBeDefined();
      expect(loopSpan?.attributes).toEqual(
        expect.objectContaining({ session_id: 'session-x', tool_count: 5 }),
      );
    });
  });

  describe('getHealth', () => {
    it('should return health info with uptime', () => {
      const health = manager.getHealth();
      expect(health.uptime).toBeGreaterThanOrEqual(0);
    });

    it('should report active spans count', () => {
      manager.getTracer().startSpan('active-span');
      const health = manager.getHealth();
      expect(health.activeSpans).toBeGreaterThanOrEqual(1);
    });

    it('should report metric count', () => {
      manager.recordToolCall('bash', 100, true);
      const health = manager.getHealth();
      expect(health.metricCount).toBeGreaterThan(0);
    });
  });
});
