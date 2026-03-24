/**
 * MetricsCollector -- in-memory metrics: counters, gauges, histograms.
 *
 * All operations are synchronous and in-memory. No external dependencies.
 * Naming convention: osai.* prefix per NFR-033.
 */

export interface MetricPoint {
  name: string;
  value: number;
  timestamp: string;
  labels: Record<string, string>;
}

export interface HistogramData {
  count: number;
  min: number;
  max: number;
  avg: number;
  p50: number;
  p95: number;
  p99: number;
}

function labelKey(labels?: Record<string, string>): string {
  if (!labels || Object.keys(labels).length === 0) return '';
  const entries = Object.entries(labels).sort(([a], [b]) => a.localeCompare(b));
  return entries.map(([k, v]) => `${k}=${v}`).join(',');
}

export class MetricsCollector {
  private readonly counters = new Map<string, number>();
  private readonly gauges = new Map<string, number>();
  private readonly histograms = new Map<string, number[]>();
  private readonly allPoints: MetricPoint[] = [];

  increment(name: string, value: number = 1, labels?: Record<string, string>): void {
    const key = `${name}|${labelKey(labels)}`;
    const current = this.counters.get(key) ?? 0;
    const newValue = current + value;
    this.counters.set(key, newValue);
    this.allPoints.push({
      name,
      value: newValue,
      timestamp: new Date().toISOString(),
      labels: labels ?? {},
    });
  }

  gauge(name: string, value: number, labels?: Record<string, string>): void {
    const key = `${name}|${labelKey(labels)}`;
    this.gauges.set(key, value);
    this.allPoints.push({
      name,
      value,
      timestamp: new Date().toISOString(),
      labels: labels ?? {},
    });
  }

  observe(name: string, value: number, labels?: Record<string, string>): void {
    const key = `${name}|${labelKey(labels)}`;
    let bucket = this.histograms.get(key);
    if (!bucket) {
      bucket = [];
      this.histograms.set(key, bucket);
    }
    bucket.push(value);
    this.allPoints.push({
      name,
      value,
      timestamp: new Date().toISOString(),
      labels: labels ?? {},
    });
  }

  time(name: string, labels?: Record<string, string>): () => void {
    const start = performance.now();
    return () => {
      const elapsed = performance.now() - start;
      this.observe(name, elapsed, labels);
    };
  }

  getCounter(name: string, labels?: Record<string, string>): number {
    const key = `${name}|${labelKey(labels)}`;
    return this.counters.get(key) ?? 0;
  }

  getGauge(name: string, labels?: Record<string, string>): number {
    const key = `${name}|${labelKey(labels)}`;
    return this.gauges.get(key) ?? 0;
  }

  getHistogram(name: string, labels?: Record<string, string>): HistogramData {
    const key = `${name}|${labelKey(labels)}`;
    const values = this.histograms.get(key);

    if (!values || values.length === 0) {
      return { count: 0, min: 0, max: 0, avg: 0, p50: 0, p95: 0, p99: 0 };
    }

    const sorted = [...values].sort((a, b) => a - b);
    const count = sorted.length;
    const sum = sorted.reduce((acc, v) => acc + v, 0);

    return {
      count,
      min: sorted[0]!,
      max: sorted[count - 1]!,
      avg: sum / count,
      p50: percentile(sorted, 0.5),
      p95: percentile(sorted, 0.95),
      p99: percentile(sorted, 0.99),
    };
  }

  getAll(): MetricPoint[] {
    return [...this.allPoints];
  }

  clear(): void {
    this.counters.clear();
    this.gauges.clear();
    this.histograms.clear();
    this.allPoints.length = 0;
  }
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = p * (sorted.length - 1);
  const lower = Math.floor(idx);
  const upper = Math.ceil(idx);
  if (lower === upper) return sorted[lower]!;
  const fraction = idx - lower;
  return sorted[lower]! + fraction * (sorted[upper]! - sorted[lower]!);
}
