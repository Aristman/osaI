/**
 * @osai/agent -- Streaming barrel export
 *
 * Re-exports StreamProcessor and StreamAggregator
 * for stream processing and aggregation.
 */

export { StreamProcessor } from './StreamProcessor.js';
export type { StreamHandler, StreamOutput } from './StreamProcessor.js';

export { StreamAggregator } from './StreamAggregator.js';
