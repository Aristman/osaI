/**
 * @osai/agent -- StreamProcessor
 *
 * Processes streaming chunks from LLM providers into structured
 * output messages (BlockMessage, ToolStreamMessage, ToolCall).
 *
 * Supports chunk accumulation, tool call parsing, and handler
 * subscription for reactive streaming consumers.
 *
 * @module streaming
 */

import type { StreamChunk, BlockMessage, ToolStreamMessage, ToolCall } from '../types.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type StreamHandler = (message: StreamOutput) => void;

export type StreamOutput =
  | { type: 'block'; block: BlockMessage; sessionId: string }
  | { type: 'tool_stream'; message: ToolStreamMessage }
  | { type: 'tool_call'; toolCall: ToolCall; sessionId: string }
  | { type: 'error'; message: string; sessionId: string }
  | { type: 'done'; sessionId: string };

// ---------------------------------------------------------------------------
// StreamProcessor
// ---------------------------------------------------------------------------

export class StreamProcessor {
  private currentBlock: { type: string; content: string; language?: string } | null = null;
  private handlers: StreamHandler[] = [];

  constructor(private readonly sessionId: string = '') {}

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  /**
   * Process a single stream chunk from the LLM provider.
   *
   * Depending on chunk.type:
   * - 'content'  -> accumulate into the current block
   * - 'tool_call' -> parse and emit a tool_call output
   * - 'done'     -> flush accumulated block + emit done
   * - 'error'    -> emit error output
   */
  processChunk(chunk: StreamChunk): StreamOutput[] {
    const outputs: StreamOutput[] = [];

    switch (chunk.type) {
      case 'content': {
        const text = chunk.content ?? '';
        if (text.length > 0) {
          if (!this.currentBlock) {
            this.currentBlock = { type: 'text', content: '' };
          }
          this.currentBlock.content += text;
        }
        break;
      }

      case 'tool_call': {
        // Flush any accumulated block first
        const flushed = this.flushBlock();
        if (flushed) {
          outputs.push(flushed);
          this.emit(flushed);
        }

        const toolCall = this.parseToolCall(chunk.toolCall ?? {});
        if (toolCall) {
          const output: StreamOutput = { type: 'tool_call', toolCall, sessionId: this.sessionId };
          outputs.push(output);
          this.emit(output);
        }
        break;
      }

      case 'done': {
        // Flush accumulated block
        const flushedBlock = this.flushBlock();
        if (flushedBlock) {
          outputs.push(flushedBlock);
          this.emit(flushedBlock);
        }

        const doneOutput: StreamOutput = { type: 'done', sessionId: this.sessionId };
        outputs.push(doneOutput);
        this.emit(doneOutput);
        break;
      }

      case 'error': {
        // Flush accumulated block first
        const flushedErrorBlock = this.flushBlock();
        if (flushedErrorBlock) {
          outputs.push(flushedErrorBlock);
          this.emit(flushedErrorBlock);
        }

        const errorMsg = chunk.error ?? 'Unknown streaming error';
        const errorOutput: StreamOutput = { type: 'error', message: errorMsg, sessionId: this.sessionId };
        outputs.push(errorOutput);
        this.emit(errorOutput);
        break;
      }
    }

    return outputs;
  }

  /**
   * Flush buffers and return any accumulated data.
   * Resets internal state after flushing.
   */
  flush(): StreamOutput[] {
    const outputs: StreamOutput[] = [];

    const flushedBlock = this.flushBlock();
    if (flushedBlock) {
      outputs.push(flushedBlock);
      this.emit(flushedBlock);
    }

    return outputs;
  }

  /**
   * Parse tool call data from a stream chunk.
   *
   * Returns null if required fields (name) are missing.
   */
  parseToolCall(chunk: Partial<ToolCall>): ToolCall | null {
    if (!chunk.name) {
      return null;
    }

    return {
      id: chunk.id ?? `tc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: chunk.name,
      parameters: chunk.parameters ?? {},
    };
  }

  /**
   * Format a block message with the given type, content, and optional language.
   */
  formatBlock(type: BlockMessage['type'], content: string, language?: string): BlockMessage {
    const block: BlockMessage = { type, content };
    if (language !== undefined) {
      block.language = language;
    }
    return block;
  }

  /**
   * Format a tool stream message for progress reporting.
   */
  formatToolStream(
    tool: string,
    action: string,
    chunk: Record<string, unknown>,
    progress?: number,
  ): ToolStreamMessage {
    const msg: ToolStreamMessage = {
      sessionId: this.sessionId,
      tool,
      action,
      chunk,
    };
    if (progress !== undefined) {
      msg.progress = progress;
    }
    return msg;
  }

  /**
   * Register a stream output handler.
   *
   * @returns Unsubscribe function to stop receiving outputs.
   */
  onOutput(handler: StreamHandler): () => void {
    this.handlers.push(handler);

    return () => {
      const index = this.handlers.indexOf(handler);
      if (index !== -1) {
        this.handlers.splice(index, 1);
      }
    };
  }

  // -----------------------------------------------------------------------
  // Internal
  // -----------------------------------------------------------------------

  private flushBlock(): StreamOutput | null {
    if (!this.currentBlock) {
      return null;
    }

    const block = this.currentBlock;
    this.currentBlock = null;

    const blockMessage = this.formatBlock(
      block.type as BlockMessage['type'],
      block.content,
      block.language,
    );

    return { type: 'block', block: blockMessage, sessionId: this.sessionId };
  }

  private emit(output: StreamOutput): void {
    for (const handler of this.handlers) {
      try {
        handler(output);
      } catch {
        // Handler errors must not break the stream processor
      }
    }
  }
}
