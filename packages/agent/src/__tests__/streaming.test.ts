/**
 * Unit tests for @osai/agent streaming module
 *
 * Tests StreamProcessor and StreamAggregator:
 * chunk processing, block formatting, tool call parsing,
 * handler subscription, and response aggregation.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { StreamProcessor } from '../streaming/StreamProcessor.js';
import type { StreamOutput } from '../streaming/StreamProcessor.js';
import { StreamAggregator } from '../streaming/StreamAggregator.js';
import type { StreamChunk } from '../types.js';

// ---------------------------------------------------------------------------
// StreamProcessor
// ---------------------------------------------------------------------------

describe('StreamProcessor', () => {
  let processor: StreamProcessor;

  beforeEach(() => {
    processor = new StreamProcessor('test-session-1');
  });

  // Test 1: Process text chunk -- BlockMessage formed
  it('process text chunk -- forms BlockMessage', () => {
    const chunk: StreamChunk = {
      type: 'content',
      content: 'Hello, world!',
    };

    const outputs = processor.processChunk(chunk);

    expect(outputs).toHaveLength(0); // accumulated, not emitted until flush/done
  });

  // Test 2: Parse tool call -- ToolCallData parsed
  it('parse tool call -- ToolCallData parsed correctly', () => {
    const toolCallData = {
      id: 'tc-001',
      name: 'read_file',
      parameters: { path: '/tmp/test.txt' },
    };

    const result = processor.parseToolCall(toolCallData);

    expect(result).not.toBeNull();
    expect(result!.id).toBe('tc-001');
    expect(result!.name).toBe('read_file');
    expect(result!.parameters).toEqual({ path: '/tmp/test.txt' });
  });

  // Test 3: Format code block -- code block message
  it('format code block -- returns code block message', () => {
    const block = processor.formatBlock('code', 'console.log("hi")', 'typescript');

    expect(block.type).toBe('code');
    expect(block.content).toBe('console.log("hi")');
    expect(block.language).toBe('typescript');
  });

  // Test 4: Tool stream message -- tool_stream message
  it('format tool stream -- returns ToolStreamMessage', () => {
    const msg = processor.formatToolStream('filesystem', 'read', { path: '/tmp/file.txt' }, 75);

    expect(msg.tool).toBe('filesystem');
    expect(msg.action).toBe('read');
    expect(msg.chunk).toEqual({ path: '/tmp/file.txt' });
    expect(msg.progress).toBe(75);
  });

  // Test 5: Multiple chunks in sequence -- all processed
  it('multiple chunks in sequence -- all processed', () => {
    const outputs: StreamOutput[] = [];

    processor.onOutput((output) => outputs.push(output));

    processor.processChunk({ type: 'content', content: 'Hello ' });
    processor.processChunk({ type: 'content', content: 'world' });
    processor.processChunk({ type: 'done' });

    // Should have: block (flushed on done) + done message
    expect(outputs.length).toBeGreaterThanOrEqual(2);

    const blockOutput = outputs.find((o) => o.type === 'block');
    expect(blockOutput).toBeDefined();
    if (blockOutput && blockOutput.type === 'block') {
      expect(blockOutput.block.content).toBe('Hello world');
    }

    const doneOutput = outputs.find((o) => o.type === 'done');
    expect(doneOutput).toBeDefined();
    if (doneOutput && doneOutput.type === 'done') {
      expect(doneOutput.sessionId).toBe('test-session-1');
    }
  });

  // Test 6: Empty chunk handling -- no errors
  it('empty chunk handling -- no errors thrown', () => {
    const emptyChunk: StreamChunk = { type: 'content', content: '' };

    expect(() => processor.processChunk(emptyChunk)).not.toThrow();
    expect(() => processor.flush()).not.toThrow();
  });

  // Test 7: Malformed chunk handling -- error caught
  it('malformed chunk handling -- error output emitted', () => {
    const outputs: StreamOutput[] = [];

    processor.onOutput((output) => outputs.push(output));

    // A chunk with type 'error' should emit an error output
    processor.processChunk({ type: 'error', error: 'LLM connection failed' });

    const errorOutput = outputs.find((o) => o.type === 'error');
    expect(errorOutput).toBeDefined();
    if (errorOutput && errorOutput.type === 'error') {
      expect(errorOutput.message).toBe('LLM connection failed');
      expect(errorOutput.sessionId).toBe('test-session-1');
    }
  });

  // Test 8: Flush returns accumulated data
  it('flush returns accumulated data', () => {
    processor.processChunk({ type: 'content', content: 'Partial text' });

    const flushed = processor.flush();

    expect(flushed.length).toBeGreaterThanOrEqual(1);
    const blockOutput = flushed.find((o) => o.type === 'block');
    expect(blockOutput).toBeDefined();
    if (blockOutput && blockOutput.type === 'block') {
      expect(blockOutput.block.content).toBe('Partial text');
    }
  });

  // Test 13: onOutput handler receives all outputs
  it('onOutput handler receives all outputs', () => {
    const received: StreamOutput[] = [];
    processor.onOutput((output) => received.push(output));

    processor.processChunk({ type: 'content', content: 'Data ' });
    processor.processChunk({ type: 'content', content: 'more' });
    processor.processChunk({ type: 'done' });

    // Block + done at minimum
    expect(received.length).toBeGreaterThanOrEqual(2);
    expect(received.some((o) => o.type === 'block')).toBe(true);
    expect(received.some((o) => o.type === 'done')).toBe(true);
  });

  // Test 14: Unsubscribe stops receiving outputs
  it('unsubscribe stops receiving outputs', () => {
    const received: StreamOutput[] = [];
    const unsubscribe = processor.onOutput((output) => received.push(output));

    processor.processChunk({ type: 'content', content: 'Before' });
    const countBefore = received.length;

    unsubscribe();

    processor.processChunk({ type: 'content', content: 'After' });
    processor.processChunk({ type: 'done' });

    // After unsubscribing, no new outputs should be received
    expect(received.length).toBe(countBefore);
  });

  // Test: tool_call chunk emits tool_call output
  it('tool_call chunk emits tool_call output', () => {
    const received: StreamOutput[] = [];
    processor.onOutput((output) => received.push(output));

    processor.processChunk({
      type: 'tool_call',
      toolCall: {
        id: 'tc-002',
        name: 'write_file',
        parameters: { path: '/tmp/out.txt', content: 'data' },
      },
    });

    const toolOutput = received.find((o) => o.type === 'tool_call');
    expect(toolOutput).toBeDefined();
    if (toolOutput && toolOutput.type === 'tool_call') {
      expect(toolOutput.toolCall.name).toBe('write_file');
      expect(toolOutput.sessionId).toBe('test-session-1');
    }
  });

  // Test: parseToolCall returns null for incomplete data
  it('parseToolCall returns null when name is missing', () => {
    const result = processor.parseToolCall({ id: 'tc-003' });
    expect(result).toBeNull();
  });

  // Test: formatBlock with text type
  it('format text block -- no language field', () => {
    const block = processor.formatBlock('text', 'Plain text message');
    expect(block.type).toBe('text');
    expect(block.content).toBe('Plain text message');
    expect(block.language).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// StreamAggregator
// ---------------------------------------------------------------------------

describe('StreamAggregator', () => {
  let aggregator: StreamAggregator;

  beforeEach(() => {
    aggregator = new StreamAggregator();
  });

  // Test 9: StreamAggregator collects content chunks
  it('collects content chunks', () => {
    aggregator.processChunk({ type: 'content', content: 'Hello ' });
    aggregator.processChunk({ type: 'content', content: 'world' });

    expect(aggregator.getContent()).toBe('Hello world');
  });

  // Test 10: StreamAggregator collects tool calls
  it('collects tool calls', () => {
    aggregator.processChunk({
      type: 'tool_call',
      toolCall: {
        id: 'tc-100',
        name: 'read_file',
        parameters: { path: '/tmp/a.txt' },
      },
    });

    const toolCalls = aggregator.getToolCalls();
    expect(toolCalls).toHaveLength(1);
    expect(toolCalls[0]!.id).toBe('tc-100');
    expect(toolCalls[0]!.name).toBe('read_file');
  });

  // Test 11: StreamAggregator getResponse returns ModelResponse
  it('getResponse returns ModelResponse', () => {
    aggregator.processChunk({ type: 'content', content: 'Response text' });
    aggregator.processChunk({
      type: 'done',
      usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
    });

    const response = aggregator.getResponse();
    expect(response.content).toBe('Response text');
    expect(response.usage).toEqual({
      promptTokens: 10,
      completionTokens: 5,
      totalTokens: 15,
    });
    expect(response.finishReason).toBe('stop');
  });

  // Test 12: StreamAggregator reset clears state
  it('reset clears state', () => {
    aggregator.processChunk({ type: 'content', content: 'Will be cleared' });
    aggregator.processChunk({
      type: 'tool_call',
      toolCall: { id: 'tc-200', name: 'test', parameters: {} },
    });

    aggregator.reset();

    expect(aggregator.getContent()).toBe('');
    expect(aggregator.getToolCalls()).toHaveLength(0);
    expect(aggregator.isComplete()).toBe(false);
  });

  // Test: isComplete returns false until done chunk
  it('isComplete returns false until done chunk received', () => {
    expect(aggregator.isComplete()).toBe(false);

    aggregator.processChunk({ type: 'content', content: 'data' });
    expect(aggregator.isComplete()).toBe(false);

    aggregator.processChunk({ type: 'done' });
    expect(aggregator.isComplete()).toBe(true);
  });

  // Test: tool_calls finish reason
  it('getResponse with tool_calls finish reason', () => {
    aggregator.processChunk({
      type: 'tool_call',
      toolCall: { id: 'tc-300', name: 'execute', parameters: { cmd: 'ls' } },
    });
    aggregator.processChunk({
      type: 'done',
      usage: { promptTokens: 20, completionTokens: 10, totalTokens: 30 },
    });

    const response = aggregator.getResponse();
    expect(response.finishReason).toBe('tool_calls');
    expect(response.toolCalls).toHaveLength(1);
    expect(response.toolCalls![0]!.name).toBe('execute');
  });

  // Test: error chunk handling in aggregator
  it('error chunk sets finish reason to error', () => {
    aggregator.processChunk({
      type: 'error',
      error: 'Provider failure',
    });

    aggregator.processChunk({
      type: 'done',
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    });

    const response = aggregator.getResponse();
    expect(response.finishReason).toBe('error');
  });

  // Test: multiple tool calls accumulated
  it('accumulates multiple tool calls', () => {
    aggregator.processChunk({
      type: 'tool_call',
      toolCall: { id: 'tc-1', name: 'read', parameters: { a: 1 } },
    });
    aggregator.processChunk({
      type: 'tool_call',
      toolCall: { id: 'tc-2', name: 'write', parameters: { b: 2 } },
    });

    expect(aggregator.getToolCalls()).toHaveLength(2);
    expect(aggregator.getToolCalls()[0]!.name).toBe('read');
    expect(aggregator.getToolCalls()[1]!.name).toBe('write');
  });
});
