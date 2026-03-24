/**
 * Tracer -- in-memory distributed tracing with span hierarchy.
 *
 * V1 scope: own implementation without real OpenTelemetry SDK.
 * Produces OTLP-like JSON output for export.
 */

export interface Span {
  id: string;
  name: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  status: 'ok' | 'error';
  attributes: Record<string, unknown>;
  events: Array<{
    name: string;
    timestamp: number;
    attributes?: Record<string, unknown>;
  }>;
  parentId?: string;
}

export interface TracerOptions {
  serviceName?: string;
  enabled?: boolean;
}

let spanIdCounter = 0;

function generateSpanId(): string {
  spanIdCounter++;
  return `span-${spanIdCounter.toString(16).padStart(8, '0')}-${Date.now().toString(16)}`;
}

export class Tracer {
  private readonly serviceName: string;
  private readonly enabled: boolean;
  private readonly activeSpans = new Map<string, Span>();
  private readonly completedSpans: Span[] = [];

  constructor(options?: TracerOptions) {
    this.serviceName = options?.serviceName ?? 'unknown';
    this.enabled = options?.enabled ?? true;
  }

  startSpan(name: string, parentId?: string, attributes?: Record<string, unknown>): Span {
    if (!this.enabled) {
      return {
        id: 'noop',
        name,
        startTime: Date.now(),
        status: 'ok',
        attributes: attributes ?? {},
        events: [],
        parentId,
      };
    }

    const span: Span = {
      id: generateSpanId(),
      name,
      startTime: Date.now(),
      status: 'ok',
      attributes: attributes ?? {},
      events: [],
      parentId,
    };

    this.activeSpans.set(span.id, span);
    return span;
  }

  endSpan(
    spanId: string,
    status: 'ok' | 'error' = 'ok',
    attributes?: Record<string, unknown>,
  ): Span | undefined {
    const span = this.activeSpans.get(spanId);
    if (!span) return undefined;

    const endTime = Date.now();
    span.endTime = endTime;
    span.duration = endTime - span.startTime;
    span.status = status;

    if (attributes) {
      span.attributes = { ...span.attributes, ...attributes };
    }

    this.activeSpans.delete(spanId);
    this.completedSpans.push(span);
    return span;
  }

  addEvent(spanId: string, name: string, attributes?: Record<string, unknown>): void {
    const span = this.activeSpans.get(spanId);
    if (!span) return;

    span.events.push({
      name,
      timestamp: Date.now(),
      attributes,
    });
  }

  getCompletedSpans(filter?: { name?: string; status?: string }): Span[] {
    let result = [...this.completedSpans];

    if (filter?.name) {
      result = result.filter((s) => s.name === filter.name);
    }
    if (filter?.status) {
      result = result.filter((s) => s.status === filter.status);
    }

    return result;
  }

  getActiveSpans(): Span[] {
    return [...this.activeSpans.values()];
  }

  generateTraceId(): string {
    const bytes = new Uint8Array(16);
    if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
      crypto.getRandomValues(bytes);
    } else {
      for (let i = 0; i < 16; i++) {
        bytes[i] = Math.floor(Math.random() * 256);
      }
    }
    return Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }

  formatSpans(spans: Span[]): string {
    const formatted = spans.map((span) => ({
      traceId: this.generateTraceId(),
      spanId: span.id,
      parentSpanId: span.parentId ?? null,
      name: span.name,
      startTime: span.startTime,
      endTime: span.endTime ?? null,
      duration: span.duration ?? null,
      status: span.status,
      attributes: span.attributes,
      events: span.events,
      serviceName: this.serviceName,
    }));
    return JSON.stringify(formatted, null, 2);
  }
}
