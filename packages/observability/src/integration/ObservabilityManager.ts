/**
 * ObservabilityManager -- facade that combines logging, metrics, and tracing.
 *
 * Provides convenience methods for common agent operations:
 * tool calls, model inference, agent loops.
 */

import { StructuredLogger } from '../logging/StructuredLogger.js';
import { MetricsCollector } from '../metrics/MetricsCollector.js';
import { Tracer } from '../tracing/Tracer.js';

export interface ObservabilityConfig {
  logger?: StructuredLogger;
  metrics?: MetricsCollector;
  tracer?: Tracer;
}

export class ObservabilityManager {
  private readonly logger: StructuredLogger;
  private readonly metrics: MetricsCollector;
  private readonly tracer: Tracer;
  private readonly startTime: number;

  constructor(config?: ObservabilityConfig) {
    this.logger = config?.logger ?? new StructuredLogger({ level: 'info', jsonFormat: true });
    this.metrics = config?.metrics ?? new MetricsCollector();
    this.tracer = config?.tracer ?? new Tracer({ serviceName: 'osai', enabled: true });
    this.startTime = Date.now();
  }

  getLogger(): StructuredLogger {
    return this.logger;
  }

  getMetrics(): MetricsCollector {
    return this.metrics;
  }

  getTracer(): Tracer {
    return this.tracer;
  }

  recordToolCall(toolName: string, duration: number, success: boolean): void {
    const labels = { tool: toolName };

    this.metrics.increment('osai.agent.tool_call.total', 1, labels);
    this.metrics.increment(
      `osai.agent.tool_call.${success ? 'success' : 'errors'}`,
      1,
      labels,
    );
    this.metrics.observe('osai.agent.tool_call.duration_ms', duration, labels);

    // Create tracing span
    const span = this.tracer.startSpan(`tool:${toolName}`, undefined, {
      tool: toolName,
      duration,
      success,
    });
    this.tracer.endSpan(span.id, success ? 'ok' : 'error');
  }

  recordModelInference(model: string, tokens: number, duration: number): void {
    const labels = { model };

    this.metrics.increment('osai.agent.llm.tokens_total', tokens, labels);
    this.metrics.observe('osai.agent.llm.duration_ms', duration, labels);

    // Create tracing span
    const span = this.tracer.startSpan('llm-inference', undefined, {
      model,
      tokens,
    });
    this.tracer.endSpan(span.id, 'ok');
  }

  recordAgentLoop(sessionId: string, duration: number, toolCount: number): void {
    const labels = { session_id: sessionId };

    this.metrics.observe('osai.agent.session.duration_ms', duration, labels);
    this.metrics.increment('osai.agent.tool_call.total', toolCount, labels);

    // Create tracing span
    const span = this.tracer.startSpan('agent-loop', undefined, {
      session_id: sessionId,
      tool_count: toolCount,
    });
    this.tracer.endSpan(span.id, 'ok');
  }

  getHealth(): {
    uptime: number;
    activeSpans: number;
    metricCount: number;
  } {
    return {
      uptime: Date.now() - this.startTime,
      activeSpans: this.tracer.getActiveSpans().length,
      metricCount: this.metrics.getAll().length,
    };
  }
}
