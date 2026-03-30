/**
 * @osai/agent -- StreamManager (T-006)
 *
 * Manages streaming of LLM inference chunks to consumers.
 * Consumes an AsyncIterable<InferenceChunk>, invokes an optional
 * callback for each chunk, accumulates the full text, and emits
 * a 'complete' event when the stream finishes.
 *
 * Uses Node.js EventEmitter for event-based consumption.
 */

import { EventEmitter } from 'node:events';
import type { InferenceChunk } from '../inference/types.js';
import type { StreamChunk, StreamCallback, StreamEvent } from './types.js';

// ---------------------------------------------------------------------------
// StreamManager
// ---------------------------------------------------------------------------

/**
 * Processes a streaming inference response.
 *
 * For each InferenceChunk from the LLM:
 * 1. Converts it to a StreamChunk
 * 2. Invokes the optional callback(chunk)
 * 3. Emits a 'chunk' event with the StreamChunk
 * 4. Accumulates the content text
 *
 * When the stream ends:
 * 1. Emits a 'complete' event with the full text and metadata
 * 2. Returns the accumulated full text from processStream()
 */
export class StreamManager extends EventEmitter {
  private readonly _callback: StreamCallback | undefined;
  private _accumulatedText: string = '';

  /**
   * @param callback - Optional callback invoked for each streaming chunk.
   */
  constructor(callback?: StreamCallback) {
    super();
    this._callback = callback;
  }

  // -----------------------------------------------------------------------
  // processStream
  // -----------------------------------------------------------------------

  /**
   * Process an async iterable of inference chunks.
   *
   * Accumulates the full response text, invokes the callback for each chunk,
   * and emits lifecycle events.
   *
   * @param stream - Async iterable yielding InferenceChunk values.
   * @returns The full accumulated text from all chunks.
   */
  async processStream(stream: AsyncIterable<InferenceChunk>): Promise<string> {
    // Reset accumulated text for each new stream
    this._accumulatedText = '';

    let lastModel = '';
    let lastProvider = '';

    try {
      for await (const chunk of stream) {
        lastModel = chunk.model;
        lastProvider = chunk.provider;

        // Build StreamChunk from InferenceChunk
        const streamChunk: StreamChunk = {
          content: chunk.content,
          toolCalls: chunk.toolCalls,
          hasToolCalls: chunk.hasToolCalls,
          model: chunk.model,
          provider: chunk.provider,
        };

        // Invoke callback if provided
        if (this._callback !== undefined) {
          this._callback(streamChunk);
        }

        // Emit chunk event
        this.emit('chunk', streamChunk);

        // Accumulate text
        this._accumulatedText += chunk.content;
      }

      // Emit complete event
      const completeEvent: StreamEvent = {
        type: 'complete',
        fullText: this._accumulatedText,
        model: lastModel,
        provider: lastProvider,
      };
      this.emit('complete', completeEvent);

      return this._accumulatedText;
    } catch (error) {
      // Emit error event
      const errorEvent: StreamEvent = {
        type: 'error',
        fullText: this._accumulatedText,
        model: lastModel,
        provider: lastProvider,
        error: error instanceof Error ? error : new Error(String(error)),
      };
      this.emit('complete', errorEvent);

      throw error;
    }
  }

  // -----------------------------------------------------------------------
  // getAccumulatedText
  // -----------------------------------------------------------------------

  /**
   * Get the full accumulated text from the most recent (or current) stream.
   *
   * @returns The accumulated text string.
   */
  getAccumulatedText(): string {
    return this._accumulatedText;
  }
}
