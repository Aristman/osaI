/**
 * @osai/observability -- Observability package for osaI.
 *
 * V1 scope: own in-memory implementation of structured logging,
 * metrics collection, and distributed tracing. No external
 * OpenTelemetry SDK dependency.
 */

// Logging
export { StructuredLogger, SessionLogger } from './logging/StructuredLogger.js';
export type { LogEntry } from './logging/StructuredLogger.js';

// Metrics
export { MetricsCollector } from './metrics/MetricsCollector.js';
export type { MetricPoint, HistogramData } from './metrics/MetricsCollector.js';

// Tracing
export { Tracer } from './tracing/Tracer.js';
export type { Span } from './tracing/Tracer.js';

// Integration
export { ObservabilityManager } from './integration/ObservabilityManager.js';
export type { ObservabilityConfig } from './integration/ObservabilityManager.js';
